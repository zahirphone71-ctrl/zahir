import JSZip from 'jszip';
import { HotspotPortalCustomization, PricingPlanItem } from '../types/mikrotik';

export const DEFAULT_PORTAL_CONFIG: HotspotPortalCustomization = {
  networkName: 'شبكة السرعة اللاسلكية',
  welcomeTitle: 'أهلاً بك في بوابة الإنترنت فائق السرعة',
  welcomeSubtitle: 'أدخل كود الكرت أو اسم المستخدم للاتصال الفوري بالإنترنت',
  logoType: 'icon',
  logoIcon: 'Wifi',
  logoImageUrl: '',
  themePreset: 'cyber-indigo',
  primaryColor: '#6366f1',
  accentColor: '#38bdf8',
  bgType: 'particles',
  bgImageUrl: '',
  glassOpacity: 0.85,
  borderRadius: 'rounded-2xl',
  // Visibility & Element Controls
  showLogo: true,
  showNetworkTitle: true,
  showSubtitle: true,
  showSupportSection: true,
  showLocation: true,
  showFooter: true,
  showSpeedTest: false,
  // Announcements & Promo Banners
  showMarqueeNews: true,
  marqueeNewsText: '🔥 عرض خاص اليوم: اشحن أي باقة واستمتع بضعف السرعة مجاناً! • خدمة العملاء متوفرة 24/7 عبر واتساب 777000000',
  showPromoBanner: true,
  promoBadge: 'عرض حصري ⚡',
  promoTitle: 'باقة التوفير الشهرية بخصم 30%',
  promoDesc: 'سرعة صاروخية بدون تقطيع للألعاب ومقاطع الفيديو بدقة 4K',
  promoButtonText: 'اطلب كرتك الآن',
  promoButtonLink: 'https://wa.me/967777000000',
  showAlertNotice: false,
  alertNoticeText: 'تنبيه: سيتم إجراء صيانة روتينية خفيفة لتحسين جودة البث الساعة 4:00 فجراً لمدة 10 دقائق.',
  // Pricing Showcase
  showPricingPlans: true,
  pricingPlans: [
    { id: 'p1', name: 'كرت ساعة واحدة', price: '100 ريال', duration: '1 ساعة', dataLimit: '1 GB', speed: '4 Mbps', highlight: false },
    { id: 'p2', name: 'كرت يوم كامل', price: '300 ريال', duration: '24 ساعة', dataLimit: '5 GB', speed: '8 Mbps', highlight: true },
    { id: 'p3', name: 'كرت أسبوعي', price: '1500 ريال', duration: '7 أيام', dataLimit: '25 GB', speed: '12 Mbps', highlight: false },
    { id: 'p4', name: 'باقة شهرية VIP', price: '5000 ريال', duration: '30 يوم', dataLimit: '100 GB', speed: '20 Mbps', highlight: false }
  ],
  // Support & Contact
  supportWhatsapp: '+967777000000',
  supportPhone: '777000000',
  supportTelegram: 't.me/my_wifi_network',
  supportLocation: 'شارع الجامعة - بجوار سوبرماركت الأمل',
  footerText: 'جميع الحقوق محفوظة © شبكة السرعة اللاسلكية • Powered by ZCtrl Engine',
  // Login Options
  loginStyle: 'dual-mode',
  showFreeTrial: true,
  trialButtonText: 'تجربة مجانية لمدة 15 دقيقة 🚀',
  showQrLogin: true,
  showRememberMe: true,
  pinPasswordType: 'same',
  targetHtmlDir: 'hotspot',
  targetDnsName: 'login.net',
  targetProfileName: 'hsprof1'
};

export const THEME_PRESETS: Record<
  string,
  {
    name: string;
    primary: string;
    accent: string;
    bgGradient: string;
    cardBg: string;
    textColor: string;
    buttonGradient: string;
  }
