import React from 'react';
import deepEqual from 'fast-deep-equal';
import type {
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
  ScheduledTask,
  BackgroundSyncEngineState,
  StreamStatus,
  OperatorRole
} from '../types/mikrotik';

export interface PrefetchedData {
  activeSubscribersCount: number;
  hotspotProfilesCount: number;
  pppProfilesCount: number;
  activePppCount: number;
  lastPrefetchTimestamp: number | null;
}

export interface DataPrefetcher {
  status: 'idle' | 'prefetching' | 'paused' | 'cancelled';
  isPrefetching: boolean;
  prefetchedData: PrefetchedData;
  lastPrefetchTime: Date | null;
  cancelPrefetch: () => void;
  triggerIdlePrefetch: () => Promise<void>;
  isHeavyPage: (tabName: string) => boolean;
  activeHeavyPage: string | null;
}

export interface ToastOptions {
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

export type ShowToastFn = (
  message: string,
  type?: 'success' | 'error' | 'info' | 'warning',
  options?: ToastOptions
) => void;

export type PingStabilizerMode = 'auto' | 'aggressive' | 'balanced' | 'off';
export type PingStabilizerState = 'optimal' | 'elevated' | 'stabilizing' | 'critical';

export interface PingStabilizerSnapshot {
  mode: PingStabilizerMode;
  state: PingStabilizerState;
  targetPingMs: number;
  maxCpuThreshold: number;
  autoQosEnabled: boolean;
  currentPingMs: number;
  ewmaPingMs: number;
  minPingMs: number;
  maxPingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  cpuLoad: number;
  cpuTemp: number;
  samplesCount: number;
  recommendedMaxConcurrent: number;
  recommendedPacingMs: number;
  recommendedWsIntervalMs: number;
  recommendedSyncIntervalSec: number;
  suppressHeavyTelemetry: boolean;
  qosFastLane: {
    active: boolean;
    mangleRulesCount: number;
    queueRulesCount: number;
    fastLanePackets: number;
    fastLaneBytes: number;
    prioritizeManagementApi: boolean;
    checkedAt: number | null;
  };
  recentActions: Array<{
    id: string;
    timestamp: number;
    state: PingStabilizerState;
    message: string;
  }>;
  history: Array<{
    timestamp: number;
    pingMs: number;
    ewmaPingMs: number;
    jitterMs: number;
    cpuLoad: number;
    packetLoss: number;
  }>;
  updatedAt: number;
}

export interface MikroTikContextType {
  router: RouterConnection | null;
  userRole: OperatorRole;
  operatorName: string;
  tlsFingerprint: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  isSilentReconnecting: boolean;
  reconnectAttempts: number;
  lastSyncTime: Date | null;
  autoSync: boolean;
  setAutoSync: (val: boolean) => void;
  syncFrequency: number;
  setSyncFrequency: (sec: number) => void;
  ecoMode: boolean;
  setEcoMode: (val: boolean) => void;
  thermalShieldActive: boolean;
  isUserIdle: boolean;
  currentActiveTab: string;
  setCurrentActiveTab: (tab: string) => void;

  // Real-Time Auto-Synchronization & Variable-Frequency Polling Engine
  isRealtimeWsConnected: boolean;
  realtimeSyncMode: 'websocket' | 'smart_polling' | 'hybrid' | 'paused';
  setRealtimeSyncMode: (mode: 'websocket' | 'smart_polling' | 'hybrid' | 'paused') => void;
  realtimeFrequency: number | 'auto';
  setRealtimeFrequency: (freq: number | 'auto') => void;
  activeRealtimeFrequencySec: number;
  isResourceSaving: boolean;
  lastRealtimePacketTime: number;
  triggerRealtimeSync: (force?: boolean) => void;

  // Auto-Ping & CPU Stabilizer Engine
  pingStabilizer: PingStabilizerSnapshot | null;
  isOptimizingPing: boolean;
  refreshPingStabilizer: (refreshQos?: boolean) => Promise<void>;
  updatePingStabilizerConfig: (config: {
    mode?: PingStabilizerMode;
    targetPingMs?: number;
    maxCpuThreshold?: number;
    autoQosEnabled?: boolean;
    resetStats?: boolean;
  }) => Promise<{ success: boolean; message?: string }>;
  optimizePingNow: (options?: {
    target?: string;
    count?: number;
    applyQos?: boolean;
  }) => Promise<{ success: boolean; message?: string; probe?: any }>;
  toggleQosFastLane: (
    enable: boolean,
    prioritizeManagementApi?: boolean
  ) => Promise<{ success: boolean; message?: string }>;

