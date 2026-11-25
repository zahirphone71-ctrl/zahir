export class RouterGuard {
  private static circuit = new Map<string, boolean>();
  private static failures = new Map<string, number>();
  private static lastCheck = new Map<string, number>();
  private static cachedCpu = new Map<string, number>();

  static async canProceed(token: string, forceCheck = false): Promise<{ ok: boolean; reason?: string; cpu?: number }> {
    const key = token || 'default';
    if (this.circuit.get(key)) {
      return { ok: false, reason: 'الدائرة مفتوحة مؤقتاً — الراوتر تحت ضغط سابق', cpu: this.cachedCpu.get(key) || 0 };
    }
    const now = Date.now();
    if (forceCheck || now - (this.lastCheck.get(key) || 0) > 10_000) {
      try {
        const res = await fetch('/api/vouchers/precheck', { headers: { 'X-Router-Token': key } });
        if (res.ok) {
          const data = await res.json();
          this.lastCheck.set(key, now);
          const cpu = data?.data?.routerInfo?.cpuLoad ?? 0;
          const freeMem = data?.data?.routerInfo?.freeMemory ?? Infinity;
          this.cachedCpu.set(key, cpu);

          if (cpu > 80) {
            this.circuit.set(key, true);
            setTimeout(() => this.circuit.set(key, false), 30_000);
            return { ok: false, reason: `استهلاك الراوتر مرتفع جداً (CPU ${cpu}%) — يرجى الانتظار`, cpu };
          }
          if (freeMem < 5 * 1024 * 1024) {
            return { ok: false, reason: 'ذاكرة الراوتر منخفضة جداً (أقل من 5 ميجابايت)', cpu };
          }
        }
      } catch {
        return { ok: true, cpu: this.cachedCpu.get(key) || 0 };
      }
    }
    return { ok: true, cpu: this.cachedCpu.get(key) || 0 };
  }

  static recordSuccess(token: string): void {
    const key = token || 'default';
    this.failures.set(key, 0);
  }

  static recordFailure(token: string): void {
    const key = token || 'default';
    const f = (this.failures.get(key) || 0) + 1;
    this.failures.set(key, f);
    if (f >= 3) {
      this.circuit.set(key, true);
      setTimeout(() => this.circuit.set(key, false), 30_000);
    }
  }

  static getCpu(token?: string): number {
    const key = token || 'default';
    return this.cachedCpu.get(key) || 0;
  }

  static reset(token: string): void {
    const key = token || 'default';
    this.circuit.delete(key);
    this.failures.delete(key);
    this.lastCheck.delete(key);
    this.cachedCpu.delete(key);
  }
}
