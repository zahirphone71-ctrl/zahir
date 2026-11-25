// ============================================================
//  ZCtrl Security Shield & Hardening Subsystem
//  Provides:
//   1. Multi-Tenant Session Isolation (Strict Token Enforcement)
//   2. Rate Limiting on Auth/Connection (Brute-force protection)
//   3. Controlled Dynamic CORS Whitelist
//   4. Deep Path Traversal Sanitization (Anti-Traversal Guard)
//   5. RouterOS Script & Command Injection Sanitizer
//   6. In-Memory & At-Rest AES-256-GCM Credential Vault
// ============================================================

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

// -------------------------------------------------------------------
// 1. AES-256-GCM Cryptographic Vault
// -------------------------------------------------------------------
function getOrGenerateMasterKey(): Buffer {
  if (process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim()) {
    return crypto.createHash('sha256').update(process.env.APP_ENCRYPTION_KEY.trim()).digest();
  }
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim()) {
    return crypto.createHash('sha256').update(process.env.SESSION_SECRET.trim()).digest();
  }

  const dataDir = process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
  const keyFile = path.join(dataDir, 'master.key');

  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (fs.existsSync(keyFile)) {
      const storedKey = fs.readFileSync(keyFile, 'utf-8').trim();
      if (storedKey.length >= 32) {
        return crypto.createHash('sha256').update(storedKey).digest();
      }
    }
    // Generate new cryptographically secure 256-bit random key
    const newKey = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(keyFile, newKey, { mode: 0o600 });
    return crypto.createHash('sha256').update(newKey).digest();
  } catch {
    // Ephemeral per-process 256-bit random fallback if filesystem is read-only (never use a hardcoded secret)
    console.warn('[SecurityVault] Data directory is not writable; using ephemeral per-process encryption key.');
    return crypto.randomBytes(32);
  }
}

const MASTER_KEY = getOrGenerateMasterKey();

/**
 * Extracts router session token strictly from request headers (never from URL query strings)
 */
export function resolveRequestToken(req: Request): string | undefined {
  const headerToken = req.headers['x-router-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken.trim();
  }
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  return undefined;
}

export interface EncryptedSecretPayload {
  iv: string;
  tag: string;
  data: string;
}

/**
 * Encrypt sensitive plaintext using AES-256-GCM
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt AES-256-GCM ciphertext
 */
export function decryptSecret(cipherString: string): string | null {
  if (!cipherString) return '';
  try {
    const parts = cipherString.split(':');
    if (parts.length !== 3) {
      // Fallback if plaintext or legacy format
      return cipherString;
    }
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(dataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.warn('[SecurityVault] Failed to decrypt secret payload:', err);
    return null;
  }
}

// -------------------------------------------------------------------
// 2. Security Feature Flags & Runtime Config
// -------------------------------------------------------------------
export interface SecurityConfig {
  rateLimitingEnabled: boolean;
  strictTenantIsolation: boolean;
  strictCorsEnabled: boolean;
  pathTraversalGuardEnabled: boolean;
  scriptInjectionGuardEnabled: boolean;
  inMemoryEncryptionEnabled: boolean;
}

export const securityConfig: SecurityConfig = {
  rateLimitingEnabled: true,
  strictTenantIsolation: true,
  strictCorsEnabled: true,
  pathTraversalGuardEnabled: true,
  scriptInjectionGuardEnabled: true,
  inMemoryEncryptionEnabled: true,
};

// -------------------------------------------------------------------
// 3. Rate Limiters (Brute-Force & DoS Protection)
// -------------------------------------------------------------------
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 120, // generous allowance for rapid testing and reconnects
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    if (!securityConfig.rateLimitingEnabled) return true;
    const ip = req.ip || req.socket.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'تم تجاوز الحد المسموح به من محاولات الاتصال والمصادقة. يرجى الانتظار قليلاً قبل إعادة المحاولة.',
      reasonType: 'rate_limited'
    });
  }
});

export const diagnosticRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 40, // 40 diagnostic / discovery requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !securityConfig.rateLimitingEnabled,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'تم تجاوز معدل فحص المنافذ والتشخيص. يرجى الانتظار دقيقة واحدة.',
      reasonType: 'rate_limited'
    });
  }
});

export const apiGeneralRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute per IP for high-speed dashboard telemetry
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !securityConfig.rateLimitingEnabled,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'تم تجاوز الحد الأقصى للطلبات في الدقيقة. يرجى التمهل قليلاً.',
      reasonType: 'rate_limited'
    });
  }
});

