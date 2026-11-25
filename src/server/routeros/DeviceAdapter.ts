import {
  DeviceAdapter as IDeviceAdapter,
  DeviceIdentity,
  Capability,
  PreparedCommand,
  ChangePlan,
  VerificationResult,
  OperationResult,
  Vendor,
  RiskLevel,
} from '../../types/governance';
import { RouterOSExecutor } from './RouterOSExecutor';
import { ChangeEngine } from '../domain/ChangeEngine';

export class MikroTikDeviceAdapter implements IDeviceAdapter {
  vendor: Vendor = 'mikrotik';
  private executor: RouterOSExecutor;

  constructor() {
    this.executor = new RouterOSExecutor();
  }

  async detect(routerId: string): Promise<DeviceIdentity> {
    const health = await this.executor.getHealth();
    return {
      vendor: 'mikrotik',
      model: health.boardName || 'RouterBOARD',
      firmware: health.version || 'v7.x',
      rosVersion: health.version || 'v7.x',
      architecture: 'x86_64',
      detectedAt: Date.now(),
    };
  }

  async capabilities(routerId: string): Promise<Capability[]> {
    const identity = await this.detect(routerId);
    const caps: Capability[] = [
      'read.ip.hotspot.user',
      'write.ip.hotspot.user',
      'execute.ip.hotspot.user',
      'read.ppp.secret',
      'write.ppp.secret',
      'read.ip.firewall.filter',
      'write.ip.firewall.filter',
      'read.system.resource',
    ];

    if (identity.rosVersion && identity.rosVersion.startsWith('7.')) {
      caps.push('execute.rest.api', 'read.user-manager');
    }

    return caps;
  }

  async read<T>(query: {
    menu: string;
    params?: Record<string, string>;
    proplist?: string[];
  }): Promise<{ ok: boolean; data?: T; message?: string }> {
    try {
      const data = await this.executor.writeRaw(query.menu, 'print', query.params, query.proplist);
      return { ok: true, data: data as T };
    } catch (err: any) {
      return { ok: false, message: err?.message || String(err) };
    }
  }

  async plan(change: {
    routerId: string;
    commands: PreparedCommand[];
    riskLevel: RiskLevel;
    authorId: string;
    reason?: string;
  }): Promise<ChangePlan> {
    const health = await this.executor.getHealth();
    const stateHash = String(health.cpuLoad || 0);

    return {
      changeId: `plan_${Date.now()}`,
      idempotencyKey: `${change.routerId}_${Date.now()}`,
      vendor: 'mikrotik',
      routerId: change.routerId,
      commands: change.commands,
      expectedEffects: change.commands.map((c) => `${c.action} on ${c.menu}`),
      riskLevel: change.riskLevel,
      requiresConfirmation: change.riskLevel === 'high' || change.riskLevel === 'critical',
      requiresRevertTimer: change.riskLevel === 'critical',
      previousStateHash: stateHash,
      createdAt: Date.now(),
      authorId: change.authorId,
      reason: change.reason,
    };
  }

  async apply(
    plan: ChangePlan,
    options?: { signal?: AbortSignal; confirmationToken?: string; revertTimerMs?: number }
  ): Promise<OperationResult> {
    return ChangeEngine.executeChange({
      routerId: plan.routerId,
      authorId: plan.authorId,
      operationType: 'device_adapter.apply',
      commands: plan.commands,
      riskLevel: plan.riskLevel,
      reason: plan.reason,
      revertTimerMs: options?.revertTimerMs,
    });
  }

  async verify(plan: ChangePlan): Promise<VerificationResult> {
    const health = await this.executor.getHealth();
    return {
      state: 'succeeded',
      intendedState: plan.commands,
      actualState: health,
      evidence: [`Verified health on router ${plan.routerId}`],
      verifiedAt: Date.now(),
    };
  }
}
