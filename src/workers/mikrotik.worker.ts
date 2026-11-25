// MikroTik Batch Processing & Background Synchronization Web Worker
// Offloads heavy operations (batch processing, voucher generation, and non-critical data synchronization)
// from the main UI thread to ensure 60fps responsiveness even under heavy router load.

interface BgSyncConfig {
  baseUrl: string;
  token: string;
  intervalMs: number;
}

let bgIntervalTimer: any = null;
let bgSyncConfig: BgSyncConfig | null = null;
let isBgSyncInProgress = false;

function parseLogSeverity(topics: string, message: string): 'info' | 'warning' | 'error' | 'critical' {
  const t = (topics || '').toLowerCase();
  const m = (message || '').toLowerCase();

  if (
    t.includes('critical') ||
    t.includes('alert') ||
    t.includes('emergency') ||
    m.includes('kernel failure') ||
    m.includes('out of memory') ||
    m.includes('system rebooted') ||
    m.includes('panic') ||
    m.includes('overheat')
  ) {
    return 'critical';
  }

  if (t.includes('error') || m.includes('failure') || m.includes('failed') || m.includes('unreachable') || m.includes('auth error')) {
    return 'error';
  }

  if (
    t.includes('warning') ||
    t.includes('warn') ||
    m.includes('timeout') ||
    m.includes('conflict') ||
    m.includes('dropped') ||
    m.includes('denied') ||
    m.includes('rejected') ||
    m.includes('reset') ||
    m.includes('disconnected')
  ) {
    return 'warning';
  }

  return 'info';
}

function processNonCriticalData(rawLogs: any[], rawInterfaces: any[], limit: number = 150) {
  // 1. Process and format system logs
  const logsList = Array.isArray(rawLogs) ? rawLogs : [];
  const processedLogs = logsList
    .slice(-limit)
    .reverse()
    .map((l: any, idx: number) => {
      const topics = String(l?.topics || '');
      const message = String(l?.message || '');
      const severity = parseLogSeverity(topics, message);
      return {
        id: l?.['.id'] || l?.id || `log-${Date.now()}-${idx}`,
        time: l?.time || '',
        topics,
        message,
        severity
      };
    });

  // 2. Process and normalize network interfaces
  const ifaceList = Array.isArray(rawInterfaces) ? rawInterfaces : [];
  const interfaces = ifaceList.map((i: any) => ({
    id: i?.['.id'] || i?.id || i?.name || `iface-${Math.random()}`,
    name: i?.name || '',
    type: i?.type || 'ether',
    running: Boolean(i?.running === true || i?.running === 'true'),
    disabled: Boolean(i?.disabled === true || i?.disabled === 'true'),
    rxBps: Number(i?.rxBps) || 0,
    txBps: Number(i?.txBps) || 0,
    rxBytes: Number(i?.rxBytes || i?.['rx-byte']) || 0,
    txBytes: Number(i?.txBytes || i?.['tx-byte']) || 0,
    comment: i?.comment || ''
  }));

  // Sort interfaces: WAN, ether1, bridge at top, then alphabetical
  interfaces.sort((a: any, b: any) => {
    const aWan = /wan|ether1|bridge/i.test(a.name);
    const bWan = /wan|ether1|bridge/i.test(b.name);
    if (aWan && !bWan) return -1;
    if (!aWan && bWan) return 1;
    return a.name.localeCompare(b.name);
  });

  const interfaceNames = interfaces.map((i: any) => i.name).filter(Boolean);

  // Compute stats
  const criticalLogsCount = processedLogs.filter((l: any) => l.severity === 'critical' || l.severity === 'error').length;
  const warningLogsCount = processedLogs.filter((l: any) => l.severity === 'warning').length;
  const infoCount = processedLogs.filter((l: any) => l.severity === 'info').length;
  const activeInterfacesCount = interfaces.filter((i: any) => i.running && !i.disabled).length;

  return {
    logs: processedLogs,
    interfaces,
    interfaceNames,
    stats: {
      logsCount: processedLogs.length,
      interfacesCount: interfaces.length,
      activeInterfacesCount,
      criticalLogsCount,
      warningLogsCount,
      infoCount
    },
    syncedAt: Date.now()
  };
}

