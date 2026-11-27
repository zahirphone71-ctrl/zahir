// designTokens.ts — المصدر الوحيد لكل بكسل ولون وحركة وأيقونة وأبعاد في البرنامج

export const TOKENS = Object.freeze({
  // ═══ الألوان ═══
  color: Object.freeze({
    bg: Object.freeze({
      base: '#090d16',
      surface: '#0f172a',
      elevated: '#1e293b',
      hover: '#273449',
      overlay: 'rgba(9,13,22,0.85)',
    }),
    border: Object.freeze({
      subtle: '#1e293b',
      normal: '#334155',
      focus: '#6366f1',
      error: '#f43f5e',
    }),
    text: Object.freeze({
      primary: '#f8fafc',
      secondary: '#94a3b8',
      muted: '#64748b',
      inverse: '#0f172a',
      link: '#38bdf8',
    }),
    accent: Object.freeze({
      cyan: '#06b6d4',
      amber: '#f59e0b',
      emerald: '#10b981',
      rose: '#f43f5e',
      indigo: '#6366f1',
      violet: '#8b5cf6',
      pink: '#ec4899',
    }),
    state: Object.freeze({
      success: '#10b981',
      warning: '#f59e0b',
      error: '#f43f5e',
      info: '#06b6d4',
      pending: '#94a3b8',
    }),
    brand: Object.freeze({
      primary: '#6366f1',
      secondary: '#8b5cf6',
      gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    }),
  }),

  // ═══ المسافات (8px grid) ═══
  space: Object.freeze({
    0: '0',
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
  }),

  // ═══ الزوايا ═══
  radius: Object.freeze({
    none: '0',
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '14px',
    xl: '18px',
    '2xl': '22px',
    full: '9999px',
  }),

  // ═══ الظلال ═══
  shadow: Object.freeze({
    xs: '0 1px 2px rgba(0,0,0,0.15)',
    sm: '0 2px 4px rgba(0,0,0,0.2)',
    md: '0 4px 12px rgba(0,0,0,0.3)',
    lg: '0 8px 24px rgba(0,0,0,0.4)',
    xl: '0 16px 48px rgba(0,0,0,0.5)',
    '2xl': '0 24px 64px rgba(0,0,0,0.6)',
    glow: Object.freeze({
      cyan: '0 0 20px rgba(6,182,212,0.4)',
      amber: '0 0 20px rgba(245,158,11,0.4)',
      emerald: '0 0 20px rgba(16,185,129,0.4)',
      indigo: '0 0 20px rgba(99,102,241,0.4)',
    }),
  }),

  // ═══ الحركات ═══
  motion: Object.freeze({
    duration: Object.freeze({
      instant: '80ms',
      fast: '150ms',
      normal: '250ms',
      slow: '400ms',
      lazy: '600ms',
    }),
    easing: Object.freeze({
      standard: 'cubic-bezier(0.4,0,0.2,1)',
      decelerate: 'cubic-bezier(0,0,0.2,1)',
      accelerate: 'cubic-bezier(0.4,0,1,1)',
      spring: 'cubic-bezier(0.34,1.56,0.64,1)',
      bounce: 'cubic-bezier(0.68,-0.55,0.265,1.55)',
    }),
  }),

  // ═══ الأبعاد (بالبكسل) ═══
  dim: Object.freeze({
    button: Object.freeze({
      sm: Object.freeze({ h: 32, px: 12, font: 12, icon: 14, gap: 6 }),
      md: Object.freeze({ h: 40, px: 16, font: 13, icon: 16, gap: 8 }),
      lg: Object.freeze({ h: 48, px: 24, font: 15, icon: 20, gap: 10 }),
    }),
    input: Object.freeze({
      sm: Object.freeze({ h: 32, px: 10, font: 12 }),
      md: Object.freeze({ h: 40, px: 12, font: 13 }),
      lg: Object.freeze({ h: 48, px: 14, font: 15 }),
    }),
    icon: Object.freeze({
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      '2xl': 32,
    }),
    card: Object.freeze({ p: 20, radius: 16, headerH: 56, footerH: 48 }),
    tab: Object.freeze({ h: 36, px: 14, font: 12, icon: 16, gap: 6 }),
    modal: Object.freeze({ headerH: 64, footerH: 56, p: 20, radius: 16 }),
    table: Object.freeze({ rowH: 48, headerH: 44, cellPx: 12, font: 12 }),
    badge: Object.freeze({
      sm: Object.freeze({ h: 20, px: 8, font: 12 }),
      md: Object.freeze({ h: 24, px: 10, font: 12 }),
    }),
    toast: Object.freeze({ h: 48, px: 16, font: 12, radius: 12 }),
    avatar: Object.freeze({ sm: 24, md: 32, lg: 40, xl: 48 }),
    switch: Object.freeze({ w: 44, h: 24, knob: 20 }),
    checkbox: Object.freeze({ size: 16, radius: 4 }),
    slider: Object.freeze({ trackH: 6, thumbSize: 16 }),
    progress: Object.freeze({ h: 8, radius: 999 }),
  }),

  // ═══ الخطوط ═══
  font: Object.freeze({
    size: Object.freeze({
      xs: '12px',
      sm: '12px',
      base: '12px',
      md: '13px',
      lg: '14px',
      xl: '16px',
      '2xl': '18px',
      '3xl': '20px',
      '4xl': '24px',
    }),
    weight: Object.freeze({
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      extrabold: 800,
      black: 900,
    }),
    family: Object.freeze({
      ui: "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif",
      mono: "'JetBrains Mono Variable', 'JetBrains Mono', monospace",
      display: "'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif",
    }),
  }),

  // ═══ Z-Index ═══
  z: Object.freeze({
    base: 0,
    card: 10,
    cardActive: 30,
    dropdown: 100,
    sticky: 200,
    drawer: 500,
    modal: 1000,
    toast: 2000,
    tooltip: 3000,
    overlay: 4000,
  }),
});

