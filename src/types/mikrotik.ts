export type OperatorRole = 'admin' | 'cashier' | 'viewer';

export interface RouterConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  useSsl: boolean;
  strictTls?: boolean;
  tlsFingerprint?: string;
  operatorUsername?: string;
  operatorPassword?: string;
  version: string;
  majorVersion?: number;
  boardName: string;
  uptime: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  pingMs: number;
  hasInternet?: boolean;
  gateway?: string;
  wanIp?: string;
  connectedAt: string;
  isSaved?: boolean;
  cpuTemperature?: number;
  boardTemperature?: number;
  ecoMode?: boolean;
  profileId?: string;
}

export type RouterProfileCategory = 'home' | 'office' | 'branch' | 'datacenter' | 'custom';

export interface RouterConnectionProfile {
  id: string;
  name: string; // e.g., 'المنزل', 'المكتب الرئيسي', 'فرع المنصور'
  category: RouterProfileCategory;
  host: string;
  port: number;
  username: string;
  password?: string; // Stored if user opted in to remember password for 1-click connect
  useSsl: boolean;
  notes?: string;
  isDefault?: boolean;
  lastConnectedAt?: string;
  createdAt: string;
  color?: string; // Badge accent color
  icon?: string;
}

export interface HotspotUser {
  id: string;
  name: string;
  password?: string;
  profile: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  limitUptime?: string;
  limitBytesTotal?: number;
  comment?: string;
  disabled: boolean;
  email?: string;
  macAddress?: string;
  createdAt: string;
  price?: number;
  isVoucher?: boolean;
  batchId?: string;
  lastLoggedOut?: string;
  lastLoggedIn?: string;
}

export interface HotspotProfile {
  id: string;
  name: string;
  rateLimit: string; // e.g. "1M/4M" (rx/tx) or full burst format
  sharedUsers: number;
  sessionTimeout?: string;
  idleTimeout?: string;
  keepaliveTimeout?: string;
  statusAutorefresh?: string;
  addressPool?: string;
  transparentProxy?: boolean;
  openStatusPage?: 'always' | 'http-login';
  advertise?: boolean;
  advertiseUrl?: string;
  advertiseInterval?: string;
  advertiseTimeout?: string;
  parentQueue?: string;
  queueType?: string;
  insertQueueBefore?: string;
  macCookieTimeout?: string;
  incomingFilter?: string;
  outgoingFilter?: string;
  addressList?: string;
  onLoginScript?: string;
  onLogoutScript?: string;
  validityDays?: number;
  validity?: string;
  price?: number;
  dataQuotaMb?: number;
  startsAt?: 'first-login' | 'at-creation' | 'now';
}

export interface ActiveHotspotUser {
  id: string;
  user: string;
  address: string;
  macAddress: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  loginBy: string;
  idleTime: string;
  rxRateBps?: number;
  txRateBps?: number;
  totalRateBps?: number;
  spikeReason?: string;
  isSpike?: boolean;
}

export interface NetworkInterface {
  id: string;
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  rxBps: number;
  txBps: number;
  rxBytes: number;
  txBytes: number;
  comment?: string;
}

export interface PPPSecret {
  id: string;
  name: string;
  password?: string;
  service: string;
  profile: string;
  localAddress?: string;
  remoteAddress?: string;
  callerId?: string;
  limitUptime?: string;
  limitBytesTotal?: number;
  comment?: string;
  disabled: boolean;
  lastLoggedOut?: string;
  lastLoggedIn?: string;
  lastCallerId?: string;
}

export interface PPPProfile {
  id: string;
  name: string;
  localAddress?: string;
  remoteAddress?: string;
  remoteIpv6PrefixPool?: string;
  bridge?: string;
  bridgeHorizon?: string;
  rateLimit?: string;
  parentQueue?: string;
  queueType?: string;
  dnsServer?: string;
  winsServer?: string;
  onlyOne?: 'default' | 'yes' | 'no' | boolean;
  sharedUsers?: number;
  useIpv6?: 'default' | 'yes' | 'no' | 'required';
  useMpls?: 'default' | 'yes' | 'no' | 'required';
  useCompression?: 'default' | 'yes' | 'no';
  useEncryption?: 'default' | 'yes' | 'no' | 'required';
  sessionTimeout?: string;
  idleTimeout?: string;
  onUpScript?: string;
  onDownScript?: string;
  addressList?: string;
  price?: number;
  validityDays?: number;
  validity?: string;
  dataQuotaMb?: number;
  startsAt?: 'first-login' | 'at-creation' | 'now';
}

export type SystemType = 'hotspot' | 'pppoe' | 'userman';