> = {
  'cyber-indigo': {
    name: 'نيلي سايبر حديث (Cyber Indigo)',
    primary: '#6366f1',
    accent: '#38bdf8',
    bgGradient: 'radial-gradient(ellipse at top, #1e1b4b, #090d16, #030712)',
    cardBg: 'rgba(15, 23, 42, 0.82)',
    textColor: '#f8fafc',
    buttonGradient: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)'
  },
  'emerald-luxury': {
    name: 'زمردي فاخر (Emerald Luxury)',
    primary: '#10b981',
    accent: '#34d399',
    bgGradient: 'radial-gradient(ellipse at top, #064e3b, #022c22, #030712)',
    cardBg: 'rgba(6, 44, 34, 0.85)',
    textColor: '#ecfdf5',
    buttonGradient: 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
  },
  'sunset-orange': {
    name: 'غروب دافئ (Sunset Orange)',
    primary: '#f97316',
    accent: '#fbbf24',
    bgGradient: 'radial-gradient(ellipse at top, #7c2d12, #431407, #0b0604)',
    cardBg: 'rgba(36, 17, 10, 0.85)',
    textColor: '#fff7ed',
    buttonGradient: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)'
  },
  'royal-gold': {
    name: 'ذهبي ملكي (Royal Gold & Obsidian)',
    primary: '#eab308',
    accent: '#fde047',
    bgGradient: 'radial-gradient(ellipse at top, #3a2e05, #1c1502, #050505)',
    cardBg: 'rgba(23, 20, 10, 0.9)',
    textColor: '#fefce8',
    buttonGradient: 'linear-gradient(135deg, #ca8a04 0%, #eab308 100%)'
  },
  'neon-matrix': {
    name: 'نيون تكنو (Neon Matrix)',
    primary: '#06b6d4',
    accent: '#a855f7',
    bgGradient: 'radial-gradient(ellipse at top, #164e63, #082f49, #020617)',
    cardBg: 'rgba(8, 20, 35, 0.88)',
    textColor: '#f0fdf4',
    buttonGradient: 'linear-gradient(135deg, #0891b2 0%, #8b5cf6 100%)'
  },
  'ocean-blue': {
    name: 'أزرق محيطي (Ocean Blue)',
    primary: '#0284c7',
    accent: '#38bdf8',
    bgGradient: 'radial-gradient(ellipse at top, #075985, #0c2d48, #030d1a)',
    cardBg: 'rgba(12, 38, 64, 0.85)',
    textColor: '#f0f9ff',
    buttonGradient: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)'
  },
  'clean-light': {
    name: 'أبيض ناصع عصري (Clean Light Pro)',
    primary: '#4f46e5',
    accent: '#0ea5e9',
    bgGradient: 'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)',
    cardBg: 'rgba(255, 255, 255, 0.95)',
    textColor: '#0f172a',
    buttonGradient: 'linear-gradient(135deg, #4f46e5 0%, #2563eb 100%)'
  }
};

