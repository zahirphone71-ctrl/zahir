import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { CliBuilder } from '../src/server/routeros/CliBuilder.ts';
import { RouterProfileController } from '../src/server/controllers/RouterProfileController.ts';
import { securityConfig } from '../src/server/security-shield.ts';

interface RecordedQuery {
  cmd: string;
  params: string[];
}

function createMockRouterClient(opts: {
  connected?: boolean;
  v6?: boolean;
  hotspotProfiles?: any[];
  pppProfiles?: any[];
  usermanProfiles?: any[];
  usermanLimitations?: any[];
  usermanLinks?: any[];
} = {}) {
  const queries: RecordedQuery[] = [];
  const state = {
    hotspotProfiles: opts.hotspotProfiles || [
      {
        '.id': '*10',
        name: 'VIP-2M',
        'rate-limit': '1M/2M',
        'shared-users': '2',
        'on-login': '# ZCtrl|Price:500|Validity:30d|DataQuotaMb:2048|StartsAt:at-creation|SharedUsers:2\n:log info "hello"',
        comment: '# ZCtrl|Price:500|Validity:30d|DataQuotaMb:2048|StartsAt:at-creation|SharedUsers:2'
      }
    ],
    pppProfiles: opts.pppProfiles || [
      {
        '.id': '*20',
        name: 'PPP-GOLD',
        'rate-limit': '5M/10M',
        'only-one': 'no',
        'on-up': '# ZCtrl|Price:1500|Validity:30d|DataQuotaMb:10240|StartsAt:at-creation|SharedUsers:3\n:log info "ppp-up"',
        comment: '# ZCtrl|Price:1500|Validity:30d|DataQuotaMb:10240|StartsAt:at-creation|SharedUsers:3'
      }
    ],
    usermanProfiles: opts.usermanProfiles || [
      {
        '.id': '*30',
        name: 'UM-PRO',
        'name-for-users': 'UM-PRO',
        price: '800',
        validity: '7d',
        'starts-at': 'at-creation',
        'override-shared-users': '2',
        comment: '# ZCtrl|Price:800|Validity:7d|StartsAt:at-creation|OverrideSharedUsers:2|RateLimit:2M/4M'
      }
    ],
    usermanLimitations: opts.usermanLimitations || [
      { '.id': '*40', name: 'Lim-UM-PRO' }
    ],
    usermanLinks: opts.usermanLinks || [
      { '.id': '*50', profile: 'UM-PRO', limitation: 'Lim-UM-PRO' }
    ]
  };

  const handleQuery = async (cmd: string, params: string[] = []): Promise<any[]> => {
    queries.push({ cmd, params });

    if (cmd === '/system/resource/print') {
      return [{ 'cpu-load': '12', 'free-memory': String(128 * 1024 * 1024) }];
    }
    const nameParam = params.find((p) => p.startsWith('?name='))?.slice(6);
    if (cmd === '/ip/hotspot/user/profile/print') {
      return nameParam ? state.hotspotProfiles.filter((p) => p.name === nameParam) : state.hotspotProfiles;
    }
    if (cmd === '/ppp/profile/print') {
      return nameParam ? state.pppProfiles.filter((p) => p.name === nameParam) : state.pppProfiles;
    }
    if (cmd === '/user-manager/profile/print' || cmd === '/tool/user-manager/profile/print') {
      return nameParam ? state.usermanProfiles.filter((p) => p.name === nameParam) : state.usermanProfiles;
    }
    if (cmd === '/user-manager/profile-limitation/print' || cmd === '/tool/user-manager/profile-limitation/print' || cmd === '/tool/user-manager/profile/profile-limitation/print') {
      return state.usermanLinks;
    }
    if (cmd === '/user-manager/limitation/print' || cmd === '/tool/user-manager/limitation/print' || cmd === '/tool/user-manager/profile/limitation/print') {
      return state.usermanLimitations;
    }
    if (cmd.endsWith('/add')) {
      return [{ ret: '*99' }];
    }
    return [];
  };

  return {
    queries,
    isConnected: () => opts.connected !== false,
    isV6: () => Boolean(opts.v6),
    getHealth: async () => ({ cpuLoad: 12, freeMemory: 128 * 1024 * 1024 }),
    ensureConnected: async () => {},
    query: handleQuery,
    querySafe: handleQuery
  };
}

function createMockRes() {
  const result: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const res: any = {
    status(code: number) {
      result.statusCode = code;
      return res;
    },
    json(data: any) {
      result.body = data;
      return res;
    }
  };
  return { res, result };
}

