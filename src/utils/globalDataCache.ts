/**
 * Global Data Cache layer for MikroTik RouterOS using IndexedDB
 * Persists non-volatile router profiles, configurations, and subscriber records
 * to eliminate repetitive API calls, reduce router CPU strain, and deliver 0ms UI load speeds.
 */

const DB_NAME = 'zahir_mikrotik_global_cache_v2';
const DB_VERSION = 2;

export type GlobalCacheStore =
  | 'hotspot_users'
  | 'ppp_secrets'
  | 'userman_users'
  | 'hotspot_profiles'
  | 'ppp_profiles'
  | 'userman_profiles'
  | 'server_profiles'
  | 'network_interfaces'
  | 'wireless_interfaces'
  | 'hotspot_servers'
  | 'router_files';

interface CacheMetadata {
  key: string;
  timestamp: number;
  count: number;
  routerHost?: string;
  hash?: string;
}

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase | null> | null = null;

export function getGlobalCacheDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        const storeNames: GlobalCacheStore[] = [
          'hotspot_users',
          'ppp_secrets',
          'userman_users',
          'hotspot_profiles',
          'ppp_profiles',
          'userman_profiles',
          'server_profiles',
          'network_interfaces',
          'wireless_interfaces',
          'hotspot_servers',
          'router_files'
        ];

        for (const storeName of storeNames) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'cacheKey' });
          }
        }

        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event: Event) => {
        dbInstance = (event.target as IDBOpenDBRequest).result;
        resolve(dbInstance);
      };

      request.onerror = (err) => {
        console.warn('Global Cache IndexedDB failed to open, falling back to memory:', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('Global Cache IndexedDB initialization exception:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Save records to Global Data Cache asynchronously (Non-blocking)
 */
export async function saveGlobalCache<T extends { id?: string; name?: string }>(
  storeName: GlobalCacheStore,
  items: T[],
  routerHost?: string,
  hash?: string
): Promise<void> {
  try {
    const db = await getGlobalCacheDB();
    if (!db) return;

    const tx = db.transaction([storeName, 'metadata'], 'readwrite');
    const store = tx.objectStore(storeName);
    const metaStore = tx.objectStore('metadata');

    store.clear();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = item.id || (item as any)['.id'] || item.name || `item-${i}`;
      store.put({ ...item, cacheKey: String(key) });
    }

    const meta: CacheMetadata = {
      key: `${storeName}_meta`,
      timestamp: Date.now(),
      count: items.length,
      routerHost,
      hash
    };
    metaStore.put(meta);

    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (err) {
    console.warn(`Could not save records to Global Cache (${storeName}):`, err);
  }
}

/**
 * Load cached records from Global Data Cache
 */
export async function loadGlobalCache<T>(
  storeName: GlobalCacheStore
): Promise<{ items: T[]; timestamp: number; count: number; hash?: string } | null> {
  try {
    const db = await getGlobalCacheDB();
    if (!db) return null;

    const tx = db.transaction([storeName, 'metadata'], 'readonly');
    const store = tx.objectStore(storeName);
    const metaStore = tx.objectStore('metadata');

    const getAllReq = store.getAll();
    const getMetaReq = metaStore.get(`${storeName}_meta`);

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        const rawItems = getAllReq.result || [];
        const meta = getMetaReq.result as CacheMetadata | undefined;

        const items = rawItems.map((entry: any) => {
          const { cacheKey, ...rest } = entry;
          return rest as T;
        });

        resolve({
          items,
          timestamp: meta?.timestamp || Date.now(),
          count: items.length,
          hash: meta?.hash
        });
      };

      tx.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn(`Could not load records from Global Cache (${storeName}):`, err);
    return null;
  }
}

/**
 * Clear records from Global Data Cache
 */
export async function clearGlobalCache(storeName?: GlobalCacheStore): Promise<void> {
  try {
    const db = await getGlobalCacheDB();
    if (!db) return;

    const storesToClear: string[] = storeName
      ? [storeName]
      : [
          'hotspot_users',
          'ppp_secrets',
          'userman_users',
          'hotspot_profiles',
          'ppp_profiles',
          'userman_profiles',
          'server_profiles',
          'network_interfaces',
          'wireless_interfaces',
          'hotspot_servers',
          'router_files',
          'metadata'
        ];

    const tx = db.transaction(storesToClear, 'readwrite');
    for (const s of storesToClear) {
      if (db.objectStoreNames.contains(s)) {
        tx.objectStore(s).clear();
      }
    }
  } catch (err) {
    console.warn('Could not clear Global Cache:', err);
  }
}

// Backward Compatibility Aliases
export const saveSubscribersToCache = saveGlobalCache;
export const loadSubscribersFromCache = loadGlobalCache;
export const clearSubscribersCache = clearGlobalCache;

/**
 * Automatically prune cache stores whose metadata timestamp is older than maxAgeMs (default: 48h)
 * Prevents IndexedDB disk bloat on workstations running for weeks
 */
export async function pruneStaleGlobalCache(maxAgeMs: number = 48 * 60 * 60 * 1000): Promise<void> {
  try {
    const db = await getGlobalCacheDB();
    if (!db || !db.objectStoreNames.contains('metadata')) return;
    const tx = db.transaction(['metadata'], 'readonly');
    const metaStore = tx.objectStore('metadata');
    const getAllReq = metaStore.getAll();
    getAllReq.onsuccess = () => {
      const records = (getAllReq.result || []) as CacheMetadata[];
      const now = Date.now();
      for (const rec of records) {
        if (rec.timestamp && now - rec.timestamp > maxAgeMs) {
          const storeName = rec.key.replace('_meta', '') as GlobalCacheStore;
          clearGlobalCache(storeName).catch(() => {});
        }
      }
    };
  } catch {}
}

let pruneInitialTimeout: ReturnType<typeof setTimeout> | null = null;
let pruneIntervalTimer: ReturnType<typeof setInterval> | null = null;

export function stopGlobalCachePruner(): void {
  if (pruneInitialTimeout) {
    clearTimeout(pruneInitialTimeout);
    pruneInitialTimeout = null;
  }
  if (pruneIntervalTimer) {
    clearInterval(pruneIntervalTimer);
    pruneIntervalTimer = null;
  }
}

if (typeof window !== 'undefined') {
  stopGlobalCachePruner();
  pruneInitialTimeout = setTimeout(() => {
    pruneInitialTimeout = null;
    void pruneStaleGlobalCache();
  }, 15000);
  pruneIntervalTimer = setInterval(() => {
    void pruneStaleGlobalCache();
  }, 6 * 60 * 60 * 1000);
}
