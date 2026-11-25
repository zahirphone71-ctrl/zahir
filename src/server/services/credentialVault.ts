// ============================================================
// مخزن بيانات الاعتماد المشفر وإدارة الجلسات السحابية
// Credential Vault with In-Memory Sessions & Debounced Persistence (إصلاح 1)
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.ts';
import type { VendorSession, VendorConnectConfig } from './vendors/types.ts';

interface VaultEntry {
  id: string;
  mac: string;
  ip: string;
  vendor: string;
  model?: string;
  username: string;
  encPass: string;
  iv: string;
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

const VAULT_DIR = process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
const VAULT_FILE = path.join(VAULT_DIR, 'ap_vault.json');
const SECRET_KEY = crypto.createHash('sha256').update(process.env.AP_VAULT_KEY || 'zctrl-ap-default-secret-key-2026').digest();

class CredentialVault {
  private entries = new Map<string, VaultEntry>();
  // إصلاح 1: الجلسات في الذاكرة فقط لتجنب I/O Bottleneck
  private sessions = new Map<string, VaultSessionEntry>();
  private persistTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDir();
    this.loadFromDisk();
    this.startSessionCleanup();
  }

  private ensureDir() {
    try {
      if (!fs.existsSync(VAULT_DIR)) {
        fs.mkdirSync(VAULT_DIR, { recursive: true });
      }
    } catch {}
  }

  private encrypt(text: string): { enc: string; iv: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { enc: encrypted, iv: iv.toString('hex') };
  }

  private decrypt(enc: string, ivHex: string): string | null {
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
      let decrypted = decipher.update(enc, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e: any) {
      logger.error('Vault', 'فشل فك التشفير', e.message);
      return null;
    }
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(VAULT_FILE)) {
        const raw = fs.readFileSync(VAULT_FILE, 'utf8');
        const list: VaultEntry[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          this.entries.clear();
          for (const item of list) {
            if (item && item.mac) {
              this.entries.set(item.mac.toLowerCase(), item);
            }
          }
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
  }

  private persistToDisk() {
    try {
      this.ensureDir();
      const list = Array.from(this.entries.values());
      fs.writeFileSync(VAULT_FILE, JSON.stringify(list, null, 2), 'utf8');
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
    const { enc, iv } = this.encrypt(data.password);
    const existing = this.entries.get(macKey);

    const entry: VaultEntry = {
      id: existing?.id || crypto.randomUUID(),
      mac: data.mac,
      ip: data.ip,
      vendor: data.vendor,
      model: data.model || existing?.model || '',
      username: data.username,
      encPass: enc,
      iv: iv,
      port: data.port || (data.useHttps ? 443 : 80),
      useHttps: !!data.useHttps,
      lastTestResult: existing?.lastTestResult,
      lastTestedAt: existing?.lastTestedAt,
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    this.entries.set(macKey, entry);
    this.schedulePersist();
    logger.info('Vault', `تم حفظ بيانات اعتماد ${data.mac} (${data.ip})`);
    return entry;
  }

  getConnectConfig(mac: string): VendorConnectConfig | null {
    if (!mac) return null;
    const e = this.entries.get(mac.toLowerCase());
    if (!e) return null;
    const p = this.decrypt(e.encPass, e.iv);
    if (p === null) {
      logger.error('Vault', `فشل فك تشفير ${mac}`);
      return null;
    }
    return {
      ip: e.ip,
      username: e.username,
      password: p,
      port: e.port,
      useHttps: e.useHttps,
      timeoutMs: 8000
    };
  }

  // ===== إصلاح 1: إدارة الجلسات في الذاكرة فقط =====

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

  private cleanupTimer: NodeJS.Timeout | null = null;

  /** تنظيف الجلسات المنتهية (كل دقيقة) */
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
