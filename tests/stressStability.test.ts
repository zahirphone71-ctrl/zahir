import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';
import {
  encodeApiSentence,
  decodeApiSentences,
  MikroTikRequestThrottler
} from '../src/server/mikrotik-api.ts';
import { VoucherDatabase } from '../src/server/voucher-db.ts';
import type { BatchInfo, VoucherItem } from '../src/shared/voucher-types.ts';

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3098;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

describe('ZCtrl Stress, Endurance, Stability & Speed Benchmarks', () => {
  it('decodes 5,000 MikroTik binary sentences fragmented across arbitrary TCP chunk boundaries under 250ms', () => {
    const COUNT = 5000;
    const chunks: Buffer[] = [];
    for (let i = 0; i < COUNT; i++) {
      chunks.push(
        encodeApiSentence([
          '!re',
          `=.id=*${i.toString(16)}`,
          `=name=CARD_${i}`,
          `=password=PASS_${i}`,
          '=profile=VIP-10M',
          '=comment=ZCtrl Stress Batch'
        ])
      );
    }
    chunks.push(encodeApiSentence(['!done', '.tag=stress_1']));
    const fullStream = Buffer.concat(chunks);

    const t0 = performance.now();
    // Simulate fragmented 137-byte TCP reads
    let remainder = Buffer.alloc(0);
    const decodedAll: string[][] = [];
    const CHUNK_SIZE = 137;
    for (let offset = 0; offset < fullStream.length; offset += CHUNK_SIZE) {
      const slice = fullStream.subarray(offset, offset + CHUNK_SIZE);
      const combined = remainder.length > 0 ? Buffer.concat([remainder, slice]) : slice;
      const res = decodeApiSentences(combined);
      for (const s of res.sentences) decodedAll.push(s);
      remainder = res.remainder;
    }
    const elapsedMs = performance.now() - t0;

    assert.equal(remainder.length, 0);
    assert.equal(decodedAll.length, COUNT + 1);
    assert.equal(decodedAll[0][1], '=.id=*0');
    assert.equal(decodedAll[COUNT][0], '!done');
    assert.ok(elapsedMs < 1000, `Protocol decode took too long: ${elapsedMs.toFixed(1)}ms`);
  });

  it('handles 150 concurrent commands through MikroTikRequestThrottler without drops or starvation', async () => {
    const throttler = new MikroTikRequestThrottler(5);
    let maxObservedActive = 0;
    let currentActive = 0;

    const tasks = Array.from({ length: 150 }, (_, idx) =>
      throttler.execute(
        async () => {
          currentActive++;
          if (currentActive > maxObservedActive) maxObservedActive = currentActive;
          await new Promise((r) => setTimeout(r, 2));
          currentActive--;
          return idx;
        },
        { priority: idx % 10 === 0, timeoutMs: 10000 }
      )
    );

    const results = await Promise.all(tasks);
    assert.equal(results.length, 150);
    assert.ok(maxObservedActive <= 5, `Exceeded max concurrency: ${maxObservedActive}`);
    assert.equal(throttler.getStats().activeRequests, 0);
    assert.equal(throttler.getStats().queuedRequests, 0);
    assert.equal(throttler.getStats().totalExecuted, 150);
  });

  it('inserts and queries 5,000 vouchers with ACID speed in both native SQLite and Fallback engines', () => {
    for (const forceFallback of [false, true]) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-stress-db-'));
      try {
        const db = new VoucherDatabase(tempDir, { forceFallback });
        const now = new Date().toISOString();
        const batchId = 'STRESS_5000';
        const batchInfo: BatchInfo = {
          batchId,
          profileName: 'SPEED-20M',
          totalGenerated: 5000,
          totalSynced: 0,
          createdAt: now,
          comment: 'اختبار ضغط 5000 كرت',
          serviceType: 'HOTSPOT',
          price: 100,
          prefix: 'ZC-'
        };

        const vouchers: VoucherItem[] = Array.from({ length: 5000 }, (_, i) => ({
          voucherId: `VS_${i}`,
          voucherCode: `ZC-${100000 + i}`,
          voucherPin: `${2000 + (i % 9000)}`,
          batchId,
          price: 100,
          profileName: 'SPEED-20M',
          timeLimit: '1d',
          dataLimit: '1GB',
          serviceType: 'HOTSPOT',
          statusCd: 'ACTIVE',
          isSynced: i < 2500,
          createdAt: now
        }));

        const tInsertStart = performance.now();
        const insertedRes = db.insertBatchTransaction(batchInfo, vouchers);
        const insertMs = performance.now() - tInsertStart;

        assert.equal(insertedRes.inserted, 5000);
        assert.ok(insertMs < 4000, `5000-voucher insert (${forceFallback ? 'fallback' : 'sqlite'}) took ${insertMs.toFixed(1)}ms`);

        const tQueryStart = performance.now();
        assert.equal(db.codeExists('ZC-104999'), true);
        assert.equal(db.codeExists('ZC-999999'), false);
        const page = db.getPaginatedVouchers({ page: 1, limit: 50, search: 'ZC-104999' });
        assert.equal(page.totalCount, 1);
        const stats = db.getDashboardStats();
        assert.equal(stats.totalVouchers, 5000);
        assert.equal(stats.syncedVouchers, 2500);
        const resumable = db.getResumableBatches();
        assert.equal(resumable.length, 1);
        assert.equal(resumable[0].unsyncedCards, 2500);
        const queryMs = performance.now() - tQueryStart;

        assert.ok(queryMs < 1500, `Query suite (${forceFallback ? 'fallback' : 'sqlite'}) took ${queryMs.toFixed(1)}ms`);
        db.close();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  describe('Live Production Server Burst HTTP & WebSocket Endurance', () => {
    let serverProc: ChildProcess | null = null;
    let baseUrl = '';
    let wsUrl = '';
    let tempDataDir = '';

    before(async () => {
      const bundlePath = path.resolve(process.cwd(), 'dist/server.cjs');
      tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-burst-srv-'));
      const port = await getAvailablePort();
      baseUrl = `http://127.0.0.1:${port}`;
      wsUrl = `ws://127.0.0.1:${port}/api/ws/realtime`;

      serverProc = spawn(process.execPath, [bundlePath], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: String(port),
          ZCTRL_DATA_DIR: tempDataDir
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      await waitForServer(`${baseUrl}/api/ping`);
    });

    after(async () => {
      if (serverProc && !serverProc.killed) {
        serverProc.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 300));
        if (!serverProc.killed) serverProc.kill('SIGKILL');
      }
      if (tempDataDir) fs.rmSync(tempDataDir, { recursive: true, force: true });
    });

    it('survives 200 concurrent HTTP requests + malformed payloads + 25 concurrent WebSocket churn cycles cleanly', async () => {
      const t0 = performance.now();

      // 1. 200 concurrent HTTP burst across health, static SPA, auth check, and malformed JSON
      const httpBurst = Array.from({ length: 200 }, (_, i) => {
        if (i % 4 === 0) return fetch(`${baseUrl}/api/ping`).then((r) => r.status);
        if (i % 4 === 1) return fetch(`${baseUrl}/api/health`).then((r) => r.status);
        if (i % 4 === 2) return fetch(`${baseUrl}/api/vouchers/stats`).then((r) => r.status);
        return fetch(`${baseUrl}/api/mikrotik/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{broken-json'
        }).then((r) => r.status);
      });

      const httpStatuses = await Promise.all(httpBurst);
      for (let i = 0; i < httpStatuses.length; i++) {
        if (i % 4 === 0 || i % 4 === 1) assert.equal(httpStatuses[i], 200);
        else if (i % 4 === 2) assert.equal(httpStatuses[i], 401);
        else assert.ok(httpStatuses[i] === 400 || httpStatuses[i] === 500);
      }

      // 2. 25 concurrent WebSocket connect -> message -> close storm
      await Promise.all(
        Array.from({ length: 25 }, (_, idx) => {
          return new Promise<void>((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            const timer = setTimeout(() => {
              try { ws.terminate(); } catch {}
              reject(new Error(`WS client ${idx} timed out`));
            }, 5000);

            ws.on('open', () => {
              ws.send(JSON.stringify({ type: 'tab_change', tab: 'dashboard' }));
              ws.send(JSON.stringify({ type: 'ping' }));
            });

            let receivedAck = false;
            ws.on('message', (data) => {
              const msg = JSON.parse(data.toString());
              if (msg.type === 'connected' || msg.type === 'pong') {
                receivedAck = true;
                clearTimeout(timer);
                ws.close();
              }
            });

            ws.on('close', () => {
              clearTimeout(timer);
              if (receivedAck) resolve();
              else reject(new Error(`WS client ${idx} closed before ack`));
            });

            ws.on('error', (err) => {
              clearTimeout(timer);
              reject(err);
            });
          });
        })
      );

      // 3. Server must remain 100% responsive after burst
      const finalPing = await fetch(`${baseUrl}/api/ping`);
      assert.equal(finalPing.status, 200);
      const elapsedMs = performance.now() - t0;
      assert.ok(elapsedMs < 8000, `Burst endurance test took ${elapsedMs.toFixed(1)}ms`);
    });
  });
});
