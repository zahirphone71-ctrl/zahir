import crypto from 'crypto';
import { OperationState, OperationResult, ChangePlan } from '../../types/governance';

export interface OperationStepLog {
  operationId: string;
  seq: number;
  command: string;
  status: 'sending' | 'sent' | 'indeterminate' | 'failed' | 'ok';
  evidence?: string;
  at: number;
}

export interface TrackedOperation {
  operationId: string;
  changeId: string;
  routerId: string;
  operationType: string;
  state: OperationState;
  idempotencyKey: string;
  payloadHash: string;
  previousStateHash?: string;
  postStateHash?: string;
  startedAt: number;
  finishedAt?: number;
  evidence: string[];
  steps: OperationStepLog[];
  authorId: string;
}

export class OperationStateTracker {
  private static activeOperations = new Map<string, TrackedOperation>();
  private static idempotencyRegistry = new Map<string, { operationId: string; timestamp: number }>();
  private static lastPruneAt = 0;

  private static readonly MAX_OPERATIONS = 500;
  private static readonly MAX_IDEMPOTENCY = 2000;
  private static readonly FINISHED_TTL_MS = 60 * 60 * 1000; // 1 hour
  private static readonly IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly MAX_STEPS_PER_OP = 200;
  private static readonly MAX_EVIDENCE_PER_OP = 100;

  static prune(force: boolean = false): void {
    const now = Date.now();
    if (!force && now - this.lastPruneAt < 30_000 && this.activeOperations.size < this.MAX_OPERATIONS) {
      return;
    }
    this.lastPruneAt = now;

    for (const [id, op] of this.activeOperations.entries()) {
      if (op.finishedAt && now - op.finishedAt > this.FINISHED_TTL_MS) {
        this.activeOperations.delete(id);
      }
    }

    if (this.activeOperations.size > this.MAX_OPERATIONS) {
      for (const [id, op] of this.activeOperations.entries()) {
        if (this.activeOperations.size <= this.MAX_OPERATIONS) break;
        if (op.finishedAt) {
          this.activeOperations.delete(id);
        }
      }
      while (this.activeOperations.size > this.MAX_OPERATIONS) {
        const oldestKey = this.activeOperations.keys().next().value;
        if (!oldestKey) break;
        this.activeOperations.delete(oldestKey);
      }
    }

    for (const [key, entry] of this.idempotencyRegistry.entries()) {
      if (now - entry.timestamp > this.IDEMPOTENCY_TTL_MS) {
        this.idempotencyRegistry.delete(key);
      }
    }

    while (this.idempotencyRegistry.size > this.MAX_IDEMPOTENCY) {
      const oldestKey = this.idempotencyRegistry.keys().next().value;
      if (!oldestKey) break;
      this.idempotencyRegistry.delete(oldestKey);
    }
  }

  static createOperation(plan: ChangePlan, operationType: string): TrackedOperation {
    this.prune();

    // Check 24-hour idempotency key registry
    const existing = this.idempotencyRegistry.get(plan.idempotencyKey);
    if (existing && Date.now() - existing.timestamp < this.IDEMPOTENCY_TTL_MS) {
      const active = this.activeOperations.get(existing.operationId);
      if (active) return active;
    }

    const operationId = `op_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    const tracked: TrackedOperation = {
      operationId,
      changeId: plan.changeId,
      routerId: plan.routerId,
      operationType,
      state: 'queued',
      idempotencyKey: plan.idempotencyKey,
      payloadHash: plan.previousStateHash,
      previousStateHash: plan.previousStateHash,
      startedAt: Date.now(),
      evidence: [`Plan created for change ${plan.changeId} with risk level ${plan.riskLevel}`],
      steps: [],
      authorId: plan.authorId,
    };

    this.activeOperations.set(operationId, tracked);
    this.idempotencyRegistry.set(plan.idempotencyKey, { operationId, timestamp: Date.now() });
    return tracked;
  }

  static updateState(operationId: string, newState: OperationState, evidenceNote?: string, postStateHash?: string): TrackedOperation {
    const op = this.activeOperations.get(operationId);
    if (!op) {
      throw new Error(`Operation ${operationId} not found in state tracker`);
    }

    op.state = newState;
    if (evidenceNote) {
      op.evidence.push(`[${new Date().toISOString()}] ${evidenceNote}`);
      if (op.evidence.length > this.MAX_EVIDENCE_PER_OP) {
        op.evidence = op.evidence.slice(-this.MAX_EVIDENCE_PER_OP);
      }
    }
    if (postStateHash) op.postStateHash = postStateHash;

    if (['succeeded', 'failed', 'partially_succeeded', 'cancelled', 'outcome_unknown', 'diverged'].includes(newState)) {
      op.finishedAt = Date.now();
      this.prune();
    }

    return op;
  }

  static recordStep(operationId: string, commandJson: string, status: OperationStepLog['status'], evidence?: string): OperationStepLog {
    const op = this.activeOperations.get(operationId);
    if (!op) {
      throw new Error(`Operation ${operationId} not found in state tracker`);
    }

    const seq = op.steps.length + 1;
    const step: OperationStepLog = {
      operationId,
      seq,
      command: commandJson,
      status,
      evidence,
      at: Date.now(),
    };

    op.steps.push(step);
    if (op.steps.length > this.MAX_STEPS_PER_OP) {
      op.steps = op.steps.slice(-this.MAX_STEPS_PER_OP);
    }
    return step;
  }

  static getOperation(operationId: string): TrackedOperation | undefined {
    return this.activeOperations.get(operationId);
  }

  static getActiveOperations(): TrackedOperation[] {
    return Array.from(this.activeOperations.values());
  }

  static toOperationResult(op: TrackedOperation): OperationResult {
    return {
      operationId: op.operationId,
      changeId: op.changeId,
      routerId: op.routerId,
      state: op.state,
      startedAt: op.startedAt,
      finishedAt: op.finishedAt,
      postStateHash: op.postStateHash,
      evidence: op.evidence,
    };
  }
}
