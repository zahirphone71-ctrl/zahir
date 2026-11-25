// Safe LocalStorage Wrapper with in-memory fallback and sensitive-token confinement
// Guarantees zero crashes even in restricted iframes, private browsing, or sandboxed environments
// AND prevents active session bearer tokens from ever being persisted in plaintext to localStorage/sessionStorage.

const memoryStore: Record<string, string> = {};

/**
 * Auth/session bearer token keys that MUST stay strictly in volatile JS memory
 * and never be written to persistent browser storage (localStorage/sessionStorage).
 */
export const SENSITIVE_MEMORY_ONLY_KEYS = new Set<string>([
  'zcontrol_active_token',
  'zctrl_router_token',
  'zahir_auth_token',
]);

function purgeKeyFromWebStorage(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore restricted storage access
  }
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore restricted storage access
  }
}

export const safeStorage = {
  getItem: (key: string): string | null => {
    if (SENSITIVE_MEMORY_ONLY_KEYS.has(key)) {
      purgeKeyFromWebStorage(key);
      return memoryStore[key] ?? null;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Access denied or not available
    }
    return memoryStore[key] ?? null;
  },

  setItem: (key: string, value: string): void => {
    if (SENSITIVE_MEMORY_ONLY_KEYS.has(key)) {
      memoryStore[key] = value;
      purgeKeyFromWebStorage(key);
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Access denied or quota exceeded
    }
    memoryStore[key] = value;
  },

  removeItem: (key: string): void => {
    if (SENSITIVE_MEMORY_ONLY_KEYS.has(key)) {
      delete memoryStore[key];
      purgeKeyFromWebStorage(key);
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Access denied
    }
    delete memoryStore[key];
  },

  getJSON: <T = any>(key: string, fallback: T): T => {
    try {
      const val = safeStorage.getItem(key);
      if (!val) return fallback;
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  },

  setJSON: (key: string, value: any): void => {
    try {
      safeStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }
};

const sessionMemoryStore: Record<string, string> = {};

export const safeSession = {
  getItem: (key: string): string | null => {
    if (SENSITIVE_MEMORY_ONLY_KEYS.has(key)) {
      purgeKeyFromWebStorage(key);
      return sessionMemoryStore[key] ?? null;
    }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        return window.sessionStorage.getItem(key);
      }
    } catch {
      // Access denied in sandboxed iframe
    }
    return sessionMemoryStore[key] ?? null;
  },

  setItem: (key: string, value: string): void => {
    if (SENSITIVE_MEMORY_ONLY_KEYS.has(key)) {
      sessionMemoryStore[key] = value;
      purgeKeyFromWebStorage(key);
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(key, value);
        return;
      }
    } catch {
      // Access denied
    }
    sessionMemoryStore[key] = value;
  },

  removeItem: (key: string): void => {
    if (SENSITIVE_MEMORY_ONLY_KEYS.has(key)) {
      delete sessionMemoryStore[key];
      purgeKeyFromWebStorage(key);
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Access denied
    }
    delete sessionMemoryStore[key];
  }
};

export default safeStorage;
