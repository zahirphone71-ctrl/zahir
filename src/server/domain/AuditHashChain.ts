import crypto from 'crypto';
import { AuditLogEvent } from '../../types/governance';
import { StateHashCalculator } from './StateHashCalculator';

export class AuditHashChain {
  private static lastHash: string = '0000000000000000000000000000000000000000000000000000000000000000';
  private static sequenceCounter: number = 0;
  private static inMemoryLogs: AuditLogEvent[] = [];

  static initializeLastHash(hash: string, sequence: number): void {
    if (hash && hash.length === 64) {
      this.lastHash = hash;
    }
    this.sequenceCounter = sequence;
  }

  static createEvent(params: {
    actorId: string;
    actorIp: string;
    action: string;
    resource: string;
    resourceId?: string;
    routerId?: string;
    result: 'success' | 'failure' | 'indeterminate';
    reason?: string;
    changes?: { before: unknown; after: unknown };
    correlationId?: string;
    requestId?: string;
  }): AuditLogEvent {
    this.sequenceCounter += 1;
    const now = Date.now();
    const eventId = `audit_${now}_${Math.random().toString(36).substring(2, 9)}`;

    // Redact any sensitive passwords or tokens from changes
    const redactedChanges = params.changes ? this.redactSecrets(params.changes) : undefined;

    const canonicalPayload = StateHashCalculator.canonicalStringify({
      seq: this.sequenceCounter,
      actorId: params.actorId,
      actorIp: params.actorIp,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId || '',
      routerId: params.routerId || '',
      result: params.result,
      reason: params.reason || '',
      changes: redactedChanges,
      createdAt: now,
    });

    const hash = crypto
      .createHash('sha256')
      .update(this.lastHash + canonicalPayload, 'utf8')
      .digest('hex');

    const auditEvent: AuditLogEvent = {
      id: eventId,
      seq: this.sequenceCounter,
      actorId: params.actorId,
      actorIp: params.actorIp,
      uaHash: crypto.createHash('sha256').update(params.actorIp).digest('hex').substring(0, 16),
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      routerId: params.routerId,
      result: params.result,
      reason: params.reason,
      changes: redactedChanges,
      correlationId: params.correlationId || eventId,
      requestId: params.requestId || eventId,
      createdAt: now,
      prevHash: this.lastHash,
      hash: hash,
    };

    this.lastHash = hash;
    this.inMemoryLogs.push(auditEvent);

    // Keep memory cache bounded (max 500 recent items)
    if (this.inMemoryLogs.length > 500) {
      this.inMemoryLogs.shift();
    }

    return auditEvent;
  }

  static verifyChain(events: AuditLogEvent[]): { valid: boolean; brokenAtSequence?: number } {
    let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (i > 0 && event.prevHash !== expectedPrevHash) {
        return { valid: false, brokenAtSequence: event.seq };
      }

      const canonicalPayload = StateHashCalculator.canonicalStringify({
        seq: event.seq,
        actorId: event.actorId,
        actorIp: event.actorIp,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId || '',
        routerId: event.routerId || '',
        result: event.result,
        reason: event.reason || '',
        changes: event.changes,
        createdAt: event.createdAt,
      });

      const calculatedHash = crypto
        .createHash('sha256')
        .update(event.prevHash + canonicalPayload, 'utf8')
        .digest('hex');

      if (calculatedHash !== event.hash) {
        return { valid: false, brokenAtSequence: event.seq };
      }

      expectedPrevHash = event.hash;
    }

    return { valid: true };
  }

  static getRecentLogs(limit: number = 50): AuditLogEvent[] {
    return [...this.inMemoryLogs].reverse().slice(0, limit);
  }

  private static redactSecrets<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;
    const jsonStr = JSON.stringify(obj);
    const redacted = jsonStr.replace(
      /("(password|pass|secret|token|key|pwd|twoFactorSecret)":\s*")([^"]+)(")/gi,
      '$1[REDACTED]$4'
    );
    return JSON.parse(redacted);
  }
}