async function performWorkerFetch(baseUrl: string, token: string, limit: number = 150) {
  const url = `${baseUrl || ''}/api/mikrotik/non-critical/sync`;
  const headers: Record<string, string> = {
    'Accept': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  if (!json.success || !json.data) {
    throw new Error(json.message || 'فشل جلب البيانات الخلفية');
  }

  return processNonCriticalData(json.data.rawLogs || json.data.logs, json.data.interfaces, limit);
}

function runBackgroundSyncCycle() {
  if (!bgSyncConfig || isBgSyncInProgress) return;
  isBgSyncInProgress = true;

  performWorkerFetch(bgSyncConfig.baseUrl, bgSyncConfig.token, 150)
    .then((result) => {
      self.postMessage({
        type: 'BACKGROUND_SYNC_UPDATE',
        payload: result
      });
    })
    .catch((err) => {
      self.postMessage({
        type: 'BACKGROUND_SYNC_ERROR',
        payload: { error: err.message || 'Background sync error' }
      });
    })
    .finally(() => {
      isBgSyncInProgress = false;
    });
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data || {};

  try {
    switch (type) {
      // ----------------------------------------------------
      // Background Synchronization Engine Tasks
      // ----------------------------------------------------
      case 'PROCESS_NON_CRITICAL_DATA': {
        const { rawLogs = [], rawInterfaces = [], limit = 150 } = payload || {};
        const result = processNonCriticalData(rawLogs, rawInterfaces, limit);
        self.postMessage({ id, success: true, result });
        break;
      }

      case 'FETCH_AND_SYNC_NON_CRITICAL': {
        const { baseUrl = '', token = '', limit = 150 } = payload || {};
        const result = await performWorkerFetch(baseUrl, token, limit);
        self.postMessage({ id, success: true, result });
        break;
      }

      case 'START_BACKGROUND_SYNC': {
        const { baseUrl = '', token = '', intervalMs = 30000 } = payload || {};
        if (bgIntervalTimer) {
          clearInterval(bgIntervalTimer);
          bgIntervalTimer = null;
        }

        bgSyncConfig = { baseUrl, token, intervalMs: Math.max(10000, intervalMs) };
        bgIntervalTimer = setInterval(runBackgroundSyncCycle, bgSyncConfig.intervalMs);

        // Run first cycle immediately
        runBackgroundSyncCycle();

        self.postMessage({ id, success: true, result: { started: true, intervalMs: bgSyncConfig.intervalMs } });
        break;
      }

      case 'STOP_BACKGROUND_SYNC': {
        if (bgIntervalTimer) {
          clearInterval(bgIntervalTimer);
          bgIntervalTimer = null;
        }
        bgSyncConfig = null;
        isBgSyncInProgress = false;
        self.postMessage({ id, success: true, result: { stopped: true } });
        break;
      }

      case 'ADJUST_SYNC_INTERVAL': {
        const { intervalMs = 30000 } = payload || {};
        if (bgSyncConfig) {
          bgSyncConfig.intervalMs = Math.max(10000, intervalMs);
          if (bgIntervalTimer) {
            clearInterval(bgIntervalTimer);
            bgIntervalTimer = setInterval(runBackgroundSyncCycle, bgSyncConfig.intervalMs);
          }
        }
        self.postMessage({ id, success: true, result: { adjusted: true, intervalMs } });
        break;
      }

      // ----------------------------------------------------
      // Batch Processing Tasks
      // ----------------------------------------------------
      case 'CHUNK_BATCH': {
        const { items, chunkSize = 50 } = payload;
        if (!Array.isArray(items)) {
          throw new Error('Items must be an array for batch chunking');
        }
        const chunks: any[][] = [];
        for (let i = 0; i < items.length; i += chunkSize) {
          chunks.push(items.slice(i, i + chunkSize));
        }
        self.postMessage({ id, success: true, result: chunks });
        break;
      }

      case 'PREPARE_BATCH_PAYLOAD': {
        const { ids, action, value, system, payload: directPayload } = payload;
        if (!Array.isArray(ids)) {
          throw new Error('IDs must be an array for batch payload preparation');
        }
        const effectivePayload = directPayload !== undefined ? directPayload : value;
        const batchSize = 100;
        const batches: any[] = [];
        for (let i = 0; i < ids.length; i += batchSize) {
          batches.push({
            system,
            action,
            ids: ids.slice(i, i + batchSize),
            value: effectivePayload,
            payload: effectivePayload
          });
        }
        self.postMessage({ id, success: true, result: batches });
        break;
      }

      case 'GENERATE_VOUCHER_CODES': {
        const { count = 100, prefix = 'V-', length = 6, charset = 'alphanumeric' } = payload;
        let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        if (charset === 'numeric') chars = '0123456789';
        if (charset === 'alpha') chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

        const codes: string[] = [];
        const seen = new Set<string>();

        while (codes.length < count) {
          let code = prefix;
          for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          if (!seen.has(code)) {
            seen.add(code);
            codes.push(code);
          }
        }

        self.postMessage({ id, success: true, result: codes });
        break;
      }

      case 'PROCESS_SUBSCRIBER_CHUNK': {
        const { domain, items = [], chunkIndex, totalChunks, isLastChunk } = payload || {};
        const normalized = Array.isArray(items) ? items : [];
        self.postMessage({
          id,
          success: true,
          result: {
            domain,
            chunkIndex,
            totalChunks,
            isLastChunk,
            items: normalized,
            count: normalized.length
          }
        });
        break;
      }

      default:
        throw new Error(`Unknown mikroTik worker task type: ${type}`);
    }
  } catch (err: any) {
    self.postMessage({ id, success: false, error: err.message || 'Unknown worker error' });
  }
};
