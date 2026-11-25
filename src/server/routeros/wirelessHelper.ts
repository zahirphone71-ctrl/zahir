// ============================================================
//  RouterOS Multi-Version Wireless Helper
//  Supports:
//   - RouterOS v6 & legacy wireless (/interface/wireless)
//   - RouterOS v7.13+ WiFi / wifi-qcom (/interface/wifi)
//   - RouterOS v7.0-7.12 WiFiWave2 (/interface/wifiwave2)
// ============================================================

export type WirelessDriverPrefix = '/interface/wireless' | '/interface/wifi' | '/interface/wifiwave2';

export const WIRELESS_DRIVER_PREFIXES: readonly WirelessDriverPrefix[] = [
  '/interface/wireless',
  '/interface/wifi',
  '/interface/wifiwave2'
];

export interface WirelessQueryClient {
  querySafe: (cmd: string, params?: string[], opts?: any) => Promise<any>;
  query: (cmd: string, params?: string[], opts?: any) => Promise<any>;
}

/**
 * Queries wireless resources across v6 (/interface/wireless), v7.13+ (/interface/wifi),
 * and v7.0-7.12 (/interface/wifiwave2). Optionally tries extra fallback paths (e.g. CAPsMAN).
 */
export async function queryWirelessWithFallback(
  client: WirelessQueryClient,
  subPath: string,
  params?: string[],
  extraFallbacks: string[] = []
): Promise<{ data: any[]; driver: string | null }> {
  const cleanSub = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const candidates = [
    ...WIRELESS_DRIVER_PREFIXES.map((prefix) => `${prefix}${cleanSub}`),
    ...extraFallbacks
  ];

  for (const fullCmd of candidates) {
    try {
      const res = await client.querySafe(fullCmd, params);
      if (Array.isArray(res) && res.length > 0) {
        const driver = WIRELESS_DRIVER_PREFIXES.find((p) => fullCmd.startsWith(`${p}/`)) || fullCmd;
        return { data: res, driver };
      }
    } catch {
      // Try next RouterOS driver path
    }
  }

  return { data: [], driver: null };
}

/**
 * Executes a wireless mutation/action command (e.g. set, add, remove, scan) across
 * /interface/wireless, /interface/wifi, and /interface/wifiwave2 until one succeeds.
 */
export async function executeWirelessCommandWithFallback(
  client: WirelessQueryClient,
  subCommand: 'set' | 'add' | 'remove' | 'scan' | 'frequency-monitor',
  params: string[],
  preferredPrefix?: WirelessDriverPrefix | null
): Promise<{ result: any; driver: WirelessDriverPrefix }> {
  const orderedPrefixes: WirelessDriverPrefix[] = preferredPrefix
    ? [preferredPrefix, ...WIRELESS_DRIVER_PREFIXES.filter((p) => p !== preferredPrefix)]
    : [...WIRELESS_DRIVER_PREFIXES];

  let lastError: any = null;
  for (const prefix of orderedPrefixes) {
    const cmd = `${prefix}/${subCommand}`;
    const adaptedParams = adaptWirelessParamsForDriver(prefix, subCommand, params);
    try {
      const result = await client.query(cmd, adaptedParams);
      return { result, driver: prefix };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error(`Wireless command ${subCommand} failed on all RouterOS wireless drivers`);
}

/**
 * Translates common legacy wireless parameter names to wifi/wifiwave2 equivalents
 * when falling back to RouterOS v7 wifi/wifiwave2 drivers.
 */
export function adaptWirelessParamsForDriver(
  prefix: WirelessDriverPrefix,
  subCommand: string,
  params: string[]
): string[] {
  if (prefix === '/interface/wireless' || subCommand === 'remove' || subCommand === 'scan' || subCommand === 'frequency-monitor') {
    return params;
  }

  // RouterOS v7 /interface/wifi & /interface/wifiwave2 use configuration.* / channel.* / security.* properties
  return params
    .map((p) => {
      if (p.startsWith('=ssid=')) return `=configuration.ssid=${p.slice('=ssid='.length)}`;
      if (p.startsWith('=mode=')) {
        const modeVal = p.slice('=mode='.length);
        const v7Mode = modeVal === 'ap-bridge' || modeVal === 'bridge' ? 'ap' : modeVal;
        return `=configuration.mode=${v7Mode}`;
      }
      if (p.startsWith('=hide-ssid=')) return `=configuration.hide-ssid=${p.slice('=hide-ssid='.length)}`;
      if (p.startsWith('=frequency=')) {
        const freq = p.slice('=frequency='.length);
        if (freq === 'auto') return '';
        return `=channel.frequency=${freq}`;
      }
      if (p.startsWith('=band=')) return `=channel.band=${p.slice('=band='.length)}`;
      if (p.startsWith('=channel-width=')) return `=channel.width=${p.slice('=channel-width='.length)}`;
      if (p.startsWith('=security-profile=')) return `=security=${p.slice('=security-profile='.length)}`;
      if (p.startsWith('=tx-power=')) return `=configuration.tx-power=${p.slice('=tx-power='.length)}`;
      return p;
    })
    .filter(Boolean);
}
