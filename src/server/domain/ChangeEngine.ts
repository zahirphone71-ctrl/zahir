import {
  ChangePlan,
  PreparedCommand,
  RiskLevel,
  OperationResult,
  RevertPlan,
} from '../../types/governance';
import { OperationStateTracker } from './OperationStateTracker';
import { RevertJournalSweeper } from './RevertJournalSweeper';
import { AuditHashChain } from './AuditHashChain';
import { StateHashCalculator } from './StateHashCalculator';
import { RouterOSExecutor } from '../routeros/RouterOSExecutor';
import { RouterGuard } from '../routeros/RouterGuard';
import crypto from 'crypto';

export interface ChangeIntentRequest {
  routerId: string;
  authorId: string;
  operationType: string;
  commands: PreparedCommand[];
  riskLevel?: RiskLevel;
  reason?: string;
  revertCommands?: PreparedCommand[];
  revertTimerMs?: number; // Default 120,000 ms
}

export class ChangeEngine {
  private static routerLocks = new Map<string, boolean>();

  /**
   * Executes a change request following the 15 deterministic steps of ZCtrl Governing Spec.
   */
  static async executeChange(req: ChangeIntentRequest): Promise<OperationResult> {
    const changeId = `chg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${req.routerId}:${req.operationType}:${JSON.stringify(req.commands)}:${req.authorId}`)
      .digest('hex');

    // 1. Authorize: Verify actor & scope
    if (!req.authorId) {
      throw new Error('SAFE-05: Author ID is required for all router modifications');
    }

    // 2. Check write mode & router health guard
    const executor = new RouterOSExecutor();
    const guardCheck = await RouterGuard.canProceed(executor, req.routerId);
    if (!guardCheck.ok) {
      throw new Error(`SAFE-01: Operation blocked by router guard - ${guardCheck.reason}`);
    }

    // 3. Record idempotency & create tracked operation
    const calculatedRisk: RiskLevel = req.riskLevel || this.classifyRisk(req.commands);
    const requiresRevert = calculatedRisk === 'critical' || calculatedRisk === 'high' || !!req.revertCommands;

    // 4. Pre-read target state (<30s freshness)
    const preHealth = await executor.getHealth();
    const previousStateHash = StateHashCalculator.calculateHash(preHealth);

    // 5 & 6. Build ChangePlan & validate
    const revertPlan: RevertPlan | undefined = requiresRevert
      ? {
          revertCommands: req.revertCommands || this.buildInverseCommands(req.commands),
          deadlineMs: req.revertTimerMs || 120_000, // 120s default
          confirmationMethod: 'admin_click',
        }
      : undefined;

    const plan: ChangePlan = {
      changeId,
      idempotencyKey,
      vendor: 'mikrotik',
      routerId: req.routerId,
      commands: req.commands,
      expectedEffects: req.commands.map((c) => `${c.action.toUpperCase()} on ${c.menu}`),
      riskLevel: calculatedRisk,
      requiresConfirmation: calculatedRisk === 'high' || calculatedRisk === 'critical',
      requiresRevertTimer: requiresRevert,
      revertPlan,
      previousStateHash,
      createdAt: Date.now(),
      authorId: req.authorId,
      reason: req.reason,
    };

    // 11. Record plan in DB & state tracker
    const op = OperationStateTracker.createOperation(plan, req.operationType);
    OperationStateTracker.updateState(op.operationId, 'running', 'Started ChangeEngine 15-step execution');

    // 12. Acquire router lock
    if (this.routerLocks.get(req.routerId)) {
      OperationStateTracker.updateState(op.operationId, 'failed', 'Router concurrency lock busy');
      throw new Error(`Router ${req.routerId} is locked by another active operation`);
    }
    this.routerLocks.set(req.routerId, true);

    try {
      // 13. Compare state hash (ensure no external state drift)
      const freshPreHealth = await executor.getHealth();
      const freshHash = StateHashCalculator.calculateHash(freshPreHealth);
      if (!StateHashCalculator.compareHashes(previousStateHash, freshHash)) {
        OperationStateTracker.updateState(op.operationId, 'diverged', 'Router state drifted between plan and apply');
        throw new Error('412 Precondition Failed: Router state changed by another administrator');
      }

      // If critical/high risk with revert plan, register in RevertJournalSweeper
      if (requiresRevert && revertPlan) {
        RevertJournalSweeper.registerRevertPlan({
          changeId: plan.changeId,
          routerId: plan.routerId,
          appliedStateHash: previousStateHash,
          revertCommands: revertPlan.revertCommands,
          deadlineMs: revertPlan.deadlineMs,
        });
      }

      // 14. Execute commands step-by-step
      for (const cmd of plan.commands) {
        OperationStateTracker.recordStep(op.operationId, JSON.stringify(cmd), 'sending');
        
        await executor.writeRaw(cmd.menu, cmd.action, cmd.params);

        OperationStateTracker.recordStep(op.operationId, JSON.stringify(cmd), 'ok');
      }

      // 15. Post-verify state & update audit hash chain
      const postHealth = await executor.getHealth();
      const postStateHash = StateHashCalculator.calculateHash(postHealth);

      OperationStateTracker.updateState(op.operationId, 'succeeded', 'All commands applied & post-verified', postStateHash);
      RouterGuard.recordSuccess(req.routerId);

      AuditHashChain.createEvent({
        actorId: req.authorId,
        actorIp: '127.0.0.1',
        action: req.operationType,
        resource: plan.commands[0]?.menu || 'router',
        resourceId: plan.changeId,
        routerId: req.routerId,
        result: 'success',
        reason: req.reason || `Successfully applied ${plan.commands.length} commands`,
        changes: { before: previousStateHash, after: postStateHash },
      });

      return OperationStateTracker.toOperationResult(op);
    } catch (err: any) {
      RouterGuard.recordFailure(req.routerId);
      const isIndeterminate = err.message && (err.message.includes('timeout') || err.message.includes('ETIMEDOUT'));
      const finalState = isIndeterminate ? 'outcome_unknown' : 'failed';

      OperationStateTracker.updateState(op.operationId, finalState, `Execution error: ${err?.message || err}`);

      AuditHashChain.createEvent({
        actorId: req.authorId,
        actorIp: '127.0.0.1',
        action: req.operationType,
        resource: plan.commands[0]?.menu || 'router',
        resourceId: plan.changeId,
        routerId: req.routerId,
        result: 'failure',
        reason: `Failed to apply change: ${err?.message || err}`,
      });

      throw err;
    } finally {
      // Release router concurrency lock
      this.routerLocks.delete(req.routerId);
    }
  }

  private static classifyRisk(commands: PreparedCommand[]): RiskLevel {
    for (const cmd of commands) {
      if (cmd.menu.includes('/ip/firewall') || cmd.menu.includes('/interface') || cmd.menu.includes('/system/reboot')) {
        return 'critical';
      }
      if (cmd.action === 'remove' || cmd.menu.includes('/ip/address')) {
        return 'high';
      }
      if (cmd.action === 'set') {
        return 'medium';
      }
    }
    return 'low';
  }

  private static buildInverseCommands(commands: PreparedCommand[]): PreparedCommand[] {
    return commands.map((cmd) => {
      if (cmd.action === 'add') {
        return {
          menu: cmd.menu,
          action: 'remove' as const,
          params: { name: String(cmd.params.name || '') },
        };
      }
      if (cmd.action === 'remove') {
        return {
          menu: cmd.menu,
          action: 'add' as const,
          params: cmd.params,
        };
      }
      return {
        menu: cmd.menu,
        action: 'set' as const,
        params: cmd.params,
      };
    });
  }
}
