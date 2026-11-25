/**
 * ZCtrl Governing Specification v5.0.0
 * Unified Domain Types & Governance Interfaces
 */

export type Vendor = 'mikrotik' | 'ubiquiti-airmax' | 'unifi';

export type Capability = 
  | `read.${string}` 
  | `write.${string}` 
  | `execute.${string}`;

export type OperationState = 
  | 'queued' 
  | 'running' 
  | 'succeeded' 
  | 'failed' 
  | 'partially_succeeded' 
  | 'cancelled' 
  | 'outcome_unknown' 
  | 'diverged';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DeviceIdentity {
  vendor: Vendor;
  model: string;
  firmware: string;
  serial?: string;
  rosVersion?: string;
  architecture?: string;
  detectedAt: number;
}

export interface PreparedCommand {
  menu: string; // e.g. '/ip/hotspot/user'
  action: 'add' | 'set' | 'remove' | 'print' | 'execute';
  params: Record<string, string | number | boolean>;
  proplist?: string[]; // Proplist filtering to protect router CPU
  rawCli?: string;
}

export interface RevertPlan {
  revertCommands: PreparedCommand[];
  deadlineMs: number; // Default 120,000 ms (2 minutes)
  confirmationMethod: 'admin_click' | 'admin_terminal';
}

export interface ChangePlan {
  changeId: string;
  idempotencyKey: string;
  vendor: Vendor;
  routerId: string;
  commands: PreparedCommand[];
  expectedEffects: string[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  requiresRevertTimer: boolean;
  revertPlan?: RevertPlan;
  previousStateHash: string;
  createdAt: number;
  authorId: string;
  reason?: string;
}

export interface VerificationResult {
  state: OperationState;
  intendedState: unknown;
  actualState: unknown;
  diff?: { path: string; intended: unknown; actual: unknown }[];
  evidence: string[];
  verifiedAt: number;
}

export interface OperationResult {
  operationId: string;
  changeId: string;
  routerId: string;
  state: OperationState;
  startedAt: number;
  finishedAt?: number;
  postStateHash?: string;
  evidence: string[];
  error?: { code: string; message: string; details?: unknown };
}

export interface RevertJournalRecord {
  changeId: string;
  routerId: string;
  vendor: Vendor;
  appliedAt: number;
  appliedStateHash: string;
  revertCommands: PreparedCommand[];
  deadlineAt: number;
  confirmedAt?: number;
  status: 'pending' | 'confirmed' | 'reverted' | 'expired_unknown' | 'failed_revert';
  attemptCount: number;
  lastAttemptAt?: number;
  evidence?: string[];
}

export interface AuditLogEvent {
  id: string;
  seq: number;
  actorId: string;
  actorIp: string;
  uaHash: string;
  action: string;
  resource: string;
  resourceId?: string;
  routerId?: string;
  result: 'success' | 'failure' | 'indeterminate';
  reason?: string;
  changes?: { before: unknown; after: unknown };
  correlationId: string;
  requestId: string;
  createdAt: number;
  prevHash: string;
  hash: string;
}

export interface DeviceAdapter {
  vendor: Vendor;
  detect(routerId: string): Promise<DeviceIdentity>;
  capabilities(routerId: string): Promise<Capability[]>;
  read<T>(query: { menu: string; params?: Record<string, string>; proplist?: string[] }): Promise<{ ok: boolean; data?: T; message?: string }>;
  plan(change: { routerId: string; commands: PreparedCommand[]; riskLevel: RiskLevel; authorId: string; reason?: string }): Promise<ChangePlan>;
  apply(plan: ChangePlan, options?: { signal?: AbortSignal; confirmationToken?: string; revertTimerMs?: number }): Promise<OperationResult>;
  verify(plan: ChangePlan): Promise<VerificationResult>;
}
