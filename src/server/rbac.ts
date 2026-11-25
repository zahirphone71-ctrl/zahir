// ============================================================
//  ZCtrl Role-Based Access Control (RBAC) & Governance Audit
//  Roles:
//   - admin:   Full hardware, security, firewall, RBAC & financial control
//   - cashier: Voucher generation, printing, router injection/sync, disconnect active session, read dashboards
//   - viewer:  Read-only telemetry and reports monitoring
// ============================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { AuditHashChain } from './domain/AuditHashChain.ts';

export type OperatorRole = 'admin' | 'cashier' | 'viewer';

export interface OperatorRecord {
  id: string;
  username: string;
  displayName: string;
  role: OperatorRole;
  passwordHash: string; // scrypt format: salt:derivedKeyHex
  disabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface SafeOperatorView {
  id: string;
  username: string;
  displayName: string;
  role: OperatorRole;
  disabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface SessionRoleContext {
  role: OperatorRole;
  operatorId: string;
  operatorName: string;
}

const VALID_ROLES: OperatorRole[] = ['admin', 'cashier', 'viewer'];

export function isValidRole(role: any): role is OperatorRole {
  return VALID_ROLES.includes(role);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  try {
    const actualBuf = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

export class RbacService {
  private operatorsFile: string;
  private operators: OperatorRecord[] = [];

  constructor(customDataDir?: string) {
    const dataDir = customDataDir || process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), '.zctrl_data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    this.operatorsFile = path.join(dataDir, 'operators.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.operatorsFile)) {
        const raw = fs.readFileSync(this.operatorsFile, 'utf-8').trim();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.operators = parsed.filter(
              (o: any) => o && typeof o.username === 'string' && isValidRole(o.role) && typeof o.passwordHash === 'string'
            );
          }
        }
      }
    } catch (e) {
      console.warn('[RBAC] Failed to load operators file:', e);
    }
  }

  private save() {
    try {
      const tmpFile = `${this.operatorsFile}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.operators, null, 2), { mode: 0o600, encoding: 'utf-8' });
      fs.renameSync(tmpFile, this.operatorsFile);
    } catch (e) {
      console.error('[RBAC] Failed to save operators file:', e);
    }
  }

  public listOperators(): SafeOperatorView[] {
    return this.operators.map(({ passwordHash: _ignored, ...safe }) => safe);
  }

  public hasCustomOperators(): boolean {
    return this.operators.length > 0;
  }

  public createOperator(input: {
    username: string;
    password: string;
    role: OperatorRole;
    displayName?: string;
  }): SafeOperatorView {
    const username = String(input.username || '').trim();
    if (!username || username.length < 2 || username.length > 48 || !/^[a-zA-Z0-9._-]+$/.test(username)) {
      throw new Error('اسم المشغل غير صالح (حروف وأرقام و ._- فقط، بحد أدنى حرفين)');
    }
    if (!input.password || String(input.password).length < 4) {
      throw new Error('كلمة مرور المشغل يجب أن تكون 4 أحرف على الأقل');
    }
    if (!isValidRole(input.role)) {
      throw new Error('الدور غير صالح (admin / cashier / viewer)');
    }
    if (this.operators.some((o) => o.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('اسم المشغل موجود مسبقاً');
    }

    const record: OperatorRecord = {
      id: `op_${crypto.randomBytes(8).toString('hex')}`,
      username,
      displayName: (input.displayName || username).trim(),
      role: input.role,
      passwordHash: hashPassword(String(input.password)),
      disabled: false,
      createdAt: new Date().toISOString()
    };

    this.operators.push(record);
    this.save();
    const { passwordHash: _ignored, ...safe } = record;
    return safe;
  }

  public updateOperator(
    id: string,
    updates: { role?: OperatorRole; displayName?: string; password?: string; disabled?: boolean }
  ): SafeOperatorView {
    const idx = this.operators.findIndex((o) => o.id === id);
    if (idx === -1) {
      throw new Error('المشغل غير موجود');
    }
    const op = this.operators[idx];
    if (updates.role !== undefined) {
      if (!isValidRole(updates.role)) throw new Error('الدور غير صالح');
      op.role = updates.role;
    }
    if (updates.displayName !== undefined) {
      op.displayName = String(updates.displayName).trim() || op.username;
    }
    if (updates.disabled !== undefined) {
      op.disabled = Boolean(updates.disabled);
    }
    if (updates.password && String(updates.password).trim().length >= 4) {
      op.passwordHash = hashPassword(String(updates.password));
    }
    this.save();
    const { passwordHash: _ignored, ...safe } = op;
    return safe;
  }

  public deleteOperator(id: string): boolean {
    const before = this.operators.length;
    this.operators = this.operators.filter((o) => o.id !== id);
    if (this.operators.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  public authenticateOperator(username: string, password: string): SafeOperatorView | null {
    const cleanUser = String(username || '').trim().toLowerCase();
    const op = this.operators.find((o) => o.username.toLowerCase() === cleanUser);
    if (!op || op.disabled) return null;
    if (!verifyPassword(password, op.passwordHash)) return null;
    op.lastLoginAt = new Date().toISOString();
    this.save();
    const { passwordHash: _ignored, ...safe } = op;
    return safe;
  }
}

export const rbacService = new RbacService();

// Route Permission Evaluation
const CASHIER_ALLOWED_MUTATION_PREFIXES = [
  '/api/mikrotik/cancel-connect',
  '/api/mikrotik/batch',
  '/api/mikrotik/hotspot/cards/generate',
  '/api/mikrotik/hotspot/active/disconnect',
  '/api/mikrotik/ppp/active/disconnect',
  '/api/mikrotik/userman/active/disconnect',
  '/api/vouchers/generate',
  '/api/vouchers/generate-custom',
  '/api/vouchers/sync',
  '/api/vouchers/render-html',
  '/api/vouchers/templates',
  '/api/vouchers/design/current',
  '/api/vouchers/import-reconciled'
];

const VIEWER_READONLY_POST_ROUTES = [
  '/api/mikrotik/cancel-connect',
  '/api/mikrotik/batch',
  '/api/mikrotik/hotspot/login-page/get-config',
  '/api/mikrotik/network/ping'
];

export function isAuthorizedForRequest(role: OperatorRole, method: string, pathUrl: string): {
  allowed: boolean;
  reason?: string;
} {
  if (role === 'admin') {
    return { allowed: true };
  }

  const normalizedMethod = method.toUpperCase();
  const cleanPath = pathUrl.split('?')[0];

  // Operator management & security settings are strictly admin-only even for GET
  if (cleanPath.startsWith('/api/auth/operators') || cleanPath.startsWith('/api/security/settings')) {
    return { allowed: false, reason: 'هذا القسم مخصص للمدير العام (Admin) فقط.' };
  }

  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD' || normalizedMethod === 'OPTIONS') {
    return { allowed: true };
  }

  if (role === 'viewer') {
    if (VIEWER_READONLY_POST_ROUTES.some((p) => cleanPath === p || cleanPath.startsWith(p + '/'))) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'حسابك بصلاحية (مراقب / Viewer) للقراءة فقط ولا يسمح بتنفيذ تعديلات على الراوتر أو الكروت.'
    };
  }

  // role === 'cashier'
  if (
    CASHIER_ALLOWED_MUTATION_PREFIXES.some((p) => cleanPath === p || cleanPath.startsWith(p + '/')) ||
    /^\/api\/vouchers\/batches\/[^/]+\/resume$/.test(cleanPath)
  ) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'صلاحية (أمين صندوق / Cashier) تسمح بتوليد وطباعة ومزامنة الكروت وفصل الجلسات فقط؛ لا يمكن تعديل البروفايلات أو الجدار الناري أو النظام.'
  };
}

export function recordAudit(
  req: Request,
  action: string,
  resource: string,
  result: 'success' | 'failure' | 'indeterminate',
  details?: { resourceId?: string; reason?: string; changes?: { before: unknown; after: unknown } }
) {
  try {
    const actorId =
      (req as any).sessionRole?.operatorName ||
      (req as any).sessionRole?.operatorId ||
      'admin';
    const actorIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const cfg = req.routerClient?.getConfig?.();
    AuditHashChain.createEvent({
      actorId,
      actorIp,
      action,
      resource,
      resourceId: details?.resourceId,
      routerId: cfg?.host || 'default',
      result,
      reason: details?.reason,
      changes: details?.changes
    });
  } catch (e) {
    console.warn('[Audit] Failed to record audit event:', e);
  }
}

export function createRbacMiddleware(
  getSessionRole: (req: Request) => SessionRoleContext | undefined
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const pathUrl = (req.baseUrl || req.originalUrl || req.url || '').split('?')[0];
    if (!pathUrl.startsWith('/api/')) return next();

    const sessionRole = getSessionRole(req);
    if (!sessionRole) return next(); // Unauthenticated routes handled by session middleware

    (req as any).sessionRole = sessionRole;
    const auth = isAuthorizedForRequest(sessionRole.role, req.method, pathUrl);
    if (!auth.allowed) {
      recordAudit(req, `${req.method} ${pathUrl}`, 'rbac_guard', 'failure', {
        reason: auth.reason
      });
      return res.status(403).json({
        success: false,
        message: auth.reason || 'ليس لديك صلاحية تنفيذ هذا الإجراء.',
        requiredRole: sessionRole.role === 'cashier' ? 'admin' : 'cashier/admin',
        currentRole: sessionRole.role
      });
    }
    return next();
  };
}
