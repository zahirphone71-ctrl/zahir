// ============================================================
//  ZCtrl Shared RouterOS Normalizers, Sanitizers & CSPRNG Utils
//  Provides unified strict typing, RouterOS script-injection
//  hardening, and cryptographically secure ID generation.
// ============================================================

import crypto from 'crypto';
import type { DhcpLease, SimpleQueue } from '../../types/mikrotik.ts';

export type RouterOSRow = Record<string, string | boolean | number | undefined>;

export function parseRouterOsBool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const clean = val.trim().toLowerCase();
    return clean === 'true' || clean === 'yes' || clean === '1';
  }
  return false;
}

export function parseRouterOsInt(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
  if (typeof val === 'string') {
    const parsed = parseInt(val.trim(), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function strField(row: RouterOSRow | null | undefined, ...keys: string[]): string {
  if (!row) return '';
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v) !== '') {
      return String(v);
    }
  }
  return '';
}

/**
 * Cryptographically secure random ID generator (replaces Math.random).
 */
export function randomSecureHex(bytes = 4): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomSecureId(prefix: string, bytes = 4): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(bytes).toString('hex')}`;
}

export function randomSecureString(length: number, charset: string): string {
  if (length <= 0 || !charset.length) return '';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset.charAt(crypto.randomInt(0, charset.length));
  }
  return out;
}

/**
 * Strip ASCII control characters, null bytes, and leading/trailing whitespace.
 */
export function sanitizeRouterInput(val: unknown): string {
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val !== 'string') return '';
  return val.replace(/[\x00-\x1F\x7F]/g, '').trim();
}

/**
 * Strictly sanitize values interpolated inside RouterOS quoted script strings ("...").
 * Prevents RouterOS script breakout or command/variable interpolation ($var, $[...], ", \, `, newlines).
 */
export function sanitizeRouterOsQuotedValue(val: unknown, fallback = ''): string {
  const clean = sanitizeRouterInput(val);
  if (!clean) return fallback;
  const safe = clean
    .replace(/["\\`$;\r\n]/g, '')
    .replace(/\$\[.*?\]/g, '')
    .trim();
  return safe || fallback;
}

/**
 * Strictly validate/sanitize identifier values (interface names, bridge names, usernames, timezones).
 */
export function sanitizeRouterOsIdentifier(val: unknown, fallback: string): string {
  const clean = sanitizeRouterInput(val);
  if (!clean) return fallback;
  const safe = clean.replace(/[^a-zA-Z0-9._:/-]/g, '').trim();
  return safe || fallback;
}

/**
 * Canonical DHCP Lease normalizer shared between WebSocket telemetry & HTTP REST routes.
 */
export function normalizeDhcpLeaseRow(l: RouterOSRow | null | undefined): (DhcpLease & {
  'mac-address': string;
  'host-name': string;
  'expires-after': string;
  dynamic: string;
}) | null {
  if (!l || typeof l !== 'object') return null;
  const mac = strField(l, 'mac-address', 'macAddress');
  const host = strField(l, 'host-name', 'hostName');
  const expiresAfter = strField(l, 'expires-after', 'expiresAfter');
  const isDyn = parseRouterOsBool(l.dynamic ?? l.isDynamic);
  const isDisabled = parseRouterOsBool(l.disabled);
  const id = strField(l, '.id', 'id') || randomSecureId('lease', 4);

  return {
    id,
    address: strField(l, 'address'),
    macAddress: mac,
    'mac-address': mac,
    hostName: host,
    'host-name': host,
    server: strField(l, 'server') || 'all',
    status: (strField(l, 'status') || 'bound') as 'bound' | 'waiting' | 'offered',
    expiresAfter,
    'expires-after': expiresAfter,
    isDynamic: isDyn,
    dynamic: isDyn ? 'true' : 'false',
    comment: strField(l, 'comment'),
    disabled: isDisabled
  };
}

/**
 * Canonical Simple Queue normalizer shared across REST & real-time telemetry.
 */
export function normalizeSimpleQueueRow(q: RouterOSRow | null | undefined): (SimpleQueue & {
  bytesIn: number;
  bytesOut: number;
  bytesTotal: number;
}) | null {
  if (!q || typeof q !== 'object') return null;
  const rawBytes = strField(q, 'bytes') || '0/0';
  let bytesIn = 0;
  let bytesOut = 0;
  if (rawBytes.includes('/')) {
    const [rx, tx] = rawBytes.split('/');
    bytesIn = parseInt(rx, 10) || 0;
    bytesOut = parseInt(tx, 10) || 0;
  } else {
    bytesIn = parseInt(rawBytes, 10) || 0;
  }
  return {
    id: strField(q, '.id', 'id', 'name') || randomSecureId('queue', 4),
    name: strField(q, 'name') || 'Unknown',
    target: strField(q, 'target', 'target-addresses'),
    maxLimit: strField(q, 'max-limit', 'maxLimit') || '0/0',
    limitAt: strField(q, 'limit-at', 'limitAt') || '0/0',
    bytes: rawBytes,
    bytesIn,
    bytesOut,
    bytesTotal: bytesIn + bytesOut,
    packets: strField(q, 'packets') || '0/0',
    rate: strField(q, 'rate') || '0/0',
    disabled: parseRouterOsBool(q.disabled),
    dynamic: parseRouterOsBool(q.dynamic),
    priority: strField(q, 'priority') || '8/8',
    burstLimit: strField(q, 'burst-limit', 'burstLimit'),
    burstThreshold: strField(q, 'burst-threshold', 'burstThreshold'),
    burstTime: strField(q, 'burst-time', 'burstTime'),
    parent: strField(q, 'parent') || 'none',
    queue: strField(q, 'queue'),
    comment: strField(q, 'comment')
  };
}
