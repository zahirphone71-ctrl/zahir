import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { translateErrorMessage } from '../lib/errorTranslator';
import { safeStorage, safeSession } from '../utils/safeStorage';
import { logger } from '../utils/logger';
import {
  saveGlobalCache,
  loadGlobalCache,
  clearGlobalCache,
  saveSubscribersToCache,
  loadSubscribersFromCache
} from '../utils/globalDataCache';
import {
  RouterConnection,
  HotspotUser,
  HotspotProfile,
  ActiveHotspotUser,
  NetworkInterface,
  PPPSecret,
  PPPProfile,
  PPPActive,
  SimpleQueue,
  CardTemplateConfig,
  HotspotIpBinding,
  DhcpLease,
  FirewallRule,
  SystemLogEntry,
  UsermanUser,
  UsermanProfile,
  UsermanActive,
  WirelessInterface,
  WirelessClientStation,
  NeighborAntenna,
  AccessPointItem,
  HotspotServerProfile,
  HotspotServerInstance,
  RouterStorageFile,
  RouterConnectionProfile,
  RouterProfileCategory,
  ScheduledTask,
  BackgroundSyncEngineState,
  StreamStatus,
  OperatorRole
} from '../types/mikrotik';
import {
  PrefetchedData,
  DataPrefetcher,
  MikroTikContextType,
  ConnectionSessionContextType,
  RouterTelemetryContextType,
  SubscribersStateContextType,
  NetworkStateContextType,
  MikroTikActionsContextType,
  RouterIdentitySummary,
  PingStabilizerSnapshot,
  PingStabilizerMode,
  QosRulePreview,
  defaultTemplate,
  DEFAULT_SCHEDULED_TASKS,
  safeSet
} from './mikrotikContextTypes';
import { useSubscriberActions } from './useSubscriberActions';
import { useNetworkPortalActions } from './useNetworkPortalActions';

export type { PrefetchedData, DataPrefetcher, PingStabilizerSnapshot, PingStabilizerMode, QosRulePreview };
export { DEFAULT_SCHEDULED_TASKS };


const MikroTikContext = createContext<MikroTikContextType | undefined>(undefined);
const ConnectionSessionContext = createContext<ConnectionSessionContextType | undefined>(undefined);
const RouterTelemetryContext = createContext<RouterTelemetryContextType | undefined>(undefined);
const SubscribersStateContext = createContext<SubscribersStateContextType | undefined>(undefined);
const NetworkStateContext = createContext<NetworkStateContextType | undefined>(undefined);
const MikroTikActionsContext = createContext<MikroTikActionsContextType | undefined>(undefined);