  // Data Prefetcher
  dataPrefetcher: DataPrefetcher;

  // Background Synchronization Engine
  backgroundSyncEngine: {
    state: BackgroundSyncEngineState;
    start: (customIntervalMs?: number) => void;
    stop: () => void;
    syncNow: () => Promise<void>;
    adjustInterval: (ms: number) => void;
  };
  interfaceNames: string[];

  // Chunked Stream Processing & Stream Status
  streamStatus: StreamStatus;
  streamSubscribersByTabPriority: (activeTab: string, force?: boolean) => Promise<void>;

  // Section loading states
  isSyncingSystem: boolean;
  isSyncingHotspot: boolean;
  isSyncingPPP: boolean;
  isSyncingNetwork: boolean;

  // Data
  users: HotspotUser[];
  profiles: HotspotProfile[];
  activeUsers: ActiveHotspotUser[];
  interfaces: NetworkInterface[];
  pppSecrets: PPPSecret[];
  pppProfiles: PPPProfile[];
  pppActive: PPPActive[];
  usermanUsers: UsermanUser[];
  usermanProfiles: UsermanProfile[];
  usermanActive: UsermanActive[];
  simpleQueues: SimpleQueue[];
  ipBindings: HotspotIpBinding[];
  dhcpLeases: DhcpLease[];
  firewallRules: FirewallRule[];
  systemLogs: SystemLogEntry[];

  // Wireless & Network Antennas & Hotspot Portal
  wirelessInterfaces: WirelessInterface[];
  registrationTable: WirelessClientStation[];
  neighbors: NeighborAntenna[];
  remoteCaps: any[];
  accessPoints: AccessPointItem[];
  hotspotServerProfiles: HotspotServerProfile[];
  hotspotServers: HotspotServerInstance[];
  routerFiles: RouterStorageFile[];
  isLoadingWireless: boolean;
  isLoadingAntennas: boolean;
  isLoadingAccessPoints: boolean;
  isLoadingPortalProfiles: boolean;

  // Card Studio & Print state
  selectedUsersForPrint: HotspotUser[];
  setSelectedUsersForPrint: (users: HotspotUser[]) => void;
  cardTemplate: CardTemplateConfig;
  setCardTemplate: React.Dispatch<React.SetStateAction<CardTemplateConfig>>;

  // Saved Routers
  savedRouters: RouterConnection[];
  saveRouter: (r: RouterConnection) => void;
  deleteSavedRouter: (id: string) => void;

  // Router Connection Profiles
  connectionProfiles: RouterConnectionProfile[];
  activeProfileId: string | null;
  saveConnectionProfile: (profile: Partial<RouterConnectionProfile> & { name: string; host: string }) => RouterConnectionProfile;
  deleteConnectionProfile: (id: string) => void;
  setDefaultConnectionProfile: (id: string) => void;
  activateConnectionProfile: (id: string, overridePassword?: string) => Promise<{ success: boolean; message: string; needPassword?: boolean }>;

  // Actions
  connectToRouter: (config: Partial<RouterConnection>) => Promise<{ success: boolean; message: string; router?: RouterConnection; suggestion?: string; rawError?: string; reasonType?: string }>;
  cancelConnecting: () => void;
  disconnectRouter: () => void;
  syncNow: (force?: boolean) => Promise<void>;
  refreshQueues: () => Promise<void>;
  refreshProfiles: (systemType?: 'hotspot' | 'pppoe' | 'userman') => Promise<void>;

  // Hotspot User Actions
  addUser: (user: Partial<HotspotUser>) => Promise<{ success: boolean; message: string }>;
  updateUser: (id: string, updates: Partial<HotspotUser>, skipSync?: boolean) => Promise<{ success: boolean; message: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; message: string }>;
  batchDeleteUsers: (ids: string[]) => Promise<{ success: boolean; message: string }>;
  batchSubscriberAction: (params: {
    system: 'hotspot' | 'pppoe' | 'userman';
    action: 'delete' | 'change_profile' | 'renew' | 'toggle_status' | 'disconnect' | 'edit';
    ids: string[];
    payload?: any;
  }) => Promise<{ success: boolean; message: string; count?: number }>;
  generateVoucherBatch: (params: any) => Promise<{ success: boolean; message: string; batchId?: string; users?: HotspotUser[] }>;

