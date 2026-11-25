import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import http from 'node:http';

import { VoucherDatabase, voucherDb } from '../src/server/voucher-db.ts';
import { createVoucherRoutes } from '../src/server/voucher-routes.ts';
import {
  queryCache,
  lastWirelessScanCache,
  getMemoryHealth,
  runMemoryWatchdogCheck,
  normalizeHotspotProfile,
  normalizePPPProfile
} from '../src/server/runtimeContext.ts';
import {
  queryWirelessWithFallback,
  executeWirelessCommandWithFallback,
  adaptWirelessParamsForDriver
} from '../src/server/routeros/wirelessHelper.ts';
import { MikrotikService } from '../src/services/mikrotikService.ts';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ============================================================
// 1. Bounded Frontend Cache & Expiration (MikrotikService)
// ============================================================
test('MikrotikService cache enforces hard upper bound (150 entries) and evicts expired keys', () => {
  MikrotikService.clearCache();

  for (let i = 0; i < 220; i++) {
    MikrotikService.setCache(`key-${i}`, { i }, 60000);
  }
  assert.equal(MikrotikService.getCacheSize(), 150);
  // Oldest keys should have been evicted (FIFO)
  assert.equal(MikrotikService.getCache('key-0'), null);
  assert.deepEqual(MikrotikService.getCache('key-219'), { i: 219 });

  // Add expired entry and verify clearExpiredCache cleans it
  MikrotikService.setCache('expired-key', { stale: true }, -10);
  const removed = MikrotikService.clearExpiredCache();
  assert.ok(removed >= 1);
  assert.equal(MikrotikService.getCache('expired-key'), null);

  MikrotikService.clearCache();
});

// ============================================================
// 2. Cryptographic Credential Storage (AES-GCM 256 & OS Vault)
// ============================================================
test('MikrotikService encrypts and decrypts secrets with real AES-GCM-256 and unique random IVs', async () => {
  const secret = 'SuperSecretRouterPass!@#2026';
  const enc1 = await MikrotikService.encryptPasswordSecure(secret);
  const enc2 = await MikrotikService.encryptPasswordSecure(secret);

  assert.ok(enc1 && enc2);
  assert.equal(enc1.mode, 'aes-gcm-v2');
  assert.equal(enc2.mode, 'aes-gcm-v2');
  // Random 12-byte IV guarantees two encryptions of the same password produce distinct ciphertexts
  assert.notEqual(enc1.cipher, enc2.cipher);
  assert.ok(!enc1.cipher.includes(secret));

  const dec1 = await MikrotikService.decryptPasswordSecure(enc1.cipher, enc1.mode);
  const dec2 = await MikrotikService.decryptPasswordSecure(enc2.cipher, enc2.mode);
  assert.equal(dec1, secret);
  assert.equal(dec2, secret);
});

test('MikrotikService prefers Electron OS Keychain bridge when window.zctrlDesktopVault is present', async () => {
  const prevWindow = (globalThis as any).window;
  (globalThis as any).window = {
    location: { origin: 'http://127.0.0.1:3000' },
    zctrlDesktopVault: {
      isDesktop: true,
      getPlatform: () => 'win32',
      isEncryptionAvailable: async () => true,
      encryptSecret: async (plain: string) => ({
        success: true,
        data: Buffer.from(`dpapi:${plain}`, 'utf8').toString('base64')
      }),
      decryptSecret: async (cipher: string) => {
        const raw = Buffer.from(cipher, 'base64').toString('utf8');
        return { success: true, data: raw.replace(/^dpapi:/, '') };
      }
    }
  };

  try {
    const enc = await MikrotikService.encryptPasswordSecure('DesktopPass99');
    assert.ok(enc);
    assert.equal(enc.mode, 'os-keychain');
    const dec = await MikrotikService.decryptPasswordSecure(enc.cipher, enc.mode);
    assert.equal(dec, 'DesktopPass99');
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = prevWindow;
    }
  }
});