export interface UsermanUser {
  id: string;
  name: string;
  password?: string;
  customer: string; // e.g. "admin"
  profile: string;
  sharedUsers: number;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  validity?: string;
  limitUptime?: string;
  limitBytesTotal?: number;
  state: 'active' | 'expired' | 'disabled' | 'used_up';
  disabled?: boolean;
  createdAt: string;
  price?: number;
  credit?: number;
  comment?: string;
  isVoucher?: boolean;
  batchId?: string;
  lastLoggedOut?: string;
  lastLoggedIn?: string;
  lastSeen?: string;
}

export interface UsermanProfile {
  id: string;
  name: string;
  nameForUsers?: string;
  owner: string;
  price: number;
  validity: string; // e.g. "30d" or "1d"
  overrideSharedUsers: number | string;
  sharedUsers?: number | string;
  rateLimit: string; // e.g. "2M/8M"
  rateLimitMin?: string;
  dataQuotaMb?: number;
  downloadLimitMb?: number;
  uploadLimitMb?: number;
  transferLimitMb?: number;
  transferLimit?: number;
  downloadLimit?: number;
  uploadLimit?: number;
  timeLimit?: string;
  uptimeLimit?: string;
  startsAt: 'first-auth' | 'at-creation' | 'now';
  fromTime?: string;
  tillTime?: string;
  weekdays?: string;
  limitationName?: string;
}

export interface UsermanActive {
  id: string;
  user: string;
  nasIp: string;
  assignedIp: string;
  callerId: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  sessionTimeout?: string;
}

export interface PPPActive {
  id: string;
  name: string;
  service: string;
  callerId: string;
  address: string;
  uptime: string;
  encoding?: string;
  bytesIn?: number;
  bytesOut?: number;
  idleTime?: string;
}

export interface SimpleQueue {
  id: string;
  name: string;
  target: string;
  maxLimit: string;
  limitAt: string;
  bytes: string;
  bytesIn?: number;
  bytesOut?: number;
  bytesTotal?: number;
  packets: string;
  disabled: boolean;
  priority: string;
  burstLimit?: string;
  burstThreshold?: string;
  burstTime?: string;
  parent?: string;
  queue?: string;
  comment?: string;
}

export interface VoucherBatch {
  batchId: string;
  name: string;
  profileName: string;
  systemType?: SystemType;
  count: number;
  prefix: string;
  userLength: number;
  passwordLength: number;
  sameUserPass: boolean;
  charType: 'numbers' | 'letters' | 'mixed' | 'uppercase_pin';
  uptimeLimit: string;
  dataQuotaMb: number;
  pricePerCard: number;
  createdAt: string;
  comment: string;
}

export interface CardTemplateConfig {
  id: string;
  title: string;
  subtitle: string;
  theme: 'modern-blue' | 'emerald-gold' | 'cyber-purple' | 'classic-clean' | 'thermal-receipt';
  showQr: boolean;
  showLogo: boolean;
  showPrice: boolean;
  showInstructions: boolean;
  showValidity: boolean;
  showSerial: boolean;
  showLimits: boolean;
  currency: string;
  hotspotLoginUrl: string;
  customNotes: string;
  cardsPerRow: 2 | 3 | 4 | 1;
}

export interface HotspotIpBinding {
  id: string;
  macAddress: string;
  address?: string;
  toAddress?: string;
  server?: string;
  type: 'bypassed' | 'regular' | 'blocked';
  comment?: string;
  disabled: boolean;
}

export interface DhcpLease {
  id: string;
  address: string;
  macAddress: string;
  hostName?: string;
  server: string;
  status: 'bound' | 'waiting' | 'offered';
  expiresAfter?: string;
  isDynamic: boolean;
  comment?: string;
  disabled: boolean;
}

export interface FirewallRule {
  id: string;
  chain: 'input' | 'forward' | 'output' | 'srcnat' | 'dstnat';
  action: 'accept' | 'drop' | 'reject' | 'fasttrack-connection' | 'masquerade' | 'dst-nat';
  protocol?: string;
  srcAddress?: string;
  dstAddress?: string;
  dstPort?: string;
  inInterface?: string;
  outInterface?: string;
  comment?: string;
  bytes: number;
  packets: number;
  disabled: boolean;
}

