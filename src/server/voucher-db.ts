import fs from 'fs';
import path from 'path';
import type {
  VoucherItem,
  BatchInfo,
  DashboardStats,
  VoucherStatus
} from '../shared/voucher-types.ts';

interface SqliteStatement {
  run: (...params: any[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  all: (...params: any[]) => Record<string, any>[];
  get: (...params: any[]) => Record<string, any> | undefined;
}

interface SqliteDatabase {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatement;
  close: () => void;
}

/**
 * Built-in Synchronous ACID Fallback Engine for Electron 34 (Node 20) or Node < 22.5
 * where `node:sqlite` is not built into the binary.
 */
export class FallbackSqliteDatabase implements SqliteDatabase {
  private readonly filePath: string;
  private readonly legacyPath: string;
  private batches = new Map<string, Record<string, any>>();
  private vouchers = new Map<string, Record<string, any>>();
  private templates = new Map<string, Record<string, any>>();
  private kvStore = new Map<string, Record<string, any>>();
  private inTransaction = false;

  constructor(sqliteFilePath: string) {
    this.legacyPath = sqliteFilePath;
    this.filePath = sqliteFilePath.endsWith('.sqlite')
      ? sqliteFilePath.replace(/\.sqlite$/, '.fallback.json')
      : `${sqliteFilePath}.fallback.json`;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const target = fs.existsSync(this.filePath)
        ? this.filePath
        : fs.existsSync(this.legacyPath)
        ? this.legacyPath
        : null;
      if (target) {
        const raw = fs.readFileSync(target, 'utf-8').trim();
        if (raw.startsWith('{')) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.batches)) {
            for (const r of parsed.batches) this.batches.set(String(r.batch_id), r);
          }
          if (Array.isArray(parsed.vouchers)) {
            for (const r of parsed.vouchers) this.vouchers.set(String(r.code_lower), r);
          }
          if (Array.isArray(parsed.templates)) {
            for (const r of parsed.templates) this.templates.set(String(r.id), r);
          }
          if (Array.isArray(parsed.kvStore)) {
            for (const r of parsed.kvStore) this.kvStore.set(String(r.key), r);
          }
        }
      }
    } catch {}
  }

  private saveToDisk(): void {
    if (this.inTransaction) return;
    try {
      const payload = JSON.stringify({
        batches: Array.from(this.batches.values()),
        vouchers: Array.from(this.vouchers.values()),
        templates: Array.from(this.templates.values()),
        kvStore: Array.from(this.kvStore.values())
      });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, payload, 'utf-8');
      fs.renameSync(tmp, this.filePath);
    } catch {}
  }

  public exec(sql: string): void {
    const upper = sql.trim().toUpperCase();
    if (upper.startsWith('BEGIN')) {
      this.inTransaction = true;
    } else if (upper.startsWith('COMMIT')) {
      this.inTransaction = false;
      this.saveToDisk();
    } else if (upper.startsWith('ROLLBACK')) {
      this.inTransaction = false;
      this.loadFromDisk();
    } else if (upper.includes('WAL_CHECKPOINT') || upper.includes('VACUUM')) {
      this.saveToDisk();
    }
  }

  public close(): void {
    this.inTransaction = false;
    this.saveToDisk();
  }

  public prepare(sql: string): SqliteStatement {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const upper = norm.toUpperCase();

    return {
      run: (...params: any[]) => {
        let changes = 0;
        if (upper.startsWith('INSERT OR REPLACE INTO BATCHES')) {
          const [batch_id, profile_name, total_generated, total_synced, created_at, comment, service_type, price, prefix, meta_json] = params;
          this.batches.set(String(batch_id), {
            batch_id, profile_name, total_generated, total_synced, created_at, comment, service_type, price, prefix, meta_json
          });
          changes = 1;
        } else if (upper.startsWith('INSERT OR IGNORE INTO VOUCHERS')) {
          const [voucher_id, voucher_code, code_lower, voucher_pin, batch_id, price, profile_name, time_limit, data_limit, service_type, status_cd, is_synced, created_at, raw_json] = params;
          const key = String(code_lower);
          if (!this.vouchers.has(key)) {
            this.vouchers.set(key, {
              voucher_id, voucher_code, code_lower: key, voucher_pin, batch_id, price, profile_name, time_limit, data_limit, service_type, status_cd, is_synced, created_at, raw_json
            });
            changes = 1;
          }
        } else if (upper.startsWith('UPDATE VOUCHERS SET PROFILE_NAME')) {
          const [profile_name, raw_json, code_lower] = params;
          const row = this.vouchers.get(String(code_lower));
          if (row) {
            row.profile_name = profile_name;
            row.raw_json = raw_json;
            changes = 1;
          }
        } else if (upper.startsWith('UPDATE VOUCHERS SET IS_SYNCED = 1')) {
          const [code_lower] = params;
          const row = this.vouchers.get(String(code_lower));
          if (row && Number(row.is_synced) === 0) {
            row.is_synced = 1;
            changes = 1;
          }
        } else if (upper.startsWith('DELETE FROM VOUCHERS WHERE BATCH_ID')) {
          const [batch_id] = params;
          for (const [k, v] of this.vouchers.entries()) {
            if (v.batch_id === batch_id) {
              this.vouchers.delete(k);
              changes++;
            }
          }
        } else if (upper.startsWith('DELETE FROM BATCHES WHERE BATCH_ID')) {
          const [batch_id] = params;
          if (this.batches.delete(String(batch_id))) changes = 1;
        } else if (upper.startsWith('INSERT OR REPLACE INTO TEMPLATES')) {
          const [id, name, created_at, data_json] = params;
          this.templates.set(String(id), { id, name, created_at, data_json });
          changes = 1;
        } else if (upper.startsWith('DELETE FROM TEMPLATES WHERE ID')) {
          const [id] = params;
          if (this.templates.delete(String(id))) changes = 1;
        } else if (upper === 'DELETE FROM BATCHES') {
          changes = this.batches.size;
          this.batches.clear();
        } else if (upper === 'DELETE FROM VOUCHERS') {
          changes = this.vouchers.size;
          this.vouchers.clear();
        } else if (upper === 'DELETE FROM TEMPLATES') {
          changes = this.templates.size;
          this.templates.clear();
        } else if (upper === 'DELETE FROM KV_STORE') {
          changes = this.kvStore.size;
          this.kvStore.clear();
        } else if (upper.startsWith('DELETE FROM KV_STORE WHERE KEY = ?')) {
          if (this.kvStore.delete(String(params[0]))) changes = 1;
        } else if (upper.startsWith('INSERT OR REPLACE INTO KV_STORE')) {
          if (params.length === 1) {
            this.kvStore.set('current_design', { key: 'current_design', value_json: params[0] });
          } else {
            this.kvStore.set(String(params[0]), { key: String(params[0]), value_json: params[1] });
          }
          changes = 1;
        }
        this.saveToDisk();
        return { changes, lastInsertRowid: 0 };
      },
      get: (...params: any[]) => {
        if (upper.includes('FROM VOUCHERS WHERE CODE_LOWER = ? AND IS_SYNCED = 0')) {
          const row = this.vouchers.get(String(params[0]));
          return row && Number(row.is_synced) === 0 ? row : undefined;
        }
        const allRows = this.prepare(sql).all(...params);
        return allRows[0];
      },
      all: (...params: any[]) => {
        const allVouchers = Array.from(this.vouchers.values());
        const allBatches = Array.from(this.batches.values());

        if (upper.startsWith('SELECT CODE_LOWER, PRICE')) {
          return allVouchers;
        }
        if (upper.startsWith('SELECT 1 AS FOUND FROM VOUCHERS WHERE CODE_LOWER = ?')) {
          return this.vouchers.has(String(params[0])) ? [{ found: 1 }] : [];
        }
        if (upper.startsWith('SELECT * FROM VOUCHERS WHERE CODE_LOWER = ?')) {
          const r = this.vouchers.get(String(params[0]));
          return r ? [r] : [];
        }
        if (upper.includes('SUM(CASE WHEN STATUS_CD = \'ACTIVE\'') && upper.includes('WHERE BATCH_ID = ?')) {
          const bId = params[0];
          const matching = allVouchers.filter((v) => v.batch_id === bId);
          return [{
            total: matching.length,
            synced: matching.filter((v) => Number(v.is_synced) === 1).length,
            active_cnt: matching.filter((v) => String(v.status_cd || 'ACTIVE').toUpperCase() === 'ACTIVE').length,
            used_cnt: matching.filter((v) => String(v.status_cd || '').toUpperCase() === 'USED').length
          }];
        }
        if (upper.includes('COUNT(*) AS TOTAL') && upper.includes('WHERE BATCH_ID = ?')) {
          const bId = params[0];
          const matching = allVouchers.filter((v) => v.batch_id === bId);
          return [{
            total: matching.length,
            synced: matching.filter((v) => Number(v.is_synced) === 1).length
          }];
        }
        if (upper.startsWith('SELECT META_JSON, TOTAL_GENERATED, TOTAL_SYNCED FROM BATCHES WHERE BATCH_ID = ?')) {
          const b = this.batches.get(String(params[0]));
          return b ? [b] : [];
        }
        if (upper.includes('FROM VOUCHERS GROUP BY BATCH_ID')) {
          const grouped = new Map<string, { batch_id: string; total: number; synced: number; active_cnt: number; used_cnt: number }>();
          for (const v of allVouchers) {
            const bId = String(v.batch_id || '');
            let entry = grouped.get(bId);
            if (!entry) {
              entry = { batch_id: bId, total: 0, synced: 0, active_cnt: 0, used_cnt: 0 };
              grouped.set(bId, entry);
            }
            entry.total++;
            if (Number(v.is_synced) === 1) entry.synced++;
            if (String(v.status_cd || 'ACTIVE').toUpperCase() === 'ACTIVE') entry.active_cnt++;
            else if (String(v.status_cd || '').toUpperCase() === 'USED') entry.used_cnt++;
          }
          return Array.from(grouped.values());
        }
        if (upper.startsWith('SELECT META_JSON, TOTAL_GENERATED, TOTAL_SYNCED FROM BATCHES ORDER BY')) {
          return allBatches.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        }
        if (upper.startsWith('SELECT * FROM VOUCHERS WHERE BATCH_ID = ?')) {
          return allVouchers
            .filter((v) => v.batch_id === params[0])
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        }
        if (upper.includes('FROM BATCHES B INNER JOIN VOUCHERS V')) {
          const statsByBatch = new Map<string, { total: number; synced: number }>();
          for (const v of allVouchers) {
            const bId = String(v.batch_id || '');
            let entry = statsByBatch.get(bId);
            if (!entry) {
              entry = { total: 0, synced: 0 };
              statsByBatch.set(bId, entry);
            }
            entry.total++;
            if (Number(v.is_synced) === 1) entry.synced++;
          }
          return allBatches
            .map((b): Record<string, any> => {
              const st = statsByBatch.get(String(b.batch_id || '')) || { total: 0, synced: 0 };
              return { ...b, total_cards: st.total, synced_cards: st.synced };
            })
            .filter((b) => b.total_cards > b.synced_cards)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        }
        if (upper.includes('TOTAL_REV') && upper.includes('SYNCED_REV')) {
          const todayPrefix = String(params[0] || '').replace('%', '');
          let total_rev = 0, synced_rev = 0, unsynced_rev = 0, used_rev = 0, today_rev = 0;
          for (const v of allVouchers) {
            const p = Number(v.price) || 0;
            total_rev += p;
            if (Number(v.is_synced) === 1) synced_rev += p;
            else unsynced_rev += p;
            if (v.status_cd === 'USED') used_rev += p;
            if (todayPrefix && String(v.created_at).startsWith(todayPrefix)) today_rev += p;
          }
          return [{
            total_count: allVouchers.length,
            total_rev,
            synced_rev,
            unsynced_rev,
            used_rev,
            today_rev
          }];
        }
        if (upper.includes('GROUP BY PROF')) {
          const groups = new Map<string, { prof: string; cnt: number; total_val: number; unit_price: number; synced_cnt: number }>();
          for (const v of allVouchers) {
            const prof = String(v.profile_name || '').trim() || 'Default';
            const g = groups.get(prof) || { prof, cnt: 0, total_val: 0, unit_price: 0, synced_cnt: 0 };
            const p = Number(v.price) || 0;
            g.cnt++;
            g.total_val += p;
            if (p > g.unit_price) g.unit_price = p;
            if (Number(v.is_synced) === 1) g.synced_cnt++;
            groups.set(prof, g);
          }
          return Array.from(groups.values());
        }
        if (upper.includes('ACTIVE_CNT') && upper.includes('USED_CNT')) {
          return [{
            total: allVouchers.length,
            active_cnt: allVouchers.filter((v) => v.status_cd === 'ACTIVE').length,
            used_cnt: allVouchers.filter((v) => v.status_cd === 'USED').length,
            synced_cnt: allVouchers.filter((v) => Number(v.is_synced) === 1).length,
            unsynced_cnt: allVouchers.filter((v) => Number(v.is_synced) === 0).length
          }];
        }
        if (upper === 'SELECT COUNT(*) AS CNT FROM BATCHES') {
          return [{ cnt: allBatches.length }];
        }
        if (upper.startsWith('SELECT COUNT(*) AS CNT FROM VOUCHERS') || upper.startsWith('SELECT * FROM VOUCHERS')) {
          const isCount = upper.startsWith('SELECT COUNT(*)');
          let filtered = allVouchers;
          let idx = 0;
          if (upper.includes('BATCH_ID = ?')) {
            const bId = params[idx++];
            filtered = filtered.filter((v) => v.batch_id === bId);
          }
          if (upper.includes('STATUS_CD = ?')) {
            const st = params[idx++];
            filtered = filtered.filter((v) => v.status_cd === st);
          }
          if (upper.includes('CODE_LOWER LIKE ?')) {
            const q = String(params[idx] || '').replace(/%/g, '').toLowerCase();
            idx += 3;
            filtered = filtered.filter(
              (v) =>
                String(v.code_lower || '').includes(q) ||
                String(v.voucher_pin || '').toLowerCase().includes(q) ||
                String(v.profile_name || '').toLowerCase().includes(q)
            );
          }
          if (isCount) {
            return [{ cnt: filtered.length }];
          }
          if (!upper.includes('LIMIT ?')) {
            return filtered.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
          }
          const limit = Number(params[idx++]) || 50;
          const offset = Number(params[idx++]) || 0;
          return filtered
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(offset, offset + limit);
        }
        if (upper.startsWith('SELECT * FROM BATCHES')) {
          return allBatches.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        }
        if (upper.startsWith('SELECT * FROM TEMPLATES')) {
          return Array.from(this.templates.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        }
        if (upper.startsWith('SELECT DATA_JSON FROM TEMPLATES')) {
          return Array.from(this.templates.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        }
        if (upper.startsWith('SELECT KEY, VALUE_JSON FROM KV_STORE')) {
          return Array.from(this.kvStore.values());
        }
        if (upper.startsWith('SELECT VALUE_JSON FROM KV_STORE WHERE KEY = ?')) {
          const kv = this.kvStore.get(String(params[0] || ''));
          return kv ? [kv] : [];
        }
        if (upper.startsWith('SELECT VALUE_JSON FROM KV_STORE')) {
          const kv = this.kvStore.get('current_design');
          return kv ? [kv] : [];
        }
        return [];
      }
    };
  }
}

function openSqliteOrFallback(sqliteFile: string, forceFallback = false): { db: SqliteDatabase; isFallback: boolean } {
  if (!forceFallback) {
    try {
      let mod: any = null;
      if (typeof (process as any).getBuiltinModule === 'function') {
        mod = (process as any).getBuiltinModule('node:sqlite');
      }
      if (!mod && typeof require === 'function') {
        mod = require('node:sqlite');
      }
      if (mod && typeof mod.DatabaseSync === 'function') {
        return { db: new mod.DatabaseSync(sqliteFile) as unknown as SqliteDatabase, isFallback: false };
      }
    } catch {}
  }
  return { db: new FallbackSqliteDatabase(sqliteFile), isFallback: true };
}

export class VoucherDatabase {
  private readonly dataDir: string;
  private readonly sqliteFile: string;
  private readonly sqliteBackupFile: string;
  private readonly fallbackFile: string;
  private db: SqliteDatabase;
  private isFallbackEngine: boolean = false;
  private cachedPriceMap: Record<string, any> | null = null;

  constructor(customDataDir?: string, options?: { forceFallback?: boolean }) {
    this.dataDir = customDataDir || process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
    this.sqliteFile = path.join(this.dataDir, 'vouchers.sqlite');
    this.sqliteBackupFile = path.join(this.dataDir, 'vouchers.sqlite.bak');
    this.fallbackFile = path.join(this.dataDir, 'vouchers.fallback.json');

    if (!fs.existsSync(this.dataDir)) {
      try {
        fs.mkdirSync(this.dataDir, { recursive: true });
      } catch {}
    }

    const forceFallback = Boolean(options?.forceFallback);
    const hadStorageFile = fs.existsSync(this.sqliteFile) || fs.existsSync(this.fallbackFile);
    try {
      const opened = openSqliteOrFallback(this.sqliteFile, forceFallback);
      this.db = opened.db;
      this.isFallbackEngine = opened.isFallback;
      this.ensureSchema();
    } catch (err) {
      console.warn('[VoucherDB] Failed to open primary SQLite file, trying backup:', err);
      if (fs.existsSync(this.sqliteBackupFile)) {
        try {
          fs.copyFileSync(this.sqliteBackupFile, this.sqliteFile);
          const reopened = openSqliteOrFallback(this.sqliteFile, forceFallback);
          this.db = reopened.db;
          this.isFallbackEngine = reopened.isFallback;
          this.ensureSchema();
        } catch {
          this.db = new FallbackSqliteDatabase(this.sqliteFile);
          this.isFallbackEngine = true;
          this.ensureSchema();
        }
      } else {
        this.db = new FallbackSqliteDatabase(this.sqliteFile);
        this.isFallbackEngine = true;
        this.ensureSchema();
      }
    }

    if (!hadStorageFile) {
      this.migrateLegacyJsonIfPresent();
    }
  }

  private ensureSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS batches (
        batch_id TEXT PRIMARY KEY,
        profile_name TEXT NOT NULL DEFAULT 'default',
        total_generated INTEGER NOT NULL DEFAULT 0,
        total_synced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        comment TEXT DEFAULT '',
        service_type TEXT NOT NULL DEFAULT 'HOTSPOT',
        price REAL NOT NULL DEFAULT 0,
        prefix TEXT DEFAULT '',
        meta_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS vouchers (
        voucher_id TEXT PRIMARY KEY,
        voucher_code TEXT NOT NULL,
        code_lower TEXT NOT NULL UNIQUE,
        voucher_pin TEXT NOT NULL DEFAULT '',
        batch_id TEXT NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        profile_name TEXT NOT NULL DEFAULT 'default',
        time_limit TEXT DEFAULT '',
        data_limit TEXT DEFAULT '',
        service_type TEXT NOT NULL DEFAULT 'HOTSPOT',
        status_cd TEXT NOT NULL DEFAULT 'ACTIVE',
        is_synced INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        raw_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vouchers_code_lower ON vouchers(code_lower);
      CREATE INDEX IF NOT EXISTS idx_vouchers_batch_id ON vouchers(batch_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_batch_created ON vouchers(batch_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_vouchers_status_cd ON vouchers(status_cd);
      CREATE INDEX IF NOT EXISTS idx_vouchers_is_synced ON vouchers(is_synced);
      CREATE INDEX IF NOT EXISTS idx_vouchers_created_at ON vouchers(created_at DESC);

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        data_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `);
  }

  private migrateLegacyJsonIfPresent(): void {
    const legacyDbFile = path.join(this.dataDir, 'vouchers_store.json');
    const legacyBatchesDir = path.join(this.dataDir, 'batches');
    const legacyTemplatesFile = path.join(this.dataDir, 'templates_store.json');
    const legacyDesignFile = path.join(this.dataDir, 'current_design.json');

    let migratedAny = false;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Legacy batches & embedded vouchers
      if (fs.existsSync(legacyDbFile)) {
        try {
          const raw = fs.readFileSync(legacyDbFile, 'utf-8').trim();
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed.batches)) {
              for (const b of parsed.batches as BatchInfo[]) {
                if (!b?.batchId) continue;
                this.upsertBatchRow(b);
                migratedAny = true;
              }
            }
            if (Array.isArray(parsed.vouchers)) {
              for (const v of parsed.vouchers as VoucherItem[]) {
                if (!v?.voucherCode) continue;
                this.insertVoucherRowIgnore(v);
                migratedAny = true;
              }
            }
          }
        } catch (err) {
          console.warn('[VoucherDB] Legacy vouchers_store.json migration warning:', err);
        }
      }

      // 2. Per-batch JSON files
      if (fs.existsSync(legacyBatchesDir)) {
        const files = fs.readdirSync(legacyBatchesDir);
        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          try {
            const content = fs.readFileSync(path.join(legacyBatchesDir, file), 'utf-8').trim();
            if (!content) continue;
            const vouchers: VoucherItem[] = JSON.parse(content);
            if (Array.isArray(vouchers)) {
              for (const v of vouchers) {
                if (!v?.voucherCode) continue;
                this.insertVoucherRowIgnore(v);
                migratedAny = true;
              }
            }
          } catch (e) {
            console.warn(`[VoucherDB] Migration error for batch file ${file}:`, e);
          }
        }
      }

      // 3. Templates JSON
      if (fs.existsSync(legacyTemplatesFile)) {
        try {
          const templates = JSON.parse(fs.readFileSync(legacyTemplatesFile, 'utf-8'));
          if (Array.isArray(templates)) {
            const stmt = this.db.prepare(
              'INSERT OR REPLACE INTO templates (id, name, created_at, data_json) VALUES (?, ?, ?, ?)'
            );
            for (const t of templates) {
              if (!t?.id) continue;
              stmt.run(
                String(t.id),
                String(t.name || 'Template'),
                String(t.createdAt || new Date().toISOString()),
                JSON.stringify(t)
              );
              migratedAny = true;
            }
          }
        } catch {}
      }

      // 4. Current Design JSON
      if (fs.existsSync(legacyDesignFile)) {
        try {
          const designRaw = fs.readFileSync(legacyDesignFile, 'utf-8').trim();
          if (designRaw) {
            this.db
              .prepare('INSERT OR REPLACE INTO kv_store (key, value_json) VALUES (?, ?)')
              .run('current_design', designRaw);
            migratedAny = true;
          }
        } catch {}
      }

      this.db.exec('COMMIT;');
      if (migratedAny) {
        this.flushToDiskSync();
      }
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      console.error('[VoucherDB] Legacy JSON migration failed:', err);
    }
  }

  private upsertBatchRow(b: BatchInfo): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO batches
          (batch_id, profile_name, total_generated, total_synced, created_at, comment, service_type, price, prefix, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(b.batchId),
        String(b.profileName || 'default'),
        Number(b.totalGenerated) || 0,
        Number(b.totalSynced) || 0,
        String(b.createdAt || new Date().toISOString()),
        String(b.comment || ''),
        String(b.serviceType || 'HOTSPOT'),
        Number(b.price) || 0,
        String(b.prefix || ''),
        JSON.stringify(b)
      );
  }

  private insertVoucherRowIgnore(v: VoucherItem): boolean {
    const code = String(v.voucherCode || '').trim();
    if (!code) return false;
    const codeLower = code.toLowerCase();
    const res = this.db
      .prepare(
        `INSERT OR IGNORE INTO vouchers
          (voucher_id, voucher_code, code_lower, voucher_pin, batch_id, price, profile_name, time_limit, data_limit, service_type, status_cd, is_synced, created_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        String(v.voucherId || `v-${codeLower}`),
        code,
        codeLower,
        String(v.voucherPin || ''),
        String(v.batchId || ''),
        Number(v.price) || 0,
        String(v.profileName || 'default'),
        String(v.timeLimit || ''),
        String(v.dataLimit || ''),
        String(v.serviceType || 'HOTSPOT'),
        String(v.statusCd || 'ACTIVE'),
        v.isSynced ? 1 : 0,
        String(v.createdAt || new Date().toISOString()),
        JSON.stringify(v)
      );
    return Number(res.changes) > 0;
  }

  private rowToVoucher(row: Record<string, any>): VoucherItem {
    if (row.raw_json) {
      try {
        const parsed = JSON.parse(String(row.raw_json));
        parsed.isSynced = Boolean(row.is_synced);
        parsed.profileName = String(row.profile_name || parsed.profileName || 'default');
        parsed.statusCd = (row.status_cd || parsed.statusCd || 'ACTIVE') as VoucherStatus;
        return parsed;
      } catch {}
    }
    return {
      voucherId: String(row.voucher_id),
      voucherCode: String(row.voucher_code),
      voucherPin: String(row.voucher_pin || ''),
      batchId: String(row.batch_id),
      price: Number(row.price) || 0,
      profileName: String(row.profile_name || 'default'),
      timeLimit: row.time_limit ? String(row.time_limit) : undefined,
      dataLimit: row.data_limit ? String(row.data_limit) : undefined,
      serviceType: (row.service_type || 'HOTSPOT') as any,
      statusCd: (row.status_cd || 'ACTIVE') as VoucherStatus,
      isSynced: Boolean(row.is_synced),
      createdAt: String(row.created_at)
    };
  }

  private queryObjects(sql: string, params: any[] = []): Record<string, any>[] {
    return this.db.prepare(sql).all(...params);
  }

  public scheduleSave(): void {
    // Native SQLite WAL commits directly to disk; no deferred memory export required
  }

  public flushToDiskSync(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      if (!this.isFallbackEngine && fs.existsSync(this.sqliteFile)) {
        fs.copyFileSync(this.sqliteFile, this.sqliteBackupFile);
      }
    } catch {}
  }

  public async flushToDisk(): Promise<void> {
    this.flushToDiskSync();
  }

  public close(): void {
    try {
      this.flushToDiskSync();
      this.db.close();
    } catch {}
  }

  public getPriceMap(): Record<string, {
    price: number;
    batchId?: string;
    isSynced?: boolean;
    profileName?: string;
    timeLimit?: string;
    dataLimit?: string;
    serviceType?: string;
    createdAt?: string;
  }> {
    if (this.cachedPriceMap) {
      return this.cachedPriceMap;
    }
    const rows = this.queryObjects(
      'SELECT code_lower, price, batch_id, is_synced, profile_name, time_limit, data_limit, service_type, created_at FROM vouchers'
    );
    const map: Record<string, any> = {};
    for (const r of rows) {
      map[String(r.code_lower)] = {
        price: Number(r.price) || 0,
        batchId: String(r.batch_id || ''),
        isSynced: Boolean(r.is_synced),
        profileName: String(r.profile_name || ''),
        timeLimit: String(r.time_limit || ''),
        dataLimit: String(r.data_limit || ''),
        serviceType: String(r.service_type || ''),
        createdAt: String(r.created_at || '')
      };
    }
    this.cachedPriceMap = map;
    return map;
  }

  public codeExists(code: string): boolean {
    if (!code) return false;
    const rows = this.queryObjects('SELECT 1 AS found FROM vouchers WHERE code_lower = ? LIMIT 1', [
      code.toLowerCase()
    ]);
    return rows.length > 0;
  }

  public getVoucherByCode(code: string): VoucherItem | undefined {
    if (!code) return undefined;
    const rows = this.queryObjects('SELECT * FROM vouchers WHERE code_lower = ? LIMIT 1', [
      code.toLowerCase()
    ]);
    if (rows.length === 0) return undefined;
    return this.rowToVoucher(rows[0]);
  }

  public updateVoucherProfile(code: string, newProfile: string): boolean {
    if (!code || !newProfile) return false;
    const existing = this.getVoucherByCode(code);
    if (!existing) return false;
    existing.profileName = newProfile;
    const res = this.db
      .prepare('UPDATE vouchers SET profile_name = ?, raw_json = ? WHERE code_lower = ?')
      .run(newProfile, JSON.stringify(existing), code.toLowerCase());
    const updated = Number(res.changes) > 0;
    if (updated) {
      this.cachedPriceMap = null;
    }
    return updated;
  }

  public insertBatchTransaction(
    batchInfo: BatchInfo,
    vouchers: VoucherItem[]
  ): { inserted: number; skipped: number } {
    let inserted = 0;
    let skipped = 0;

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const insertStmt = this.db.prepare(
        `INSERT OR IGNORE INTO vouchers
          (voucher_id, voucher_code, code_lower, voucher_pin, batch_id, price, profile_name, time_limit, data_limit, service_type, status_cd, is_synced, created_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const v of vouchers) {
        const code = String(v.voucherCode || '').trim();
        if (!code) {
          skipped++;
          continue;
        }
        const codeLower = code.toLowerCase();
        const res = insertStmt.run(
          String(v.voucherId || `v-${codeLower}`),
          code,
          codeLower,
          String(v.voucherPin || ''),
          String(v.batchId || batchInfo.batchId),
          Number(v.price) || 0,
          String(v.profileName || batchInfo.profileName || 'default'),
          String(v.timeLimit || ''),
          String(v.dataLimit || ''),
          String(v.serviceType || batchInfo.serviceType || 'HOTSPOT'),
          String(v.statusCd || 'ACTIVE'),
          v.isSynced ? 1 : 0,
          String(v.createdAt || new Date().toISOString()),
          JSON.stringify(v)
        );
        if (Number(res.changes) > 0) {
          inserted++;
        } else {
          skipped++;
        }
      }

      const countRows = this.queryObjects(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced FROM vouchers WHERE batch_id = ?',
        [batchInfo.batchId]
      );
      batchInfo.totalGenerated = Number(countRows[0]?.total ?? inserted) || inserted;
      batchInfo.totalSynced = Number(countRows[0]?.synced ?? 0) || 0;
      this.upsertBatchRow(batchInfo);

      this.db.exec('COMMIT;');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }

    this.cachedPriceMap = null;
    return { inserted, skipped };
  }

  public getBatch(batchId: string): BatchInfo | undefined {
    const rows = this.queryObjects('SELECT meta_json, total_generated, total_synced FROM batches WHERE batch_id = ? LIMIT 1', [
      batchId
    ]);
    if (rows.length === 0) return undefined;
    try {
      const meta = JSON.parse(String(rows[0].meta_json));
      const aggRows = this.queryObjects(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced, SUM(CASE WHEN status_cd = 'ACTIVE' THEN 1 ELSE 0 END) AS active_cnt, SUM(CASE WHEN status_cd = 'USED' THEN 1 ELSE 0 END) AS used_cnt FROM vouchers WHERE batch_id = ?",
        [batchId]
      );
      const agg = aggRows[0];
      const total = agg ? Number(agg.total) || 0 : (Number(rows[0].total_generated) || meta.totalGenerated || 0);
      const synced = agg ? Number(agg.synced) || 0 : (Number(rows[0].total_synced) || 0);
      const activeCount = agg ? Number(agg.active_cnt) || 0 : total;
      const usedCount = agg ? Number(agg.used_cnt) || 0 : 0;
      meta.totalGenerated = total;
      meta.totalSynced = synced;
      meta.count = total;
      meta.syncedCount = synced;
      meta.activeCount = activeCount;
      meta.usedCount = usedCount;
      return meta;
    } catch {
      return undefined;
    }
  }

  public getAllBatches(): BatchInfo[] {
    const rows = this.queryObjects(
      'SELECT meta_json, total_generated, total_synced FROM batches ORDER BY created_at DESC'
    );
    const aggRows = this.queryObjects(
      "SELECT batch_id, COUNT(*) AS total, SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced, SUM(CASE WHEN status_cd = 'ACTIVE' THEN 1 ELSE 0 END) AS active_cnt, SUM(CASE WHEN status_cd = 'USED' THEN 1 ELSE 0 END) AS used_cnt FROM vouchers GROUP BY batch_id"
    );
    const aggByBatch = new Map<string, { total: number; synced: number; active: number; used: number }>();
    for (const ar of aggRows) {
      aggByBatch.set(String(ar.batch_id || ''), {
        total: Number(ar.total) || 0,
        synced: Number(ar.synced) || 0,
        active: Number(ar.active_cnt) || 0,
        used: Number(ar.used_cnt) || 0
      });
    }

    return rows
      .map((r) => {
        try {
          const b = JSON.parse(String(r.meta_json));
          const agg = aggByBatch.get(String(b.batchId || ''));
          const total = agg ? agg.total : (Number(r.total_generated) || b.totalGenerated || 0);
          const synced = agg ? agg.synced : (Number(r.total_synced) || 0);
          const activeCount = agg ? agg.active : total;
          const usedCount = agg ? agg.used : 0;
          b.totalGenerated = total;
          b.totalSynced = synced;
          b.count = total;
          b.syncedCount = synced;
          b.activeCount = activeCount;
          b.usedCount = usedCount;
          return b as BatchInfo;
        } catch {
          return null;
        }
      })
      .filter((b): b is BatchInfo => Boolean(b));
  }

  public getVouchersByBatch(batchId: string): VoucherItem[] {
    const rows = this.queryObjects('SELECT * FROM vouchers WHERE batch_id = ? ORDER BY created_at DESC', [
      batchId
    ]);
    return rows.map((r) => this.rowToVoucher(r));
  }

  public getResumableBatches(): Array<{
    batchId: string;
    comment?: string;
    profileName: string;
    serviceType: string;
    totalCards: number;
    syncedCards: number;
    unsyncedCards: number;
    createdAt: string;
  }> {
    const rows = this.queryObjects(`
      SELECT
        b.batch_id,
        b.comment,
        b.profile_name,
        b.service_type,
        b.created_at,
        COUNT(v.voucher_id) AS total_cards,
        SUM(CASE WHEN v.is_synced = 1 THEN 1 ELSE 0 END) AS synced_cards
      FROM batches b
      INNER JOIN vouchers v ON v.batch_id = b.batch_id
      GROUP BY b.batch_id
      HAVING COUNT(v.voucher_id) > SUM(CASE WHEN v.is_synced = 1 THEN 1 ELSE 0 END)
      ORDER BY b.created_at DESC
    `);

    return rows.map((r) => {
      const totalCards = Number(r.total_cards) || 0;
      const syncedCards = Number(r.synced_cards) || 0;
      return {
        batchId: String(r.batch_id),
        comment: r.comment ? String(r.comment) : undefined,
        profileName: String(r.profile_name || 'default'),
        serviceType: String(r.service_type || 'HOTSPOT'),
        totalCards,
        syncedCards,
        unsyncedCards: Math.max(0, totalCards - syncedCards),
        createdAt: String(r.created_at)
      };
    });
  }

  public getPaginatedVouchers(params: {
    page?: number;
    limit?: number;
    batchId?: string;
    status?: VoucherStatus;
    search?: string;
  }): { vouchers: VoucherItem[]; page: number; totalPages: number; totalCount: number } {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(500, Math.max(1, params.limit || 50));

    const whereClauses: string[] = [];
    const bindParams: any[] = [];

    if (params.batchId) {
      whereClauses.push('batch_id = ?');
      bindParams.push(params.batchId);
    }
    if (params.status) {
      whereClauses.push('status_cd = ?');
      bindParams.push(params.status);
    }
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereClauses.push('(code_lower LIKE ? OR LOWER(voucher_pin) LIKE ? OR LOWER(profile_name) LIKE ?)');
      bindParams.push(q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countRows = this.queryObjects(`SELECT COUNT(*) AS cnt FROM vouchers ${whereSql}`, bindParams);
    const totalCount = Number(countRows[0]?.cnt) || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const offset = (page - 1) * limit;

    const dataRows = this.queryObjects(
      `SELECT * FROM vouchers ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...bindParams, limit, offset]
    );

    return {
      vouchers: dataRows.map((r) => this.rowToVoucher(r)),
      page,
      totalPages,
      totalCount
    };
  }

  public markVouchersSynced(voucherCodes: string[]): void {
    if (!Array.isArray(voucherCodes) || voucherCodes.length === 0) return;
    const touchedBatches = new Set<string>();

    this.db.exec('BEGIN TRANSACTION;');
    try {
      const findStmt = this.db.prepare('SELECT batch_id FROM vouchers WHERE code_lower = ? AND is_synced = 0 LIMIT 1');
      const updateStmt = this.db.prepare('UPDATE vouchers SET is_synced = 1 WHERE code_lower = ? AND is_synced = 0');

      for (const code of voucherCodes) {
        const key = String(code || '').toLowerCase();
        if (!key) continue;
        const found = findStmt.get(key);
        if (found?.batch_id) {
          touchedBatches.add(String(found.batch_id));
        }
        updateStmt.run(key);
      }

      this.db.exec('COMMIT;');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }

    for (const batchId of touchedBatches) {
      this.refreshBatchCounts(batchId);
    }

    if (touchedBatches.size > 0) {
      this.cachedPriceMap = null;
    }
  }

  public refreshBatchCounts(batchId: string): void {
    const batch = this.getBatch(batchId);
    if (!batch) return;

    const rows = this.queryObjects(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced FROM vouchers WHERE batch_id = ?',
      [batchId]
    );
    const total = Number(rows[0]?.total) || 0;
    const synced = Number(rows[0]?.synced) || 0;
    batch.totalGenerated = total;
    batch.totalSynced = synced;
    this.upsertBatchRow(batch);
  }

  public deleteBatch(batchId: string): number {
    let deletedCount = 0;
    this.db.exec('BEGIN TRANSACTION;');
    try {
      const res = this.db.prepare('DELETE FROM vouchers WHERE batch_id = ?').run(batchId);
      deletedCount = Number(res.changes) || 0;
      this.db.prepare('DELETE FROM batches WHERE batch_id = ?').run(batchId);
      this.db.exec('COMMIT;');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }

    // Clean up legacy batch file if it exists
    try {
      const legacyFile = path.join(this.dataDir, 'batches', `${batchId}.json`);
      if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile);
    } catch {}

    this.cachedPriceMap = null;
    return deletedCount;
  }

  public getFinancialSummary() {
    const todayPrefix = `${new Date().toISOString().slice(0, 10)}%`;
    const totalsRows = this.queryObjects(
      `SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(price), 0) AS total_rev,
        COALESCE(SUM(CASE WHEN is_synced = 1 THEN price ELSE 0 END), 0) AS synced_rev,
        COALESCE(SUM(CASE WHEN is_synced = 0 THEN price ELSE 0 END), 0) AS unsynced_rev,
        COALESCE(SUM(CASE WHEN status_cd = 'USED' THEN price ELSE 0 END), 0) AS used_rev,
        COALESCE(SUM(CASE WHEN created_at LIKE ? THEN price ELSE 0 END), 0) AS today_rev
       FROM vouchers`,
      [todayPrefix]
    );

    const totals = totalsRows[0] || {};
    const profileRows = this.queryObjects(`
      SELECT
        COALESCE(NULLIF(profile_name, ''), 'Default') AS prof,
        COUNT(*) AS cnt,
        COALESCE(SUM(price), 0) AS total_val,
        MAX(price) AS unit_price,
        SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced_cnt
      FROM vouchers
      GROUP BY prof
    `);

    const profileBreakdown: Record<string, { count: number; totalValue: number; price: number; synced: number }> = {};
    for (const r of profileRows) {
      profileBreakdown[String(r.prof)] = {
        count: Number(r.cnt) || 0,
        totalValue: Number(r.total_val) || 0,
        price: Number(r.unit_price) || 0,
        synced: Number(r.synced_cnt) || 0
      };
    }

    const batchesBreakdown = this.getAllBatches().map((b) => {
      const price = Number(b.price) || 0;
      const count = b.totalGenerated || 0;
      return {
        batchId: b.batchId,
        comment: b.comment || '',
        profileName: b.profileName || '',
        price,
        totalGenerated: count,
        totalSynced: b.totalSynced || 0,
        totalValue: price * count,
        createdAt: b.createdAt
      };
    });

    return {
      totalRevenue: Number(totals.total_rev) || 0,
      syncedRevenue: Number(totals.synced_rev) || 0,
      unsyncedRevenue: Number(totals.unsynced_rev) || 0,
      usedRevenue: Number(totals.used_rev) || 0,
      todayRevenue: Number(totals.today_rev) || 0,
      totalVouchersCount: Number(totals.total_count) || 0,
      totalBatchesCount: batchesBreakdown.length,
      profileBreakdown,
      batchesBreakdown
    };
  }

  public getDashboardStats(): DashboardStats {
    const vRows = this.queryObjects(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status_cd = 'ACTIVE' THEN 1 ELSE 0 END) AS active_cnt,
        SUM(CASE WHEN status_cd = 'USED' THEN 1 ELSE 0 END) AS used_cnt,
        SUM(CASE WHEN is_synced = 1 THEN 1 ELSE 0 END) AS synced_cnt,
        SUM(CASE WHEN is_synced = 0 THEN 1 ELSE 0 END) AS unsynced_cnt
      FROM vouchers
    `);
    const bRows = this.queryObjects('SELECT COUNT(*) AS cnt FROM batches');
    const r = vRows[0] || {};

    let size = 0;
    try {
      const targetFile = this.isFallbackEngine ? this.fallbackFile : this.sqliteFile;
      if (fs.existsSync(targetFile)) {
        size = fs.statSync(targetFile).size;
      }
    } catch {}

    return {
      totalVouchers: Number(r.total) || 0,
      activeVouchers: Number(r.active_cnt) || 0,
      usedVouchers: Number(r.used_cnt) || 0,
      syncedVouchers: Number(r.synced_cnt) || 0,
      unsyncedVouchers: Number(r.unsynced_cnt) || 0,
      totalBatches: Number(bRows[0]?.cnt) || 0,
      routersCount: 1,
      databaseSizeBytes: size
    };
  }

  public vacuum(): { beforeSizeBytes: number; afterSizeBytes: number; savedBytes: number } {
    this.flushToDiskSync();
    const targetFile = this.isFallbackEngine ? this.fallbackFile : this.sqliteFile;
    let before = 0;
    try {
      if (fs.existsSync(targetFile)) before = fs.statSync(targetFile).size;
    } catch {}

    this.db.exec('VACUUM;');
    this.flushToDiskSync();

    let after = 0;
    try {
      if (fs.existsSync(targetFile)) after = fs.statSync(targetFile).size;
    } catch {}

    return {
      beforeSizeBytes: before,
      afterSizeBytes: after,
      savedBytes: Math.max(0, before - after)
    };
  }

  // ==========================================
  // TEMPLATES & DESIGN STORE (SQLITE BACKED)
  // ==========================================
  public getAllTemplates(): any[] {
    const rows = this.queryObjects('SELECT data_json FROM templates ORDER BY created_at DESC');
    const result: any[] = [];
    for (const r of rows) {
      try {
        result.push(JSON.parse(String(r.data_json)));
      } catch {}
    }
    return result;
  }

  public saveTemplate(template: any): any[] {
    this.db
      .prepare('INSERT OR REPLACE INTO templates (id, name, created_at, data_json) VALUES (?, ?, ?, ?)')
      .run(
        String(template.id),
        String(template.name || 'Template'),
        String(template.createdAt || new Date().toISOString()),
        JSON.stringify(template)
      );
    return this.getAllTemplates();
  }

  public deleteTemplate(id: string): any[] {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(String(id));
    return this.getAllTemplates();
  }

  public getCurrentDesign(): any | null {
    const rows = this.queryObjects("SELECT value_json FROM kv_store WHERE key = 'current_design' LIMIT 1");
    if (rows.length === 0) return null;
    try {
      return JSON.parse(String(rows[0].value_json));
    } catch {
      return null;
    }
  }

  public saveCurrentDesign(design: any): void {
    this.db
      .prepare("INSERT OR REPLACE INTO kv_store (key, value_json) VALUES ('current_design', ?)")
      .run(JSON.stringify(design));
  }

  // ==========================================
  // DURABLE PROFILE METADATA MIRROR (KV_STORE)
  // Prevents losing Price/Validity/Quota if WinBox wipes on-login
  // ==========================================
  private buildProfileMetaKey(serviceType: 'hotspot' | 'ppp' | 'userman', profileName: string, host?: string): string {
    const safeHost = String(host || 'default').trim().toLowerCase().replace(/[^a-z0-9.:_-]/g, '').slice(0, 64) || 'default';
    const safeName = String(profileName || '').trim().toLowerCase().slice(0, 128);
    return `profile_meta:${safeHost}:${serviceType}:${safeName}`;
  }

  public saveProfileMetadata(
    serviceType: 'hotspot' | 'ppp' | 'userman',
    profileName: string,
    meta: {
      price?: number;
      validity?: string;
      validityDays?: number;
      dataQuotaMb?: number;
      startsAt?: 'first-login' | 'at-creation';
      sharedUsers?: number;
    },
    host?: string
  ): void {
    const cleanName = String(profileName || '').trim();
    if (!cleanName) return;
    const payload = {
      price: Number.isFinite(Number(meta.price)) ? Math.max(0, Number(meta.price)) : 0,
      validity: String(meta.validity || '').trim().slice(0, 48),
      validityDays: Number.isFinite(Number(meta.validityDays)) ? Math.max(0, Number(meta.validityDays)) : 0,
      dataQuotaMb: Number.isFinite(Number(meta.dataQuotaMb)) ? Math.max(0, Number(meta.dataQuotaMb)) : 0,
      startsAt: meta.startsAt === 'at-creation' ? 'at-creation' : 'first-login',
      sharedUsers: Number.isFinite(Number(meta.sharedUsers)) && Number(meta.sharedUsers) > 0 ? Math.floor(Number(meta.sharedUsers)) : 1,
      updatedAt: new Date().toISOString()
    };
    const serialized = JSON.stringify(payload);
    // Store under both router-specific key and default fallback key so reads work even without host context
    const specificKey = this.buildProfileMetaKey(serviceType, cleanName, host);
    const defaultKey = this.buildProfileMetaKey(serviceType, cleanName, 'default');
    const stmt = this.db.prepare('INSERT OR REPLACE INTO kv_store (key, value_json) VALUES (?, ?)');
    stmt.run(specificKey, serialized);
    if (specificKey !== defaultKey) {
      stmt.run(defaultKey, serialized);
    }
  }

  public getProfileMetadata(
    serviceType: 'hotspot' | 'ppp' | 'userman',
    profileName: string,
    host?: string
  ): {
    price: number;
    validity: string;
    validityDays: number;
    dataQuotaMb: number;
    startsAt: 'first-login' | 'at-creation';
    sharedUsers: number;
  } | null {
    const cleanName = String(profileName || '').trim();
    if (!cleanName) return null;
    const keysToTry = [this.buildProfileMetaKey(serviceType, cleanName, host)];
    const defaultKey = this.buildProfileMetaKey(serviceType, cleanName, 'default');
    if (keysToTry[0] !== defaultKey) keysToTry.push(defaultKey);

    for (const key of keysToTry) {
      try {
        const rows = this.queryObjects('SELECT VALUE_JSON FROM kv_store WHERE key = ? LIMIT 1', [key]);
        const rawVal = rows[0]?.value_json ?? rows[0]?.VALUE_JSON;
        if (rawVal) {
          const parsed = JSON.parse(String(rawVal));
          if (parsed && typeof parsed === 'object') {
            return {
              price: Number(parsed.price) || 0,
              validity: String(parsed.validity || ''),
              validityDays: Number(parsed.validityDays) || 0,
              dataQuotaMb: Number(parsed.dataQuotaMb) || 0,
              startsAt: parsed.startsAt === 'at-creation' ? 'at-creation' : 'first-login',
              sharedUsers: Number(parsed.sharedUsers) || 1
            };
          }
        }
      } catch {}
    }
    return null;
  }

  public deleteProfileMetadata(serviceType: 'hotspot' | 'ppp' | 'userman', profileName: string, host?: string): void {
    const cleanName = String(profileName || '').trim();
    if (!cleanName) return;
    const stmt = this.db.prepare('DELETE FROM kv_store WHERE key = ?');
    stmt.run(this.buildProfileMetaKey(serviceType, cleanName, host));
    stmt.run(this.buildProfileMetaKey(serviceType, cleanName, 'default'));
  }

  // ==========================================
  // PORTABLE DATABASE SNAPSHOT (EXPORT / IMPORT)
  // Enables full backup & cross-PC transfer safely
  // ==========================================
  public exportSnapshot() {
    const batches = this.queryObjects('SELECT * FROM batches ORDER BY created_at DESC');
    const vouchers = this.queryObjects('SELECT * FROM vouchers ORDER BY created_at DESC');
    const templates = this.queryObjects('SELECT * FROM templates ORDER BY created_at DESC');
    const kvStore = this.queryObjects('SELECT key, value_json FROM kv_store');

    return {
      schemaVersion: 2,
      app: 'ZCtrl',
      engine: this.isFallbackEngine ? 'fallback-json' : 'node-sqlite',
      exportedAt: new Date().toISOString(),
      counts: {
        batches: batches.length,
        vouchers: vouchers.length,
        templates: templates.length,
        kvStore: kvStore.length
      },
      data: {
        batches,
        vouchers,
        templates,
        kvStore
      }
    };
  }

  public importSnapshot(
    snapshot: any,
    mode: 'merge' | 'replace' = 'merge'
  ): {
    mode: 'merge' | 'replace';
    importedBatches: number;
    importedVouchers: number;
    importedTemplates: number;
    importedKv: number;
  } {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.data || typeof snapshot.data !== 'object') {
      throw new Error('ملف النسخة الاحتياطية غير صالح أو لا يحتوي على بنية ZCtrl الصحيحة');
    }

    const batches = Array.isArray(snapshot.data.batches) ? snapshot.data.batches : [];
    const vouchers = Array.isArray(snapshot.data.vouchers) ? snapshot.data.vouchers : [];
    const templates = Array.isArray(snapshot.data.templates) ? snapshot.data.templates : [];
    const kvStore = Array.isArray(snapshot.data.kvStore) ? snapshot.data.kvStore : [];

    // Strict input bounds to prevent DoS / memory exhaustion from malformed uploads
    if (batches.length > 2000) throw new Error('تجاوز عدد الدفعات الحد المسموح به للاستيراد (2,000 دفعة)');
    if (vouchers.length > 50000) throw new Error('تجاوز عدد الكروت الحد المسموح به للاستيراد (50,000 كرت)');
    if (templates.length > 200) throw new Error('تجاوز عدد القوالب الحد المسموح به للاستيراد (200 قالب)');
    if (kvStore.length > 1000) throw new Error('تجاوز عدد إعدادات النظام الحد المسموح به للاستيراد (1,000 مفتاح)');

    const safeMode: 'merge' | 'replace' = mode === 'replace' ? 'replace' : 'merge';
    let importedBatches = 0;
    let importedVouchers = 0;
    let importedTemplates = 0;
    let importedKv = 0;

    this.db.exec('BEGIN;');
    try {
      if (safeMode === 'replace') {
        this.db.prepare('DELETE FROM vouchers').run();
        this.db.prepare('DELETE FROM batches').run();
        this.db.prepare('DELETE FROM templates').run();
        this.db.prepare('DELETE FROM kv_store').run();
      }

      const batchStmt = this.db.prepare(`
        INSERT OR REPLACE INTO batches (
          batch_id, profile_name, total_generated, total_synced, created_at,
          comment, service_type, price, prefix, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const b of batches) {
        if (!b || typeof b !== 'object' || !b.batch_id) continue;
        batchStmt.run(
          String(b.batch_id).slice(0, 128),
          String(b.profile_name || 'default').slice(0, 128),
          Math.max(0, Number(b.total_generated) || 0),
          Math.max(0, Number(b.total_synced) || 0),
          String(b.created_at || new Date().toISOString()).slice(0, 64),
          String(b.comment || '').slice(0, 500),
          String(b.service_type || 'HOTSPOT').slice(0, 32),
          Math.max(0, Number(b.price) || 0),
          String(b.prefix || '').slice(0, 64),
          typeof b.meta_json === 'string' ? b.meta_json : JSON.stringify(b)
        );
        importedBatches++;
      }

      const voucherStmt = this.db.prepare(`
        INSERT OR IGNORE INTO vouchers (
          voucher_id, voucher_code, code_lower, voucher_pin, batch_id, price,
          profile_name, time_limit, data_limit, service_type, status_cd,
          is_synced, created_at, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of vouchers) {
        if (!v || typeof v !== 'object' || !v.voucher_code) continue;
        const code = String(v.voucher_code).trim().slice(0, 128);
        if (!code) continue;
        const createdAt = String(v.created_at || new Date().toISOString()).slice(0, 64);
        const isSyncedNum = Number(v.is_synced) === 1 || v.is_synced === true ? 1 : 0;
        const rawJson =
          typeof v.raw_json === 'string' && v.raw_json.trim()
            ? v.raw_json
            : JSON.stringify({
                voucherId: String(v.voucher_id || `imp-${Date.now()}-${importedVouchers}`).slice(0, 128),
                voucherCode: code,
                voucherPin: String(v.voucher_pin ?? '').slice(0, 128),
                batchId: String(v.batch_id || 'IMPORTED').slice(0, 128),
                price: Math.max(0, Number(v.price) || 0),
                profileName: String(v.profile_name || 'default').slice(0, 128),
                timeLimit: String(v.time_limit ?? '').slice(0, 64),
                dataLimit: String(v.data_limit ?? '').slice(0, 64),
                serviceType: String(v.service_type || 'HOTSPOT').slice(0, 32),
                statusCd: String(v.status_cd || 'ACTIVE').slice(0, 32),
                isSynced: isSyncedNum === 1,
                createdAt
              });
        const res = voucherStmt.run(
          String(v.voucher_id || `imp-${Date.now()}-${importedVouchers}`).slice(0, 128),
          code,
          String(v.code_lower || code.toLowerCase()).slice(0, 128),
          String(v.voucher_pin ?? '').slice(0, 128),
          String(v.batch_id || 'IMPORTED').slice(0, 128),
          Math.max(0, Number(v.price) || 0),
          String(v.profile_name || 'default').slice(0, 128),
          String(v.time_limit ?? '').slice(0, 64),
          String(v.data_limit ?? '').slice(0, 64),
          String(v.service_type || 'HOTSPOT').slice(0, 32),
          String(v.status_cd || 'ACTIVE').slice(0, 32),
          isSyncedNum,
          createdAt,
          rawJson
        );
        if (res.changes > 0) importedVouchers++;
      }

      const tplStmt = this.db.prepare(
        'INSERT OR REPLACE INTO templates (id, name, created_at, data_json) VALUES (?, ?, ?, ?)'
      );
      for (const t of templates) {
        if (!t || typeof t !== 'object' || !t.id) continue;
        tplStmt.run(
          String(t.id).slice(0, 128),
          String(t.name || 'Template').slice(0, 128),
          String(t.created_at || new Date().toISOString()).slice(0, 64),
          typeof t.data_json === 'string' ? t.data_json : JSON.stringify(t)
        );
        importedTemplates++;
      }

      const kvStmt = this.db.prepare('INSERT OR REPLACE INTO kv_store (key, value_json) VALUES (?, ?)');
      for (const kv of kvStore) {
        if (!kv || typeof kv !== 'object' || !kv.key) continue;
        const safeKey = String(kv.key).trim().slice(0, 160);
        if (!safeKey) continue;
        const safeVal = typeof kv.value_json === 'string' ? kv.value_json : JSON.stringify(kv.value_json ?? null);
        kvStmt.run(safeKey, safeVal);
        importedKv++;
      }

      this.db.exec('COMMIT;');
      this.cachedPriceMap = null;
      this.flushToDiskSync();
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }

    return {
      mode: safeMode,
      importedBatches,
      importedVouchers,
      importedTemplates,
      importedKv
    };
  }
}

export const voucherDb = new VoucherDatabase();
