// ============================================================
//  ZCtrl TOFU (Trust On First Use) TLS Fingerprint Pin Store
//  Stores SHA-256 peer certificate fingerprints atomically
//  and verifies MikroTik / AP TLS connections BEFORE credentials
//  are transmitted.
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { appLogger } from './rotatingLogger.ts';

export interface TlsPinRecord {
  fingerprint256: string;
  pinnedAt: string;
  subject?: string;
  issuer?: string;
}

export interface TlsVerifyOptions {
  expectedFingerprint?: string;
  strictTls?: boolean;
  trustOnFirstUse?: boolean;
  subject?: string;
  issuer?: string;
}

export interface TlsVerifyResult {
  ok: boolean;
  reason?: 'missing_cert' | 'mismatch' | 'untrusted_tofu';
  actualFingerprint?: string;
  pinnedFingerprint?: string;
  newlyPinned?: boolean;
}

export function normalizeFingerprint(fp: string): string {
  return String(fp || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
}

export function timingSafeFingerprintEqual(a: string, b: string): boolean {
  const normA = normalizeFingerprint(a);
  const normB = normalizeFingerprint(b);
  if (!normA || !normB || normA.length !== normB.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(normA, 'hex'), Buffer.from(normB, 'hex'));
  } catch (err) {
    appLogger.warn('security', 'TLS fingerprint comparison error', {
      error: err instanceof Error ? err.message : String(err)
    });
    return false;
  }
}

export function writeJsonAtomic(file: string, data: unknown): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600, encoding: 'utf8' });
  fs.renameSync(tmp, file);
}

export class TlsPinStore {
  private readonly pinFile: string;
  private pins: Record<string, TlsPinRecord> = {};

  constructor(customDataDir?: string) {
    const dataDir = customDataDir || process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
    this.pinFile = path.join(dataDir, 'tls_pins.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.pinFile)) {
        const raw = fs.readFileSync(this.pinFile, 'utf8').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            this.pins = parsed;
          }
        }
      }
    } catch (err) {
      appLogger.warn('security', 'Failed to load TLS pin store; starting empty', {
        pinFile: this.pinFile,
        error: err instanceof Error ? err.message : String(err)
      });
      this.pins = {};
    }
  }

  private save(): void {
    try {
      writeJsonAtomic(this.pinFile, this.pins);
    } catch (err) {
      appLogger.warn('security', 'Failed to persist TLS pin store', {
        pinFile: this.pinFile,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  public getPin(key: string): string | null {
    return this.pins[key]?.fingerprint256 || null;
  }

  public setPin(
    key: string,
    fingerprint256: string,
    meta?: { subject?: string; issuer?: string }
  ): void {
    const prev = this.pins[key]?.fingerprint256;
    if (prev && !timingSafeFingerprintEqual(prev, fingerprint256)) {
      appLogger.warn('security', 'TLS certificate pin replaced for endpoint', {
        key,
        previousFingerprint: prev,
        newFingerprint: fingerprint256
      });
    }
    this.pins[key] = {
      fingerprint256: String(fingerprint256 || '').trim(),
      pinnedAt: new Date().toISOString(),
      ...(meta?.subject ? { subject: meta.subject } : {}),
      ...(meta?.issuer ? { issuer: meta.issuer } : {})
    };
    this.save();
  }

  public removePin(key: string): boolean {
    if (this.pins[key]) {
      delete this.pins[key];
      this.save();
      return true;
    }
    return false;
  }

  public listPins(): Record<string, TlsPinRecord> {
    return { ...this.pins };
  }

  public verifyOrTofu(
    key: string,
    actualFingerprint: string,
    options: TlsVerifyOptions = {}
  ): TlsVerifyResult {
    const cleanActual = String(actualFingerprint || '').trim();
    const strict = options.strictTls !== false;

    if (!cleanActual) {
      if (!strict) return { ok: true };
      return { ok: false, reason: 'missing_cert' };
    }

    const explicitExpected = options.expectedFingerprint ? String(options.expectedFingerprint).trim() : '';
    const storedPin = this.getPin(key);

    // 1. Explicit fingerprint provided by caller takes precedence
    if (explicitExpected) {
      if (!timingSafeFingerprintEqual(explicitExpected, cleanActual)) {
        appLogger.error('security', 'TLS fingerprint mismatch against expected pin', {
          key,
          expectedFingerprint: explicitExpected,
          actualFingerprint: cleanActual
        });
        return {
          ok: false,
          reason: 'mismatch',
          actualFingerprint: cleanActual,
          pinnedFingerprint: explicitExpected
        };
      }
      if (options.trustOnFirstUse && !storedPin) {
        this.setPin(key, cleanActual, { subject: options.subject, issuer: options.issuer });
      }
      return { ok: true, actualFingerprint: cleanActual };
    }

    // 2. Stored TOFU pin exists for this host:port
    if (storedPin) {
      if (!timingSafeFingerprintEqual(storedPin, cleanActual)) {
        appLogger.error('security', 'SECURITY ALERT: TLS certificate fingerprint changed for pinned host', {
          key,
          pinnedFingerprint: storedPin,
          actualFingerprint: cleanActual,
          subject: options.subject,
          issuer: options.issuer
        });
        return {
          ok: false,
          reason: 'mismatch',
          actualFingerprint: cleanActual,
          pinnedFingerprint: storedPin
        };
      }
      return { ok: true, actualFingerprint: cleanActual, pinnedFingerprint: storedPin };
    }

    // 3. First connection (no stored pin yet) - only pin when explicitly confirmed
    if (options.trustOnFirstUse) {
      this.setPin(key, cleanActual, { subject: options.subject, issuer: options.issuer });
      return { ok: true, actualFingerprint: cleanActual, newlyPinned: true };
    }

    if (!strict) {
      return { ok: true, actualFingerprint: cleanActual };
    }

    return {
      ok: false,
      reason: 'untrusted_tofu',
      actualFingerprint: cleanActual
    };
  }
}

export const tlsPinStore = new TlsPinStore();
