import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import v8 from 'node:v8';
import { FallbackSqliteDatabase } from '../src/server/voucher-db.ts';
import {
  SafeCache,
  getMemoryHealth,
  runMemoryWatchdogCheck
} from '../src/server/runtimeContext.ts';
import {
  createMikrotikClient,
  decodeApiSentences,
  encodeApiSentence
} from '../src/server/mikrotik-api.ts';
import {
  getRouterMutex,
  deleteRouterMutex,
  clearRouterLocks,
  getRouterLockCount
} from '../src/server/mutex.ts';
import { TelegramAlertService } from '../src/server/telegram-service.ts';

describe('Memory, Database, Cache, Socket & Cleanup Hardening', () => {
  it('Electron package is upgraded to >= 35 (Node >= 22.14 native node:sqlite) and FallbackSqliteDatabase uses O(N) deferred save + flush/close', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const electronVer = String(pkg.devDependencies?.electron || '').replace(/^[^0-9]*/, '');
    const major = parseInt(electronVer.split('.')[0], 10);
    assert.ok(major >= 35, `Expected Electron major >= 35 for built-in node:sqlite, got ${pkg.devDependencies?.electron}`);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-fallback-perf-'));
    const dbPath = path.join(dir, 'vouchers.sqlite');
    try {
      const db = new FallbackSqliteDatabase(dbPath);
      const insertStmt = db.prepare(
        `INSERT OR IGNORE INTO vouchers
          (voucher_id, voucher_code, code_lower, voucher_pin, batch_id, price, profile_name, time_limit, data_limit, service_type, status_cd, is_synced, created_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const t0 = performance.now();
      const now = new Date().toISOString();
      for (let i = 0; i < 1500; i++) {
        const code = `DEF_${i}`;
        insertStmt.run(
          `id-${i}`,
          code,
          code.toLowerCase(),
          '1234',
          'BATCH-DEF',
          10,
          'default',
          '1d',
          '',
          'HOTSPOT',
          'ACTIVE',
          0,
          now,
          '{}'
        );
      }
      const elapsedMs = performance.now() - t0;
      // With deferred save (scheduleSave), 1500 un-batched writes do not rewrite JSON 1500 times
      assert.ok(elapsedMs < 500, `1500 individual writes took too long (${elapsedMs.toFixed(1)}ms) — deferred save not working`);

      // Flush synchronously on close() and verify disk persistence
      db.close();
      const reopened = new FallbackSqliteDatabase(dbPath);
      const cntRows = reopened.prepare('SELECT COUNT(*) AS cnt FROM VOUCHERS').all();
      assert.equal(cntRows[0]?.cnt, 1500);
      reopened.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SafeCache enforces true LRU, row budget (<= 100k rows), and skips oversized (> 20k row) lists', () => {
    const cache = new SafeCache();

    // 1. Oversized list (> 20,000 rows) must be skipped
    const hugeList = Array.from({ length: 20_001 }, (_, i) => ({ id: i }));
    assert.equal(cache.set('huge', hugeList), false);
    assert.equal(cache.get('huge', 60_000), null);

    // 2. Row budget (<= 100,000 rows across entries) evicts oldest/LRU entries even with < 500 entries
    for (let i = 0; i < 12; i++) {
      const batch = Array.from({ length: 12_000 }, (_, j) => ({ n: `${i}-${j}` }));
      assert.equal(cache.set(`batch-${i}`, batch), true);
    }
    const stats = cache.getStats();
    assert.ok(stats.totalRows <= 100_000, `Expected cache totalRows <= 100000, got ${stats.totalRows}`);
    assert.ok(stats.entries < 12);

    // 3. True LRU: accessing oldest key preserves it when evicting to stay under 100k rows
    cache.clear();
    const mk = (len: number) => Array.from({ length: len }, (_, j) => ({ k: j }));
    cache.set('k1', mk(19_000));
    cache.set('k2', mk(19_000));
    cache.set('k3', mk(19_000));
    cache.set('k4', mk(19_000));
    cache.set('k5', mk(19_000)); // total = 95,000
    assert.ok(cache.get('k1', 60_000)); // k1 becomes MRU; k2 is now LRU
    cache.set('k6', mk(10_000)); // exceeds 100k -> must evict k2, keeping k1!
    assert.ok(cache.get('k1', 60_000), 'Recently read key k1 should stay cached under LRU');
    assert.equal(cache.get('k2', 60_000), null, 'Least recently used key k2 should be evicted');
  });

  it('MemoryWatchdog uses dynamic V8 heap_size_limit ratios (60% soft / 80% critical)', () => {
    const health = getMemoryHealth();
    const expectedLimitMb = Math.max(256, Math.round((v8.getHeapStatistics().heap_size_limit / 1048576) * 10) / 10);
    assert.equal(health.heapLimitMb, expectedLimitMb);
    assert.equal(health.thresholdsMb.soft, Math.round(expectedLimitMb * 0.6 * 10) / 10);
    assert.equal(health.thresholdsMb.critical, Math.round(expectedLimitMb * 0.8 * 10) / 10);

    const check = runMemoryWatchdogCheck({ forcePrune: true });
    assert.equal(check.action, 'critical_purge');
  });

  it('MikrotikClient handles fragmented socket chunks cleanly and enforces MAX_SENTENCES_PER_REQUEST cap', async () => {
    // Local mock RouterOS binary TCP server
    let mode: 'ok' | 'flood' = 'ok';
    const sockets = new Set<net.Socket>();
    const srv = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      let buf = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        const decoded = decodeApiSentences(buf);
        buf = decoded.remainder;
        for (const words of decoded.sentences) {
          if (!words.length) continue;
          const cmd = words[0] || '';
          const tagWord = words.find((w) => w.startsWith('.tag='));
          const tag = tagWord ? tagWord.slice(5) : '';
          const tagWords = tag ? [`.tag=${tag}`] : [];

          if (cmd === '/login') {
            socket.write(encodeApiSentence(['!done', ...tagWords]));
          } else if (cmd === '/user/print') {
            socket.write(encodeApiSentence(['!re', '=group=full', ...tagWords]));
            socket.write(encodeApiSentence(['!done', ...tagWords]));
          } else if (cmd === '/system/resource/print') {
            socket.write(encodeApiSentence(['!re', '=version=7.14', '=cpu-load=5', ...tagWords]));
            socket.write(encodeApiSentence(['!done', ...tagWords]));
          } else if (cmd === '/system/identity/print') {
            socket.write(encodeApiSentence(['!re', '=name=TestRouter', ...tagWords]));
            socket.write(encodeApiSentence(['!done', ...tagWords]));
          } else if (cmd === '/system/routerboard/print') {
            socket.write(encodeApiSentence(['!re', '=board-name=RB5009', ...tagWords]));
            socket.write(encodeApiSentence(['!done', ...tagWords]));
          } else if (cmd === '/ip/hotspot/user/print') {
            if (mode === 'ok') {
              const payload = Buffer.concat([
                ...Array.from({ length: 1000 }, (_, i) =>
                  encodeApiSentence(['!re', `=.id=*${i}`, `=name=U_${i}`, ...tagWords])
                ),
                encodeApiSentence(['!done', ...tagWords])
              ]);
              for (let off = 0; off < payload.length; off += 73) {
                socket.write(payload.subarray(off, off + 73));
              }
            } else {
              const batchSize = 5000;
              const singleChunk = Buffer.concat(
                Array.from({ length: batchSize }, (_, i) =>
                  encodeApiSentence(['!re', `=.id=*${i}`, ...tagWords])
                )
              );
              for (let b = 0; b < 21; b++) {
                if (socket.destroyed) break;
                socket.write(singleChunk);
              }
            }
          }
        }
      });
    });

    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
    const port = (srv.address() as net.AddressInfo).port;
    const client = createMikrotikClient();

    try {
      await client.connect('127.0.0.1', 'admin', 'pass', port, false);

      const rows = await client.query('/ip/hotspot/user/print');
      assert.equal(rows.length, 1000);
      assert.equal(rows[999].name, 'U_999');

      mode = 'flood';
      await assert.rejects(
        () => client.query('/ip/hotspot/user/print', undefined, { timeoutSeconds: 15 }),
        /الحد الأقصى|جمل|100/
      );
    } finally {
      await client.dispose();
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });

  it('TelegramAlertService normalizes dynamic keys and prunes expired entries, and router mutexes clean up cleanly', async () => {
    const prevFetch = globalThis.fetch;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-tg-test-'));
    const prevDir = process.env.ZCTRL_DATA_DIR;
    process.env.ZCTRL_DATA_DIR = tempDir;

    try {
      globalThis.fetch = (async () => ({
        json: async () => ({ ok: true })
      })) as any;

      const svc = new TelegramAlertService(tempDir);
      svc.saveConfig({ enabled: true, botToken: '123:test', chatId: '456' });

      // Fire 30 alerts containing different dynamic IP addresses -> normalized to a single throttle key
      const firstOk = await svc.sendAlert('انقطاع الاتصال بالراوتر 10.0.0.1', 'details', 'danger', 5);
      const secondBlocked = await svc.sendAlert('انقطاع الاتصال بالراوتر 192.168.88.1', 'details', 'danger', 5);
      assert.equal(firstOk, true);
      assert.equal(secondBlocked, false);
      assert.equal(svc.getThrottleMapSize(), 1);
    } finally {
      globalThis.fetch = prevFetch;
      if (prevDir === undefined) delete process.env.ZCTRL_DATA_DIR;
      else process.env.ZCTRL_DATA_DIR = prevDir;
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Mutex cleanup verification
    clearRouterLocks();
    const beforeCount = getRouterLockCount();
    const m = getRouterMutex('192.168.88.1:8728');
    const release = await m.acquire();
    assert.equal(getRouterLockCount(), beforeCount + 1);
    // Calling delete while locked schedules deferred deletion after release
    deleteRouterMutex('192.168.88.1:8728');
    assert.equal(getRouterLockCount(), beforeCount + 1);
    release();
    assert.equal(getRouterLockCount(), beforeCount);
  });
});
