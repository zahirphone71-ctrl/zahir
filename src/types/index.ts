export * from './mikrotik';

export interface User {
  id: string;
  username: string;
  password?: string;
  profile: string;
  status: 'online' | 'offline';
  macAddress?: string;
  bytesIn: number;
  bytesOut: number;
  uptime: string;
  lastLoggedOut?: string;
  disabled?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  command: string;
  response: string;
  type: 'info' | 'success' | 'error';
}

export interface ConnectionConfig {
  ip: string;
  user: string;
  pass?: string;
  port?: number;
  useSsl?: boolean;
  host?: string;
  password?: string;
  auth?: string;
  identity?: string;
  _enc?: boolean | 'os-keychain' | 'aes-gcm-v2';
}

export interface ZCtrlDesktopVault {
  isDesktop: boolean;
  getPlatform: () => string;
  isEncryptionAvailable: () => Promise<boolean>;
  encryptSecret: (plainText: string) => Promise<{ success: boolean; data?: string; error?: string }>;
  decryptSecret: (cipherBase64: string) => Promise<{ success: boolean; data?: string; error?: string }>;
}

export interface ElectronAPI {
  invokeMikrotik: (params: any) => Promise<{ success: boolean; data?: any; error?: string }>;
  [key: string]: any;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    zctrlDesktopVault?: ZCtrlDesktopVault;
  }
}
