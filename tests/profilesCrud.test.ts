import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import {
  isProtectedDefaultProfileName,
  cleanDnsOrIpList,
  parseRateToBpsString,
  normalizeRateLimitString,
  getUsermanEndpoints,
  executeProfileMutation
} from '../src/server/routeros/profileSanitizer.ts';

interface StrictRouterOpts {
  v6?: boolean;
  rejectIpv6OnPpp?: boolean;
  rejectQueueType?: boolean;
  failUsermanProfileAdd?: boolean;
}

/**
 * Simulates a strict real MikroTik RouterOS (v6 or v7) API server that throws
 * authentic !trap errors whenever invalid/unsupported parameters or paths are sent.
 */
function createStrictMikroTikMock(opts: StrictRouterOpts = {}) {
  const isV6 = Boolean(opts.v6);
  const queries: Array<{ cmd: string; params: string[] }> = [];
  let nextId = 2;

  const hsProfiles: any[] = [
    { '.id': '*0', name: 'default', 'shared-users': '1' },
    { '.id': '*1', name: 'FirstCustomHS', 'rate-limit': '1M/2M', 'shared-users': '1' }
  ];
  const pppProfiles: any[] = [
    { '.id': '*0', name: 'default', 'only-one': 'default' },
    { '.id': '*1', name: 'FirstCustomPPP', 'rate-limit': '2M/4M', 'only-one': 'yes' },
    { '.id': '*FE', name: 'default-encryption', 'use-encryption': 'yes' }
  ];
  const umProfiles: any[] = [
    { '.id': '*1', name: 'FirstCustomUM', price: '100', validity: '30d' }
  ];
  const umLimitations: any[] = [
    { '.id': '*10', name: 'Lim-FirstCustomUM' }
  ];
  const umLinks: any[] = [
    { '.id': '*20', profile: 'FirstCustomUM', limitation: 'Lim-FirstCustomUM' }
  ];

  const parseParams = (params: string[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const p of params) {
      if (p.startsWith('=')) {
        const idx = p.indexOf('=', 1);
        if (idx > 1) {
          out[p.slice(1, idx)] = p.slice(idx + 1);
        }
      }
    }
    return out;
  };

  const handleQuery = async (cmd: string, params: string[] = []): Promise<any[]> => {
    queries.push({ cmd, params });
    const kv = parseParams(params);
    const nameFilter = params.find((p) => p.startsWith('?name='))?.slice(6);
    const profileFilter = params.find((p) => p.startsWith('?profile='))?.slice(9);
    const limFilter = params.find((p) => p.startsWith('?limitation='))?.slice(12);

    // ─── HOTSPOT PROFILES ───
    if (cmd === '/ip/hotspot/user/profile/print') {
      return nameFilter ? hsProfiles.filter((p) => p.name === nameFilter) : [...hsProfiles];
    }
    if (cmd === '/ip/hotspot/user/profile/add' || cmd === '/ip/hotspot/user/profile/set') {
      // Strict RouterOS v6/v7 rules: NO 'comment' attribute on hotspot user profiles!
      if ('comment' in kv) {
        throw new Error('MikroTik API Error: unknown parameter');
      }
      if (kv['insert-queue-before'] === 'first') {
        throw new Error('MikroTik API Error: input does not match any value of insert-queue-before');
      }
      if (kv['mac-cookie-timeout'] === 'none') {
        throw new Error('MikroTik API Error: invalid value for argument mac-cookie-timeout');
      }
      if (kv['status-autorefresh'] === 'none') {
        throw new Error('MikroTik API Error: invalid value for argument status-autorefresh');
      }
      if (opts.rejectQueueType && kv['queue-type']) {
        throw new Error('MikroTik API Error: input does not match any value of queue-type');
      }

      if (cmd.endsWith('/add')) {
        if (hsProfiles.some((p) => p.name === kv.name)) {
          throw new Error('MikroTik API Error: failure: already have hotspot user profile with such name');
        }
        const id = `*${nextId++}`;
        hsProfiles.push({ '.id': id, ...kv });
        return [{ ret: id }];
      } else {
        const target = hsProfiles.find((p) => p['.id'] === kv['.id']);
        if (!target) throw new Error('MikroTik API Error: no such item');
        Object.assign(target, kv);
        return [];
      }
    }
    if (cmd === '/ip/hotspot/user/profile/remove') {
      const idx = hsProfiles.findIndex((p) => p['.id'] === kv['.id']);
      if (idx === -1) throw new Error('MikroTik API Error: no such item');
      if (hsProfiles[idx].name === 'default') throw new Error('MikroTik API Error: cannot remove default');
      hsProfiles.splice(idx, 1);
      return [];
    }

    // ─── PPP PROFILES ───
    if (cmd === '/ppp/profile/print') {
      return nameFilter ? pppProfiles.filter((p) => p.name === nameFilter) : [...pppProfiles];
    }
    if (cmd === '/ppp/profile/add' || cmd === '/ppp/profile/set') {
      if (opts.rejectIpv6OnPpp && ('use-ipv6' in kv || 'remote-ipv6-prefix-pool' in kv)) {
        throw new Error('MikroTik API Error: unknown parameter');
      }
      if (kv['dns-server'] && /\s/.test(kv['dns-server'])) {
        throw new Error('MikroTik API Error: invalid value for argument dns-server');
      }
      if (kv['session-timeout'] === 'none' || kv['idle-timeout'] === 'none') {
        throw new Error('MikroTik API Error: invalid value for argument session-timeout');
      }

      if (cmd.endsWith('/add')) {
        if (pppProfiles.some((p) => p.name === kv.name)) {
          throw new Error('MikroTik API Error: failure: already have profile with such name');
        }
        const id = `*${nextId++}`;
        pppProfiles.push({ '.id': id, ...kv });
        return [{ ret: id }];
      } else {
        const target = pppProfiles.find((p) => p['.id'] === kv['.id']);
        if (!target) throw new Error('MikroTik API Error: no such item');
        Object.assign(target, kv);
        return [];
      }
    }
    if (cmd === '/ppp/profile/remove') {
      const idx = pppProfiles.findIndex((p) => p['.id'] === kv['.id']);
      if (idx === -1) throw new Error('MikroTik API Error: no such item');
      if (pppProfiles[idx].name === 'default' || pppProfiles[idx].name === 'default-encryption') {
        throw new Error('MikroTik API Error: cannot remove default');
      }
      pppProfiles.splice(idx, 1);
      return [];
    }

    // ─── USER MANAGER (STRICT V6 vs V7 PATHS & SCHEMAS) ───
    const um = getUsermanEndpoints(isV6);

    // Reject wrong v6/v7 paths immediately (just like real RouterOS!)
    if (isV6 && (cmd.startsWith('/tool/user-manager/limitation') || cmd.startsWith('/tool/user-manager/profile-limitation'))) {
      throw new Error('MikroTik API Error: no such command');
    }

    if (cmd === `${um.profile}/print`) {
      return nameFilter ? umProfiles.filter((p) => p.name === nameFilter) : [...umProfiles];
    }
    if (cmd === `${um.limitation}/print`) {
      return nameFilter ? umLimitations.filter((l) => l.name === nameFilter) : [...umLimitations];
    }
    if (cmd === `${um.profileLimitation}/print`) {
      if (profileFilter) return umLinks.filter((l) => l.profile === profileFilter);
      if (limFilter) return umLinks.filter((l) => l.limitation === limFilter);
      return [...umLinks];
    }

    if (cmd === `${um.limitation}/add` || cmd === `${um.limitation}/set`) {
      if (!isV6) {
        if ('owner' in kv) throw new Error('MikroTik API Error: unknown parameter');
        if (kv['rate-limit-rx'] && !/^\d+$/.test(kv['rate-limit-rx'])) {
          throw new Error('MikroTik API Error: invalid value for argument rate-limit-rx');
        }
        if (kv['rate-limit-tx'] && !/^\d+$/.test(kv['rate-limit-tx'])) {
          throw new Error('MikroTik API Error: invalid value for argument rate-limit-tx');
        }
      }
      if (cmd.endsWith('/add')) {
        const id = `*${nextId++}`;
        umLimitations.push({ '.id': id, ...kv });
        return [{ ret: id }];
      } else {
        const target = umLimitations.find((l) => l['.id'] === kv['.id']);
        if (!target) throw new Error('MikroTik API Error: no such item');
        Object.assign(target, kv);
        return [];
      }
    }
    if (cmd === `${um.limitation}/remove`) {
      const idx = umLimitations.findIndex((l) => l['.id'] === kv['.id']);
      if (idx !== -1) umLimitations.splice(idx, 1);
      return [];
    }

    if (cmd === `${um.profile}/add` || cmd === `${um.profile}/set`) {
      if (!isV6) {
        if ('owner' in kv || 'comment' in kv || 'starts-at' in kv) {
          throw new Error('MikroTik API Error: unknown parameter');
        }
      }
      if (cmd.endsWith('/add')) {
        if (opts.failUsermanProfileAdd) {
          throw new Error('MikroTik API Error: failure: already have profile with such name');
        }
        const id = `*${nextId++}`;
        umProfiles.push({ '.id': id, ...kv });
        return [{ ret: id }];
      } else {
        const target = umProfiles.find((p) => p['.id'] === kv['.id']);
        if (!target) throw new Error('MikroTik API Error: no such item');
        Object.assign(target, kv);
        return [];
      }
    }
    if (cmd === `${um.profile}/remove`) {
      const idx = umProfiles.findIndex((p) => p['.id'] === kv['.id']);
      if (idx === -1) throw new Error('MikroTik API Error: no such item');
      umProfiles.splice(idx, 1);
      return [];
    }

    if (cmd === `${um.profileLimitation}/add`) {
      const id = `*${nextId++}`;
      umLinks.push({ '.id': id, ...kv });
      return [{ ret: id }];
    }
    if (cmd === `${um.profileLimitation}/set`) {
      const target = umLinks.find((l) => l['.id'] === kv['.id']);
      if (target) Object.assign(target, kv);
      return [];
    }
    if (cmd === `${um.profileLimitation}/remove`) {
      const idx = umLinks.findIndex((l) => l['.id'] === kv['.id']);
      if (idx !== -1) umLinks.splice(idx, 1);
      return [];
    }

    return [];
  };

  return {
    queries,
    hsProfiles,
    pppProfiles,
    umProfiles,
    umLimitations,
    umLinks,
    isConnected: () => true,
    isV6: () => isV6,
    ensureConnected: async () => {},
    query: handleQuery,
    querySafe: handleQuery
  };
}

