import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { VoucherDatabase } from '../src/server/voucher-db.ts';
import type { BatchInfo, VoucherItem } from '../src/shared/voucher-types.ts';

function runDatabaseSuite(forceFallback: boolean) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zctrl-sqlite-test-'));
  try {
    const db = new VoucherDatabase(tempDir, { forceFallback });

    const batchId = 'BATCH_TEST_001';
    const now = new Date().toISOString();
    const batchInfo: BatchInfo = {
      batchId,
      profileName: 'VIP-10M',
      totalGenerated: 3,
      totalSynced: 0,
      createdAt: now,
      comment: 'اختبار SQLite',
      serviceType: 'HOTSPOT',
      price: 500,
      prefix: ''
    };

    const vouchers: VoucherItem[] = ['111222', '333444', '555666'].map((code, idx) => ({
      voucherId: `V_${idx}`,
      voucherCode: code,
      voucherPin: code,
      batchId,
      price: 500,
      profileName: 'VIP-10M',
      timeLimit: '1d',
      dataLimit: '2GB',
      serviceType: 'HOTSPOT',
      statusCd: 'ACTIVE',
      isSynced: false,
      createdAt: now
    }));

    const res = db.insertBatchTransaction(batchInfo, vouchers);
    assert.equal(res.inserted, 3);
    assert.equal(res.skipped, 0);

    assert.equal(db.codeExists('111222'), true);
    assert.equal(db.codeExists('999999'), false);
    assert.equal(db.getVouchersByBatch(batchId).length, 3);
    assert.equal(db.getResumableBatches().length, 1);

    // Test search & pagination
    const page1 = db.getPaginatedVouchers({ page: 1, limit: 2, search: '333' });
    assert.equal(page1.totalCount, 1);
    assert.equal(page1.vouchers[0].voucherCode, '333444');

    // Test profile update
    assert.equal(db.updateVoucherProfile('555666', 'GOLD-20M'), true);
    assert.equal(db.getVoucherByCode('555666')?.profileName, 'GOLD-20M');

    // Mark 2 vouchers as synced by code
    db.markVouchersSynced(['111222', '333444']);
    db.flushToDiskSync();

    const stats = db.getDashboardStats();
    assert.equal(stats.totalVouchers, 3);
    assert.equal(stats.syncedVouchers, 2);
    assert.equal(stats.unsyncedVouchers, 1);
    assert.ok(stats.databaseSizeBytes > 0);

    const fin = db.getFinancialSummary();
    assert.equal(fin.totalRevenue, 1500);
    assert.equal(fin.syncedRevenue, 1000);
    assert.equal(fin.unsyncedRevenue, 500);

    // Templates & design persistence
    db.saveTemplate({ id: 'tpl-1', name: 'Test Card', createdAt: now });
    assert.equal(db.getAllTemplates().length, 1);
    db.saveCurrentDesign({ theme: 'midnight' });
    assert.deepEqual(db.getCurrentDesign(), { theme: 'midnight' });

    db.close();

    // Re-open from persisted storage on disk
    const dbReloaded = new VoucherDatabase(tempDir, { forceFallback });
    assert.equal(dbReloaded.getVouchersByBatch(batchId).length, 3);
    assert.equal(dbReloaded.getDashboardStats().syncedVouchers, 2);
    assert.equal(dbReloaded.getAllTemplates().length, 1);
    assert.deepEqual(dbReloaded.getCurrentDesign(), { theme: 'midnight' });

    // Delete batch cleanup
    assert.equal(dbReloaded.deleteBatch(batchId), 3);
    assert.equal(dbReloaded.getDashboardStats().totalVouchers, 0);
    dbReloaded.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe('SQLite & Fallback Voucher Database Engine', () => {
  it('executes ACID batch insert, indexed queries, sync status updates, and persists with native node:sqlite', () => {
    runDatabaseSuite(false);
  });

  it('executes full parity ACID operations and disk persistence with Electron FallbackSqliteDatabase', () => {
    runDatabaseSuite(true);
  });
});
