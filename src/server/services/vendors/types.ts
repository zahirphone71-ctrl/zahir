// ============================================================
// أنواع مشتركة - Vendor Common Types
// ============================================================

export interface ApClientInfo {
  macAddress: string;
  hostname?: string;
  ipAddress?: string;
  signalStrength?: string;
  signalQuality?: number;
  txRate?: string;
  rxRate?: string;
  uptime?: string;
}

export interface VendorSession {
  cookie?: string;
  token?: string;
  csrfToken?: string;
  expiresAt: number;
}

export interface VendorResult {
  success: boolean;
  error?: string;
  requiresAuth?: boolean;
  unsupported?: boolean;
  ssid?: string;
  ssid2g?: string;
  ssid5g?: string;
  band?: string;
  channel?: string;
  channelWidth?: string;
  txPower?: string;
  hideSsid?: boolean;
  securityType?: string;
  clients?: ApClientInfo[];
  clientsCount?: number;
  uptime?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  firmwareVersion?: string;
  model?: string;
  isDualBand?: boolean;
  _session?: VendorSession;
}

export interface SsidChangeRequest {
  ssid?: string;
  ssid2g?: string;
  ssid5g?: string;
  hideSsid?: boolean;
}

export interface VendorConnectConfig {
  ip: string;
  username: string;
  password: string;
  port: number;
  useHttps: boolean;
  timeoutMs?: number;
}

export interface VendorWriteResult {
  success: boolean;
  message: string;
  requiresCredentials?: boolean;
}

export interface VendorHandler {
  vendorName: string;
  vendorPatterns: string[];
  macOuiPrefixes: string[];
  fetchInfo(config: VendorConnectConfig): Promise<VendorResult>;
  setSsid(config: VendorConnectConfig, session: VendorSession | undefined, request: SsidChangeRequest): Promise<VendorWriteResult>;
  reboot(config: VendorConnectConfig, session: VendorSession | undefined): Promise<VendorWriteResult>;
}
