import { VoucherItem, VoucherDesignState, PrintLayoutOption } from './types';
import { THEME_PRESETS } from './themePresets';
import { preGenerateQrCodes } from './qrPreGenerator';
import { getDefaultCoords, CoordsMap } from './smartCoords';
import {
  buildContext,
  computeCoords,
  computeElementStyle,
  computeBoxStyle,
  computeCardStyle,
  computeQrSize,
  computePriceStyle,
  resolveFontStack,
  renderDecorations,
  renderLogos,
} from './voucherRenderCore';
import { yieldToMain } from '../../lib/scheduler';

export interface VoucherHtmlParams {
  vouchers: VoucherItem[];
  design: VoucherDesignState;
  cols?: number;
  rows?: number;
  layout?: PrintLayoutOption;
  networkName: string;
  currencySymbol: string;
  loginUrl: string;
  showPin: boolean;
  showQr: boolean;
  theme?: string;
  isPos?: boolean;
  timeLimit?: string;
  dataLimit?: string;
  qrDataUrlMap?: Map<string, string>;
  fontScale?: number;
  gapMm?: number;
  paddingMm?: number;
  showCutMarks?: boolean;
  qrSize?: number;
  selectedProfileObj?: any;
  signal?: AbortSignal;
}

export async function generateStandaloneVoucherHtml(
  params: VoucherHtmlParams,
  onProgress?: (msg: string) => void
): Promise<string> {
  return generateStandaloneVoucherHtmlAsync(params, onProgress);
}

