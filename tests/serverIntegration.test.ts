import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3099;
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
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server did not respond at ${url} within ${timeoutMs}ms`);
}

describe('Production Bundle (dist/server.cjs) Live HTTP & Security Integration', () => {
  let serverProc: ChildProcess | null = null;
  let baseUrl = '';
  let testPort = 0;
  let tempDataDir = '';

  before(async () => {
    const bundlePath = path.resolve(process.cwd(), 'dist/server.cjs');
    if (!fs.existsSync(bundlePath)) {
      throw new Error('dist/server.cjs not found — run `npm run build` before integration tests');
    }

    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-srv-int-'));
    testPort = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${testPort}`;

    serverProc = spawn(process.execPath, [bundlePath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(testPort),
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
    if (tempDataDir) {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    }
  });

  it('serves /api/ping and /api/health with dynamic PORT binding', async () => {
    const pingRes = await fetch(`${baseUrl}/api/ping`);
    assert.equal(pingRes.status, 200);
    const pingJson: any = await pingRes.json();
    assert.equal(pingJson.success, true);
    assert.equal(pingJson.app, 'ZCtrl');
    assert.equal(pingJson.port, testPort);

    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson: any = await healthRes.json();
    assert.equal(healthJson.status, 'ok');
  });

  it('serves the built frontend SPA at /', async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.match(html, /ZCtrl/i);
    assert.match(html, /<div\s+id="root"/i);
  });

  it('enforces multi-tenant session isolation (401 without token) on protected APIs', async () => {
    const res = await fetch(`${baseUrl}/api/vouchers/stats`);
    assert.equal(res.status, 401);
    const body: any = await res.json();
    assert.equal(body.success, false);
  });

  it('validates /api/mikrotik/connect input and handles unreachable routers gracefully', async () => {
    const missingUserRes = await fetch(`${baseUrl}/api/mikrotik/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: 1, username: '' })
    });
    assert.equal(missingUserRes.status, 200);
    const missingUserJson: any = await missingUserRes.json();
    assert.equal(missingUserJson.success, false);

    // Closed local loopback port fails immediately with ECONNREFUSED and returns helpful Arabic error
    const refusedRes = await fetch(`${baseUrl}/api/mikrotik/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: 1, username: 'admin', password: '' })
    });
    assert.equal(refusedRes.status, 200);
    const refusedJson: any = await refusedRes.json();
    assert.equal(refusedJson.success, false);
    assert.ok(typeof refusedJson.message === 'string' && refusedJson.message.length > 0);
  });

  it('runs /api/mikrotik/discover and /api/mikrotik/diagnose without crashing', async () => {
    const discRes = await fetch(`${baseUrl}/api/mikrotik/discover`);
    assert.equal(discRes.status, 200);
    const discJson: any = await discRes.json();
    assert.equal(discJson.success, true);
    assert.ok(Array.isArray(discJson.routers));

    const diagRes = await fetch(`${baseUrl}/api/mikrotik/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', port: 1 })
    });
    assert.equal(diagRes.status, 200);
    const diagJson: any = await diagRes.json();
    assert.equal(diagJson.success, true);
    assert.equal(typeof diagJson.diagnostic?.latencyMs, 'number');
  });

  it('allows CORS for local/Electron origins and blocks untrusted third-party origins', async () => {
    const localRes = await fetch(`${baseUrl}/api/ping`, {
      headers: { Origin: 'http://localhost:3000' }
    });
    assert.equal(localRes.headers.get('access-control-allow-origin'), 'http://localhost:3000');

    const badRes = await fetch(`${baseUrl}/api/ping`, {
      headers: { Origin: 'https://untrusted-attacker.example.com' }
    });
    assert.equal(badRes.headers.get('access-control-allow-origin'), null);
  });
});
