// ============================================================
// مخزن بيانات الاعتماد المشفر وإدارة الجلسات
// Credential Vault with AES-256-GCM, CBC Migration & Atomic 0o600 Writes
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.ts';
import { encryptSecret, decryptSecret } from '../security-shield.ts';
import { writeJsonAtomic } from '../tlsPinStore.ts';
import type { VendorSession, VendorConnectConfig } from './vendors/types.ts';

interface VaultEntry {
  id: string;
  mac: string;
  ip: string;
  vendor: string;
  model?: string;
  username: string;
  encPass: string;
  iv?: string; // Only present on legacy CBC records prior to auto-migration
  port: number;
  useHttps: boolean;
  lastTestResult?: string;
  lastTestedAt?: string;
  createdAt: string;
}

interface VaultSessionEntry {
  session: VendorSession;
  vendorHandler: string;
}

export class CredentialVault {
  private readonly vaultDir: string;
  private readonly vaultFile: string;
  private readonly legacyKey?: string;
  private entries = new Map<string, VaultEntry>();
  private sessions = new Map<string, VaultSessionEntry>();
  private persistTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(customDataDir?: string, options?: { legacyCbcKey?: string }) {
    this.vaultDir = customDataDir || process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
    this.vaultFile = path.join(this.vaultDir, 'ap_vault.json');
    this.legacyKey = options?.legacyCbcKey;
    this.ensureDir();
    this.loadFromDisk();
    this.startSessionCleanup();
  }

  private ensureDir() {
    try {
      if (!fs.existsSync(this.vaultDir)) {
        fs.mkdirSync(this.vaultDir, { recursive: true });
      }
    } catch (err: any) {
      logger.warn('Vault', 'فشل إنشاء مجلد الخزنة', err?.message);
    }
  }