// ═══ خريطة الأيقونات الدلالية ═══
export const ICON_MAP = Object.freeze({
  // التنقل
  navDesigner: 'Sliders',
  navBatches: 'Layers',
  navVouchers: 'Database',
  navStats: 'ShieldCheck',
  navGallery: 'Palette',
  navFinancial: 'Coins',
  // الإجراءات
  actionRefresh: 'RefreshCw',
  actionSync: 'Server',
  actionPrint: 'Printer',
  actionExport: 'Download',
  actionSave: 'Save',
  actionDelete: 'Trash2',
  actionEdit: 'Pencil',
  actionAdd: 'Plus',
  actionClose: 'X',
  actionCopy: 'Copy',
  actionSearch: 'Search',
  actionFilter: 'Filter',
  actionUpload: 'Upload',
  actionCheck: 'Check',
  actionReset: 'RotateCcw',
  actionZoomIn: 'ZoomIn',
  actionZoomOut: 'ZoomOut',
  // الحالات
  stateSuccess: 'CheckCircle2',
  stateError: 'AlertCircle',
  stateWarning: 'AlertTriangle',
  stateInfo: 'Info',
  statePending: 'Clock',
  stateSynced: 'ShieldCheck',
  stateLoading: 'Loader2',
  // العناصر
  elNetwork: 'Wifi',
  elUser: 'User',
  elPassword: 'Key',
  elPrice: 'CreditCard',
  elTime: 'Clock',
  elProfile: 'Tag',
  elData: 'Database',
  elQr: 'QrCode',
  // الأدوات
  toolMove: 'Move',
  toolRotate: 'RotateCcw',
  toolResize: 'Maximize2',
  toolEye: 'Eye',
  toolEyeOff: 'EyeOff',
  toolLayers: 'Layers',
  toolPalette: 'Palette',
  // الملفات
  filePdf: 'FileText',
  fileHtml: 'FileCode',
  fileCsv: 'Table',
  fileImage: 'Image',
  // أخرى
  brand: 'Zap',
  sparkles: 'Sparkles',
  user: 'User',
  server: 'Server',
  cpu: 'Cpu',
  memory: 'HardDrive',
  calendar: 'Calendar',
  clock: 'Clock',
  hash: 'Hash',
  shield: 'Lock',
});

// ═══ أبعاد ورقة A4 والكرت ═══
export const PAPER_DIMENSIONS = Object.freeze({
  a4: Object.freeze({ w: 210, h: 297, padding: 4 }),
  a3: Object.freeze({ w: 297, h: 420, padding: 6 }),
  a5: Object.freeze({ w: 148, h: 210, padding: 3 }),
  letter: Object.freeze({ w: 215.9, h: 279.4, padding: 4 }),
  thermal_80mm: Object.freeze({ w: 80, h: 150, padding: 2 }),
  thermal_58mm: Object.freeze({ w: 58, h: 120, padding: 2 }),
});

export const VOUCHER_CARD_DIMENSIONS = Object.freeze({
  default: Object.freeze({ w: 85, h: 52, radius: 10, padding: 4 }),
  compact: Object.freeze({ w: 60, h: 40, radius: 8, padding: 3 }),
  mini: Object.freeze({ w: 40, h: 28, radius: 6, padding: 2 }),
  thermal: Object.freeze({ w: 76, h: 40, radius: 4, padding: 3 }),
});