// ============================================================
// 3. Server Memory Watchdog (Heap Monitoring & Auto-Purge)
// ============================================================
test('MemoryWatchdog reports healthy telemetry and purges caches cleanly when triggered', () => {
  queryCache.set('test-host:/ip/hotspot/user/print', [{ name: 'u1' }]);
  lastWirelessScanCache.set('test-host:wlan1:2ghz', { timestamp: Date.now(), payload: { networks: [] } });

  const beforeHealth = getMemoryHealth();
  assert.ok(beforeHealth.heapUsedMb > 0);
  assert.ok(beforeHealth.rssMb > 0);
  assert.ok(beforeHealth.cacheSizes.queryCache >= 1);

  const pruneResult = runMemoryWatchdogCheck({ forcePrune: true });
  assert.equal(pruneResult.action, 'critical_purge');
  assert.equal(pruneResult.health.cacheSizes.queryCache, 0);
  assert.equal(pruneResult.health.cacheSizes.wirelessScans, 0);
  assert.ok(pruneResult.health.watchdogPruneCount >= beforeHealth.watchdogPruneCount + 1);
});

// ============================================================
// 4. Portable DB Snapshot Export & Import (Native SQLite + Fallback)
// ============================================================
for (const forceFallback of [false, true]) {
  const modeLabel = forceFallback ? 'FallbackJsonEngine' : 'NativeNodeSqlite';

  test(`VoucherDatabase exportSnapshot & importSnapshot (merge + replace + validation) work in ${modeLabel}`, () => {
    const dirA = makeTempDir(`zctrl-exp-a-${modeLabel}-`);
    const dirB = makeTempDir(`zctrl-exp-b-${modeLabel}-`);
    try {
      const dbA = new VoucherDatabase(dirA, { forceFallback });
      dbA.insertBatchTransaction(
        {
          batchId: 'BATCH-EXP-1',
          profileName: '2M-30d',
          totalGenerated: 2,
          totalSynced: 1,
          createdAt: '2026-05-01T10:00:00.000Z',
          comment: 'Export test batch',
          serviceType: 'HOTSPOT',
          price: 25,
          prefix: 'Z'
        },
        [
          {
            voucherId: 'v-1',
            voucherCode: 'Z1001',
            voucherPin: '1111',
            statusCd: 'ACTIVE',
            price: 25,
            profileName: '2M-30d',
            timeLimit: '30d',
            createdAt: '2026-05-01T10:00:00.000Z',
            batchId: 'BATCH-EXP-1',
            serviceType: 'HOTSPOT',
            isSynced: true
          },
          {
            voucherId: 'v-2',
            voucherCode: 'Z1002',
            voucherPin: '2222',
            statusCd: 'USED',
            price: 25,
            profileName: '2M-30d',
            timeLimit: '30d',
            createdAt: '2026-05-01T10:01:00.000Z',
            batchId: 'BATCH-EXP-1',
            serviceType: 'HOTSPOT',
            isSynced: false
          }
        ]
      );
      dbA.saveTemplate({ id: 'tpl-1', name: 'Classic Gold', createdAt: '2026-05-01T10:00:00.000Z', theme: 'gold' });
      dbA.saveProfileMetadata('hotspot', '2M-30d', { price: 25, validity: '30d', validityDays: 30, dataQuotaMb: 10240 });

      const snapshot = dbA.exportSnapshot();
      assert.equal(snapshot.schemaVersion, 2);
      assert.equal(snapshot.counts.batches, 1);
      assert.equal(snapshot.counts.vouchers, 2);
      assert.equal(snapshot.counts.templates, 1);
      assert.ok(snapshot.counts.kvStore >= 1);

      // Import into a brand new DB (merge mode)
      const dbB = new VoucherDatabase(dirB, { forceFallback });
      dbB.insertBatchTransaction(
        {
          batchId: 'BATCH-EXISTING',
          profileName: 'Old',
          totalGenerated: 1,
          totalSynced: 1,
          createdAt: '2026-04-01T00:00:00.000Z',
          comment: 'Pre-existing',
          serviceType: 'HOTSPOT',
          price: 10,
          prefix: 'OLD'
        },
        [
          {
            voucherId: 'v-old',
            voucherCode: 'OLD999',
            voucherPin: '9999',
            statusCd: 'ACTIVE',
            price: 10,
            profileName: 'Old',
            timeLimit: '7d',
            createdAt: '2026-04-01T00:00:00.000Z',
            batchId: 'BATCH-EXISTING',
            serviceType: 'HOTSPOT',
            isSynced: true
          }
        ]
      );

      const mergeRes = dbB.importSnapshot(snapshot, 'merge');
      assert.equal(mergeRes.importedBatches, 1);
      assert.equal(mergeRes.importedVouchers, 2);
      assert.equal(mergeRes.importedTemplates, 1);
      assert.equal(dbB.getAllBatches().length, 2);
      assert.equal(dbB.getDashboardStats().totalVouchers, 3);
      assert.equal(dbB.getProfileMetadata('hotspot', '2M-30d')?.price, 25);

      // Replace mode wipes pre-existing rows atomically
      const replaceRes = dbB.importSnapshot(snapshot, 'replace');
      assert.equal(replaceRes.mode, 'replace');
      assert.equal(dbB.getAllBatches().length, 1);
      assert.equal(dbB.getDashboardStats().totalVouchers, 2);

      // Reject malformed payload
      assert.throws(() => dbB.importSnapshot(null as any, 'merge'));
      assert.throws(() => dbB.importSnapshot({ data: { templates: new Array(250).fill({}) } }, 'merge'));
    } finally {
      fs.rmSync(dirA, { recursive: true, force: true });
      fs.rmSync(dirB, { recursive: true, force: true });
    }
  });
}

