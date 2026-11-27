// ============================================================
// محرك الرندرة والطباعة والتصدير لكروت المايكروتك (يعمل 100% أوفلاين)
// ============================================================

import QRCode from 'qrcode';
import { LAYOUT_OPTIONS, type VoucherItem } from '../shared/voucher-types.ts';
import { buildAutoLoginQrUrl } from '../components/VoucherStudio/qrUtils.ts';

export interface RenderOptions {
  vouchers: VoucherItem[];
  networkName?: string;
  currencySymbol?: string;
  loginUrl?: string;
  layoutId?: string;
  theme?: 'modern' | 'classic' | 'dark' | 'luxury' | 'minimal' | 'gamer' | 'swiss' | 'glass';
  showCutLines?: boolean;
  showQr?: boolean;
  showDataLimit?: boolean;
  showProfileName?: boolean;
  isPos?: boolean;
}

function escapeHtml(val: unknown): string {
  const str = String(val ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

// توليد QR Code حقيقي وقابل للمسح بتنسيق SVG أوفلاين بالكامل عبر QRCode.create
export function generateSvgQrCode(text: string, size: number = 36): string {
  try {
    const qr = QRCode.create(text || '10.0.0.1', { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const data = qr.modules.data;
    const quiet = 1;
    const viewSize = count + quiet * 2;
    let d = '';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (data[r * count + c]) {
          d += `M${c + quiet},${r + quiet}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" width="${size}" height="${size}" shape-rendering="crispEdges" style="display:block;background:#fff;border-radius:2px;"><rect width="${viewSize}" height="${viewSize}" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`;
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><rect width="24" height="24" fill="#ffffff" stroke="#cbd5e1"/></svg>`;
  }
}

export function renderVouchersFullHtml(options: RenderOptions): string {
  const {
    vouchers = [],
    networkName = 'شبكة زاهر للإنترنت',
    currencySymbol = 'ريال',
    loginUrl = '10.0.0.1',
    layoutId = '3x7',
    theme = 'modern',
    showCutLines = true,
    showQr = true,
    showDataLimit = true,
    showProfileName = true
  } = options;

  if (!Array.isArray(vouchers) || vouchers.length === 0) {
    throw new Error('لا توجد كروت للتصدير أو الطباعة');
  }

  const layout = LAYOUT_OPTIONS.find((l) => l.id === layoutId) || LAYOUT_OPTIONS[1];
  const cols = layout.cols;
  const rows = layout.rows;
  const isPos = Boolean(options.isPos || layoutId.startsWith('pos'));
  const is58mm = layoutId === 'pos58' || layoutId === 'pos_58mm' || layoutId === 'thermal_58mm';

  const cardsPerPage = isPos ? 1 : cols * rows;
  const totalCards = vouchers.length;
  const totalPages = isPos ? totalCards : Math.max(1, Math.ceil(totalCards / cardsPerPage));

  // إعدادات الكثافة والأحجام مع احترام حد القراءة الآمن (>= 6pt للنصوص الثانوية)
  const isUltraDense = cols >= 15 || rows >= 15; // 20x20
  const isHighDense = cols >= 8 || rows >= 8;    // 10x10
  const isMediumDense = cols >= 4;               // 4x10, 5x10

  let codeFontSize = '8.5pt';
  let headerFontSize = '6.5pt';
  let footerFontSize = '6pt';
  let cardPadding = '2.5mm';
  let qrSize = 32;

  if (isUltraDense) {
    codeFontSize = '6.5pt';
    headerFontSize = '6pt';
    footerFontSize = '6pt';
    cardPadding = '0.6mm 1mm';
    qrSize = 14;
  } else if (isHighDense) {
    codeFontSize = '7pt';
    headerFontSize = '6pt';
    footerFontSize = '6pt';
    cardPadding = '1mm 1.5mm';
    qrSize = 20;
  } else if (isMediumDense) {
    codeFontSize = '7.5pt';
    headerFontSize = '6pt';
    footerFontSize = '6pt';
    cardPadding = '1.5mm 2mm';
    qrSize = 26;
  }

  // ألوان الثيمات
  let cardBg = '#ffffff';
  let cardTextColor = '#0f172a';
  let userBoxBg = '#f1f5f9';
  let userBoxColor = '#0f172a';
  let passBoxBg = '#fef3c7';
  let passBoxColor = '#92400e';
  let accentColor = '#4f46e5';
  let borderColor = '#cbd5e1';

  if (theme === 'dark') {
    cardBg = '#0f172a';
    cardTextColor = '#f8fafc';
    userBoxBg = '#1e293b';
    userBoxColor = '#38bdf8';
    passBoxBg = '#332200';
    passBoxColor = '#fbbf24';
    accentColor = '#38bdf8';
    borderColor = '#334155';
  } else if (theme === 'gamer') {
    cardBg = '#030712';
    cardTextColor = '#f3f4f6';
    userBoxBg = '#111827';
    userBoxColor = '#a855f7';
    passBoxBg = '#180a29';
    passBoxColor = '#ec4899';
    accentColor = '#a855f7';
    borderColor = '#374151';
  } else if (theme === 'luxury') {
    cardBg = '#18181b';
    cardTextColor = '#fef08a';
    userBoxBg = '#27272a';
    userBoxColor = '#facc15';
    passBoxBg = '#2a2410';
    passBoxColor = '#fef08a';
    accentColor = '#eab308';
    borderColor = '#52525b';
  } else if (theme === 'swiss') {
    cardBg = '#ffffff';
    cardTextColor = '#000000';
    userBoxBg = '#f4f4f5';
    userBoxColor = '#000000';
    passBoxBg = '#e4e4e7';
    passBoxColor = '#000000';
    accentColor = '#dc2626';
    borderColor = '#a1a1aa';
  }

  const safeNetworkName = escapeHtml(networkName);
  const safeCurrency = escapeHtml(currencySymbol);
  const safeLoginUrl = escapeHtml(loginUrl);
  const posWidthMm = is58mm ? 58 : 80;

  // بناء الكروت
  const pagesHtmlArr: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    const pageVouchers = vouchers.slice(p * cardsPerPage, (p + 1) * cardsPerPage);
    const cardsGridHtmlArr: string[] = [];

    for (const v of pageVouchers) {
      const isDual = Boolean(v.voucherPin && v.voucherPin !== v.voucherCode);
      const qrData = buildAutoLoginQrUrl(
        loginUrl || '10.0.0.1',
        v.voucherCode,
        v.voucherPin,
        isDual ? 'user_pass' : 'user_only'
      );
      const qrSvg = showQr ? generateSvgQrCode(qrData, qrSize) : '';
      const cutBorderStyle = showCutLines
        ? `border: 1px dashed ${borderColor};`
        : `border: 1px solid ${borderColor};`;

      const safeCode = escapeHtml(v.voucherCode);
      const safePin = escapeHtml(v.voucherPin);
      const safeProfile = escapeHtml(v.profileName || 'عام');
      const safeTime = escapeHtml(v.timeLimit || 'محدد');
      const safeData = escapeHtml(v.dataLimit);
      const safePrice = escapeHtml(v.price);

      cardsGridHtmlArr.push(`
        <div class="voucher-card" style="background:${cardBg};color:${cardTextColor};padding:${cardPadding};${cutBorderStyle}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1mm;font-size:${headerFontSize};border-bottom:1px solid ${borderColor};padding-bottom:0.8mm;">
            <div style="font-weight:900;color:${accentColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${safeNetworkName}
            </div>
            ${showProfileName ? `<div style="font-weight:800;background:${userBoxBg};color:${userBoxColor};padding:1px 4px;border-radius:3px;font-size:${footerFontSize};">${safeProfile}</div>` : ''}
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;gap:1.5mm;margin:auto 0;">
            <div style="flex:1;min-width:0;">
              <div style="background:${userBoxBg};padding:2px 4px;border-radius:4px;border:1px solid ${borderColor};margin-bottom:${isDual ? '1.2mm' : '0'};text-align:center;">
                <div style="font-size:${footerFontSize};color:#64748b;font-weight:700;line-height:1;">${isDual ? 'المستخدم' : 'كود الدخول'}</div>
                <div style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:${codeFontSize};font-weight:900;color:${userBoxColor};letter-spacing:0.8px;direction:ltr;">
                  ${safeCode}
                </div>
              </div>
              ${isDual ? `
                <div style="background:${passBoxBg};padding:2px 4px;border-radius:4px;border:1px solid ${borderColor};text-align:center;">
                  <div style="font-size:${footerFontSize};color:#b45309;font-weight:700;line-height:1;">كلمة المرور</div>
                  <div style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:${codeFontSize};font-weight:900;color:${passBoxColor};letter-spacing:0.8px;direction:ltr;">
                    ${safePin}
                  </div>
                </div>
              ` : ''}
            </div>
            ${showQr ? `<div style="flex-shrink:0;">${qrSvg}</div>` : ''}
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.8mm;font-size:${footerFontSize};border-top:1px solid ${borderColor};padding-top:0.8mm;">
            <div style="font-weight:800;color:#10b981;">${v.price ? `${safePrice} ${safeCurrency}` : safeTime}</div>
            ${showDataLimit && v.dataLimit ? `<div style="color:#6366f1;font-weight:700;">${safeData}</div>` : `<div style="color:#64748b;direction:ltr;">${safeLoginUrl}</div>`}
          </div>
        </div>
      `);
    }

    const cardsGridHtml = cardsGridHtmlArr.join('');

    if (isPos) {
      pagesHtmlArr.push(`
        <div class="pos-receipt-page" style="width:${posWidthMm}mm;padding:3mm;background:#fff;margin:0 auto 15px;box-shadow:0 4px 10px rgba(0,0,0,0.15);">
          ${cardsGridHtml}
        </div>
      `);
    } else {
      pagesHtmlArr.push(`
        <div class="a4-page">
          <div class="page-meta-header no-print">
            <span>⚡ ${safeNetworkName} — منظومة كروت ZCtrl</span>
            <span>صفحة ${p + 1} من ${totalPages} — (${pageVouchers.length} كرت)</span>
          </div>
          <div class="voucher-grid" style="grid-template-columns: repeat(${cols}, 1fr); grid-template-rows: repeat(${rows}, 1fr);">
            ${cardsGridHtml}
          </div>
        </div>
      `);
    }
  }

  const pagesHtml = pagesHtmlArr.join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>كروت ${safeNetworkName} — ZCtrl</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Tajawal','Cairo','Segoe UI',Tahoma,Arial,sans-serif;background:#0f172a;color:#334155;padding:80px 10px 40px;direction:rtl;-webkit-font-smoothing:antialiased}
    .floating-toolbar{position:fixed;top:0;left:0;right:0;height:65px;background:linear-gradient(135deg,#1e1b4b,#0f172a);border-bottom:2px solid #4f46e5;box-shadow:0 10px 25px rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:space-between;padding:0 20px;color:#fff}
    .toolbar-info{display:flex;align-items:center;gap:15px;flex-wrap:wrap}
    .toolbar-title{font-size:15px;font-weight:900;color:#facc15}
    .toolbar-badge{background:rgba(99,102,241,0.25);border:1px solid rgba(129,140,248,0.4);padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;color:#e0e7ff}
    .toolbar-actions{display:flex;align-items:center;gap:10px}
    .btn-action{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:800;cursor:pointer;border:none;transition:all 0.2s}
    .btn-pdf{background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;box-shadow:0 4px 12px rgba(239,68,68,0.35);border:1px solid rgba(254,202,202,0.3)}
    .btn-pdf:hover{background:linear-gradient(135deg,#f87171,#dc2626);transform:translateY(-1px)}
    .btn-print{background:linear-gradient(135deg,#4f46e5,#2563eb);color:#fff;box-shadow:0 4px 12px rgba(79,70,229,0.35);border:1px solid rgba(199,210,254,0.3)}
    .btn-print:hover{background:linear-gradient(135deg,#6366f1,#3b82f6);transform:translateY(-1px)}
    .btn-toggle-cut{background:#334155;color:#f1f5f9;border:1px solid #475569}
    .btn-toggle-cut:hover{background:#475569}
    .a4-page{width:210mm;height:297mm;max-height:297mm;margin:0 auto 30px;background:#fff;box-sizing:border-box;padding:4mm;page-break-after:always;break-after:page;page-break-inside:avoid;break-inside:avoid;overflow:hidden;position:relative;display:flex;flex-direction:column;box-shadow:0 10px 35px rgba(0,0,0,0.4);border-radius:2px}
    .page-meta-header{position:absolute;top:1mm;left:4mm;right:4mm;font-size:7pt;color:#94a3b8;display:flex;justify-content:space-between;pointer-events:none;z-index:20}
    .voucher-grid{display:grid;gap:1.5px;width:100%;height:100%;box-sizing:border-box;flex:1;overflow:hidden}
    .voucher-card{box-sizing:border-box;overflow:hidden;page-break-inside:avoid;break-inside:avoid;display:flex;flex-direction:column;justify-content:space-between;position:relative;border-radius:2px}
    .hide-cut-lines .voucher-card{border:none!important}
    .a4-page:last-child,.pos-receipt-page:last-child{page-break-after:auto!important;break-after:auto!important}
    @page{size:${isPos ? `${posWidthMm}mm auto` : 'A4 portrait'};margin:0mm}
    @media print{
      html,body{background:#fff!important;color:#000!important;padding:0!important;margin:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
      .no-print{display:none!important}
      .a4-page{margin:0!important;padding:4mm!important;width:210mm!important;height:297mm!important;max-height:297mm!important;box-shadow:none!important;border-radius:0!important;page-break-after:always!important;break-after:page!important}
      .pos-receipt-page{margin:0 auto!important;box-shadow:none!important;page-break-after:always!important;break-after:page!important}
      .a4-page:last-child,.pos-receipt-page:last-child{page-break-after:auto!important;break-after:auto!important}
      .voucher-card{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
      svg{shape-rendering:crispEdges!important}
    }
  </style>
</head>
<body>
  <div class="floating-toolbar no-print">
    <div class="toolbar-info">
      <div class="toolbar-title">⚡ كروت ${safeNetworkName}</div>
      <div class="toolbar-badge">إجمالي: ${totalCards} كرت</div>
      <div class="toolbar-badge">${isPos ? `حراري ${posWidthMm}mm` : `${cols}×${rows} (${cardsPerPage}/صفحة)`}</div>
      <div class="toolbar-badge">${totalPages} صفحات</div>
    </div>
    <div class="toolbar-actions">
      <button type="button" onclick="saveAsPdf()" class="btn-action btn-pdf">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        حفظ PDF
      </button>
      <button type="button" onclick="window.print()" class="btn-action btn-print">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        طباعة
      </button>
      <button type="button" onclick="document.body.classList.toggle('hide-cut-lines')" class="btn-action btn-toggle-cut">
        ✂️ فواصل القص
      </button>
    </div>
  </div>

  <div id="pages-container">${pagesHtml}</div>

  <script>
    function printVouchers() {
      window.print();
    }
    function saveAsPdf() {
      if (window.zctrlDesktopPrint && typeof window.zctrlDesktopPrint.printToPdf === 'function') {
        window.zctrlDesktopPrint.printToPdf({
          html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML,
          paperType: '${isPos ? (is58mm ? 'thermal_58mm' : 'thermal_80mm') : 'a4'}',
          isPos: ${isPos ? 'true' : 'false'}
        });
        return;
      }
      window.print();
    }
  </script>
</body>
</html>`;
}
