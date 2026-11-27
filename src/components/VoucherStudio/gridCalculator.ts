import type { AutoCalcGridParams, GridResult } from './types';

export type { AutoCalcGridParams, GridResult };

export interface PaperSpec {
  paperType: string;
  paperLabel: string;
  isPos: boolean;
  isLandscape: boolean;
  widthMm: number;
  heightMm: number;
  cssPageSize: string;
  pdfFormat: string | [number, number];
}

export function getPaperSpec(
  paperType?: string,
  paperOrientation?: 'portrait' | 'landscape',
  customWidthMm?: number,
  customHeightMm?: number,
  cardHeightMm?: number,
  paddingMm: number = 3
): PaperSpec {
  const norm = (paperType || 'a4').toLowerCase().trim();
  const is58 = norm === 'thermal_58mm' || norm === 'pos_58mm' || norm === 'pos58';
  const is80 = norm === 'thermal_80mm' || norm === 'pos_80mm' || norm === 'pos80';
  const isPos = is58 || is80 || norm.startsWith('thermal') || norm.startsWith('pos');

  if (isPos) {
    const widthMm = customWidthMm ?? (is58 ? 58 : 80);
    // Compute exact POS receipt page height from actual card height + padding
    const cardH = Math.max(30, cardHeightMm || 52);
    const heightMm = customHeightMm ?? Math.max(64, Math.round(cardH + paddingMm * 2 + 6));
    const label = is58 ? 'حراري 58mm' : 'حراري 80mm';
    return {
      paperType: norm,
      paperLabel: label,
      isPos: true,
      isLandscape: false,
      widthMm,
      heightMm,
      cssPageSize: `${widthMm}mm ${heightMm}mm`,
      pdfFormat: [widthMm, heightMm],
    };
  }

  let baseW = 210;
  let baseH = 297;
  let cssBase = 'A4';
  let pdfFormat: string = 'a4';
  let paperLabel = 'A4';

  if (norm === 'a3') {
    baseW = 297;
    baseH = 420;
    cssBase = 'A3';
    pdfFormat = 'a3';
    paperLabel = 'A3';
  } else if (norm === 'a5') {
    baseW = 148;
    baseH = 210;
    cssBase = 'A5';
    pdfFormat = 'a5';
    paperLabel = 'A5';
  } else if (norm === 'letter') {
    baseW = 215.9;
    baseH = 279.4;
    cssBase = 'Letter';
    pdfFormat = 'letter';
    paperLabel = 'Letter';
  } else if (norm === 'a4_100') {
    paperLabel = 'A4 (100 كرت)';
  } else if (norm === 'a4_40') {
    paperLabel = 'A4 (40 كرت)';
  } else if (norm === 'a4_400') {
    paperLabel = 'A4 (400 كرت)';
  }

  const rawW = customWidthMm ?? baseW;
  const rawH = customHeightMm ?? baseH;
  const isLandscape = paperOrientation === 'landscape';
  const widthMm = isLandscape ? Math.max(rawW, rawH) : Math.min(rawW, rawH);
  const heightMm = isLandscape ? Math.min(rawW, rawH) : Math.max(rawW, rawH);

  return {
    paperType: norm,
    paperLabel,
    isPos: false,
    isLandscape,
    widthMm,
    heightMm,
    cssPageSize: `${cssBase} ${isLandscape ? 'landscape' : 'portrait'}`,
    pdfFormat,
  };
}

const GRID_CACHE = new WeakMap<object, GridResult>();

/**
 * حساب ديناميكي لعدد الأعمدة والصفوف والحجم الفعلي وعامل تصغير الخط
 * يدعم التحديد التلقائي بحسب مقاس الكرت أو التحديد المخصص للأعمدة والصفوف مع التخزين المؤقت
 */