describe('Profile Sanitizer & Resilient RouterOS v6/v7 Profile CRUD', () => {
  let tempDir = '';
  let createSubscribersRoutes: () => express.Router;
  let voucherDbInstance: any;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-prof-crud-'));
    process.env.ZCTRL_DATA_DIR = tempDir;
    const dbMod = await import('../src/server/voucher-db.ts');
    voucherDbInstance = dbMod.voucherDb;
    const routesMod = await import('../src/server/routes/subscribersRoutes.ts');
    createSubscribersRoutes = routesMod.createSubscribersRoutes;
  });

  after(() => {
    try {
      voucherDbInstance?.close?.();
    } catch {}
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function withTestServer(mockClient: any, fn: (baseUrl: string) => Promise<void>) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.routerClient = mockClient;
      next();
    });
    app.use(createSubscribersRoutes());

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    try {
      await fn(baseUrl);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it('Sanitizer utilities handle default names, DNS cleanup, bps conversion, rate normalization, and v6/v7 paths', () => {
    assert.equal(isProtectedDefaultProfileName('default'), true);
    assert.equal(isProtectedDefaultProfileName('DEFAULT-ENCRYPTION'), true);
    assert.equal(isProtectedDefaultProfileName('*0'), false);
    assert.equal(isProtectedDefaultProfileName('*1'), false);
    assert.equal(isProtectedDefaultProfileName('default-vip'), false);

    assert.equal(cleanDnsOrIpList('8.8.8.8, 1.1.1.1 , none'), '8.8.8.8,1.1.1.1');
    assert.equal(cleanDnsOrIpList('none'), '');

    assert.equal(parseRateToBpsString('2M'), '2000000');
    assert.equal(parseRateToBpsString('512k'), '512000');
    assert.equal(parseRateToBpsString('1G'), '1000000000');
    assert.equal(parseRateToBpsString('2500000'), '2500000');
    assert.equal(parseRateToBpsString('0'), '0');

    assert.equal(normalizeRateLimitString(' 2M / 5M  4M / 10M '), '2M/5M 4M/10M');
    assert.equal(normalizeRateLimitString('unlimited'), '');

    const v6Paths = getUsermanEndpoints(true);
    assert.equal(v6Paths.limitation, '/tool/user-manager/profile/limitation');
    assert.equal(v6Paths.profileLimitation, '/tool/user-manager/profile/profile-limitation');

    const v7Paths = getUsermanEndpoints(false);
    assert.equal(v7Paths.limitation, '/user-manager/limitation');
    assert.equal(v7Paths.profileLimitation, '/user-manager/profile-limitation');
  });

  it('executeProfileMutation auto-strips unsupported optional attributes but NEVER drops core parameters or hides duplicate errors', async () => {
    const calls: string[][] = [];
    const fakeClient: any = {
      isConnected: () => true,
      query: async (_ep: string, params: string[]) => {
        calls.push([...params]);
        if (params.some((p) => p.startsWith('=queue-type='))) {
          throw new Error('MikroTik API Error: input does not match any value of queue-type');
        }
        return [{ ret: '*77' }];
      },
      querySafe: async () => []
    };

    const { result, strippedParams } = await executeProfileMutation(
      fakeClient,
      '/ip/hotspot/user/profile/add',
      ['=name=TestPlan', '=rate-limit=2M/5M', '=queue-type=missing-pcq'],
      ['queue-type', 'parent-queue']
    );
    assert.equal(result[0].ret, '*77');
    assert.deepEqual(strippedParams, ['queue-type']);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes('=name=TestPlan'));
    assert.ok(calls[1].includes('=rate-limit=2M/5M'));

    // Non-parameter error (duplicate profile) must throw immediately without retrying
    const dupClient: any = {
      isConnected: () => true,
      query: async () => {
        throw new Error('MikroTik API Error: failure: already have profile with such name');
      },
      querySafe: async () => []
    };
    await assert.rejects(
      () => executeProfileMutation(dupClient, '/ppp/profile/add', ['=name=Dup'], ['use-ipv6']),
      /already have profile/i
    );
  });

  it('Hotspot CRUD: creates without comment, handles queue-type fallback, edits profile with "/" in name via .id, deletes .id=*1, protects default', async () => {
    const mock = createStrictMikroTikMock({ rejectQueueType: true });

    await withTestServer(mock, async (baseUrl) => {
      // 1. CREATE Hotspot profile (even with queueType that triggers fallback + insertQueueBefore='first')
      const createRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '2M/5M-Card',
          rateLimit: '2M / 5M',
          sharedUsers: 2,
          price: 300,
          validity: '7d',
          dataQuotaMb: 1024,
          insertQueueBefore: 'first',
          queueType: 'non-existent-queue',
          macCookieTimeout: 'none',
          statusAutorefresh: 'none'
        })
      });
      const createBody = await createRes.json();
      assert.equal(createRes.status, 200, `Hotspot POST failed: ${JSON.stringify(createBody)}`);
      assert.equal(createBody.success, true);
      assert.ok(createBody.profile.id.startsWith('*'));
      assert.equal(createBody.profile.rateLimit, '2M/5M');

      // Verify on-login carries ZCtrl metadata and NO comment was ever sent
      const createdOnRouter = mock.hsProfiles.find((p) => p.name === '2M/5M-Card');
      assert.ok(createdOnRouter);
      assert.equal(createdOnRouter.comment, undefined);
      assert.ok(String(createdOnRouter['on-login']).includes('Price:300'));

      // 2. UPDATE using .id (so "/" in profile name never breaks Express routing)
      const updateRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/profiles/${encodeURIComponent(createdOnRouter['.id'])}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: createdOnRouter['.id'],
          oldName: '2M/5M-Card',
          name: '2M/5M-Card',
          rateLimit: '4M/8M',
          price: 500
        })
      });
      const updateBody = await updateRes.json();
      assert.equal(updateRes.status, 200, `Hotspot PUT failed: ${JSON.stringify(updateBody)}`);
      assert.equal(createdOnRouter['rate-limit'], '4M/8M');
      assert.ok(String(createdOnRouter['on-login']).includes('Price:500'));

      // 3. DELETE custom profile with .id = *1 MUST SUCCEED
      const delCustomRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/profiles/*1`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '*1', profileName: 'FirstCustomHS' })
      });
      assert.equal(delCustomRes.status, 200);
      assert.equal(mock.hsProfiles.some((p) => p['.id'] === '*1'), false);

      // 4. DELETE system default profile MUST BE BLOCKED (400)
      const delDefaultRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/profiles/default`, {
        method: 'DELETE'
      });
      assert.equal(delDefaultRes.status, 400);
    });
  });

  it('PPPoE CRUD: cleans DNS spaces, auto-recovers when IPv6 package is disabled on v6, deletes .id=*1, protects default & default-encryption', async () => {
    const mock = createStrictMikroTikMock({ v6: true, rejectIpv6OnPpp: true });

    await withTestServer(mock, async (baseUrl) => {
      // 1. CREATE PPPoE profile with spaces in DNS and explicit useIpv6='no' on router without ipv6 package
      const createRes = await fetch(`${baseUrl}/api/mikrotik/ppp/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Fiber-20M',
          rateLimit: '10M / 20M',
          dnsServer: '8.8.8.8, 1.1.1.1',
          useIpv6: 'no',
          sessionTimeout: 'none',
          idleTimeout: 'none',
          price: 2500,
          validity: '30d'
        })
      });
      const createBody = await createRes.json();
      assert.equal(createRes.status, 200, `PPP POST failed: ${JSON.stringify(createBody)}`);
      assert.equal(createBody.success, true);

      const created = mock.pppProfiles.find((p) => p.name === 'Fiber-20M');
      assert.ok(created);
      assert.equal(created['dns-server'], '8.8.8.8,1.1.1.1');
      assert.equal(created['rate-limit'], '10M/20M');

      // 2. UPDATE PPPoE profile
      const updateRes = await fetch(`${baseUrl}/api/mikrotik/ppp/profiles/${encodeURIComponent(created['.id'])}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: created['.id'],
          oldName: 'Fiber-20M',
          name: 'Fiber-50M',
          rateLimit: '25M/50M'
        })
      });
      assert.equal(updateRes.status, 200);
      assert.equal(created.name, 'Fiber-50M');
      assert.equal(created['rate-limit'], '25M/50M');

      // 3. DELETE custom profile with .id = *1 MUST SUCCEED
      const delCustomRes = await fetch(`${baseUrl}/api/mikrotik/ppp/profiles/*1`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '*1', profileName: 'FirstCustomPPP' })
      });
      assert.equal(delCustomRes.status, 200);
      assert.equal(mock.pppProfiles.some((p) => p['.id'] === '*1'), false);

      // 4. Protect default & default-encryption
      for (const name of ['default', 'default-encryption']) {
        const res = await fetch(`${baseUrl}/api/mikrotik/ppp/profiles/${name}`, { method: 'DELETE' });
        assert.equal(res.status, 400);
      }
    });
  });

  it('User Manager CRUD (RouterOS v7): uses integer bps, starts-when, omits owner/comment, updates & deletes cleanly', async () => {
    const mockV7 = createStrictMikroTikMock({ v6: false });

    await withTestServer(mockV7, async (baseUrl) => {
      // 1. CREATE on RouterOS v7
      const createRes = await fetch(`${baseUrl}/api/mikrotik/userman/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'UM7-Gold',
          nameForUsers: 'الباقة الذهبية',
          owner: 'admin',
          price: 1200,
          validity: '30d',
          startsAt: 'first-auth',
          rateLimit: '2M/8M',
          transferLimitMb: 5120
        })
      });
      const createBody = await createRes.json();
      assert.equal(createRes.status, 200, `Userman v7 POST failed: ${JSON.stringify(createBody)}`);
      assert.equal(createBody.success, true);

      const createdProf = mockV7.umProfiles.find((p) => p.name === 'UM7-Gold');
      const createdLim = mockV7.umLimitations.find((l) => l.name === 'Lim-UM7-Gold');
      const createdLink = mockV7.umLinks.find((l) => l.profile === 'UM7-Gold');
      assert.ok(createdProf);
      assert.ok(createdLim);
      assert.ok(createdLink);
      assert.equal(createdProf['starts-when'], 'first-auth');
      assert.equal(createdProf.owner, undefined);
      assert.equal(createdLim['rate-limit-rx'], '2000000');
      assert.equal(createdLim['rate-limit-tx'], '8000000');

      // 2. UPDATE on RouterOS v7
      const updateRes = await fetch(`${baseUrl}/api/mikrotik/userman/profiles/${encodeURIComponent(createdProf['.id'])}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: createdProf['.id'],
          oldName: 'UM7-Gold',
          name: 'UM7-Gold',
          price: 1500,
          rateLimit: '5M/10M'
        })
      });
      assert.equal(updateRes.status, 200);
      assert.equal(createdProf.price, '1500');
      assert.equal(createdLim['rate-limit-rx'], '5000000');
      assert.equal(createdLim['rate-limit-tx'], '10000000');

      // 3. DELETE on RouterOS v7 cleans link + profile + orphan limitation
      const delRes = await fetch(`${baseUrl}/api/mikrotik/userman/profiles/${encodeURIComponent(createdProf['.id'])}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: createdProf['.id'], profileName: 'UM7-Gold' })
      });
      assert.equal(delRes.status, 200);
      assert.equal(mockV7.umProfiles.some((p) => p.name === 'UM7-Gold'), false);
      assert.equal(mockV7.umLinks.some((l) => l.profile === 'UM7-Gold'), false);
      assert.equal(mockV7.umLimitations.some((l) => l.name === 'Lim-UM7-Gold'), false);
    });
  });

  it('User Manager CRUD (RouterOS v6): uses /tool/user-manager/profile/limitation & profile-limitation paths + rolls back orphan limitation on failure', async () => {
    const mockV6 = createStrictMikroTikMock({ v6: true });

    await withTestServer(mockV6, async (baseUrl) => {
      const createRes = await fetch(`${baseUrl}/api/mikrotik/userman/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'UM6-Basic',
          owner: 'admin',
          price: 500,
          validity: '7d',
          startsAt: 'at-creation',
          rateLimit: '1M/4M'
        })
      });
      const createBody = await createRes.json();
      assert.equal(createRes.status, 200, `Userman v6 POST failed: ${JSON.stringify(createBody)}`);
      const createdProf = mockV6.umProfiles.find((p) => p.name === 'UM6-Basic');
      assert.ok(createdProf);
      assert.equal(createdProf.owner, 'admin');
      assert.equal(createdProf['starts-at'], 'create-and-activate');

      // Delete on v6
      const delRes = await fetch(`${baseUrl}/api/mikrotik/userman/profiles/UM6-Basic`, {
        method: 'DELETE'
      });
      assert.equal(delRes.status, 200);
      assert.equal(mockV6.umProfiles.some((p) => p.name === 'UM6-Basic'), false);
    });

    // Test orphan limitation rollback when profile/add fails
    const failingMock = createStrictMikroTikMock({ v6: false, failUsermanProfileAdd: true });
    await withTestServer(failingMock, async (baseUrl) => {
      const beforeLimCount = failingMock.umLimitations.length;
      const res = await fetch(`${baseUrl}/api/mikrotik/userman/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'UM-Fail-Rollback',
          rateLimit: '2M/4M'
        })
      });
      assert.equal(res.status, 500);
      assert.equal(
        failingMock.umLimitations.length,
        beforeLimCount,
        'Expected newly created limitation to be rolled back when profile creation fails'
      );
    });
  });
});
