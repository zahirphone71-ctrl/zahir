// ============================================================
//  ZCtrl Server Shared Runtime Context
//  Centralizes multi-tenant session registry, bounded caching,
//  rate trackers, entity ID resolvers, and RouterOS normalizers.
// ============================================================

import { AsyncLocalStorage } from "async_hooks";
import v8 from "node:v8";
import type { Request } from "express";
import {
  MikrotikAPI as MikrotikAPI_Original,
  type MikrotikClient
} from "./mikrotik-api.ts";
import { RealtimeSyncServer } from "./realtime-ws.ts";
import { getDeviceNameFromCache, queueMacForLookup } from "./oui-lookup.ts";
import { securityConfig, resolveRequestToken } from "./security-shield.ts";
import type { OperatorRole } from "./rbac.ts";
import { voucherDb } from "./voucher-db.ts";
import { deleteRouterMutex, clearRouterLocks } from "./mutex.ts";
import { appLogger } from "./rotatingLogger.ts";
import {
  sanitizeRouterInput,
  normalizeDhcpLeaseRow,
  normalizeSimpleQueueRow
} from "./utils/routerNormalizers.ts";

export interface ClientSession {
  client: any;
  lastSeen: number;
  encPassword?: string;
  host?: string;
  user?: string;
  role: OperatorRole;
  operatorId: string;
  operatorName: string;
  tlsFingerprint?: string | null;
}

export const clientStorage = new AsyncLocalStorage<any>();
export const routerClients = new Map<string, ClientSession>();

let latestActiveClient: any = null;
export function getLatestActiveClient(): any {
  return latestActiveClient;
}
export function setLatestActiveClient(client: any): void {
  latestActiveClient = client;
}
export function touchRouterSession(token?: string): void {
  if (!token) return;
  const session = routerClients.get(token);
  if (session) {
    session.lastSeen = Date.now();
  }
}

// ==========================================
// Bounded Memory Cache & Rate Trackers
// ==========================================
interface CacheEntry {
  data: any;
  timestamp: number;
  rowCount: number;
  estimatedBytes: number;
}

function estimateCacheEntryBytes(data: any, rowCount: number): number {
  if (Array.isArray(data)) {
    if (rowCount === 0) return 64;
    const sampleCount = Math.min(3, data.length);
    let sampleBytes = 0;
    for (let i = 0; i < sampleCount; i++) {
      try {
        sampleBytes += JSON.stringify(data[i])?.length || 128;
      } catch {
        sampleBytes += 256;
      }
    }
    const avgRowBytes = Math.max(96, Math.round(sampleBytes / sampleCount) * 2);
    return rowCount * avgRowBytes;
  }
  try {
    return Math.max(128, (JSON.stringify(data)?.length || 128) * 2);
  } catch {
    return 1024;
  }
}

export class SafeCache {
  private cache: Map<string, CacheEntry> = new Map();
  private totalRows = 0;
  private totalEstimatedBytes = 0;
  private readonly MAX_ENTRIES = 500;
  private readonly MAX_TOTAL_ROWS = 100_000;
  private readonly MAX_ENTRY_ROWS = 20_000;
  private readonly MAX_TOTAL_BYTES = 64 * 1024 * 1024;

  private deleteEntry(key: string): void {
    const existing = this.cache.get(key);
    if (!existing) return;
    this.totalRows = Math.max(0, this.totalRows - existing.rowCount);
    this.totalEstimatedBytes = Math.max(0, this.totalEstimatedBytes - existing.estimatedBytes);
    this.cache.delete(key);
  }

  get(key: string, durationMs: number) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < durationMs) {
      // True LRU: refresh key position as most recently used
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry.data;
    }
    if (entry) {
      this.deleteEntry(key);
    }
    return null;
  }

  set(key: string, data: any): boolean {
    const rowCount = Array.isArray(data) ? data.length : 1;
    // Skip caching oversized lists to avoid pinning multi-megabyte tables in V8 heap
    if (Array.isArray(data) && rowCount > this.MAX_ENTRY_ROWS) {
      this.deleteEntry(key);
      return false;
    }

    const estimatedBytes = estimateCacheEntryBytes(data, rowCount);
    if (estimatedBytes > this.MAX_TOTAL_BYTES) {
      this.deleteEntry(key);
      return false;
    }

    this.deleteEntry(key);

    while (
      this.cache.size >= this.MAX_ENTRIES ||
      this.totalRows + rowCount > this.MAX_TOTAL_ROWS ||
      (this.totalEstimatedBytes + estimatedBytes > this.MAX_TOTAL_BYTES && this.cache.size > 0)
    ) {
      const lruKey = this.cache.keys().next().value;
      if (!lruKey) break;
      this.deleteEntry(lruKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      rowCount,
      estimatedBytes
    });
    this.totalRows += rowCount;
    this.totalEstimatedBytes += estimatedBytes;
    return true;
  }

  invalidate(host: string, pattern: string) {
    const prefix = `${host}:`;
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix) && key.includes(pattern)) {
        this.deleteEntry(key);
      }
    }
  }

  invalidateDeep(pattern: string) {
    const lower = pattern.toLowerCase();
    for (const key of Array.from(this.cache.keys())) {
      if (key.toLowerCase().includes(lower)) {
        this.deleteEntry(key);
      }
    }
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.cache.entries())) {
      if (now - entry.timestamp > 120000) {
        this.deleteEntry(key);
      }
    }
  }

  clear() {
    this.cache.clear();
    this.totalRows = 0;
    this.totalEstimatedBytes = 0;
  }

  size() {
    return this.cache.size;
  }

  getStats() {
    return {
      entries: this.cache.size,
      totalRows: this.totalRows,
      estimatedMb: Math.round((this.totalEstimatedBytes / (1024 * 1024)) * 100) / 100
    };
  }
}

export const queryCache = new SafeCache();
export let cachedUsermanResult: { data: any; timestamp: number } | null = null;
export function clearCachedUsermanResult(): void {
  cachedUsermanResult = null;
}

export const interfaceRateTracker = new Map<
  string,
  {
    lastRxBytes: number;
    lastTxBytes: number;
    lastTime: number;
    rxBps: number;
    txBps: number;
  }
>();

export const activeUserRateTracker = new Map<
  string,
  {
    lastBytesIn: number;
    lastBytesOut: number;
    lastTime: number;
    rxRateBps: number;
    txRateBps: number;
  }
>();

export const lastWirelessScanCache = new Map<string, { timestamp: number; payload: any }>();

const inFlightQueries = new Map<string, Promise<any>>();

