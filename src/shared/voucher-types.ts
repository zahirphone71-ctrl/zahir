// ============================================================
// منظومة كروت المايكروتك — الأنواع والمخططات المشتركة
// ============================================================

export type CodeType = 'numeric' | 'alpha' | 'alphanumeric' | 'alphanumeric_lower' | 'hex';
export type ServiceType = 'HOTSPOT' | 'USERMAN' | 'PPPOE';
export type VoucherStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'DISABLED';

export interface VoucherItem {
  voucherId: string;
  voucherCode: string;
  voucherPin: string;
  statusCd: VoucherStatus | string;
  price: number;
  profileName: string;
  timeLimit: string;
  dataLimit?: string;
  createdAt: string;
  batchId?: string;
  serviceType?: ServiceType;
  isSynced?: boolean;
}

export interface BatchInfo {
  batchId: string;
  profileName: string;
  totalGenerated: number;
  totalSynced: number;
  count?: number;
  syncedCount?: number;
  activeCount?: number;
  usedCount?: number;
  createdAt: string;
  comment?: string;
  serviceType?: ServiceType;
  authMode?: 'user_only' | 'user_pass' | 'user_equals_pass' | string;
  price?: number;
  prefix?: string;
}

export interface DashboardStats {
  totalVouchers: number;
  activeVouchers: number;
  usedVouchers: number;
  syncedVouchers: number;
  unsyncedVouchers: number;
  totalBatches: number;
  routersCount: number;
  databaseSizeBytes: number;
}

export interface GenerateOptions {
  quantity: number;
  codeType: CodeType;
  codeLength: number;
  passwordLength?: number;
  prefix?: string;
  authMode: 'user_only' | 'user_pass' | 'user_equals_pass' | string;
  sameUserPass?: boolean;
  profileName: string;
  price: number;
  timeLimit?: string;
  dataLimit?: string;
  serviceType?: ServiceType;
  comment?: string;
  autoSync?: boolean;
  routerId?: string;
}

export interface GenerateResponse {
  success: boolean;
  batchId: string;
  totalGenerated: number;
  totalAttempted?: number;
  duplicatesSkipped?: number;
  durationMs: number;
  message?: string;
  error?: string;
}

export interface SyncOptions {
  batchId?: string;
  voucherCodes?: string[];
  routerId?: string;
  profileOnRouter?: string;
  serviceType?: ServiceType;
}

export interface SyncError {
  voucherCode: string;
  error: string;
  retryCount: number;
}

export interface SyncResult {
  totalToSync: number;
  synced: number;
  failed: number;
  skipped: number;
  durationMs: number;
  errors: SyncError[];
  routerName?: string;
  routerIp?: string;
}

export interface RouterPrecheckInfo {
  routerConnected: boolean;
  message: string;
  existingDbCount: number;
  existingRouterCount: number;
  routerInfo?: {
    boardName: string;
    version: string;
    cpuLoad: number;
    freeMemory: number;
    totalMemory: number;
    uptime: string;
  };
}

export interface PageDataResponse {
  vouchers: VoucherItem[];
  page: number;
  totalPages: number;
  totalCount: number;
}

export interface PrintLayoutOption {
  id: string;
  label: string;
  cols: number;
  rows: number;
}

export const LAYOUT_OPTIONS: PrintLayoutOption[] = [
  { id: '2x5', label: '2 × 5 (10 كروت بالصفحة A4 - قياسي كبير)', cols: 2, rows: 5 },
  { id: '3x7', label: '3 × 7 (21 كرت بالصفحة A4 - متوسط متوازن)', cols: 3, rows: 7 },
  { id: '4x10', label: '4 × 10 (40 كرت بالصفحة A4 - اقتصادي موفر)', cols: 4, rows: 10 },
  { id: '5x10', label: '5 × 10 (50 كرت بالصفحة A4 - عالي الكثافة)', cols: 5, rows: 10 },
  { id: '10x10', label: '10 × 10 (100 كرت بالصفحة A4 - مصغر)', cols: 10, rows: 10 },
  { id: '20x20', label: '20 × 20 (400 كرت بالصفحة A4 - شبكة مكثفة فائقة)', cols: 20, rows: 20 },
  { id: 'pos80', label: '1 × 1 (طابعة إيصالات حرارية POS رول 80mm)', cols: 1, rows: 1 },
  { id: 'pos58', label: '1 × 1 (طابعة حرارية رول 58mm)', cols: 1, rows: 1 },
];
