import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { generateStandaloneVoucherHtmlAsync } from '../src/components/VoucherStudio/voucherHtmlGenerator.ts';

function createVoucherRouterMock(opts: {
  connected?: boolean;
  v6?: boolean;
  failOnCommand?: string | null;
} = {}) {
  const queries: Array<{ cmd: string; params: string[] }> = [];
  const state = {
    connected: opts.connected !== false,
    failOnCommand: opts.failOnCommand || null,
    hotspotUsers: [
      { '.id': '*H1', name: 'HS_CODE_1' },
      { '.id': '*H2', name: 'HS_CODE_2' }
    ],
    pppSecrets: [
      { '.id': '*P1', name: 'PPP_CODE_1' },
      { '.id': '*P2', name: 'PPP_CODE_2' }
    ],
    usermanUsers: [
      { '.id': '*U1', username: 'UM_CODE_1', name: 'UM_CODE_1' },
      { '.id': '*U2', username: 'UM_CODE_2', name: 'UM_CODE_2' }
    ]
  };

  const handle = async (cmd: string, params: string[] = []): Promise<any[]> => {
    queries.push({ cmd, params });
    if (state.failOnCommand && cmd === state.failOnCommand) {
      throw new Error(`Simulated failure on ${cmd}`);
    }

    if (cmd === '/ip/hotspot/user/print') {
      const nameFilter = params.find((p) => p.startsWith('?name='))?.slice(6);
      return nameFilter ? state.hotspotUsers.filter((u) => u.name === nameFilter) : state.hotspotUsers;
    }
    if (cmd === '/ppp/secret/print') {
      const nameFilter = params.find((p) => p.startsWith('?name='))?.slice(6);
      return nameFilter ? state.pppSecrets.filter((u) => u.name === nameFilter) : state.pppSecrets;
    }
    if (cmd === '/tool/user-manager/user/print' || cmd === '/user-manager/user/print') {
      const uFilter = params.find((p) => p.startsWith('?username=') || p.startsWith('?name='));
      if (uFilter) {
        const val = uFilter.split('=')[1];
        return state.usermanUsers.filter((u) => u.username === val || u.name === val);
      }
      return state.usermanUsers;
    }
    if (cmd === '/tool/user-manager/user/add' || cmd === '/user-manager/user/add') {
      const uname = params.find((p) => p.startsWith('=username=') || p.startsWith('=name='))?.split('=')[2] || 'CUSTOM';
      state.usermanUsers.push({ '.id': `*UN_${state.usermanUsers.length + 1}`, username: uname, name: uname });
      return [{ ret: `*UN_${state.usermanUsers.length}` }];
    }
    if (cmd.endsWith('/user/remove')) {
      const id = params.find((p) => p.startsWith('=.id='))?.slice(5);
      state.usermanUsers = state.usermanUsers.filter((u) => u['.id'] !== id);
      state.hotspotUsers = state.hotspotUsers.filter((u) => u['.id'] !== id);
      return [];
    }
    if (cmd === '/ip/hotspot/user/add') {
      return [{ ret: '*HN1' }];
    }
    if (cmd === '/ppp/secret/add') {
      return [{ ret: '*PN1' }];
    }
    return [];
  };

  return {
    queries,
    state,
    isConnected: () => state.connected,
    isV6: () => Boolean(opts.v6),
    query: handle,
    querySafe: handle
  };
}