export function autoCalcGrid(params: AutoCalcGridParams): GridResult {
  if (params && typeof params === 'object') {
    const cached = GRID_CACHE.get(params);
    if (cached) return cached;
  }

  const isPosParam =
    params.isPos ||
    params.paperType?.startsWith('thermal') ||
    params.paperType?.startsWith('pos') ||
    false;

  const isA4_100 = params.paperType === 'a4_100';
  const gapMm = params.gapMm ?? params.cardGap ?? (isA4_100 ? 1 : 4);
  const paddingMm = params.paddingMm ?? params.cardMarginSide ?? (isA4_100 ? 2 : 4);
  const marginTopMm = params.cardMarginTop ?? paddingMm;
  const marginBottomMm = params.cardMarginBottom ?? paddingMm;
  // Screen meta headers are positioned out of flow so print/PDF row heights always remain zero-shift
  const headerHeightMm = params.headerHeightMm ?? 0;
  const totalCards = params.totalCards ?? 50;

  const cardWidthMm = params.cardWidthMm || 85;
  const cardHeightMm = params.cardHeightMm || 52;

  const spec = getPaperSpec(
    isPosParam && !params.paperType?.startsWith('thermal') && !params.paperType?.startsWith('pos')
      ? 'thermal_80mm'
      : params.paperType,
    params.paperOrientation,
    params.paperWidthMm,
    params.paperHeightMm,
    cardHeightMm,
    paddingMm
  );

  if (spec.isPos) {
    const effectivePosWidth = Math.min(spec.widthMm - 2 * paddingMm, cardWidthMm);
    const fontScale = Math.max(0.65, Math.min(1.15, effectivePosWidth / 85));
    const result: GridResult = {
      cols: 1,
      rows: 1,
      actualCardWidthMm: Math.round(effectivePosWidth * 100) / 100,
      actualCardHeightMm: Math.round(cardHeightMm * 100) / 100,
      fontScale: Math.round(fontScale * 1000) / 1000,
      totalPerPage: 1,
      totalPages: Math.max(1, totalCards),
      totalCards,
      gapMm,
      paddingMm,
      paperWidthMm: spec.widthMm,
      paperHeightMm: spec.heightMm,
      isPos: true,
      paperLabel: spec.paperLabel,
    };
    if (params && typeof params === 'object') GRID_CACHE.set(params, result);
    return result;
  }

  const usableW = Math.max(10, spec.widthMm - 2 * paddingMm);
  const usableH = Math.max(10, spec.heightMm - marginTopMm - marginBottomMm - headerHeightMm);

  const safeCardW = Math.max(10, cardWidthMm);
  const safeCardH = Math.max(10, cardHeightMm);

  let cols: number;
  let rows: number;

  const explicitCols = params.customCols ?? params.cols;
  const explicitRows = params.customRows ?? params.rows;

  if (explicitCols && explicitCols > 0) {
    cols = Math.max(1, Math.min(30, explicitCols));
  } else {
    cols = Math.max(1, Math.floor((usableW + gapMm) / (safeCardW + gapMm)));
  }

  if (explicitRows && explicitRows > 0) {
    rows = Math.max(1, Math.min(50, explicitRows));
  } else {
    rows = Math.max(1, Math.floor((usableH + gapMm) / (safeCardH + gapMm)));
  }

  const actualCardWidthMm = (usableW - (cols - 1) * gapMm) / cols;
  const actualCardHeightMm = (usableH - (rows - 1) * gapMm) / rows;

  const scaleX = actualCardWidthMm / 85;
  const scaleY = actualCardHeightMm / 52;
  const fontScale = Math.max(0.28, Math.min(1.2, Math.min(scaleX, scaleY)));

  const totalPerPage = cols * rows;
  const totalPages = Math.max(1, Math.ceil(totalCards / totalPerPage));

  const roundedW = Math.round(actualCardWidthMm * 100) / 100;
  const roundedH = Math.round(actualCardHeightMm * 100) / 100;

  let readabilityWarning: string | undefined;
  if (roundedW < 36 || roundedH < 24 || totalPerPage >= 100 || fontScale < 0.45) {
    readabilityWarning = `تنبيه القراءة: مقاس الكرت الفعلي (${roundedW.toFixed(1)}×${roundedH.toFixed(1)} مم، ${totalPerPage} كرت/صفحة) صغير جداً؛ تم تثبيت الحد الأدنى للخط عند 6pt لحماية الوضوح وقد يتداخل النص ما لم تقلل الكثافة أو تخفِ QR والعناصر الثانوية.`;
  }

  const result: GridResult = {
    cols,
    rows,
    actualCardWidthMm: roundedW,
    actualCardHeightMm: roundedH,
    fontScale: Math.round(fontScale * 1000) / 1000,
    totalPerPage,
    totalPages,
    totalCards,
    gapMm,
    paddingMm,
    paperWidthMm: spec.widthMm,
    paperHeightMm: spec.heightMm,
    isPos: false,
    paperLabel: spec.paperLabel,
    readabilityWarning,
  };

  if (params && typeof params === 'object') {
    GRID_CACHE.set(params, result);
  }

  return result;
}

export function calcFontScale(params: AutoCalcGridParams): number {
  return autoCalcGrid({ ...params, totalCards: 1 }).fontScale;
}
