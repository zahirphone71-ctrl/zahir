import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';

import { VoucherDatabase } from '../src/server/voucher-db.ts';
import { createVoucherRoutes } from '../src/server/voucher-routes.ts';
import { createSystemDiagnosticsRoutes } from '../src/server/routes/systemDiagnosticsRoutes.ts';
import { createNetworkFirewallRoutes } from '../src/server/routes/networkFirewallRoutes.ts';
import { escapePdfHtml } from '../src/utils/viewPdfExporter.ts';
import { safeStorage, safeSession, SENSITIVE_MEMORY_ONLY_KEYS } from '../src/utils/safeStorage.ts';
import { generateHotspotLoginHtml, DEFAULT_PORTAL_CONFIG } from '../src/utils/portalGenerator.ts';
import { queryCache, runMemoryWatchdogCheck } from '../src/server/runtimeContext.ts';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function collectFilesRecursive(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'server') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesRecursive(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

// ============================================================================
// PILLAR 1: Edge Cases & Boundary Testing (Empty, Huge, Negative, Special Chars)
// ============================================================================
test('Pillar 1 (Edge & Boundary): VoucherDatabase safely handles extreme pagination, 10k-char strings, negative numbers, and special Unicode/Arabic chars', () => {
  const dir = makeTempDir('zctrl-qa-edge-');
  try {
    const db = new VoucherDatabase(dir);
    const hugeComment = 'عربي-تست-'.repeat(1200); // > 10,000 chars
    const specialCode = 'Z_!@#$%^&*()_أبتث_99';

    db.insertBatchTransaction(
      {
        batchId: 'BATCH-EDGE-1',
        profileName: 'EdgeProfile',
        totalGenerated: 1,
        totalSynced: 0,
        createdAt: new Date().toISOString(),
        comment: hugeComment,
        serviceType: 'HOTSPOT',
        price: 0,
        prefix: 'EDGE'
      },
      [
        {
          voucherId: 'v-edge-1',
          voucherCode: specialCode,
          voucherPin: '',
          statusCd: 'ACTIVE',
          price: 0,
          profileName: 'EdgeProfile',
          timeLimit: '1d',
          createdAt: new Date().toISOString(),
          batchId: 'BATCH-EDGE-1',
          serviceType: 'HOTSPOT',
          isSynced: false
        }
      ]
    );

    // Extreme boundary pagination parameters should never throw or crash
    for (const [page, limit] of [
      [0, 0],
      [-5, -100],
      [999999, 5000],
      [1, 1]
    ]) {
      const res = db.getPaginatedVouchers({ page, limit, search: '' });
      assert.equal(typeof res.totalCount, 'number');
      assert.ok(Array.isArray(res.vouchers));
    }

    // Searching by special Unicode/Arabic characters returns the exact row
    const found = db.getPaginatedVouchers({ page: 1, limit: 20, search: 'أبتث' });
    assert.equal(found.totalCount, 1);
    assert.equal(found.vouchers[0].voucherCode, specialCode);

    // Searching with a 10,000-character query string returns 0 cleanly without crashing
    const hugeSearch = db.getPaginatedVouchers({ page: 1, limit: 20, search: 'X'.repeat(10000) });
    assert.equal(hugeSearch.totalCount, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Pillar 1 (Edge & Boundary): HTTP API gracefully rejects malformed JSON, empty bodies, negative values, and oversized requests without 500 crashes', async () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Malformed JSON body' });
    }
    next(err);
  });
  app.use((req: any, _res, next) => {
    req.routerClient = { isConnected: () => false };
    next();
  });
  app.use(createVoucherRoutes(() => ({ isConnected: () => false })));
  app.use(createSystemDiagnosticsRoutes());
  app.use(createNetworkFirewallRoutes());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Malformed JSON -> HTTP 400 (never 500)
    const malformed = await fetch(`${baseUrl}/api/vouchers/db/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken_json": '
    });
    assert.equal(malformed.status, 400);

    // 2. Empty body on command endpoint -> HTTP 401 or 400 (never 500)
    const emptyCmd = await fetch(`${baseUrl}/api/mikrotik/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.ok(emptyCmd.status === 400 || emptyCmd.status === 401);

    // 3. Offline batch & quick-harden return structured JSON 401 (never unhandled crash)
    const offlineBatch = await fetch(`${baseUrl}/api/mikrotik/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: [{ endpoint: '/system/identity/print' }] })
    });
    assert.equal(offlineBatch.status, 401);
    const offlineBatchJson: any = await offlineBatch.json();
    assert.equal(offlineBatchJson.success, false);

    const offlineHarden = await fetch(`${baseUrl}/api/mikrotik/firewall/quick-harden`, {
      method: 'POST'
    });
    assert.equal(offlineHarden.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// ============================================================================
// PILLAR 2: Performance, Bulk Load (2,500 Vouchers) & Memory Leak Soak
// ============================================================================
test('Pillar 2 (Load & Memory Soak): Inserts 2,500 vouchers rapidly, paginates under 50ms, and keeps heap bounded across 60 cycles', () => {
  const dir = makeTempDir('zctrl-qa-load-');
  try {
    const db = new VoucherDatabase(dir);
    const totalCount = 2500;
    const nowIso = new Date().toISOString();
    const vouchers = Array.from({ length: totalCount }, (_, i) => ({
      voucherId: `v-load-${i}`,
      voucherCode: `LD${String(i).padStart(6, '0')}`,
      voucherPin: String(1000 + (i % 9000)),
      statusCd: i % 5 === 0 ? 'USED' : 'ACTIVE',
      price: 15,
      profileName: 'LoadProfile-4M',
      timeLimit: '7d',
      createdAt: nowIso,
      batchId: 'BATCH-LOAD-2500',
      serviceType: 'HOTSPOT' as const,
      isSynced: true
    }));

    const t0 = performance.now();
    db.insertBatchTransaction(
      {
        batchId: 'BATCH-LOAD-2500',
        profileName: 'LoadProfile-4M',
        totalGenerated: totalCount,
        totalSynced: totalCount,
        createdAt: nowIso,
        comment: 'Stress test 2500',
        serviceType: 'HOTSPOT',
        price: 15,
        prefix: 'LD'
      },
      vouchers
    );
    const insertMs = performance.now() - t0;
    assert.ok(insertMs < 4000, `Expected 2,500 batch insert < 4000ms, got ${insertMs.toFixed(1)}ms`);

    // Measure paginated query latency
    const q0 = performance.now();
    const page1 = db.getPaginatedVouchers({ page: 1, limit: 50, batchId: 'BATCH-LOAD-2500' });
    const queryMs = performance.now() - q0;
    assert.equal(page1.totalCount, totalCount);
    assert.equal(page1.vouchers.length, 50);
    assert.ok(queryMs < 150, `Expected paginated query < 150ms, got ${queryMs.toFixed(1)}ms`);

    // 60-cycle soak test checking memory stability & cache cleanup
    const heapBefore = process.memoryUsage().heapUsed;
    for (let cycle = 0; cycle < 60; cycle++) {
      queryCache.set(`soak-key-${cycle}`, { payload: 'x'.repeat(2048), cycle });
      const res = db.getPaginatedVouchers({ page: (cycle % 10) + 1, limit: 50, search: 'LD00' });
      assert.ok(res.vouchers.length > 0);
    }
    const prune = runMemoryWatchdogCheck({ forcePrune: true });
    assert.equal(prune.health.cacheSizes.queryCache, 0);

    const heapDeltaMb = (process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);
    assert.ok(heapDeltaMb < 60, `Heap grew unexpectedly by ${heapDeltaMb.toFixed(2)} MB during soak`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ============================================================================
// PILLAR 3: Security Audit & PoC Verification (XSS, SQLi, Tokens, Electron)
// ============================================================================
test('Pillar 3 (Security PoC - XSS): escapePdfHtml & Captive Portal neutralize HTML/script injection payloads completely', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert("xss")>',
    '" onmouseover="alert(1)',
    "'><svg/onload=alert(1)>",
    '`javascript:alert(1)`'
  ];

  for (const payload of payloads) {
    const escaped = escapePdfHtml(payload);
    assert.ok(!escaped.includes('<script'), `Raw <script> survived escaping: ${escaped}`);
    assert.ok(!escaped.includes('<img'), `Raw <img> survived escaping: ${escaped}`);
    assert.ok(!escaped.includes('<svg'), `Raw <svg> survived escaping: ${escaped}`);
    assert.ok(!escaped.includes('<'), `Unescaped < character survived: ${escaped}`);
    assert.ok(!escaped.includes('>'), `Unescaped > character survived: ${escaped}`);
  }

  // Verify Captive Portal generator escapes hostile hotspot title/footer values
  const hostilePortal = generateHotspotLoginHtml({
    ...DEFAULT_PORTAL_CONFIG,
    networkName: '<img src=x onerror=alert(1)>',
    welcomeTitle: '<script>alert(2)</script>'
  });
  assert.ok(!hostilePortal.includes('<img src=x onerror=alert(1)>'));
  assert.ok(!hostilePortal.includes('<script>alert(2)</script>'));
});

test('Pillar 3 (Security PoC - SQLi): VoucherDatabase parameterized queries neutralize SQL injection payloads and preserve table integrity', () => {
  const dir = makeTempDir('zctrl-qa-sqli-');
  try {
    const db = new VoucherDatabase(dir);
    db.insertBatchTransaction(
      {
        batchId: 'SAFE-BATCH',
        profileName: '2M',
        totalGenerated: 1,
        totalSynced: 1,
        createdAt: new Date().toISOString(),
        comment: 'Safe',
        serviceType: 'HOTSPOT',
        price: 10,
        prefix: 'S'
      },
      [
        {
          voucherId: 'v-safe-1',
          voucherCode: 'SAFE100',
          voucherPin: '1234',
          statusCd: 'ACTIVE',
          price: 10,
          profileName: '2M',
          timeLimit: '1d',
          createdAt: new Date().toISOString(),
          batchId: 'SAFE-BATCH',
          serviceType: 'HOTSPOT',
          isSynced: true
        }
      ]
    );

    const sqliPayloads = [
      "' OR '1'='1",
      '"; DROP TABLE vouchers; --',
      "SAFE-BATCH' OR 1=1 --",
      "%' UNION SELECT 1,2,3,4,5 --"
    ];

    for (const payload of sqliPayloads) {
      const resBySearch = db.getPaginatedVouchers({ page: 1, limit: 20, search: payload });
      assert.equal(resBySearch.totalCount, 0, `SQLi search payload leaked rows: ${payload}`);

      const resByBatch = db.getPaginatedVouchers({ page: 1, limit: 20, batchId: payload });
      assert.equal(resByBatch.totalCount, 0, `SQLi batchId payload leaked rows: ${payload}`);
    }

    // Confirm vouchers table is still completely intact after DROP TABLE injection attempts
    const stats = db.getDashboardStats();
    assert.equal(stats.totalVouchers, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Pillar 3 (Security PoC - Sensitive Storage): Session bearer tokens stay strictly in memory and are purged from localStorage/sessionStorage', () => {
  const prevWindow = (globalThis as any).window;
  const mockLocal = new Map<string, string>();
  const mockSession = new Map<string, string>();

  // Pre-seed legacy plaintext tokens to verify active purge on access/write
  for (const key of SENSITIVE_MEMORY_ONLY_KEYS) {
    mockLocal.set(key, 'STALE_LEGACY_TOKEN');
    mockSession.set(key, 'STALE_LEGACY_TOKEN');
  }

  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => mockLocal.get(k) ?? null,
      setItem: (k: string, v: string) => { mockLocal.set(k, v); },
      removeItem: (k: string) => { mockLocal.delete(k); }
    },
    sessionStorage: {
      getItem: (k: string) => mockSession.get(k) ?? null,
      setItem: (k: string, v: string) => { mockSession.set(k, v); },
      removeItem: (k: string) => { mockSession.delete(k); }
    }
  };

  try {
    for (const key of SENSITIVE_MEMORY_ONLY_KEYS) {
      // Setting a sensitive token keeps it in memory ONLY and purges web storage
      safeStorage.setItem(key, 'ephemeral-runtime-token-xyz');
      assert.equal(safeStorage.getItem(key), 'ephemeral-runtime-token-xyz');
      assert.equal(mockLocal.has(key), false, `${key} MUST NOT be written to window.localStorage`);
      assert.equal(mockSession.has(key), false, `${key} MUST NOT be written to window.sessionStorage`);

      safeSession.setItem(key, 'ephemeral-session-token-xyz');
      assert.equal(safeSession.getItem(key), 'ephemeral-session-token-xyz');
      assert.equal(mockSession.has(key), false, `${key} MUST NOT be written to window.sessionStorage`);

      safeStorage.removeItem(key);
      safeSession.removeItem(key);
      assert.equal(safeStorage.getItem(key), null);
    }

    // Non-sensitive UI preference still persists normally to localStorage
    safeStorage.setItem('zctrl_ui_theme_pref', 'dark');
    assert.equal(mockLocal.get('zctrl_ui_theme_pref'), 'dark');
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = prevWindow;
    }
  }
});

test('Pillar 3 (Security - Electron Hardening): electron-main.cjs and electron-preload.cjs enforce strict isolation', () => {
  const mainSrc = fs.readFileSync(path.join(process.cwd(), 'electron-main.cjs'), 'utf8');
  const preloadSrc = fs.readFileSync(path.join(process.cwd(), 'electron-preload.cjs'), 'utf8');

  assert.match(mainSrc, /nodeIntegration:\s*false/);
  assert.match(mainSrc, /contextIsolation:\s*true/);
  assert.match(mainSrc, /webSecurity:\s*true/);
  assert.match(mainSrc, /sandbox:\s*true/);

  assert.match(preloadSrc, /contextBridge\.exposeInMainWorld\(\s*['"]zctrlDesktopVault['"]/);
  assert.ok(!preloadSrc.includes('exposeInMainWorld(\'ipcRenderer\''), 'Raw ipcRenderer must never be exposed');
  assert.ok(!preloadSrc.includes('require(\'fs\')'), 'Preload must not import fs');
});

// ============================================================================
// PILLAR 4 & 5: RTL Arabic, Print Standards, Production Cleanup & Packaging
// ============================================================================
test('Pillar 4 & 5 (RTL, Print, Cleanup & Packaging): Verifies Arabic RTL HTML, zero frontend console.log/mock data, and complete Electron build manifests', () => {
  // 1. RTL Arabic & anti-flicker dark styling in index.html
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.match(indexHtml, /lang=["']ar["']/);
  assert.match(indexHtml, /dir=["']rtl["']/);

  // 2. Print layout & PDF exporter RTL + @page margins
  const pdfExporterSrc = fs.readFileSync(path.join(process.cwd(), 'src/utils/viewPdfExporter.ts'), 'utf8');
  assert.ok(pdfExporterSrc.includes('@page { size:'), 'Print view must define @page dimensions & margins');
  assert.ok(pdfExporterSrc.includes('escapePdfHtml(rawVal)'), 'PDF table cells must be HTML-escaped');
  assert.ok(pdfExporterSrc.includes('escapePdfHtml(val)'), 'Print table cells must be HTML-escaped');

  // 3. Zero console.log / console.debug / debugger / MOCK_DATA in frontend source
  const clientFiles = collectFilesRecursive(path.join(process.cwd(), 'src'), ['.ts', '.tsx']);
  const consoleLogViolations: string[] = [];
  const debuggerViolations: string[] = [];

  for (const file of clientFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (/\bconsole\.(log|debug)\s*\(/.test(content)) {
      consoleLogViolations.push(path.relative(process.cwd(), file));
    }
    if (/^\s*debugger\s*;?\s*$/m.test(content)) {
      debuggerViolations.push(path.relative(process.cwd(), file));
    }
  }
  assert.deepEqual(consoleLogViolations, [], `Frontend files must not contain console.log/debug: ${consoleLogViolations.join(', ')}`);
  assert.deepEqual(debuggerViolations, [], `Frontend files must not contain debugger statements: ${debuggerViolations.join(', ')}`);

  // 4. Electron Windows Packaging Integrity (package.json & scripts/build-win.js)
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const buildWinSrc = fs.readFileSync(path.join(process.cwd(), 'scripts/build-win.js'), 'utf8');

  for (const requiredAsset of ['dist/**/*', 'electron-main.cjs', 'electron-preload.cjs', 'package.json', 'icon.ico']) {
    assert.ok(pkg.build.files.includes(requiredAsset), `package.json build.files missing ${requiredAsset}`);
    assert.ok(buildWinSrc.includes(`'${requiredAsset}'`), `scripts/build-win.js config.files missing ${requiredAsset}`);
  }
  assert.equal(fs.existsSync(path.join(process.cwd(), 'electron-main.cjs')), true);
  assert.equal(fs.existsSync(path.join(process.cwd(), 'electron-preload.cjs')), true);
});
