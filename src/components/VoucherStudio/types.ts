export type ServiceType = 'HOTSPOT' | 'USERMAN' | 'PPPOE';

export interface VoucherProfile {
  profileId: string;
  profileName: string;
  price: number;
  validity?: string;
  timeLimit?: string;
  dataLimit?: string;
  rateLimit?: string;
  sharedUsers?: number;
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
  };
}

export interface GenerateResponse {
  success: boolean;
  totalGenerated: number;
  batchId: string;
  durationMs: number;
  error?: string;
  message?: string;
}

export interface VoucherItem {
  voucherId: string;
  voucherCode: string;
  voucherPin: string;
  statusCd: string;
  price: number;
  profileName: string;
  timeLimit: string;
  dataLimit?: string;
  createdAt: string;
  batchId?: string;
  serviceType?: ServiceType;
  isSynced?: boolean;
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
  isPos?: boolean;
}

export const LAYOUT_OPTIONS: PrintLayoutOption[] = [
  { id: '2x5', label: '2 × 5 (10 كروت بالصفحة A4 - قياسي كبير)', cols: 2, rows: 5 },
  { id: '3x7', label: '3 × 7 (21 كرت بالصفحة A4 - متوسط متوازن)', cols: 3, rows: 7 },
  { id: '4x10', label: '4 × 10 (40 كرت بالصفحة A4 - اقتصادي موفر)', cols: 4, rows: 10 },
  { id: '5x10', label: '5 × 10 (50 كرت بالصفحة A4 - عالي الكثافة)', cols: 5, rows: 10 },
  { id: '6x12', label: '6 × 12 (72 كرت بالصفحة A4 - مكثف)', cols: 6, rows: 12 },
  { id: '10x10', label: '🔥 10 × 10 (100 كرت بالصفحة A4 بالضبط - مصغر)', cols: 10, rows: 10 },
  { id: '20x20', label: '⚡ 20 × 20 (400 كرت بالصفحة A4 - شبكة مكثفة فائقة)', cols: 20, rows: 20 },
  { id: 'custom', label: '⚙️ مخصص (تحديد عدد الصفوف والأعمدة يدوياً)', cols: 3, rows: 7 },
  { id: 'pos80', label: '🧾 1 × 1 (طابعة إيصالات حرارية POS رول 80mm)', cols: 1, rows: 1, isPos: true },
  { id: 'pos58', label: '📟 1 × 1 (طابعة حرارية رول 58mm)', cols: 1, rows: 1, isPos: true }
];

export interface ThemeElementStyle {
  color: string;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  hasShadow: boolean;
  shadowColor?: string;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase';
  zIndex?: number;
}

export interface VoucherLogo {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
}

export interface CoordsMap {
  network:   { x: number; y: number };
  profile:   { x: number; y: number };
  price:     { x: number; y: number };
  user:      { x: number; y: number };
  password:  { x: number; y: number };
  qr:        { x: number; y: number };
  time:      { x: number; y: number };
  dataLimit: { x: number; y: number };
  customText1?: { x: number; y: number };
  customText2?: { x: number; y: number };
  logo?: { x: number; y: number };
}

export interface ThemePreset {
  name: string;
  nameEn: string;
  description: string;

  // الألوان الأساسية
  bgColor: string;
  cardTextColor: string;
  borderColor: string;
  primaryColor: string;
  accentColor: string;

  // الخط
  fontFamily: string;

  // أنماط التصميم
  layoutStyle: 'vertical-balanced' | 'centered-crest' | 'mirrored' | 'boxless' | 'centered-large' | 'framed' | 'capsule' | 'grid-strict' | 'centered-dark';
  animation: string;
  decorations: string[];
  qrSize?: number;

  // أنماط صناديق الكود والباسورد
  userBoxBg: string;
  userBoxBorder: string;
  userBoxStyle: 'box' | 'underline' | 'pill' | 'none';
  passBoxBg: string;
  passBoxBorder: string;
  passBoxStyle: 'box' | 'underline' | 'pill' | 'none';

  // شكل الكرت نفسه
  cardBorderStyle: 'solid' | 'dashed' | 'double' | 'dotted' | 'none';
  cardBorderWidth: number;
  cardRadius: number;
  cardShadow: string;
  cardBgGradient: string | null;

  // شكل QR
  qrBorderRadius: number;
  qrShadow: string;
  qrBg: string;

  // عناصر زخرفية
  showDecorativeLine: boolean;
  decorativeLineColor: string;
  showCornerAccents: boolean;
  cornerAccentColor: string;
  priceStyle: 'text' | 'badge' | 'highlight' | 'strikethrough';

  // العناصر النصية
  elements: {
    network:   ThemeElementStyle;
    user:      ThemeElementStyle;
    password:  ThemeElementStyle;
    price:     ThemeElementStyle;
    time:      ThemeElementStyle;
    profile:   ThemeElementStyle;
    dataLimit: ThemeElementStyle;
  };

  // الإحداثيات الخاصة بالثيم
  coords: CoordsMap;
}

