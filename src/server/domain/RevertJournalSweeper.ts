import { RevertJournalRecord, PreparedCommand } from '../../types/governance';
import { StateHashCalculator } from './StateHashCalculator';
import { AuditHashChain } from './AuditHashChain';
import { RouterOSExecutor } from '../routeros/RouterOSExecutor';

export class RevertJournalSweeper {
  private static journal = new Map<string, RevertJournalRecord>();
  private static sweeperInterval: NodeJS.Timeout | null = null;
  private static isRunning = false;

  static startSweeper(): void {
    if (this.sweeperInterval) return;
    this.sweeperInterval = setInterval(() => this.sweep(), 5000);
    console.log('🔄 [RevertJournalSweeper] تم تفعيل مراقب مؤقتات التراجع التلقائية (كل 5 ثوانٍ)');
  }

  static stopSweeper(): void {
    if (this.sweeperInterval) {
      clearInterval(this.sweeperInterval);
      this.sweeperInterval = null;
    }
  }

  static registerRevertPlan(params: {
    changeId: string;
    routerId: string;
    appliedStateHash: string;
    revertCommands: PreparedCommand[];
    deadlineMs?: number;
  }): RevertJournalRecord {
    const deadlineMs = params.deadlineMs || 120_000; // 120 seconds default
    const now = Date.now();
    const record: RevertJournalRecord = {
      changeId: params.changeId,
      routerId: params.routerId,
      vendor: 'mikrotik',
      appliedAt: now,
      appliedStateHash: params.appliedStateHash,
      revertCommands: params.revertCommands,
      deadlineAt: now + deadlineMs,
      status: 'pending',
      attemptCount: 0,
      evidence: [`Revert timer set for ${deadlineMs / 1000}s`],
    };

    this.journal.set(params.changeId, record);
    AuditHashChain.createEvent({
      actorId: 'system_revert_sweeper',
      actorIp: '127.0.0.1',
      action: 'revert_timer.register',
      resource: 'revert_journal',
      resourceId: params.changeId,
      routerId: params.routerId,
      result: 'success',
      reason: `Registered 120s auto-revert deadline for change ${params.changeId}`,
    });

    return record;
  }

  static confirmChange(changeId: string, actorId: string): boolean {
    const record = this.journal.get(changeId);
    if (!record || record.status !== 'pending') return false;

    record.status = 'confirmed';
    record.confirmedAt = Date.now();
    record.evidence?.push(`Confirmed by admin ${actorId}`);

    AuditHashChain.createEvent({
      actorId,
      actorIp: '127.0.0.1',
      action: 'revert_timer.confirm',
      resource: 'revert_journal',
      resourceId: changeId,
      routerId: record.routerId,
      result: 'success',
      reason: `Admin confirmed change ${changeId}. Auto-revert cancelled.`,
    });

    return true;
  }

  private static async sweep(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = Date.now();
      const TERMINAL_TTL_MS = 15 * 60 * 1000;
      for (const [changeId, record] of this.journal.entries()) {
        if (record.status === 'pending' && now >= record.deadlineAt) {
          console.warn(`⚠️ [RevertJournalSweeper] انتهت مهلة التأكيد للتغيير ${record.changeId}. جاري بدء التراجع الآلي...`);
          await this.executeAutoRevert(record);
        } else if (record.status !== 'pending') {
          const settledAt = record.confirmedAt || record.lastAttemptAt || record.deadlineAt || record.appliedAt;
          if (now - settledAt > TERMINAL_TTL_MS) {
            this.journal.delete(changeId);
          }
        }
      }

      // Hard cap safety for non-pending entries
      if (this.journal.size > 500) {
        for (const [changeId, record] of this.journal.entries()) {
          if (this.journal.size <= 300) break;
          if (record.status !== 'pending') {
            this.journal.delete(changeId);
          }
        }
      }
    } catch (err) {
      console.error('❌ [RevertJournalSweeper] خطأ أثناء فحص مؤقتات التراجع:', err);
    } finally {
      this.isRunning = false;
    }
  }

  private static async executeAutoRevert(record: RevertJournalRecord): Promise<void> {
    record.attemptCount += 1;
    record.lastAttemptAt = Date.now();

    try {
      const executor = new RouterOSExecutor();
      
      // Verify router current state hash before reverting
      const currentState = await executor.getHealth();
      const currentHash = StateHashCalculator.calculateHash(currentState);

      // Execute revert commands
      for (const cmd of record.revertCommands) {
        await executor.writeRaw(cmd.menu, cmd.action, cmd.params);
      }

      record.status = 'reverted';
      record.evidence?.push(`Auto-reverted successfully at ${new Date().toISOString()}`);

      AuditHashChain.createEvent({
        actorId: 'system_revert_sweeper',
        actorIp: '127.0.0.1',
        action: 'revert_timer.auto_revert',
        resource: 'revert_journal',
        resourceId: record.changeId,
        routerId: record.routerId,
        result: 'success',
        reason: `Auto-reverted unconfirmed change ${record.changeId} after 120s deadline expiry.`,
      });
    } catch (err: any) {
      record.status = 'expired_unknown';
      record.evidence?.push(`Failed auto-revert: ${err?.message || err}`);

      AuditHashChain.createEvent({
        actorId: 'system_revert_sweeper',
        actorIp: '127.0.0.1',
        action: 'revert_timer.auto_revert_failed',
        resource: 'revert_journal',
        resourceId: record.changeId,
        routerId: record.routerId,
        result: 'failure',
        reason: `Auto-revert failed: ${err?.message || err}. Flagged attention=true on router.`,
      });
    }
  }

  static getRecord(changeId: string): RevertJournalRecord | undefined {
    return this.journal.get(changeId);
  }

  static getPendingRecords(): RevertJournalRecord[] {
    return Array.from(this.journal.values()).filter((r) => r.status === 'pending');
  }
}
