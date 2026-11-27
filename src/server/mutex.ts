// ============================================================
// قفل التزامن — يمنع توليد باتشين في نفس اللحظة ويحمي الموارد
// ============================================================

export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;
  private onIdleCleanup?: () => void;

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
    } else if (this.onIdleCleanup) {
      const cb = this.onIdleCleanup;
      this.onIdleCleanup = undefined;
      cb();
    }
  }

  public scheduleIdleCleanup(cb: () => void): void {
    if (!this.locked && this.queue.length === 0) {
      cb();
    } else {
      this.onIdleCleanup = cb;
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

export function deleteRouterMutex(routerId: string): boolean {
  const existing = routerLocks.get(routerId);
  if (!existing) return false;
  existing.scheduleIdleCleanup(() => {
    if (routerLocks.get(routerId) === existing && !existing.isLocked && existing.queueLength === 0) {
      routerLocks.delete(routerId);
    }
  });
  return true;
}

export function clearRouterLocks(): void {
  for (const [id, mutex] of routerLocks.entries()) {
    if (!mutex.isLocked && mutex.queueLength === 0) {
      routerLocks.delete(id);
    }
  }
}

export function getRouterLockCount(): number {
  return routerLocks.size;
}