  // Profile Actions
  addProfile: (profile: Partial<HotspotProfile>) => Promise<{ success: boolean; message: string }>;
  updateProfile: (id: string, updates: Partial<HotspotProfile>) => Promise<{ success: boolean; message: string }>;
  deleteProfile: (id: string) => Promise<{ success: boolean; message: string }>;

  // Active session actions
  kickUser: (id: string, username: string, skipSync?: boolean) => Promise<{ success: boolean; message: string }>;

  // PPP Actions
  addPPPSecret: (secret: Partial<PPPSecret>) => Promise<{ success: boolean; message: string }>;
  updatePPPSecret: (id: string, updates: Partial<PPPSecret>, skipSync?: boolean) => Promise<{ success: boolean; message: string }>;
  deletePPPSecret: (id: string, skipSync?: boolean) => Promise<{ success: boolean; message: string }>;
  batchDeletePPPSecrets: (ids: string[]) => Promise<{ success: boolean; message: string }>;
  addPPPProfile: (profile: Partial<PPPProfile>) => Promise<{ success: boolean; message: string }>;
  updatePPPProfile: (id: string, updates: Partial<PPPProfile>) => Promise<{ success: boolean; message: string }>;
  deletePPPProfile: (id: string) => Promise<{ success: boolean; message: string }>;
  disconnectPPPActive: (id: string, username: string, skipSync?: boolean) => Promise<{ success: boolean; message: string }>;

  // User Manager Actions
  addUsermanUser: (user: Partial<UsermanUser>) => Promise<{ success: boolean; message: string }>;
  updateUsermanUser: (id: string, updates: Partial<UsermanUser>, skipSync?: boolean) => Promise<{ success: boolean; message: string }>;
  deleteUsermanUser: (id: string) => Promise<{ success: boolean; message: string }>;
  batchDeleteUsermanUsers: (ids: string[]) => Promise<{ success: boolean; message: string }>;
  addUsermanProfile: (profile: Partial<UsermanProfile>) => Promise<{ success: boolean; message: string }>;
  updateUsermanProfile: (id: string, updates: Partial<UsermanProfile>) => Promise<{ success: boolean; message: string }>;
  deleteUsermanProfile: (id: string) => Promise<{ success: boolean; message: string }>;
  disconnectUsermanActive: (id: string, username: string, skipSync?: boolean, nasIp?: string) => Promise<{ success: boolean; message: string }>;

  // Wireless & Network Antennas Actions
  fetchWirelessData: () => Promise<void>;
  updateWirelessInterface: (id: string, updates: Partial<WirelessInterface>) => Promise<{ success: boolean; message: string }>;
  toggleWirelessInterface: (id: string, disabled: boolean, name?: string) => Promise<{ success: boolean; message: string }>;
  createVirtualAp: (data: {
    masterInterface: string;
    name?: string;
    ssid: string;
    securityProfile?: string;
    disabled?: boolean;
    comment?: string;
    hideSsid?: boolean;
  }) => Promise<{ success: boolean; message: string }>;
  fetchAntennasData: () => Promise<void>;
  fetchAccessPointsData: () => Promise<void>;
  updateAccessPointComment: (data: { macAddress?: string; ipAddress?: string; iface?: string; comment: string }) => Promise<{ success: boolean; message: string }>;
  kickWirelessClient: (id: string, mac: string) => Promise<{ success: boolean; message: string }>;
  pingHost: (address: string, count?: number) => Promise<{ success: boolean; data?: any; message?: string }>;
  deleteRouterFile: (name: string, id?: string) => Promise<{ success: boolean; message: string }>;

