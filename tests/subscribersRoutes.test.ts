import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface RecordedCall {
  cmd: string;
  params?: string[];
}

function createMockRouterClient() {
  const calls: RecordedCall[] = [];
  const mockClient = {
    calls,
    isConnected: () => true,
    isV6: () => false,
    getMajorVersion: () => 7,
    query: async (cmd: string, params?: string[]) => {
      calls.push({ cmd, params });
      if (cmd === '/ip/hotspot/user/print') {
        return [{ '.id': '*10', name: 'u100', profile: 'default' }];
      }
      if (cmd === '/ip/hotspot/user/profile/print') {
        return [{ '.id': '*20', name: 'vip-plan', 'rate-limit': '5M/5M' }];
      }
      if (cmd === '/ip/hotspot/active/print') {
        return [{ '.id': '*30', user: 'u100' }];
      }
      if (cmd === '/ppp/secret/print') {
        return [{ '.id': '*40', name: 'ppp1', profile: 'default' }];
      }
      if (cmd === '/ppp/profile/print') {
        return [{ '.id': '*50', name: 'ppp-vip', 'rate-limit': '10M/10M' }];
      }
      if (cmd === '/ppp/active/print') {
        return [{ '.id': '*60', name: 'ppp1' }];
      }
      if (cmd.endsWith('/user/print') && cmd.includes('user-manager')) {
        return [{ '.id': '*70', name: 'um1', group: 'um-plan' }];
      }
      if (cmd.endsWith('/profile/print') && cmd.includes('user-manager')) {
        return [{ '.id': '*80', name: 'um-plan' }];
      }
      if (cmd.endsWith('/profile/limitation/print')) {
        return [{ '.id': '*81', name: 'um-plan-lim' }];
      }
      if (cmd.endsWith('/profile/profile-limitation/print')) {
        return [{ '.id': '*82', profile: 'um-plan', limitation: 'um-plan-lim' }];
      }
      if (cmd.endsWith('/session/print')) {
        return [{ '.id': '*90', user: 'um1' }];
      }
      return [];
    },
    querySafe: async (cmd: string, params?: string[]) => mockClient.query(cmd, params)
  };
  return mockClient;
}

describe('Subscribers Routes Regression Suite (Hotspot, PPP, Userman, Batch)', () => {
  let server: http.Server;
  let baseUrl = '';
  let tempDataDir = '';
  const mockClient = createMockRouterClient();

  before(async () => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-sub-routes-'));
    process.env.ZCTRL_DATA_DIR = tempDataDir;
    const { createSubscribersRoutes } = await import('../src/server/routes/subscribersRoutes.ts');

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.routerClient = mockClient;
      req.sessionRole = { role: 'admin', operatorId: 'test-admin', operatorName: 'Test Admin' };
      next();
    });
    app.use(createSubscribersRoutes());

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (tempDataDir) fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    mockClient.calls.length = 0;
  });

  it('creates, updates, deletes, and disconnects Hotspot users', async () => {
    const addRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'u100', password: '123', profile: 'default' })
    });
    assert.equal(addRes.status, 200);
    assert.equal((await addRes.json()).success, true);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ip/hotspot/user/add'));

    const putRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/users/u100`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'vip-plan', disabled: true })
    });
    assert.equal(putRes.status, 200);
    assert.equal((await putRes.json()).success, true);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ip/hotspot/user/set'));

    const discRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/active/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '*30' })
    });
    assert.equal(discRes.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ip/hotspot/active/remove'));

    const delRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/users/u100`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ip/hotspot/user/remove'));
  });

  it('supports Hotspot profiles CRUD & batch actions', async () => {
    const createProf = await fetch(`${baseUrl}/api/mikrotik/hotspot/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'vip-plan', rateLimit: '5M/5M', sharedUsers: 2 })
    });
    assert.equal(createProf.status, 200);
    assert.equal((await createProf.json()).success, true);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ip/hotspot/user/profile/add'));

    const batchRes = await fetch(`${baseUrl}/api/mikrotik/subscribers/batch-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: 'hotspot', action: 'toggle_status', ids: ['*10'], payload: { disabled: true } })
    });
    assert.equal(batchRes.status, 200);
    assert.equal((await batchRes.json()).success, true);

    const delProf = await fetch(`${baseUrl}/api/mikrotik/hotspot/profiles/vip-plan`, { method: 'DELETE' });
    assert.equal(delProf.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ip/hotspot/user/profile/remove'));
  });

  it('supports PPP secrets & profiles CRUD and disconnect', async () => {
    const addSecret = await fetch(`${baseUrl}/api/mikrotik/ppp/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ppp1', password: 'secret', profile: 'default' })
    });
    assert.equal(addSecret.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ppp/secret/add'));

    const addProf = await fetch(`${baseUrl}/api/mikrotik/ppp/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'ppp-vip', rateLimit: '10M/10M' })
    });
    assert.equal(addProf.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ppp/profile/add'));

    const discPpp = await fetch(`${baseUrl}/api/mikrotik/ppp/active/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '*60' })
    });
    assert.equal(discPpp.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ppp/active/remove'));

    const delSecret = await fetch(`${baseUrl}/api/mikrotik/ppp/secrets/ppp1`, { method: 'DELETE' });
    assert.equal(delSecret.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd === '/ppp/secret/remove'));
  });

  it('supports Userman users, profiles, and card batch generation', async () => {
    const addUm = await fetch(`${baseUrl}/api/mikrotik/userman/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'um1', password: 'um1', profile: 'um-plan' })
    });
    assert.equal(addUm.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd.endsWith('/user/add')));

    const addUmProf = await fetch(`${baseUrl}/api/mikrotik/userman/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'um-plan', downloadRateLimit: '5M', uploadRateLimit: '2M' })
    });
    assert.equal(addUmProf.status, 200);
    assert.ok(mockClient.calls.some((c) => c.cmd.endsWith('/profile/add')));

    const genCards = await fetch(`${baseUrl}/api/mikrotik/hotspot/cards/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 2, profile: 'default', prefix: 'ZC' })
    });
    assert.equal(genCards.status, 200);
    const genJson: any = await genCards.json();
    assert.equal(genJson.success, true);
    assert.equal(genJson.users?.length, 2);
  });
});