// Periodic cleanup intervals
const sessionCleanupInterval = setInterval(() => {
  const now = Date.now();
  const SESSION_MAX_IDLE_MS = 24 * 60 * 60 * 1000;
  for (const [token, session] of routerClients.entries()) {
    if (now - session.lastSeen > SESSION_MAX_IDLE_MS) {
      try {
        if (session.client && typeof session.client.dispose === "function") {
          session.client.dispose().catch((err: unknown) => {
            appLogger.warn("runtime", "Expired session dispose warning", {
              error: err instanceof Error ? err.message : String(err)
            });
          });
        } else if (session.client && typeof session.client.disconnect === "function") {
          session.client.disconnect();
        }
      } catch (err) {
        appLogger.warn("runtime", "Expired session cleanup error", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
      if (latestActiveClient === session.client) {
        latestActiveClient = null;
      }
      if (session.host) {
        deleteRouterMutex(session.host);
      }
      routerClients.delete(token);
    }
  }

  const rateCutoff = now - 10 * 60 * 1000;
  for (const [k, v] of activeUserRateTracker.entries()) {
    if (now - v.lastTime > 10 * 60 * 1000) activeUserRateTracker.delete(k);
  }
  if (activeUserRateTracker.size > 10000) {
    const excess = activeUserRateTracker.size - 10000;
    let removed = 0;
    for (const k of activeUserRateTracker.keys()) {
      activeUserRateTracker.delete(k);
      if (++removed >= excess) break;
    }
  }

  for (const [k, v] of interfaceRateTracker.entries()) {
    if (now - v.lastTime > 15 * 60 * 1000) interfaceRateTracker.delete(k);
  }
  if (interfaceRateTracker.size > 2000) {
    const excess = interfaceRateTracker.size - 2000;
    let removed = 0;
    for (const k of interfaceRateTracker.keys()) {
      interfaceRateTracker.delete(k);
      if (++removed >= excess) break;
    }
  }

  for (const [k, v] of lastWirelessScanCache.entries()) {
    if (v.timestamp < rateCutoff) lastWirelessScanCache.delete(k);
  }
  if (lastWirelessScanCache.size > 200) {
    const excess = lastWirelessScanCache.size - 200;
    let removed = 0;
    for (const k of lastWirelessScanCache.keys()) {
      lastWirelessScanCache.delete(k);
      if (++removed >= excess) break;
    }
  }

  if (typeof (global as any).gc === "function") {
    try {
      (global as any).gc();
    } catch (gcErr) {
      appLogger.warn("runtime", "Periodic GC invocation failed", {
        error: gcErr instanceof Error ? gcErr.message : String(gcErr)
      });
    }
  }
}, 5 * 60 * 1000);
if (sessionCleanupInterval.unref) sessionCleanupInterval.unref();

const cachePruneInterval = setInterval(() => queryCache.prune(), 60000);
if (cachePruneInterval.unref) cachePruneInterval.unref();

// ==========================================
// Automatic Server Memory Watchdog
// Dynamic V8 Heap Ratio Thresholds (60% soft, 80% critical)
// ==========================================
function getDynamicHeapThresholdsMb(): { heapLimitMb: number; softMb: number; criticalMb: number } {
  let limitMb = 512;
  try {
    const stats = v8.getHeapStatistics();
    if (stats?.heap_size_limit && Number.isFinite(stats.heap_size_limit)) {
      limitMb = stats.heap_size_limit / 1048576;
    }
  } catch (err) {
    appLogger.warn("runtime", "Failed to read V8 heap statistics", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
  const heapLimitMb = Math.max(256, Math.round(limitMb * 10) / 10);
  return {
    heapLimitMb,
    softMb: Math.round(heapLimitMb * 0.6 * 10) / 10,
    criticalMb: Math.round(heapLimitMb * 0.8 * 10) / 10
  };
}

let lastWatchdogPruneAt = 0;
let watchdogPruneCount = 0;

export function getMemoryHealth() {
  const mem = process.memoryUsage();
  const heapUsedMb = Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10;
  const heapTotalMb = Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10;
  const rssMb = Math.round((mem.rss / (1024 * 1024)) * 10) / 10;
  const { heapLimitMb, softMb, criticalMb } = getDynamicHeapThresholdsMb();
  const cacheStats = queryCache.getStats();
  const status =
    heapUsedMb >= criticalMb
      ? "critical"
      : heapUsedMb >= softMb
      ? "elevated"
      : "healthy";

  return {
    status,
    heapUsedMb,
    heapTotalMb,
    heapLimitMb,
    rssMb,
    gcAvailable: typeof (global as any).gc === "function",
    thresholdsMb: {
      soft: softMb,
      critical: criticalMb
    },
    cacheSizes: {
      queryCache: cacheStats.entries,
      queryCacheRows: cacheStats.totalRows,
      queryCacheEstimatedMb: cacheStats.estimatedMb,
      activeUserTrackers: activeUserRateTracker.size,
      interfaceTrackers: interfaceRateTracker.size,
      wirelessScans: lastWirelessScanCache.size,
      activeSessions: routerClients.size
    },
    watchdogPruneCount,
    lastWatchdogPruneAt: lastWatchdogPruneAt || null
  };
}

export function runMemoryWatchdogCheck(options?: { forcePrune?: boolean; softThresholdMb?: number; criticalThresholdMb?: number }) {
  const mem = process.memoryUsage();
  const heapUsedMb = mem.heapUsed / (1024 * 1024);
  const dynamic = getDynamicHeapThresholdsMb();
  const softMb = options?.softThresholdMb ?? dynamic.softMb;
  const criticalMb = options?.criticalThresholdMb ?? dynamic.criticalMb;
  const forcePrune = Boolean(options?.forcePrune);

  let action: "none" | "soft_prune" | "critical_purge" = "none";

  if (forcePrune || heapUsedMb >= criticalMb) {
    action = "critical_purge";
    queryCache.clear();
    cachedUsermanResult = null;
    voucherDb.clearMemoryCache();
    lastWirelessScanCache.clear();
    if (activeUserRateTracker.size > 1000) {
      activeUserRateTracker.clear();
    }
    if (interfaceRateTracker.size > 500) {
      interfaceRateTracker.clear();
    }
    lastWatchdogPruneAt = Date.now();
    watchdogPruneCount++;
    if (typeof (global as any).gc === "function") {
      try {
        (global as any).gc();
      } catch (gcErr) {
        appLogger.warn("runtime", "Watchdog GC invocation failed", {
          error: gcErr instanceof Error ? gcErr.message : String(gcErr)
        });
      }
    }
  } else if (heapUsedMb >= softMb) {
    action = "soft_prune";
    queryCache.prune();
    cachedUsermanResult = null;
    const cutoff = Date.now() - 2 * 60 * 1000;
    for (const [k, v] of activeUserRateTracker.entries()) {
      if (v.lastTime < cutoff) activeUserRateTracker.delete(k);
    }
    for (const [k, v] of interfaceRateTracker.entries()) {
      if (v.lastTime < cutoff) interfaceRateTracker.delete(k);
    }
    for (const [k, v] of lastWirelessScanCache.entries()) {
      if (v.timestamp < cutoff) lastWirelessScanCache.delete(k);
    }
    lastWatchdogPruneAt = Date.now();
    watchdogPruneCount++;
  }

  return {
    action,
    heapUsedMb: Math.round(heapUsedMb * 10) / 10,
    health: getMemoryHealth()
  };
}

const memoryWatchdogInterval = setInterval(() => {
  try {
    runMemoryWatchdogCheck();
  } catch (err) {
    appLogger.warn("runtime", "Memory watchdog check failed", {
      error: err instanceof Error ? err.message : String(err)
    });
  }
}, 60 * 1000);
if (memoryWatchdogInterval.unref) memoryWatchdogInterval.unref();

export async function destroyRuntimeResources(): Promise<void> {
  clearInterval(sessionCleanupInterval);
  clearInterval(cachePruneInterval);
  clearInterval(memoryWatchdogInterval);
  realtimeSyncServer.destroy();
  for (const [, session] of routerClients.entries()) {
    try {
      if (session.client && typeof session.client.dispose === "function") {
        await session.client.dispose();
      }
    } catch (err) {
      appLogger.warn("runtime", "Error disposing router client on shutdown", {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
  routerClients.clear();
  clearRouterLocks();
  queryCache.clear();
  voucherDb.clearMemoryCache();
  activeUserRateTracker.clear();
  interfaceRateTracker.clear();
  lastWirelessScanCache.clear();
}

// ==========================================
// Client Resolvers & Proxy
// ==========================================
export const resolveRouterClientForWs = (token?: string) => {
  const session = token ? routerClients.get(token) : undefined;
  if (session?.client && typeof session.client.isConnected === "function" && session.client.isConnected()) {
    return session.client;
  }
  if (securityConfig.strictTenantIsolation) {
    return null;
  }
  const currentStore = clientStorage.getStore();
  if (currentStore && typeof currentStore.isConnected === "function" && currentStore.isConnected()) {
    return currentStore;
  }
  if (latestActiveClient && typeof latestActiveClient.isConnected === "function" && latestActiveClient.isConnected()) {
    return latestActiveClient;
  }
  return MikrotikAPI_Original;
};

export const realtimeSyncServer = new RealtimeSyncServer(resolveRouterClientForWs, touchRouterSession);

export const MikrotikAPI = new Proxy(MikrotikAPI_Original, {
  get(target, prop, receiver) {
    const activeClient =
      clientStorage.getStore() || (!securityConfig.strictTenantIsolation ? latestActiveClient : null) || target;
    const value = Reflect.get(activeClient, prop, receiver);
    if (typeof value === "function") {
      return value.bind(activeClient);
    }
    return value;
  }
});

export const resolveScopedRouterClient = (req: Request) => {
  if (req.routerClient && req.routerClient.isConnected()) {
    return req.routerClient;
  }
  const token = resolveRequestToken(req);
  const session = token ? routerClients.get(token) : undefined;
  if (session?.client && session.client.isConnected()) {
    return session.client;
  }
  const currentStore = clientStorage.getStore();
  if (currentStore && currentStore.isConnected()) {
    return currentStore;
  }
  if (!securityConfig.strictTenantIsolation && MikrotikAPI_Original.isConnected()) {
    return MikrotikAPI_Original;
  }
  return securityConfig.strictTenantIsolation ? null : MikrotikAPI_Original;
};

export const invalidateCache = (pattern: string, clientOverride?: any) => {
  const client = clientOverride || MikrotikAPI;
  const cfg = client.getConfig ? client.getConfig() : null;
  const host = cfg ? `${cfg.host}:${cfg.port || 8728}` : MikrotikAPI.getConfig()?.host || "unknown-router";
  queryCache.invalidate(host, pattern);
  queryCache.invalidateDeep(pattern);
  if (pattern.includes("userman") || pattern.includes("user-manager")) {
    cachedUsermanResult = null;
  }
};

// ==========================================
// Sanitizers & Resolvers
// ==========================================
export const sanitizeInput = (val: any): string => sanitizeRouterInput(val);

export const getUserManPrefix = (client?: MikrotikClient) =>
  (client || MikrotikAPI).isV6() ? "/tool/user-manager" : "/user-manager";

export const cleanMikrotikTimeout = (t: any): string | undefined => {
  if (!t) return undefined;
  const s = String(t).trim();
  if (!s || s === "none" || s === "00:00:00" || s === "0" || s === "0s") return undefined;
  if (/^(\d+[dwmyhs])\s+00:00:00$/i.test(s)) {
    return s.replace(/\s+00:00:00$/i, "");
  }
  return s.replace(/\s+/g, "");
};

async function resolveRouterEntityId(
  client: any,
  endpoint: string,
  idOrName: string,
  allowFullScanFallback = true
): Promise<string> {
  if (!idOrName) return idOrName;
  const clean = sanitizeRouterInput(idOrName);
  if (!clean || clean.startsWith("*")) return clean;
  try {
    const direct = await client.querySafe(endpoint, [`?name=${clean}`], {
      timeoutSeconds: 3,
      rapid: true
    });
    if (Array.isArray(direct) && direct.length > 0 && direct[0][".id"]) {
      return direct[0][".id"];
    }
  } catch (err) {
    appLogger.warn("runtime", `Direct lookup failed for ${endpoint}`, {
      name: clean,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  if (!allowFullScanFallback) return clean;
  try {
    const list = await client.querySafe(endpoint, undefined, { timeoutSeconds: 4, rapid: true });
    if (Array.isArray(list)) {
      const lowerClean = clean.toLowerCase();
      const match = list.find(
        (item: any) =>
          item?.[".id"] === clean ||
          item?.id === clean ||
          item?.name === clean ||
          (item?.name && String(item.name).toLowerCase() === lowerClean)
      );
      if (match && match[".id"]) return match[".id"];
    }
  } catch (err) {
    appLogger.warn("runtime", `Fallback list scan failed for ${endpoint}`, {
      name: clean,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  return clean;
}

export const resolveHotspotProfileId = (client: any, idOrName: string): Promise<string> =>
  resolveRouterEntityId(client, "/ip/hotspot/user/profile/print", idOrName, true);

export const resolvePPPProfileId = (client: any, idOrName: string): Promise<string> =>
  resolveRouterEntityId(client, "/ppp/profile/print", idOrName, true);

export const resolveUsermanProfileId = (client: any, idOrName: string): Promise<string> =>
  resolveRouterEntityId(client, `${getUserManPrefix(client)}/profile/print`, idOrName, true);

export const resolveSimpleQueueId = (client: any, idOrName: string): Promise<string> =>
  resolveRouterEntityId(client, "/queue/simple/print", idOrName, true);

export const resolvePoolId = (client: any, idOrName: string): Promise<string> =>
  resolveRouterEntityId(client, "/ip/pool/print", idOrName, false);

function ipToLong(ip: string): number {
  if (!ip) return 0;
  const octets = ip.split(".").map((o) => parseInt(o, 10));
  if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) return 0;
  return (((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + (octets[3] >>> 0));
}

function parseMikrotikPoolSize(ranges: string): number {
  if (!ranges || typeof ranges !== "string") return 0;
  let total = 0;
  const parts = ranges
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (part.includes("-")) {
      const [startIp, endIp] = part.split("-").map((s) => s.trim());
      const startNum = ipToLong(startIp);
      const endNum = ipToLong(endIp);
      if (startNum > 0 && endNum >= startNum) {
        total += endNum - startNum + 1;
      }
    } else if (part.includes("/")) {
      const [, cidr] = part.split("/");
      const bits = parseInt(cidr, 10);
      if (!isNaN(bits) && bits >= 0 && bits <= 32) {
        total += Math.pow(2, 32 - bits);
      }
    } else if (part) {
      total += 1;
    }
  }
  return total;
}

export function normalizeIPPool(p: any) {
  if (!p) return null;
  const ranges = p?.ranges || "";
  return {
    id: p?.[".id"] || p?.id || p?.name,
    name: p?.name || "",
    ranges,
    nextPool: p?.["next-pool"] || "none",
    comment: p?.comment || "",
    totalIps: parseMikrotikPoolSize(ranges)
  };
}

// ==========================================
// Entity Normalizers
// ==========================================
export function normalizeNetworkInterface(i: any) {
  if (!i) return null;
  const name = i?.name || "";
  const rxBytes = parseInt(i?.["rx-byte"] || i?.rxBytes || i?.["rx-bytes"] || "0", 10) || 0;
  const txBytes = parseInt(i?.["tx-byte"] || i?.txBytes || i?.["tx-bytes"] || "0", 10) || 0;
  const now = Date.now();

  let rxBps = 0;
  let txBps = 0;

  const prev = interfaceRateTracker.get(name);
  if (prev && prev.lastTime > 0) {
    const elapsedSec = (now - prev.lastTime) / 1000;
    if (elapsedSec > 0.4 && elapsedSec < 120) {
      const deltaRx = rxBytes - prev.lastRxBytes;
      const deltaTx = txBytes - prev.lastTxBytes;
      if (deltaRx >= 0) rxBps = Math.round((deltaRx * 8) / elapsedSec);
      if (deltaTx >= 0) txBps = Math.round((deltaTx * 8) / elapsedSec);
    } else if (elapsedSec <= 0.4) {
      rxBps = prev.rxBps;
      txBps = prev.txBps;
    }
  }

  const finalRxBps = rxBps > 0 ? rxBps : prev?.rxBps && now - prev.lastTime < 10000 ? prev.rxBps : 0;
  const finalTxBps = txBps > 0 ? txBps : prev?.txBps && now - prev.lastTime < 10000 ? prev.txBps : 0;

  if (interfaceRateTracker.size > 2000) {
    const cutoff = now - 15 * 60 * 1000;
    for (const [k, v] of interfaceRateTracker.entries()) {
      if (v.lastTime < cutoff) interfaceRateTracker.delete(k);
    }
  }
  interfaceRateTracker.set(name, {
    lastRxBytes: rxBytes,
    lastTxBytes: txBytes,
    lastTime: now,
    rxBps: finalRxBps,
    txBps: finalTxBps
  });

  return {
    id: i?.[".id"] || i?.id || name,
    name,
    type: i?.type || "ether",
    running: i?.running === "true" || i?.running === true,
    disabled: i?.disabled === "true" || i?.disabled === true,
    rxBytes,
    txBytes,
    rxBps: finalRxBps,
    txBps: finalTxBps,
    comment: i?.comment || ""
  };
}

export function normalizeActiveHotspotUser(u: any) {
  if (!u) return null;
  const id = u?.[".id"] || u?.id || `act-${Date.now()}`;
  const user = u?.user || u?.name || "";
  const address = u?.address || "";
  const macAddress = u?.["mac-address"] || u?.macAddress || "";
  const bytesIn = parseInt(u?.["bytes-in"] || u?.bytesIn || "0", 10) || 0;
  const bytesOut = parseInt(u?.["bytes-out"] || u?.bytesOut || "0", 10) || 0;
  const now = Date.now();

  const key = `${user}__${address || macAddress || id}`;
  let rxRateBps = 0;
  let txRateBps = 0;

  const prev = activeUserRateTracker.get(key);
  if (prev && prev.lastTime > 0) {
    const elapsedSec = (now - prev.lastTime) / 1000;
    if (elapsedSec > 0.4 && elapsedSec < 120) {
      const deltaOut = bytesOut - prev.lastBytesOut;
      const deltaIn = bytesIn - prev.lastBytesIn;
      if (deltaOut >= 0) rxRateBps = Math.round((deltaOut * 8) / elapsedSec);
      if (deltaIn >= 0) txRateBps = Math.round((deltaIn * 8) / elapsedSec);
    } else if (elapsedSec <= 0.4) {
      rxRateBps = prev.rxRateBps;
      txRateBps = prev.txRateBps;
    }
  }

  const finalRx = rxRateBps > 0 ? rxRateBps : prev?.rxRateBps && now - prev.lastTime < 10000 ? prev.rxRateBps : 0;
  const finalTx = txRateBps > 0 ? txRateBps : prev?.txRateBps && now - prev.lastTime < 10000 ? prev.txRateBps : 0;

  if (activeUserRateTracker.size > 5000) {
    const cutoff = now - 10 * 60 * 1000;
    for (const [k, v] of activeUserRateTracker.entries()) {
      if (v.lastTime < cutoff) activeUserRateTracker.delete(k);
    }
  }
  activeUserRateTracker.set(key, {
    lastBytesIn: bytesIn,
    lastBytesOut: bytesOut,
    lastTime: now,
    rxRateBps: finalRx,
    txRateBps: finalTx
  });

  return {
    id,
    server: u?.server || "all",
    user,
    address,
    macAddress,
    loginBy: u?.["login-by"] || u?.loginBy || "",
    uptime: u?.uptime || "0s",
    bytesIn,
    bytesOut,
    idleTime: u?.["idle-time"] || u?.idleTime || "0s",
    rxRateBps: finalRx,
    txRateBps: finalTx,
    totalRateBps: finalRx + finalTx
  };
}

export function normalizeHotspotProfile(p: any) {
  const onLogin = p?.["on-login"] || "";
  const commentStr = p?.comment || "";
  let price = 0;
  let validityDays = 0;
  let validity = "";
  let dataQuotaMb = 0;

  const combinedMeta = commentStr + "\n" + onLogin;
  const metaMatch = combinedMeta.match(
    /ZCtrl\|Price:([\d.]+)\|(?:Validity|ValidityDays):([^|\n]+)\|DataQuotaMb:(\d+)/
  );
  if (metaMatch) {
    price = parseFloat(metaMatch[1]) || 0;
    const valRaw = (metaMatch[2] || "").trim();
    dataQuotaMb = parseInt(metaMatch[3], 10) || 0;
    if (
      valRaw &&
      valRaw !== "0" &&
      valRaw !== "0s" &&
      valRaw.toLowerCase() !== "unlimited" &&
      valRaw !== "مفتوح" &&
      valRaw !== "غير محدد"
    ) {
      if (/^\d+$/.test(valRaw)) {
        validityDays = parseInt(valRaw, 10);
        validity = `${validityDays}d`;
      } else {
        validity = valRaw;
        const matchDays = valRaw.match(/(\d+)\s*d/i);
        validityDays = matchDays ? parseInt(matchDays[1], 10) : 0;
      }
    }
  } else {
    const commentValidity = commentStr.match(/(?:validity|صلاحية)[:=]\s*([0-9]+[smhdw])/i);
    if (commentValidity) {
      validity = commentValidity[1].trim();
      const matchDays = validity.match(/(\d+)\s*d/i);
      validityDays = matchDays ? parseInt(matchDays[1], 10) : 0;
    }
    const commentPrice = commentStr.match(/(?:price|سعر)[:=]\s*([0-9.]+)/i);
    if (commentPrice) price = parseFloat(commentPrice[1]) || 0;
    const commentQuota = commentStr.match(/(?:quota|حصة|بيانات)[:=]\s*([0-9]+)\s*(?:mb|g|gb)?/i);
    if (commentQuota) dataQuotaMb = parseInt(commentQuota[1], 10) || 0;
  }

  let startsAt: "first-login" | "at-creation" = "first-login";
  const startsAtMatch = combinedMeta.match(/StartsAt:([a-zA-Z0-9_-]+)/i);
  if (startsAtMatch && startsAtMatch[1].toLowerCase() === "at-creation") {
    startsAt = "at-creation";
  }

  let sharedUsers = parseInt(p?.["shared-users"] || "0", 10);
  if (!sharedUsers || isNaN(sharedUsers)) {
    const suMatch = combinedMeta.match(/SharedUsers:(\d+)/i);
    sharedUsers = suMatch ? parseInt(suMatch[1], 10) : 1;
  }

  // Durable fallback: recover Price/Validity/Quota from local SQLite mirror if WinBox wiped on-login
  const profileName = p?.name || "default";
  if (!metaMatch && price === 0 && !validity && dataQuotaMb === 0 && profileName) {
    const persisted = voucherDb.getProfileMetadata("hotspot", profileName);
    if (persisted) {
      price = persisted.price || 0;
      validity = persisted.validity || "";
      validityDays = persisted.validityDays || 0;
      dataQuotaMb = persisted.dataQuotaMb || 0;
      if (!startsAtMatch && persisted.startsAt) {
        startsAt = persisted.startsAt;
      }
    }
  }

  return {
    id: p?.[".id"] || p?.id || p?.name,
    name: p?.name || "default",
    sharedUsers,
    rateLimit: p?.["rate-limit"] || "",
    macCookieTimeout: p?.["mac-cookie-timeout"] || "",
    keepaliveTimeout: p?.["keepalive-timeout"] || "",
    sessionTimeout: p?.["session-timeout"] || "",
    idleTimeout: p?.["idle-timeout"] || "",
    statusAutorefresh: p?.["status-autorefresh"] || "",
    addressPool: p?.["address-pool"] || "",
    transparentProxy: p?.["transparent-proxy"] === "yes" || p?.["transparent-proxy"] === true,
    openStatusPage: (p?.["open-status-page"] || "always") as "always" | "http-login",
    advertise: p?.advertise === "yes" || p?.advertise === true,
    advertiseUrl: p?.["advertise-url"] || "",
    advertiseInterval: p?.["advertise-interval"] || "",
    advertiseTimeout: p?.["advertise-timeout"] || "",
    parentQueue: p?.["parent-queue"] || "none",
    queueType: p?.["queue-type"] || "default",
    insertQueueBefore: p?.["insert-queue-before"] || "first",
    onLoginScript: onLogin,
    onLogoutScript: p?.["on-logout"] || "",
    incomingFilter: p?.["incoming-filter"] || "",
    outgoingFilter: p?.["outgoing-filter"] || "",
    addressList: p?.["address-list"] || "",
    comment: commentStr,
    price,
    validity,
    validityDays,
    dataQuotaMb,
    startsAt
  };
}

export function normalizePPPProfile(p: any) {
  const onUp = p?.["on-up"] || "";
  const commentStr = p?.comment || "";
  let price = 0;
  let validityDays = 0;
  let validity = "";
  let dataQuotaMb = 0;

  const combinedMeta = commentStr + "\n" + onUp;
  const metaMatch = combinedMeta.match(
    /ZCtrl\|Price:([\d.]+)\|(?:Validity|ValidityDays):([^|\n]+)\|DataQuotaMb:(\d+)/
  );
  if (metaMatch) {
    price = parseFloat(metaMatch[1]) || 0;
    const valRaw = (metaMatch[2] || "").trim();
    dataQuotaMb = parseInt(metaMatch[3], 10) || 0;
    if (
      valRaw &&
      valRaw !== "0" &&
      valRaw !== "0s" &&
      valRaw.toLowerCase() !== "unlimited" &&
      valRaw !== "مفتوح" &&
      valRaw !== "غير محدد"
    ) {
      if (/^\d+$/.test(valRaw)) {
        validityDays = parseInt(valRaw, 10);
        validity = `${validityDays}d`;
      } else {
        validity = valRaw;
        const matchDays = valRaw.match(/(\d+)\s*d/i);
        validityDays = matchDays ? parseInt(matchDays[1], 10) : 0;
      }
    }
  } else {
    const commentValidity = commentStr.match(/(?:validity|صلاحية)[:=]\s*([0-9]+[smhdw])/i);
    if (commentValidity) {
      validity = commentValidity[1].trim();
      const matchDays = validity.match(/(\d+)\s*d/i);
      validityDays = matchDays ? parseInt(matchDays[1], 10) : 0;
    }
    const commentPrice = commentStr.match(/(?:price|سعر)[:=]\s*([0-9.]+)/i);
    if (commentPrice) price = parseFloat(commentPrice[1]) || 0;
    const commentQuota = commentStr.match(/(?:quota|حصة|بيانات)[:=]\s*([0-9]+)\s*(?:mb|g|gb)?/i);
    if (commentQuota) dataQuotaMb = parseInt(commentQuota[1], 10) || 0;
  }

  let startsAt: "first-login" | "at-creation" = "first-login";
  const startsAtMatch = combinedMeta.match(/StartsAt:([a-zA-Z0-9_-]+)/i);
  if (startsAtMatch && startsAtMatch[1].toLowerCase() === "at-creation") {
    startsAt = "at-creation";
  }

  let sharedUsers = p?.["only-one"] === "no" ? 2 : 1;
  const suMatch = combinedMeta.match(/SharedUsers:(\d+)/i);
  if (suMatch) sharedUsers = parseInt(suMatch[1], 10) || sharedUsers;

  // Durable fallback: recover PPP Price/Validity/Quota from local SQLite mirror if WinBox wiped on-up/comment
  const pppProfileName = p?.name || "default";
  if (!metaMatch && price === 0 && !validity && dataQuotaMb === 0 && pppProfileName) {
    const persisted = voucherDb.getProfileMetadata("ppp", pppProfileName);
    if (persisted) {
      price = persisted.price || 0;
      validity = persisted.validity || "";
      validityDays = persisted.validityDays || 0;
      dataQuotaMb = persisted.dataQuotaMb || 0;
      if (!startsAtMatch && persisted.startsAt) {
        startsAt = persisted.startsAt;
      }
    }
  }

  return {
    id: p?.[".id"] || p?.id || p?.name,
    name: p?.name || "default",
    localAddress: p?.["local-address"] || "",
    remoteAddress: p?.["remote-address"] || "",
    remoteIpv6PrefixPool: p?.["remote-ipv6-prefix-pool"] || "none",
    bridge: p?.bridge || "none",
    bridgeHorizon: p?.["bridge-horizon"] || "",
    rateLimit: p?.["rate-limit"] || "",
    onlyOne: p?.["only-one"] || (sharedUsers > 1 ? "no" : "yes"),
    sharedUsers,
    dnsServer: p?.["dns-server"] || "",
    winsServer: p?.["wins-server"] || "",
    useIpv6: p?.["use-ipv6"] || "no",
    useMpls: p?.["use-mpls"] || "default",
    useCompression: p?.["use-compression"] || "no",
    useEncryption: p?.["use-encryption"] || "yes",
    sessionTimeout: p?.["session-timeout"] || "",
    idleTimeout: p?.["idle-timeout"] || "",
    parentQueue: p?.["parent-queue"] || "none",
    queueType: p?.["queue-type"] || "default",
    onUpScript: onUp,
    onDownScript: p?.["on-down"] || "",
    addressList: p?.["address-list"] || "",
    comment: commentStr,
    price,
    validity,
    validityDays,
    dataQuotaMb,
    startsAt
  };
}

export function normalizeUsermanProfile(p: any, profileLimitsMap?: Map<string, any>) {
  const pName = String(p?.name || "default");
  const limits = profileLimitsMap?.get(pName.toLowerCase());
  const commentStr = String(p?.comment || "");

  let startsAt = p?.["starts-when"] || p?.["starts-at"] || "";
  if (startsAt === "logon") startsAt = "first-auth";
  if (startsAt === "assigned" || startsAt === "create-and-activate") startsAt = "at-creation";
  if (!startsAt) {
    const m = commentStr.match(/StartsAt:([a-zA-Z0-9_-]+)/i);
    startsAt = m ? (m[1] === "logon" ? "first-auth" : (m[1] as any)) : "first-auth";
  }

  let overrideSharedUsers: any = p?.["override-shared-users"];
  if (overrideSharedUsers === undefined || overrideSharedUsers === "" || overrideSharedUsers === "default") {
    const m = commentStr.match(/(?:OverrideSharedUsers|SharedUsers):(\d+)/i);
    overrideSharedUsers = m ? parseInt(m[1], 10) : 1;
  } else {
    overrideSharedUsers = parseInt(String(overrideSharedUsers), 10) || 1;
  }

  const transferBytes = limits?.transferLimit || parseInt(p?.["transfer-limit"] || "0", 10) || 0;
  const downloadBytes = limits?.downloadLimit || parseInt(p?.["download-limit"] || "0", 10) || 0;
  const uploadBytes = limits?.uploadLimit || parseInt(p?.["upload-limit"] || "0", 10) || 0;
  const toMb = (bytes: number) => (bytes > 0 ? Math.round(bytes / (1024 * 1024)) : 0);

  return {
    id: p?.[".id"] || p?.id || p?.name,
    name: pName,
    nameForUsers: p?.["name-for-users"] || p?.name || "",
    validity: p?.validity || "",
    price: parseFloat(p?.price || "0") || 0,
    startsAt: (startsAt || "first-auth") as "first-auth" | "at-creation" | "now",
    owner: p?.owner || "admin",
    overrideSharedUsers,
    sharedUsers: overrideSharedUsers,
    limitationName: limits?.limitationName || `Lim-${pName}`,
    uptimeLimit: limits?.uptimeLimit || p?.["uptime-limit"] || "",
    transferLimit: transferBytes,
    downloadLimit: downloadBytes,
    uploadLimit: uploadBytes,
    transferLimitMb: toMb(transferBytes),
    downloadLimitMb: toMb(downloadBytes),
    uploadLimitMb: toMb(uploadBytes),
    dataQuotaMb: toMb(transferBytes),
    rateLimit:
      limits?.rateLimit ||
      p?.["rate-limit"] ||
      (p?.["rx-limit"] ? `${p?.["rx-limit"]}/${p?.["tx-limit"]}` : ""),
    rateLimitMin: limits?.rateLimitMin || "",
    fromTime: limits?.fromTime || "00:00:00",
    tillTime: limits?.tillTime || "23:59:59",
    weekdays: limits?.weekdays || "saturday,sunday,monday,tuesday,wednesday,thursday,friday"
  };
}

export function normalizeSimpleQueue(q: any) {
  return normalizeSimpleQueueRow(q) || {
    id: q?.[".id"] || q?.id || q?.name || "",
    name: "",
    target: "",
    maxLimit: "",
    limitAt: "",
    bytes: "0/0",
    bytesIn: 0,
    bytesOut: 0,
    bytesTotal: 0,
    packets: "0/0",
    disabled: false,
    priority: "8/8",
    burstLimit: "",
    burstThreshold: "",
    burstTime: "",
    parent: "none",
    queue: "",
    comment: ""
  };
}

export function normalizeDhcpLease(l: any) {
  return normalizeDhcpLeaseRow(l);
}

export function parseDurationToSeconds(str?: string): number {
  if (!str) return 0;
  const s = String(str).trim().toLowerCase();
  if (s === "0" || s === "0s" || s === "none" || s === "never" || s === "") return 0;

  let totalSec = 0;
  const w = s.match(/(\d+)\s*w/);
  if (w) totalSec += parseInt(w[1], 10) * 7 * 86400;
  const d = s.match(/(\d+)\s*d/);
  if (d) totalSec += parseInt(d[1], 10) * 86400;
  const h = s.match(/(\d+)\s*h/);
  if (h) totalSec += parseInt(h[1], 10) * 3600;
  const m = s.match(/(\d+)\s*m(?!s)/);
  if (m) totalSec += parseInt(m[1], 10) * 60;
  const sec = s.match(/(\d+)\s*s/);
  if (sec) totalSec += parseInt(sec[1], 10);

  const timeMatch = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s|$)/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10) || 0;
    const mins = parseInt(timeMatch[2], 10) || 0;
    const secs = parseInt(timeMatch[3] || "0", 10) || 0;
    totalSec += hours * 3600 + mins * 60 + secs;
  }
  return totalSec;
}

export const fetchSafeCached = async (
  endpoint: string,
  params: string[] | undefined,
  cacheDurationMs: number,
  clientOverride?: any,
  force?: boolean
) => {
  const client = clientOverride || MikrotikAPI;
  const cfg = client.getConfig ? client.getConfig() : null;
  const host = cfg ? `${cfg.host}:${cfg.port || 8728}` : MikrotikAPI.getConfig()?.host || "unknown-router";
  const normalizedParams = params?.map((p) =>
    typeof p === "string" && p.startsWith("-.")
      ? p
      : typeof p === "string" && p.startsWith("=.")
      ? p.substring(1)
      : p
  );
  const cacheKey =
    normalizedParams && normalizedParams.length > 0
      ? `${host}:${endpoint}?${normalizedParams.slice().sort().join("&")}`
      : `${host}:${endpoint}`;

  const isBatchSyncing = typeof client.isBatchSyncActive === "function" && client.isBatchSyncActive();
  const isStressed = typeof client.isThermalStressed === "function" && client.isThermalStressed();
  const effectiveDuration = isBatchSyncing
    ? 120000
    : isStressed
    ? Math.round(cacheDurationMs * 1.6)
    : cacheDurationMs;

  if (!force) {
    const cachedData = queryCache.get(cacheKey, effectiveDuration);
    if (cachedData) return cachedData;
    if (isBatchSyncing) {
      const staleData = queryCache.get(cacheKey, 600000);
      if (staleData) return staleData;
    }
  }

  if (inFlightQueries.has(cacheKey) && !force) {
    return inFlightQueries.get(cacheKey);
  }

  const queryPromise = (async () => {
    try {
      const data = await client.querySafe(endpoint, params);
      if (Array.isArray(data)) {
        queryCache.set(cacheKey, data);
      }
      return data || [];
    } catch {
      const cachedData = queryCache.get(cacheKey, 600000);
      return cachedData || [];
    } finally {
      inFlightQueries.delete(cacheKey);
    }
  })();

  if (!force) {
    inFlightQueries.set(cacheKey, queryPromise);
  }
  return queryPromise;
};

export async function fetchComprehensiveUsermanData(clientOverride?: any, force?: boolean) {
  const client = clientOverride || MikrotikAPI;

  if (!force && cachedUsermanResult && Date.now() - cachedUsermanResult.timestamp < 180000) {
    return cachedUsermanResult.data;
  }

  const isV6 = client.isV6 ? client.isV6() : false;
  const primaryPrefix = isV6 ? "/tool/user-manager" : "/user-manager";
  const altPrefix = isV6 ? "/user-manager" : "/tool/user-manager";
  const userProplist = isV6
    ? ["=.proplist=.id,username,password,customer,comment,disabled"]
    : ["=.proplist=.id,name,password,group,comment,disabled"];

  let activePrefix = primaryPrefix;
  let rawUsers = await fetchSafeCached(`${primaryPrefix}/user/print`, userProplist, 180000, client, force);
  if (!Array.isArray(rawUsers) || rawUsers.length === 0) {
    const altUsers = await fetchSafeCached(`${altPrefix}/user/print`, userProplist, 180000, client, force);
    if (Array.isArray(altUsers) && altUsers.length > 0) {
      activePrefix = altPrefix;
      rawUsers = altUsers;
    }
  }

  if (!Array.isArray(rawUsers)) {
    rawUsers = [];
  }

  const isActiveV6 = activePrefix === "/tool/user-manager";
  const limPrintPath = isActiveV6 ? `${activePrefix}/profile/limitation/print` : `${activePrefix}/limitation/print`;
  const plPrintPath = isActiveV6 ? `${activePrefix}/profile/profile-limitation/print` : `${activePrefix}/profile-limitation/print`;

  const [
    rawProfiles,
    rawUserProfiles,
    rawLimitations,
    rawProfileLimitations,
    rawSessions,
    rawDhcpLeases,
    rawHotspotHosts
  ] = await Promise.all([
    fetchSafeCached(`${activePrefix}/profile/print`, undefined, 180000, client, force).catch(() => []),
    fetchSafeCached(`${activePrefix}/user-profile/print`, undefined, 60000, client, force).catch(() => []),
    fetchSafeCached(limPrintPath, undefined, 180000, client, force).catch(() => []),
    fetchSafeCached(plPrintPath, undefined, 180000, client, force).catch(() => []),
    fetchSafeCached(`${activePrefix}/session/print`, undefined, 15000, client, force).catch(() => []),
    fetchSafeCached("/ip/dhcp-server/lease/print", ["=.proplist=.id,address,mac-address,host-name"], 30000, client, force).catch(() => []),
    fetchSafeCached("/ip/hotspot/host/print", ["=.proplist=.id,address,mac-address,host-name,comment"], 20000, client, force).catch(() => [])
  ]);

  const deviceNameMap = new Map<string, { hostName: string; ip: string }>();
  (Array.isArray(rawDhcpLeases) ? rawDhcpLeases : []).forEach((l: any) => {
    const mac = String(l?.["mac-address"] || l?.macAddress || "")
      .toLowerCase()
      .replace(/[:-]/g, "");
    const host = String(l?.["host-name"] || l?.hostName || "").trim();
    const ip = String(l?.address || l?.ip || "").trim();
    if (mac) deviceNameMap.set(mac, { hostName: host, ip });
  });
  (Array.isArray(rawHotspotHosts) ? rawHotspotHosts : []).forEach((h: any) => {
    const mac = String(h?.["mac-address"] || h?.macAddress || "")
      .toLowerCase()
      .replace(/[:-]/g, "");
    const host = String(h?.["host-name"] || h?.hostName || h?.comment || "").trim();
    const ip = String(h?.address || "").trim();
    if (mac) {
      const existing = deviceNameMap.get(mac);
      deviceNameMap.set(mac, {
        hostName: host || existing?.hostName || "",
        ip: ip || existing?.ip || ""
      });
    }
  });

  const limitationsMap = new Map<string, any>();
  (Array.isArray(rawLimitations) ? rawLimitations : []).forEach((lim: any) => {
    const name = String(lim?.name || lim?.[".id"] || "").toLowerCase();
    if (name) limitationsMap.set(name, lim);
  });

  const profileLimitsMap = new Map<string, any>();
  (Array.isArray(rawProfileLimitations) ? rawProfileLimitations : []).forEach((pl: any) => {
    const profName = String(pl?.profile || "").toLowerCase();
    const limNameRaw = String(pl?.limitation || "");
    const lim = limitationsMap.get(limNameRaw.toLowerCase());
    if (profName && lim) {
      const existing = profileLimitsMap.get(profName) || {
        limitationName: limNameRaw,
        uptimeLimit: "",
        transferLimit: 0,
        downloadLimit: 0,
        uploadLimit: 0,
        rateLimit: "",
        rateLimitMin: "",
        fromTime: pl?.["from-time"] || "00:00:00",
        tillTime: pl?.["till-time"] || "23:59:59",
        weekdays: pl?.weekdays || "saturday,sunday,monday,tuesday,wednesday,thursday,friday"
      };
      if (!existing.limitationName && limNameRaw) existing.limitationName = limNameRaw;
      if (!existing.uptimeLimit && lim["uptime-limit"]) existing.uptimeLimit = lim["uptime-limit"];
      if (!existing.transferLimit && (lim["transfer-limit"] || lim["download-limit"])) {
        existing.transferLimit = parseInt(lim["transfer-limit"] || lim["download-limit"] || "0", 10);
      }
      if (!existing.downloadLimit && lim["download-limit"]) {
        existing.downloadLimit = parseInt(lim["download-limit"] || "0", 10);
      }
      if (!existing.uploadLimit && lim["upload-limit"]) {
        existing.uploadLimit = parseInt(lim["upload-limit"] || "0", 10);
      }
      if (!existing.rateLimit && (lim["rate-limit-rx"] || lim["rate-limit-tx"])) {
        existing.rateLimit = `${lim["rate-limit-rx"] || "0"}/${lim["rate-limit-tx"] || "0"}`;
      }
      if (!existing.rateLimitMin && (lim["rate-limit-min-rx"] || lim["rate-limit-min-tx"])) {
        existing.rateLimitMin = `${lim["rate-limit-min-rx"] || "0"}/${lim["rate-limit-min-tx"] || "0"}`;
      }
      profileLimitsMap.set(profName, existing);
    }
  });

  const userProfilesMap = new Map<string, any>();
  (Array.isArray(rawUserProfiles) ? rawUserProfiles : []).forEach((up: any) => {
    const uName = String(up?.user || up?.username || "").toLowerCase();
    if (uName) {
      const existing = userProfilesMap.get(uName);
      const isRunning = up?.state === "running" || up?.state === "active";
      if (!existing || isRunning) userProfilesMap.set(uName, up);
    }
  });

  const activeSessionsList: any[] = [];
  const userSessionsMap = new Map<string, any>();

  (Array.isArray(rawSessions) ? rawSessions : []).forEach((s: any) => {
    const uName = String(s?.user || s?.username || s?.["user-id"] || "").toLowerCase();
    if (!uName) return;
    const isActive =
      s.active === "true" ||
      s.active === true ||
      s.active === "yes" ||
      s.state === "active" ||
      s.status === "active";
    if (isActive) activeSessionsList.push(s);

    let userSessionData = userSessionsMap.get(uName);
    if (!userSessionData) {
      userSessionData = {
        totalUptimeSec: 0,
        totalBytesIn: 0,
        totalBytesOut: 0,
        sessionsCount: 0
      };
      userSessionsMap.set(uName, userSessionData);
    }

    userSessionData.sessionsCount++;
    userSessionData.totalUptimeSec += parseDurationToSeconds(s.uptime || s["session-time"] || "0s");
    userSessionData.totalBytesIn +=
      parseInt(s["acct-input-octets"] || s.download || s["bytes-in"] || "0", 10) || 0;
    userSessionData.totalBytesOut +=
      parseInt(s["acct-output-octets"] || s.upload || s["bytes-out"] || "0", 10) || 0;

    const sMac = String(
      s?.["calling-station-id"] || s?.["caller-id"] || s?.["mac-address"] || s?.callerId || ""
    ).trim();
    if (sMac) {
      userSessionData.latestMac = sMac;
      const cleanSMac = sMac.toLowerCase().replace(/[:-]/g, "");
      const sDev = deviceNameMap.get(cleanSMac);
      if (sDev?.hostName) userSessionData.latestHostName = sDev.hostName;
    }
    const sHost = String(s?.["host-name"] || s?.hostName || "").trim();
    if (sHost) userSessionData.latestHostName = sHost;

    if (isActive) {
      userSessionData.activeSession = s;
    } else if (!userSessionData.latestClosedSession) {
      userSessionData.latestClosedSession = s;
    } else {
      const currentTill =
        userSessionData.latestClosedSession["till-time"] || userSessionData.latestClosedSession.tillTime || "";
      const newTill = s["till-time"] || s.tillTime || "";
      if (newTill && (!currentTill || newTill > currentTill)) {
        userSessionData.latestClosedSession = s;
      }
    }
  });

  const mappedUsers = (Array.isArray(rawUsers) ? rawUsers : []).map((u: any) => {
    const uName = String(u?.username || u?.name || "مشترك يوزر مانجر");
    const uKey = uName.toLowerCase();
    const userProfile = userProfilesMap.get(uKey);
    const sessionInfo = userSessionsMap.get(uKey);
    const activeSession = sessionInfo?.activeSession;
    const lastSession = sessionInfo?.latestClosedSession;

    const resolvedProfile = String(
      userProfile?.profile || u?.["actual-profile"] || u?.profile || u?.group || "default"
    );
    const profLimits = profileLimitsMap.get(resolvedProfile.toLowerCase());
    const matchedProfile = (Array.isArray(rawProfiles) ? rawProfiles : []).find(
      (p: any) => String(p?.name || "").toLowerCase() === resolvedProfile.toLowerCase()
    );

    const mac = String(
      activeSession?.["calling-station-id"] ||
        lastSession?.["calling-station-id"] ||
        sessionInfo?.latestMac ||
        u?.["caller-id"] ||
        u?.["mac-address"] ||
        u?.callerId ||
        ""
    );
    const cleanMac = mac.toLowerCase().replace(/[:-]/g, "");
    const devInfo = cleanMac ? deviceNameMap.get(cleanMac) : undefined;

    let ouiDeviceName = "";
    if (mac) {
      ouiDeviceName = getDeviceNameFromCache(mac);
      if (!ouiDeviceName || ouiDeviceName === "Unknown-Vendor") queueMacForLookup(mac);
    }

    const hostName =
      ouiDeviceName ||
      devInfo?.hostName ||
      sessionInfo?.latestHostName ||
      activeSession?.["host-name"] ||
      lastSession?.["host-name"] ||
      "";
    const assignedIp =
      devInfo?.ip ||
      activeSession?.["assigned-ip"] ||
      activeSession?.["framed-ip-address"] ||
      lastSession?.["assigned-ip"] ||
      lastSession?.["framed-ip-address"] ||
      u?.["assigned-ip"] ||
      "";

    let effectiveUptime = "0s";
    if (activeSession?.uptime) effectiveUptime = activeSession.uptime;
    else if (u?.["uptime-used"]) effectiveUptime = u["uptime-used"];
    else if (u?.uptime) effectiveUptime = u.uptime;
    else if (userProfile?.uptime) effectiveUptime = userProfile.uptime;
    else if (sessionInfo && sessionInfo.totalUptimeSec > 0) effectiveUptime = `${sessionInfo.totalUptimeSec}s`;

    let effectiveBytesIn = 0;
    if (activeSession) {
      effectiveBytesIn = parseInt(activeSession["acct-input-octets"] || activeSession["bytes-in"] || "0", 10) || 0;
    } else if (u?.["download-used"]) {
      effectiveBytesIn = parseInt(u["download-used"], 10) || 0;
    } else if (userProfile?.download) {
      effectiveBytesIn = parseInt(userProfile.download, 10) || 0;
    } else if (sessionInfo) {
      effectiveBytesIn = sessionInfo.totalBytesIn;
    }

    let effectiveBytesOut = 0;
    if (activeSession) {
      effectiveBytesOut = parseInt(activeSession["acct-output-octets"] || activeSession["bytes-out"] || "0", 10) || 0;
    } else if (u?.["upload-used"]) {
      effectiveBytesOut = parseInt(u["upload-used"], 10) || 0;
    } else if (userProfile?.upload) {
      effectiveBytesOut = parseInt(userProfile.upload, 10) || 0;
    } else if (sessionInfo) {
      effectiveBytesOut = sessionInfo.totalBytesOut;
    }

    const effectiveLimitUptime = u?.["limit-uptime"] || u?.["uptime-limit"] || profLimits?.uptimeLimit || "";
    const effectiveLimitBytesTotal =
      parseInt(u?.["limit-bytes-total"] || u?.["download-limit"] || "0", 10) || profLimits?.transferLimit || 0;
    const effectiveRateLimit =
      profLimits?.rateLimit ||
      matchedProfile?.["rate-limit"] ||
      (matchedProfile?.["rx-limit"] ? `${matchedProfile["rx-limit"]}/${matchedProfile["tx-limit"]}` : "") ||
      "";

    const lastLoggedOut =
      lastSession?.["till-time"] ||
      lastSession?.tillTime ||
      u?.["last-logged-out"] ||
      u?.["last-seen"] ||
      u?.lastLoggedOut ||
      "";
    const lastLoggedIn =
      activeSession?.["from-time"] ||
      lastSession?.["from-time"] ||
      userProfile?.["start-time"] ||
      u?.["last-logged-in"] ||
      u?.lastLoggedIn ||
      "";
    const effectiveState = userProfile?.state || u?.state || "active";
    const endTime = userProfile?.["end-time"] || userProfile?.endTime || u?.["till-time"] || u?.endTime || "";
    const startTime = userProfile?.["start-time"] || userProfile?.startTime || u?.["start-time"] || "";
    const rawCreatedAt =
      u?.created ||
      u?.["created-time"] ||
      u?.["creation-time"] ||
      u?.["time-created"] ||
      userProfile?.["created-time"] ||
      userProfile?.created ||
      userProfile?.["start-time"] ||
      u?.["start-time"] ||
      "";

    return {
      id: u?.[".id"] || u?.id || uName || `um-${Date.now()}`,
      name: uName,
      password: u?.password || "",
      profile: resolvedProfile,
      uptime: effectiveUptime,
      bytesIn: effectiveBytesIn,
      bytesOut: effectiveBytesOut,
      limitUptime: effectiveLimitUptime,
      limitBytesTotal: effectiveLimitBytesTotal,
      rateLimit: effectiveRateLimit,
      comment: u?.comment || "",
      disabled:
        u?.disabled === "true" ||
        u?.disabled === true ||
        u?.disabled === "yes" ||
        u?.state === "disabled",
      customer: u?.customer || "admin",
      state: effectiveState,
      macAddress: mac,
      callerId: mac,
      hostName,
      assignedIp,
      lastLoggedOut,
      lastLoggedIn,
      lastSeen: lastLoggedOut || u?.["last-seen"] || "",
      endTime,
      startTime,
      createdAt: rawCreatedAt,
      validity: matchedProfile?.validity || "",
      hasConnectedPreviously: Boolean(
        sessionInfo ||
          lastLoggedOut ||
          lastLoggedIn ||
          effectiveBytesIn > 0 ||
          effectiveBytesOut > 0 ||
          effectiveUptime !== "0s"
      ),
      raw: {
        ...u,
        userProfile,
        latestSession: lastSession,
        activeSession,
        profLimits,
        hostName,
        macAddress: mac,
        lastLoggedOut,
        endTime,
        startTime,
        createdAt: rawCreatedAt
      }
    };
  });

  const mappedActive = activeSessionsList.map((a: any, idx: number) => {
    const callerMac = a?.["calling-station-id"] || a?.["caller-id"] || a?.callerId || "";
    const cleanCallerMac = callerMac.toLowerCase().replace(/[:-]/g, "");
    const dev = cleanCallerMac ? deviceNameMap.get(cleanCallerMac) : undefined;
    let ouiDeviceName = "";
    if (callerMac) {
      ouiDeviceName = getDeviceNameFromCache(callerMac);
      if (!ouiDeviceName || ouiDeviceName === "Unknown-Vendor") queueMacForLookup(callerMac);
    }

    return {
      id: a?.[".id"] || a?.id || `uma-${Date.now()}-${idx}`,
      user: a?.user || a?.username || a?.["user-id"] || a?.name || "",
      nasIp: a?.["nas-ip"] || a?.nasIp || a?.["nas-ip-address"] || a?.["router-ip"] || "",
      assignedIp: a?.["assigned-ip"] || a?.["framed-ip-address"] || a?.address || dev?.ip || "",
      callerId: callerMac,
      macAddress: callerMac,
      hostName: ouiDeviceName || dev?.hostName || a?.["host-name"] || "",
      uptime: a?.["session-time-left"] || a?.["session-time"] || a?.uptime || "0s",
      bytesIn: parseInt(a?.["acct-input-octets"] || a?.["bytes-in"] || a?.["download-used"] || "0", 10) || 0,
      bytesOut: parseInt(a?.["acct-output-octets"] || a?.["bytes-out"] || a?.["upload-used"] || "0", 10) || 0,
      idleTime: a?.["idle-time"] || a?.idleTime || "0s",
      raw: a
    };
  });

  const mappedProfiles = (Array.isArray(rawProfiles) ? rawProfiles : []).map((p: any) =>
    normalizeUsermanProfile(p, profileLimitsMap)
  );

  const result = {
    users: mappedUsers,
    profiles: mappedProfiles,
    active: mappedActive
  };
  cachedUsermanResult = { data: result, timestamp: Date.now() };
  return result;
}
