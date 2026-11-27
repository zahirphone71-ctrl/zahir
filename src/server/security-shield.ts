// ============================================================
//  ZCtrl Security Shield & Hardening Subsystem
//  Provides:
//   1. Multi-Tenant Session Isolation (Strict Token Enforcement)
//   2. Rate Limiting on Auth/Connection (Brute-force protection)
//   3. Controlled Dynamic CORS Whitelist (Production Strict)
//   4. Deep Path Traversal Sanitization (Anti-Traversal Guard)
//   5. RouterOS Script & Command Injection Sanitizer
//   6. In-Memory & At-Rest AES-256-GCM Credential Vault
// ============================================================

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// -------------------------------------------------------------------
// 1. AES-256-GCM Cryptographic Vault
// -------------------------------------------------------------------
const EPHEMERAL_FALLBACK_KEY = crypto.randomBytes(32);

export function getOrGenerateMasterKey(): Buffer {
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
    const newKey = crypto.randomBytes(32).toString('hex');
    const tmpFile = `${keyFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, newKey, { mode: 0o600, encoding: 'utf8' });
    fs.renameSync(tmpFile, keyFile);
    return crypto.createHash('sha256').update(newKey).digest();
  } catch {
    console.warn('[SecurityVault] Data directory is not writable; using ephemeral per-process encryption key.');
    return EPHEMERAL_FALLBACK_KEY;
  }
}

const INITIAL_MASTER_KEY = getOrGenerateMasterKey();

function getActiveMasterKey(): Buffer {
  if (process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim()) {
    return crypto.createHash('sha256').update(process.env.APP_ENCRYPTION_KEY.trim()).digest();
  }
  return INITIAL_MASTER_KEY;
}

export const SESSION_COOKIE_NAME = 'zctrl_rt';

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return proto === 'https';
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  if (!token) return;
  const isHttps = isHttpsRequest(req);
  const attrs = isHttps
    ? `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`
    : `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
  res.append('Set-Cookie', attrs);
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  const attrs = isHttps
    ? `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=None; Partitioned`
    : `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`;
  res.append('Set-Cookie', attrs);
}

export function resolveRequestTokenWithSource(req: Request): {
  token?: string;
  source?: 'header' | 'cookie';
} {
  const headerToken = req.headers['x-router-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return { token: headerToken.trim(), source: 'header' };
  }
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, source: 'header' };
  }
  const cookies = parseCookies(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken && cookieToken.trim()) {
    return { token: cookieToken.trim(), source: 'cookie' };
  }
  return {};
}

/**
 * Extracts router session token strictly from request headers or HttpOnly browser-session cookie
 * (never from URL query strings).
 */
export function resolveRequestToken(req: Request): string | undefined {
  return resolveRequestTokenWithSource(req).token;
}

/**
 * Verifies CSRF protection when an unsafe HTTP mutation relies on the HttpOnly session cookie.
 */