export interface VoucherElementStyle {
  show?: boolean;
  color: string;
  fontSize: number;
  fontWeight?: string;
  fontFamily?: string;
  rotation: number;
  hasShadow: boolean;
  shadowColor?: string;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase';
  zIndex?: number;
}

export interface VoucherDesignState {
  theme: 'modern' | 'classic' | 'dark' | 'luxury' | 'minimal' | 'glass' | 'gamer' | 'swiss' | 'neon';
  primaryColor: string;
  bgColor: string;
  cardTextColor?: string;
  borderColor?: string;
  networkName: string;
  showNetworkName?: boolean;
  customNetworkName?: string;
  networkNameSource?: 'real_router' | 'custom' | 'real';
  loginUrl: string;
  authMode: 'user_only' | 'user_pass' | 'user_equals_pass';
  sameUserPass?: boolean;
  codeType: 'numeric' | 'alpha' | 'alphanumeric';
  systemType?: 'hotspot' | 'pppoe' | 'userman';
  charType?: 'numbers' | 'letters' | 'mixed' | 'uppercase_pin';
  passwordLength?: number;
  batchComment?: string;
  price?: number;
  
  currency?: string;
  currencySymbol?: string;

  showQr: boolean;
  showBorder: boolean;
  showCutLines: boolean;
  showDataLimit: boolean;
  showProfileName: boolean;
  showBgImage: boolean;
  bgImage?: string;
  showLogo?: boolean;
  logoUrl?: string;
  logoSize?: number;

  logos?: VoucherLogo[];
  layoutStyle?: string;
  fontScaleMultiplier?: number;

  cardWidthMm?: number;
  cardHeightMm?: number;
  paperType:
    | 'a4'
    | 'a4_100'
    | 'a4_40'
    | 'a4_400'
    | 'thermal_80mm'
    | 'thermal_58mm'
    | 'pos_80mm'
    | 'pos_58mm'
    | 'pos80'
    | 'pos58'
    | 'a3'
    | 'a5'
    | 'letter';
  paperOrientation?: 'portrait' | 'landscape';
  qrSize?: number;
  gridMode?: 'auto' | 'custom';
  columnsCount: number;
  rowsCount?: number;
  customCols?: number;
  customRows?: number;
  cardMarginTop: number;
  cardMarginSide: number;
  cardMarginBottom?: number;
  cardGap: number;
  showCutMarks?: boolean;
  cutMarksStyle?: 'dashed' | 'dotted' | 'solid' | 'none';
  showPageHeaderMeta?: boolean;
  cardRadiusMm?: number;
  cardIndexNumbering?: boolean;

  qrMode: 'auto_login' | 'simple_url' | 'credentials';

  customText1Content?: string;
  customText2Content?: string;
  
  coords: {
    user: { x: number; y: number };
    password: { x: number; y: number };
    price: { x: number; y: number };
    time: { x: number; y: number };
    qr: { x: number; y: number };
    network: { x: number; y: number };
    profile?: { x: number; y: number };
    dataLimit?: { x: number; y: number };
    customText1?: { x: number; y: number };
    customText2?: { x: number; y: number };
    logo?: { x: number; y: number };
  };
  
  fontFamily: string;
  slashedZero: boolean;
  autoPrefix: boolean;
  prefixValue: string;
  codeLength: number;
  quantity: number;
  
  elements: {
    network: VoucherElementStyle;
    user: VoucherElementStyle;
    password: VoucherElementStyle;
    price: VoucherElementStyle;
    time: VoucherElementStyle;
    profile: VoucherElementStyle;
    dataLimit: VoucherElementStyle;
  };
  
  autoSync: boolean;
  targetProfile: string;
  hidePasswordIfEqual?: boolean;
  /** وقت الصلاحية يُجلَب تلقائياً من البروفايل فقط — لا يُدخَّل يدوياً */
  timeLimit?: string;
  dataLimit?: string;
}

export interface AutoCalcGridParams {
  cardWidthMm?: number;
  cardHeightMm?: number;
  cardGap?: number;
  cardMarginTop?: number;
  cardMarginSide?: number;
  cardMarginBottom?: number;
  gapMm?: number;
  paddingMm?: number;
  paperType?: string;
  paperOrientation?: 'portrait' | 'landscape';
  paperWidthMm?: number;
  paperHeightMm?: number;
  headerHeightMm?: number;
  totalCards?: number;
  isPos?: boolean;
  gridMode?: 'auto' | 'custom';
  customCols?: number;
  customRows?: number;
  cols?: number;
  rows?: number;
  signal?: AbortSignal;
}

export interface GridResult {
  cols: number;
  rows: number;
  actualCardWidthMm: number;
  actualCardHeightMm: number;
  fontScale: number;
  totalPerPage: number;
  totalPages: number;
  totalCards: number;
  gapMm: number;
  paddingMm: number;
  paperWidthMm: number;
  paperHeightMm: number;
  isPos: boolean;
  paperLabel: string;
  readabilityWarning?: string;
}
