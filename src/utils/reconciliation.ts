/**
 * Debounced State Reconciliation Utility for MikroTik Subscriber Management
 * Validates user input against MikroTik API responses before triggering operations
 * to prevent redundant API calls, eliminate duplicate network roundtrips, and ensure zero lag.
 */

export interface ReconciliationResult<T = any> {
  isRedundant: boolean;
  needsExecution: boolean;
  filteredIds?: string[];
  skippedCount?: number;
  changedFields?: Partial<T>;
  reason?: string;
}

/**
 * Reconcile a single subscriber's updated fields against the current MikroTik router state
 */
export function reconcileSubscriberEdit<T extends Record<string, any>>(
  current: T | undefined,
  updates: Partial<T>
): { isRedundant: boolean; changedFields: Partial<T>; reason?: string } {
  if (!current) {
    return { isRedundant: false, changedFields: updates };
  }

  const changedFields: Partial<T> = {};
  let hasActualChange = false;

  for (const key of Object.keys(updates) as (keyof T)[]) {
    const newVal = updates[key];
    if (newVal === undefined) continue;

    const currVal = current[key];

    // Normalize comparison for numbers, strings, and booleans
    const isSame = 
      newVal === currVal ||
      (typeof newVal === 'string' && typeof currVal === 'string' && newVal.trim() === currVal.trim()) ||
      (typeof newVal === 'number' && typeof currVal === 'number' && Number(newVal) === Number(currVal)) ||
      (newVal === '' && (currVal === undefined || currVal === null || currVal === ''));

    if (!isSame) {
      changedFields[key] = newVal;
      hasActualChange = true;
    }
  }

  if (!hasActualChange) {
    return {
      isRedundant: true,
      changedFields: {},
      reason: 'البيانات المدخلة مطابقة تماماً للحالة المخزنة حالياً في الراوتر'
    };
  }

  return { isRedundant: false, changedFields };
}

/**
 * Reconcile batch action inputs against existing MikroTik entities
 */
export function reconcileBatchAction(
  system: 'hotspot' | 'pppoe' | 'userman',
  action: 'change_profile' | 'toggle_status' | 'renew' | 'disconnect' | 'delete' | 'edit',
  ids: string[],
  payload: any,
  existingItems: Array<{ id: string; name?: string; profile?: string; disabled?: boolean; [key: string]: any }>
): ReconciliationResult {
  const itemMap = new Map<string, any>();
  existingItems.forEach((item) => {
    if (item.id) itemMap.set(item.id, item);
    if ((item as any)['.id']) itemMap.set((item as any)['.id'], item);
    if (item.name) itemMap.set(item.name.toLowerCase(), item);
  });

  if (action === 'change_profile') {
    const newProfile = payload?.profile;
    const resetLimits = payload?.resetLimits ?? true;

    // If resetLimits is false, subscribers who already have newProfile do not need modification
    if (!resetLimits && newProfile) {
      const actionableIds: string[] = [];
      let skippedCount = 0;

      for (const id of ids) {
        const existing = itemMap.get(id) || itemMap.get(id.toLowerCase());
        if (existing && existing.profile === newProfile) {
          skippedCount++;
        } else {
          actionableIds.push(id);
        }
      }

      if (actionableIds.length === 0) {
        return {
          isRedundant: true,
          needsExecution: false,
          filteredIds: [],
          skippedCount,
          reason: `جميع المشتركين المحددين (${skippedCount}) مسجلون بالفعل على باقة "${newProfile}"`
        };
      }

      return {
        isRedundant: false,
        needsExecution: true,
        filteredIds: actionableIds,
        skippedCount,
        reason: skippedCount > 0 ? `تم تخطي ${skippedCount} مشترك لديهم نفس الباقة مسبقاً` : undefined
      };
    }
  }

  if (action === 'toggle_status') {
    const enable = payload?.enable;
    const targetDisabled = !enable;

    const actionableIds: string[] = [];
    let skippedCount = 0;

    for (const id of ids) {
      const existing = itemMap.get(id) || itemMap.get(id.toLowerCase());
      if (existing && Boolean(existing.disabled) === targetDisabled) {
        skippedCount++;
      } else {
        actionableIds.push(id);
      }
    }

    if (actionableIds.length === 0) {
      const stateLabel = enable ? 'مفعلون' : 'معلقون';
      return {
        isRedundant: true,
        needsExecution: false,
        filteredIds: [],
        skippedCount,
        reason: `جميع المشتركين المحددين (${skippedCount}) هم بالفعل في حالة (${stateLabel}) في الراوتر`
      };
    }

    return {
      isRedundant: false,
      needsExecution: true,
      filteredIds: actionableIds,
      skippedCount,
      reason: skippedCount > 0 ? `تم تخطي ${skippedCount} مشترك حالتهم مطابقة بالفعل` : undefined
    };
  }

  // Default: All selected valid IDs proceed
  return {
    isRedundant: false,
    needsExecution: true,
    filteredIds: ids,
    skippedCount: 0
  };
}

/**
 * Lightweight debouncer to coalesce rapid repeated operations
 */
export class ActionDebouncer {
  private pending = new Map<string, { timer: ReturnType<typeof setTimeout>; reject: (reason?: any) => void }>();

  debounce<T>(key: string, fn: () => Promise<T>, delayMs: number = 250): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      this.pending.delete(key);
      const cancelErr: any = new Error('DEBOUNCED_SUPERSEDED');
      cancelErr.isDebouncedCancelled = true;
      existing.reject(cancelErr);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        this.pending.delete(key);
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      }, delayMs);

      this.pending.set(key, { timer, reject });
    });
  }

  cancel(key?: string): void {
    if (key) {
      const entry = this.pending.get(key);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(key);
        const cancelErr: any = new Error('DEBOUNCED_CANCELLED');
        cancelErr.isDebouncedCancelled = true;
        entry.reject(cancelErr);
      }
      return;
    }

    for (const [k, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      this.pending.delete(k);
      const cancelErr: any = new Error('DEBOUNCED_CANCELLED');
      cancelErr.isDebouncedCancelled = true;
      entry.reject(cancelErr);
    }
  }
}