export async function generateStandaloneVoucherHtmlAsync(
  params: VoucherHtmlParams,
  onProgress?: (msg: string) => void
): Promise<string> {
  const { vouchers, design, networkName, currencySymbol, loginUrl, showPin, showQr, signal } = params;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const themeKey = (params.theme || design?.theme || 'modern') as VoucherDesignState['theme'];
  const preset = THEME_PRESETS[themeKey] || THEME_PRESETS.modern;

  const effectiveNetwork = design?.networkName || networkName || 'شبكة زاهر للإنترنت';
  const effectiveCurrency = design?.currencySymbol || currencySymbol || 'ريال';
  const effectiveShowQr = design?.showQr !== undefined ? design.showQr : showQr;
  const effectiveBgColor = design?.bgColor || preset.bgColor;
  const effectiveTextColor = preset.cardTextColor;
  const effectiveFont = design?.fontFamily || preset.fontFamily || 'Tajawal';
  const effectiveAuthMode = design?.authMode || 'user_only';
  const effectiveShowPin =
    showPin !== undefined
      ? showPin
      : effectiveAuthMode === 'user_pass' ||
        effectiveAuthMode === 'user_equals_pass' ||
        (design as any)?.sameUserPass === true;

  const cols = params.cols || params.layout?.cols || design?.columnsCount || 3;
  const rows = params.rows || params.layout?.rows || design?.rowsCount || 7;
  const isPos = params.isPos !== undefined ? params.isPos : cols === 1 && rows === 1;
  const isLandscape = design?.paperOrientation === 'landscape';
  const showCutMarks = params.showCutMarks ?? true;

  let paperWidth = '210mm';
  let paperHeight = '297mm';
  let pdfFormat = 'A4';

  if (design?.paperType === 'a3') {
    paperWidth = '297mm';
    paperHeight = '420mm';
    pdfFormat = 'A3';
  } else if (design?.paperType === 'a5') {
    paperWidth = '148mm';
    paperHeight = '210mm';
    pdfFormat = 'A5';
  } else if (design?.paperType === 'letter') {
    paperWidth = '215.9mm';
    paperHeight = '279.4mm';
    pdfFormat = 'Letter';
  }

  const finalPageWidth = isLandscape ? paperHeight : paperWidth;
  const finalPageHeight = isLandscape ? paperWidth : paperHeight;
  const finalPageSizeStr = `${pdfFormat} ${isLandscape ? 'landscape' : 'portrait'}`;

  let effectiveVouchers = params.vouchers && params.vouchers.length > 0 ? [...params.vouchers] : [];
  if (effectiveVouchers.length === 0) {
    const totalToGen = Math.max(cols * rows, design?.quantity || 50);
    const prefix = design?.autoPrefix ? (design?.prefixValue || '').trim() : '';
    for (let i = 1; i <= totalToGen; i++) {
      const padNum = String(100000 + i).slice(1);
      const codeStr = `${prefix}${padNum}`;
      const pinNum =
        effectiveAuthMode === 'user_only'
          ? ''
          : effectiveAuthMode === 'user_equals_pass'
          ? codeStr
          : String(1000 + (i % 9000));
      effectiveVouchers.push({
        voucherId: `v-sample-${i}`,
        voucherCode: codeStr,
        voucherPin: pinNum,
        statusCd: 'active',
        price: design?.price !== undefined ? design.price : 500,
        profileName: design?.targetProfile || 'باقة النخبة',
        timeLimit: design?.timeLimit || '30 يوم',
        dataLimit: design?.dataLimit || 'غير محدود',
        createdAt: new Date().toISOString(),
      });
    }
  }

  const fontScale = params.fontScale ?? 1.0;
  const fontMultiplier = (design as any)?.fontScaleMultiplier ?? 1.0;
  const effectiveScale = fontScale * fontMultiplier;

  const ctx = buildContext(design || ({ theme: themeKey } as any), effectiveScale, params.qrSize);
  const coords = computeCoords(design || ({} as any), preset);

  const gapMm = params.gapMm ?? design?.cardGap ?? 4;
  const paddingMm = params.paddingMm ?? design?.cardMarginSide ?? 4;
  const marginTopMm = design?.cardMarginTop ?? paddingMm;
  const marginBottomMm = design?.cardMarginBottom ?? paddingMm;

  const cardsPerPage = isPos ? 1 : cols * rows;
  const totalCards = effectiveVouchers.length;
  const totalPages = isPos ? totalCards : Math.max(1, Math.ceil(totalCards / cardsPerPage));

  const elNetwork = computeElementStyle('network', ctx);
  const elUser = computeElementStyle('user', ctx);
  const elPass = computeElementStyle('password', ctx);
  const elPrice = computeElementStyle('price', ctx);
  const elTime = computeElementStyle('time', ctx);
  const elProfile = computeElementStyle('profile', ctx);
  const elData = computeElementStyle('dataLimit', ctx);

  const qrSize = computeQrSize(ctx);
  const qrBorderRadius =
    preset.qrBorderRadius === 0 ? 0 : Math.max(1, Math.round((preset.qrBorderRadius || 4) * effectiveScale));
  const qrPadding = Math.max(1, Math.round(2 * effectiveScale));

  const baseCardRadius = design?.cardRadiusMm !== undefined ? design.cardRadiusMm : preset.cardRadius;
  const cardRadiusPx = baseCardRadius === 0 ? 0 : Math.max(1, Math.round(baseCardRadius * effectiveScale));
  const cardBorderWidthPx = Math.max(1, Math.round(preset.cardBorderWidth * effectiveScale));
  const cardBorderCss =
    preset.cardBorderStyle === 'none'
      ? 'none'
      : preset.cardBorderStyle === 'double'
      ? `${Math.max(2, cardBorderWidthPx * 3)}px double ${design?.borderColor || preset.borderColor}`
      : `${cardBorderWidthPx}px ${preset.cardBorderStyle} ${design?.borderColor || preset.borderColor}`;

  let qrMap = params.qrDataUrlMap;
  if (effectiveShowQr && (!qrMap || qrMap.size < effectiveVouchers.length)) {
    onProgress?.('جاري توليد باركود QR عالي الوضوح للكروت...');
    qrMap = await preGenerateQrCodes(
      effectiveVouchers,
      design?.loginUrl || loginUrl || '10.0.0.1',
      effectiveAuthMode,
      Math.max(80, Math.round(150 * fontScale)),
      undefined,
      signal
    );
  }

  const pagesHtmlArr: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const startIdx = p * cardsPerPage;
    const endIdx = Math.min(startIdx + cardsPerPage, totalCards);
    const pageVouchers = effectiveVouchers.slice(startIdx, endIdx);

    const filledList: (VoucherItem | null)[] = [...pageVouchers];
    if (!isPos) {
      while (filledList.length < cardsPerPage) {
        filledList.push(null);
      }
    }

    const cardsHtmlArr: string[] = [];
    for (const v of filledList) {
      if (!v) {
        cardsHtmlArr.push(`
        <div class="vc-wrapper ${showCutMarks ? 'has-cut' : ''}">
          <div class="vc empty-vc" style="visibility: ${isPos ? 'hidden' : 'visible'};"></div>
        </div>`);
        continue;
      }

      const qrDataUrl = effectiveShowQr && qrMap ? qrMap.get(v.voucherCode) || '' : '';
      const cardPrice = v.price !== undefined ? v.price : design?.price !== undefined ? design.price : 500;
      const isUnsynced = v.isSynced === false;

      cardsHtmlArr.push(`
      <div class="vc-wrapper ${showCutMarks ? 'has-cut' : ''}" style="${isUnsynced ? 'border: 1px dashed #f43f5e !important;' : ''}">
        <div class="vc" style="background:${preset.cardBgGradient || effectiveBgColor}; color:${effectiveTextColor}; border:${cardBorderCss}; border-radius:${cardRadiusPx}px; box-shadow:${preset.cardShadow || 'none'}; font-family:${resolveFontStack(preset.fontFamily || effectiveFont)};">
          ${design?.bgImage ? `<div class="bg-img" style="background-image:url('${design.bgImage}');"></div>` : ''}

          <!-- Decorative horizontal line -->
          ${preset.showDecorativeLine ? `
          <div style="position:absolute; left:5%; right:5%; top:28%; height:${Math.max(0.5, effectiveScale)}px; background:${preset.decorativeLineColor || 'rgba(255,255,255,0.2)'}; z-index:1; pointer-events:none;"></div>` : ''}

          <!-- Decorative corner accents -->
          ${preset.showCornerAccents ? `
          <div style="position:absolute; top:${Math.max(2, Math.round(4 * effectiveScale))}px; right:${Math.max(2, Math.round(4 * effectiveScale))}px; width:${Math.max(6, Math.round(12 * effectiveScale))}px; height:${Math.max(6, Math.round(12 * effectiveScale))}px; border-top:2px solid ${preset.cornerAccentColor || preset.borderColor}; border-right:2px solid ${preset.cornerAccentColor || preset.borderColor}; z-index:1; pointer-events:none;"></div>
          <div style="position:absolute; bottom:${Math.max(2, Math.round(4 * effectiveScale))}px; left:${Math.max(2, Math.round(4 * effectiveScale))}px; width:${Math.max(6, Math.round(12 * effectiveScale))}px; height:${Math.max(6, Math.round(12 * effectiveScale))}px; border-bottom:2px solid ${preset.cornerAccentColor || preset.borderColor}; border-left:2px solid ${preset.cornerAccentColor || preset.borderColor}; z-index:1; pointer-events:none;"></div>` : ''}

          <!-- Network Title -->
          ${elNetwork.show !== false && design?.showNetworkName !== false ? `
          <div class="el" style="left:${coords.network.x}%; top:${coords.network.y}%; transform:translate(-50%, -50%) rotate(${elNetwork.rotation || 0}deg); color:${elNetwork.color}; font-size:${elNetwork.fontSize}px; font-weight:${elNetwork.fontWeight}; font-family:${resolveFontStack(elNetwork.fontFamily)}; letter-spacing:${elNetwork.letterSpacing}px; text-shadow:${elNetwork.textShadow};">
            ${effectiveNetwork}
          </div>` : ''}

          <!-- Price Tag -->
          ${elPrice.show !== false ? `
          <div class="el" style="left:${coords.price.x}%; top:${coords.price.y}%; transform:translate(-50%, -50%) rotate(${elPrice.rotation || 0}deg); color:${elPrice.color}; font-size:${elPrice.fontSize}px; font-weight:${elPrice.fontWeight}; font-family:${resolveFontStack(elPrice.fontFamily)}; letter-spacing:${elPrice.letterSpacing}px; text-shadow:${elPrice.textShadow};">
            ${cardPrice} ${effectiveCurrency}
          </div>` : ''}

          <!-- Profile Name -->
          ${elProfile.show !== false && (v.profileName || design?.targetProfile) && coords.profile ? `
          <div class="el" style="left:${coords.profile.x}%; top:${coords.profile.y}%; transform:translate(-50%, -50%) rotate(${elProfile.rotation || 0}deg); color:${elProfile.color}; font-size:${elProfile.fontSize}px; font-weight:${elProfile.fontWeight}; font-family:${resolveFontStack(elProfile.fontFamily)}; letter-spacing:${elProfile.letterSpacing}px; text-shadow:${elProfile.textShadow}; opacity:0.9;">
            🏷️ ${v.profileName || design?.targetProfile}
          </div>` : ''}

          <!-- Username / Code -->
          ${elUser.show !== false ? `
          <div class="el" style="left:${coords.user.x}%; top:${coords.user.y}%; transform:translate(-50%, -50%) rotate(${elUser.rotation || 0}deg); color:${elUser.color}; font-size:${elUser.fontSize}px; font-weight:${elUser.fontWeight}; font-family:${resolveFontStack(elUser.fontFamily)}; letter-spacing:${elUser.letterSpacing}px; text-shadow:${elUser.textShadow};">
            <span style="font-size:75%; opacity:0.8; margin-left:2px; font-family:${resolveFontStack(effectiveFont)};">كود:</span><span>${v.voucherCode}</span>
          </div>` : ''}

          <!-- Password / PIN -->
          ${(effectiveAuthMode === 'user_pass' || effectiveAuthMode === 'user_equals_pass' || (design as any)?.sameUserPass) && effectiveShowPin && elPass.show !== false && !((effectiveAuthMode === 'user_equals_pass' || (design as any)?.sameUserPass) && design?.hidePasswordIfEqual) ? `
          <div class="el" style="left:${coords.password.x}%; top:${coords.password.y}%; transform:translate(-50%, -50%) rotate(${elPass.rotation || 0}deg); color:${elPass.color}; font-size:${elPass.fontSize}px; font-weight:${elPass.fontWeight}; font-family:${resolveFontStack(elPass.fontFamily)}; letter-spacing:${elPass.letterSpacing}px; text-shadow:${elPass.textShadow};">
            <span style="font-size:75%; opacity:0.8; margin-left:2px; font-family:${resolveFontStack(effectiveFont)};">باسورد:</span><span>${effectiveAuthMode === 'user_equals_pass' || (design as any)?.sameUserPass ? v.voucherCode : v.voucherPin || v.voucherCode}</span>
          </div>` : ''}

          <!-- QR Code -->
          ${effectiveShowQr && qrDataUrl ? `
          <div class="qr-wrap" style="left:${coords.qr.x}%; top:${coords.qr.y}%; background:${preset.qrBg || '#ffffff'}; padding:${qrPadding}px; border-radius:${qrBorderRadius}px; box-shadow:${preset.qrShadow || '0 2px 6px rgba(0,0,0,0.25)'};">
            <img src="${qrDataUrl}" alt="QR" style="width:${qrSize}px; height:${qrSize}px; display:block; border-radius:${Math.max(0, qrBorderRadius - 1)}px;" />
          </div>` : ''}

          <!-- Time Validity -->
          ${elTime.show !== false ? `
          <div class="el" style="left:${coords.time.x}%; top:${coords.time.y}%; transform:translate(-50%, -50%) rotate(${elTime.rotation || 0}deg); color:${elTime.color}; font-size:${elTime.fontSize}px; font-weight:${elTime.fontWeight}; font-family:${resolveFontStack(elTime.fontFamily)}; letter-spacing:${elTime.letterSpacing}px; text-shadow:${elTime.textShadow}; opacity:0.9;">
            ⏱️ ${v.timeLimit || design?.timeLimit || '30 يوم'}
          </div>` : ''}

          <!-- Data Limit -->
          ${elData.show !== false && coords.dataLimit ? `
          <div class="el" style="left:${coords.dataLimit.x}%; top:${coords.dataLimit.y}%; transform:translate(-50%, -50%) rotate(${elData.rotation || 0}deg); color:${elData.color}; font-size:${elData.fontSize}px; font-weight:${elData.fontWeight}; font-family:${resolveFontStack(elData.fontFamily)}; letter-spacing:${elData.letterSpacing}px; text-shadow:${elData.textShadow}; opacity:0.9;">
            📊 ${v.dataLimit || design?.dataLimit || 'غير محدود'}
          </div>` : ''}

          <!-- Custom Text 1 -->
          ${design?.customText1Content ? `
          <div class="el" style="left:${coords.customText1?.x ?? 50}%; top:${coords.customText1?.y ?? 91}%; transform:translate(-50%, -50%); color:${effectiveTextColor}; font-size:${Math.max(4, Math.round(9 * effectiveScale))}px; font-family:${resolveFontStack(effectiveFont)}; opacity:0.85; font-weight:bold;">
            ${design.customText1Content}
          </div>` : ''}

          <!-- Custom Text 2 -->
          ${design?.customText2Content ? `
          <div class="el" style="left:${coords.customText2?.x ?? 50}%; top:${coords.customText2?.y ?? 96}%; transform:translate(-50%, -50%); color:${effectiveTextColor}; font-size:${Math.max(4, Math.round(8 * effectiveScale))}px; font-family:${resolveFontStack(effectiveFont)}; opacity:0.75; font-weight:bold;">
            ${design.customText2Content}
          </div>` : ''}
        </div>
      </div>`);
    }

    const cardsHtml = cardsHtmlArr.join('');

    if (isPos) {
      pagesHtmlArr.push(`
      <div class="pos-page">
        ${cardsHtml}
      </div>`);
    } else {
      pagesHtmlArr.push(`
      <div class="a4-page" id="page-${p + 1}">
        <div class="page-meta-header no-print">
          <span>📄 صفحة ${p + 1} من ${totalPages}</span>
          <span>شبكة ${effectiveNetwork} - ثيم: ${preset.name} - إجمالي ${totalCards} كرت (${cols} عمود × ${rows} صف)</span>
        </div>
        <div class="voucher-grid">
          ${cardsHtml}
        </div>
      </div>`);
    }

    if (p % 2 === 0) {
      onProgress?.(`معالجة الصفحة ${p + 1} من ${totalPages}...`);
      await yieldToMain();
    }
  }

  const pagesHtml = pagesHtmlArr.join('');
  const globalFontStack = resolveFontStack(effectiveFont);

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>كروت شبكة ${effectiveNetwork} - (${totalCards} كرت)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700;800&family=Amiri:ital,wght@0,400;0,700;1,400&family=Cairo:wght@400;600;700;900&family=JetBrains+Mono:wght@400;600;700;800&family=Tajawal:wght@400;500;700;900&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${globalFontStack}; background-color: #0f172a; color: #334155; padding: 80px 10px 40px 10px; direction: rtl; -webkit-font-smoothing: antialiased; }
    .floating-toolbar { position: fixed; top: 0; left: 0; right: 0; height: 65px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 2px solid #4f46e5; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5); z-index: 9999; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; color: #ffffff; }
    .toolbar-info { display: flex; align-items: center; gap: 15px; }
    .toolbar-title { font-size: 15px; font-weight: 900; color: #facc15; display: flex; align-items: center; gap: 6px; }
    .toolbar-badge { background: rgba(99, 102, 241, 0.25); border: 1px solid rgba(129, 140, 248, 0.4); padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #e0e7ff; }
    .toolbar-actions { display: flex; align-items: center; gap: 10px; }
    .btn-action { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer; border: none; transition: all 0.2s ease; text-decoration: none; }
    .btn-pdf { background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); color: #ffffff; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35); border: 1px solid rgba(254, 202, 202, 0.3); }
    .btn-pdf:hover { background: linear-gradient(135deg, #f87171 0%, #dc2626 100%); transform: translateY(-1px); }
    .btn-print { background: linear-gradient(135deg, #4f46e5 0%, #2563eb 100%); color: #ffffff; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35); border: 1px solid rgba(199, 210, 254, 0.3); }
    .btn-print:hover { background: linear-gradient(135deg, #6366f1 0%, #3b82f6 100%); transform: translateY(-1px); }
    .btn-toggle-cut { background: #334155; color: #f1f5f9; border: 1px solid #475569; }
    .btn-toggle-cut:hover { background: #475569; }
    .a4-page { width: ${finalPageWidth}; height: ${finalPageHeight}; max-height: ${finalPageHeight}; margin: 0 auto 30px auto; background: #ffffff; box-sizing: border-box; padding: ${marginTopMm}mm ${paddingMm}mm ${marginBottomMm}mm ${paddingMm}mm; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; overflow: hidden; position: relative; display: flex; flex-direction: column; box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4); border-radius: 2px; }
    .page-meta-header { font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between; padding-bottom: 1.5mm; border-bottom: 0.5px solid #e2e8f0; margin-bottom: 1.5mm; height: 5mm; box-sizing: border-box; }
    .voucher-grid { display: grid; width: 100%; height: 100%; box-sizing: border-box; flex: 1; overflow: hidden; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, minmax(0, 1fr)); gap: ${gapMm}mm; }
    .vc-wrapper { position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
    .has-cut { border: 0.5px dashed #94a3b8; }
    .no-cuts .has-cut { border: 0.5px dashed transparent !important; }
    .vc { position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; page-break-inside: avoid; break-inside: avoid; border-radius: 4px; }
    .bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.25; pointer-events: none; ${design?.bgImage ? `background-image: url("${design.bgImage}"); background-size: cover; background-position: center;` : ''} }
    .no-cuts .vc { border-color: transparent !important; }
    .el { position: absolute; white-space: nowrap; z-index: 2; line-height: 1.2; pointer-events: none; }
    .qr-wrap { position: absolute; transform: translate(-50%, -50%); background: #ffffff; padding: 1.5px; border-radius: 3px; border: 0.5px solid #e2e8f0; z-index: 2; line-height: 0; }
    .empty-vc { border: 0.5px dashed #f1f5f9; background: transparent; }
    .pos-page { width: 76mm; margin: 0 auto 12px; background: #ffffff; padding: 3mm; box-sizing: border-box; border: 1px dashed #cbd5e1; border-radius: 4px; page-break-after: always; }
    @page { size: ${finalPageSizeStr}; margin: 0mm; }
    @media print {
      html, body { background: #ffffff !important; color: #000000 !important; padding: 0 !important; margin: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      .no-print { display: none !important; }
      .a4-page { margin: 0 !important; padding: ${marginTopMm}mm ${paddingMm}mm ${marginBottomMm}mm ${paddingMm}mm !important; width: ${finalPageWidth} !important; height: ${finalPageHeight} !important; box-shadow: none !important; border-radius: 0 !important; page-break-after: always !important; break-after: page !important; }
      .pos-page { margin: 0 auto !important; box-shadow: none !important; page-break-after: always !important; }
      .vc { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      .no-cuts .vc { border: none !important; }
      .el { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; text-rendering: optimizeLegibility !important; }
      .qr-wrap { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; image-rendering: crisp-edges !important; image-rendering: pixelated !important; }
    }
  </style>
</head>
<body>
  <div class="floating-toolbar no-print">
    <div class="toolbar-info">
      <div class="toolbar-title">
        <span>⚡ استوديو الكروت - ${effectiveNetwork}</span>
      </div>
      <div class="toolbar-badge">
        <span>إجمالي: ${totalCards} كرت</span>
      </div>
      <div class="toolbar-badge">
        <span>شبكة: ${cols} عمود × ${rows} صف (${cardsPerPage} كرت/صفحة A4)</span>
      </div>
      <div class="toolbar-badge">
        <span>عدد الصفحات: ${totalPages}</span>
      </div>
    </div>
    <div class="toolbar-actions">
      <button type="button" onclick="saveAsPdf()" class="btn-action btn-pdf" title="حفظ جميع الصفحات بصيغة PDF فوراً">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
        <span>حفظ وتصدير كـ PDF</span>
      </button>
      <button type="button" onclick="printVouchers()" class="btn-action btn-print" title="طباعة فورية للطابعة A4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        <span>طباعة الكروت (🖨️)</span>
      </button>
      <button type="button" onclick="toggleCutLines()" class="btn-action btn-toggle-cut" title="إظهار أو إخفاء خطوط وفواصل القص">
        <span>✂️ فواصل القص</span>
      </button>
    </div>
  </div>

  <div id="pages-container">
    ${pagesHtml}
  </div>

  <script>
    function toggleCutLines() {
      document.body.classList.toggle('no-cuts');
    }
    function printVouchers() {
      window.print();
    }
    function saveAsPdf() {
      var prevTitle = document.title;
      try {
        document.title = 'ZCtrl-Vouchers-' + new Date().toISOString().slice(0, 10);
        window.print();
      } catch (err) {
        console.error('PDF export print failed:', err);
      } finally {
        setTimeout(function() { document.title = prevTitle; }, 1000);
      }
    }
  </script>
</body>
</html>`;
}
