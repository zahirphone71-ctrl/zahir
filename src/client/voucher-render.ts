// ============================================================
// محرك الرندرة والطباعة والتصدير لكروت المايكروتك
// ============================================================

import { LAYOUT_OPTIONS, type VoucherItem, type PrintLayoutOption } from '../shared/voucher-types.ts';
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

// توليد QR Code بتنسيق SVG مضغوط وخفيف
export function generateSvgQrCode(text: string, size: number = 36): string {
  const matrixSize = 25;
  const cells: boolean[][] = Array(matrixSize).fill(false).map(() => Array(matrixSize).fill(false));

  function drawFinder(r: number, c: number) {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (
          i === 0 || i === 6 || j === 0 || j === 6 ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4)
        ) {
          cells[r + i][c + j] = true;
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, matrixSize - 7);
  drawFinder(matrixSize - 7, 0);

  for (let i = 8; i < matrixSize - 8; i++) {
    cells[6][i] = i % 2 === 0;
    cells[i][6] = i % 2 === 0;
  }

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }

  let bitIdx = 0;
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      const inFinderTL = r < 8 && c < 8;
      const inFinderTR = r < 8 && c >= matrixSize - 8;
      const inFinderBL = r >= matrixSize - 8 && c < 8;
      if (inFinderTL || inFinderTR || inFinderBL) continue;
      if (r === 6 || c === 6) continue;

      const charCode = text.charCodeAt(bitIdx % text.length) || 42;
      const val = ((hash ^ (r * 31 + c * 17) ^ (charCode << (bitIdx % 7))) & 1) === 1;
      cells[r][c] = val;
      bitIdx++;
    }
  }

  const cellSize = size / matrixSize;
  let paths = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (cells[r][c]) {
        paths += `M${(c * cellSize).toFixed(2)},${(r * cellSize).toFixed(2)}h${cellSize.toFixed(2)}v${cellSize.toFixed(2)}h-${cellSize.toFixed(2)}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block;background:#fff;border-radius:2px;padding:1px;"><rect width="100%" height="100%" fill="white"/><path d="${paths}" fill="black"/></svg>`;
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

  const layout = LAYOUT_OPTIONS.find(l => l.id === layoutId) || LAYOUT_OPTIONS[1];
  const cols = layout.cols;
  const rows = layout.rows;
  const isPos = options.isPos || layoutId.startsWith('pos');

  const cardsPerPage = isPos ? 1 : cols * rows;
  const totalCards = vouchers.length;
  const totalPages = isPos ? totalCards : Math.max(1, Math.ceil(totalCards / cardsPerPage));

  // إعدادات الكثافة والأحجام
  const isUltraDense = cols >= 15 || rows >= 15; // 20x20
  const isHighDense = cols >= 8 || rows >= 8;    // 10x10
  const isMediumDense = cols >= 4;               // 4x10, 5x10

  let codeFontSize = '8.5pt';
  let headerFontSize = '6.5pt';
  let footerFontSize = '5.5pt';
  let cardPadding = '2.5mm';
  let qrSize = 32;

  if (isUltraDense) {
    codeFontSize = '3.8pt';
    headerFontSize = '3.2pt';
    footerFontSize = '2.8pt';
    cardPadding = '0.5mm 1mm';
    qrSize = 12;
  } else if (isHighDense) {
    codeFontSize = '5.5pt';
    headerFontSize = '4.5pt';
    footerFontSize = '4pt';
    cardPadding = '1mm 1.5mm';
    qrSize = 20;
  } else if (isMediumDense) {
    codeFontSize = '7pt';
    headerFontSize = '5.8pt';
    footerFontSize = '5pt';
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

  // بناء الكروت
  const pagesHtmlArr: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    const pageVouchers = vouchers.slice(p * cardsPerPage, (p + 1) * cardsPerPage);
    
    const cardsGridHtmlArr: string[] = [];
    for (const v of pageVouchers) {
      const isDual = v.voucherPin && v.voucherPin !== v.voucherCode;
      const qrData = buildAutoLoginQrUrl(loginUrl || "10.0.0.1", v.voucherCode, v.voucherPin, isDual ? "user_pass" : "user_only");
      const qrSvg = showQr ? generateSvgQrCode(qrData, qrSize) : '';

      const cutBorderStyle = showCutLines 
        ? `border: 1px dashed ${borderColor};` 
        : `border: 1px solid ${borderColor};`;

      cardsGridHtmlArr.push(`
        <div class="voucher-card" style="background:${cardBg};color:${cardTextColor};padding:${cardPadding};${cutBorderStyle}">
          <!-- Header -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1mm;font-size:${headerFontSize};border-bottom:1px solid ${borderColor};padding-bottom:1mm;">
            <div style="font-weight:900;color:${accentColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${networkName}
            </div>
            ${showProfileName ? `<div style="font-weight:800;background:${userBoxBg};color:${userBoxColor};padding:1px 4px;border-radius:3px;font-size:${footerFontSize};">${v.profileName || 'عام'}</div>` : ''}
          </div>

          <!-- Body / Credentials -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:2mm;margin:auto 0;">
            <div style="flex:1;min-width:0;">
              <div style="background:${userBoxBg};padding:2px 4px;border-radius:4px;border:1px solid ${borderColor};margin-bottom:${isDual ? '1.5mm' : '0'};text-align:center;">
                <div style="font-size:${footerFontSize};color:#64748b;font-weight:700;line-height:1;">${isDual ? 'المستخدم' : 'كود الدخول'}</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:${codeFontSize};font-weight:900;color:${userBoxColor};letter-spacing:1px;direction:ltr;">
                  ${v.voucherCode}
                </div>
              </div>
              ${isDual ? `
                <div style="background:${passBoxBg};padding:2px 4px;border-radius:4px;border:1px solid ${borderColor};text-align:center;">
                  <div style="font-size:${footerFontSize};color:#b45309;font-weight:700;line-height:1;">كلمة المرور</div>
                  <div style="font-family:'JetBrains Mono',monospace;font-size:${codeFontSize};font-weight:900;color:${passBoxColor};letter-spacing:1px;direction:ltr;">
                    ${v.voucherPin}
                  </div>
                </div>
              ` : ''}
            </div>
            ${showQr ? `<div style="flex-shrink:0;">${qrSvg}</div>` : ''}
          </div>

          <!-- Footer -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1mm;font-size:${footerFontSize};border-top:1px solid ${borderColor};padding-top:1mm;">
            <div style="font-weight:800;color:#10b981;">${v.price ? `${v.price} ${currencySymbol}` : `${v.timeLimit || 'محدد'}`}</div>
            ${showDataLimit && v.dataLimit ? `<div style="color:#6366f1;font-weight:700;">${v.dataLimit}</div>` : `<div style="color:#64748b;direction:ltr;">${loginUrl}</div>`}
          </div>
        </div>
      `);
    }

    const cardsGridHtml = cardsGridHtmlArr.join('');

    if (isPos) {
      const posWidth = layoutId === 'pos58' ? '58mm' : '80mm';
      pagesHtmlArr.push(`
        <div class="pos-receipt-page" style="width:${posWidth};padding:3mm;background:#fff;margin:0 auto 15px;box-shadow:0 4px 10px rgba(0,0,0,0.15);">
          ${cardsGridHtml}
        </div>
      `);
    } else {
      pagesHtmlArr.push(`
        <div class="a4-page">
          <div class="page-meta-header no-print">
            <span>⚡ ${networkName} — منظومة كروت ZCtrl</span>
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
  <title>كروت ${networkName} — ZCtrl</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=Cairo:wght@600;800;900&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Tajawal','Cairo',-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#334155;padding:80px 10px 40px;direction:rtl;-webkit-font-smoothing:antialiased}
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
    .page-meta-header{font-size:8pt;color:#94a3b8;display:flex;justify-content:space-between;padding-bottom:2mm;border-bottom:0.5px solid #e2e8f0;margin-bottom:1.5mm}
    .voucher-grid{display:grid;gap:1.5px;width:100%;height:100%;box-sizing:border-box;flex:1;overflow:hidden}
    .voucher-card{box-sizing:border-box;overflow:hidden;page-break-inside:avoid;break-inside:avoid;display:flex;flex-direction:column;justify-content:space-between;position:relative;border-radius:2px}
    .hide-cut-lines .voucher-card{border:none!important}
    @page{size:A4 portrait;margin:0mm}
    @media print{
      html,body{background:#fff!important;color:#000!important;padding:0!important;margin:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
      .no-print{display:none!important}
      .a4-page{margin:0!important;padding:3mm!important;width:210mm!important;height:297mm!important;max-height:297mm!important;box-shadow:none!important;border-radius:0!important;page-break-after:always!important;break-after:page!important}
      .pos-receipt-page{margin:0 auto!important;box-shadow:none!important;page-break-after:always!important}
      .voucher-card{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
      img, canvas{image-rendering:crisp-edges!important;image-rendering:pixelated!important}
    }
  </style>
</head>
<body>
  <div class="floating-toolbar no-print">
    <div class="toolbar-info">
      <div class="toolbar-title">⚡ كروت ${networkName}</div>
      <div class="toolbar-badge">إجمالي: ${totalCards} كرت</div>
      <div class="toolbar-badge">${cols}×${rows} (${cardsPerPage}/صفحة)</div>
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

  <!-- PROGRESS OVERLAY -->
  <div id="pdf-progress-overlay" style="display:none; position:fixed; inset:0; background:rgba(15, 23, 42, 0.88); backdrop-filter:blur(8px); z-index:999999; flex-direction:column; align-items:center; justify-content:center; color:#ffffff;">
    <div style="background:#1e293b; border:1px solid #4f46e5; border-radius:18px; padding:28px 36px; max-width:440px; width:90%; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.6);">
      <div style="font-size:32px; margin-bottom:12px;">⚡</div>
      <h3 style="font-size:17px; font-weight:900; margin-bottom:6px; color:#facc15;">جاري إنشاء وتصدير ملف PDF عالي الدقة</h3>
      <p id="pdf-progress-msg" style="font-size:13px; color:#94a3b8; margin-bottom:16px;">جاري إعداد الصفحات والمحرك...</p>
      
      <div style="width:100%; height:10px; background:#0f172a; border-radius:999px; overflow:hidden; border:1px solid #334155; margin-bottom:10px;">
        <div id="pdf-progress-bar" style="width:5%; height:100%; background:linear-gradient(90deg, #4f46e5, #06b6d4, #10b981); transition:width 0.2s ease; border-radius:999px;"></div>
      </div>
      
      <div id="pdf-progress-percent" style="font-size:12px; font-weight:700; color:#38bdf8; font-family:monospace;">5%</div>
    </div>
  </div>

  <div id="pages-container">${pagesHtml}</div>

  <!-- SCRIPTS FOR PDF EXPORT -->
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>

  <script>
    function yieldThread() {
      return new Promise(function(resolve) {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(function() { setTimeout(resolve, 15); });
        } else {
          setTimeout(resolve, 20);
        }
      });
    }

    async function loadScriptIfMissing(src) {
      return new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        s.onload = function() { resolve(); };
        s.onerror = function() { reject(new Error('Failed to load ' + src)); };
        document.head.appendChild(s);
      });
    }

    async function saveAsPdf() {
      var overlay = document.getElementById('pdf-progress-overlay');
      var bar = document.getElementById('pdf-progress-bar');
      var msg = document.getElementById('pdf-progress-msg');
      var pct = document.getElementById('pdf-progress-percent');

      function updateProgress(percent, text) {
        if (overlay) overlay.style.display = 'flex';
        if (bar) bar.style.width = Math.min(100, Math.max(0, percent)) + '%';
        if (pct) pct.textContent = Math.round(percent) + '%';
        if (msg && text) msg.textContent = text;
      }

      updateProgress(5, 'جاري تحضير المحرك والمكتبات...');

      try {
        if (typeof window.jspdf === 'undefined') {
          await loadScriptIfMissing('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
        }
        if (typeof window.html2canvas === 'undefined') {
          await loadScriptIfMissing('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        }
      } catch (err) {
        console.warn('CDN script load failed, falling back to print:', err);
        if (overlay) overlay.style.display = 'none';
        window.print();
        return;
      }

      if (typeof window.jspdf === 'undefined' || typeof window.html2canvas === 'undefined') {
        if (overlay) overlay.style.display = 'none';
        window.print();
        return;
      }

      try {
        var jsPDF = window.jspdf.jsPDF;
        var pages = document.querySelectorAll('.a4-page, .pos-receipt-page');
        if (!pages || pages.length === 0) {
          if (overlay) overlay.style.display = 'none';
          console.warn('لا توجد صفحات للتصدير');
          return;
        }

        var isPos = pages[0].classList.contains('pos-receipt-page');
        var pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: isPos ? [80, 200] : 'a4',
          compress: true
        });

        var pdfWidth = isPos ? 80 : 210;
        var pdfHeight = isPos ? 200 : 297;
        var totalPages = pages.length;

        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }

        for (var i = 0; i < totalPages; i++) {
          var page = pages[i];
          var pageNum = i + 1;
          var baseProgress = 10 + Math.round((i / totalPages) * 80);
          
          updateProgress(baseProgress, 'معالجة وتصيير صفحة ' + pageNum + ' من ' + totalPages + '...');
          await yieldThread();

          var renderScale = totalPages > 5 ? 2.2 : 2.8;
          var canvas = await html2canvas(page, {
            scale: renderScale,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            logging: false,
            ignoreElements: function(node) {
              return node.classList && node.classList.contains('no-print');
            }
          });

          var imgData = canvas.toDataURL('image/jpeg', 0.98);

          if (i > 0) {
            pdf.addPage(isPos ? [80, 200] : 'a4', 'portrait');
          }

          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

          canvas.width = 1;
          canvas.height = 1;
          await yieldThread();
        }

        updateProgress(96, 'جاري تنزيل ملف PDF...');
        await yieldThread();

        var sanitizedName = "${networkName.replace(/["'\\]/g, '')}".replace(/\\s+/g, '_') || 'vouchers';
        pdf.save('vouchers-' + sanitizedName + '-' + Date.now() + '.pdf');

        updateProgress(100, 'تم التصدير بنجاح!');
        await new Promise(function(r) { setTimeout(r, 600); });
      } catch (e) {
        console.error('PDF Generation error:', e);
        if (overlay) overlay.style.display = 'none';
        window.print();
      } finally {
        if (overlay) overlay.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;
}