function escapeHtml(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function sanitizeConfig(inputConfig: HotspotPortalCustomization): HotspotPortalCustomization {
  return {
    ...inputConfig,
    networkName: escapeHtml(inputConfig.networkName),
    welcomeTitle: escapeHtml(inputConfig.welcomeTitle),
    welcomeSubtitle: escapeHtml(inputConfig.welcomeSubtitle),
    marqueeNewsText: escapeHtml(inputConfig.marqueeNewsText),
    alertNoticeText: escapeHtml(inputConfig.alertNoticeText),
    promoBadge: escapeHtml(inputConfig.promoBadge),
    promoTitle: escapeHtml(inputConfig.promoTitle),
    promoDesc: escapeHtml(inputConfig.promoDesc),
    promoButtonText: escapeHtml(inputConfig.promoButtonText),
    trialButtonText: escapeHtml(inputConfig.trialButtonText),
    supportLocation: escapeHtml(inputConfig.supportLocation),
    footerText: escapeHtml(inputConfig.footerText),
    targetProfileName: escapeHtml(inputConfig.targetProfileName),
    targetDnsName: escapeHtml(inputConfig.targetDnsName)
  };
}

/**
 * Generate standard MikroTik Hotspot login.html with full customization
 */
export function generateHotspotLoginHtml(inputConfig: HotspotPortalCustomization): string {
  const config = sanitizeConfig(inputConfig);
  const theme = THEME_PRESETS[config.themePreset] || THEME_PRESETS['cyber-indigo'];
  const isLight = config.themePreset === 'clean-light';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="pragma" content="no-cache">
  <meta http-equiv="expires" content="-1">
  <title>${config.networkName} - تسجيل الدخول</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }
    body {
      font-family: 'Tajawal', 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${theme.bgGradient};
      color: ${theme.textColor};
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 12px 14px 28px;
      overflow-x: hidden;
      direction: rtl;
    }
    .background-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      z-index: 0;
      background-size: 30px 30px;
      background-image: 
        radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    }
    .app-container {
      width: 100%;
      max-width: 440px;
      position: relative;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    /* Marquee News Ticker */
    .marquee-wrapper {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 7px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      backdrop-filter: blur(8px);
    }
    .marquee-badge {
      background: ${config.primaryColor};
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 8px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .marquee-text {
      white-space: nowrap;
      animation: marquee 18s linear infinite;
      font-size: 12px;
      color: #e2e8f0;
    }
    @keyframes marquee {
      0% { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }
    /* Alert Box */
    .alert-box {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.35);
      border-radius: 14px;
      padding: 10px 14px;
      font-size: 12px;
      color: #fca5a5;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    /* Header Card */
    .header-card {
      text-align: center;
      padding: 20px 16px 14px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .logo-container {
      width: 68px;
      height: 68px;
      border-radius: 20px;
      background: ${theme.buttonGradient};
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px -5px ${config.primaryColor}80;
      margin-bottom: 4px;
      border: 2px solid rgba(255, 255, 255, 0.2);
    }
    .logo-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 18px;
    }
    .logo-svg {
      width: 36px;
      height: 36px;
      fill: none;
      stroke: #ffffff;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .network-title {
      font-size: 22px;
      font-weight: 900;
      color: ${isLight ? '#0f172a' : '#ffffff'};
      letter-spacing: -0.5px;
    }
    .welcome-subtitle {
      font-size: 13px;
      color: ${isLight ? '#475569' : '#94a3b8'};
      line-height: 1.4;
    }
    /* Main Portal Card */
    .glass-card {
      background: ${theme.cardBg};
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 22px;
      padding: 20px;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
    }
    /* Error Banner from MikroTik */
    .error-banner {
      background: rgba(225, 29, 72, 0.2);
      border: 1px solid rgba(244, 63, 94, 0.4);
      color: #fda4af;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 12px;
      margin-bottom: 14px;
      text-align: center;
      font-weight: 700;
    }
    /* Tabs for Dual Login Mode */
    .tab-switch {
      display: flex;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 14px;
      padding: 4px;
      margin-bottom: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .tab-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      background: transparent;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 700;
      border-radius: 10px;
      cursor: pointer;
      font-family: inherit;
      transition: all 0.2s;
    }
    .tab-btn.active {
      background: ${config.primaryColor};
      color: #ffffff;
      box-shadow: 0 4px 12px ${config.primaryColor}50;
    }
    /* Form Elements */
    .form-group {
      margin-bottom: 14px;
      text-align: right;
    }
    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 6px;
      color: ${isLight ? '#334155' : '#cbd5e1'};
    }
    /* Input and QR Button */
    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }
    .btn-qr-scan {
      background: ${config.primaryColor};
      color: #ffffff;
      border: none;
      border-radius: 8px;
      padding: 4px 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-weight: 800;
      font-family: inherit;
      transition: all 0.2s;
      box-shadow: 0 4px 10px ${config.primaryColor}40;
    }
    .btn-qr-scan:hover {
      opacity: 0.9;
      transform: scale(1.03);
    }
    /* QR Scanner Modal */
    .qr-modal {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      z-index: 9999;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .qr-modal-content {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 24px;
      padding: 20px;
      width: 100%;
      max-width: 380px;
      text-align: center;
      color: #fff;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    }
    .qr-video-box {
      width: 100%;
      height: 220px;
      background: #000;
      border-radius: 16px;
      overflow: hidden;
      position: relative;
      margin: 12px 0;
      border: 2px solid ${config.primaryColor};
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-video-box video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .qr-scan-line {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: #38bdf8;
      box-shadow: 0 0 10px #38bdf8;
      animation: scanAnim 2s infinite linear;
    }
    @keyframes scanAnim {
      0% { top: 0%; }
      50% { top: 95%; }
      100% { top: 0%; }
    }
    .input-field {
      width: 100%;
      background: ${isLight ? '#f1f5f9' : 'rgba(3, 7, 18, 0.6)'};
      border: 1.5px solid ${isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.12)'};
      border-radius: 14px;
      padding: 12px 14px;
      color: ${isLight ? '#0f172a' : '#ffffff'};
      font-size: 15px;
      font-weight: 700;
      font-family: inherit;
      outline: none;
      transition: all 0.2s;
      text-align: center;
      letter-spacing: 2px;
    }
    .input-field:focus {
      border-color: ${config.primaryColor};
      box-shadow: 0 0 0 3px ${config.primaryColor}30;
      background: ${isLight ? '#ffffff' : 'rgba(3, 7, 18, 0.8)'};
    }
    /* Buttons */
    .btn-submit {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: 14px;
      background: ${theme.buttonGradient};
      color: #ffffff;
      font-size: 15px;
      font-weight: 800;
      font-family: inherit;
      cursor: pointer;
      box-shadow: 0 10px 20px -5px ${config.primaryColor}60;
      transition: all 0.2s;
      margin-top: 6px;
    }
    .btn-submit:active {
      transform: scale(0.98);
    }
    .btn-trial {
      width: 100%;
      padding: 11px;
      border: 1.5px dashed ${config.accentColor};
      border-radius: 14px;
      background: rgba(56, 189, 248, 0.1);
      color: ${config.accentColor};
      font-size: 13px;
      font-weight: 800;
      font-family: inherit;
      cursor: pointer;
      margin-top: 10px;
      transition: all 0.2s;
      display: block;
      text-align: center;
      text-decoration: none;
    }
    .btn-trial:hover {
      background: rgba(56, 189, 248, 0.2);
    }
    /* Promo Banner */
    .promo-card {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(56, 189, 248, 0.15));
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 18px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      position: relative;
      overflow: hidden;
    }
    .promo-badge {
      display: inline-block;
      background: ${config.accentColor};
      color: #030712;
      font-size: 10px;
      font-weight: 900;
      padding: 2px 8px;
      border-radius: 6px;
      align-self: flex-start;
    }
    .promo-title {
      font-size: 14px;
      font-weight: 800;
      color: #ffffff;
    }
    .promo-desc {
      font-size: 12px;
      color: #cbd5e1;
      line-height: 1.4;
    }
    .promo-btn {
      margin-top: 6px;
      align-self: flex-start;
      background: ${config.primaryColor};
      color: #ffffff;
      padding: 6px 14px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 800;
      text-decoration: none;
    }
    /* Pricing Plans Grid */
    .plans-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 800;
      color: ${isLight ? '#334155' : '#e2e8f0'};
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .plans-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .plan-card {
      background: ${isLight ? '#ffffff' : 'rgba(15, 23, 42, 0.65)'};
      border: 1px solid ${isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)'};
      border-radius: 14px;
      padding: 10px 12px;
      text-align: center;
      transition: all 0.2s;
    }
    .plan-card.highlight {
      border-color: ${config.primaryColor};
      background: ${config.primaryColor}15;
    }
    .plan-name {
      font-size: 12px;
      font-weight: 700;
      color: ${isLight ? '#1e293b' : '#f1f5f9'};
    }
    .plan-price {
      font-size: 14px;
      font-weight: 900;
      color: ${config.accentColor};
      margin: 2px 0;
    }
    .plan-detail {
      font-size: 10px;
      color: #94a3b8;
    }
    /* Contact & Support */
    .support-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 10px 0;
    }
    .support-link {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #94a3b8;
      text-decoration: none;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: all 0.2s;
    }
    .support-link:hover {
      color: #ffffff;
      border-color: ${config.primaryColor};
    }
    /* Footer */
    .footer-text {
      text-align: center;
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="background-overlay"></div>

  <div class="app-container">
    ${
      config.showMarqueeNews && config.marqueeNewsText
        ? `<!-- Marquee News Bar -->
    <div class="marquee-wrapper">
      <span class="marquee-badge">إعلان 📢</span>
      <div class="marquee-text">${config.marqueeNewsText}</div>
    </div>`
        : ''
    }

    ${
      config.showAlertNotice && config.alertNoticeText
        ? `<!-- Alert Notice -->
    <div class="alert-box">
      <span>⚠️</span>
      <span>${config.alertNoticeText}</span>
    </div>`
        : ''
    }

    ${(config.showLogo !== false || config.showNetworkTitle !== false || config.showSubtitle !== false) ? `
    <!-- Header & Logo -->
    <div class="header-card">
      ${config.showLogo !== false ? `
      <div class="logo-container">
        ${
          config.logoImageUrl
            ? `<img src="${config.logoImageUrl}" alt="Logo">`
            : `<svg class="logo-svg" viewBox="0 0 24 24">
                <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                <line x1="12" y1="20" x2="12.01" y2="20"></line>
              </svg>`
        }
      </div>` : ''}
      ${config.showNetworkTitle !== false ? `<h1 class="network-title">${config.networkName}</h1>` : ''}
      ${config.showSubtitle !== false ? `<p class="welcome-subtitle">${config.welcomeSubtitle}</p>` : ''}
    </div>` : ''}

    <!-- Login Form Card -->
    <div class="glass-card">
      <!-- MikroTik Error Variable Display -->
      $(if error)
      <div class="error-banner">
        $(error)
      </div>
      $(endif)

      ${
        config.loginStyle === 'dual-mode'
          ? `<div class="tab-switch">
              <button type="button" class="tab-btn active" id="tabPinBtn" onclick="switchLoginMode('pin')">كود الكرت (PIN)</button>
              <button type="button" class="tab-btn" id="tabUserBtn" onclick="switchLoginMode('user')">مستخدم وكلمة سر</button>
            </div>`
          : ''
      }

      <form name="login" action="$(link-login-only)" method="post" onsubmit="return handleLoginSubmit();">
        <input type="hidden" name="dst" value="$(link-orig)">
        <input type="hidden" name="popup" value="true">

        <div id="pinModeSection" style="${config.loginStyle === 'user-pass' ? 'display:none;' : 'display:block;'}">
          <div class="form-group">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label class="form-label" for="cardPinInput" style="margin-bottom:0;">رقم / كود كرت الإنترنت</label>
              ${config.showQrLogin !== false ? `
              <button type="button" class="btn-qr-scan" onclick="openQrScanner()" title="مسح كود الكرت بكاميرا الهاتف">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span>مسح كيو آر (كاميرا)</span>
              </button>` : ''}
            </div>
            <div class="input-wrapper">
              <input type="text" id="cardPinInput" class="input-field" placeholder="أدخل رقم الكرت أو امسح الباركود" autocomplete="off" autofocus>
            </div>
          </div>
        </div>

        <div id="userPassSection" style="${config.loginStyle === 'card-pin-only' ? 'display:none;' : config.loginStyle === 'dual-mode' ? 'display:none;' : 'display:block;'}">
          <div class="form-group">
            <label class="form-label" for="usernameInput">اسم المستخدم</label>
            <input type="text" id="usernameInput" name="username" class="input-field" placeholder="اسم المستخدم" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label" for="passwordInput">كلمة المرور</label>
            <input type="password" id="passwordInput" name="password" class="input-field" placeholder="••••••">
          </div>
        </div>

        <button type="submit" class="btn-submit">تسجيل الدخول للإنترنت ⚡</button>
      </form>

      ${
        config.showFreeTrial
          ? `<!-- Free Trial Link for MikroTik $(trial) -->
      $(if trial == 'yes')
      <a href="$(link-login-only)?dst=$(link-orig-esc)&amp;username=T-$(mac-esc)" class="btn-trial">
        ${config.trialButtonText}
      </a>
      $(endif)`
          : ''
      }
    </div>

    ${
      config.showPromoBanner && config.promoTitle
        ? `<!-- Promotional Hero Card -->
    <div class="promo-card">
      <span class="promo-badge">${config.promoBadge || 'عرض حصري'}</span>
      <h3 class="promo-title">${config.promoTitle}</h3>
      <p class="promo-desc">${config.promoDesc}</p>
      ${
        config.promoButtonLink
          ? `<a href="${config.promoButtonLink}" class="promo-btn" target="_blank">${config.promoButtonText || 'تفاصيل العرض'}</a>`
          : ''
      }
    </div>`
        : ''
    }

    ${
      config.showPricingPlans && config.pricingPlans && config.pricingPlans.length > 0
        ? `<!-- Pricing Plans Showcase -->
    <div class="plans-section">
      <h3 class="section-title">📦 باقات وأسعار الكروت المتاحة:</h3>
      <div class="plans-grid">
        ${config.pricingPlans
          .map(
            (p) => `
        <div class="plan-card ${p.highlight ? 'highlight' : ''}">
          <div class="plan-name">${p.name}</div>
          <div class="plan-price">${p.price}</div>
          <div class="plan-detail">${p.duration} • ${p.dataLimit} • ${p.speed}</div>
        </div>`
          )
          .join('')}
      </div>
    </div>`
        : ''
    }

    ${config.showSupportSection !== false ? `
    <!-- Support & Contact Links -->
    <div class="support-bar">
      ${
        config.supportWhatsapp
          ? `<a href="https://wa.me/${config.supportWhatsapp.replace(/[^0-9]/g, '')}?text=أريد%20شحن%20كرت%20إنترنت" class="support-link" target="_blank">
        <span>💬 واتساب</span>
      </a>`
          : ''
      }
      ${
        config.supportPhone
          ? `<a href="tel:${config.supportPhone}" class="support-link">
        <span>📞 هاتف: ${config.supportPhone}</span>
      </a>`
          : ''
      }
      ${
        config.supportTelegram
          ? `<a href="https://${config.supportTelegram.replace('https://', '')}" class="support-link" target="_blank">
        <span>✈️ تلجرام</span>
      </a>`
          : ''
      }
    </div>` : ''}

    ${config.showLocation !== false && config.supportLocation ? `<div class="footer-text">📍 ${config.supportLocation}</div>` : ''}
    ${config.showFooter !== false && config.footerText ? `<div class="footer-text">${config.footerText}</div>` : ''}
  </div>

  <!-- QR Camera Scanner Modal -->
  <div id="qrModal" class="qr-modal">
    <div class="qr-modal-content">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:14px;font-weight:800;color:#fff;">📷 مسح باركود / QR كرت الإنترنت</h3>
        <button type="button" onclick="closeQrScanner()" style="background:transparent;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px;">✕</button>
      </div>
      <p style="font-size:12px;color:#94a3b8;margin-bottom:6px;">وجه كاميرا الهاتف نحو كود QR المطبوع على كرت الشبكة</p>
      <div class="qr-video-box">
        <video id="qrVideo" playsinline autoplay muted></video>
        <div class="qr-scan-line"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button type="button" onclick="closeQrScanner()" style="background:rgba(255,255,255,0.1);color:#fff;border:none;border-radius:10px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;">إلغاء</button>
      </div>
    </div>
  </div>

  <!-- Inline Non-Blocking Status Banner (Safe in Android/iOS Captive Portal WebViews) -->
  <div id="portalNotice" role="alert" style="display:none;position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:9999;max-width:92%;padding:12px 18px;border-radius:14px;background:rgba(15,23,42,0.96);border:1px solid rgba(248,113,113,0.55);color:#fecaca;font-size:13px;font-weight:700;box-shadow:0 12px 32px rgba(0,0,0,0.45);text-align:center;"></div>

  <script>
    var currentMode = '${config.loginStyle === 'user-pass' ? 'user' : 'pin'}';
    var qrStream = null;
    var qrInterval = null;
    var noticeTimer = null;

    function showPortalNotice(msg, isError) {
      var box = document.getElementById('portalNotice');
      if (!box) return;
      box.textContent = String(msg || '');
      box.style.borderColor = isError === false ? 'rgba(52,211,153,0.55)' : 'rgba(248,113,113,0.6)';
      box.style.color = isError === false ? '#a7f3d0' : '#fecaca';
      box.style.display = 'block';
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(function() {
        box.style.display = 'none';
      }, 4500);
    }

    function switchLoginMode(mode) {
      currentMode = mode;
      var pinSec = document.getElementById('pinModeSection');
      var userSec = document.getElementById('userPassSection');
      var pinBtn = document.getElementById('tabPinBtn');
      var userBtn = document.getElementById('tabUserBtn');

      if (mode === 'pin') {
        if (pinSec) pinSec.style.display = 'block';
        if (userSec) userSec.style.display = 'none';
        if (pinBtn) pinBtn.classList.add('active');
        if (userBtn) userBtn.classList.remove('active');
        var pinInp = document.getElementById('cardPinInput');
        if (pinInp) pinInp.focus();
      } else {
        if (pinSec) pinSec.style.display = 'none';
        if (userSec) userSec.style.display = 'block';
        if (pinBtn) pinBtn.classList.remove('active');
        if (userBtn) userBtn.classList.add('active');
        var uInp = document.getElementById('usernameInput');
        if (uInp) uInp.focus();
      }
    }

    function openQrScanner() {
      var modal = document.getElementById('qrModal');
      var video = document.getElementById('qrVideo');
      if (modal) modal.style.display = 'flex';

      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
          .then(function(stream) {
            qrStream = stream;
            if (video) {
              video.srcObject = stream;
              video.play();
            }
            startQrDetection();
          })
          .catch(function(err) {
            console.error('Camera access error:', err);
            closeQrScanner();
            showPortalNotice('تعذر فتح الكاميرا، يرجى السماح للتطبيق بالوصول للكاميرا أو إدخال الكود يدوياً.', true);
          });
      } else {
        closeQrScanner();
        showPortalNotice('الكاميرا غير مدعومة في هذا المتصفح، يرجى إدخال الكود يدوياً.', true);
      }
    }

    function closeQrScanner() {
      var modal = document.getElementById('qrModal');
      if (modal) modal.style.display = 'none';
      if (qrStream) {
        qrStream.getTracks().forEach(function(track) { track.stop(); });
        qrStream = null;
      }
      if (qrInterval) {
        clearInterval(qrInterval);
        qrInterval = null;
      }
    }

    function applyScannedCode(code) {
      if (!code) return;
      var cleanCode = code.trim();
      var pinInp = document.getElementById('cardPinInput');
      if (pinInp) pinInp.value = cleanCode;
      closeQrScanner();
      handleLoginSubmit();
      if (document.forms['login']) {
        document.forms['login'].submit();
      }
    }

    function startQrDetection() {
      if ('BarcodeDetector' in window) {
        var detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] });
        var video = document.getElementById('qrVideo');
        qrInterval = setInterval(function() {
          if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            detector.detect(video).then(function(barcodes) {
              if (barcodes && barcodes.length > 0) {
                applyScannedCode(barcodes[0].rawValue);
              }
            }).catch(function() {});
          }
        }, 500);
      }
    }

    function handleLoginSubmit() {
      var form = document.forms['login'];
      if (currentMode === 'pin') {
        var pin = (document.getElementById('cardPinInput').value || '').trim();
        if (!pin) {
          showPortalNotice('يرجى إدخال رقم كرت الإنترنت', true);
          return false;
        }
        var uInp = document.getElementById('usernameInput');
        var pInp = document.getElementById('passwordInput');
        if (uInp) uInp.value = pin;
        if (pInp) pInp.value = ${config.pinPasswordType === 'empty' ? "''" : "pin"};
      } else {
        var u = (document.getElementById('usernameInput').value || '').trim();
        if (!u) {
          showPortalNotice('يرجى كتابة اسم المستخدم', true);
          return false;
        }
        var pInp = document.getElementById('passwordInput');
        if (pInp && !pInp.value && ${config.pinPasswordType === 'empty' ? "false" : "true"}) {
          pInp.value = u;
        }
      }
      return true;
    }
  </script>