export const MikroTikProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initialToken = safeStorage.getItem('zcontrol_active_token');
  const [token, setTokenState] = useState<string | null>(initialToken);
  const tokenRef = useRef<string | null>(initialToken);
  const connectTimeRef = useRef<number>(0);
  const authFailureCountRef = useRef<number>(0);



  const runWorkerTask = useCallback((type: string, payload: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      try {
        if (type === 'CHUNK_BATCH') {
          const { items, chunkSize = 50 } = payload;
          const chunks: any[][] = [];
          for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize));
          resolve(chunks);
          return;
        }
        if (type === 'PREPARE_BATCH_PAYLOAD') {
          const { ids, action, value, system, payload: directPayload } = payload;
          const effectivePayload = directPayload !== undefined ? directPayload : value;
          const batches: any[] = [];
          for (let i = 0; i < ids.length; i += 100) {
            batches.push({
              system,
              action,
              ids: ids.slice(i, i + 100),
              value: effectivePayload,
              payload: effectivePayload
            });
          }
          resolve(batches);
          return;
        }
        resolve(payload.items || []);
      } catch (err) {
        reject(err);
      }
    });
  }, []);

  const setToken = useCallback((t: string | null) => {
    tokenRef.current = t;
    setTokenState(t);
    if (t) {
      safeStorage.setItem('zcontrol_active_token', t);
    } else {
      safeStorage.removeItem('zcontrol_active_token');
    }
  }, []);

  const [isSyncingSystem, setIsSyncingSystem] = useState(false);
  const [isSyncingHotspot, setIsSyncingHotspot] = useState(false);
  const [isSyncingPPP, setIsSyncingPPP] = useState(false);
  const [isSyncingNetwork, setIsSyncingNetwork] = useState(false);

  const [bgSyncEngineState, setBgSyncEngineState] = useState<BackgroundSyncEngineState>({
    isRunning: false,
    status: 'idle',
    lastSyncTimestamp: null,
    intervalMs: 30000,
    syncCount: 0
  });
  const [interfaceNames, setInterfaceNames] = useState<string[]>([]);

  const [router, setRouter] = useState<RouterConnection | null>(() => {
    if (typeof window === 'undefined') return null;
    const isSessionAuth = safeSession.getItem('zctrl_session_authenticated') === 'true';
    const hasExplicitLogout = safeStorage.getItem('zctrl_explicit_logout') === 'true';
    if (!isSessionAuth || hasExplicitLogout) return null;
    try {
      const cachedMeta = safeSession.getItem('zctrl_session_router_meta');
      if (cachedMeta) {
        const parsed = JSON.parse(cachedMeta);
        if (parsed && typeof parsed === 'object' && parsed.host) {
          delete parsed.password;
          return parsed as RouterConnection;
        }
      }
    } catch (err) {
      console.warn('[MikroTikContext] Cached router metadata parse warning:', err);
    }
    return {
      id: 'r-session',
      name: '',
      host: '',
      port: 8728,
      username: 'admin',
      useSsl: false,
      version: 'v7',
      boardName: 'RouterBOARD',
      uptime: '',
      cpuLoad: 0,
      freeMemory: 0,
      totalMemory: 0,
      pingMs: 0,
      hasInternet: true,
      connectedAt: new Date().toISOString()
    };
  });
  const [userRole, setUserRole] = useState<OperatorRole>('admin');
  const [operatorName, setOperatorName] = useState<string>('admin');
  const [tlsFingerprint, setTlsFingerprint] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(() => {
    return Boolean(
      typeof window !== 'undefined' &&
      safeSession.getItem('zctrl_session_authenticated') === 'true' &&
      safeStorage.getItem('zctrl_explicit_logout') !== 'true'
    );
  });
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(() => {
    return Boolean(
      typeof window !== 'undefined' &&
      safeSession.getItem('zctrl_session_authenticated') === 'true' &&
      safeStorage.getItem('zctrl_explicit_logout') !== 'true' &&
      !safeStorage.getItem('zcontrol_active_token')
    );
  });
  const isConnectedRef = useRef<boolean>(isConnected);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    if (router && isConnected) {
      try {
        const safeMeta = { ...router };
        delete safeMeta.password;
        safeSession.setItem('zctrl_session_router_meta', JSON.stringify(safeMeta));
      } catch (err) {
        logger.warn('Failed caching session router meta: ' + String(err), 'MikroTikContext');
      }
    }
  }, [router, isConnected]);

  // Pillar 2: Silent Exponential Backoff Reconnection Architecture
  const isContextMountedRef = useRef<boolean>(true);
  const [isSilentReconnecting, setIsSilentReconnecting] = useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const isSilentReconnectingRef = useRef<boolean>(false);
  const silentReconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tabFetchAbortRef = useRef<AbortController | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const lastSyncTimeRef = useRef<number>(0);

  const triggerSilentReconnect = useCallback(() => {
    if (!isContextMountedRef.current) return;
    if (safeStorage.getItem('zctrl_explicit_logout') === 'true') return;
    const activeToken = tokenRef.current || token || safeStorage.getItem('zcontrol_active_token');
    const isSessionAuth = safeSession.getItem('zctrl_session_authenticated') === 'true';
    if (!activeToken && !isSessionAuth) return;

    if (silentReconnectTimerRef.current) {
      clearTimeout(silentReconnectTimerRef.current);
      silentReconnectTimerRef.current = null;
    }

    isSilentReconnectingRef.current = true;
    setIsSilentReconnecting(true);

    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    setReconnectAttempts(attempt);

    // Exponential Backoff: 2s, 4s, 8s, 16s, capped at 30s
    const backoffMs = Math.min(30000, 2000 * Math.pow(2, Math.min(attempt - 1, 4)));

    silentReconnectTimerRef.current = setTimeout(async () => {
      if (!isContextMountedRef.current) return;
      try {
        const res = await fetch('/api/mikrotik/session', {
          credentials: 'same-origin',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            ...(activeToken ? { 'X-Router-Token': activeToken } : {})
          }
        });
        if (!isContextMountedRef.current) return;
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.connected) {
            const restoredToken = data.token || activeToken || null;
            if (restoredToken) {
              setToken(restoredToken);
              safeStorage.setItem('zctrl_router_token', restoredToken);
            }
            reconnectAttemptsRef.current = 0;
            setReconnectAttempts(0);
            isSilentReconnectingRef.current = false;
            setIsSilentReconnecting(false);
            setIsConnected(true);
            if (data.router) {
              setRouter(prev => prev ? { ...prev, ...data.router } : data.router);
            }
            if (data.role) setUserRole(data.role as OperatorRole);
            if (data.operatorName) setOperatorName(data.operatorName);
            if (data.tlsFingerprint !== undefined || data.router?.tlsFingerprint !== undefined) {
              setTlsFingerprint(data.tlsFingerprint ?? data.router?.tlsFingerprint ?? null);
            }
            syncNowRef.current(false).catch(() => {});
            return;
          }
        }
        triggerSilentReconnect();
      } catch {
        if (isContextMountedRef.current) {
          triggerSilentReconnect();
        }
      }
    }, backoffMs);
  }, [token, setToken]);

  const electronRestorePromiseRef = useRef<Promise<boolean> | null>(null);
  const tryRestoreElectronBackendSession = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.zctrlDesktopSession?.restoreBackendSession) {
      return false;
    }
    if (safeStorage.getItem('zctrl_explicit_logout') === 'true') {
      return false;
    }
    if (electronRestorePromiseRef.current) {
      return electronRestorePromiseRef.current;
    }
    const run = (async () => {
      try {
        const res = await window.zctrlDesktopSession!.restoreBackendSession();
        if (!isContextMountedRef.current) return false;
        if (res && res.success && res.token && res.router) {
          tokenRef.current = res.token;
          safeStorage.setItem('zcontrol_active_token', res.token);
          safeStorage.setItem('zctrl_router_token', res.token);
          setToken(res.token);
          safeSession.setItem('zctrl_session_authenticated', 'true');
          setRouter((prev) => ({
            ...(prev || {}),
            ...res.router!,
            connectedAt: prev?.connectedAt || res.router!.connectedAt || new Date().toISOString()
          } as RouterConnection));
          if (res.role) setUserRole(res.role);
          if (res.operatorName) setOperatorName(res.operatorName);
          if (res.tlsFingerprint !== undefined) setTlsFingerprint(res.tlsFingerprint);
          isConnectedRef.current = true;
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
          setReconnectAttempts(0);
          isSilentReconnectingRef.current = false;
          setIsSilentReconnecting(false);
          authFailureCountRef.current = 0;
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        electronRestorePromiseRef.current = null;
      }
    })();
    electronRestorePromiseRef.current = run;
    return run;
  }, [setToken]);

  const fetchWithToken = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const activeToken = tokenRef.current || token || safeStorage.getItem('zcontrol_active_token');
    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
      ...((init?.headers as Record<string, string>) || {}),
      ...(activeToken ? { 'X-Router-Token': activeToken } : {})
    };
    try {
      const res = await fetch(input, {
        ...init,
        credentials: init?.credentials ?? 'same-origin',
        headers
      });
      if (res.ok) {
        authFailureCountRef.current = 0;
        if (reconnectAttemptsRef.current > 0) {
          reconnectAttemptsRef.current = 0;
          setReconnectAttempts(0);
          isSilentReconnectingRef.current = false;
          setIsSilentReconnecting(false);
        }
        return res;
      }
      if (res.status === 503) {
        try {
          const payload = await res.clone().json();
          if (payload?.reconnecting && isConnectedRef.current && safeStorage.getItem('zctrl_explicit_logout') !== 'true') {
            if (!isSilentReconnectingRef.current) {
              triggerSilentReconnect();
            }
          }
        } catch (err) {
          logger.warn('Failed parsing 503 payload: ' + String(err), 'fetchWithToken');
        }
        return res;
      }
      if (res.status === 401) {
        try {
          const payload = await res.clone().json();
          if (payload?.reconnecting && isConnectedRef.current && safeStorage.getItem('zctrl_explicit_logout') !== 'true') {
            if (!isSilentReconnectingRef.current) {
              triggerSilentReconnect();
            }
            return res;
          }
          if (payload?.code === 'SESSION_INVALID' || payload?.sessionExpired === true) {
            const restored = await tryRestoreElectronBackendSession();
            if (restored) {
              const refreshedToken = tokenRef.current || safeStorage.getItem('zcontrol_active_token');
              return fetch(input, {
                ...init,
                credentials: init?.credentials ?? 'same-origin',
                headers: {
                  ...headers,
                  ...(refreshedToken ? { 'X-Router-Token': refreshedToken } : {})
                }
              });
            }
            if (safeStorage.getItem('zctrl_explicit_logout') !== 'true' && isConnectedRef.current) {
              // Confirm via /api/mikrotik/session before ever logging out
              try {
                const sessRes = await fetch('/api/mikrotik/session', {
                  credentials: 'same-origin',
                  headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(activeToken ? { 'X-Router-Token': activeToken } : {})
                  }
                });
                const sessData = await sessRes.json().catch(() => null);
                if (sessRes.ok && sessData && (sessData.connected || sessData.reconnecting)) {
                  if (sessData.reconnecting && !isSilentReconnectingRef.current) {
                    triggerSilentReconnect();
                  }
                  return res;
                }
              } catch {
                return res;
              }
              safeSession.removeItem('zctrl_session_authenticated');
              safeSession.removeItem('zctrl_session_router_meta');
              setToken(null);
              isConnectedRef.current = false;
              setIsConnected(false);
            }
          }
        } catch (err) {
          logger.warn('Failed handling 401 session check: ' + String(err), 'fetchWithToken');
        }
      }
      return res;
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw err;
      }
      logger.warn(`Network exception during fetch: ${String(err)}`, 'fetchWithToken');
      if (isConnectedRef.current && safeStorage.getItem('zctrl_explicit_logout') !== 'true') {
        triggerSilentReconnect();
      }
      throw err;
    }
  }, [token, setToken, triggerSilentReconnect, tryRestoreElectronBackendSession]);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    return safeStorage.getItem('zcontrol_auto_sync') !== 'false';
  });
  const [ecoMode, setEcoModeState] = useState<boolean>(() => {
    return safeStorage.getItem('zcontrol_eco_mode') !== 'false';
  });
  const [isUserIdle, setIsUserIdle] = useState<boolean>(false);
  const isUserIdleRef = useRef<boolean>(false);
  const [syncFrequency, setSyncFrequencyState] = useState<number>(() => {
    const val = Number(safeStorage.getItem('zcontrol_sync_frequency'));
    return val >= 10 ? val : 25; // default 25s (gentle on MikroTik CPU and thermals)
  });

  const syncCycleCounterRef = useRef<number>(0);
  const lastCpuLoadRef = useRef<number>(0);

  const thermalShieldActive = useMemo(() => {
    const cpu = router?.cpuLoad ?? lastCpuLoadRef.current ?? 0;
    const temp = router?.cpuTemperature ?? router?.boardTemperature ?? 0;
    return ecoMode || cpu > 60 || temp > 58;
  }, [ecoMode, router?.cpuLoad, router?.cpuTemperature, router?.boardTemperature]);

  const setSyncFrequency = useCallback((sec: number) => {
    const safeSec = Math.max(10, sec);
    setSyncFrequencyState(safeSec);
    safeStorage.setItem('zcontrol_sync_frequency', safeSec.toString());
  }, []);

  const setEcoMode = useCallback(async (enabled: boolean) => {
    setEcoModeState(enabled);
    safeStorage.setItem('zcontrol_eco_mode', enabled ? 'true' : 'false');
    if (enabled && syncFrequency < 25) {
      setSyncFrequency(25);
    }
    try {
      await fetchWithToken('/api/mikrotik/system/eco-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
    } catch (err) {
      logger.warn('Failed updating ecoMode on server: ' + String(err), 'MikroTikContext');
    }
  }, [syncFrequency, setSyncFrequency, fetchWithToken]);

  const handleSetAutoSync = useCallback((val: boolean) => {
    setAutoSync(val);
    safeStorage.setItem('zcontrol_auto_sync', val.toString());
  }, []);

  const [currentActiveTab, setCurrentActiveTabState] = useState<string>('dashboard');
  const currentActiveTabRef = useRef<string>('dashboard');

  // Real-Time WebSocket & Smart Variable-Frequency Polling States
  const [isRealtimeWsConnected, setIsRealtimeWsConnected] = useState<boolean>(false);
  const [realtimeSyncMode, setRealtimeSyncModeState] = useState<'websocket' | 'smart_polling' | 'hybrid' | 'paused'>(() => {
    return (safeStorage.getItem('zctrl_realtime_mode') as any) || 'hybrid';
  });
  const [realtimeFrequency, setRealtimeFrequencyState] = useState<number | 'auto'>(() => {
    const val = safeStorage.getItem('zctrl_realtime_freq');
    if (!val || val === 'auto') return 'auto';
    const num = Number(val);
    return num > 0 ? num : 'auto';
  });
  const [lastRealtimePacketTime, setLastRealtimePacketTime] = useState<number>(0);
  const [pingStabilizer, setPingStabilizer] = useState<PingStabilizerSnapshot | null>(null);
  const [isOptimizingPing, setIsOptimizingPing] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTabFetchAtRef = useRef<Record<string, number>>({});

  const isRealtimeFocusTab = useMemo(() => {
    return ['traffic', 'active_sessions', 'ppp', 'dashboard'].includes(currentActiveTab);
  }, [currentActiveTab]);

  const activeRealtimeFrequencySec = useMemo(() => {
    if (realtimeFrequency !== 'auto') {
      return Math.max(2, Number(realtimeFrequency));
    }
    let baseSec = 10;
    if (currentActiveTab === 'traffic') {
      baseSec = 6;
    } else if (currentActiveTab === 'active_sessions') {
      baseSec = 8;
    } else if (currentActiveTab === 'ppp') {
      baseSec = 8;
    } else if (currentActiveTab === 'dashboard') {
      baseSec = 10;
    } else if (currentActiveTab === 'hotspot_users') {
      baseSec = 15;
    } else if (currentActiveTab === 'userman') {
      baseSec = 15;
    } else if (currentActiveTab === 'queues') {
      baseSec = 12;
    } else if (currentActiveTab === 'dhcp') {
      baseSec = 12;
    } else if (['firewall', 'logs'].includes(currentActiveTab)) {
      baseSec = 15;
    } else {
      baseSec = 25;
    }

    if (isUserIdle) {
      baseSec = Math.min(40, Math.round(baseSec * 2));
    }
    if (thermalShieldActive) {
      baseSec = Math.max(baseSec, currentActiveTab === 'traffic' ? 8 : 10);
    }
    if (pingStabilizer?.recommendedWsIntervalMs) {
      const stabSec = Math.round(pingStabilizer.recommendedWsIntervalMs / 1000);
      baseSec = Math.max(baseSec, stabSec);
    }
    return baseSec;
  }, [realtimeFrequency, currentActiveTab, isUserIdle, thermalShieldActive, pingStabilizer?.recommendedWsIntervalMs]);

  const isResourceSaving = useMemo(() => {
    return (
      (typeof document !== 'undefined' && document.hidden) ||
      isUserIdle ||
      thermalShieldActive ||
      pingStabilizer?.state === 'stabilizing' ||
      pingStabilizer?.state === 'critical' ||
      !isRealtimeFocusTab
    );
  }, [isUserIdle, thermalShieldActive, pingStabilizer?.state, isRealtimeFocusTab]);

  const setRealtimeSyncMode = useCallback((mode: 'websocket' | 'smart_polling' | 'hybrid' | 'paused') => {
    setRealtimeSyncModeState(mode);
    safeStorage.setItem('zctrl_realtime_mode', mode);
  }, []);

  const setRealtimeFrequency = useCallback((freq: number | 'auto') => {
    setRealtimeFrequencyState(freq);
    safeStorage.setItem('zctrl_realtime_freq', String(freq));
  }, []);

  const syncNowRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  const streamSubscribersByTabPriorityRef = useRef<(activeTab: string, force?: boolean) => Promise<void>>(async () => {});

  const [streamStatus, setStreamStatus] = useState<StreamStatus>({
    isStreaming: false,
    domain: '',
    chunkIndex: 0,
    totalChunks: 0,
    receivedItems: 0,
    totalItems: 0,
    progressPercent: 0
  });

  const setCurrentActiveTab = useCallback((tab: string) => {
    currentActiveTabRef.current = tab;
    setCurrentActiveTabState(tab);

    // Abort any in-flight tab fetch before starting a new tab's fetch
    if (tabFetchAbortRef.current) {
      try {
        tabFetchAbortRef.current.abort();
      } catch (err) {
        logger.warn('Failed aborting previous tab fetch: ' + String(err), 'MikroTikContext');
      }
      tabFetchAbortRef.current = null;
    }

    if (isConnectedRef.current) {
      const now = Date.now();
      const lastFetched = lastTabFetchAtRef.current[tab] || 0;
      // Avoid hammering RouterOS when switching rapidly between tabs within 15 seconds
      if (now - lastFetched < 15000) {
        return;
      }
      lastTabFetchAtRef.current[tab] = now;

      const controller = new AbortController();
      tabFetchAbortRef.current = controller;
      const { signal } = controller;

      // 1. Gentle targeted live data sync for the selected tab (uses server cache unless stale)
      if (tab === 'active_sessions') {
        Promise.all([
          fetchWithToken('/api/mikrotik/data/sync/hotspot?activeOnly=true', { signal }).then(r => r.json()).catch(() => null),
          fetchWithToken('/api/mikrotik/data/sync/ppp?activeOnly=true', { signal }).then(r => r.json()).catch(() => null)
        ]).then(([hsJson, pppJson]) => {
          if (signal.aborted) return;
          if (hsJson && hsJson.success && hsJson.data) {
            if (Array.isArray(hsJson.data.activeHotspotUsers)) safeSet(setActiveUsers, hsJson.data.activeHotspotUsers);
            if (Array.isArray(hsJson.data.usermanActive)) safeSet(setUsermanActive, hsJson.data.usermanActive);
          }
          if (pppJson && pppJson.success && pppJson.data) {
            if (Array.isArray(pppJson.data.active)) safeSet(setPppActive, pppJson.data.active);
          }
        }).catch(() => {});
      } else if (['hotspot_users', 'generator', 'ip_binding'].includes(tab)) {
        const hashQ = lastUserHashRef.current ? `?userHash=${encodeURIComponent(lastUserHashRef.current)}` : '';
        fetchWithToken(`/api/mikrotik/data/sync/hotspot${hashQ}`, { signal })
          .then(r => r.json())
          .then(j => {
            if (signal.aborted) return;
            if (j.success && j.data) {
              if (j.data.userHash) lastUserHashRef.current = j.data.userHash;
              if (!j.data.notModifiedUsers && Array.isArray(j.data.hotspotUsers)) {
                safeSet(setUsers, j.data.hotspotUsers);
                saveGlobalCache('hotspot_users', j.data.hotspotUsers, router?.host);
              }
              if (Array.isArray(j.data.hotspotProfiles)) {
                safeSet(setProfiles, j.data.hotspotProfiles);
                saveGlobalCache('hotspot_profiles', j.data.hotspotProfiles, router?.host);
              }
              if (Array.isArray(j.data.activeHotspotUsers)) safeSet(setActiveUsers, j.data.activeHotspotUsers);
              if (Array.isArray(j.data.usermanUsers)) safeSet(setUsermanUsers, j.data.usermanUsers);
              if (Array.isArray(j.data.usermanProfiles)) safeSet(setUsermanProfiles, j.data.usermanProfiles);
              if (Array.isArray(j.data.usermanActive)) safeSet(setUsermanActive, j.data.usermanActive);
              if (Array.isArray(j.data.ipBindings)) safeSet(setIpBindings, j.data.ipBindings);
            }
          })
          .catch(() => {});
      } else if (tab === 'ppp') {
        const hashQ = lastSecretHashRef.current ? `?secretHash=${encodeURIComponent(lastSecretHashRef.current)}` : '';
        fetchWithToken(`/api/mikrotik/data/sync/ppp${hashQ}`, { signal })
          .then(r => r.json())
          .then(j => {
            if (signal.aborted) return;
            if (j.success && j.data) {
              if (j.data.secretHash) lastSecretHashRef.current = j.data.secretHash;
              if (!j.data.notModifiedSecrets && Array.isArray(j.data.secrets)) {
                safeSet(setPppSecrets, j.data.secrets);
                saveGlobalCache('ppp_secrets', j.data.secrets, router?.host);
              }
              if (Array.isArray(j.data.profiles)) {
                safeSet(setPppProfiles, j.data.profiles);
                saveGlobalCache('ppp_profiles', j.data.profiles, router?.host);
              }
              if (Array.isArray(j.data.active)) safeSet(setPppActive, j.data.active);
            }
          })
          .catch(() => {});
      } else if (tab === 'userman') {
        fetchWithToken('/api/mikrotik/data/sync/hotspot', { signal })
          .then(r => r.json())
          .then(j => {
            if (signal.aborted) return;
            if (j.success && j.data) {
              if (Array.isArray(j.data.usermanUsers)) safeSet(setUsermanUsers, j.data.usermanUsers);
              if (Array.isArray(j.data.usermanProfiles)) safeSet(setUsermanProfiles, j.data.usermanProfiles);
              if (Array.isArray(j.data.usermanActive)) safeSet(setUsermanActive, j.data.usermanActive);
            }
          })
          .catch(() => {});
      } else if (['traffic', 'network_center'].includes(tab)) {
        fetchWithToken('/api/mikrotik/interfaces', { signal })
          .then(r => r.json())
          .then(j => {
            if (signal.aborted) return;
            if (j.success && Array.isArray(j.interfaces)) safeSet(setInterfaces, j.interfaces);
          })
          .catch(() => {});
      } else if (['queues', 'dhcp', 'firewall', 'logs'].includes(tab)) {
        const netUrl = `/api/mikrotik/data/sync/network${tab === 'logs' ? '?includeLogs=true' : ''}`;
        fetchWithToken(netUrl, { signal })
          .then(r => r.json())
          .then(j => {
            if (signal.aborted) return;
            if (j.success && j.data) {
              if (Array.isArray(j.data.queues)) safeSet(setSimpleQueues, j.data.queues);
              if (Array.isArray(j.data.leases)) safeSet(setDhcpLeases, j.data.leases);
              if (Array.isArray(j.data.firewall)) safeSet(setFirewallRules, j.data.firewall);
              if (Array.isArray(j.data.logs)) safeSet(setSystemLogs, j.data.logs);
            }
          })
          .catch(() => {});
      } else if (tab === 'dashboard') {
        if (now - lastSyncTimeRef.current > 20000) {
          syncNowRef.current(false).catch(() => {});
        }
      }
      // Note: WebSocket tab_change notification is handled once cleanly by the dedicated useEffect([currentActiveTab])
    }
  }, [fetchWithToken, safeSet, router?.host]);
  
  // Data
  const [users, setUsers] = useState<HotspotUser[]>([]);
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveHotspotUser[]>([]);
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [pppSecrets, setPppSecrets] = useState<PPPSecret[]>([]);
  const [pppProfiles, setPppProfiles] = useState<PPPProfile[]>([]);
  const [pppActive, setPppActive] = useState<PPPActive[]>([]);
  const [usermanUsers, setUsermanUsers] = useState<UsermanUser[]>([]);
  const [usermanProfiles, setUsermanProfiles] = useState<UsermanProfile[]>([]);
  const [usermanActive, setUsermanActive] = useState<UsermanActive[]>([]);
  const [simpleQueues, setSimpleQueues] = useState<SimpleQueue[]>([]);
  const [ipBindings, setIpBindings] = useState<HotspotIpBinding[]>([]);
  const [dhcpLeases, setDhcpLeases] = useState<DhcpLease[]>([]);
  const [firewallRules, setFirewallRules] = useState<FirewallRule[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLogEntry[]>([]);

  // Delta-Update Record Merger: Preserves unchanged object references, avoiding React re-renders and memory allocations
  const deltaMergeList = useCallback(<T extends { id?: string; name?: string }>(prev: T[], incoming?: T[]): T[] => {
    if (!incoming) return prev;
    if (!prev || prev.length === 0) return incoming;
    if (incoming.length === 0) return [];

    const prevMap = new Map<string, T>();
    prev.forEach((item) => {
      const key = item.id || (item as any)['.id'] || item.name;
      if (key) prevMap.set(key, item);
    });

    let anyModified = false;
    if (prev.length !== incoming.length) anyModified = true;

    const result: T[] = incoming.map((newItem) => {
      const key = newItem.id || (newItem as any)['.id'] || newItem.name;
      if (!key) return newItem;
      const oldItem = prevMap.get(key);
      if (!oldItem) {
        anyModified = true;
        return newItem;
      }
      let hasFieldChange = false;
      for (const prop of Object.keys(newItem) as (keyof T)[]) {
        if (oldItem[prop] !== newItem[prop]) {
          hasFieldChange = true;
          break;
        }
      }
      if (hasFieldChange) {
        anyModified = true;
        return newItem;
      }
      return oldItem;
    });

    return anyModified ? result : prev;
  }, []);

  // Global Data Cache: Hydrate all non-volatile profiles & router configurations instantly on startup (0ms UI latency)
  useEffect(() => {
    let isMounted = true;
    const hydrateFromGlobalCache = async () => {
      try {
        const [
          cachedHs,
          cachedPpp,
          cachedUm,
          cachedHsProfiles,
          cachedPppProfiles,
          cachedUmProfiles,
          cachedServerProfiles,
          cachedNetInterfaces,
          cachedWirelessInterfaces,
          cachedHotspotServers,
          cachedRouterFiles
        ] = await Promise.all([
          loadGlobalCache<HotspotUser>('hotspot_users'),
          loadGlobalCache<PPPSecret>('ppp_secrets'),
          loadGlobalCache<UsermanUser>('userman_users'),
          loadGlobalCache<HotspotProfile>('hotspot_profiles'),
          loadGlobalCache<PPPProfile>('ppp_profiles'),
          loadGlobalCache<UsermanProfile>('userman_profiles'),
          loadGlobalCache<HotspotServerProfile>('server_profiles'),
          loadGlobalCache<NetworkInterface>('network_interfaces'),
          loadGlobalCache<WirelessInterface>('wireless_interfaces'),
          loadGlobalCache<HotspotServerInstance>('hotspot_servers'),
          loadGlobalCache<RouterStorageFile>('router_files')
        ]);
        if (!isMounted) return;

        // Subscribers
        if (cachedHs?.items.length) setUsers(prev => prev.length === 0 ? cachedHs.items : prev);
        if (cachedPpp?.items.length) setPppSecrets(prev => prev.length === 0 ? cachedPpp.items : prev);
        if (cachedUm?.items.length) setUsermanUsers(prev => prev.length === 0 ? cachedUm.items : prev);

        // Non-Volatile Router Configurations & Profiles (0ms UI Load Speeds)
        if (cachedHsProfiles?.items.length) setProfiles(prev => prev.length === 0 ? cachedHsProfiles.items : prev);
        if (cachedPppProfiles?.items.length) setPppProfiles(prev => prev.length === 0 ? cachedPppProfiles.items : prev);
        if (cachedUmProfiles?.items.length) setUsermanProfiles(prev => prev.length === 0 ? cachedUmProfiles.items : prev);
        if (cachedServerProfiles?.items.length) setHotspotServerProfiles(prev => prev.length === 0 ? cachedServerProfiles.items : prev);
        if (cachedNetInterfaces?.items.length) setInterfaces(prev => prev.length === 0 ? cachedNetInterfaces.items : prev);
        if (cachedWirelessInterfaces?.items.length) setWirelessInterfaces(prev => prev.length === 0 ? cachedWirelessInterfaces.items : prev);
        if (cachedHotspotServers?.items.length) setHotspotServers(prev => prev.length === 0 ? cachedHotspotServers.items : prev);
        if (cachedRouterFiles?.items.length) setRouterFiles(prev => prev.length === 0 ? cachedRouterFiles.items : prev);

      } catch (err) {
        console.warn('Could not hydrate global data cache from IndexedDB:', err);
      }
    };

    hydrateFromGlobalCache();
    return () => { isMounted = false; };
  }, []);



  // Wireless, Connected Antennas & Hotspot Portal
  const [wirelessInterfaces, setWirelessInterfaces] = useState<WirelessInterface[]>([]);
  const [registrationTable, setRegistrationTable] = useState<WirelessClientStation[]>([]);
  const [neighbors, setNeighbors] = useState<NeighborAntenna[]>([]);
  const [remoteCaps, setRemoteCaps] = useState<any[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPointItem[]>([]);
  const [hotspotServerProfiles, setHotspotServerProfiles] = useState<HotspotServerProfile[]>([]);
  const [hotspotServers, setHotspotServers] = useState<HotspotServerInstance[]>([]);
  const [routerFiles, setRouterFiles] = useState<RouterStorageFile[]>([]);
  const [isLoadingWireless, setIsLoadingWireless] = useState(false);
  const [isLoadingAntennas, setIsLoadingAntennas] = useState(false);
  const [isLoadingAccessPoints, setIsLoadingAccessPoints] = useState(false);
  const [isLoadingPortalProfiles, setIsLoadingPortalProfiles] = useState(false);

  // Scheduled Tasks State (/system/scheduler)
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>(() => {
    try {
      const saved = safeStorage.getItem('zctrl_cached_scheduled_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      logger.warn('Failed loading cached scheduled tasks: ' + String(err), 'MikroTikContext');
    }
    return [];
  });
  const [isLoadingSchedulers, setIsLoadingSchedulers] = useState<boolean>(false);

  // Print Studio
  const [selectedUsersForPrint, setSelectedUsersForPrint] = useState<HotspotUser[]>([]);
  const [cardTemplate, setCardTemplate] = useState<CardTemplateConfig>(defaultTemplate);

  // Saved Routers (Strict Security: Passwords NEVER stored)
  const [savedRouters, setSavedRouters] = useState<RouterConnection[]>(() => {
    try {
      const saved = safeStorage.getItem('mikrotik_saved_routers');
      if (!saved) return [];
      const parsed: RouterConnection[] = JSON.parse(saved);
      // Strip any passwords from legacy saved items
      return parsed.map((item) => {
        const copy = { ...item };
        delete copy.password;
        return copy;
      });
    } catch {
      return [];
    }
  });

  // استعادة الجلسة النشطة تلقائياً فقط عند تحديث الصفحة (F5) ولم يتم تسجيل الخروج يدوياً
  useEffect(() => {
    let isMounted = true;
    const verifyAndRestoreSession = async () => {
      // منع الدخول التلقائي عند بدء التشغيل الجديد للتطبيق
      if (safeSession.getItem('zctrl_session_authenticated') !== 'true') {
        if (isMounted) setIsRestoringSession(false);
        return;
      }
      // إذا كان المستخدم قد سجل الخروج صراحة، لا تتم استعادة الجلسة تلقائياً نهائياً
      if (safeStorage.getItem('zctrl_explicit_logout') === 'true') {
        if (isMounted) setIsRestoringSession(false);
        return;
      }

      if (isMounted) setIsRestoringSession(true);
      const activeToken = tokenRef.current || token || safeStorage.getItem('zcontrol_active_token');

      try {
        const res = await fetch('/api/mikrotik/session', {
          credentials: 'same-origin',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            ...(activeToken ? { 'X-Router-Token': activeToken } : {})
          }
        });
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          if (data.success && (data.connected || data.reconnecting) && data.router) {
            const restoredToken = data.token || activeToken || null;
            if (restoredToken) {
              setToken(restoredToken);
              safeStorage.setItem('zctrl_router_token', restoredToken);
            }
            setRouter((prev) => ({
              id: prev?.id || `r-${Date.now()}`,
              name: data.router.name || data.router.boardName || prev?.name || 'MikroTik RouterOS',
              host: data.router.host || prev?.host || '',
              port: data.router.port || prev?.port || 8728,
              username: data.router.username || prev?.username || 'admin',
              useSsl: Boolean(data.router.useSsl ?? prev?.useSsl),
              version: data.router.version || prev?.version || '',
              majorVersion: data.router.majorVersion || prev?.majorVersion || 7,
              boardName: data.router.boardName || prev?.boardName || 'RouterBOARD',
              uptime: prev?.uptime || '',
              cpuLoad: prev?.cpuLoad ?? 0,
              cpuTemperature: prev?.cpuTemperature,
              boardTemperature: prev?.boardTemperature,
              freeMemory: prev?.freeMemory ?? 0,
              totalMemory: prev?.totalMemory ?? 0,
              pingMs: prev?.pingMs ?? 0,
              hasInternet: prev?.hasInternet ?? true,
              gateway: prev?.gateway,
              wanIp: prev?.wanIp,
              connectedAt: prev?.connectedAt || new Date().toISOString()
            }));
            setIsConnected(true);
            isConnectedRef.current = true;
            setUserRole((data.role as OperatorRole) || 'admin');
            setOperatorName(data.operatorName || data.router.username || 'admin');
            setTlsFingerprint(data.tlsFingerprint ?? data.router.tlsFingerprint ?? null);
            connectTimeRef.current = Date.now();
            if (data.connected) {
              setTimeout(() => {
                syncNowRef.current(false).catch(() => {});
              }, 10);
            } else if (data.reconnecting) {
              triggerSilentReconnect();
            }
            return;
          }
        }
        // Attempt RAM-only Electron backend-respawn recovery before dropping session
        const recovered = await tryRestoreElectronBackendSession();
        if (!isMounted) return;
        if (recovered) {
          setTimeout(() => {
            syncNowRef.current(false).catch(() => {});
          }, 50);
          return;
        }
        // لم تعد الجلسة صالحة على الخادم (مثل إعادة تشغيل الخادم في المتصفح العادي)
        safeSession.removeItem('zctrl_session_authenticated');
        safeSession.removeItem('zctrl_session_router_meta');
        setToken(null);
        setRouter(null);
        setIsConnected(false);
        isConnectedRef.current = false;
      } catch {
        // عند خطأ شبكة مؤقت، نحافظ على إمكانية إعادة المحاولة دون طرد المستخدم
      } finally {
        if (isMounted) setIsRestoringSession(false);
      }
    };

    verifyAndRestoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Electron Desktop: Listen for backend child process respawn and seamlessly re-establish router session
  useEffect(() => {
    if (typeof window === 'undefined' || !window.zctrlDesktopSession?.onBackendRespawned) {
      return;
    }
    const unsubscribe = window.zctrlDesktopSession.onBackendRespawned(async () => {
      if (!isContextMountedRef.current) return;
      if (safeStorage.getItem('zctrl_explicit_logout') === 'true') return;
      if (safeSession.getItem('zctrl_session_authenticated') !== 'true') return;
      const recovered = await tryRestoreElectronBackendSession();
      if (recovered && isContextMountedRef.current) {
        setTimeout(() => {
          syncNowRef.current(false).catch(() => {});
        }, 100);
      }
    });
    return unsubscribe;
  }, [tryRestoreElectronBackendSession]);

  // Toast with Action Support & Audio alerts
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    action?: {
      label: string;
      onClick: () => void;
    };
    duration?: number;
  } | null>(null);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    isContextMountedRef.current = true;
    return () => {
      isContextMountedRef.current = false;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      if (silentReconnectTimerRef.current) {
        clearTimeout(silentReconnectTimerRef.current);
        silentReconnectTimerRef.current = null;
      }
      if (tabFetchAbortRef.current) {
        try {
          tabFetchAbortRef.current.abort();
        } catch (err) {
          logger.warn('Cleanup tabFetchAbort warning: ' + String(err), 'MikroTikContext');
        }
        tabFetchAbortRef.current = null;
      }
      if (streamAbortRef.current) {
        try {
          streamAbortRef.current.abort();
        } catch (err) {
          logger.warn('Cleanup streamAbort warning: ' + String(err), 'MikroTikContext');
        }
        streamAbortRef.current = null;
      }
    };
  }, []);

  const showToast = useCallback((
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'success',
    options?: {
      action?: {
        label: string;
        onClick: () => void;
      };
      duration?: number;
    }
  ) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({
      message,
      type,
      action: options?.action,
      duration: options?.duration
    });
    const dur = options?.duration || 4500;
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, dur);
  }, []);

  // Web Audio Chime for Critical Hardware Warnings - Completely silenced to eliminate annoying beeps
  const playHardwareWarningChime = useCallback(() => {
    // Intentionally silent: completely avoids audio disruptions and high CPU audio context synthesis
  }, []);

  const saveRouter = (r: RouterConnection) => {
    if (!r || !r.host) return;
    // STRICT SECURITY: Never store passwords in localStorage
    const safeRouter: RouterConnection = {
      id: r.id || `r-${Date.now()}`,
      name: r.name || 'MikroTik RouterOS',
      host: r.host,
      port: r.port || 8728,
      username: r.username || 'admin',
      useSsl: Boolean(r.useSsl),
      version: r.version || '',
      majorVersion: r.majorVersion,
      boardName: r.boardName || 'RouterBOARD',
      uptime: r.uptime || '',
      cpuLoad: r.cpuLoad ?? 0,
      freeMemory: r.freeMemory ?? 0,
      totalMemory: r.totalMemory ?? 0,
      pingMs: r.pingMs ?? 0,
      hasInternet: r.hasInternet,
      gateway: r.gateway,
      wanIp: r.wanIp,
      connectedAt: r.connectedAt || new Date().toISOString(),
      isSaved: true
    };

    const updated = [...savedRouters.filter((item) => item.host !== safeRouter.host), safeRouter];
    setSavedRouters(updated);
    safeStorage.setItem('mikrotik_saved_routers', JSON.stringify(updated));
    showToast(`تم حفظ الراوتر ${safeRouter.name} (${safeRouter.host})`, 'success');
  };

  const deleteSavedRouter = (id: string) => {
    const updated = savedRouters.filter(r => r.id !== id);
    setSavedRouters(updated);
    safeStorage.setItem('mikrotik_saved_routers', JSON.stringify(updated));
    showToast('تم حذف الراوتر من القائمة المحفوظة', 'info');
  };

  // Router Connection Profiles State (Real User Profiles Only - Zero Fake/Mock Presets)
  const [connectionProfiles, setConnectionProfiles] = useState<RouterConnectionProfile[]>(() => {
    try {
      const stored = safeStorage.getItem('zahir_router_connection_profiles');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Zero-Trust Security: Strip any persistent passwords from profiles (Rules 8 & 32)
          return parsed.map((p) => {
            const copy = { ...p };
            delete copy.password;
            return copy;
          });
        }
      }
    } catch (err) {
      logger.warn('Failed parsing connection profiles: ' + String(err), 'MikroTikContext');
    }
    return [];
  });

  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    try {
      return safeStorage.getItem('zahir_active_profile_id') || null;
    } catch {
      return null;
    }
  });

  const saveConnectionProfile = useCallback((profileData: Partial<RouterConnectionProfile> & { name: string; host: string }) => {
    const existingIndex = profileData.id ? connectionProfiles.findIndex(p => p.id === profileData.id) : -1;
    const profileId = profileData.id || `prof-${Date.now()}`;
    
    // Zero-Trust: Never persist router password in localStorage (Rules 8 & 32)
    const profileToSave: RouterConnectionProfile = {
      id: profileId,
      name: profileData.name.trim(),
      category: (profileData.category as RouterProfileCategory) || 'custom',
      host: profileData.host.trim(),
      port: profileData.port && Number(profileData.port) > 0 ? Number(profileData.port) : 8728,
      username: (profileData.username || 'admin').trim(),
      useSsl: Boolean(profileData.useSsl),
      notes: profileData.notes?.trim() || '',
      isDefault: Boolean(profileData.isDefault),
      lastConnectedAt: profileData.lastConnectedAt,
      createdAt: profileData.createdAt || new Date().toISOString(),
      color: profileData.color || (
        profileData.category === 'home' ? 'blue' :
        profileData.category === 'office' ? 'emerald' :
        profileData.category === 'branch' ? 'amber' : 'purple'
      )
    };

    let updated: RouterConnectionProfile[];
    if (existingIndex >= 0) {
      updated = [...connectionProfiles];
      if (profileToSave.isDefault) {
        updated = updated.map(p => ({ ...p, isDefault: p.id === profileId }));
      }
      updated[existingIndex] = profileToSave;
    } else {
      updated = [...connectionProfiles];
      if (profileToSave.isDefault) {
        updated = updated.map(p => ({ ...p, isDefault: false }));
      }
      updated.push(profileToSave);
    }

    setConnectionProfiles(updated);
    safeStorage.setItem('zahir_router_connection_profiles', JSON.stringify(updated));
    showToast(`تم حفظ بروفايل الاتصال: ${profileToSave.name}`, 'success');
    return profileToSave;
  }, [connectionProfiles, showToast]);

  const deleteConnectionProfile = useCallback((id: string) => {
    const updated = connectionProfiles.filter(p => p.id !== id);
    setConnectionProfiles(updated);
    safeStorage.setItem('zahir_router_connection_profiles', JSON.stringify(updated));
    if (activeProfileId === id) {
      const fallbackId = updated.length > 0 ? updated[0].id : null;
      setActiveProfileId(fallbackId);
      if (fallbackId) {
        safeStorage.setItem('zahir_active_profile_id', fallbackId);
      } else {
        safeStorage.removeItem('zahir_active_profile_id');
      }
    }
    showToast('تم حذف بروفايل الاتصال', 'info');
  }, [connectionProfiles, activeProfileId, showToast]);

  const setDefaultConnectionProfile = useCallback((id: string) => {
    const updated = connectionProfiles.map(p => ({
      ...p,
      isDefault: p.id === id
    }));
    setConnectionProfiles(updated);
    safeStorage.setItem('zahir_router_connection_profiles', JSON.stringify(updated));
    showToast('تم تعيين البروفايل كافتراضي للاتصال', 'success');
  }, [connectionProfiles, showToast]);

  const syncInProgressRef = useRef(false);
  const lastUserHashRef = useRef<string>('');
  const lastSecretHashRef = useRef<string>('');
  const lastWirelessPortalSyncRef = useRef<number>(0);


  const syncNow = useCallback(async (force: boolean = false) => {
    if (syncInProgressRef.current) return;
    if (!force && !isConnectedRef.current) return;

    if (force) {
      lastUserHashRef.current = '';
      lastSecretHashRef.current = '';
    }

    syncInProgressRef.current = true;
    try {
      const syncSystem = async () => {
        if (force) setIsSyncingSystem(true);
        try {
          const res = await fetchWithToken(`/api/mikrotik/data/sync/system${force ? '?force=true' : ''}`);
          if (res.status === 503) {
            try {
              const payload = await res.json();
              if (payload?.reconnecting && !isSilentReconnectingRef.current) {
                triggerSilentReconnect();
              }
            } catch (err) {
              logger.warn('Failed parsing 503 syncSystem payload: ' + String(err), 'syncNow');
            }
            return;
          }
          if (res.status === 401) {
            return;
          }
          authFailureCountRef.current = 0;
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              const d = json.data;
              lastCpuLoadRef.current = d.cpuLoad ?? 0;
              if (Array.isArray(d.interfaces) && d.interfaces.length > 0) {
                safeSet(setInterfaces, d.interfaces);
                saveGlobalCache('network_interfaces', d.interfaces, router?.host);
              }
              setRouter(prev => {
                const base: RouterConnection = prev || {
                  id: `r-${Date.now()}`,
                  name: d.identity || 'MikroTik RouterOS',
                  host: router?.host || '',
                  port: router?.port || 8728,
                  username: router?.username || 'admin',
                  useSsl: false,
                  version: d.version || '',
                  boardName: d.boardName || 'RouterBOARD',
                  uptime: d.uptime || '',
                  cpuLoad: d.cpuLoad ?? 0,
                  freeMemory: d.freeMemory ?? 0,
                  totalMemory: d.totalMemory ?? 0,
                  pingMs: d.pingMs ?? 0,
                  hasInternet: d.hasInternet ?? true,
                  gateway: d.gateway || '',
                  wanIp: d.wanIp || '',
                  connectedAt: new Date().toISOString()
                };
                const next: RouterConnection = {
                  ...base,
                  cpuLoad: d.cpuLoad ?? base.cpuLoad,
                  cpuTemperature: d.cpuTemperature ?? base.cpuTemperature,
                  boardTemperature: d.boardTemperature ?? base.boardTemperature,
                  uptime: d.uptime ?? base.uptime,
                  freeMemory: d.freeMemory ?? base.freeMemory,
                  totalMemory: d.totalMemory ?? base.totalMemory,
                  version: d.version ?? base.version,
                  boardName: d.boardName ?? base.boardName,
                  name: d.identity ?? base.name,
                  hasInternet: d.hasInternet ?? base.hasInternet,
                  gateway: d.gateway ?? base.gateway,
                  wanIp: d.wanIp ?? base.wanIp,
                  pingMs: d.pingMs ?? base.pingMs ?? 0,
                  ecoMode: ecoMode
                };
                if (
                  prev &&
                  prev.cpuLoad === next.cpuLoad &&
                  prev.cpuTemperature === next.cpuTemperature &&
                  prev.boardTemperature === next.boardTemperature &&
                  prev.uptime === next.uptime &&
                  prev.freeMemory === next.freeMemory &&
                  prev.totalMemory === next.totalMemory &&
                  prev.version === next.version &&
                  prev.boardName === next.boardName &&
                  prev.name === next.name &&
                  prev.hasInternet === next.hasInternet &&
                  prev.gateway === next.gateway &&
                  prev.wanIp === next.wanIp &&
                  prev.pingMs === next.pingMs &&
                  prev.ecoMode === next.ecoMode
                ) {
                  return prev;
                }
                return next;
              });
            }
          }
        } catch {
          // Network / offline handling
        } finally {
          if (force) setIsSyncingSystem(false);
        }
      };

      const syncHotspot = async () => {
        if (force) setIsSyncingHotspot(true);
        try {
          let queryParts: string[] = [];
          if (force) queryParts.push('force=true');
          if (lastUserHashRef.current && !force) queryParts.push(`userHash=${encodeURIComponent(lastUserHashRef.current)}`);
          const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

          const res = await fetchWithToken(`/api/mikrotik/data/sync/hotspot${queryString}`);
          if (res.status === 401) return;
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              const d = json.data;
              if (d.userHash) {
                lastUserHashRef.current = d.userHash;
              }
              if (!d.notModifiedUsers && Array.isArray(d.hotspotUsers)) {
                safeSet(setUsers, d.hotspotUsers);
                saveGlobalCache('hotspot_users', d.hotspotUsers, router?.host);
              }
              if (Array.isArray(d.hotspotProfiles)) {
                safeSet(setProfiles, d.hotspotProfiles);
                saveGlobalCache('hotspot_profiles', d.hotspotProfiles, router?.host);
              }
              safeSet(setActiveUsers, d.activeHotspotUsers || []);
              if (Array.isArray(d.usermanUsers)) {
                safeSet(setUsermanUsers, d.usermanUsers);
                saveGlobalCache('userman_users', d.usermanUsers, router?.host);
              }
              if (Array.isArray(d.usermanProfiles)) {
                safeSet(setUsermanProfiles, d.usermanProfiles);
                saveGlobalCache('userman_profiles', d.usermanProfiles, router?.host);
              }
              safeSet(setUsermanActive, d.usermanActive || []);
              safeSet(setIpBindings, d.ipBindings || []);
            }
          }
        } catch {
          // Network / offline handling
        } finally {
          if (force) setIsSyncingHotspot(false);
        }
      };

      const syncPPP = async () => {
        if (force) setIsSyncingPPP(true);
        try {
          let queryParts: string[] = [];
          if (force) queryParts.push('force=true');
          if (lastSecretHashRef.current && !force) queryParts.push(`secretHash=${encodeURIComponent(lastSecretHashRef.current)}`);
          const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

          const res = await fetchWithToken(`/api/mikrotik/data/sync/ppp${queryString}`);
          if (res.status === 401) return;
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              const d = json.data;
              if (d.secretHash) {
                lastSecretHashRef.current = d.secretHash;
              }
              if (!d.notModifiedSecrets && Array.isArray(d.secrets)) {
                safeSet(setPppSecrets, d.secrets);
                saveGlobalCache('ppp_secrets', d.secrets, router?.host);
              }
              safeSet(setPppActive, d.active || []);
              if (Array.isArray(d.profiles)) {
                safeSet(setPppProfiles, d.profiles);
                saveGlobalCache('ppp_profiles', d.profiles, router?.host);
              }
            }
          }
        } catch {
          // Network / offline handling
        } finally {
          if (force) setIsSyncingPPP(false);
        }
      };

      const syncNetwork = async () => {
        if (force) setIsSyncingNetwork(true);
        try {
          const params: string[] = [];
          if (force) params.push('force=true');
          if (currentActiveTabRef.current === 'logs') params.push('includeLogs=true');
          const qs = params.length > 0 ? `?${params.join('&')}` : '';
          const res = await fetchWithToken(`/api/mikrotik/data/sync/network${qs}`);
          if (res.status === 401 || res.status === 503) return;
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              const d = json.data;
              safeSet(setSimpleQueues, d.queues || []);
              safeSet(setDhcpLeases, d.leases || []);
              safeSet(setFirewallRules, d.firewall || []);
              if (Array.isArray(d.logs)) {
                safeSet(setSystemLogs, d.logs);
              }
            }
          }
        } catch {
          // Network / offline handling
        } finally {
          if (force) setIsSyncingNetwork(false);
        }
      };


      const syncWirelessAndPortal = async () => {
        try {
          const [wRes, aRes, pRes] = await Promise.allSettled([
            fetchWithToken('/api/mikrotik/wireless'),
            fetchWithToken('/api/mikrotik/network/antennas'),
            fetchWithToken('/api/mikrotik/hotspot/server-profiles')
          ]);

          if (wRes.status === 'fulfilled' && wRes.value.ok) {
            const wJson = await wRes.value.json();
            if (wJson.success && Array.isArray(wJson.data) && wJson.data.length > 0) {
              safeSet(setWirelessInterfaces, wJson.data);
              saveGlobalCache('wireless_interfaces', wJson.data, router?.host);
            }
          }

          if (aRes.status === 'fulfilled' && aRes.value.ok) {
            const aJson = await aRes.value.json();
            if (aJson.success && aJson.data) {
              if (Array.isArray(aJson.data.registrationTable)) safeSet(setRegistrationTable, aJson.data.registrationTable);
              if (Array.isArray(aJson.data.neighbors)) safeSet(setNeighbors, aJson.data.neighbors);
              if (Array.isArray(aJson.data.remoteCaps)) safeSet(setRemoteCaps, aJson.data.remoteCaps);
            }
          }

          if (pRes.status === 'fulfilled' && pRes.value.ok) {
            const pJson = await pRes.value.json();
            if (pJson.success && pJson.data) {
              if (Array.isArray(pJson.data.profiles) && pJson.data.profiles.length > 0) {
                safeSet(setHotspotServerProfiles, pJson.data.profiles);
                saveGlobalCache('server_profiles', pJson.data.profiles, router?.host);
              }
              if (Array.isArray(pJson.data.servers) && pJson.data.servers.length > 0) {
                safeSet(setHotspotServers, pJson.data.servers);
                saveGlobalCache('hotspot_servers', pJson.data.servers, router?.host);
              }
              if (Array.isArray(pJson.data.files) && pJson.data.files.length > 0) {
                safeSet(setRouterFiles, pJson.data.files);
                saveGlobalCache('router_files', pJson.data.files, router?.host);
              }
            }
          }
        } catch {
          // Network / offline handling
        }
      };

      // Escape Velocity Data Synchronization Engine:
      // Try single-flight composite sync endpoint first for instant full-router state
      let compositeSyncDone = false;
      try {
        const allParams: string[] = [];
        if (force) allParams.push('force=true');
        if (currentActiveTabRef.current === 'logs') allParams.push('includeLogs=true');
        const allQs = allParams.length > 0 ? `?${allParams.join('&')}` : '';
        const allRes = await fetchWithToken(`/api/mikrotik/data/sync/all${allQs}`);
        if (allRes.ok) {
          const allJson = await allRes.json();
          if (allJson.success && allJson.data) {
            const { system, hotspot, ppp, network } = allJson.data;
            if (system) {
              lastCpuLoadRef.current = system.cpuLoad ?? 0;
              if (system.pingStabilizer) {
                safeSet(setPingStabilizer, system.pingStabilizer);
              }
              if (Array.isArray(system.interfaces) && system.interfaces.length > 0) {
                safeSet(setInterfaces, system.interfaces);
                saveGlobalCache('network_interfaces', system.interfaces, router?.host);
              }
              setRouter(prev => {
                const base: RouterConnection = prev || {
                  id: `r-${Date.now()}`,
                  name: system.identity || 'MikroTik RouterOS',
                  host: router?.host || '',
                  port: router?.port || 8728,
                  username: router?.username || 'admin',
                  useSsl: false,
                  version: system.version || '',
                  boardName: system.boardName || 'RouterBOARD',
                  uptime: system.uptime || '',
                  cpuLoad: system.cpuLoad ?? 0,
                  freeMemory: system.freeMemory ?? 0,
                  totalMemory: system.totalMemory ?? 0,
                  pingMs: system.pingMs ?? 0,
                  hasInternet: system.hasInternet ?? true,
                  gateway: system.gateway || '',
                  wanIp: system.wanIp || '',
                  connectedAt: new Date().toISOString()
                };
                const next: RouterConnection = {
                  ...base,
                  cpuLoad: system.cpuLoad ?? base.cpuLoad,
                  cpuTemperature: system.cpuTemperature ?? base.cpuTemperature,
                  boardTemperature: system.boardTemperature ?? base.boardTemperature,
                  uptime: system.uptime ?? base.uptime,
                  freeMemory: system.freeMemory ?? base.freeMemory,
                  totalMemory: system.totalMemory ?? base.totalMemory,
                  version: system.version ?? base.version,
                  boardName: system.boardName ?? base.boardName,
                  name: system.identity ?? base.name,
                  hasInternet: system.hasInternet ?? base.hasInternet,
                  gateway: system.gateway ?? base.gateway,
                  wanIp: system.wanIp ?? base.wanIp,
                  pingMs: system.pingMs ?? base.pingMs ?? 0,
                  ecoMode: ecoMode
                };
                if (
                  prev &&
                  prev.cpuLoad === next.cpuLoad &&
                  prev.cpuTemperature === next.cpuTemperature &&
                  prev.boardTemperature === next.boardTemperature &&
                  prev.uptime === next.uptime &&
                  prev.freeMemory === next.freeMemory &&
                  prev.totalMemory === next.totalMemory &&
                  prev.version === next.version &&
                  prev.boardName === next.boardName &&
                  prev.name === next.name &&
                  prev.hasInternet === next.hasInternet &&
                  prev.gateway === next.gateway &&
                  prev.wanIp === next.wanIp &&
                  prev.pingMs === next.pingMs &&
                  prev.ecoMode === next.ecoMode
                ) {
                  return prev;
                }
                return next;
              });
            }
            if (hotspot) {
              if (hotspot.userHash) lastUserHashRef.current = hotspot.userHash;
              if (Array.isArray(hotspot.hotspotUsers)) {
                safeSet(setUsers, hotspot.hotspotUsers);
                saveGlobalCache('hotspot_users', hotspot.hotspotUsers, router?.host);
              }
              if (Array.isArray(hotspot.hotspotProfiles)) {
                safeSet(setProfiles, hotspot.hotspotProfiles);
                saveGlobalCache('hotspot_profiles', hotspot.hotspotProfiles, router?.host);
              }
              safeSet(setActiveUsers, hotspot.activeHotspotUsers || []);
              if (Array.isArray(hotspot.usermanUsers)) {
                safeSet(setUsermanUsers, hotspot.usermanUsers);
                saveGlobalCache('userman_users', hotspot.usermanUsers, router?.host);
              }
              if (Array.isArray(hotspot.usermanProfiles)) {
                safeSet(setUsermanProfiles, hotspot.usermanProfiles);
                saveGlobalCache('userman_profiles', hotspot.usermanProfiles, router?.host);
              }
              safeSet(setUsermanActive, hotspot.usermanActive || []);
              safeSet(setIpBindings, hotspot.ipBindings || []);
            }
            if (ppp) {
              if (ppp.secretHash) lastSecretHashRef.current = ppp.secretHash;
              if (Array.isArray(ppp.secrets)) {
                safeSet(setPppSecrets, ppp.secrets);
                saveGlobalCache('ppp_secrets', ppp.secrets, router?.host);
              }
              safeSet(setPppActive, ppp.active || []);
              if (Array.isArray(ppp.profiles)) {
                safeSet(setPppProfiles, ppp.profiles);
                saveGlobalCache('ppp_profiles', ppp.profiles, router?.host);
              }
            }
            if (network) {
              safeSet(setSimpleQueues, network.queues || []);
              safeSet(setDhcpLeases, network.leases || []);
              safeSet(setFirewallRules, network.firewall || []);
              if (Array.isArray(network.logs)) {
                safeSet(setSystemLogs, network.logs);
              }
            }
            compositeSyncDone = true;
          }
        }
      } catch {
        compositeSyncDone = false;
      }

      const shouldSyncWirelessPortal = force || (Date.now() - lastWirelessPortalSyncRef.current > 300000);
      if (compositeSyncDone) {
        if (shouldSyncWirelessPortal) {
          lastWirelessPortalSyncRef.current = Date.now();
          // Stagger non-critical wireless/portal sync by 2s so RouterOS CPU & Ping stay calm
          setTimeout(() => {
            if (isContextMountedRef.current && isConnectedRef.current) {
              syncWirelessAndPortal().catch(() => {});
            }
          }, 2000);
        }
      } else {
        // Fallback to domain-targeted parallel sync if composite sync endpoint was bypassed
        const fallbackTasks: Promise<void>[] = [
          syncSystem(),
          syncHotspot(),
          syncPPP(),
          syncNetwork()
        ];
        if (shouldSyncWirelessPortal) {
          lastWirelessPortalSyncRef.current = Date.now();
          fallbackTasks.push(syncWirelessAndPortal());
        }
        await Promise.allSettled(fallbackTasks);
      }

      const now = Date.now();
      lastSyncTimeRef.current = now;
      setLastSyncTime(new Date(now));
    } finally {
      syncInProgressRef.current = false;
    }
  }, [fetchWithToken, safeSet]);

  useEffect(() => {
    syncNowRef.current = syncNow;
  }, [syncNow]);

  const refreshQueues = useCallback(async () => {
    if (!isConnectedRef.current) return;
    setIsSyncingNetwork(true);
    try {
      const res = await fetchWithToken('/api/mikrotik/queues');
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.queues)) {
        safeSet(setSimpleQueues, json.queues);
      }
    } catch {
      // Ignore transient network error
    } finally {
      setIsSyncingNetwork(false);
    }
  }, [fetchWithToken, safeSet]);

  const refreshProfiles = useCallback(async (systemType?: 'hotspot' | 'pppoe' | 'userman') => {
    if (!isConnectedRef.current) return;
    if (!systemType || systemType === 'hotspot' || systemType === 'userman') {
      setIsSyncingHotspot(true);
    }
    if (!systemType || systemType === 'pppoe') {
      setIsSyncingPPP(true);
    }

    try {
      if (!systemType) {
        const res = await fetchWithToken('/api/mikrotik/data/refresh-profiles', { method: 'POST' });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            if (Array.isArray(json.data.hotspotProfiles)) {
              safeSet(setProfiles, json.data.hotspotProfiles);
              saveGlobalCache('hotspot_profiles', json.data.hotspotProfiles, router?.host);
            }
            if (Array.isArray(json.data.pppProfiles)) {
              safeSet(setPppProfiles, json.data.pppProfiles);
              saveGlobalCache('ppp_profiles', json.data.pppProfiles, router?.host);
            }
            if (Array.isArray(json.data.usermanProfiles)) {
              safeSet(setUsermanProfiles, json.data.usermanProfiles);
              saveGlobalCache('userman_profiles', json.data.usermanProfiles, router?.host);
            }
            if (Array.isArray(json.data.simpleQueues)) {
              safeSet(setSimpleQueues, json.data.simpleQueues);
            }
            return;
          }
        }
      }

      if (systemType === 'hotspot' || !systemType) {
        const res = await fetchWithToken('/api/mikrotik/hotspot/profiles?force=true');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.profiles)) {
            safeSet(setProfiles, json.profiles);
            saveGlobalCache('hotspot_profiles', json.profiles, router?.host);
          }
        }
      }
      if (systemType === 'pppoe' || !systemType) {
        const res = await fetchWithToken('/api/mikrotik/ppp/profiles?force=true');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.profiles)) {
            safeSet(setPppProfiles, json.profiles);
            saveGlobalCache('ppp_profiles', json.profiles, router?.host);
          }
        }
      }
      if (systemType === 'userman' || !systemType) {
        const res = await fetchWithToken('/api/mikrotik/userman/profiles?force=true');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.profiles)) {
            safeSet(setUsermanProfiles, json.profiles);
            saveGlobalCache('userman_profiles', json.profiles, router?.host);
          }
        }
      }
    } catch {
      // Ignore transient network error
    } finally {
      if (!systemType || systemType === 'hotspot' || systemType === 'userman') {
        setIsSyncingHotspot(false);
      }
      if (!systemType || systemType === 'pppoe') {
        setIsSyncingPPP(false);
      }
    }
  }, [fetchWithToken, safeSet, router?.host]);

  // ==========================================
  // CHUNKED STREAM PROCESSING & TAB PRIORITY QUEUE ENGINE
  // Streams subscribers in NDJSON chunks (150 per chunk),
  // prioritizing active tab domain first, offloading to web worker, and caching in IndexedDB
  // ==========================================
  const streamSubscriberDomain = useCallback(async (domain: 'hotspot' | 'ppp' | 'userman', force: boolean = false, signal?: AbortSignal) => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    try {
      const url = `/api/mikrotik/data/stream/subscribers?domain=${domain}&chunkSize=150${force ? '&force=true' : ''}`;
      const res = await fetchWithToken(url, { signal });
      if (!res.ok || !res.body || signal?.aborted) return;

      reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let totalItemsCount = 0;
      let totalChunksCount = 0;
      const accumulatedItems: any[] = [];

      setStreamStatus({
        isStreaming: true,
        domain,
        chunkIndex: 0,
        totalChunks: 0,
        receivedItems: 0,
        totalItems: 0,
        progressPercent: 0
      });

      while (true) {
        if (signal?.aborted) {
          try {
            await reader.cancel();
          } catch (err) {
            logger.warn('Failed cancelling stream reader: ' + String(err), 'streamSubscriberDomain');
          }
          break;
        }
        const { done, value } = await reader.read();
        if (done || signal?.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (signal?.aborted) break;
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.type === 'META') {
              totalItemsCount = data.totalItems || 0;
              totalChunksCount = data.totalChunks || 1;
              setStreamStatus(prev => ({
                ...prev,
                totalItems: totalItemsCount,
                totalChunks: totalChunksCount
              }));
            } else if (data.type === 'CHUNK') {
              const { chunkIndex, isLastChunk, items = [] } = data;

              // Offload chunk normalization only if non-empty
              const chunkItems = Array.isArray(items) && items.length > 0
                ? ((await runWorkerTask('PROCESS_SUBSCRIBER_CHUNK', {
                    domain,
                    items,
                    chunkIndex,
                    totalChunks: totalChunksCount,
                    isLastChunk
                  }))?.items || items)
                : [];

              if (signal?.aborted) break;

              for (let idx = 0; idx < chunkItems.length; idx++) {
                accumulatedItems.push(chunkItems[idx]);
              }

              // Batch React state updates: flush immediately on first chunk, every 8 chunks, and on last chunk to avoid O(N^2) array cloning
              const shouldFlushState = chunkIndex === 0 || isLastChunk || (chunkIndex % 8 === 0);
              if (shouldFlushState) {
                const snapshot = isLastChunk ? accumulatedItems : accumulatedItems.slice();
                if (domain === 'hotspot') {
                  safeSet(setUsers, snapshot);
                } else if (domain === 'ppp') {
                  safeSet(setPppSecrets, snapshot);
                } else if (domain === 'userman') {
                  safeSet(setUsermanUsers, snapshot);
                }
              }

              const progressPercent = totalItemsCount > 0 ? Math.min(100, Math.round((accumulatedItems.length / totalItemsCount) * 100)) : 100;
              setStreamStatus(prev => ({
                ...prev,
                chunkIndex,
                receivedItems: accumulatedItems.length,
                progressPercent
              }));

              if (isLastChunk) {
                if (domain === 'hotspot') {
                  saveSubscribersToCache('hotspot_users', accumulatedItems, router?.host);
                } else if (domain === 'ppp') {
                  saveSubscribersToCache('ppp_secrets', accumulatedItems, router?.host);
                } else if (domain === 'userman') {
                  saveSubscribersToCache('userman_users', accumulatedItems, router?.host);
                }
              }
            }
          } catch (err) {
            logger.warn('Failed parsing NDJSON stream line: ' + String(err), 'streamSubscriberDomain');
          }
        }
      }
    } catch {
      // Network / AbortError handling
    } finally {
      if (reader) {
        try {
          reader.releaseLock();
        } catch (err) {
          logger.warn('Failed releasing stream reader lock: ' + String(err), 'streamSubscriberDomain');
        }
      }
      if (!signal?.aborted) {
        setStreamStatus(prev => ({ ...prev, isStreaming: false }));
      }
    }
  }, [fetchWithToken, runWorkerTask, safeSet, router?.host]);

  const streamSubscribersByTabPriority = useCallback(async (activeTab: string, force: boolean = false) => {
    if (streamAbortRef.current) {
      try {
        streamAbortRef.current.abort();
      } catch (err) {
        logger.warn('Failed aborting previous stream: ' + String(err), 'streamSubscribersByTabPriority');
      }
    }
    const controller = new AbortController();
    streamAbortRef.current = controller;
    const { signal } = controller;

    let domains: ('hotspot' | 'ppp' | 'userman')[] = ['hotspot', 'ppp', 'userman'];

    if (activeTab === 'ppp') {
      domains = ['ppp', 'hotspot', 'userman'];
    } else if (activeTab === 'userman') {
      domains = ['userman', 'hotspot', 'ppp'];
    } else if (['hotspot_users', 'generator', 'card_studio', 'ip_binding', 'active_sessions'].includes(activeTab)) {
      domains = ['hotspot', 'userman', 'ppp'];
    }

    // High Priority 1: Active Tab Domain
    await streamSubscriberDomain(domains[0], force, signal);

    // Background Priority 2 & 3: Other Domains
    for (let i = 1; i < domains.length; i++) {
      if (signal.aborted) break;
      await new Promise(r => setTimeout(r, 120));
      if (signal.aborted) break;
      await streamSubscriberDomain(domains[i], false, signal);
    }
  }, [streamSubscriberDomain]);

  useEffect(() => {
    streamSubscribersByTabPriorityRef.current = streamSubscribersByTabPriority;
  }, [streamSubscribersByTabPriority]);

  // ==========================================
  // DATA PREFETCHER MODEL
  // Schedules slow idle fetching of basic essentials (active counts, profiles)
  // Cancels IMMEDIATELY and COMPLETELY when heavy pages are opened
  // ==========================================
  const [prefetcherStatus, setPrefetcherStatus] = useState<'idle' | 'prefetching' | 'paused' | 'cancelled'>('idle');
  const [isPrefetching, setIsPrefetching] = useState<boolean>(false);
  const [lastPrefetchTime, setLastPrefetchTime] = useState<Date | null>(null);
  const [prefetchedData, setPrefetchedData] = useState<PrefetchedData>(() => {
    try {
      const saved = safeStorage.getItem('zctrl_prefetched_data');
      return saved ? JSON.parse(saved) : {
        activeSubscribersCount: 0,
        hotspotProfilesCount: 0,
        pppProfilesCount: 0,
        activePppCount: 0,
        lastPrefetchTimestamp: null
      };
    } catch {
      return {
        activeSubscribersCount: 0,
        hotspotProfilesCount: 0,
        pppProfilesCount: 0,
        activePppCount: 0,
        lastPrefetchTimestamp: null
      };
    }
  });

  const prefetchAbortRef = useRef<AbortController | null>(null);
  const activeHeavyPageRef = useRef<string | null>(null);

  const isHeavyPage = useCallback((tab: string): boolean => {
    const HEAVY_SET = new Set([
      'card_studio',
      'generator',
      'hotspot_users',
      'userman',
      'queues',
      'firewall',
      'traffic',
      'network_center',
      'logs',
      'backup',
      'terminal',
      'ip_binding',
      'dhcp'
    ]);
    return HEAVY_SET.has(tab);
  }, []);

  const cancelPrefetch = useCallback(() => {
    if (prefetchAbortRef.current) {
      try {
        prefetchAbortRef.current.abort();
      } catch (err) {
        logger.warn('Failed aborting prefetch: ' + String(err), 'cancelPrefetch');
      }
      prefetchAbortRef.current = null;
    }
    setIsPrefetching(false);
    setPrefetcherStatus('cancelled');
  }, []);

  const triggerIdlePrefetch = useCallback(async () => {
    if (!isConnected || isPrefetching) return;
    const curTab = currentActiveTabRef.current || 'dashboard';

    // 1. Strict guard: If currently on any heavy page, immediately cancel and abort
    if (isHeavyPage(curTab)) {
      cancelPrefetch();
      activeHeavyPageRef.current = curTab;
      setPrefetcherStatus('cancelled');
      return;
    }

    // 2. Hardware thermal & CPU guard: Yield completely if router is warm or CPU is high
    const cpu = router?.cpuLoad ?? lastCpuLoadRef.current ?? 0;
    const temp = router?.cpuTemperature ?? router?.boardTemperature ?? 0;
    if (cpu > 60 || temp > 58 || ecoMode || thermalShieldActive) {
      setPrefetcherStatus('paused');
      return;
    }

    // 3. Tab visibility guard: If browser tab is hidden in background, do not prefetch
    if (typeof document !== 'undefined' && document.hidden) {
      return;
    }

    cancelPrefetch();
    const controller = new AbortController();
    prefetchAbortRef.current = controller;
    setIsPrefetching(true);
    setPrefetcherStatus('prefetching');

    try {
      // Gentle pacing delay before network call to let RouterOS breathe
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 600);
        controller.signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });

      if (controller.signal.aborted) return;

      const res = await fetchWithToken('/api/mikrotik/prefetch/essential', {
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          const nextData: PrefetchedData = {
            activeSubscribersCount: d.activeHotspotCount || 0,
            hotspotProfilesCount: d.hotspotProfilesCount || (d.hotspotProfiles?.length || 0),
            pppProfilesCount: d.pppProfilesCount || (d.pppProfiles?.length || 0),
            activePppCount: d.activePppCount || 0,
            lastPrefetchTimestamp: Date.now()
          };

          setPrefetchedData(nextData);
          setLastPrefetchTime(new Date());
          safeStorage.setItem('zctrl_prefetched_data', JSON.stringify(nextData));

          // Preload profiles into context cache so opening profile screens is instant (0ms latency)
          if (Array.isArray(d.hotspotProfiles) && d.hotspotProfiles.length > 0) {
            safeSet(setProfiles, d.hotspotProfiles);
          }
          if (Array.isArray(d.pppProfiles) && d.pppProfiles.length > 0) {
            safeSet(setPppProfiles, d.pppProfiles);
          }

          setPrefetcherStatus('idle');
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setPrefetcherStatus('cancelled');
      } else {
        setPrefetcherStatus('idle');
      }
    } finally {
      setIsPrefetching(false);
      prefetchAbortRef.current = null;
    }
  }, [isConnected, isPrefetching, isHeavyPage, cancelPrefetch, router?.cpuLoad, router?.cpuTemperature, router?.boardTemperature, ecoMode, thermalShieldActive, fetchWithToken, safeSet]);

  // Immediate cancellation hook when user navigates to heavy page
  useEffect(() => {
    if (isHeavyPage(currentActiveTab)) {
      cancelPrefetch();
      activeHeavyPageRef.current = currentActiveTab;
      setPrefetcherStatus('cancelled');
    } else {
      activeHeavyPageRef.current = null;
      setPrefetcherStatus(prev => prev === 'cancelled' ? 'idle' : prev);
    }
  }, [currentActiveTab, isHeavyPage, cancelPrefetch]);

  // Scheduled background idle prefetch timer (gentle interval every 180s during idle only when CPU is cool)
  useEffect(() => {
    if (!isConnected) {
      cancelPrefetch();
      return;
    }

    if (isHeavyPage(currentActiveTab)) {
      cancelPrefetch();
      return;
    }

    const interval = setInterval(() => {
      // Run ONLY when user is idle, on a non-heavy page, and router CPU/thermals are calm
      if (
        isUserIdleRef.current &&
        !isHeavyPage(currentActiveTabRef.current) &&
        !thermalShieldActive &&
        lastCpuLoadRef.current <= 55
      ) {
        triggerIdlePrefetch();
      }
    }, 180000);

    return () => {
      clearInterval(interval);
    };
  }, [isConnected, currentActiveTab, isHeavyPage, cancelPrefetch, triggerIdlePrefetch, thermalShieldActive]);

  const dataPrefetcher: DataPrefetcher = useMemo(() => ({
    status: prefetcherStatus,
    isPrefetching,
    prefetchedData,
    lastPrefetchTime,
    cancelPrefetch,
    triggerIdlePrefetch,
    isHeavyPage,
    activeHeavyPage: activeHeavyPageRef.current
  }), [prefetcherStatus, isPrefetching, prefetchedData, lastPrefetchTime, cancelPrefetch, triggerIdlePrefetch, isHeavyPage]);

  // ----------------------------------------------------
  // Background Synchronization Engine (Web Worker offloading for logs & interfaces)
  // ----------------------------------------------------
  const startBackgroundSync = useCallback((customIntervalMs?: number) => {
    const intervalMs = customIntervalMs || 30000;
    setBgSyncEngineState((prev) => ({
      ...prev,
      isRunning: true,
      status: 'syncing',
      intervalMs
    }));
  }, []);

  const stopBackgroundSync = useCallback(() => {
    setBgSyncEngineState((prev) => ({
      ...prev,
      isRunning: false,
      status: 'idle'
    }));
  }, []);

  const triggerBackgroundSyncNow = useCallback(async () => {
    setBgSyncEngineState((prev) => ({ ...prev, status: 'syncing' }));
    try {
      setBgSyncEngineState((prev) => ({
        ...prev,
        status: 'idle',
        lastSyncTimestamp: Date.now(),
        syncCount: prev.syncCount + 1,
        error: undefined
      }));
    } catch (err: any) {
      setBgSyncEngineState((prev) => ({
        ...prev,
        status: 'error',
        error: err.message || 'Background sync failed'
      }));
    }
  }, []);

  const adjustBackgroundSyncInterval = useCallback((ms: number) => {
    setBgSyncEngineState((prev) => ({ ...prev, intervalMs: ms }));
  }, []);

  const backgroundSyncEngine = useMemo(() => ({
    state: bgSyncEngineState,
    start: startBackgroundSync,
    stop: stopBackgroundSync,
    syncNow: triggerBackgroundSyncNow,
    adjustInterval: adjustBackgroundSyncInterval
  }), [bgSyncEngineState, startBackgroundSync, stopBackgroundSync, triggerBackgroundSyncNow, adjustBackgroundSyncInterval]);

  // Auto start/stop background sync worker based on router connection and WebSocket state (debounced to avoid brief handshake churn)
  useEffect(() => {
    const canRunBgWorker =
      isConnected &&
      !isRealtimeWsConnected &&
      realtimeSyncMode !== 'paused' &&
      (typeof document === 'undefined' || !document.hidden);

    if (!canRunBgWorker) {
      stopBackgroundSync();
      return;
    }

    const timer = setTimeout(() => {
      startBackgroundSync(45000);
    }, 8000);

    return () => {
      clearTimeout(timer);
      stopBackgroundSync();
    };
  }, [isConnected, isRealtimeWsConnected, realtimeSyncMode, startBackgroundSync, stopBackgroundSync]);

  const connectToRouter = async (config: Partial<RouterConnection>) => {
    setIsConnecting(true);
    try {
      safeStorage.removeItem('zctrl_explicit_logout');
      const res = await fetch('/api/mikrotik/connect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      setIsConnecting(false);

      if (data.success && data.router && data.token) {
        connectTimeRef.current = Date.now();
        tokenRef.current = data.token;
        isConnectedRef.current = true;
        safeSession.setItem('zctrl_session_authenticated', 'true');
        safeStorage.setItem('zcontrol_active_token', data.token);
        safeStorage.setItem('zctrl_router_token', data.token);
        setToken(data.token);
        const sanitizedRouter: RouterConnection = {
          id: `r-${Date.now()}`,
          name: data.router.name || 'MikroTik RouterOS',
          host: config.host || data.router.host || '',
          port: config.port || data.router.port || 8728,
          username: config.username || 'admin',
          useSsl: Boolean(config.useSsl),
          version: data.router.version || '',
          majorVersion: data.router.majorVersion,
          boardName: data.router.boardName || 'RouterBOARD',
          uptime: data.router.uptime || '',
          cpuLoad: data.router.cpuLoad ?? 0,
          freeMemory: data.router.freeMemory ?? 0,
          totalMemory: data.router.totalMemory ?? 0,
          pingMs: data.router.pingMs ?? 0,
          hasInternet: data.router.hasInternet,
          gateway: data.router.gateway,
          wanIp: data.router.wanIp,
          connectedAt: new Date().toISOString(),
          profileId: config.profileId
        };

        setRouter(sanitizedRouter);
        setUserRole((data.role as OperatorRole) || 'admin');
        setOperatorName(data.operatorName || config.operatorUsername || config.username || 'admin');
        setTlsFingerprint(data.tlsFingerprint ?? data.router.tlsFingerprint ?? null);
        setIsConnected(true);
        if (typeof window !== 'undefined' && window.zctrlDesktopSession?.setActiveSession) {
          window.zctrlDesktopSession.setActiveSession({
            host: sanitizedRouter.host,
            port: sanitizedRouter.port,
            username: sanitizedRouter.username,
            password: typeof config.password === 'string' ? config.password : '',
            useTls: sanitizedRouter.useSsl,
            timeoutMs: 8000,
            tlsFingerprint: data.tlsFingerprint ?? config.tlsFingerprint ?? undefined,
            acceptTlsFingerprint: config.acceptTlsFingerprint
          }).catch(() => {});
        }
        showToast(data.message || 'تم الاتصال بالراوتر بنجاح', 'success');
        
        // Execute calm initial sync (uses staged server sync without bypassing static caches)
        try {
          await syncNow(false);
        } catch (err) {
          logger.warn('Post-connect sync warning: ' + String(err), 'connectToRouter');
        }

        return { success: true, message: data.message, router: sanitizedRouter };
      } else {
        const msg = data.message || translateErrorMessage(data.rawError || 'تعذر الاتصال بالسيرفر. تحقق من العنوان وبيانات الدخول');
        showToast(msg, 'error');
        return {
          success: false,
          message: msg,
          suggestion: data.suggestion,
          rawError: data.rawError,
          reasonType: data.reasonType,
          pendingFingerprint: data.pendingFingerprint,
          pinnedFingerprint: data.pinnedFingerprint
        };
      }
    } catch (err: any) {
      setIsConnecting(false);
      const msg = translateErrorMessage(err);
      showToast(msg, 'error');
      return { success: false, message: msg, rawError: String(err) };
    }
  };

  const cancelConnecting = async () => {
    setIsConnecting(false);
    try {
      const activeToken = tokenRef.current || token || safeStorage.getItem('zcontrol_active_token');
      await fetch('/api/mikrotik/cancel-connect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(activeToken ? { 'X-Router-Token': activeToken } : {})
        }
      });
    } catch (err) {
      logger.warn('Cancel-connect request warning: ' + String(err), 'cancelConnecting');
    }
    showToast('تم إيقاف عملية الاتصال', 'info');
  };

  const disconnectRouter = useCallback(() => {
    const activeToken = tokenRef.current || token || safeStorage.getItem('zcontrol_active_token');
    connectTimeRef.current = 0;
    tokenRef.current = null;
    isConnectedRef.current = false;
    setToken(null);
    setIsConnected(false);
    setIsRestoringSession(false);
    setRouter(null);
    setUserRole('admin');
    setOperatorName('');
    setTlsFingerprint(null);
    try {
      safeSession.removeItem('zctrl_session_authenticated');
      safeSession.removeItem('zctrl_session_router_meta');
      safeSession.removeItem('zctrl_active_tab');
      safeStorage.setItem('zctrl_explicit_logout', 'true');
      safeStorage.removeItem('zcontrol_active_token');
      safeStorage.removeItem('zctrl_router_token');
      safeStorage.removeItem('zcontrol_session_token');
      if (typeof window !== 'undefined' && window.zctrlDesktopSession?.clearActiveSession) {
        window.zctrlDesktopSession.clearActiveSession().catch(() => {});
      }
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'STOP_BACKGROUND_TELEMETRY' });
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (err) {
          logger.warn('WS close warning on disconnect: ' + String(err), 'disconnectRouter');
        }
        wsRef.current = null;
      }
      if (silentReconnectTimerRef.current) {
        clearTimeout(silentReconnectTimerRef.current);
        silentReconnectTimerRef.current = null;
      }
      if (tabFetchAbortRef.current) {
        try {
          tabFetchAbortRef.current.abort();
        } catch (err) {
          logger.warn('Tab abort warning on disconnect: ' + String(err), 'disconnectRouter');
        }
        tabFetchAbortRef.current = null;
      }
      if (streamAbortRef.current) {
        try {
          streamAbortRef.current.abort();
        } catch (err) {
          logger.warn('Stream abort warning on disconnect: ' + String(err), 'disconnectRouter');
        }
        streamAbortRef.current = null;
      }
      setIsRealtimeWsConnected(false);
      fetch('/api/mikrotik/cancel-connect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(activeToken ? { 'X-Router-Token': activeToken } : {})
        }
      }).catch(() => {});
    } catch (err) {
      logger.warn('Disconnect cleanup warning: ' + String(err), 'disconnectRouter');
    }
    showToast('تم تسجيل الخروج وفصل الاتصال بنجاح', 'info');
  }, [setToken, showToast, token]);

  // Activate & Connect to Router Profile with Single-Click!
  const activateConnectionProfile = useCallback(async (id: string, overridePassword?: string) => {
    const target = connectionProfiles.find(p => p.id === id);
    if (!target) {
      showToast('بروفايل الاتصال غير موجود', 'error');
      return { success: false, message: 'بروفايل الاتصال غير موجود' };
    }

    const passToUse = overridePassword !== undefined ? overridePassword : '';
    if (overridePassword === undefined) {
      return { 
        success: false, 
        needPassword: true, 
        message: `يرجى إدخال كلمة المرور للاتصال ببروفايل "${target.name}"` 
      };
    }

    showToast(`جاري الاتصال ببروفايل: ${target.name} (${target.host})...`, 'info');

    const result = await connectToRouter({
      name: target.name,
      host: target.host,
      port: target.port,
      username: target.username,
      password: passToUse,
      useSsl: target.useSsl,
      profileId: target.id
    });

    if (result.success) {
      setActiveProfileId(target.id);
      safeStorage.setItem('zahir_active_profile_id', target.id);
      const updated = connectionProfiles.map(p => {
        if (p.id === target.id) {
          return {
            ...p,
            lastConnectedAt: new Date().toISOString(),
            password: overridePassword !== undefined ? overridePassword : p.password
          };
        }
        return p;
      });
      setConnectionProfiles(updated);
      safeStorage.setItem('zahir_router_connection_profiles', JSON.stringify(updated));
      showToast(`تم تفعيل والاتصال ببروفايل: ${target.name} بنجاح`, 'success');
      return { success: true, message: `تم تفعيل والاتصال ببروفايل: ${target.name}` };
    } else {
      return {
        success: false,
        message: result.message || `تعذر الاتصال ببروفايل ${target.name}`
      };
    }
  }, [connectionProfiles, connectToRouter, showToast]);

  const subscriberActions = useSubscriberActions({
    fetchWithToken,
    showToast,
    syncNow,
    refreshProfiles,
    runWorkerTask,
    setUsers,
    setProfiles,
    setPppSecrets,
    setPppProfiles,
    setUsermanUsers,
    setUsermanProfiles,
    setSelectedUsersForPrint,
  });

  const networkPortalActions = useNetworkPortalActions({
    fetchWithToken,
    showToast,
    syncNow,
    refreshQueues,
    setSimpleQueues,
    setWirelessInterfaces,
    setRegistrationTable,
    setNeighbors,
    setRemoteCaps,
    setAccessPoints,
    setHotspotServerProfiles,
    setHotspotServers,
    setRouterFiles,
    setScheduledTasks,
    setIsLoadingWireless,
    setIsLoadingAntennas,
    setIsLoadingAccessPoints,
    setIsLoadingPortalProfiles,
    setIsLoadingSchedulers,
  });

  const { runCommand } = networkPortalActions;

  const lastSyncTimeUpdateRef = useRef<number>(0);
  const lastRealtimePacketTimeRef = useRef<number>(0);
  const lastLightCheckRef = useRef<number>(0);

  const updateLastSyncTime = useCallback((force: boolean = false) => {
    const now = Date.now();
    lastSyncTimeRef.current = now;
    if (force || now - lastSyncTimeUpdateRef.current > 20000) {
      lastSyncTimeUpdateRef.current = now;
      setLastSyncTime(new Date(now));
    }
  }, []);

  // 1. Real-Time WebSocket Connection Effect (Exponential Backoff + Visibility/Offline Guard)
  useEffect(() => {
    if (!isConnected || realtimeSyncMode === 'paused' || realtimeSyncMode === 'smart_polling') {
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (err) {
          logger.warn('WS close warning on mode change: ' + String(err), 'MikroTikContext');
        }
        wsRef.current = null;
      }
      setIsRealtimeWsConnected(false);
      return;
    }

    let isDisposed = false;
    let reconnectAttempt = 0;
    let wsFlushTimer: NodeJS.Timeout | null = null;
    let lastWsFlushAt = 0;
    const pendingWs: {
      pingStabilizer?: PingStabilizerSnapshot;
      interfaces?: NetworkInterface[];
      activeHotspotUsers?: ActiveHotspotUser[];
      pppActive?: PPPActive[];
      queues?: SimpleQueue[];
      leases?: DhcpLease[];
      logs?: SystemLogEntry[];
      system?: any;
      hasUpdates: boolean;
    } = { hasUpdates: false };

    const flushPendingWs = () => {
      if (wsFlushTimer) {
        clearTimeout(wsFlushTimer);
        wsFlushTimer = null;
      }
      if (isDisposed || !pendingWs.hasUpdates) return;
      pendingWs.hasUpdates = false;
      lastWsFlushAt = Date.now();

      const snap = { ...pendingWs };
      pendingWs.pingStabilizer = undefined;
      pendingWs.interfaces = undefined;
      pendingWs.activeHotspotUsers = undefined;
      pendingWs.pppActive = undefined;
      pendingWs.queues = undefined;
      pendingWs.leases = undefined;
      pendingWs.logs = undefined;
      pendingWs.system = undefined;

      if (snap.pingStabilizer) {
        safeSet(setPingStabilizer, snap.pingStabilizer);
      }
      if (snap.interfaces) {
        safeSet(setInterfaces, snap.interfaces);
        saveGlobalCache('network_interfaces', snap.interfaces, router?.host);
      }
      if (snap.activeHotspotUsers) {
        safeSet(setActiveUsers, snap.activeHotspotUsers);
      }
      if (snap.pppActive) {
        safeSet(setPppActive, snap.pppActive);
      }
      if (snap.queues) {
        safeSet(setSimpleQueues, snap.queues);
      }
      if (snap.leases) {
        safeSet(setDhcpLeases, snap.leases);
      }
      if (snap.logs) {
        safeSet(setSystemLogs, snap.logs);
      }
      if (snap.system) {
        const s = snap.system;
        lastCpuLoadRef.current = s.cpuLoad ?? 0;
        setRouter((prev) => {
          if (!prev) return null;
          const cpuChanged = prev.cpuLoad !== s.cpuLoad;
          const pingChanged = Math.abs((prev.pingMs || 0) - (s.pingMs || 0)) >= 2;
          const memChanged = Math.abs((prev.freeMemory || 0) - (s.freeMemory || 0)) > 1024 * 512;
          const tempChanged = prev.cpuTemperature !== s.cpuTemperature || prev.boardTemperature !== s.boardTemperature;
          const uptimeChanged = prev.uptime !== s.uptime;

          if (!cpuChanged && !pingChanged && !memChanged && !tempChanged && !uptimeChanged) {
            return prev;
          }

          return {
            ...prev,
            cpuLoad: s.cpuLoad ?? prev.cpuLoad,
            uptime: s.uptime ?? prev.uptime,
            freeMemory: s.freeMemory ?? prev.freeMemory,
            totalMemory: s.totalMemory ?? prev.totalMemory,
            cpuTemperature: s.cpuTemperature ?? prev.cpuTemperature,
            boardTemperature: s.boardTemperature ?? prev.boardTemperature,
            pingMs: s.pingMs ?? prev.pingMs
          };
        });
      }
      updateLastSyncTime(false);
    };

    const scheduleWsFlush = () => {
      pendingWs.hasUpdates = true;
      if (wsFlushTimer) return;
      const elapsed = Date.now() - lastWsFlushAt;
      // Coalesce multi-channel frames received in the same burst (min 150ms, max 1000ms cadence)
      const waitMs = elapsed >= 1000 ? 150 : Math.max(150, 1000 - elapsed);
      wsFlushTimer = setTimeout(flushPendingWs, waitMs);
    };

    const scheduleReconnect = () => {
      if (isDisposed || !isConnected) return;
      if (wsReconnectTimeoutRef.current) {
        clearTimeout(wsReconnectTimeoutRef.current);
        wsReconnectTimeoutRef.current = null;
      }
      // Pause reconnect loop while browser is offline or tab is hidden to save CPU/battery
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (typeof document !== 'undefined' && document.hidden) return;

      const baseDelay = Math.min(30000, 2000 * Math.pow(2, Math.min(reconnectAttempt, 4)));
      const jitterArr = new Uint32Array(1);
      crypto.getRandomValues(jitterArr);
      const jitter = jitterArr[0] % 600;
      reconnectAttempt++;
      wsReconnectTimeoutRef.current = setTimeout(connectWs, baseDelay + jitter);
    };

    const connectWs = () => {
      if (isDisposed) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const activeToken = tokenRef.current || token || safeStorage.getItem('zcontrol_active_token') || safeStorage.getItem('zctrl_router_token') || '';
        const wsUrl = `${protocol}//${window.location.host}/api/ws/realtime`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isDisposed) { ws.close(); return; }
          reconnectAttempt = 0;
          setIsRealtimeWsConnected(true);

          const tab = currentActiveTabRef.current || 'dashboard';
          const channels: string[] = ['system'];
          if (tab === 'traffic') channels.push('traffic');
          else if (tab === 'active_sessions' || tab === 'ppp') channels.push('sessions');
          else if (tab === 'queues') channels.push('queues');
          else if (tab === 'dhcp') channels.push('leases');
          else if (tab === 'logs') channels.push('logs');
          else if (tab === 'dashboard') channels.push('sessions', 'traffic');

          ws.send(JSON.stringify({
            type: 'subscribe',
            ...(activeToken ? { token: activeToken } : {}),
            channels,
            tab,
            intervalMs: Math.round(activeRealtimeFrequencySec * 1000)
          }));
        };

        ws.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const msg = JSON.parse(event.data);
            const now = Date.now();
            lastRealtimePacketTimeRef.current = now;

            if (msg.type === 'ping_stabilizer:update' && msg.pingStabilizer) {
              pendingWs.pingStabilizer = msg.pingStabilizer;
              scheduleWsFlush();
              return;
            }

            if (msg.type === 'traffic:update' && Array.isArray(msg.interfaces)) {
              pendingWs.interfaces = msg.interfaces;
              scheduleWsFlush();
            } else if (msg.type === 'sessions:update') {
              if (Array.isArray(msg.activeHotspotUsers)) {
                pendingWs.activeHotspotUsers = msg.activeHotspotUsers;
              }
              if (Array.isArray(msg.pppActive)) {
                pendingWs.pppActive = msg.pppActive;
              }
              scheduleWsFlush();
            } else if (msg.type === 'queues:update' && Array.isArray(msg.queues)) {
              pendingWs.queues = msg.queues;
              scheduleWsFlush();
            } else if (msg.type === 'leases:update' && Array.isArray(msg.leases)) {
              pendingWs.leases = msg.leases;
              scheduleWsFlush();
            } else if (msg.type === 'logs:update' && Array.isArray(msg.logs)) {
              pendingWs.logs = msg.logs;
              scheduleWsFlush();
            } else if (msg.type === 'system:update' && msg.system) {
              pendingWs.system = msg.system;
              if (msg.pingStabilizer) {
                pendingWs.pingStabilizer = msg.pingStabilizer;
              }
              scheduleWsFlush();
            }
          } catch (err) {
            logger.warn('Invalid WS message payload: ' + String(err), 'MikroTikContext');
          }
        };

        ws.onerror = () => {
          setIsRealtimeWsConnected(false);
        };

        ws.onclose = () => {
          setIsRealtimeWsConnected(false);
          wsRef.current = null;
          scheduleReconnect();
        };
      } catch {
        setIsRealtimeWsConnected(false);
        scheduleReconnect();
      }
    };

    const handleResumeConnection = () => {
      if (isDisposed) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        reconnectAttempt = 0;
        connectWs();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleResumeConnection);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResumeConnection);
    }

    connectWs();

    return () => {
      isDisposed = true;
      if (wsFlushTimer) clearTimeout(wsFlushTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleResumeConnection);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResumeConnection);
      }
      if (wsReconnectTimeoutRef.current) clearTimeout(wsReconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (err) {
          logger.warn('WS close warning on unmount: ' + String(err), 'MikroTikContext');
        }
        wsRef.current = null;
      }
      setIsRealtimeWsConnected(false);
    };
  }, [isConnected, realtimeSyncMode, router?.host]);

  // Update WebSocket polling cadence in-place without tearing down/reconnecting the socket!
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'update_interval',
          intervalMs: Math.round(activeRealtimeFrequencySec * 1000)
        }));
      } catch (err) {
        logger.warn('WS update_interval send failed: ' + String(err), 'MikroTikContext');
      }
    }
  }, [activeRealtimeFrequencySec]);

  // Tab change update over WebSocket (single deduplicated notification)
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'tab_change',
          tab: currentActiveTab,
          isHidden: typeof document !== 'undefined' ? document.hidden : false,
          isIdle: isUserIdleRef.current
        }));
      } catch (err) {
        logger.warn('WS tab_change send failed: ' + String(err), 'MikroTikContext');
      }
    }
  }, [currentActiveTab]);

  // Auto-Ping & CPU Stabilizer Actions
  const refreshPingStabilizer = useCallback(async (refreshQos: boolean = false) => {
    if (!isConnectedRef.current) return;
    try {
      const res = await fetchWithToken(`/api/mikrotik/ping-stabilizer/status${refreshQos ? '?refreshQos=true' : ''}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.stabilizer) {
          safeSet(setPingStabilizer, json.stabilizer);
        }
      }
    } catch (err) {
      logger.warn('Failed refreshing ping stabilizer: ' + String(err), 'refreshPingStabilizer');
    }
  }, [fetchWithToken]);

  const updatePingStabilizerConfig = useCallback(async (config: {
    mode?: PingStabilizerMode;
    targetPingMs?: number;
    maxCpuThreshold?: number;
    autoQosEnabled?: boolean;
    resetStats?: boolean;
  }) => {
    try {
      const res = await fetchWithToken('/api/mikrotik/ping-stabilizer/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const json = await res.json();
      if (json.success && json.stabilizer) {
        safeSet(setPingStabilizer, json.stabilizer);
        showToast(json.message || 'تم تحديث إعدادات منظم البينج بنجاح', 'success');
        return { success: true, message: json.message };
      }
      showToast(json.message || 'تعذر تحديث إعدادات منظم البينج', 'error');
      return { success: false, message: json.message };
    } catch (err: any) {
      const msg = translateErrorMessage(err);
      showToast(msg, 'error');
      return { success: false, message: msg };
    }
  }, [fetchWithToken, showToast]);

  const optimizePingNow = useCallback(async (options?: { target?: string; count?: number; applyQos?: boolean }) => {
    if (!isConnectedRef.current) {
      return { success: false, message: 'الراوتر غير متصل حالياً' };
    }
    setIsOptimizingPing(true);
    try {
      const res = await fetchWithToken('/api/mikrotik/ping-stabilizer/optimize-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {})
      });
      const json = await res.json();
      if (json.success) {
        if (json.stabilizer) safeSet(setPingStabilizer, json.stabilizer);
        if (json.probe?.avgPingMs) {
          setRouter((prev) => prev ? (prev.pingMs === json.probe.avgPingMs ? prev : { ...prev, pingMs: json.probe.avgPingMs }) : prev);
        }
        showToast(json.message || 'تم فحص وضبط البينج تلقائياً بنجاح', 'success');
        return { success: true, message: json.message, probe: json.probe };
      }
      showToast(json.message || 'تعذر فحص البينج حالياً', 'error');
      return { success: false, message: json.message };
    } catch (err: any) {
      const msg = translateErrorMessage(err);
      showToast(msg, 'error');
      return { success: false, message: msg };
    } finally {
      if (isContextMountedRef.current) setIsOptimizingPing(false);
    }
  }, [fetchWithToken, showToast]);

  const previewQosFastLane = useCallback(async (options?: {
    prioritizeManagementApi?: boolean;
    interfaceList?: string;
    maxLimit?: string;
  }) => {
    if (!isConnectedRef.current) {
      return { success: false, message: 'الراوتر غير متصل حالياً' };
    }
    try {
      const params = new URLSearchParams();
      if (options?.prioritizeManagementApi !== undefined) {
        params.set('prioritizeManagementApi', String(options.prioritizeManagementApi));
      }
      if (options?.interfaceList) {
        params.set('interfaceList', options.interfaceList);
      }
      if (options?.maxLimit) {
        params.set('maxLimit', options.maxLimit);
      }
      const qs = params.toString();
      const res = await fetchWithToken(`/api/mikrotik/ping-stabilizer/qos-preview${qs ? `?${qs}` : ''}`);
      const json = await res.json();
      if (json.success) {
        return {
          success: true,
          rules: json.rules as QosRulePreview[],
          interfaceList: json.interfaceList,
          maxLimit: json.maxLimit,
          message: json.message
        };
      }
      return { success: false, message: json.message || 'تعذر معاينة قواعد QoS' };
    } catch (err: any) {
      return { success: false, message: translateErrorMessage(err) };
    }
  }, [fetchWithToken]);

  const toggleQosFastLane = useCallback(async (
    enable: boolean,
    prioritizeManagementApi: boolean = true,
    options?: { interfaceList?: string; maxLimit?: string }
  ) => {
    if (!isConnectedRef.current) {
      return { success: false, message: 'الراوتر غير متصل حالياً' };
    }
    setIsOptimizingPing(true);
    try {
      const res = await fetchWithToken('/api/mikrotik/ping-stabilizer/qos-fastlane', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enable,
          prioritizeManagementApi,
          interfaceList: options?.interfaceList,
          maxLimit: options?.maxLimit
        })
      });
      const json = await res.json();
      if (json.success) {
        if (json.stabilizer) safeSet(setPingStabilizer, json.stabilizer);
        showToast(json.message || (enable ? 'تم تفعيل مسار أولوية البينج بالراوتر' : 'تمت إزالة مسار أولوية البينج'), 'success');
        return { success: true, message: json.message };
      }
      showToast(json.message || 'تعذر تعديل قواعد أولوية البينج بالراوتر', 'error');
      return { success: false, message: json.message };
    } catch (err: any) {
      const msg = translateErrorMessage(err);
      showToast(msg, 'error');
      return { success: false, message: msg };
    } finally {
      if (isContextMountedRef.current) setIsOptimizingPing(false);
    }
  }, [fetchWithToken, showToast]);

  // 1b. Dedicated Idle & Visibility Tracker (Independent of polling ticks so listeners are never churned)
  useEffect(() => {
    if (!isConnected) {
      if (isUserIdleRef.current) {
        isUserIdleRef.current = false;
        setIsUserIdle(false);
      }
      return;
    }

    let idleTimer: NodeJS.Timeout | null = null;
    let lastActivityPingAt = 0;
    const resetIdleTimer = (evt?: Event) => {
      const now = Date.now();
      if (evt?.type === 'mousemove' && !isUserIdleRef.current && now - lastActivityPingAt < 3000) {
        return;
      }
      lastActivityPingAt = now;
      if (isUserIdleRef.current) {
        isUserIdleRef.current = false;
        setIsUserIdle(false);
      }
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        isUserIdleRef.current = true;
        setIsUserIdle(true);
      }, 75000);
    };

    const activityEvents = ['mousemove', 'keydown', 'scroll', 'touchstart'];
    if (typeof window !== 'undefined') {
      activityEvents.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }));
      resetIdleTimer();
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden && isConnectedRef.current) {
        resetIdleTimer();
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'client_state', isHidden: false, isIdle: false }));
          } catch (err) {
            logger.warn('WS client_state active send failed: ' + String(err), 'MikroTikContext');
          }
        }
      } else if (typeof document !== 'undefined' && document.hidden) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'client_state', isHidden: true, isIdle: true }));
          } catch (err) {
            logger.warn('WS client_state hidden send failed: ' + String(err), 'MikroTikContext');
          }
        }
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (typeof window !== 'undefined') {
        activityEvents.forEach((evt) => window.removeEventListener(evt, resetIdleTimer));
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isConnected]);

  // 2. Smart Variable-Frequency Polling Timer (Companions WebSocket or runs as Fallback)
  useEffect(() => {
    if (!isConnected || !autoSync || realtimeSyncMode === 'paused') return;

    const intervalMs = isRealtimeWsConnected
      ? 60000
      : Math.round(activeRealtimeFrequencySec * 1000);

    const interval = setInterval(() => {
      // 1. If tab is hidden in background, completely suspend polling (0% CPU, 0% router heat)
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      // 2. When WebSocket is actively connected, rely exclusively on WS + tab-change sync
      // (avoid redundant 120s full-sync loops that duplicate WS telemetry)
      if (isRealtimeWsConnected) {
        if (lastSyncTimeRef.current === 0) {
          syncNow();
        }
        return;
      }

      // 3. Fallback Mode / smart_polling mode:
      const activeTab = currentActiveTabRef.current || 'dashboard';
      if (activeTab === 'traffic') {
        fetchWithToken('/api/mikrotik/interfaces')
          .then((r) => r.json())
          .then((j) => {
            if (j.success && Array.isArray(j.interfaces)) {
              safeSet(setInterfaces, j.interfaces);
              updateLastSyncTime(false);
            }
          })
          .catch(() => {});
      } else if (activeTab === 'active_sessions') {
        fetchWithToken('/api/mikrotik/data/sync/hotspot?activeOnly=true')
          .then((r) => r.json())
          .then((j) => {
            if (j.success && j.data?.activeHotspotUsers) {
              safeSet(setActiveUsers, j.data.activeHotspotUsers);
              updateLastSyncTime(false);
            }
          })
          .catch(() => {});
      } else if (activeTab === 'ppp') {
        fetchWithToken('/api/mikrotik/data/sync/ppp?activeOnly=true')
          .then((r) => r.json())
          .then((j) => {
            if (j.success && Array.isArray(j.data?.active)) {
              safeSet(setPppActive, j.data.active);
              updateLastSyncTime(false);
            }
          })
          .catch(() => {});
      } else if (activeTab === 'queues') {
        fetchWithToken('/api/mikrotik/queues')
          .then((r) => r.json())
          .then((j) => {
            if (j.success && Array.isArray(j.queues)) {
              safeSet(setSimpleQueues, j.queues);
              updateLastSyncTime(false);
            }
          })
          .catch(() => {});
      } else if (activeTab === 'dhcp') {
        fetchWithToken('/api/mikrotik/data/sync/network')
          .then((r) => r.json())
          .then((j) => {
            if (j.success && Array.isArray(j.data?.leases)) {
              safeSet(setDhcpLeases, j.data.leases);
              updateLastSyncTime(false);
            }
          })
          .catch(() => {});
      } else if (activeTab === 'logs') {
        fetchWithToken('/api/mikrotik/data/sync/network?includeLogs=true')
          .then((r) => r.json())
          .then((j) => {
            if (j.success && Array.isArray(j.data?.logs)) {
              safeSet(setSystemLogs, j.data.logs);
              updateLastSyncTime(false);
            }
          })
          .catch(() => {});
      } else if (activeTab === 'dashboard') {
        fetchWithToken('/api/mikrotik/data/sync/system')
          .then((r) => r.json())
          .then((j) => {
            if (j.success && j.data) {
              const d = j.data;
              lastCpuLoadRef.current = d.cpuLoad ?? 0;
              if (Array.isArray(d.interfaces)) safeSet(setInterfaces, d.interfaces);
              setRouter((prev) => {
                if (!prev) return null;
                const nextCpu = d.cpuLoad ?? prev.cpuLoad;
                const nextCpuTemp = d.cpuTemperature ?? prev.cpuTemperature;
                const nextBoardTemp = d.boardTemperature ?? prev.boardTemperature;
                const nextUptime = d.uptime ?? prev.uptime;
                const nextFree = d.freeMemory ?? prev.freeMemory;
                const nextTotal = d.totalMemory ?? prev.totalMemory;
                const nextPing = d.pingMs ?? prev.pingMs;
                if (
                  prev.cpuLoad === nextCpu &&
                  prev.cpuTemperature === nextCpuTemp &&
                  prev.boardTemperature === nextBoardTemp &&
                  prev.uptime === nextUptime &&
                  prev.freeMemory === nextFree &&
                  prev.totalMemory === nextTotal &&
                  prev.pingMs === nextPing
                ) {
                  return prev;
                }
                return {
                  ...prev,
                  cpuLoad: nextCpu,
                  cpuTemperature: nextCpuTemp,
                  boardTemperature: nextBoardTemp,
                  uptime: nextUptime,
                  freeMemory: nextFree,
                  totalMemory: nextTotal,
                  pingMs: nextPing
                };
              });
              updateLastSyncTime(false);
            }
          })
          .catch(() => {});
      } else {
        if (Date.now() - lastLightCheckRef.current > 25000) {
          lastLightCheckRef.current = Date.now();
          fetchWithToken('/api/mikrotik/data/sync/system')
            .then((r) => r.json())
            .then((j) => {
              if (j.success && j.data) {
                const d = j.data;
                setRouter((prev) => {
                  if (!prev) return null;
                  const nextCpu = d.cpuLoad ?? prev.cpuLoad;
                  const nextPing = d.pingMs ?? prev.pingMs;
                  if (prev.cpuLoad === nextCpu && prev.pingMs === nextPing) return prev;
                  return { ...prev, cpuLoad: nextCpu, pingMs: nextPing };
                });
              }
            })
            .catch(() => {});
        }
      }
    }, intervalMs);

    return () => {
      clearInterval(interval);
    };
  }, [isConnected, autoSync, realtimeSyncMode, activeRealtimeFrequencySec, isRealtimeWsConnected, syncNow, fetchWithToken, safeSet, updateLastSyncTime]);

  const triggerRealtimeSync = useCallback((force: boolean = true) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'sync_now' }));
      } catch (err) {
        logger.warn('WS sync_now send failed: ' + String(err), 'triggerRealtimeSync');
      }
    }
    syncNow(force);
  }, [syncNow]);

  // Automated Real-Time CPU & RAM Safe Threshold Monitor (>85% Toast Alerts with Rapid Intervention)
  const lastCpuAlertTimeRef = useRef<number>(0);
  const lastRamAlertTimeRef = useRef<number>(0);
  const consecutiveRamHighCountRef = useRef<number>(0);
  const consecutiveCpuHighCountRef = useRef<number>(0);
  const prevCpuHighRef = useRef<boolean>(false);
  const prevRamHighRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isConnected || !router) return;
    // Guard against uninitialized or missing router memory metrics
    if (!router.totalMemory || router.totalMemory < 32 * 1024 * 1024) return;
    if (router.freeMemory === undefined || router.freeMemory === null || router.freeMemory <= 0) return;

    const now = Date.now();
    const cpu = router.cpuLoad ?? 0;
    const totalMem = router.totalMemory;
    const freeMem = router.freeMemory;
    const usedMem = Math.max(0, totalMem - freeMem);
    const ramPercent = Math.min(100, Math.max(0, Math.round((usedMem / totalMem) * 100)));

    // 1. CPU Threshold Check (> 92% sustained for multiple consecutive checks)
    if (cpu >= 92) {
      consecutiveCpuHighCountRef.current += 1;
      const timeSinceLastAlert = now - lastCpuAlertTimeRef.current;
      if (consecutiveCpuHighCountRef.current >= 4 && (!prevCpuHighRef.current || timeSinceLastAlert > 300000)) {
        lastCpuAlertTimeRef.current = now;
        prevCpuHighRef.current = true;

        if (!ecoMode) {
          setEcoMode(true);
        }

        showToast(
          `تنبيه الأداء: استهلاك معالج الراوتر (CPU) وصل إلى ${cpu}%، تم تفعيل درع تبريد العمليات لضمان الاستقرار.`,
          'warning',
          {
            action: {
              label: 'تأكيد التبريد',
              onClick: () => {
                setEcoMode(true);
                showToast('تم تأكيد تفعيل درع التبريد وخفض استهلاك المعالج', 'success');
              }
            },
            duration: 5000
          }
        );
      }
    } else if (cpu < 80) {
      consecutiveCpuHighCountRef.current = 0;
      if (prevCpuHighRef.current) {
        prevCpuHighRef.current = false;
      }
    }

    // 2. RAM Critical Threshold Check:
    // In MikroTik RouterOS Linux kernel, memory buffers typically occupy 75-90% for packet routing.
    // Alert ONLY when memory is genuinely exhausted (Free RAM < 4MB AND RAM > 97% for 4 consecutive checks).
    const trulyLowRam = freeMem > 0 && freeMem < 4 * 1024 * 1024 && ramPercent >= 97;
    if (trulyLowRam) {
      consecutiveRamHighCountRef.current += 1;
      const timeSinceLastAlert = now - lastRamAlertTimeRef.current;
      if (consecutiveRamHighCountRef.current >= 4 && (!prevRamHighRef.current || timeSinceLastAlert > 300000)) {
        lastRamAlertTimeRef.current = now;
        prevRamHighRef.current = true;

        showToast(
          `تنبيه الموارد: استهلاك ذاكرة الراوتر (RAM) وصل إلى ${ramPercent}% (المتبقي ${Math.round(freeMem / 1024 / 1024)}MB). يوصى بتفريغ كاش الـ DNS.`,
          'warning',
          {
            action: {
              label: 'تفريغ كاش DNS',
              onClick: async () => {
                const res = await runCommand('/ip dns cache flush');
                if (res.success) {
                  showToast('تم تفريغ كاش الـ DNS بنجاح لتخفيف الذاكرة RAM', 'success');
                  syncNow(true);
                }
              }
            },
            duration: 5000
          }
        );
      }
    } else if (ramPercent < 88) {
      consecutiveRamHighCountRef.current = 0;
      if (prevRamHighRef.current) {
        prevRamHighRef.current = false;
      }
    }
  }, [isConnected, router?.cpuLoad, router?.freeMemory, router?.totalMemory, ecoMode, setEcoMode, showToast, runCommand, syncNow]);

  const routerIdentity = useMemo<RouterIdentitySummary | null>(() => {
    if (!router) return null;
    return {
      id: router.id,
      name: router.name,
      host: router.host,
      port: router.port,
      username: router.username,
      boardName: router.boardName,
      version: router.version,
      useSsl: router.useSsl
    };
  }, [
    router?.id,
    router?.name,
    router?.host,
    router?.port,
    router?.username,
    router?.boardName,
    router?.version,
    router?.useSsl
  ]);

  const connectionSessionValue = useMemo<ConnectionSessionContextType>(() => ({
    routerIdentity,
    userRole,
    operatorName,
    tlsFingerprint,
    isConnected,
    isConnecting,
    isRestoringSession,
    isSilentReconnecting,
    reconnectAttempts,
    currentActiveTab,
    savedRouters,
    connectionProfiles,
    activeProfileId,
    toast
  }), [
    routerIdentity,
    userRole,
    operatorName,
    tlsFingerprint,
    isConnected,
    isConnecting,
    isRestoringSession,
    isSilentReconnecting,
    reconnectAttempts,
    currentActiveTab,
    savedRouters,
    connectionProfiles,
    activeProfileId,
    toast
  ]);

  const routerTelemetryValue = useMemo<RouterTelemetryContextType>(() => ({
    router,
    interfaces,
    interfaceNames,
    pingStabilizer,
    lastSyncTime,
    lastRealtimePacketTime,
    isRealtimeWsConnected,
    realtimeSyncMode,
    realtimeFrequency,
    activeRealtimeFrequencySec,
    isResourceSaving,
    thermalShieldActive,
    ecoMode,
    isUserIdle,
    autoSync,
    syncFrequency,
    isOptimizingPing,
    isSyncingSystem,
    streamStatus,
    dataPrefetcher,
    backgroundSyncEngine
  }), [
    router,
    interfaces,
    interfaceNames,
    pingStabilizer,
    lastSyncTime,
    lastRealtimePacketTime,
    isRealtimeWsConnected,
    realtimeSyncMode,
    realtimeFrequency,
    activeRealtimeFrequencySec,
    isResourceSaving,
    thermalShieldActive,
    ecoMode,
    isUserIdle,
    autoSync,
    syncFrequency,
    isOptimizingPing,
    isSyncingSystem,
    streamStatus,
    dataPrefetcher,
    backgroundSyncEngine
  ]);

  const subscribersStateValue = useMemo<SubscribersStateContextType>(() => ({
    users,
    profiles,
    activeUsers,
    pppSecrets,
    pppProfiles,
    pppActive,
    usermanUsers,
    usermanProfiles,
    usermanActive,
    selectedUsersForPrint,
    cardTemplate,
    isSyncingHotspot,
    isSyncingPPP
  }), [
    users,
    profiles,
    activeUsers,
    pppSecrets,
    pppProfiles,
    pppActive,
    usermanUsers,
    usermanProfiles,
    usermanActive,
    selectedUsersForPrint,
    cardTemplate,
    isSyncingHotspot,
    isSyncingPPP
  ]);

  const networkStateValue = useMemo<NetworkStateContextType>(() => ({
    simpleQueues,
    ipBindings,
    dhcpLeases,
    firewallRules,
    systemLogs,
    wirelessInterfaces,
    registrationTable,
    neighbors,
    remoteCaps,
    accessPoints,
    hotspotServerProfiles,
    hotspotServers,
    routerFiles,
    scheduledTasks,
    isSyncingNetwork,
    isLoadingWireless,
    isLoadingAntennas,
    isLoadingAccessPoints,
    isLoadingPortalProfiles,
    isLoadingSchedulers
  }), [
    simpleQueues,
    ipBindings,
    dhcpLeases,
    firewallRules,
    systemLogs,
    wirelessInterfaces,
    registrationTable,
    neighbors,
    remoteCaps,
    accessPoints,
    hotspotServerProfiles,
    hotspotServers,
    routerFiles,
    scheduledTasks,
    isSyncingNetwork,
    isLoadingWireless,
    isLoadingAntennas,
    isLoadingAccessPoints,
    isLoadingPortalProfiles,
    isLoadingSchedulers
  ]);

  const mikrotikActionsValue = useMemo<MikroTikActionsContextType>(() => ({
    setAutoSync: handleSetAutoSync,
    setSyncFrequency,
    setEcoMode,
    setCurrentActiveTab,
    setRealtimeSyncMode,
    setRealtimeFrequency,
    triggerRealtimeSync,
    refreshPingStabilizer,
    updatePingStabilizerConfig,
    optimizePingNow,
    toggleQosFastLane,
    previewQosFastLane,
    streamSubscribersByTabPriority,
    setSelectedUsersForPrint,
    setCardTemplate,
    saveRouter,
    deleteSavedRouter,
    saveConnectionProfile,
    deleteConnectionProfile,
    setDefaultConnectionProfile,
    activateConnectionProfile,
    connectToRouter,
    cancelConnecting,
    disconnectRouter,
    syncNow,
    refreshQueues,
    refreshProfiles,
    ...subscriberActions,
    ...networkPortalActions,
    showToast
  }), [
    handleSetAutoSync,
    setSyncFrequency,
    setEcoMode,
    setCurrentActiveTab,
    setRealtimeSyncMode,
    setRealtimeFrequency,
    triggerRealtimeSync,
    refreshPingStabilizer,
    updatePingStabilizerConfig,
    optimizePingNow,
    toggleQosFastLane,
    previewQosFastLane,
    streamSubscribersByTabPriority,
    saveConnectionProfile,
    deleteConnectionProfile,
    setDefaultConnectionProfile,
    activateConnectionProfile,
    disconnectRouter,
    syncNow,
    refreshQueues,
    refreshProfiles,
    subscriberActions,
    networkPortalActions,
    showToast
  ]);

  const contextValue = useMemo(() => ({
    router,
    userRole,
    operatorName,
    tlsFingerprint,
    isConnected,
    isConnecting,
    isRestoringSession,
    isSilentReconnecting,
    reconnectAttempts,
    lastSyncTime,
    autoSync,
    setAutoSync: handleSetAutoSync,
    syncFrequency,
    setSyncFrequency,
    ecoMode,
    setEcoMode,
    thermalShieldActive,
    isUserIdle,
    currentActiveTab,
    setCurrentActiveTab,
    isRealtimeWsConnected,
    realtimeSyncMode,
    setRealtimeSyncMode,
    realtimeFrequency,
    setRealtimeFrequency,
    activeRealtimeFrequencySec,
    isResourceSaving,
    lastRealtimePacketTime,
    triggerRealtimeSync,
    pingStabilizer,
    isOptimizingPing,
    refreshPingStabilizer,
    updatePingStabilizerConfig,
    optimizePingNow,
    toggleQosFastLane,
    previewQosFastLane,
    dataPrefetcher,
    backgroundSyncEngine,
    interfaceNames,
    streamStatus,
    streamSubscribersByTabPriority,
    isSyncingSystem,
    isSyncingHotspot,
    isSyncingPPP,
    isSyncingNetwork,
    users,
    profiles,
    activeUsers,
    interfaces,
    pppSecrets,
    pppProfiles,
    pppActive,
    usermanUsers,
    usermanProfiles,
    usermanActive,
    simpleQueues,
    ipBindings,
    dhcpLeases,
    firewallRules,
    systemLogs,
    wirelessInterfaces,
    registrationTable,
    neighbors,
    remoteCaps,
    accessPoints,
    hotspotServerProfiles,
    hotspotServers,
    routerFiles,
    isLoadingWireless,
    isLoadingAntennas,
    isLoadingAccessPoints,
    isLoadingPortalProfiles,
    selectedUsersForPrint,
    setSelectedUsersForPrint,
    cardTemplate,
    setCardTemplate,
    savedRouters,
    saveRouter,
    deleteSavedRouter,
    connectionProfiles,
    activeProfileId,
    saveConnectionProfile,
    deleteConnectionProfile,
    setDefaultConnectionProfile,
    activateConnectionProfile,
    connectToRouter,
    cancelConnecting,
    disconnectRouter,
    syncNow,
    refreshQueues,
    refreshProfiles,
    scheduledTasks,
    isLoadingSchedulers,
    ...subscriberActions,
    ...networkPortalActions,
    toast,
    showToast
  }), [
    router,
    userRole,
    operatorName,
    tlsFingerprint,
    isConnected,
    isConnecting,
    isRestoringSession,
    isSilentReconnecting,
    reconnectAttempts,
    lastSyncTime,
    autoSync,
    handleSetAutoSync,
    syncFrequency,
    setSyncFrequency,
    ecoMode,
    setEcoMode,
    thermalShieldActive,
    isUserIdle,
    currentActiveTab,
    setCurrentActiveTab,
    isRealtimeWsConnected,
    realtimeSyncMode,
    setRealtimeSyncMode,
    realtimeFrequency,
    setRealtimeFrequency,
    activeRealtimeFrequencySec,
    isResourceSaving,
    lastRealtimePacketTime,
    triggerRealtimeSync,
    pingStabilizer,
    isOptimizingPing,
    refreshPingStabilizer,
    updatePingStabilizerConfig,
    optimizePingNow,
    toggleQosFastLane,
    previewQosFastLane,
    dataPrefetcher,
    isSyncingSystem,
    isSyncingHotspot,
    isSyncingPPP,
    isSyncingNetwork,
    users,
    profiles,
    activeUsers,
    interfaces,
    pppSecrets,
    pppProfiles,
    pppActive,
    usermanUsers,
    usermanProfiles,
    usermanActive,
    simpleQueues,
    ipBindings,
    dhcpLeases,
    firewallRules,
    systemLogs,
    wirelessInterfaces,
    registrationTable,
    neighbors,
    remoteCaps,
    accessPoints,
    hotspotServerProfiles,
    hotspotServers,
    routerFiles,
    isLoadingWireless,
    isLoadingAntennas,
    isLoadingAccessPoints,
    isLoadingPortalProfiles,
    selectedUsersForPrint,
    cardTemplate,
    savedRouters,
    connectionProfiles,
    activeProfileId,
    saveConnectionProfile,
    deleteConnectionProfile,
    setDefaultConnectionProfile,
    activateConnectionProfile,
    syncNow,
    refreshQueues,
    refreshProfiles,
    scheduledTasks,
    isLoadingSchedulers,
    subscriberActions,
    networkPortalActions,
    toast,
    showToast
  ]);

  return (
    <MikroTikActionsContext.Provider value={mikrotikActionsValue}>
      <ConnectionSessionContext.Provider value={connectionSessionValue}>
        <RouterTelemetryContext.Provider value={routerTelemetryValue}>
          <SubscribersStateContext.Provider value={subscribersStateValue}>
            <NetworkStateContext.Provider value={networkStateValue}>
              <MikroTikContext.Provider value={contextValue}>
                {children}
              </MikroTikContext.Provider>
            </NetworkStateContext.Provider>
          </SubscribersStateContext.Provider>
        </RouterTelemetryContext.Provider>
      </ConnectionSessionContext.Provider>
    </MikroTikActionsContext.Provider>
  );
};

export const useConnectionSession = () => {
  const context = useContext(ConnectionSessionContext);
  if (!context) {
    throw new Error('useConnectionSession must be used within a MikroTikProvider');
  }
  return context;
};

export const useRouterTelemetry = () => {
  const context = useContext(RouterTelemetryContext);
  if (!context) {
    throw new Error('useRouterTelemetry must be used within a MikroTikProvider');
  }
  return context;
};

export const useSubscribersState = () => {
  const context = useContext(SubscribersStateContext);
  if (!context) {
    throw new Error('useSubscribersState must be used within a MikroTikProvider');
  }
  return context;
};

export const useNetworkState = () => {
  const context = useContext(NetworkStateContext);
  if (!context) {
    throw new Error('useNetworkState must be used within a MikroTikProvider');
  }
  return context;
};

export const useMikroTikActions = () => {
  const context = useContext(MikroTikActionsContext);
  if (!context) {
    throw new Error('useMikroTikActions must be used within a MikroTikProvider');
  }
  return context;
};

export const useMikroTik = () => {
  const context = useContext(MikroTikContext);
  if (!context) {
    throw new Error('useMikroTik must be used within a MikroTikProvider');
  }
  return context;
};
