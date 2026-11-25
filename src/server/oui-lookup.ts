import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.join(process.env.ZCTRL_DATA_DIR || path.join(process.cwd(), 'data'), 'oui_cache.json');
const MAX_OUI_CACHE_ENTRIES = 5000;
const MAX_LOOKUP_QUEUE = 500;
let ouiCache: Record<string, string> = {};
let saveTimer: NodeJS.Timeout | null = null;
let isSaving = false;
let dirty = false;

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        const keys = Object.keys(parsed);
        if (keys.length > MAX_OUI_CACHE_ENTRIES) {
          const trimmed: Record<string, string> = {};
          for (const k of keys.slice(-MAX_OUI_CACHE_ENTRIES)) {
            trimmed[k] = parsed[k];
          }
          ouiCache = trimmed;
        } else {
          ouiCache = parsed;
        }
      }
    }
  } catch (e) {
    console.error('Error loading OUI cache', e);
  }
}

function setCacheEntry(prefix: string, vendor: string) {
  if (!(prefix in ouiCache)) {
    const keys = Object.keys(ouiCache);
    if (keys.length >= MAX_OUI_CACHE_ENTRIES) {
      const evictCount = Math.max(1, keys.length - MAX_OUI_CACHE_ENTRIES + 200);
      for (let i = 0; i < evictCount; i++) {
        delete ouiCache[keys[i]];
      }
    }
  }
  ouiCache[prefix] = vendor;
}

async function flushCacheToDiskAsync() {
  if (isSaving || !dirty) return;
  isSaving = true;
  dirty = false;
  try {
    const dir = path.dirname(CACHE_FILE);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(CACHE_FILE, JSON.stringify(ouiCache, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving OUI cache', e);
  } finally {
    isSaving = false;
    if (dirty && !saveTimer) {
      scheduleSaveCache();
    }
  }
}

function scheduleSaveCache() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushCacheToDiskAsync();
  }, 3000);
  if (saveTimer.unref) saveTimer.unref();
}

// Load initially
loadCache();

export function getDeviceNameFromCache(mac: string): string {
  if (!mac) return '';
  const cleanMac = mac.replace(/[:-]/g, '').toUpperCase();
  if (cleanMac.length < 6) return '';
  const prefix = cleanMac.substring(0, 6);
  return ouiCache[prefix] || '';
}

const lookupQueue = new Set<string>();
let isLookingUp = false;

export function queueMacForLookup(mac: string) {
  if (!mac) return;
  const cleanMac = mac.replace(/[:-]/g, '').toUpperCase();
  if (cleanMac.length < 6) return;
  const prefix = cleanMac.substring(0, 6);
  
  if (!ouiCache[prefix] && !lookupQueue.has(prefix) && lookupQueue.size < MAX_LOOKUP_QUEUE) {
    lookupQueue.add(prefix);
    processQueue();
  }
}

async function processQueue() {
  if (isLookingUp) return;
  isLookingUp = true;
  
  try {
    while (lookupQueue.size > 0) {
      const prefix = lookupQueue.values().next().value;
      if (!prefix) break;
      lookupQueue.delete(prefix);
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(`https://api.maclookup.app/v2/macs/${prefix}`, { signal: controller.signal });
        clearTimeout(timeout);
        
        if (response.ok) {
          const data: any = await response.json();
          setCacheEntry(prefix, data.company || 'Unknown-Vendor');
          scheduleSaveCache();
        } else {
          setCacheEntry(prefix, 'Unknown-Vendor');
        }
      } catch (e) {
        // mark unknown to prevent hanging
        setCacheEntry(prefix, 'Unknown-Vendor');
      }
      
      // Delay between requests
      await new Promise(r => setTimeout(r, 200));
    }
  } finally {
    isLookingUp = false;
  }
}