</body>
</html>`;
}

/**
 * Generate standard MikroTik Hotspot status.html
 */
export function generateHotspotStatusHtml(inputConfig: HotspotPortalCustomization): string {
  const config = sanitizeConfig(inputConfig);
  const theme = THEME_PRESETS[config.themePreset] || THEME_PRESETS['cyber-indigo'];

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.networkName} - حالة الاتصال بالإنترنت</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Tajawal', -apple-system, sans-serif;
      background: ${theme.bgGradient};
      color: #ffffff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      direction: rtl;
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: ${theme.cardBg};
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 24px;
      padding: 24px;
      text-align: center;
      backdrop-filter: blur(16px);
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 4px 12px;
      border-radius: 100px;
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 12px;
    }
    .grid-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 18px 0;
      text-align: right;
    }
    .info-box {
      background: rgba(0,0,0,0.3);
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .info-label { font-size: 11px; color: #94a3b8; }
    .info-val { font-size: 13px; font-weight: 800; color: #f8fafc; font-family: monospace; }
    .btn-logout {
      width: 100%;
      padding: 12px;
      border: 1px solid rgba(239, 68, 68, 0.4);
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      font-size: 14px;
      font-weight: 800;
      border-radius: 14px;
      cursor: pointer;
      text-decoration: none;
      display: block;
      transition: all 0.2s;
    }
    .btn-logout:hover { background: rgba(239, 68, 68, 0.4); }
  </style>
</head>
<body>
  <div class="card">
    <div class="status-badge">
      <span>●</span> متصل بالإنترنت بنجاح
    </div>
    <h2 style="font-size: 20px; font-weight: 900;">مرحباً، $(username)</h2>
    <p style="font-size: 12px; color: #94a3b8; margin-top: 2px;">أنت الآن متصل بشبكة ${config.networkName}</p>

    <div class="grid-info">
      <div class="info-box">
        <span class="info-label">عنوان IP الجهاز:</span>
        <span class="info-val">$(ip)</span>
      </div>
      <div class="info-box">
        <span class="info-label">عنوان MAC:</span>
        <span class="info-val">$(mac)</span>
      </div>
      <div class="info-box">
        <span class="info-label">مدة الاتصال:</span>
        <span class="info-val">$(uptime)</span>
      </div>
      <div class="info-box">
        <span class="info-label">الوقت المتبقي:</span>
        <span class="info-val">$(session-time-left)</span>
      </div>
      <div class="info-box">
        <span class="info-label">التحميل (Download):</span>
        <span class="info-val" style="color: #38bdf8;">$(bytes-out-nice)</span>
      </div>
      <div class="info-box">
        <span class="info-label">الرفع (Upload):</span>
        <span class="info-val" style="color: #34d399;">$(bytes-in-nice)</span>
      </div>
    </div>

    <form action="$(link-logout)" name="logout" method="post">
      <button type="submit" class="btn-logout">قطع الاتصال (تسجيل الخروج)</button>
    </form>
  </div>
</body>
</html>`;
}