// -------------------------------------------------------------------
// 4. Controlled Dynamic CORS Whitelist Validator
// -------------------------------------------------------------------
const allowedEnvOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === 'null') return true; // allow same-origin, curl, server-to-server, Electron file:// ("null" origin)
  
  if (!securityConfig.strictCorsEnabled) return true;

  if (
    origin.startsWith('file://') ||
    origin.startsWith('capacitor://') ||
    origin.startsWith('ionic://') ||
    origin.startsWith('app://')
  ) {
    return true;
  }

  try {
    const url = new URL(origin);
    const host = url.hostname;

    // 1. Localhost and Loopbacks
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;

    // 2. Private LAN RFC1918 (192.168.x.x, 10.x.x.x, 172.16-31.x.x, 169.254.x.x)
    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)
    ) {
      return true;
    }

    // 3. AI Studio / Cloud Run Preview & Dev subdomains
    if (
      host.endsWith('.run.app') ||
      host.endsWith('.google.internal') ||
      host.endsWith('.aistudio.google') ||
      host.endsWith('.google.com') ||
      host.endsWith('.googleusercontent.com') ||
      host.endsWith('.web.app') ||
      host.endsWith('.firebaseapp.com')
    ) {
      return true;
    }

    // 4. Custom Environment Allowed Origins
    if (allowedEnvOrigins.includes(origin) || allowedEnvOrigins.includes(host)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS Guard] Blocked unauthorized request from origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Router-Token', 'x-router-token', 'X-Requested-With', 'Accept']
};

// -------------------------------------------------------------------
// 5. Deep Path Traversal Sanitizer (Zero-Traversal Shield)
// -------------------------------------------------------------------
const DANGEROUS_PATH_SEGMENTS = [
  '..',
  '/etc',
  '/system',
  '/proc',
  '/sys',
  '/root',
  '/dev',
  '.ssh',
  'passwd',
  'shadow',
  'boot.ini',
  'autoexec.bat'
];

/**
 * Recursively URL-decodes and normalizes file paths to prevent traversal
 */
export function sanitizeSafePath(rawPath: string, allowedFolder = 'hotspot'): {
  safePath: string;
  isSafe: boolean;
  error?: string;
} {
  if (!rawPath || typeof rawPath !== 'string') {
    return { safePath: '', isSafe: false, error: 'مسار الملف غير محدد' };
  }

  // 1. Recursive URL decode to catch %252e%252e double-encoding
  let decoded = rawPath;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  // 2. Strip null bytes, control characters, and leading/trailing whitespace
  decoded = decoded.replace(/[\x00-\x1F\x7F]/g, '').trim();

  // 3. Check for forbidden segments
  const lower = decoded.toLowerCase();
  for (const dangerous of DANGEROUS_PATH_SEGMENTS) {
    if (lower.includes(dangerous)) {
      return {
        safePath: '',
        isSafe: false,
        error: `تم رفض المسار لاحتوائه على محارف أو أدلة غير مسموحة (${dangerous})`
      };
    }
  }

  // 4. Normalize path using POSIX rules
  const normalized = path.posix.normalize(decoded).replace(/^\/+/, '');

  // 5. If an allowed root folder is enforced, ensure the path starts with it or stays inside it
  const cleanAllowed = path.posix.normalize(allowedFolder).replace(/^\/+/, '').replace(/\/+$/, '');
  
  if (cleanAllowed && !normalized.startsWith(cleanAllowed)) {
    // If the path doesn't start with allowed root, safely prepend it
    const combined = path.posix.join(cleanAllowed, normalized);
    return { safePath: combined, isSafe: true };
  }

  return { safePath: normalized, isSafe: true };
}

/**
 * Validates file names for safe deployment (letters, numbers, dot, dash, underscore)
 */
export function validateSafeFileName(fileName: string): boolean {
  if (!fileName || typeof fileName !== 'string') return false;
  if (fileName.length > 128) return false;
  // Strictly alphanumeric, dots, dashes, underscores
  return /^[a-zA-Z0-9._-]+$/.test(fileName);
}

// -------------------------------------------------------------------
// 6. RouterOS Script & Command Injection Shield
// -------------------------------------------------------------------
/**
 * Sanitizes parameters before passing into RouterOS CLI / scripts
 */
export function sanitizeRouterOsParam(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'string' ? val : String(val);
  
  // Remove null bytes, control chars, dollar-bracket command substitutions, and backticks
  return str
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\$\[/g, '') // prevent script expression evaluation $[...]
    .replace(/`/g, '')    // prevent backtick evaluation
    .trim();
}

/**
 * Generates safe RouterOS script variable definitions without quote escaping risks
 */
export function buildSafeScriptVar(varName: string, value: string): string {
  const cleanVar = varName.replace(/[^a-zA-Z0-9_]/g, '');
  const cleanVal = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/[\r\n]+/g, ' ');
  return `:global ${cleanVar} "${cleanVal}";\n`;
}