// ============================================================
// 5. Durable Profile Metadata Fallback (WinBox Wipe Recovery)
// ============================================================
test('normalizeHotspotProfile & normalizePPPProfile recover Price/Validity/Quota from SQLite mirror when WinBox clears on-login/comment', () => {
  const hsName = `DurableHS-${Date.now()}`;
  const pppName = `DurablePPP-${Date.now()}`;

  try {
    voucherDb.saveProfileMetadata('hotspot', hsName, {
      price: 50,
      validity: '15d',
      validityDays: 15,
      dataQuotaMb: 20480,
      startsAt: 'at-creation',
      sharedUsers: 2
    });
    voucherDb.saveProfileMetadata('ppp', pppName, {
      price: 120,
      validity: '30d',
      validityDays: 30,
      dataQuotaMb: 102400,
      startsAt: 'first-login',
      sharedUsers: 1
    });

    // Simulate RouterOS profile whose on-login and comment were wiped manually in WinBox
    const hsNorm = normalizeHotspotProfile({
      '.id': '*99',
      name: hsName,
      'rate-limit': '4M/4M',
      'shared-users': '2',
      'on-login': '',
      comment: ''
    });
    assert.equal(hsNorm.price, 50);
    assert.equal(hsNorm.validity, '15d');
    assert.equal(hsNorm.validityDays, 15);
    assert.equal(hsNorm.dataQuotaMb, 20480);
    assert.equal(hsNorm.startsAt, 'at-creation');

    const pppNorm = normalizePPPProfile({
      '.id': '*88',
      name: pppName,
      'rate-limit': '10M/10M',
      'on-up': '',
      comment: ''
    });
    assert.equal(pppNorm.price, 120);
    assert.equal(pppNorm.validity, '30d');
    assert.equal(pppNorm.dataQuotaMb, 102400);
  } finally {
    voucherDb.deleteProfileMetadata('hotspot', hsName);
    voucherDb.deleteProfileMetadata('ppp', pppName);
  }
});

