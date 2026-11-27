import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  resolveRequestToken,
  resolveRequestTokenWithSource,
  verifyCookieCsrf
} from '../src/server/security-shield.ts';
import { routerClients } from '../src/server/runtimeContext.ts';
import { createSystemDiagnosticsRoutes } from '../src/server/routes/systemDiagnosticsRoutes.ts';
import { AutoPingStabilizer } from '../src/server/ping-stabilizer.ts';
import { RealtimeSyncServer } from '../src/server/realtime-ws.ts';
import { MikrotikClient } from '../src/server/mikrotik-api.ts';

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3199;
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
  throw new Error(`Server did not respond at ${url}`);
}

describe('Session Continuity, Cookie Auth & CPU Reduction', () => {
  it('sets browser-session-only HttpOnly cookies without Max-Age/Expires and clears cleanly', () => {
    const appendedHttp: string[] = [];
    const reqHttp = { secure: false, headers: {} } as any;
    const resHttp = { append: (_k: string, v: string) => appendedHttp.push(v) } as any;

    setSessionCookie(reqHttp, resHttp, 'tok-abc-123');
    assert.equal(appendedHttp.length, 1);
    assert.match(appendedHttp[0], /^zctrl_rt=tok-abc-123; Path=\/; HttpOnly; SameSite=Lax$/);
    assert.doesNotMatch(appendedHttp[0], /Max-Age|Expires/i);

    const appendedHttps: string[] = [];
    const reqHttps = { secure: false, headers: { 'x-forwarded-proto': 'https' } } as any;
    const resHttps = { append: (_k: string, v: string) => appendedHttps.push(v) } as any;

    setSessionCookie(reqHttps, resHttps, 'tok-tls-999');
    assert.equal(appendedHttps.length, 1);
    assert.match(appendedHttps[0], /HttpOnly; Secure; SameSite=None; Partitioned/);
    assert.doesNotMatch(appendedHttps[0], /Max-Age|Expires/i);

    const cleared: string[] = [];
    clearSessionCookie(reqHttp, { append: (_k: string, v: string) => cleared.push(v) } as any);
    assert.match(cleared[0], /^zctrl_rt=;.*Max-Age=0/);
  });

  it('resolves tokens with header priority, supports HttpOnly cookie fallback, rejects query tokens, and validates cookie CSRF', () => {
    const cookieOnlyReq = {
      headers: {
        cookie: `other=1; ${SESSION_COOKIE_NAME}=cookie-tok-1`
      },
      query: { token: 'query-ignored' }
    } as any;
    const resolvedCookie = resolveRequestTokenWithSource(cookieOnlyReq);
    assert.equal(resolvedCookie.token, 'cookie-tok-1');
    assert.equal(resolvedCookie.source, 'cookie');

    const headerOverrideReq = {
      headers: {
        'x-router-token': 'header-tok-2',
        cookie: `${SESSION_COOKIE_NAME}=cookie-tok-1`
      }
    } as any;
    const resolvedHeader = resolveRequestTokenWithSource(headerOverrideReq);
    assert.equal(resolvedHeader.token, 'header-tok-2');
    assert.equal(resolvedHeader.source, 'header');

    const queryOnlyReq = {
      headers: {},
      query: { token: 'query-tok-bad' }
    } as any;
    assert.equal(resolveRequestToken(queryOnlyReq), undefined);

    // CSRF checks for cookie-authenticated mutations
    assert.equal(
      verifyCookieCsrf({ headers: { host: '127.0.0.1:3000', origin: 'https://evil.example.org' } } as any),
      false
    );
    assert.equal(
      verifyCookieCsrf({ headers: { host: '127.0.0.1:3000', origin: 'null' } } as any),
      false
    );
    assert.equal(
      verifyCookieCsrf({ headers: { host: '127.0.0.1:3000' } } as any),
      false
    );
    assert.equal(
      verifyCookieCsrf({ headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' } } as any),
      true
    );
    assert.equal(
      verifyCookieCsrf({ headers: { host: '127.0.0.1:3000', 'x-requested-with': 'XMLHttpRequest' } } as any),
      true
    );
  });

  it('uses calm baseline intervals in AutoPingStabilizer and RealtimeSyncServer', () => {
    const stabilizer = new AutoPingStabilizer();
    const snap = stabilizer.getSnapshot();
    assert.ok(snap.recommendedWsIntervalMs >= 7500, `Expected >=7500ms, got ${snap.recommendedWsIntervalMs}`);

    const wsServer = new RealtimeSyncServer(() => null);
    assert.ok((wsServer as any).baseIntervalMs >= 7500);
    assert.ok((wsServer as any).latestStabilizerIntervalMs >= 7500);
    wsServer.destroy();
  });

  it('isolates API RTT from ICMP stabilizer, ignores timeouts as socket drops, and retries read-only /print only', async () => {
    const client = new MikrotikClient() as any;
    client.isConnectedFlag = true;
    client.socket = { destroyed: false };

    // 1. Successful /system/resource/print updates getApiLatency(), NOT PingStabilizer samplesCount
    client.sendSentenceAsync = async () => [['!re', '=cpu-load=20'], ['!done']];
    await client.query('/system/resource/print');
    assert.ok(client.getApiLatency() >= 1);
    assert.equal(client.getPingStabilizer().getSnapshot().samplesCount, 0);

    // 2. Real ICMP sample updates PingStabilizer & getLatency() independently of API RTT
    client.recordIcmpPingSample(37, 0);
    assert.equal(client.getPingStabilizer().getSnapshot().samplesCount, 1);
    assert.equal(client.getLatency(), 37);

    // 3. Query timeout must NOT tear down socket or reconnect
    let cleanupCalled = 0;
    let reconnectCalled = 0;
    client.cleanupSocket = () => {
      cleanupCalled++;
    };
    client.ensureConnected = async () => {
      reconnectCalled++;
      return true;
    };
    client.sendSentenceAsync = async () => {
      throw new Error('مهلة الانتظار (timeout) لاستجابة الراوتر');
    };
    await assert.rejects(() => client.query('/ip/hotspot/user/print'), /timeout|مهلة/);
    assert.equal(cleanupCalled, 0);
    assert.equal(reconnectCalled, 0);
    assert.equal(client.isConnectedFlag, true);

    // 4. Socket disconnect retries ONLY read-only /print, never /add mutations
    client.sendSentenceAsync = async () => {
      throw new Error('Socket closed unexpectedly');
    };
    await assert.rejects(() => client.query('/ip/hotspot/user/add', ['=name=dup']), /Socket closed/);
    assert.equal(reconnectCalled, 0);

    let attempt = 0;
    client.sendSentenceAsync = async () => {
      attempt++;
      if (attempt === 1) throw new Error('Socket closed unexpectedly');
      return [['!re', '=name=alice'], ['!done']];
    };
    const retried = await client.query('/ip/hotspot/user/print');
    assert.equal(reconnectCalled, 1);
    assert.equal(retried.length, 1);
    assert.equal(retried[0].name, 'alice');
  });

  it('recovers session from HttpOnly cookie across transient disconnects, skips heavy queries, and gates /system/logs behind includeLogs=true', async () => {
    const token = 'test-session-token-' + Date.now();
    const queriedCommands: string[] = [];
    let routerConnected = false;

    const mockClient: any = {
      currentConfig: { host: '192.168.88.199', port: 8728, user: 'admin' },
      boardName: 'RB4011',
      routerVersion: '7.15',
      routerMajorVersion: 7,
      getConfig: () => ({ host: '192.168.88.199', port: 8728, user: 'admin' }),
      isConnected: () => routerConnected,
      ensureConnected: async () => routerConnected,
      getPeerTlsFingerprint: () => null,
      querySafe: async (cmd: string) => {
        queriedCommands.push(cmd);
        if (cmd === '/ip/hotspot/active/print') {
          return [{ '.id': '*1', user: 'ali', address: '10.0.0.5', uptime: '5m', 'bytes-in': '100', 'bytes-out': '200' }];
        }
        if (cmd === '/ip/hotspot/user/print') {
          return [
            { '.id': '*10', name: 'u1', profile: 'default' },
            { '.id': '*11', name: 'u2', profile: 'default' }
          ];
        }
        if (cmd === '/ppp/active/print') {
          return [{ '.id': '*2', name: 'ppp1', service: 'pppoe', address: '10.1.0.2', uptime: '10m' }];
        }
        if (cmd === '/ppp/secret/print') {
          return [{ '.id': '*20', name: 'sec1', profile: 'default', service: 'pppoe' }];
        }
        if (cmd === '/log/print') {
          return [{ '.id': '*L1', time: '00:00:01', topics: 'system,info', message: 'booted' }];
        }
        return [];
      }
    };

    const initialLastSeen = Date.now() - 60_000;
    routerClients.set(token, {
      client: mockClient,
      host: '192.168.88.1',
      user: 'admin',
      role: 'admin',
      operatorId: 'root-admin',
      operatorName: 'admin',
      lastSeen: initialLastSeen
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).routerClient = mockClient;
      next();
    });
    app.use(createSystemDiagnosticsRoutes());

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as net.AddressInfo;
    const base = `http://127.0.0.1:${addr.port}`;

    try {
      // 1. Even while router link is temporarily down (routerConnected=false), session cookie preserves login
      const reconnectingRes = await fetch(`${base}/api/mikrotik/session`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` }
      });
      assert.equal(reconnectingRes.status, 200);
      const reconnectingJson: any = await reconnectingRes.json();
      assert.equal(reconnectingJson.success, true);
      assert.equal(reconnectingJson.connected, false);
      assert.equal(reconnectingJson.reconnecting, true);
      assert.equal(reconnectingJson.token, token);
      assert.ok((routerClients.get(token)?.lastSeen || 0) > initialLastSeen, 'session.lastSeen must refresh on /session');

      // 2. When router reconnects, /session returns connected: true
      routerConnected = true;
      const connectedRes = await fetch(`${base}/api/mikrotik/session`, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` }
      });
      const connectedJson: any = await connectedRes.json();
      assert.equal(connectedJson.success, true);
      assert.equal(connectedJson.connected, true);

      // 3. activeOnly=true on /sync/hotspot never queries /ip/hotspot/user/print
      queriedCommands.length = 0;
      const hsActiveRes = await fetch(`${base}/api/mikrotik/data/sync/hotspot?activeOnly=true`);
      const hsActiveJson: any = await hsActiveRes.json();
      assert.equal(hsActiveJson.success, true);
      assert.equal(hsActiveJson.data.notModifiedUsers, true);
      assert.equal(hsActiveJson.data.activeHotspotUsers.length, 1);
      assert.equal(queriedCommands.includes('/ip/hotspot/user/print'), false);

      // 4. Matching userHash omits hotspotUsers from payload
      const hsFullRes = await fetch(`${base}/api/mikrotik/data/sync/hotspot`);
      const hsFullJson: any = await hsFullRes.json();
      assert.equal(hsFullJson.data.notModifiedUsers, false);
      assert.equal(hsFullJson.data.hotspotUsers.length, 2);

      const hsDeltaRes = await fetch(`${base}/api/mikrotik/data/sync/hotspot?userHash=${encodeURIComponent(hsFullJson.data.userHash)}`);
      const hsDeltaJson: any = await hsDeltaRes.json();
      assert.equal(hsDeltaJson.data.notModifiedUsers, true);
      assert.equal(hsDeltaJson.data.hotspotUsers, undefined);

      // 5. activeOnly=true on /sync/ppp never queries /ppp/secret/print & secretHash omits secrets
      queriedCommands.length = 0;
      const pppActiveRes = await fetch(`${base}/api/mikrotik/data/sync/ppp?activeOnly=true`);
      const pppActiveJson: any = await pppActiveRes.json();
      assert.equal(pppActiveJson.data.notModifiedSecrets, true);
      assert.equal(pppActiveJson.data.active.length, 1);
      assert.equal(queriedCommands.includes('/ppp/secret/print'), false);

      const pppFullRes = await fetch(`${base}/api/mikrotik/data/sync/ppp`);
      const pppFullJson: any = await pppFullRes.json();
      const pppDeltaRes = await fetch(`${base}/api/mikrotik/data/sync/ppp?secretHash=${encodeURIComponent(pppFullJson.data.secretHash)}`);
      const pppDeltaJson: any = await pppDeltaRes.json();
      assert.equal(pppDeltaJson.data.notModifiedSecrets, true);
      assert.equal(pppDeltaJson.data.secrets, undefined);

      // 6. /data/sync/network skips /log/print unless includeLogs=true is explicitly requested
      queriedCommands.length = 0;
      const logsSkippedRes = await fetch(`${base}/api/mikrotik/data/sync/network`);
      const logsSkippedJson: any = await logsSkippedRes.json();
      assert.equal(logsSkippedJson.success, true);
      assert.equal(logsSkippedJson.data.logs, undefined);
      assert.equal(queriedCommands.includes('/log/print'), false);

      const logsIncludedRes = await fetch(`${base}/api/mikrotik/data/sync/network?includeLogs=true`);
      const logsIncludedJson: any = await logsIncludedRes.json();
      assert.equal(logsIncludedJson.success, true);
      assert.equal(queriedCommands.includes('/log/print'), true);
      assert.equal(logsIncludedJson.data.logs.length, 1);
    } finally {
      routerClients.delete(token);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('Production Bundle Session Policy & Cookie CSRF Guards', () => {
  let serverProc: ChildProcess | null = null;
  let baseUrl = '';
  let tempDataDir = '';

  before(async () => {
    const bundlePath = path.resolve(process.cwd(), 'dist/server.cjs');
    if (!fs.existsSync(bundlePath)) {
      throw new Error('dist/server.cjs not found — run `npm run build` before integration tests');
    }
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-sess-test-'));
    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    serverProc = spawn(process.execPath, [bundlePath], {
      env: { ...process.env, NODE_ENV: 'production', PORT: String(port), ZCTRL_DATA_DIR: tempDataDir },
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

  it('requires manual login on fresh launch (never auto-connects /api/mikrotik/session)', async () => {
    const res = await fetch(`${baseUrl}/api/mikrotik/session`);
    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.connected, false);
  });

  it('blocks cookie-authenticated cross-origin POST and clears zctrl_rt cookie on explicit cancel-connect', async () => {
    const badCsrf = await fetch(`${baseUrl}/api/mikrotik/cancel-connect`, {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=fake-cookie-tok`,
        origin: 'https://malicious.example.org'
      }
    });
    assert.equal(badCsrf.status, 403);

    const goodLogout = await fetch(`${baseUrl}/api/mikrotik/cancel-connect`, {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=fake-cookie-tok`,
        'x-requested-with': 'XMLHttpRequest'
      }
    });
    assert.equal(goodLogout.status, 200);
    const setCookie = goodLogout.headers.get('set-cookie') || '';
    assert.match(setCookie, /zctrl_rt=;.*Max-Age=0/);
  });
});