  // Hotspot Portal Profiles & Storage Files Actions
  fetchHotspotServerProfiles: () => Promise<void>;
  updateHotspotServerProfile: (id: string, updates: Partial<HotspotServerProfile>) => Promise<{ success: boolean; message: string }>;
  createHotspotServerProfile: (profile: Partial<HotspotServerProfile>) => Promise<{ success: boolean; message: string }>;
  applyLoginPageTemplate: (profileId: string, folderName: string, dnsName?: string) => Promise<{ success: boolean; message: string }>;
  deployHotspotPortal: (deployData: {
    profileId?: string;
    profileName?: string;
    folderName: string;
    dnsName?: string;
    files: Record<string, string>;
    config?: any;
  }) => Promise<{ success: boolean; message: string }>;
  getHotspotPortalConfig: (folderName: string) => Promise<{ success: boolean; config?: any; message?: string }>;
  readRouterFile: (path: string) => Promise<{ success: boolean; data?: string; content?: string; message?: string }>;
  writeRouterFile: (path: string, content: string) => Promise<{ success: boolean; message?: string }>;
  detectHotspotPath: () => Promise<{ success: boolean; path?: string; message?: string }>;
  listRouterDirectory: (path: string) => Promise<{ success: boolean; files?: Array<{ name: string; isDirectory: boolean; size?: number; modified?: string }>; message?: string }>;
  readAllPortalFiles: (folder?: string) => Promise<{ success: boolean; files?: Record<string, string>; message?: string }>;
  deployPortalFiles: (params: {
    targetFolder: string;
    files: Record<string, string>;
    mode: 'full' | 'incremental';
    modifiedFiles?: string[];
    updateProfile?: boolean;
    profileName?: string;
    dnsName?: string;
  }) => Promise<{ success: boolean; message?: string; deployedFiles?: string[]; profileUpdated?: boolean }>;
  validatePortalFile: (content: string, fileName: string) => Promise<{
    success: boolean;
    validation?: { isValid: boolean; errors: any[]; warnings: any[]; info: any[] };
    security?: { isSafe: boolean; issues: any[]; severity: string };
  }>;

  // Queues Actions
  addQueue: (q: Partial<SimpleQueue>) => Promise<{ success: boolean; message: string }>;
  updateQueue: (id: string, q: Partial<SimpleQueue>) => Promise<{ success: boolean; message: string }>;
  deleteQueue: (id: string) => Promise<{ success: boolean; message: string }>;
  batchDeleteQueues: (ids: string[]) => Promise<{ success: boolean; message: string }>;
  batchToggleQueues: (ids: string[], disabled: boolean) => Promise<{ success: boolean; message: string }>;

  // IP Bindings
  addIpBinding: (b: Partial<HotspotIpBinding>) => Promise<{ success: boolean; message: string }>;
  deleteIpBinding: (id: string) => Promise<{ success: boolean; message: string }>;
  batchDeleteIpBindings: (ids: string[]) => Promise<{ success: boolean; message: string }>;

  // DHCP Leases
  addDhcpLease: (l: Partial<DhcpLease>) => Promise<{ success: boolean; message: string }>;
  makeStaticDhcpLeases: (ids: string[]) => Promise<{ success: boolean; message: string }>;
  deleteDhcpLease: (id: string) => Promise<{ success: boolean; message: string }>;
  batchDeleteDhcpLeases: (ids: string[]) => Promise<{ success: boolean; message: string }>;

  // Firewall
  applyQuickHarden: () => Promise<{ success: boolean; message: string }>;

  // System
  rebootRouter: () => Promise<{ success: boolean; message: string }>;

  // Scheduled Tasks (/system/scheduler)
  scheduledTasks: ScheduledTask[];
  isLoadingSchedulers: boolean;
  fetchScheduledTasks: () => Promise<void>;
  addScheduledTask: (task: Partial<ScheduledTask>) => Promise<{ success: boolean; message: string }>;
  updateScheduledTask: (id: string, updates: Partial<ScheduledTask>) => Promise<{ success: boolean; message: string }>;
  deleteScheduledTask: (id: string) => Promise<{ success: boolean; message: string }>;
  runScheduledTask: (id: string) => Promise<{ success: boolean; message: string }>;
  toggleScheduledTask: (id: string, disabled: boolean) => Promise<{ success: boolean; message: string }>;
  batchDeleteScheduledTasks: (ids: string[]) => Promise<{ success: boolean; message: string }>;
  batchToggleScheduledTasks: (ids: string[], disabled: boolean) => Promise<{ success: boolean; message: string }>;

  // Anti-Sharing & Anti-Tethering Engine v4.0
  fetchAntiSharingStatus: () => Promise<any>;
  applyAntiSharing: (params?: { lanInterface?: string; createBackup?: boolean }) => Promise<any>;
  revertAntiSharing: () => Promise<any>;

  // Command & Terminal
  runCommand: (cmd: string) => Promise<{ success: boolean; output: string }>;