// ============================================================
// 6. RouterOS Multi-Version Wireless Fallback (v6 / wifiwave2 / v7.13+ wifi)
// ============================================================
test('Wireless helper supports RouterOS v6 wireless, v7.13+ wifi, and v7.0-7.12 wifiwave2 seamlessly', async () => {
  // Simulate a RouterOS v7.10 router that ONLY has /interface/wifiwave2
  const executedCommands: { cmd: string; params?: string[] }[] = [];
  const mockWifiWave2Client = {
    querySafe: async (cmd: string) => {
      executedCommands.push({ cmd });
      if (cmd === '/interface/wifiwave2/print') {
        return [{ '.id': '*1', name: 'wifi1', 'configuration.ssid': 'ZCtrl-5G' }];
      }
      if (cmd === '/interface/wifiwave2/registration-table/print') {
        return [{ '.id': '*A', interface: 'wifi1', 'mac-address': 'AA:BB:CC:DD:EE:FF' }];
      }
      throw new Error('no such command prefix');
    },
    query: async (cmd: string, params?: string[]) => {
      executedCommands.push({ cmd, params });
      if (cmd === '/interface/wifiwave2/set') {
        return [{ ret: 'ok' }];
      }
      throw new Error('no such command prefix');
    }
  };

  const ifaces = await queryWirelessWithFallback(mockWifiWave2Client, '/print');
  assert.equal(ifaces.driver, '/interface/wifiwave2');
  assert.equal(ifaces.data.length, 1);
  assert.equal(ifaces.data[0].name, 'wifi1');

  const reg = await queryWirelessWithFallback(mockWifiWave2Client, '/registration-table/print');
  assert.equal(reg.driver, '/interface/wifiwave2');
  assert.equal(reg.data.length, 1);

  const setRes = await executeWirelessCommandWithFallback(mockWifiWave2Client, 'set', [
    '=.id=*1',
    '=ssid=NewOfficeWiFi',
    '=mode=ap-bridge',
    '=hide-ssid=yes'
  ]);
  assert.equal(setRes.driver, '/interface/wifiwave2');

  // Verify v7 parameter translation happened properly
  const adapted = adaptWirelessParamsForDriver('/interface/wifiwave2', 'set', [
    '=ssid=TestNet',
    '=mode=ap-bridge',
    '=hide-ssid=yes',
    '=frequency=auto'
  ]);
  assert.deepEqual(adapted, [
    '=configuration.ssid=TestNet',
    '=configuration.mode=ap',
    '=configuration.hide-ssid=yes'
  ]);
});

// ============================================================
// 7. Express Endpoints: GET /api/vouchers/db/export & POST /api/vouchers/db/import
// ============================================================
test('Voucher DB HTTP export/import endpoints validate inputs and round-trip cleanly', async () => {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(createVoucherRoutes(() => ({ isConnected: () => false })));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const exportRes = await fetch(`${baseUrl}/api/vouchers/db/export?download=1`);
    assert.equal(exportRes.status, 200);
    assert.ok((exportRes.headers.get('content-disposition') || '').includes('zctrl-vouchers-backup-'));
    const exportJson: any = await exportRes.json();
    assert.equal(exportJson.success, true);
    assert.equal(exportJson.snapshot.schemaVersion, 2);

    // Invalid import payload should return HTTP 400
    const badImportRes = await fetch(`${baseUrl}/api/vouchers/db/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: { invalid: true } })
    });
    assert.equal(badImportRes.status, 400);

    // Valid merge import of current snapshot should succeed with HTTP 200
    const goodImportRes = await fetch(`${baseUrl}/api/vouchers/db/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: exportJson.snapshot, mode: 'merge' })
    });
    assert.equal(goodImportRes.status, 200);
    const goodJson: any = await goodImportRes.json();
    assert.equal(goodJson.success, true);
    assert.equal(goodJson.mode, 'merge');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ============================================================
