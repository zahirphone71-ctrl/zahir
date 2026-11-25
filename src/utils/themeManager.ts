import { safeStorage } from './safeStorage';

export type AppThemeId = 
  | 'classic_sapphire'
  | 'royal_gold'
  | 'cyber_matrix'
  | 'emerald_jade'
  | 'crimson_velvet'
  | 'clean_pearl'
  | 'midnight_lavender'
  | 'deep_void';

export interface AppThemePreset {
  id: AppThemeId;
  name: string;
  nameEn: string;
  shortDesc: string;
  badge: string;
  features: string[];
  primaryColor: string; // e.g. #f59e0b
  secondaryColor: string;
  accentGlow: string;
  bgMain: string;
  bgCard: string;
  bgHeader: string;
  bgSidebar: string;
  borderColor: string;
  textColor: string;
  textMuted: string;
  borderRadius: string;
  fontFamily: string;
  buttonGradient: string;
  sidebarActiveBg: string;
  isLight?: boolean;
  themeClass: string;
}

export const APP_THEME_PRESETS: Record<AppThemeId, AppThemePreset> = {
  royal_gold: {
    id: 'royal_gold',
    name: '👑 النمط الملكي الذهبي (Royal Gold VIP)',
    nameEn: 'Royal Gold',
    shortDesc: 'فخامة ملكية باللون الذهبي الدافئ والأسود الكربوني مع حواف مصقولة وتأثيرات VIP عالية التباين',
    badge: 'فاخر VIP',
    features: [
      'حواف وبطاقات مصقولة بإطار ذهبي ملكي',
      'توهج دافئ بقيم تباين عالية لكبار المشتركين',
      'أزرار وقوائم عريضة بلمسة فخمة ورسمية'
    ],
    primaryColor: '#f59e0b',
    secondaryColor: '#d97706',
    accentGlow: 'rgba(245, 158, 11, 0.45)',
    bgMain: '#0b0c10',
    bgCard: '#13151f',
    bgHeader: '#0e1017',
    bgSidebar: '#0f1118',
    borderColor: '#78350f',
    textColor: '#fef3c7',
    textMuted: '#d97706',
    borderRadius: '1rem',
    fontFamily: "'Cairo', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(245, 158, 11, 0.25) 0%, rgba(180, 83, 9, 0.1) 100%)',
    themeClass: 'theme-royal-gold'
  },
  cyber_matrix: {
    id: 'cyber_matrix',
    name: '⚡ النمط السايبراني المضيء (Cyber Matrix)',
    nameEn: 'Cyber Matrix',
    shortDesc: 'طابع مستقبلي نيون بخطوط حادة وألوان السماوي والبنفسجي الشبكي وزوايا حادة تقنية',
    badge: 'نيون مستقبلي',
    features: [
      'زوايا تقنية هندسية حادة (Tech Sharp Edges)',
      'توهج نيون مضاعف بلمسات بنفسجية ورقمية',
      'أشرطة تبويب مضيئة وأزرار إلكترونية عالية السرعة'
    ],
    primaryColor: '#06b6d4',
    secondaryColor: '#a855f7',
    accentGlow: 'rgba(6, 182, 212, 0.5)',
    bgMain: '#030712',
    bgCard: '#0f172a',
    bgHeader: '#090d16',
    bgSidebar: '#0b0f19',
    borderColor: '#1e1b4b',
    textColor: '#e0f2fe',
    textMuted: '#38bdf8',
    borderRadius: '0.375rem',
    fontFamily: "'Inter', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #06b6d4 0%, #7e22ce 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(6, 182, 212, 0.25) 0%, rgba(126, 34, 206, 0.15) 100%)',
    themeClass: 'theme-cyber-matrix'
  },
  emerald_jade: {
    id: 'emerald_jade',
    name: '🌲 النمط الزمردي الملكي (Emerald Jade)',
    nameEn: 'Emerald Jade',
    shortDesc: 'طابع زمردي أنيق ومستقر يريح العين مع ألوان الأخضر الملكي والتايل المضيء للعمل الطويل',
    badge: 'مستقر وأنيق',
    features: [
      'حواف دائرية ناعمة جداً لراحة العين (Ultra Smooth Corners)',
      'تدرجات الأخضر الزمردي المستقر للأداء الشبكي المستمر',
      'ألوان نصوص ورموز مريحة للرؤية الليلية المستمرة'
    ],
    primaryColor: '#10b981',
    secondaryColor: '#059669',
    accentGlow: 'rgba(16, 185, 129, 0.4)',
    bgMain: '#04100d',
    bgCard: '#0a1d18',
    bgHeader: '#061612',
    bgSidebar: '#071814',
    borderColor: '#064e3b',
    textColor: '#ecfdf5',
    textMuted: '#34d399',
    borderRadius: '1.25rem',
    fontFamily: "'Tajawal', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(16, 185, 129, 0.25) 0%, rgba(4, 120, 87, 0.1) 100%)',
    themeClass: 'theme-emerald-jade'
  },
  classic_sapphire: {
    id: 'classic_sapphire',
    name: '💙 النمط الكلاسيكي الياقوتي (Modern ZCtrl)',
    nameEn: 'Modern Sapphire',
    shortDesc: 'التصميم القياسي المعتمد لبرنامج ZCtrl باللون الأزرق الياقوتي والكحلي الاحترافي متوازن الأبعاد',
    badge: 'الافتراضي القياسي',
    features: [
      'النمط الهندسي القياسي لشبكات المايكروتك',
      'توزيع كلاسيكي أزرق كحلي سريع الاستجابة',
      'أبعاد وتناسق عالمي ملائم لكافة الشاشات'
    ],
    primaryColor: '#3b82f6',
    secondaryColor: '#2563eb',
    accentGlow: 'rgba(59, 130, 246, 0.35)',
    bgMain: '#070a13',
    bgCard: '#0f172a',
    bgHeader: '#0b101d',
    bgSidebar: '#0c1222',
    borderColor: '#1e293b',
    textColor: '#f1f5f9',
    textMuted: '#60a5fa',
    borderRadius: '0.75rem',
    fontFamily: "'Cairo', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(59, 130, 246, 0.25) 0%, rgba(29, 78, 216, 0.1) 100%)',
    themeClass: 'theme-classic-sapphire'
  },
  crimson_velvet: {
    id: 'crimson_velvet',
    name: '🍷 النمط العنابي المخملي (Crimson Velvet)',
    nameEn: 'Crimson Velvet',
    shortDesc: 'تباين عالي باللون الوردى العنابي والأسود المخملي مع لمسات تحذيرية حاسمة وإشارات قوية',
    badge: 'تباين عالي',
    features: [
      'ألوان عنابية مخملية ذات طابع ناري مميز',
      'تباين عالي للتنبيهات والعمليات الحرجة والسريعة',
      'حواف متوسطة الاستدارة مع ظلال مخملية عميقة'
    ],
    primaryColor: '#f43f5e',
    secondaryColor: '#e11d48',
    accentGlow: 'rgba(244, 63, 94, 0.45)',
    bgMain: '#11080c',
    bgCard: '#1a0d13',
    bgHeader: '#140a0f',
    bgSidebar: '#160b10',
    borderColor: '#881337',
    textColor: '#ffe4e6',
    textMuted: '#fb7185',
    borderRadius: '0.875rem',
    fontFamily: "'Cairo', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(244, 63, 94, 0.25) 0%, rgba(190, 18, 60, 0.1) 100%)',
    themeClass: 'theme-crimson-velvet'
  },
  clean_pearl: {
    id: 'clean_pearl',
    name: '⚪ النمط اللؤلؤي الأبيض (Executive Light)',
    nameEn: 'Executive Pearl Light',
    shortDesc: 'نمط نهاري أبيض نقي مع نصوص كحلية وتباين واضح جداً لسهولة العمل بالمكاتب المضاءة جيدا',
    badge: 'نهاري أبيض',
    features: [
      'واجهة نهارية بيضاء كلياً فائقة النقاء والوضوح',
      'تباين عالي الخطوط للعمل في المكاتب والمحلات المضاءة',
      'ظلال ناعمة على الأشرطة والبطاقات بدون نيون'
    ],
    primaryColor: '#2563eb',
    secondaryColor: '#1d4ed8',
    accentGlow: 'rgba(37, 99, 235, 0.2)',
    bgMain: '#f8fafc',
    bgCard: '#ffffff',
    bgHeader: '#f1f5f9',
    bgSidebar: '#e2e8f0',
    borderColor: '#cbd5e1',
    textColor: '#0f172a',
    textMuted: '#475569',
    borderRadius: '0.75rem',
    fontFamily: "'Tajawal', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(37, 99, 235, 0.15) 0%, rgba(30, 64, 175, 0.05) 100%)',
    isLight: true,
    themeClass: 'theme-clean-pearl'
  },
  midnight_lavender: {
    id: 'midnight_lavender',
    name: '🔮 النمط الأرجواني الليلي (Midnight Lavender)',
    nameEn: 'Midnight Lavender',
    shortDesc: 'أجواء ليلية ساحرة بلون اللافندر الأرجواني المضيء والتناغم البصري مع حواف بيضاوية رقيقة',
    badge: 'ليلي أرجواني',
    features: [
      'حواف بيضاوية ناعمة (Pill-style Curves)',
      'تأثير زجاجي ليلي بلون اللافندر البنفسجي',
      'توهج هادئ وجماليات حديثة للشاشات المتقدمة'
    ],
    primaryColor: '#8b5cf6',
    secondaryColor: '#7c3aed',
    accentGlow: 'rgba(139, 92, 246, 0.45)',
    bgMain: '#090714',
    bgCard: '#130f24',
    bgHeader: '#0e0a1f',
    bgSidebar: '#100c22',
    borderColor: '#4c1d95',
    textColor: '#f5f3ff',
    textMuted: '#a78bfa',
    borderRadius: '1.5rem',
    fontFamily: "'Cairo', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(139, 92, 246, 0.25) 0%, rgba(109, 40, 217, 0.1) 100%)',
    themeClass: 'theme-midnight-lavender'
  },
  deep_void: {
    id: 'deep_void',
    name: '🌌 نمط السواد المطلق (Deep Void)',
    nameEn: 'Deep Void',
    shortDesc: 'سواد كلي فائق (True Black #000000) لشاشات OLED مع تباين عالي للأيقونات والنصوص لأقصى راحة للعين أثناء الاستخدام الطويل ليلاً',
    badge: 'سواد نقي OLED',
    features: [
      'خلفية سوداء نقية 100% (#000000) تطفئ بكسلات OLED وتوفر طاقة الشاشة',
      'تباين عالي ومحدد للأيقونات (High-Contrast Icons) بلمعان بلوري ناصع مريح للعين',
      'حواف دقيقة ونصوص ناصعة تخفف إجهاد البصر تماماً أثناء العمل الليلي الطويل'
    ],
    primaryColor: '#38bdf8',
    secondaryColor: '#818cf8',
    accentGlow: 'rgba(56, 189, 248, 0.45)',
    bgMain: '#000000',
    bgCard: '#08080a',
    bgHeader: '#000000',
    bgSidebar: '#030305',
    borderColor: '#27272a',
    textColor: '#ffffff',
    textMuted: '#94a3b8',
    borderRadius: '0.875rem',
    fontFamily: "'Cairo', sans-serif",
    buttonGradient: 'linear-gradient(135deg, #0284c7 0%, #4338ca 100%)',
    sidebarActiveBg: 'linear-gradient(90deg, rgba(56, 189, 248, 0.25) 0%, rgba(67, 56, 202, 0.12) 100%)',
    themeClass: 'theme-deep-void'
  }
};

