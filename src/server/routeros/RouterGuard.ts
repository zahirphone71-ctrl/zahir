import { RouterOSExecutor } from './RouterOSExecutor';

export class RouterGuard {
  private static circuitOpen = new Map<string, boolean>();
  private static failures = new Map<string, number>();

  static async canProceed(executor: RouterOSExecutor, routerId: string = 'default'): Promise<{ ok: boolean; reason?: string }> {
    if (this.circuitOpen.get(routerId)) {
      return { ok: false, reason: 'الدائرة الكهرومغناطيسية مفتوحة مؤقتًا — الراوتر تحت ضغط سابق أو في حالة استعادة' };
    }

    try {
      const health = await executor.getHealth();
      if (health.cpuLoad > 85) {
        this.openCircuit(routerId);
        return { ok: false, reason: `معالج الراوتر مشغوص جداً (${health.cpuLoad}%) — تم تأجيل العملية لحماية أداء الشبكة` };
      }
      if (health.freeMemory > 0 && health.freeMemory < 4 * 1024 * 1024) {
        return { ok: false, reason: 'ذاكرة الراوتر الحرة منخفضة للغاية (< 4MB)' };
      }
      return { ok: true };
    } catch {
      // If health query fails or times out, proceed with caution rather than completely blocking
      return { ok: true };
    }
  }

  private static openCircuit(routerId: string): void {
    this.circuitOpen.set(routerId, true);
    setTimeout(() => this.circuitOpen.set(routerId, false), 30_000);
  }

  static recordSuccess(routerId: string = 'default'): void {
    this.failures.set(routerId, 0);
  }

  static recordFailure(routerId: string = 'default'): void {
    const f = (this.failures.get(routerId) || 0) + 1;
    this.failures.set(routerId, f);
    if (f >= 3) this.openCircuit(routerId);
  }
}