// 8. Firewall Quick-Harden & Compatibility Routes (Zero Runtime 404s)
// ============================================================
test('POST /api/mikrotik/firewall/quick-harden enforces offline guard and applies rules idempotently', async () => {
  const { createNetworkFirewallRoutes } = await import('../src/server/routes/networkFirewallRoutes.ts');
  const existingRules: any[] = [];
  let connected = false;

  const mockClient = {
    isConnected: () => connected,
    getConfig: () => ({ host: '10.0.0.1', port: 8728, user: 'admin' }),
    querySafe: async (cmd: string) => {
      if (cmd === '/ip/firewall/filter/print') return [...existingRules];
      return [];
    },
    query: async (cmd: string, params: string[] = []) => {
      if (cmd === '/ip/firewall/filter/add') {
        const commentArg = params.find((p) => p.startsWith('=comment=')) || '';
        existingRules.push({ '.id': `*${existingRules.length + 1}`, comment: commentArg.replace('=comment=', '') });
        return [{ ret: `*${existingRules.length}` }];
      }
      return [];
    }
  };

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.routerClient = mockClient;
    next();
  });
  app.use(createNetworkFirewallRoutes());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Offline guard returns 401
    const offlineRes = await fetch(`${baseUrl}/api/mikrotik/firewall/quick-harden`, { method: 'POST' });
    assert.equal(offlineRes.status, 401);

    // 2. Online first call adds 4 safe rules
    connected = true;
    const firstRes = await fetch(`${baseUrl}/api/mikrotik/firewall/quick-harden`, { method: 'POST' });
    assert.equal(firstRes.status, 200);
    const firstJson: any = await firstRes.json();
    assert.equal(firstJson.success, true);
    assert.equal(firstJson.addedCount, 4);
    assert.equal(firstJson.skippedCount, 0);

    // 3. Second call is idempotent (0 added, 4 skipped, zero duplicates)
    const secondRes = await fetch(`${baseUrl}/api/mikrotik/firewall/quick-harden`, { method: 'POST' });
    assert.equal(secondRes.status, 200);
    const secondJson: any = await secondRes.json();
    assert.equal(secondJson.success, true);
    assert.equal(secondJson.addedCount, 0);
    assert.equal(secondJson.skippedCount, 4);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Compatibility routes (/api/mikrotik/status, /syslog, /invoke, /api/auth/logout) work and enforce read-only invoke allowlist', async () => {
  const { createSystemDiagnosticsRoutes } = await import('../src/server/routes/systemDiagnosticsRoutes.ts');
  const mockClient = {
    isConnected: () => true,
    getConfig: () => ({ host: '192.168.88.1', port: 8728, user: 'admin', password: 'SECRET_PASSWORD' }),
    querySafe: async (cmd: string) => {
      if (cmd === '/log/print') return [{ '.id': '*1', time: '12:00:00', topics: 'system,info', message: 'booted' }];
      if (cmd === '/system/resource/print') return [{ 'cpu-load': '5', version: '7.15' }];
      return [];
    }
  };

  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.routerClient = mockClient;
    next();
  });
  app.use(createSystemDiagnosticsRoutes());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // /api/mikrotik/status never exposes password
    const statusRes = await fetch(`${baseUrl}/api/mikrotik/status`);
    assert.equal(statusRes.status, 200);
    const statusJson: any = await statusRes.json();
    assert.equal(statusJson.connected, true);
    assert.equal(statusJson.config.host, '192.168.88.1');
    assert.equal(statusJson.config.password, undefined);

    // /api/mikrotik/syslog returns messages
    const syslogRes = await fetch(`${baseUrl}/api/mikrotik/syslog`);
    assert.equal(syslogRes.status, 200);
    const syslogJson: any = await syslogRes.json();
    assert.equal(syslogJson.success, true);
    assert.equal(syslogJson.messages.length, 1);

    // /api/mikrotik/invoke allows read-only */print
    const okInvoke = await fetch(`${baseUrl}/api/mikrotik/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: '/system/resource/print' })
    });
    assert.equal(okInvoke.status, 200);
    const okJson: any = await okInvoke.json();
    assert.equal(okJson.success, true);
    assert.equal(okJson.data[0].version, '7.15');

    // /api/mikrotik/invoke blocks mutating / destructive commands with HTTP 400
    const blockedInvoke = await fetch(`${baseUrl}/api/mikrotik/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: '/system/reset-configuration' })
    });
    assert.equal(blockedInvoke.status, 400);

    // /api/auth/logout succeeds cleanly
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(logoutRes.status, 200);
    const logoutJson: any = await logoutRes.json();
    assert.equal(logoutJson.success, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ============================================================
// 9. Captive Portal Non-Blocking Notice & Safe Storage Hygiene
// ============================================================
test('Generated Captive Portal HTML uses non-blocking inline notice (zero alert()) and UI avoids raw localStorage', async () => {
  const { generateHotspotLoginHtml, DEFAULT_PORTAL_CONFIG } = await import('../src/utils/portalGenerator.ts');
  const html = generateHotspotLoginHtml(DEFAULT_PORTAL_CONFIG);

  assert.ok(!/\balert\s*\(/.test(html), 'Generated Captive Portal must not contain blocking alert() calls');
  assert.ok(html.includes('id="portalNotice"'));
  assert.ok(html.includes('box.textContent ='));

  const spikesSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/dashboard/BandwidthAnalyticsSpikesMonitor.tsx'), 'utf8');
  const subUtilsSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/subscribers/subscriberUtils.ts'), 'utf8');
  assert.ok(!/\blocalStorage\./.test(spikesSrc), 'BandwidthAnalyticsSpikesMonitor should use safeStorage');
  assert.ok(!/\blocalStorage\./.test(subUtilsSrc), 'subscriberUtils should use safeStorage');
});

// ============================================================
// 10. Batch Endpoint Read-Only Allowlist & Terminal Destructive Guard
// ============================================================
test('POST /api/mikrotik/batch enforces read-only */print allowlist & 25-query cap, and /command blocks /system/reboot & /system/shutdown', async () => {
  const { createSystemDiagnosticsRoutes } = await import('../src/server/routes/systemDiagnosticsRoutes.ts');
  const app = express();
  app.use(express.json());

  const fakeClient: any = {
    isConnected: () => true,
    ensureConnected: async () => true,
    querySafe: async (endpoint: string) => [{ endpoint, ok: true }],
    query: async (endpoint: string) => [{ endpoint, ok: true }],
    config: { host: '192.168.88.1', port: 8728, user: 'admin', useSsl: false }
  };

  app.use((req: any, _res, next) => {
    req.routerClient = fakeClient;
    next();
  });
  app.use(createSystemDiagnosticsRoutes());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as any;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // Valid read-only batch passes
    const okBatch = await fetch(`${baseUrl}/api/mikrotik/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [{ endpoint: '/system/identity/print' }, { endpoint: '/system/resource/print' }] })
    });
    assert.equal(okBatch.status, 200);
    const okJson: any = await okBatch.json();
    assert.equal(okJson.success, true);
    assert.equal(okJson.results.length, 2);

    // Mutating / destructive command inside /batch is blocked with 400
    const badBatch = await fetch(`${baseUrl}/api/mikrotik/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [{ endpoint: '/system/reset-configuration' }] })
    });
    assert.equal(badBatch.status, 400);

    // Oversized batch (>25 queries) is blocked with 400
    const hugeQueries = Array.from({ length: 26 }, () => ({ endpoint: '/system/identity/print' }));
    const hugeBatch = await fetch(`${baseUrl}/api/mikrotik/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: hugeQueries })
    });
    assert.equal(hugeBatch.status, 400);

    // Terminal /command blocks /system/reboot and /system/shutdown with 403
    for (const cmd of ['/system/reboot', '/system/shutdown', 'system shutdown']) {
      const blocked = await fetch(`${baseUrl}/api/mikrotik/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      assert.equal(blocked.status, 403, `Expected 403 for dangerous command: ${cmd}`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