export function verifyCookieCsrf(req: Request): boolean {
  const xrw = String(req.headers['x-requested-with'] || '').trim().toLowerCase();
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();

  if (origin) {
    if (origin === 'null') return false;
    try {
      const parsed = new URL(origin);
      if (host && parsed.host.toLowerCase() === host) {
        return true;
      }
      return isAllowedOrigin(origin);
    } catch {
      return false;
    }
  }

  return xrw === 'xmlhttprequest' || xrw === 'zctrl';
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
  const cipher = crypto.createCipheriv('aes-256-gcm', getActiveMasterKey(), iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt AES-256-GCM ciphertext strictly (never returns unencrypted plaintext payloads)
 */
export function decryptSecret(cipherString: string): string | null {
  if (!cipherString) return '';
  try {
    const parts = cipherString.split(':');
    if (parts.length !== 3) {
      return null;
    }
    const [ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    if (iv.length !== 12 || authTag.length !== 16 || !dataHex) {
      return null;
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', getActiveMasterKey(), iv);
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
  inMemoryEncryptionEnabled: true
};

// -------------------------------------------------------------------
// 3. Rate Limiters (Brute-Force & DoS Protection)
// -------------------------------------------------------------------
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.operatorUsername || req.body?.username || '').toLowerCase()}`,
  skip: (_req: Request) => {
    if (!securityConfig.rateLimitingEnabled) return true;
    return process.env.NODE_ENV === 'test' || process.env.ZCTRL_DISABLE_RATE_LIMIT === 'true';
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
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !securityConfig.rateLimitingEnabled || process.env.NODE_ENV === 'test',
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
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !securityConfig.rateLimitingEnabled || process.env.NODE_ENV === 'test',
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
function getAllowedEnvOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  // Requests without an Origin header (curl, same-origin server-to-server) are allowed;
  // authentication is still enforced via bearer token.
  if (!origin) return true;
  if (origin === 'null') return false;

  if (!securityConfig.strictCorsEnabled) return true;

  const isProd = process.env.NODE_ENV === 'production';
  const port = String(process.env.PORT || '3000');
  const allowedEnvOrigins = getAllowedEnvOrigins();

  try {
    const url = new URL(origin);
    const host = url.hostname;
    const normalizedOrigin = url.origin;

    // Explicit ALLOWED_ORIGINS always permitted when configured
    if (allowedEnvOrigins.includes(normalizedOrigin) || allowedEnvOrigins.includes(origin) || allowedEnvOrigins.includes(host)) {
      return true;
    }

    // Exact APP_URL origin if configured
    if (process.env.APP_URL && process.env.APP_URL.trim()) {
      try {
        const appOrigin = new URL(process.env.APP_URL.trim()).origin;
        if (normalizedOrigin === appOrigin) return true;
      } catch (err) {
        console.warn('[SecurityShield] Invalid APP_URL format:', err instanceof Error ? err.message : err);
      }
    }

    if (isProd) {
      // Production: strictly allow only the application's own loopback origin (+ ALLOWED_ORIGINS above)
      const ownOrigins = new Set([
        `http://127.0.0.1:${port}`,
        `https://127.0.0.1:${port}`,
        `http://localhost:${port}`,
        `https://localhost:${port}`
      ]);
      if (process.env.HOST && process.env.HOST !== '0.0.0.0') {
        ownOrigins.add(`http://${process.env.HOST}:${port}`);
        ownOrigins.add(`https://${process.env.HOST}:${port}`);
      }
      return ownOrigins.has(normalizedOrigin);
    }

    // Non-production (dev / preview): allow loopback, LAN RFC1918, and AI Studio preview subdomains
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      return true;
    }

    if (
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)
    ) {
      return true;
    }

    if (
      host.endsWith('.run.app') ||
      host.endsWith('.google.internal') ||
      host.endsWith('.aistudio.google') ||
      host.endsWith('.googleusercontent.com')
    ) {
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

  decoded = decoded.replace(/[\x00-\x1F\x7F]/g, '').trim();

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

  const normalized = path.posix.normalize(decoded).replace(/^\/+/, '');
  const cleanAllowed = path.posix.normalize(allowedFolder).replace(/^\/+/, '').replace(/\/+$/, '');

  if (cleanAllowed && !normalized.startsWith(cleanAllowed)) {
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
  return /^[a-zA-Z0-9._-]+$/.test(fileName);
}

// -------------------------------------------------------------------
// 6. RouterOS Script & Command Injection Shield
// -------------------------------------------------------------------
export function sanitizeRouterOsParam(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'string' ? val : String(val);

  return str
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\$\[/g, '')
    .replace(/`/g, '')
    .trim();
}

export function buildSafeScriptVar(varName: string, value: string): string {
  const cleanVar = varName.replace(/[^a-zA-Z0-9_]/g, '');
  const cleanVal = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/[\r\n]+/g, ' ');
  return `:global ${cleanVar} "${cleanVal}";\n`;
}
