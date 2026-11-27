import { VoucherItem, VoucherDesignState, PrintLayoutOption } from './types';
import { THEME_PRESETS } from './themePresets';
import { preGenerateQrCodes } from './qrPreGenerator';
import { autoCalcGrid } from './gridCalculator';
import {
  buildContext,
  computeCoords,
  computeElementStyle,
  computeBoxStyle,
  computeCardStyle,
  computeQrSize,
  computePriceStyle,
  computeElementZIndex,
  resolveFontStack,
  renderDecorations,
  renderLogos,
  getPaperSpec,
  escapeHtml,
  sanitizeImageSrc,
  sanitizeSvgMarkup,
  styleObjToCss,
  CARD_ICON_SVGS,
  MIN_SECONDARY_FONT_PX,
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
  if (!vouchers || vouchers.length === 0) {
    throw new Error('لا توجد كروت للتصدير أو الطباعة');
  }

  const themeKey = (params.theme || design?.theme || 'modern') as VoucherDesignState['theme'];
  const preset = THEME_PRESETS[themeKey] || THEME_PRESETS.modern;

  const effectiveNetworkRaw = design?.networkName || networkName || 'شبكة الإنترنت';
  const effectiveCurrencyRaw = design?.currencySymbol || currencySymbol || 'ريال';
  const effectiveShowQr = design?.showQr !== undefined ? design.showQr : showQr;

  const effectiveAuthMode: 'user_only' | 'user_pass' | 'user_equals_pass' =
    design?.authMode === 'user_equals_pass' || (design as any)?.sameUserPass === true
      ? 'user_equals_pass'
      : design?.authMode === 'user_pass'
      ? 'user_pass'
      : 'user_only';

  const effectiveShowPin = effectiveAuthMode === 'user_only' ? false : showPin !== false;
  const effectiveFont = design?.fontFamily || preset.fontFamily || 'Tajawal';

  const isPos =
    params.isPos !== undefined
      ? params.isPos
      : params.layout?.isPos ||
        params.layout?.id?.startsWith('pos') ||
        design?.paperType?.startsWith('thermal') ||
        design?.paperType?.startsWith('pos') ||
        false;

  const isA4_100 = design?.paperType === 'a4_100';
  const gapMm = params.gapMm ?? design?.cardGap ?? (isA4_100 ? 1 : 4);
  const paddingMm = params.paddingMm ?? design?.cardMarginSide ?? (isA4_100 ? 2 : 4);
  const marginTopMm = design?.cardMarginTop ?? paddingMm;
  const marginBottomMm = design?.cardMarginBottom ?? paddingMm;

  const grid = autoCalcGrid({
    cardWidthMm: design?.cardWidthMm || 85,
    cardHeightMm: design?.cardHeightMm || 52,
    paperType: isPos && !design?.paperType?.startsWith('thermal') && !design?.paperType?.startsWith('pos')
      ? 'thermal_80mm'
      : design?.paperType || 'a4',
    paperOrientation: design?.paperOrientation || 'portrait',
    gapMm,
    paddingMm,
    cardMarginTop: marginTopMm,
    cardMarginBottom: marginBottomMm,
    headerHeightMm: 0,
    totalCards: vouchers.length,
    isPos,
    customCols: params.cols || params.layout?.cols || design?.columnsCount,
    customRows: params.rows || params.layout?.rows || design?.rowsCount,
  });

  const cols = isPos ? 1 : params.cols || params.layout?.cols || grid.cols;
  const rows = isPos ? 1 : params.rows || params.layout?.rows || grid.rows;

  const paperSpec = getPaperSpec(
    isPos && !design?.paperType?.startsWith('thermal') && !design?.paperType?.startsWith('pos')
      ? 'thermal_80mm'
      : design?.paperType,
    design?.paperOrientation,
    undefined,
    undefined,
    design?.cardHeightMm || 52,
    paddingMm
  );

  const showCutMarks = params.showCutMarks ?? design?.showCutMarks ?? true;
  const fontScale = params.fontScale ?? grid.fontScale ?? 1.0;
  const fontMultiplier = (design as any)?.fontScaleMultiplier ?? 1.0;
  const effectiveScale = fontScale * fontMultiplier;

  const designWithTheme = { ...(design || {}), theme: themeKey } as VoucherDesignState;
  const ctx = buildContext(designWithTheme, effectiveScale, params.qrSize);
  const coords = computeCoords(designWithTheme, preset);

  const cardInlineCss = styleObjToCss(computeCardStyle(ctx));
  const cardTextColorCss = escapeHtml(design?.cardTextColor || preset.cardTextColor);

  const elNetwork = computeElementStyle('network', ctx);
  const elUser = computeElementStyle('user', ctx);
  const elPass = computeElementStyle('password', ctx);
  const elPrice = computeElementStyle('price', ctx);
  const elTime = computeElementStyle('time', ctx);
  const elProfile = computeElementStyle('profile', ctx);
  const elData = computeElementStyle('dataLimit', ctx);

  const userBoxCss = styleObjToCss(
    computeBoxStyle(preset.userBoxStyle, preset.userBoxBg, preset.userBoxBorder, effectiveScale)
  );
  const passBoxCss = styleObjToCss(
    computeBoxStyle(preset.passBoxStyle, preset.passBoxBg, preset.passBoxBorder, effectiveScale)
  );
  const priceExtraCss = styleObjToCss(computePriceStyle(preset, effectiveScale));

  const qrSize = computeQrSize(ctx);
  const qrBorderRadius =
    preset.qrBorderRadius === 0 ? 0 : Math.max(1, Math.round((preset.qrBorderRadius || 4) * effectiveScale));
  const qrPadding = Math.max(1, Math.round(2 * effectiveScale));

  const decorationsHtml = renderDecorations(preset, effectiveScale)
    .map((d) => {
      const decStyle = styleObjToCss(d.style);
      const decSvg = d.svg ? sanitizeSvgMarkup(d.svg) : '';
      return `<div style="${decStyle}">${decSvg}</div>`;
    })
    .join('');

  const logosHtml = renderLogos(designWithTheme, effectiveScale)
    .map((l) => `<img src="${escapeHtml(l.src)}" alt="" style="${styleObjToCss(l.style)}" />`)
    .join('');

  const safeBgImage = design?.showBgImage !== false ? sanitizeImageSrc(design?.bgImage) : '';

  let qrMap = params.qrDataUrlMap;
  if (effectiveShowQr && (!qrMap || qrMap.size < vouchers.length)) {
    onProgress?.('جاري توليد باركود QR متجهي عالي الدقة للكروت...');
    qrMap = await preGenerateQrCodes(
      vouchers,
      design?.loginUrl || loginUrl || '10.0.0.1',
      effectiveAuthMode,
      Math.max(80, Math.round(150 * fontScale)),
      undefined,
      signal
    );
  }

  const cardsPerPage = isPos ? 1 : cols * rows;
  const totalCards = vouchers.length;
  const totalPages = isPos ? totalCards : Math.max(1, Math.ceil(totalCards / cardsPerPage));

  const safeNetworkHtml = escapeHtml(effectiveNetworkRaw);
  const safeCurrencyHtml = escapeHtml(effectiveCurrencyRaw);
  const safePresetNameHtml = escapeHtml(preset.name);
  const safePaperLabelHtml = escapeHtml(paperSpec.paperLabel);

  const custom1FontPx = Math.max(MIN_SECONDARY_FONT_PX, Math.round(9 * effectiveScale));
  const custom2FontPx = Math.max(MIN_SECONDARY_FONT_PX, Math.round(8 * effectiveScale));

  const pagesHtmlArr: string[] = [];

  for (let p = 0; p < totalPages; p++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const startIdx = p * cardsPerPage;
    const endIdx = Math.min(startIdx + cardsPerPage, totalCards);
    const pageVouchers = vouchers.slice(startIdx, endIdx);

    const filledList: (VoucherItem | null)[] = [...pageVouchers];
    if (!isPos) {
      while (filledList.length < cardsPerPage) {
        filledList.push(null);
      }
    }

    const cardsHtmlArr: string[] = [];
    for (const v of filledList) {
      if (!v) {
        cardsHtmlArr.push(`<div class="vc-wrapper empty-slot" style="visibility:hidden;"></div>`);
        continue;
      }

      const rawQr = effectiveShowQr && qrMap ? qrMap.get(v.voucherCode) || '' : '';
      let qrInnerHtml = '';
      if (rawQr) {
        if (rawQr.trim().startsWith('<svg')) {
          const cleanSvg = sanitizeSvgMarkup(rawQr);
          qrInnerHtml = `<div class="qr-svg" style="width:${qrSize}px;height:${qrSize}px;">${cleanSvg}</div>`;
        } else {
          const safeSrc = sanitizeImageSrc(rawQr);
          if (safeSrc) {
            qrInnerHtml = `<img src="${escapeHtml(safeSrc)}" alt="QR" style="width:${qrSize}px;height:${qrSize}px;display:block;border-radius:${Math.max(0, qrBorderRadius - 1)}px;" />`;
          }
        }
      }

      const cardPrice = escapeHtml(v.price !== undefined ? v.price : design?.price !== undefined ? design.price : 500);
      const safeCode = escapeHtml(v.voucherCode);
      const safePin = escapeHtml(
        effectiveAuthMode === 'user_equals_pass' ? v.voucherCode : v.voucherPin || v.voucherCode
      );
      const safeProfile = escapeHtml(v.profileName || design?.targetProfile || '');
      const safeTime = escapeHtml(v.timeLimit || design?.timeLimit || '30 يوم');
      const safeData = escapeHtml(v.dataLimit || design?.dataLimit || 'غير محدود');
      const safeCustom1 = design?.customText1Content ? escapeHtml(design.customText1Content) : '';
      const safeCustom2 = design?.customText2Content ? escapeHtml(design.customText2Content) : '';

      const shouldShowPin =
        (effectiveAuthMode === 'user_pass' || effectiveAuthMode === 'user_equals_pass') &&
        effectiveShowPin &&
        elPass.show !== false &&
        !(effectiveAuthMode === 'user_equals_pass' && design?.hidePasswordIfEqual);

      cardsHtmlArr.push(`
      <div class="vc-wrapper ${showCutMarks ? 'has-cut' : ''}">
        <div class="vc" style="${cardInlineCss}">
          ${safeBgImage ? '<div class="bg-img"></div>' : ''}
          ${decorationsHtml}
          ${logosHtml}

          ${elNetwork.show !== false && design?.showNetworkName !== false ? `
          <div class="el" style="left:${coords.network.x}%;top:${coords.network.y}%;transform:translate(-50%,-50%) rotate(${elNetwork.rotation}deg);color:${elNetwork.color};font-size:${elNetwork.fontSize}px;font-weight:${elNetwork.fontWeight};font-family:${elNetwork.fontFamily};letter-spacing:${elNetwork.letterSpacing}px;text-shadow:${elNetwork.textShadow};z-index:${computeElementZIndex('network', designWithTheme)};">
            ${safeNetworkHtml}
          </div>` : ''}

          ${elPrice.show !== false ? `
          <div class="el" style="left:${coords.price.x}%;top:${coords.price.y}%;transform:translate(-50%,-50%) rotate(${elPrice.rotation}deg);color:${elPrice.color};font-size:${elPrice.fontSize}px;font-weight:${elPrice.fontWeight};font-family:${elPrice.fontFamily};letter-spacing:${elPrice.letterSpacing}px;text-shadow:${elPrice.textShadow};z-index:${computeElementZIndex('price', designWithTheme)};${priceExtraCss}">
            ${cardPrice} ${safeCurrencyHtml}
          </div>` : ''}

          ${elProfile.show !== false && safeProfile && coords.profile ? `
          <div class="el" style="left:${coords.profile.x}%;top:${coords.profile.y}%;transform:translate(-50%,-50%) rotate(${elProfile.rotation}deg);color:${elProfile.color};font-size:${elProfile.fontSize}px;font-weight:${elProfile.fontWeight};font-family:${elProfile.fontFamily};letter-spacing:${elProfile.letterSpacing}px;text-shadow:${elProfile.textShadow};opacity:0.9;z-index:${computeElementZIndex('profile', designWithTheme)};">
            ${CARD_ICON_SVGS.profile}<span>${safeProfile}</span>
          </div>` : ''}

          ${elUser.show !== false ? `
          <div class="el" style="left:${coords.user.x}%;top:${coords.user.y}%;transform:translate(-50%,-50%) rotate(${elUser.rotation}deg);color:${elUser.color};font-size:${elUser.fontSize}px;font-weight:${elUser.fontWeight};font-family:${elUser.fontFamily};letter-spacing:${elUser.letterSpacing}px;text-shadow:${elUser.textShadow};z-index:${computeElementZIndex('user', designWithTheme)};${userBoxCss}">
            <span style="font-size:72%;opacity:0.8;margin-left:2px;font-family:${resolveFontStack(effectiveFont)};font-weight:normal;">كود:</span><span dir="ltr">${safeCode}</span>
          </div>` : ''}

          ${shouldShowPin ? `
          <div class="el" style="left:${coords.password.x}%;top:${coords.password.y}%;transform:translate(-50%,-50%) rotate(${elPass.rotation}deg);color:${elPass.color};font-size:${elPass.fontSize}px;font-weight:${elPass.fontWeight};font-family:${elPass.fontFamily};letter-spacing:${elPass.letterSpacing}px;text-shadow:${elPass.textShadow};z-index:${computeElementZIndex('password', designWithTheme)};${passBoxCss}">
            <span style="font-size:72%;opacity:0.8;margin-left:2px;font-family:${resolveFontStack(effectiveFont)};font-weight:normal;">باسورد:</span><span dir="ltr">${safePin}</span>
          </div>` : ''}

          ${effectiveShowQr && qrInnerHtml ? `
          <div class="qr-wrap" style="left:${coords.qr.x}%;top:${coords.qr.y}%;background:${preset.qrBg || '#ffffff'};padding:${qrPadding}px;border-radius:${qrBorderRadius}px;box-shadow:${preset.qrShadow || '0 2px 6px rgba(0,0,0,0.25)'};z-index:${computeElementZIndex('qr', designWithTheme)};">
            ${qrInnerHtml}
          </div>` : ''}

          ${elTime.show !== false ? `
          <div class="el" style="left:${coords.time.x}%;top:${coords.time.y}%;transform:translate(-50%,-50%) rotate(${elTime.rotation}deg);color:${elTime.color};font-size:${elTime.fontSize}px;font-weight:${elTime.fontWeight};font-family:${elTime.fontFamily};letter-spacing:${elTime.letterSpacing}px;text-shadow:${elTime.textShadow};opacity:0.9;z-index:${computeElementZIndex('time', designWithTheme)};">
            ${CARD_ICON_SVGS.time}<span>${safeTime}</span>
          </div>` : ''}

          ${elData.show !== false && coords.dataLimit ? `
          <div class="el" style="left:${coords.dataLimit.x}%;top:${coords.dataLimit.y}%;transform:translate(-50%,-50%) rotate(${elData.rotation}deg);color:${elData.color};font-size:${elData.fontSize}px;font-weight:${elData.fontWeight};font-family:${elData.fontFamily};letter-spacing:${elData.letterSpacing}px;text-shadow:${elData.textShadow};opacity:0.9;z-index:${computeElementZIndex('dataLimit', designWithTheme)};">
            ${CARD_ICON_SVGS.dataLimit}<span>${safeData}</span>
          </div>` : ''}

          ${safeCustom1 ? `
          <div class="el" style="left:${coords.customText1?.x ?? 50}%;top:${coords.customText1?.y ?? 91}%;transform:translate(-50%,-50%);color:${cardTextColorCss};font-size:${custom1FontPx}px;font-family:${resolveFontStack(effectiveFont)};opacity:0.85;font-weight:bold;z-index:10;">
            ${safeCustom1}
          </div>` : ''}

          ${safeCustom2 ? `
          <div class="el" style="left:${coords.customText2?.x ?? 50}%;top:${coords.customText2?.y ?? 96}%;transform:translate(-50%,-50%);color:${cardTextColorCss};font-size:${custom2FontPx}px;font-family:${resolveFontStack(effectiveFont)};opacity:0.75;font-weight:bold;z-index:10;">
            ${safeCustom2}
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
          <span>صفحة ${p + 1} من ${totalPages} (${safePaperLabelHtml})</span>
          <span>شبكة ${safeNetworkHtml} - ثيم: ${safePresetNameHtml} - ${totalCards} كرت (${cols}×${rows})</span>
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
  const pageWidthMm = paperSpec.widthMm;
  const pageHeightMm = paperSpec.heightMm;
  const gridUsableWidthMm = Math.max(10, Number((pageWidthMm - 2 * paddingMm).toFixed(2)));
  const gridUsableHeightMm = Math.max(10, Number((pageHeightMm - marginTopMm - marginBottomMm).toFixed(2)));

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>كروت شبكة ${safeNetworkHtml} - (${totalCards} كرت)</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: ${globalFontStack}; background-color: #0f172a; color: #334155; padding: 80px 10px 40px 10px; direction: rtl; -webkit-font-smoothing: antialiased; }
    .floating-toolbar { position: fixed; top: 0; left: 0; right: 0; height: 65px; background: linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%); border-bottom: 2px solid #4f46e5; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5); z-index: 9999; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; color: #ffffff; }
    .toolbar-info { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
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
    .a4-page { width: ${pageWidthMm}mm; height: ${pageHeightMm}mm; max-height: ${pageHeightMm}mm; margin: 0 auto 30px auto; background: #ffffff; box-sizing: border-box; padding: ${marginTopMm}mm ${paddingMm}mm ${marginBottomMm}mm ${paddingMm}mm; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; overflow: hidden; position: relative; box-shadow: 0 10px 35px rgba(0, 0, 0, 0.4); border-radius: 2px; }
    .page-meta-header { position: absolute; top: 0.5mm; left: ${paddingMm}mm; right: ${paddingMm}mm; font-size: 7pt; line-height: 1; color: #64748b; display: flex; justify-content: space-between; padding: 0.5mm 1.5mm; background: rgba(255, 255, 255, 0.88); border-radius: 2px; z-index: 50; pointer-events: none; }
    .voucher-grid { display: grid; width: ${gridUsableWidthMm}mm; height: ${gridUsableHeightMm}mm; box-sizing: border-box; overflow: hidden; grid-template-columns: repeat(${cols}, ${grid.actualCardWidthMm}mm); grid-template-rows: repeat(${rows}, ${grid.actualCardHeightMm}mm); gap: ${grid.gapMm}mm; }
    .vc-wrapper { position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
    .has-cut { border: 0.5px dashed #94a3b8; }
    .no-cuts .has-cut { border: 0.5px dashed transparent !important; }
    .vc { position: relative; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; page-break-inside: avoid; break-inside: avoid; }
    ${safeBgImage ? `.bg-img { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.25; pointer-events: none; z-index: 0; background-image: url("${safeBgImage}"); background-size: cover; background-position: center; }` : ''}
    .no-cuts .vc { border-color: transparent !important; }
    .el { position: absolute; white-space: nowrap; z-index: 2; line-height: 1.2; pointer-events: none; display: inline-flex; align-items: center; }
    .qr-wrap { position: absolute; transform: translate(-50%, -50%); background: #ffffff; padding: 1.5px; border-radius: 3px; border: 0.5px solid #e2e8f0; z-index: 2; line-height: 0; }
    .qr-svg svg { width: 100%; height: 100%; display: block; shape-rendering: crispEdges; }
    .pos-page { width: ${pageWidthMm}mm; min-height: ${pageHeightMm}mm; margin: 0 auto 12px; background: #ffffff; padding: ${paddingMm}mm; box-sizing: border-box; border: 1px dashed #cbd5e1; border-radius: 4px; page-break-after: always; break-after: page; page-break-inside: avoid; break-inside: avoid; display: flex; align-items: center; justify-content: center; }
    .pos-page .vc-wrapper { width: ${grid.actualCardWidthMm}mm; height: ${grid.actualCardHeightMm}mm; }
    .a4-page:last-child, .pos-page:last-child { page-break-after: auto !important; break-after: auto !important; }
    @page { size: ${paperSpec.cssPageSize}; margin: 0mm; }
    @media print {
      html, body { background: #ffffff !important; color: #000000 !important; padding: 0 !important; margin: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      .no-print { display: none !important; }
      .a4-page { margin: 0 !important; padding: ${marginTopMm}mm ${paddingMm}mm ${marginBottomMm}mm ${paddingMm}mm !important; width: ${pageWidthMm}mm !important; height: ${pageHeightMm}mm !important; max-height: ${pageHeightMm}mm !important; box-shadow: none !important; border-radius: 0 !important; page-break-after: always !important; break-after: page !important; }
      .pos-page { margin: 0 auto !important; width: ${pageWidthMm}mm !important; min-height: ${pageHeightMm}mm !important; box-shadow: none !important; border: none !important; page-break-after: always !important; break-after: page !important; }
      .a4-page:last-child, .pos-page:last-child { page-break-after: auto !important; break-after: auto !important; }
      .vc { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      .no-cuts .vc { border: none !important; }
      .el { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; text-rendering: optimizeLegibility !important; }
      .qr-wrap { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
  </style>
</head>
<body>
  <div class="floating-toolbar no-print">
    <div class="toolbar-info">
      <div class="toolbar-title">
        <span>استوديو الكروت - ${safeNetworkHtml}</span>
      </div>
      <div class="toolbar-badge">
        <span>إجمالي: ${totalCards} كرت</span>
      </div>
      <div class="toolbar-badge">
        <span>شبكة: ${cols} عمود × ${rows} صف (${cardsPerPage} كرت / ${safePaperLabelHtml})</span>
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
      <button type="button" onclick="printVouchers()" class="btn-action btn-print" title="طباعة فورية (${safePaperLabelHtml})">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        <span>طباعة الكروت</span>
      </button>
      <button type="button" onclick="toggleCutLines()" class="btn-action btn-toggle-cut" title="إظهار أو إخفاء خطوط وفواصل القص">
        <span>فواصل القص</span>
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