export interface SystemLogEntry {
  id: string;
  time: string;
  topics: string; // e.g. "hotspot,info", "system,info", "firewall,warning"
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface BackgroundSyncEngineState {
  isRunning: boolean;
  status: 'idle' | 'syncing' | 'paused' | 'error';
  lastSyncTimestamp: number | null;
  lastSyncTime?: Date | null;
  intervalMs: number;
  syncCount: number;
  error?: string;
  totalSyncCycles?: number;
  interfaceNames?: string[];
  stats?: {
    logsCount: number;
    interfacesCount: number;
    activeInterfacesCount: number;
    criticalLogsCount: number;
    warningLogsCount: number;
    infoCount: number;
  };
}

export interface StreamStatus {
  isStreaming: boolean;
  domain: string;
  chunkIndex: number;
  totalChunks: number;
  receivedItems: number;
  totalItems: number;
  progressPercent: number;
}

export interface WirelessInterface {
  id: string;
  name: string;
  ssid: string;
  band?: string;
  frequency?: string | number;
  channelWidth?: string;
  mode?: string;
  securityProfile?: string;
  txPower?: string;
  hideSsid?: boolean;
  disabled: boolean;
  running: boolean;
  macAddress?: string;
  radioName?: string;
  comment?: string;
  noiseFloor?: string;
  clientsCount?: number;
}

export interface WirelessClientStation {
  id: string;
  interface: string;
  macAddress: string;
  signalStrength: string; // e.g. -65dBm
  signalStrengthCh0?: string;
  signalStrengthCh1?: string;
  signalToNoise?: string; // SNR
  txRate?: string;
  rxRate?: string;
  uptime: string;
  lastActivity?: string;
  ccq?: string; // e.g. 95%
  distance?: string;
  comment?: string;
  routerOs?: boolean;
}

export interface ScannedNetwork {
  id?: string;
  bssid: string;
  ssid: string;
  channel: string;
  frequency: number;
  signal: number; // RSSI in dBm
  noiseFloor?: number; // dBm
  snr?: number; // dB
  radioName?: string;
  routeros?: boolean;
  privacy?: boolean;
}

export interface ChannelInterferenceMetric {
  channelNumber: number;
  frequency: number;
  band: '2ghz' | '5ghz';
  interferenceScore: number; // 0-100 (0 = cleanest, 100 = heavily congested)
  usagePercent: number; // 0-100
  noiseFloor: number; // dBm
  peakSignal?: number; // dBm e.g. -58 (strongest competing AP signal) or -105 if clean
  apCount: number;
  adjacentApCount?: number;
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  isNonOverlapping?: boolean; // e.g. 1, 6, 11 for 2.4GHz
  isDfs?: boolean;
  recommendation: string;
}

export interface WirelessScanResult {
  success: boolean;
  interfaceName: string;
  band: '2ghz' | '5ghz' | 'all';
  durationSeconds: number;
  timestamp: string;
  networksCount?: number;
  networks: ScannedNetwork[];
  channels: ChannelInterferenceMetric[];
  bestChannel: {
    channelNumber: number;
    frequency: number;
    reason: string;
    score: number;
  };
}

export interface NeighborAntenna {
  id: string;
  interface: string;
  address: string;
  macAddress: string;
  identity: string;
  platform: string; // MikroTik, Ubiquiti, TP-Link, etc.
  board: string; // e.g. "RB951G-2HnD", "LiteBeam 5AC", "Rocket M5"
  version?: string;
  uptime?: string;
  age?: string;
  ssid?: string;
}

export interface AccessPointItem {
  id: string;
  name: string; // AP Identity / Custom Name / Hostname
  vendor: string; // Ubiquiti, TP-Link, MikroTik, Cambium, Ruijie, etc.
  model: string;
  board?: string;
  platform?: string;
  ssid?: string;
  ipAddress?: string;
  macAddress?: string;
  interface: string; // e.g. ether2, ether3, wlan1
  source: 'neighbor' | 'capsman' | 'dhcp' | 'wireless_card' | 'ip_binding' | 'manual';
  status: 'online' | 'offline' | 'unknown';
  disabled?: boolean;
  uptime?: string;
  version?: string;
  signalStrength?: string;
  clientsCount?: number;
  comment?: string;
  webUrl?: string;
  isBypassed?: boolean;
}

export interface HotspotServerProfile {
  id: string;
  name: string;
  hotspotAddress?: string;
  dnsName?: string;
  htmlDirectory: string;
  htmlDirectoryOverride?: string;
  loginBy: string[]; // ['http-chap', 'http-pap', 'mac', 'cookie', 'https', 'trial', 'mac-cookie']
  sslCertificate?: string;
  https?: boolean;
  httpCookieLifetime?: string;
  trialUptimeLimit?: string;
  trialUptimeReset?: string;
  rateLimit?: string;
  useRadius?: boolean;
  smtpServer?: string;
  splitUserDomain?: boolean;
}

export interface HotspotServerInstance {
  id: string;
  name: string;
  interface: string;
  addressPool?: string;
  profile: string;
  disabled: boolean;
  ipAddress?: string;
}

export interface RouterStorageFile {
  id: string;
  name: string;
  type: string;
  size: number;
  creationTime?: string;
  isFolder: boolean;
}

export interface PricingPlanItem {
  id: string;
  name: string;
  price: string;
  duration: string;
  dataLimit: string;
  speed: string;
  highlight?: boolean;
}

export interface IPPool {
  id: string;
  name: string;
  ranges: string;
  nextPool?: string;
  totalIps?: number;
  usedCount?: number;
  comment?: string;
}

export interface HotspotPortalCustomization {
  id?: string;
  networkName?: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  logoType: 'icon' | 'image' | 'text';
  logoIcon: string;
  logoImageUrl: string;
  themePreset?: 'cyber-indigo' | 'emerald-luxury' | 'sunset-orange' | 'royal-gold' | 'neon-matrix' | 'ocean-blue' | 'clean-light';
  theme?: 'cyber-indigo' | 'emerald-luxury' | 'sunset-orange' | 'royal-gold' | 'neon-matrix' | 'ocean-blue' | 'clean-light';
  primaryColor: string;
  accentColor?: string;
  secondaryColor?: string;
  bgType: 'gradient' | 'mesh' | 'particles' | 'image' | 'dark-minimal';
  bgImageUrl: string;
  glassOpacity: number;
  borderRadius: 'rounded-xl' | 'rounded-2xl' | 'rounded-3xl';
  // Visibility & Element Controls
  showLogo?: boolean;
  showNetworkTitle?: boolean;
  showSubtitle?: boolean;
  showSupportSection?: boolean;
  showLocation?: boolean;
  showFooter?: boolean;
  showSpeedTest?: boolean;
  // Announcements & Promo Banners
  showMarqueeNews: boolean;
  marqueeNewsText: string;
  showPromoBanner: boolean;
  promoBadge?: string;
  promoImage?: string;
  promoTitle: string;
  promoDesc: string;
  promoButtonText: string;
  promoButtonLink: string;
  showAlertNotice: boolean;
  alertNoticeText: string;
  // Pricing Showcase
  showPricingPlans: boolean;
  pricingPlans?: PricingPlanItem[];
  selectedPlans?: PricingPlanItem[];
  // Support & Contact
  supportWhatsapp: string;
  supportPhone: string;
  supportTelegram: string;
  supportLocation?: string;
  networkLocation?: string;
  supportWebsite?: string;
  footerText: string;
  // Login Options
  loginStyle: 'card-pin-only' | 'pin-only' | 'user-pass' | 'dual-mode';
  showFreeTrial: boolean;
  trialButtonText: string;
  showQrLogin: boolean;
  showRememberMe: boolean;
  pinPasswordType?: 'same' | 'empty';
  targetHtmlDir: string;
  targetDnsName: string;
  targetProfileName: string;
}

export interface PingPacketDetail {
  seq: number;
  host?: string;
  sent?: string;
  size: string;
  ttl: string;
  time: string;
  status: string;
}

export interface PingResult {
  target: string;
  sent: number;
  received: number;
  packetLoss: number;
  minTime: number;
  avgTime: number;
  maxTime: number;
  details: PingPacketDetail[];
}

export interface ScheduledTask {
  id: string;
  name: string;
  startDate?: string;
  startTime: string; // e.g. "04:00:00" or "startup"
  interval: string;  // e.g. "1d", "12h", "1h", "00:30:00", "0s"
  onEvent: string;   // RouterOS script or command e.g. "/system reboot"
  disabled: boolean;
  runCount: number;
  nextRun?: string;
  owner?: string;
  policy?: string;
  comment?: string;
}

export interface ScheduledTaskTemplate {
  id: string;
  name: string;
  titleAr: string;
  category: 'maintenance' | 'backup' | 'cleanup' | 'network' | 'security';
  descriptionAr: string;
  startTime: string;
  interval: string;
  onEvent: string;
  comment: string;
  dangerLevel?: 'none' | 'medium' | 'high';
  suggestedPolicy?: string;
}

export interface AntiSharingStatus {
  isFullyProtected: boolean;
  hotspot: {
    total: number;
    protected: number;
    unprotected: number;
    profiles?: Array<{ id: string; name: string; sharedUsers: number }>;
  };
  ppp: {
    total: number;
    protected: number;
    unprotected: number;
    profiles?: Array<{ id: string; name: string; onlyOne: string }>;
  };
  userManager: {
    version: 'v7' | 'v6' | 'none';
    total: number;
    protected: number;
    unprotected: number;
  };
  antiTetheringMangle: {
    active: boolean;
    interface: string;
    ruleId: string | null;
    disabled: boolean;
  };
  antiProxyFilters: {
    active: boolean;
    rulesCount: number;
  };
  availableInterfaces: string[];
  defaultLanInterface: string;
  canonicalScript: string;
}

export interface AntiSharingExecutionResult {
  success: boolean;
  message: string;
  data?: {
    backupName?: string;
    hotspotProfilesUpdated: number;
    pppProfilesUpdated: number;
    userManagerProfilesUpdated: number;
    targetLanInterface: string;
    verification: {
      ok: boolean;
      leftoverHotspot: number;
      leftoverPpp: number;
    };
    logs: string[];
  };
}