export interface CustomThemeElements {
  primaryColor?: string;
  secondaryColor?: string;
  accentGlow?: string;
  bgMain?: string;
  bgCard?: string;
  bgHeader?: string;
  bgSidebar?: string;
  borderColor?: string;
  textColor?: string;
  textMuted?: string;
  borderRadius?: string;
  fontFamily?: string;
  fontSize?: string;
  buttonGradient?: string;
  sidebarActiveBg?: string;
}

export const getSavedCustomThemeElements = (): CustomThemeElements => {
  try {
    const raw = safeStorage.getItem('zctrl_custom_theme_elements');
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

export const saveCustomThemeElements = (elements: CustomThemeElements) => {
  try {
    safeStorage.setItem('zctrl_custom_theme_elements', JSON.stringify(elements));
  } catch {}
};

export const resetCustomThemeElements = () => {
  try {
    safeStorage.removeItem('zctrl_custom_theme_elements');
  } catch {}
};

export const getSavedAppTheme = (): AppThemeId => {
  try {
    const stored = safeStorage.getItem('zctrl_global_app_theme') as AppThemeId;
    if (stored && APP_THEME_PRESETS[stored]) {
      return stored;
    }
  } catch {
    // fallback
  }
  return 'classic_sapphire';
};

export const applyAppTheme = (themeId: AppThemeId, customOverrides?: CustomThemeElements) => {
  const preset = APP_THEME_PRESETS[themeId] || APP_THEME_PRESETS.classic_sapphire;
  const custom = customOverrides !== undefined ? customOverrides : getSavedCustomThemeElements();

  try {
    safeStorage.setItem('zctrl_global_app_theme', themeId);
  } catch {
    // ignore
  }

  const merged = {
    ...preset,
    ...custom
  };

  const root = document.documentElement;

  // Set data-theme attribute
  root.setAttribute('data-app-theme', themeId);

  // Clean old theme classes from root
  Object.values(APP_THEME_PRESETS).forEach((p) => {
    root.classList.remove(p.themeClass);
  });
  root.classList.add(preset.themeClass);

  if (merged.isLight) {
    root.classList.add('light-mode');
  } else {
    root.classList.remove('light-mode');
  }

  // Set CSS Root Variables for dynamic styling across the entire app
  root.style.setProperty('--app-theme-primary', merged.primaryColor);
  root.style.setProperty('--app-theme-secondary', merged.secondaryColor);
  root.style.setProperty('--app-theme-glow', merged.accentGlow || `rgba(${merged.primaryColor}, 0.4)`);
  root.style.setProperty('--app-theme-bg-main', merged.bgMain);
  root.style.setProperty('--app-theme-bg-card', merged.bgCard);
  root.style.setProperty('--app-theme-bg-header', merged.bgHeader);
  root.style.setProperty('--app-theme-bg-sidebar', merged.bgSidebar);
  root.style.setProperty('--app-theme-border', merged.borderColor);
  root.style.setProperty('--app-theme-text-main', merged.textColor);
  root.style.setProperty('--app-theme-text-muted', merged.textMuted);
  root.style.setProperty('--app-theme-radius', merged.borderRadius);
  root.style.setProperty('--app-theme-font', merged.fontFamily);
  if (merged.fontSize) {
    root.style.setProperty('--app-font-scale', `${merged.fontSize}%`);
  }
  root.style.setProperty('--app-theme-button-gradient', merged.buttonGradient || `linear-gradient(135deg, ${merged.primaryColor} 0%, ${merged.secondaryColor} 100%)`);
  root.style.setProperty('--app-theme-sidebar-active', merged.sidebarActiveBg || `linear-gradient(90deg, ${merged.primaryColor}33 0%, ${merged.secondaryColor}10 100%)`);

  // Update theme-color meta tag for system bars & mobile/OLED status bar
  try {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', merged.bgHeader || merged.bgMain);
    }
  } catch {
    // ignore
  }

  // Dispatch custom event for real-time reactivity
  window.dispatchEvent(new CustomEvent('zctrl-theme-changed', { detail: { themeId, preset: merged } }));
};