describe('Voucher Studio E2E, Stress Performance (2,500+ Cards) & Multi-System Sync/Rollback', () => {
  let tempDir = '';
  let voucherDbModule: typeof import('../src/server/voucher-db.ts');
  let generateVouchersBatch: typeof import('../src/server/voucher-generator.ts').generateVouchersBatch;
  let removeVouchersFromRouter: typeof import('../src/server/voucher-sync.ts').removeVouchersFromRouter;
  let createVoucherRoutes: typeof import('../src/server/voucher-routes.ts').createVoucherRoutes;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-vstudio-test-'));
    process.env.ZCTRL_DATA_DIR = tempDir;

    voucherDbModule = await import('../src/server/voucher-db.ts');
    const genMod = await import('../src/server/voucher-generator.ts');
    generateVouchersBatch = genMod.generateVouchersBatch;
    const syncMod = await import('../src/server/voucher-sync.ts');
    removeVouchersFromRouter = syncMod.removeVouchersFromRouter;
    const routesMod = await import('../src/server/voucher-routes.ts');
    createVoucherRoutes = routesMod.createVoucherRoutes;
  });

  after(() => {
    try {
      voucherDbModule?.voucherDb?.close?.();
    } catch {}
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('generates 2,500 unique cryptographic vouchers cleanly without collisions across authModes', async () => {
    const start = performance.now();
    const res = await generateVouchersBatch({
      quantity: 2500,
      codeType: 'alphanumeric',
      codeLength: 7,
      passwordLength: 5,
      prefix: 'Z25_',
      profileName: 'VIP-1G',
      serviceType: 'HOTSPOT',
      authMode: 'user_pass',
      price: 500,
      timeLimit: '7d',
      dataLimit: '1 GB',
      autoSync: false
    });
    const elapsedMs = performance.now() - start;

    assert.equal(res.success, true);
    assert.equal(res.totalGenerated, 2500);
    assert.equal(res.vouchers?.length, 2500);

    const uniqueCodes = new Set(res.vouchers!.map((v) => v.voucherCode.toLowerCase()));
    assert.equal(uniqueCodes.size, 2500, 'Expected zero duplicate codes');
    assert.ok(res.vouchers![0].voucherPin && res.vouchers![0].voucherPin.length === 5);
    assert.ok(elapsedMs < 4000, `Expected 2,500 batch generation < 4000ms, took ${elapsedMs.toFixed(1)}ms`);

    voucherDbModule.voucherDb.deleteBatch(res.batchId);
  });

  it('removeVouchersFromRouter removes vouchers across HOTSPOT, PPPOE, USERMAN v6, and USERMAN v7 using bulk pre-fetch', async () => {
    const hsClient = createVoucherRouterMock();
    const hsRes = await removeVouchersFromRouter(hsClient, ['HS_CODE_1', 'HS_CODE_2'], 'HOTSPOT');
    assert.equal(hsRes.removed, 2);
    assert.equal(hsRes.failed, 0);
    assert.ok(hsClient.queries.some((q) => q.cmd === '/ip/hotspot/user/remove' && q.params.includes('=.id=*H1')));

    const pppClient = createVoucherRouterMock();
    const pppRes = await removeVouchersFromRouter(pppClient, ['PPP_CODE_1', 'PPP_CODE_2'], 'PPPOE');
    assert.equal(pppRes.removed, 2);
    assert.ok(pppClient.queries.some((q) => q.cmd === '/ppp/secret/remove' && q.params.includes('=.id=*P1')));

    const um6Client = createVoucherRouterMock({ v6: true });
    const um6Res = await removeVouchersFromRouter(um6Client, ['UM_CODE_1', 'UM_CODE_2'], 'USERMAN');
    assert.equal(um6Res.removed, 2);
    assert.ok(um6Client.queries.some((q) => q.cmd === '/tool/user-manager/user/print'));
    assert.ok(um6Client.queries.some((q) => q.cmd === '/tool/user-manager/user/remove' && q.params.includes('=.id=*U2')));

    const um7Client = createVoucherRouterMock({ v6: false });
    const um7Res = await removeVouchersFromRouter(um7Client, ['UM_CODE_1'], 'USERMAN');
    assert.equal(um7Res.removed, 1);
    assert.ok(um7Client.queries.some((q) => q.cmd === '/user-manager/user/print'));
    assert.ok(um7Client.queries.some((q) => q.cmd === '/user-manager/user/remove' && q.params.includes('=.id=*U1')));
  });

  it('VoucherDatabase getBatch and getAllBatches return both legacy and normalized count fields in sqlite & Fallback modes', () => {
    for (const forceFallback of [false, true]) {
      const subDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-vdb-norm-'));
      try {
        const db = new voucherDbModule.VoucherDatabase(subDir, { forceFallback });
        const now = new Date().toISOString();
        db.insertBatchTransaction(
          {
            batchId: 'B_NORM_1',
            profileName: 'PRO-5M',
            totalGenerated: 2,
            totalSynced: 0,
            createdAt: now,
            serviceType: 'HOTSPOT',
            price: 300
          },
          [
            {
              voucherId: 'V1',
              voucherCode: 'CODE_A1',
              voucherPin: '',
              batchId: 'B_NORM_1',
              price: 300,
              profileName: 'PRO-5M',
              timeLimit: '1d',
              serviceType: 'HOTSPOT',
              statusCd: 'ACTIVE',
              isSynced: false,
              createdAt: now
            },
            {
              voucherId: 'V2',
              voucherCode: 'CODE_A2',
              voucherPin: '',
              batchId: 'B_NORM_1',
              price: 300,
              profileName: 'PRO-5M',
              timeLimit: '1d',
              serviceType: 'HOTSPOT',
              statusCd: 'USED',
              isSynced: false,
              createdAt: now
            }
          ]
        );
        db.markVouchersSynced(['CODE_A1']);

        const single = db.getBatch('B_NORM_1');
        assert.ok(single);
        assert.equal(single.totalGenerated, 2);
        assert.equal(single.count, 2);
        assert.equal(single.totalSynced, 1);
        assert.equal(single.syncedCount, 1);
        assert.equal(single.activeCount, 1);
        assert.equal(single.usedCount, 1);

        const all = db.getAllBatches();
        assert.equal(all.length, 1);
        assert.equal(all[0].count, 2);
        assert.equal(all[0].syncedCount, 1);
        assert.equal(all[0].activeCount, 1);
        assert.equal(all[0].usedCount, 1);
        db.close();
      } finally {
        fs.rmSync(subDir, { recursive: true, force: true });
      }
    }
  });

  it('Voucher HTTP endpoints enforce offline guard, atomic rollback on injection error, 5k+ generation slice, price-map sync & router delete', async () => {
    const routerClient = createVoucherRouterMock({ v6: true, connected: false });
    const app = express();
    app.use(express.json());
    app.use(createVoucherRoutes(() => routerClient));

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    const cleanupBatches: string[] = [];

    try {
      // 1. Offline guard for custom voucher autoSync
      const offlineRes = await fetch(`${baseUrl}/api/vouchers/generate-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'CUST_OFFLINE',
          profileName: 'UM-PRO',
          serviceType: 'USERMAN',
          price: 900,
          autoSync: true
        })
      });
      assert.equal(offlineRes.status, 400);
      assert.equal(voucherDbModule.voucherDb.codeExists('CUST_OFFLINE'), false);

      // 2. Online mid-injection failure triggers full DB rollback & user cleanup, allowing immediate retry
      routerClient.state.connected = true;
      routerClient.state.failOnCommand = '/tool/user-manager/user/create-and-activate-profile';
      const failRes = await fetch(`${baseUrl}/api/vouchers/generate-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'CUST_RETRY',
          profileName: 'UM-PRO',
          serviceType: 'USERMAN',
          price: 950,
          timeLimit: '7d',
          dataLimit: '2 GB',
          autoSync: true
        })
      });
      assert.equal(failRes.status, 500);
      assert.equal(voucherDbModule.voucherDb.codeExists('CUST_RETRY'), false, 'Orphan voucher must be rolled back on failure');

      // Retry immediately with router fixed
      routerClient.state.failOnCommand = null;
      const okCustomRes = await fetch(`${baseUrl}/api/vouchers/generate-custom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'CUST_RETRY',
          profileName: 'UM-PRO',
          serviceType: 'USERMAN',
          price: 950,
          timeLimit: '7d',
          dataLimit: '2 GB',
          autoSync: true
        })
      });
      assert.equal(okCustomRes.status, 200);
      const customBody = await okCustomRes.json();
      assert.equal(customBody.success, true);
      assert.equal(customBody.voucher.isSynced, true);
      cleanupBatches.push(customBody.voucher.batchId);

      // Verify price-map reflects custom voucher
      const priceMapRes = await fetch(`${baseUrl}/api/vouchers/price-map`);
      assert.equal(priceMapRes.status, 200);
      const priceMapBody = await priceMapRes.json();
      assert.equal(priceMapBody.data['cust_retry']?.price, 950);

      // 3. Batch generation of 5,500 cards returns full array (no 5,000 truncation)
      const largeRes = await fetch(`${baseUrl}/api/vouchers/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: 5500,
          codeType: 'alphanumeric',
          codeLength: 8,
          profileName: 'VIP-BULK',
          serviceType: 'HOTSPOT',
          price: 200,
          autoSync: false
        })
      });
      assert.equal(largeRes.status, 200);
      const largeBody = await largeRes.json();
      assert.equal(largeBody.totalGenerated, 5500);
      assert.equal(largeBody.vouchers.length, 5500);
      cleanupBatches.push(largeBody.batchId);

      // Verify batches endpoint exposes count + syncedCount + activeCount
      const batchesRes = await fetch(`${baseUrl}/api/vouchers/batches`);
      assert.equal(batchesRes.status, 200);
      const batchesBody = await batchesRes.json();
      const foundCustomBatch = batchesBody.data.find((b: any) => b.batchId === customBody.voucher.batchId);
      assert.ok(foundCustomBatch);
      assert.equal(foundCustomBatch.count, 1);
      assert.equal(foundCustomBatch.syncedCount, 1);
      assert.equal(foundCustomBatch.activeCount, 1);

      // 4. Delete custom USERMAN batch with fromRouter=true calls Userman remove
      const delRes = await fetch(`${baseUrl}/api/vouchers/batch/${encodeURIComponent(customBody.voucher.batchId)}?fromRouter=true`, {
        method: 'DELETE'
      });
      assert.equal(delRes.status, 200);
      const delBody = await delRes.json();
      assert.equal(delBody.success, true);
      assert.equal(delBody.routerRemoval?.removed, 1);
      assert.ok(routerClient.queries.some((q) => q.cmd === '/tool/user-manager/user/remove'));
    } finally {
      for (const id of cleanupBatches) {
        try {
          voucherDbModule.voucherDb.deleteBatch(id);
        } catch {}
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('standalone printable HTML output includes functional saveAsPdf() and printVouchers() handlers', async () => {
    const html = await generateStandaloneVoucherHtmlAsync({
      vouchers: [
        {
          voucherId: '1',
          voucherCode: 'TEST1234',
          voucherPin: '9988',
          statusCd: 'ACTIVE',
          price: 500,
          profileName: 'VIP',
          timeLimit: '30d',
          dataLimit: '5 GB',
          createdAt: new Date().toISOString(),
          batchId: 'B1',
          serviceType: 'HOTSPOT',
          isSynced: false
        }
      ],
      design: {
        theme: 'modern',
        networkName: 'ZCtrl Test Net',
        currencySymbol: 'ريال',
        loginUrl: '10.0.0.1',
        columnsCount: 3,
        rowsCount: 7,
        showQr: true,
        authMode: 'user_pass'
      } as any,
      networkName: 'ZCtrl Test Net',
      currencySymbol: 'ريال',
      loginUrl: '10.0.0.1',
      showPin: true,
      showQr: true
    });

    assert.ok(html.includes('onclick="saveAsPdf()"'));
    assert.ok(html.includes('function saveAsPdf()'));
    assert.ok(html.includes('function printVouchers()'));
    assert.ok(html.includes('TEST1234'));
  });
});