describe('Profiles, Queues, CliBuilder & Cross-Router Profile Operations', () => {
  let tempDir = '';
  let createSubscribersRoutes: () => express.Router;
  let voucherDbInstance: any;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-prof-test-'));
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

  it('CliBuilder strips burst/priority suffixes cleanly when building Userman rate limits', () => {
    const { profile, limitation, link } = CliBuilder.buildUsermanPayloads(
      {
        name: 'BurstPlan',
        rateLimit: '2M/5M 4M/10M 1M/3M 10s/10s 8 512k/1M',
        rateLimitMin: '512k/1M 1M/2M 256k/512k 5s/5s 8',
        transferLimitMb: 2048,
        uptimeLimit: '1d',
        validity: '30d',
        price: 1000,
        weekdays: ['friday', 'saturday', 'monday']
      },
      true
    );

    assert.equal(limitation['rate-limit-rx'], '2M');
    assert.equal(limitation['rate-limit-tx'], '5M');
    assert.equal(limitation['rate-limit-min-rx'], '512k');
    assert.equal(limitation['rate-limit-min-tx'], '1M');
    assert.equal(limitation['transfer-limit'], String(2048 * 1024 * 1024));
    assert.equal(profile['override-shared-users'], '1');
    assert.equal(link.weekdays, 'saturday,monday,friday');
  });

  it('CliBuilder preserves ZCtrl metadata header in Hotspot (on-login, never comment) and PPP profile payloads', () => {
    const hs = CliBuilder.buildHotspotProfilePayload({
      name: 'HS-VIP',
      rateLimit: '4M/8M 8M/16M 2M/4M 10s/10s 8 1M/2M',
      sharedUsers: 2,
      startsAt: 'at-creation',
      price: 750,
      validity: '14d',
      dataQuotaMb: 4096,
      onLoginScript: ':log info "custom-hs"'
    });
    assert.equal(hs['rate-limit'], '4M/8M 8M/16M 2M/4M 10s/10s 8 1M/2M');
    assert.equal(hs.comment, undefined, 'Hotspot user profiles must NOT send comment attribute');
    assert.ok(hs['on-login'].includes('Price:750'));
    assert.ok(hs['on-login'].includes('DataQuotaMb:4096'));
    assert.ok(hs['on-login'].includes(':log info "custom-hs"'));

    const ppp = CliBuilder.buildPppProfilePayload({
      name: 'PPP-FIBER',
      rateLimit: '10M/50M',
      sharedUsers: 4,
      startsAt: 'at-creation',
      price: 3000,
      validity: '30d',
      dataQuotaMb: 50000,
      onUpScript: ':log info "custom-ppp"'
    });
    assert.equal(ppp['only-one'], 'no');
    assert.ok(ppp.comment.includes('SharedUsers:4'));
    assert.ok(ppp['on-up'].includes(':log info "custom-ppp"'));
  });

  it('RouterProfileController enforces strictTenantIsolation, default-encryption protection, and serviceType validation', async () => {
    const prevStrict = securityConfig.strictTenantIsolation;
    securityConfig.strictTenantIsolation = true;
    try {
      const { res: resIsolated, result: isolatedOut } = createMockRes();
      await RouterProfileController.create(
        { body: { serviceType: 'hotspot', profileData: { name: 'P1' } } } as any,
        resIsolated
      );
      assert.equal(isolatedOut.statusCode, 401);
    } finally {
      securityConfig.strictTenantIsolation = prevStrict;
    }

    const client = createMockRouterClient();
    const mockReqBase: any = { routerClient: client, ip: '127.0.0.1', headers: {} };

    // Protect default & default-encryption by name (never block custom .id=*1)
    for (const protectedName of ['default', 'default-encryption']) {
      const { res, result } = createMockRes();
      await RouterProfileController.delete(
        { ...mockReqBase, body: { serviceType: 'pppoe', profileName: protectedName } },
        res
      );
      assert.equal(result.statusCode, 400);
    }

    // Reject unknown serviceType cleanly on create / update / delete
    for (const fn of [RouterProfileController.create, RouterProfileController.update]) {
      const { res, result } = createMockRes();
      await fn(
        { ...mockReqBase, body: { serviceType: 'unknown_proto', profileData: { name: 'X' } } },
        res
      );
      assert.equal(result.statusCode, 400);
    }
    const { res: delRes, result: delOut } = createMockRes();
    await RouterProfileController.delete(
      { ...mockReqBase, body: { serviceType: 'unknown_proto', profileName: 'X' } },
      delRes
    );
    assert.equal(delOut.statusCode, 400);
  });

  it('Partial PUT updates for Hotspot, PPP, and Userman profiles preserve existing metadata & scripts without overwriting with defaults', async () => {
    const clientV6 = createMockRouterClient({ v6: true });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.routerClient = clientV6 as any;
      next();
    });
    app.use(createSubscribersRoutes());

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Hotspot partial PUT (only updates rateLimit)
      const hsRes = await fetch(`${baseUrl}/api/mikrotik/hotspot/profiles/VIP-2M`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'VIP-2M', rateLimit: '4M/8M' })
      });
      assert.equal(hsRes.status, 200);
      const hsSet = clientV6.queries.find((q) => q.cmd === '/ip/hotspot/user/profile/set');
      assert.ok(hsSet, 'Expected /ip/hotspot/user/profile/set call');
      assert.equal(
        hsSet.params.some((p) => p.startsWith('=comment=')),
        false,
        'Hotspot /set must NOT send =comment= parameter'
      );
      const hsOnLogin = hsSet.params.find((p) => p.startsWith('=on-login=')) || '';
      assert.ok(hsOnLogin.includes('Price:500'), `Expected Price:500 preserved in on-login, got ${hsOnLogin}`);
      assert.ok(hsOnLogin.includes('Validity:30d'), `Expected Validity:30d preserved in on-login, got ${hsOnLogin}`);
      assert.ok(hsOnLogin.includes('DataQuotaMb:2048'), `Expected DataQuotaMb:2048 preserved in on-login, got ${hsOnLogin}`);
      assert.ok(hsOnLogin.includes('StartsAt:at-creation'), `Expected StartsAt preserved in on-login, got ${hsOnLogin}`);
      assert.ok(hsOnLogin.includes(':log info "hello"'), 'Expected existing onLoginScript preserved');

      // 2. PPP partial PUT (only updates rateLimit)
      const pppRes = await fetch(`${baseUrl}/api/mikrotik/ppp/profiles/PPP-GOLD`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'PPP-GOLD', rateLimit: '10M/20M' })
      });
      assert.equal(pppRes.status, 200);
      const pppSet = clientV6.queries.find((q) => q.cmd === '/ppp/profile/set');
      assert.ok(pppSet, 'Expected /ppp/profile/set call');
      const pppComment = pppSet.params.find((p) => p.startsWith('=comment=')) || '';
      const pppOnUp = pppSet.params.find((p) => p.startsWith('=on-up=')) || '';
      assert.ok(pppComment.includes('Price:1500'), `Expected Price:1500 preserved, got ${pppComment}`);
      assert.ok(pppComment.includes('DataQuotaMb:10240'), `Expected DataQuotaMb:10240 preserved, got ${pppComment}`);
      assert.ok(pppComment.includes('SharedUsers:3'), `Expected SharedUsers:3 preserved, got ${pppComment}`);
      assert.ok(pppOnUp.includes(':log info "ppp-up"'), 'Expected existing onUpScript preserved');

      // 3. Userman partial PUT with burst rateLimit (RouterOS v6 paths)
      const umRes = await fetch(`${baseUrl}/api/mikrotik/userman/profiles/UM-PRO`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'UM-PRO', rateLimit: '3M/6M 6M/12M 2M/4M 10s/10s 8' })
      });
      assert.equal(umRes.status, 200);
      const umProfSet = clientV6.queries.find((q) => q.cmd === '/tool/user-manager/profile/set');
      const umLimSet = clientV6.queries.find((q) => q.cmd === '/tool/user-manager/profile/limitation/set');
      assert.ok(umProfSet, 'Expected /tool/user-manager/profile/set call');
      assert.ok(umLimSet, 'Expected /tool/user-manager/profile/limitation/set call');
      assert.ok(umLimSet.params.includes('=rate-limit-rx=3000000'), 'Expected stripped rx rate 3000000 bps');
      assert.ok(umLimSet.params.includes('=rate-limit-tx=6000000'), 'Expected stripped tx rate 6000000 bps');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('POST /api/mikrotik/hotspot/cards/generate handles Userman v6/v7 profile activation and price resolution correctly', async () => {
    for (const v6 of [true, false]) {
      const client = createMockRouterClient({ v6 });
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.routerClient = client as any;
        next();
      });
      app.use(createSubscribersRoutes());

      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as any).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/mikrotik/hotspot/cards/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: 3,
            profile: 'UM-PRO',
            serviceType: 'USERMAN',
            prefix: v6 ? 'UM6' : 'UM7',
            length: 5
          })
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.users.length, 3);
        const mirroredVouchers = voucherDbInstance.getVouchersByBatch(body.batchId);
        assert.equal(mirroredVouchers.length, 3);
        assert.equal(mirroredVouchers[0].price, 800);
        voucherDbInstance.deleteBatch(body.batchId);

        if (v6) {
          const activateCalls = client.queries.filter((q) => q.cmd === '/tool/user-manager/user/create-and-activate-profile');
          assert.equal(activateCalls.length, 3);
          assert.ok(activateCalls[0].params.includes('=customer=admin'));
          assert.ok(activateCalls[0].params.includes('=profile=UM-PRO'));
        } else {
          const profileAddCalls = client.queries.filter((q) => q.cmd === '/user-manager/user-profile/add');
          assert.equal(profileAddCalls.length, 3);
          assert.ok(profileAddCalls[0].params.includes('=profile=UM-PRO'));
        }
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  });
});
