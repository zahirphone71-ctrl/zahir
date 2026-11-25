// Z.Control MikroTik Telemetry Background Service Worker
// Periodically refreshes non-critical system telemetry (uptime, interface status, CPU load, health)
// in the background while the UI thread remains idle.

const SW_VERSION = 'v1.0.0';
let telemetryIntervalTimer = null;
let currentConfig = {
  baseUrl: '',
  token: '',
  intervalMs: 30000
};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function fetchAndBroadcastTelemetry() {
  if (!currentConfig.baseUrl) return;

  try {
    const url = `${currentConfig.baseUrl}/api/mikrotik/data/sync/system?force=true`;
    const headers = {
      'Accept': 'application/json'
    };
    if (currentConfig.token) {
      headers['Authorization'] = `Bearer ${currentConfig.token}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) return;

    const json = await response.json();
    if (json.success && json.data) {
      const telemetryData = {
        type: 'BACKGROUND_TELEMETRY_UPDATE',
        timestamp: Date.now(),
        data: {
          uptime: json.data.uptime,
          cpuLoad: json.data.cpuLoad,
          cpuTemperature: json.data.cpuTemperature,
          boardTemperature: json.data.boardTemperature,
          freeMemory: json.data.freeMemory,
          totalMemory: json.data.totalMemory,
          interfaces: json.data.interfaces,
          hasInternet: json.data.hasInternet,
          pingMs: json.data.pingMs
        }
      };

      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      for (const client of clients) {
        client.postMessage(telemetryData);
      }
    }
  } catch (err) {
    // Silent background telemetry retry handling
  }
}

function startBackgroundTelemetry(config) {
  currentConfig = {
    baseUrl: config.baseUrl || '',
    token: config.token || '',
    intervalMs: Math.max(15000, config.intervalMs || 30000)
  };

  if (telemetryIntervalTimer) {
    clearInterval(telemetryIntervalTimer);
    telemetryIntervalTimer = null;
  }

  // Run initial fetch immediately
  fetchAndBroadcastTelemetry();

  // Set periodic background interval
  telemetryIntervalTimer = setInterval(() => {
    fetchAndBroadcastTelemetry();
  }, currentConfig.intervalMs);
}

function stopBackgroundTelemetry() {
  if (telemetryIntervalTimer) {
    clearInterval(telemetryIntervalTimer);
    telemetryIntervalTimer = null;
  }
}

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'START_BACKGROUND_TELEMETRY':
      startBackgroundTelemetry(payload || {});
      event.ports[0]?.postMessage({ success: true, status: 'started' });
      break;

    case 'STOP_BACKGROUND_TELEMETRY':
      stopBackgroundTelemetry();
      event.ports[0]?.postMessage({ success: true, status: 'stopped' });
      break;

    case 'FORCE_FETCH_TELEMETRY':
      fetchAndBroadcastTelemetry();
      event.ports[0]?.postMessage({ success: true, status: 'fetched' });
      break;

    case 'UPDATE_CONFIG':
      if (payload?.token) currentConfig.token = payload.token;
      if (payload?.intervalMs) {
        currentConfig.intervalMs = Math.max(15000, payload.intervalMs);
        if (telemetryIntervalTimer) {
          startBackgroundTelemetry(currentConfig);
        }
      }
      event.ports[0]?.postMessage({ success: true, status: 'updated' });
      break;

    default:
      break;
  }
});

// Background Sync API integration
self.addEventListener('sync', (event) => {
  if (event.tag === 'mikrotik-telemetry-sync') {
    event.waitUntil(fetchAndBroadcastTelemetry());
  }
});

// Periodic Background Sync API integration (if supported by browser)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'mikrotik-periodic-telemetry') {
    event.waitUntil(fetchAndBroadcastTelemetry());
  }
});
