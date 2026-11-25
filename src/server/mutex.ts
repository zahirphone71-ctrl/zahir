// ============================================================
// قفل التزامن — يمنع توليد باتشين في نفس اللحظة ويحمي الموارد
// ============================================================

export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          resolve(this.release.bind(this));
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  private release(): void {
    this.locked = false;
    const next = this.queue.shift();
    if (next) {
      // إعطاء فرصة للمهام الأخرى للتنفيذ دون تجميد الحلقة
      setImmediate(next);
    }
  }

  get isLocked(): boolean {
    return this.locked;
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

// قفل عام لمنع التوليد المتوازي
export const globalGenerateMutex = new Mutex();

// أقفال لكل راوتر لمنع المزامنة المتوازية لنفس الراوتر
const routerLocks = new Map<string, Mutex>();

export function getRouterMutex(routerId: string): Mutex {
  if (!routerLocks.has(routerId)) {
    routerLocks.set(routerId, new Mutex());
  }
  return routerLocks.get(routerId)!;
}
