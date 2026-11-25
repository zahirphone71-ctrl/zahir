import type { AutoCalcGridParams, GridResult } from './types';

export type { AutoCalcGridParams, GridResult };

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

  const isPos =
    params.isPos ||
    params.paperType?.startsWith('thermal') ||
    params.paperType?.startsWith('pos') ||
    false;

  const gapMm = params.gapMm ?? params.cardGap ?? (params.paperType === 'a4_100' ? 1 : 4);
  const paddingMm = params.paddingMm ?? params.cardMarginSide ?? (params.paperType === 'a4_100' ? 2 : 4);
  const marginTopMm = params.cardMarginTop ?? paddingMm;
  const marginBottomMm = params.cardMarginBottom ?? paddingMm;
  const headerHeightMm = params.headerHeightMm ?? 6;
  const totalCards = params.totalCards ?? 50;

  let basePaperW = 210;
  let basePaperH = 297;

  if (params.paperType === 'a3') {
    basePaperW = 297;
    basePaperH = 420;
  } else if (params.paperType === 'a5') {
    basePaperW = 148;
    basePaperH = 210;
  } else if (params.paperType === 'letter') {
    basePaperW = 215.9;
    basePaperH = 279.4;
  } else if (params.paperType === 'thermal_80mm' || params.paperType === 'pos_80mm') {
    basePaperW = 80;
    basePaperH = 150;
  } else if (params.paperType === 'thermal_58mm' || params.paperType === 'pos_58mm') {
    basePaperW = 58;
    basePaperH = 120;
  }

  let paperWidthMm = params.paperWidthMm ?? basePaperW;
  let paperHeightMm = params.paperHeightMm ?? basePaperH;

  if (params.paperOrientation === 'landscape' && !isPos) {
    const minDim = Math.min(paperWidthMm, paperHeightMm);
    const maxDim = Math.max(paperWidthMm, paperHeightMm);
    paperWidthMm = maxDim;
    paperHeightMm = minDim;
  } else if (params.paperOrientation === 'portrait' && !isPos) {
    const minDim = Math.min(paperWidthMm, paperHeightMm);
    const maxDim = Math.max(paperWidthMm, paperHeightMm);
    paperWidthMm = minDim;
    paperHeightMm = maxDim;
  }

  const cardWidthMm = params.cardWidthMm || 85;
  const cardHeightMm = params.cardHeightMm || 52;

  if (isPos) {
    const result: GridResult = {
      cols: 1,
      rows: 1,
      actualCardWidthMm: cardWidthMm,
      actualCardHeightMm: cardHeightMm,
      fontScale: 1.0,
      totalPerPage: 1,
      totalPages: Math.max(1, totalCards),
      totalCards,
      gapMm,
      paddingMm,
    };
    if (params && typeof params === 'object') GRID_CACHE.set(params, result);
    return result;
  }

  const usableW = Math.max(10, paperWidthMm - 2 * paddingMm);
  const usableH = Math.max(10, paperHeightMm - marginTopMm - marginBottomMm - headerHeightMm);

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
  const fontScale = Math.max(0.15, Math.min(1.2, Math.min(scaleX, scaleY)));

  const totalPerPage = cols * rows;
  const totalPages = Math.max(1, Math.ceil(totalCards / totalPerPage));

  const result: GridResult = {
    cols,
    rows,
    actualCardWidthMm: Math.round(actualCardWidthMm * 100) / 100,
    actualCardHeightMm: Math.round(actualCardHeightMm * 100) / 100,
    fontScale: Math.round(fontScale * 1000) / 1000,
    totalPerPage,
    totalPages,
    totalCards,
    gapMm,
    paddingMm,
  };

  if (params && typeof params === 'object') {
    GRID_CACHE.set(params, result);
  }

  return result;
}

export function calcFontScale(params: any): number {
  return autoCalcGrid({ ...params, totalCards: 1 }).fontScale;
}