/**
 * Generate standard MikroTik Hotspot logout.html
 */
export function generateHotspotLogoutHtml(inputConfig: HotspotPortalCustomization): string {
  const config = sanitizeConfig(inputConfig);
  const theme = THEME_PRESETS[config.themePreset] || THEME_PRESETS['cyber-indigo'];

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.networkName} - تم تسجيل الخروج</title>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@600;800;900&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Tajawal', sans-serif;
      background: ${theme.bgGradient};
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      direction: rtl;
    }
    .card {
      width: 100%;
      max-width: 400px;
      background: ${theme.cardBg};
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 24px;
      padding: 28px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .btn {
      display: inline-block;
      margin-top: 16px;
      background: ${theme.buttonGradient};
      color: #fff;
      padding: 12px 24px;
      border-radius: 14px;
      text-decoration: none;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2 style="font-size: 22px; font-weight: 900; margin-bottom: 8px;">تم تسجيل الخروج بنجاح</h2>
    <p style="font-size: 13px; color: #94a3b8;">شكراً لاستخدامك شبكة ${config.networkName}. يمكنك تسجيل الدخول مجدداً في أي وقت.</p>
    <a href="$(link-login)" class="btn">تسجيل الدخول مجدداً</a>
  </div>
</body>
</html>`;
}

/**
 * Generate standard MikroTik Hotspot alogin.html (redirect page after login)
 */
export function generateHotspotAloginHtml(config: HotspotPortalCustomization): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="2; url=$(link-redirect)">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تم التحقق بنجاح</title>
  <style>
    body {
      background: #030712;
      color: #ffffff;
      font-family: sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
      margin: 0;
      direction: rtl;
    }
    .spinner {
      width: 48px;
      height: 48px;
      border: 4px solid rgba(255,255,255,0.1);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h2>تم تسجيل الدخول بنجاح!</h2>
  <p style="color: #94a3b8; font-size: 14px; margin-top: 6px;">جاري توجيهك إلى الإنترنت، انتظر لحظات...</p>
  <a href="$(link-redirect)" style="color: #38bdf8; margin-top: 12px; font-size: 12px;">انقر هنا إذا لم يتم التوجيه تلقائياً</a>
</body>
</html>`;
}

/**
 * Export all portal files packaged into a ready-to-use ZIP file for MikroTik WinBox
 */
export async function exportPortalZip(config: HotspotPortalCustomization): Promise<Blob> {
  const zip = new JSZip();

  const folderName = (config.targetHtmlDir || 'hotspot').replace(/[^a-zA-Z0-9_-]/g, '') || 'hotspot';
  const folder = zip.folder(folderName) || zip;

  const loginHtml = generateHotspotLoginHtml(config);
  const statusHtml = generateHotspotStatusHtml(config);
  const logoutHtml = generateHotspotLogoutHtml(config);
  const aloginHtml = generateHotspotAloginHtml(config);

  folder.file('login.html', loginHtml);
  folder.file('status.html', statusHtml);
  folder.file('logout.html', logoutHtml);
  folder.file('alogin.html', aloginHtml);
  folder.file('rlogin.html', aloginHtml);

  // Add Readme instruction
  const readme = `========================================================
قالب صفحة تسجيل الدخول لشبكة المايكروتك (Hotspot Portal)
الشبكة: ${config.networkName}
تاريخ التوليد: ${new Date().toLocaleString('ar-EG')}
========================================================

طريقة التثبيت في راوتر المايكروتك:
1. افتح برنامج WinBox وسجل الدخول للراوتر.
2. اذهب إلى قائمة Files في القائمة الجانبية.
3. قم بسحب مجلد "${folderName}" وإفلاته داخل Files.
4. اذهب إلى IP -> Hotspot -> Server Profiles.
5. افتح بروفايل البوابة (مثلاً ${config.targetProfileName || 'hsprof1'}) واضبط:
   - HTML Directory: ${folderName}
   - DNS Name: ${config.targetDnsName || 'login.net'}
6. انقر Apply و OK ومبروك!
========================================================
`;
  folder.file('README.txt', readme);

  return await zip.generateAsync({ type: 'blob' });
}