  /**
   * Decrypts legacy AES-256-CBC records only during migration using env/explicit key (zero hardcoded keys).
   */
  private decryptLegacy(enc: string, ivHex: string): string | null {
    const keySource = this.legacyKey || process.env.AP_VAULT_KEY || process.env.APP_ENCRYPTION_KEY || '';
    if (!keySource || !enc || !ivHex) return null;
    try {
      const legacyKeyBuf = crypto.createHash('sha256').update(keySource).digest();
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', legacyKeyBuf, iv);
      let decrypted = decipher.update(enc, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e: any) {
      logger.error('Vault', 'فشل فك التشفير للبيانات القديمة', e.message);
      return null;
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.vaultFile)) {
        const raw = fs.readFileSync(this.vaultFile, 'utf8');
        const list: VaultEntry[] = JSON.parse(raw);
        let migrated = false;
        if (Array.isArray(list)) {
          this.entries.clear();
          for (const item of list) {
            if (item && item.mac) {
              if (item.iv) {
                const plain = this.decryptLegacy(item.encPass, item.iv);
                if (plain !== null) {
                  item.encPass = encryptSecret(plain);
                  delete item.iv;
                  migrated = true;
                }
              }
              this.entries.set(item.mac.toLowerCase(), item);
            }
          }
        }
        if (migrated) {
          this.persistToDisk();
        }
      }
    } catch (e: any) {
      logger.error('Vault', 'فشل قراءة ملف بيانات الاعتماد من القرص', e.message);
    }
  }

  private schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistToDisk();
      this.persistTimer = null;
    }, 1500);
    if (this.persistTimer.unref) this.persistTimer.unref();
  }

  public persistToDisk() {
    try {
      this.ensureDir();
      const list = Array.from(this.entries.values());
      writeJsonAtomic(this.vaultFile, list);
    } catch (e: any) {
      logger.error('Vault', 'فشل حفظ بيانات الاعتماد على القرص', e.message);
    }
  }

  saveCredentials(data: {
    mac: string;
    ip: string;
    vendor: string;
    model?: string;
    username: string;
    password: string;
    port?: number;
    useHttps?: boolean;
  }) {
    const macKey = data.mac.toLowerCase();
    const enc = encryptSecret(data.password);
    const existing = this.entries.get(macKey);

    const entry: VaultEntry = {
      id: existing?.id || crypto.randomUUID(),
      mac: data.mac,
      ip: data.ip,
      vendor: data.vendor,
      model: data.model || existing?.model || '',
      username: data.username,
      encPass: enc,
      port: data.port || (data.useHttps ? 443 : 80),
      useHttps: !!data.useHttps,
      lastTestResult: existing?.lastTestResult,
      lastTestedAt: existing?.lastTestedAt,
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    this.entries.set(macKey, entry);
    this.schedulePersist();
    logger.info('Vault', `تم حفظ بيانات اعتماد ${data.mac} (${data.ip})`);
    const { encPass: _ignored, iv: _ignoredIv, ...safeMeta } = entry;
    return safeMeta;
  }

  getConnectConfig(mac: string): VendorConnectConfig | null {
    if (!mac) return null;
    const e = this.entries.get(mac.toLowerCase());
    if (!e) return null;

    let plain: string | null = null;
    if (e.iv) {
      plain = this.decryptLegacy(e.encPass, e.iv);
      if (plain !== null) {
        e.encPass = encryptSecret(plain);
        delete e.iv;
        this.schedulePersist();
      }
    } else {
      plain = decryptSecret(e.encPass);
    }

    if (plain === null) {
      logger.error('Vault', `فشل فك تشفير ${mac}`);
      return null;
    }

    return {
      ip: e.ip,
      username: e.username,
      password: plain,
      port: e.port,
      useHttps: e.useHttps,
      timeoutMs: 8000
    };
  }

  saveSession(mac: string, session: VendorSession, vendorHandler: string) {
    if (!mac) return;
    this.sessions.set(mac.toLowerCase(), { session, vendorHandler });
    logger.debug('Vault', `حفظ جلسة ${mac} تنتهي ${new Date(session.expiresAt).toLocaleTimeString()}`);
  }

  getValidSession(mac: string): VendorSession | null {
    if (!mac) return null;
    const s = this.sessions.get(mac.toLowerCase());
    if (!s) return null;
    if (Date.now() > s.session.expiresAt) {
      this.sessions.delete(mac.toLowerCase());
      logger.debug('Vault', `انتهت صلاحية جلسة ${mac}`);
      return null;
    }
    return { ...s.session };
  }

  invalidateSession(mac: string) {
    if (!mac) return;
    this.sessions.delete(mac.toLowerCase());
  }

  startSessionCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [mac, s] of this.sessions) {
        if (now > s.session.expiresAt) {
          this.sessions.delete(mac);
        }
      }
    }, 60000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  stopSessionCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.persistToDisk();
    }
  }

  updateTestResult(mac: string, r: string) {
    if (!mac) return;
    const e = this.entries.get(mac.toLowerCase());
    if (e) {
      e.lastTestResult = r;
      e.lastTestedAt = new Date().toISOString();
      this.schedulePersist();
    }
  }

  remove(mac: string) {
    if (!mac) return;
    this.entries.delete(mac.toLowerCase());
    this.sessions.delete(mac.toLowerCase());
    this.schedulePersist();
  }

  listMetadata() {
    return Array.from(this.entries.values()).map((e) => ({
      id: e.id,
      mac: e.mac,
      ip: e.ip,
      vendor: e.vendor,
      model: e.model,
      port: e.port,
      useHttps: e.useHttps,
      username: e.username,
      lastTestResult: e.lastTestResult,
      lastTestedAt: e.lastTestedAt,
      hasValidSession:
        this.sessions.has(e.mac.toLowerCase()) &&
        Date.now() < (this.sessions.get(e.mac.toLowerCase())?.session.expiresAt || 0)
    }));
  }

  get size() {
    return this.entries.size;
  }
}

export const vault = new CredentialVault();