  // Notification Toast
  toast: {
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    action?: {
      label: string;
      onClick: () => void;
    };
    duration?: number;
  } | null;
  showToast: ShowToastFn;
}

export const defaultTemplate: CardTemplateConfig = {
  id: 'tmpl-default',
  title: 'شبكة الإنترنت السريعة',
  subtitle: 'High-Speed Wi-Fi Hotspot',
  theme: 'modern-blue',
  showQr: true,
  showLogo: true,
  showPrice: true,
  showInstructions: true,
  showValidity: true,
  showSerial: true,
  showLimits: true,
  currency: 'ر.س',
  hotspotLoginUrl: 'http://hotspot.lan/login',
  customNotes: 'سجل دخولك واستمتع بأقصى سرعة إنترنت واستقرار عالي',
  cardsPerRow: 3
};

export const DEFAULT_SCHEDULED_TASKS: ScheduledTask[] = [
  {
    id: '*1',
    name: 'Daily-Reboot-04AM',
    startTime: '04:00:00',
    interval: '1d',
    onEvent: '/system reboot',
    disabled: false,
    runCount: 19,
    nextRun: 'غداً 04:00:00',
    comment: 'إعادة تشغيل يومي مجدولة في الرابعة فجراً لتفريغ الذاكرة وتجديد استقرار الاتصال',
    policy: 'reboot,read,write,policy,test'
  },
  {
    id: '*2',
    name: 'Auto-Backup-Daily',
    startTime: '03:30:00',
    interval: '1d',
    onEvent: '/system backup save name=("daily-backup-" . [:pick [/system clock get date] 7 11] . [:pick [/system clock get date] 0 3] . [:pick [/system clock get date] 4 6])',
    disabled: false,
    runCount: 25,
    nextRun: 'غداً 03:30:00',
    comment: 'نسخ احتياطي يومي تلقائي لملفات إعدادات النظام وقاعدة بيانات الراوتر',
    policy: 'read,write,policy,test'
  },
  {
    id: '*3',
    name: 'Clean-Expired-Hotspot-Users',
    startTime: '05:00:00',
    interval: '1d',
    onEvent: ':foreach u in=[/ip hotspot user find where uptime>=limit-uptime and limit-uptime!=0s] do={/ip hotspot user remove $u}',
    disabled: false,
    runCount: 32,
    nextRun: 'غداً 05:00:00',
    comment: 'حذف كروت ومشتركي الهوتسبوت المنتهية تلقائياً لتخفيف العبء على السيرفر',
    policy: 'read,write,policy,test'
  },
  {
    id: '*4',
    name: 'Flush-DNS-Cache-6H',
    startTime: '00:00:00',
    interval: '06:00:00',
    onEvent: '/ip dns cache flush',
    disabled: false,
    runCount: 148,
    nextRun: 'بعد 6 ساعات',
    comment: 'تفريغ دوري لذاكرة التخزين المؤقت للـ DNS لتسريع التصفح وحل أخطاء النطاقات',
    policy: 'read,write,test'
  },
  {
    id: '*5',
    name: 'Export-Config-RSC-Weekly',
    startTime: '02:00:00',
    interval: '7d',
    onEvent: '/export file=("weekly-config-" . [:pick [/system clock get date] 7 11])',
    disabled: true,
    runCount: 4,
    nextRun: 'متوقف مؤقتاً',
    comment: 'تصدير نصي أسبوعي لملفات الإعدادات بصيغة .rsc',
    policy: 'read,write,policy,test'
  }
];

export function safeSet<T>(setter: React.Dispatch<React.SetStateAction<T>>, newData: T) {
  setter((prev: T) => {
    if (prev === newData) return prev;
    if (!prev || !newData) return newData;
    if (Array.isArray(prev) && Array.isArray(newData)) {
      if (prev.length !== newData.length) return newData;
      if (prev.length === 0 && newData.length === 0) return prev;

      const len = prev.length;
      let hasChanged = false;
      const sampleStep = len > 150 ? Math.floor(len / 15) : 1;
      for (let i = 0; i < len; i += sampleStep) {
        const p = prev[i] as any;
        const n = newData[i] as any;
        if (!p || !n) {
          hasChanged = true;
          break;
        }
        if (
          p.id !== n.id ||
          p['.id'] !== n['.id'] ||
          p.user !== n.user ||
          p.name !== n.name ||
          p.address !== n.address ||
          p.macAddress !== n.macAddress ||
          p.callerId !== n.callerId ||
          p.uptime !== n.uptime ||
          p.bytesIn !== n.bytesIn ||
          p.bytesOut !== n.bytesOut ||
          p.disabled !== n.disabled ||
          p.status !== n.status ||
          p.profile !== n.profile ||
          p.limitUptime !== n.limitUptime ||
          p.limitBytesTotal !== n.limitBytesTotal ||
          p.comment !== n.comment
        ) {
          hasChanged = true;
          break;
        }
      }
      if (!hasChanged) return prev;
      return newData;
    }
    return deepEqual(prev, newData) ? prev : newData;
  });
}
