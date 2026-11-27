import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { TabType } from '../components/Sidebar';
import { formatBytes, formatBps } from '../lib/formatters';
import { printHtmlSafely } from '../lib/printHelper';

export interface ReportColumn {
  key: string;
  label: string;
  subLabel?: string;
  align?: 'right' | 'center' | 'left';
  width?: string;
  isMonospace?: boolean;
}

export interface ReportKPI {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
}

export interface ReportSection {
  title?: string;
  description?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, any>>;
}

export interface ViewReportData {
  title: string;
  titleEn: string;
  subtitle: string;
  viewKey: string;
  routerName: string;
  routerHost: string;
  routerVersion?: string;
  routerModel?: string;
  routerUptime?: string;
  routerCpu?: number;
  routerRam?: string;
  kpis: ReportKPI[];
  sections: ReportSection[];
  notes?: string[];
}

export interface ExportPdfOptions {
  orientation?: 'portrait' | 'landscape';
  theme?: 'corporate' | 'print';
  includeKpis?: boolean;
  includeRouterInfo?: boolean;
  fileName?: string;
  onProgress?: (percent: number, message: string) => void;
}

export interface ExtractOptions {
  customTitle?: string;
  filterScope?: 'all' | 'filtered' | 'selected';
  filteredItems?: any[];
  selectedIds?: string[];
  selectedSystem?: 'all' | 'hotspot' | 'pppoe' | 'userman' | 'filter' | 'nat' | 'mangle' | string;
  statusFilter?: 'all' | 'online' | 'expired' | 'idle' | 'suspended' | 'selected' | 'limited' | 'unlimited' | 'bound' | 'dynamic' | 'static' | 'errors' | string;
  subCategoryFilter?: string;
}

/**
 * دالة مساعدة لتفريغ ذاكرة الـ Canvas وتفادي تسريب الذاكرة في المتصفح
 */
function destroyCanvas(canvas: HTMLCanvasElement): void {
  try {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 1;
    canvas.height = 1;
  } catch {
    // Ignore cleanup error if already detached
  }
}

/**
 * دالة مساعدة لتحرير مسار المعالجة للمتصفح حتى لا تتشنج الواجهة
 */
const yieldToMainThread = (): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => setTimeout(resolve, 20));
    } else {
      setTimeout(resolve, 25);
    }
  });
};

/**
 * Strict HTML escaping for all RouterOS / user-supplied strings interpolated into PDF & Print HTML.
 * Prevents stored/reflected XSS when RouterOS comments, hostnames, usernames, or logs contain HTML/script payloads.
 */
export function escapePdfHtml(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function sanitizeCssAlign(align?: string, fallback: 'right' | 'center' | 'left' = 'right'): string {
  if (align === 'left' || align === 'center' || align === 'right') return align;
  return fallback;
}

function sanitizeCssWidth(width?: string): string {
  if (!width) return '';
  const cleaned = String(width).trim();
  return /^[0-9]+(\.[0-9]+)?(px|%|mm|cm|em|rem)$/.test(cleaned) ? `width: ${cleaned};` : '';
}

/**
 * شارات الحالة بتنسيق نقي وألوان واضحة
 */
function getStatusBadge(val: string): { label: string; bg: string; text: string; dot: string } {
  const s = String(val || '').trim().toLowerCase();
  if (
    s === 'online' ||
    s === 'active' ||
    s === 'bound' ||
    s === 'running' ||
    s === 'مفعل' ||
    s === 'متصل' ||
    s === 'نشط' ||
    s === 'true'
  ) {
    return { label: s === 'true' ? 'مفعل' : val, bg: '#ecfdf5', text: '#047857', dot: '#10b981' };
  }
  if (s === 'expired' || s === 'منتهي' || s === 'waiting' || s === 'idle' || s === 'خامل') {
    return { label: val, bg: '#fffbeb', text: '#b45309', dot: '#f59e0b' };
  }
  if (
    s === 'disabled' ||
    s === 'suspended' ||
    s === 'معطل' ||
    s === 'معلق' ||
    s === 'drop' ||
    s === 'reject' ||
    s === 'false'
  ) {
    return { label: s === 'false' ? 'معطل' : val, bg: '#fff1f2', text: '#be123c', dot: '#f43f5e' };
  }
  if (s === 'new' || s === 'جديد' || s === 'bypassed') {
    return { label: val, bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6' };
  }
  return { label: val || '—', bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' };
}

/**
 * Core PDF Generator from ViewReportData
 * Designed with strict typography metrics, BiDi protection, and calibrated pagination to prevent overlapping.
 */
export async function exportViewDataToPdf(
  reportData: ViewReportData,
  options: ExportPdfOptions = {}
): Promise<void> {
  const {
    orientation = 'portrait',
    theme = 'corporate',
    includeKpis = true,
    includeRouterInfo = true,
    fileName = `${reportData.viewKey}_report_${Date.now()}.pdf`,
    onProgress
  } = options;

  onProgress?.(5, 'جاري تهيئة محرك PDF وتجهيز صفحات التقرير...');
  await yieldToMainThread();

  const isLandscape = orientation === 'landscape';
  const pdfWidth = isLandscape ? 297 : 210;
  const pdfHeight = isLandscape ? 210 : 297;

  // A4 dimensions in px (standard 96 DPI CSS layout)
  const pageWidthPx = isLandscape ? 1123 : 794;
  const pageHeightPx = isLandscape ? 794 : 1123;

  // Calibrated Rows pagination capacity ensuring NO squashing and NO vertical overlapping
  // Portrait: Page 1 with Header & KPIs holds 17 rows comfortably. Subsequent pages hold 25 rows.
  // Landscape: Page 1 holds 11 rows. Subsequent pages hold 17 rows.
  const rowsOnPage1 = isLandscape ? (includeKpis ? 11 : 14) : (includeKpis ? 17 : 22);
  const rowsOnSubsequentPages = isLandscape ? 17 : 25;

  interface RenderRowItem {
    type: 'section_header' | 'data_row';
    sectionTitle?: string;
    sectionDescription?: string;
    columns: ReportColumn[];
    row?: Record<string, any>;
    rowIndex?: number;
  }

  const allRenderItems: RenderRowItem[] = [];
  reportData.sections.forEach((sec) => {
    if (sec.title && reportData.sections.length > 1) {
      allRenderItems.push({
        type: 'section_header',
        sectionTitle: sec.title,
        sectionDescription: sec.description,
        columns: sec.columns
      });
    }
    sec.rows.forEach((r, idx) => {
      allRenderItems.push({
        type: 'data_row',
        columns: sec.columns,
        row: r,
        rowIndex: idx + 1
      });
    });
  });

  const pages: RenderRowItem[][] = [];
  let currentPos = 0;

  if (allRenderItems.length === 0) {
    pages.push([]);
  } else {
    // Page 1
    const p1Items = allRenderItems.slice(0, rowsOnPage1);
    pages.push(p1Items);
    currentPos += p1Items.length;

    // Subsequent pages
    while (currentPos < allRenderItems.length) {
      const nextPageItems = allRenderItems.slice(currentPos, currentPos + rowsOnSubsequentPages);
      pages.push(nextPageItems);
      currentPos += nextPageItems.length;
    }
  }

  const totalPages = Math.max(1, pages.length);

  // Isolated high-DPI host element placed offscreen to guarantee full font rasterization without culling
  const renderContainer = document.createElement('div');
  renderContainer.id = 'zctrl-view-pdf-render-host';
  renderContainer.style.position = 'fixed';
  renderContainer.style.top = '0';
  renderContainer.style.left = '-10000px';
  renderContainer.style.width = `${pageWidthPx}px`;
  renderContainer.style.zIndex = '1';
  renderContainer.style.opacity = '1';
  renderContainer.style.visibility = 'visible';
  renderContainer.style.pointerEvents = 'none';
  renderContainer.style.backgroundColor = '#ffffff';
  renderContainer.style.overflow = 'visible';
  document.body.appendChild(renderContainer);

  const nowFormatted = new Date().toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const nowEn = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const pageItems = pages[pageIdx] || [];
      const isFirstPage = pageIdx === 0;
      const currentPageNum = pageIdx + 1;

      const baseProgress = Math.round((pageIdx / totalPages) * 85);
      onProgress?.(baseProgress + 5, `معالجة وتنسيق الصفحة ${currentPageNum} من ${totalPages}...`);
      await yieldToMainThread();

      renderContainer.innerHTML = '';

      const pageEl = document.createElement('div');
      pageEl.className = 'pdf-report-page';
      pageEl.dir = 'rtl';
      pageEl.style.width = `${pageWidthPx}px`;
      pageEl.style.height = `${pageHeightPx}px`;
      pageEl.style.minHeight = `${pageHeightPx}px`;
      pageEl.style.maxHeight = `${pageHeightPx}px`;
      pageEl.style.backgroundColor = '#ffffff';
      pageEl.style.color = '#0f172a';
      pageEl.style.boxSizing = 'border-box';
      pageEl.style.padding = isLandscape ? '20px 28px' : '24px 30px';
      pageEl.style.display = 'flex';
      pageEl.style.flexDirection = 'column';
      pageEl.style.position = 'relative';

      const activeColumns =
        pageItems.find((it) => it.columns)?.columns || reportData.sections[0]?.columns || [];

      let html = `
        <style>
          * {
            box-sizing: border-box !important;
            letter-spacing: normal !important;
            word-spacing: normal !important;
          }
          .pdf-report-page {
            font-family: 'Cairo', 'Alexandria', 'Tajawal', system-ui, -apple-system, BlinkMacSystemFont, sans-serif !important;
            direction: rtl !important;
            text-align: right !important;
            color: #0f172a !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: geometricPrecision !important;
          }
          table.pdf-table {
            border-collapse: collapse !important;
            width: 100% !important;
            direction: rtl !important;
            table-layout: fixed !important;
          }
          table.pdf-table th {
            font-family: 'Cairo', 'Alexandria', sans-serif !important;
            font-weight: 800 !important;
            font-size: 9px !important;
            line-height: 1.3 !important;
            vertical-align: middle !important;
          }
          table.pdf-table td {
            font-family: 'Cairo', 'Alexandria', sans-serif !important;
            vertical-align: middle !important;
            line-height: 1.35 !important;
            font-size: 9px !important;
          }
          .ltr-data {
            direction: ltr !important;
            unicode-bidi: isolate !important;
            display: inline-block !important;
            font-family: 'JetBrains Mono', 'Courier New', monospace !important;
            font-weight: 600 !important;
            letter-spacing: 0 !important;
            text-align: left !important;
          }
        </style>
      `;

      // --- 1. HEADER SECTION ---
      if (isFirstPage) {
        html += `
          <div style="margin-bottom: 12px; flex-shrink: 0;">
            <!-- Top Branding Strip -->
            <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 38px; height: 38px; border-radius: 10px; background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(2, 132, 199, 0.25);">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                  </svg>
                </div>
                <div>
                  <div style="font-size: 17px; font-weight: 900; color: #0f172a; letter-spacing: -0.3px; line-height: 1.2;">
                    ZCtrl <span style="font-size: 12px; font-weight: 700; color: #0284c7;">Enterprise Suite</span>
                  </div>
                  <div style="font-size: 9.5px; color: #64748b; font-weight: 600;">
                    نظام إدارة المايكروتك وطباعة الكروت • MikroTik RouterOS Management
                  </div>
                </div>
              </div>

              <!-- Document Identity & Timestamp -->
              <div style="text-align: left;" dir="ltr">
                <div style="display: inline-block; background: #f0fdf4; border: 1px solid #86efac; color: #166534; font-size: 9px; font-weight: 800; padding: 2px 7px; border-radius: 5px; margin-bottom: 3px;">
                  VERIFIED REPORT
                </div>
                <div style="font-size: 9px; color: #475569; font-weight: 700; font-family: monospace;">
                  ${escapePdfHtml(nowEn)}
                </div>
                <div style="font-size: 8.5px; color: #94a3b8;">
                  Router: <strong style="color: #0f172a;">${escapePdfHtml(reportData.routerName)}</strong>
                </div>
              </div>
            </div>

            <!-- Report Main Title Box -->
            <div style="display: flex; align-items: center; justify-content: space-between; background: linear-gradient(to left, #f8fafc, #f1f5f9); border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 14px; margin-bottom: 10px;">
              <div>
                <h1 style="margin: 0; font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.3;">
                  ${escapePdfHtml(reportData.title)}
                </h1>
                <div style="font-size: 10px; color: #64748b; margin-top: 1px;">
                  ${escapePdfHtml(reportData.subtitle)} • <span style="font-family: monospace; font-size: 9.5px; color: #0284c7;">${escapePdfHtml(reportData.titleEn)}</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 10px; font-weight: 800; background: #0284c7; color: #ffffff; padding: 3px 9px; border-radius: 6px;">
                  ${reportData.sections.reduce((acc, s) => acc + s.rows.length, 0)} سجل
                </span>
              </div>
            </div>

            <!-- Router Connection Metadata Strip -->
            ${
              includeRouterInfo
                ? `
              <div style="display: flex; align-items: center; gap: 10px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 7px; padding: 5px 10px; font-size: 9px; color: #475569; margin-bottom: 10px; flex-wrap: wrap;">
                <div>السيرفر: <strong style="color: #0f172a; font-family: monospace;">${escapePdfHtml(reportData.routerName)}</strong></div>
                <div style="color: #cbd5e1;">|</div>
                <div>العنوان: <strong style="color: #0284c7; font-family: monospace;" dir="ltr">${escapePdfHtml(reportData.routerHost)}</strong></div>
                ${reportData.routerModel ? `<div style="color: #cbd5e1;">|</div><div>الموديل: <strong style="color: #0f172a;">${escapePdfHtml(reportData.routerModel)}</strong></div>` : ''}
                ${reportData.routerVersion ? `<div style="color: #cbd5e1;">|</div><div>الإصدار: <strong style="color: #4f46e5; font-family: monospace;" dir="ltr">${escapePdfHtml(reportData.routerVersion)}</strong></div>` : ''}
                ${reportData.routerUptime ? `<div style="color: #cbd5e1;">|</div><div>العمل المتواصل: <strong style="color: #10b981; font-family: monospace;">${escapePdfHtml(reportData.routerUptime)}</strong></div>` : ''}
                ${reportData.routerCpu !== undefined ? `<div style="color: #cbd5e1;">|</div><div>المعالج: <strong style="color: #0f172a; font-family: monospace;">${escapePdfHtml(reportData.routerCpu)}%</strong></div>` : ''}
                ${reportData.routerRam ? `<div style="color: #cbd5e1;">|</div><div>الذاكرة الحرة: <strong style="color: #0f172a; font-family: monospace;">${escapePdfHtml(reportData.routerRam)}</strong></div>` : ''}
              </div>
            `
                : ''
            }

            <!-- KPIs Summary Cards Grid -->
            ${
              includeKpis && reportData.kpis && reportData.kpis.length > 0
                ? `
              <div style="display: grid; grid-template-columns: repeat(${Math.min(5, Math.max(2, reportData.kpis.length))}, 1fr); gap: 8px; margin-bottom: 10px;">
                ${reportData.kpis
                  .map((kpi) => {
                    const colorMap = {
                      blue: { border: '#38bdf8', bg: '#f0f9ff', text: '#0369a1' },
                      emerald: { border: '#34d399', bg: '#f0fdf4', text: '#047857' },
                      amber: { border: '#fbbf24', bg: '#fffbeb', text: '#b45309' },
                      rose: { border: '#fb7185', bg: '#fff1f2', text: '#be123c' },
                      purple: { border: '#c084fc', bg: '#faf5ff', text: '#7e22ce' },
                      slate: { border: '#94a3b8', bg: '#f8fafc', text: '#334155' }
                    };
                    const c = colorMap[kpi.color || 'blue'] || colorMap.blue;
                    return `
                    <div style="background: ${c.bg}; border: 1px solid #e2e8f0; border-top: 3px solid ${c.border}; border-radius: 7px; padding: 6px 10px; text-align: right;">
                      <div style="font-size: 9px; color: #64748b; font-weight: 700; margin-bottom: 1px;">${escapePdfHtml(kpi.label)}</div>
                      <div style="font-size: 15px; font-weight: 900; color: ${c.text}; font-family: 'JetBrains Mono', monospace;" dir="ltr">${escapePdfHtml(kpi.value)}</div>
                      ${kpi.sublabel ? `<div style="font-size: 8px; color: #94a3b8; margin-top: 1px;">${escapePdfHtml(kpi.sublabel)}</div>` : ''}
                    </div>
                  `;
                  })
                  .join('')}
              </div>
            `
                : ''
            }
          </div>
        `;
      } else {
        // Subsequent Page Compact Running Header
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1.5px solid #0284c7; padding-bottom: 6px; margin-bottom: 10px; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 900; color: #0284c7; font-size: 12px;">ZCtrl</span>
              <span style="color: #94a3b8;">/</span>
              <span style="font-weight: 800; color: #0f172a; font-size: 11px;">${escapePdfHtml(reportData.title)}</span>
              <span style="background: #e0f2fe; color: #0369a1; font-size: 8.5px; font-weight: 800; padding: 2px 5px; border-radius: 4px;">تابع صفحة ${currentPageNum}</span>
            </div>
            <div style="font-size: 8.5px; color: #64748b; font-family: monospace;" dir="ltr">
              Router: <strong>${escapePdfHtml(reportData.routerName)}</strong> • ${escapePdfHtml(nowEn)}
            </div>
          </div>
        `;
      }

      // --- 2. TABLE BODY SECTION ---
      html += `
        <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-start;">
          <table class="pdf-table" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            <thead>
              <tr style="background: #0f172a; color: #ffffff; text-align: right; height: 32px;">
                <th style="padding: 5px 6px; width: 34px; text-align: center; font-weight: 800;">#</th>
                ${activeColumns
                  .map(
                    (col) => `
                  <th style="padding: 5px 6px; text-align: ${sanitizeCssAlign(col.align, 'right')}; ${sanitizeCssWidth(col.width)} font-weight: 800; border-inline-end: 1px solid #1e293b;">
                    ${escapePdfHtml(col.label)}
                    ${col.subLabel ? `<div style="font-size: 7.5px; color: #94a3b8; font-weight: normal; margin-top: 1px;">${escapePdfHtml(col.subLabel)}</div>` : ''}
                  </th>
                `
                  )
                  .join('')}
              </tr>
            </thead>
            <tbody>
      `;

      if (pageItems.length === 0) {
        html += `
          <tr>
            <td colspan="${activeColumns.length + 1}" style="padding: 30px; text-align: center; color: #94a3b8; font-size: 11px; font-weight: bold;">
              لا توجد سجلات لعرضها في هذا التقرير
            </td>
          </tr>
        `;
      } else {
        pageItems.forEach((item, rowIdx) => {
          if (item.type === 'section_header') {
            html += `
              <tr style="background: #e2e8f0; height: 28px;">
                <td colspan="${activeColumns.length + 1}" style="padding: 4px 8px; font-weight: 800; font-size: 10px; color: #1e293b;">
                  ${escapePdfHtml(item.sectionTitle)}
                  ${item.sectionDescription ? `<span style="font-weight: normal; font-size: 8.5px; color: #64748b; margin-inline-start: 6px;">${escapePdfHtml(item.sectionDescription)}</span>` : ''}
                </td>
              </tr>
            `;
            return;
          }

          const r = item.row || {};
          const isStripe = rowIdx % 2 === 1;
          const bg = isStripe ? '#f8fafc' : '#ffffff';

          html += `
            <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0; color: #1e293b; height: 30px;">
              <td style="padding: 4px 6px; text-align: center; font-size: 8.5px; font-family: monospace; color: #94a3b8; font-weight: bold;">
                ${item.rowIndex || rowIdx + 1}
              </td>
              ${item.columns
                .map((col) => {
                  let rawVal = r[col.key];
                  if (rawVal === undefined || rawVal === null) rawVal = '—';

                  // Status badge handling
                  if (col.key === 'status' || col.key === 'state' || col.key === 'disabled') {
                    const badge = getStatusBadge(String(rawVal));
                    return `
                      <td style="padding: 4px 6px; text-align: ${sanitizeCssAlign(col.align, 'center')}; white-space: nowrap;">
                        <span style="display: inline-flex; align-items: center; gap: 3px; background: ${badge.bg}; color: ${badge.text}; font-size: 8px; font-weight: 800; padding: 2px 6px; border-radius: 9999px;">
                          <span style="width: 4px; height: 4px; border-radius: 50%; background: ${badge.dot}; display: inline-block;"></span>
                          ${escapePdfHtml(badge.label)}
                        </span>
                      </td>
                    `;
                  }

                  const isMono =
                    col.isMonospace ||
                    col.key.includes('ip') ||
                    col.key.includes('mac') ||
                    col.key.includes('rate') ||
                    col.key.includes('bytes') ||
                    col.key.includes('uptime') ||
                    col.key.includes('time') ||
                    col.key.includes('address') ||
                    col.key === 'target';

                  return `
                    <td style="padding: 4px 6px; text-align: ${sanitizeCssAlign(col.align, 'right')}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${
                        isMono
                          ? `<span class="ltr-data" dir="ltr">${escapePdfHtml(rawVal)}</span>`
                          : `<span style="font-size: 9px;">${escapePdfHtml(rawVal)}</span>`
                      }
                    </td>
                  `;
                })
                .join('')}
            </tr>
          `;
        });
      }

      html += `
            </tbody>
          </table>
        </div>
      `;

      // --- 3. FOOTER SECTION ---
      html += `
        <div style="margin-top: auto; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; font-size: 8.5px; color: #64748b; flex-shrink: 0;">
          <div>
            نظام <strong style="color: #0284c7;">ZCtrl RouterOS Enterprise</strong> • تقرير شبكي معتمد ومحمي
          </div>
          <div style="font-family: monospace;">
            تاريخ التصدير: ${escapePdfHtml(nowFormatted)}
          </div>
          <div>
            صفحة <strong style="color: #0f172a;">${currentPageNum}</strong> من <strong style="color: #0f172a;">${totalPages}</strong>
          </div>
        </div>
      `;

      pageEl.innerHTML = html;
      renderContainer.appendChild(pageEl);

      await yieldToMainThread();

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise((r) => setTimeout(r, 40));

      const canvas = await html2canvas(pageEl, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        windowWidth: pageWidthPx,
        windowHeight: pageHeightPx
      });

      onProgress?.(baseProgress + 12, `تحويل وتضمين الصفحة ${currentPageNum} في ملف PDF...`);
      await yieldToMainThread();

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      if (pageIdx > 0) {
        pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

      destroyCanvas(canvas);
      renderContainer.innerHTML = '';
      await yieldToMainThread();
    }

    onProgress?.(96, 'جاري حفظ وتنزيل ملف PDF...');
    await yieldToMainThread();

    pdf.save(fileName);
    onProgress?.(100, 'تم إنشاء وتنزيل ملف PDF بنجاح!');
  } catch (error) {
    console.error('Error generating View PDF:', error);
    throw error;
  } finally {
    if (renderContainer && renderContainer.parentNode) {
      renderContainer.parentNode.removeChild(renderContainer);
    }
  }
}

/**
 * Direct Browser Print Preview
 * Opens a clean printable view for pure vector print-to-PDF without rasterization
 */
export function printViewData(reportData: ViewReportData, options: ExportPdfOptions = {}): void {
  const isLandscape = options.orientation === 'landscape';

  const nowFormatted = new Date().toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const allSectionsHtml = reportData.sections
    .map((sec) => {
      const thead = `
      <thead>
        <tr style="background:#0f172a; color:#ffffff;">
          <th style="padding:6px; width:34px; text-align:center;">#</th>
          ${sec.columns.map((c) => `<th style="padding:6px 8px; text-align:${sanitizeCssAlign(c.align, 'right')}; ${sanitizeCssWidth(c.width)}">${escapePdfHtml(c.label)}</th>`).join('')}
        </tr>
      </thead>
    `;
      const tbody = `
      <tbody>
        ${sec.rows
          .map(
            (r, idx) => `
          <tr style="border-bottom:1px solid #e2e8f0; background:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
            <td style="padding:5px 6px; text-align:center; font-family:monospace; color:#94a3b8; font-size:11px;">${idx + 1}</td>
            ${sec.columns
              .map((c) => {
                let val = r[c.key];
                if (val === undefined || val === null) val = '—';
                const isMono = c.isMonospace || c.key.includes('ip') || c.key.includes('mac') || c.key.includes('rate') || c.key.includes('bytes') || c.key.includes('uptime');
                return `<td style="padding:5px 8px; text-align:${sanitizeCssAlign(c.align, 'right')}; font-family:${isMono ? 'monospace' : 'inherit'}; font-size:11px;">${escapePdfHtml(val)}</td>`;
              })
              .join('')}
          </tr>
        `
          )
          .join('')}
      </tbody>
    `;
      return `
      ${sec.title ? `<h3 style="font-size:14px; font-weight:800; margin:16px 0 6px 0; color:#1e293b;">${escapePdfHtml(sec.title)}</h3>` : ''}
      <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px;">
        ${thead}
        ${tbody}
      </table>
    `;
    })
    .join('');

  const html = `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>${escapePdfHtml(reportData.title)} - ZCtrl</title>
        <style>
          @page { size: ${isLandscape ? 'landscape' : 'portrait'}; margin: 12mm; }
          * { box-sizing: border-box; }
          body { font-family: 'Cairo Variable', 'Cairo', system-ui, -apple-system, sans-serif; margin: 0; padding: 12px; color: #0f172a; direction: rtl; }
          table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { border: 1px solid #cbd5e1; }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div style="border-bottom:2px solid #0284c7; padding-bottom:10px; margin-bottom:12px; display:flex; justify-content:space-between;">
          <div>
            <h1 style="margin:0; font-size:18px; color:#0f172a;">${escapePdfHtml(reportData.title)}</h1>
            <div style="font-size:11px; color:#64748b;">${escapePdfHtml(reportData.subtitle)} • السيرفر: ${escapePdfHtml(reportData.routerName)} (${escapePdfHtml(reportData.routerHost)})</div>
          </div>
          <div style="text-align:left; font-size:10px; color:#64748b;" dir="ltr">
            ${escapePdfHtml(nowFormatted)}
          </div>
        </div>
        ${allSectionsHtml}
      </body>
    </html>
  `;
  void printHtmlSafely(html, { fileName: `${reportData.viewKey || 'report'}-${Date.now()}.html` });
}

/**
 * Universal Data Extractor for any View tab in ZCtrl
 * Supports multi-system selection (Hotspot, PPPoE, User Manager, All)
 * and rich status filters (All, Online, Expired, Idle, Suspended, Selected).
 */
export function extractViewReportData(
  activeTab: TabType | string,
  contextData: any,
  options?: ExtractOptions
): ViewReportData {
  const router = contextData.router;
  const routerName = router?.name || 'MikroTik-Router';
  const routerHost = `${router?.host || '192.168.88.1'}:${router?.port || 8728}`;
  const routerVersion = router?.version || 'v7.x';
  const routerModel = router?.boardName || router?.model || 'RouterBOARD';
  const routerUptime = router?.uptime || '0s';
  const routerCpu = router?.cpuLoad || 0;
  const routerRam = router?.freeMemory ? formatBytes(router.freeMemory, 0) : '-';

  const defaultResult: ViewReportData = {
    title: options?.customTitle || 'تقرير النظام',
    titleEn: 'SYSTEM OVERVIEW REPORT',
    subtitle: 'بيانات وإحصائيات سيرفر المايكروتك',
    viewKey: String(activeTab),
    routerName,
    routerHost,
    routerVersion,
    routerModel,
    routerUptime,
    routerCpu,
    routerRam,
    kpis: [],
    sections: []
  };

  const selectedSys = options?.selectedSystem || 'all';
  const statusFilt = options?.statusFilter || 'all';
  const selectedIdsSet = new Set(options?.selectedIds || []);

  switch (activeTab) {
    case 'dashboard': {
      const usersCount = (contextData.users || []).length;
      const activeHotspotCount = (contextData.activeUsers || []).length;
      const pppActiveCount = (contextData.pppActive || []).length;
      const usermanActiveCount = (contextData.usermanActive || []).length;
      const totalActive = activeHotspotCount + pppActiveCount + usermanActiveCount;
      const totalInterfaces = (contextData.interfaces || []).length;
      const runningInterfaces = (contextData.interfaces || []).filter((i: any) => i.running).length;

      defaultResult.title = options?.customTitle || 'تقرير لوحة المراقبة الشاملة';
      defaultResult.titleEn = 'CENTRAL DASHBOARD REPORT';
      defaultResult.subtitle = 'حالة السيرفر اللحظية، حركة الباندويث، والمنافذ والجلسات المتصلة';
      defaultResult.kpis = [
        { label: 'إجمالي الجلسات المتصلة', value: totalActive, sublabel: 'هوتسبوت وبرودباند ويوزرمانجر', color: 'emerald' },
        { label: 'استهلاك المعالج CPU', value: `${routerCpu}%`, sublabel: 'حمولة المعالج اللحظية', color: routerCpu > 80 ? 'rose' : 'blue' },
        { label: 'الذاكرة المتاحة RAM', value: routerRam, sublabel: 'الذاكرة الحرة بالسيرفر', color: 'purple' },
        { label: 'إجمالي المشتركين المسجلين', value: usersCount + (contextData.pppSecrets || []).length + (contextData.usermanUsers || []).length, sublabel: 'الحسابات المسجلة بالسيرفر', color: 'blue' },
        { label: 'المنافذ الفعالة', value: `${runningInterfaces} / ${totalInterfaces}`, sublabel: 'منافذ الشبكة النشطة', color: 'amber' }
      ];

      const ifaceRows = (contextData.interfaces || []).map((i: any) => ({
        name: i.name,
        type: i.type || 'ether',
        status: i.running ? 'متصل (Running)' : 'متوقف (Down)',
        rxSpeed: i.rxBps ? formatBps(i.rxBps) : '0 bps',
        txSpeed: i.txBps ? formatBps(i.txBps) : '0 bps',
        totalRx: i.rxBytes ? formatBytes(i.rxBytes) : '0 B',
        totalTx: i.txBytes ? formatBytes(i.txBytes) : '0 B'
      }));

      const sessionRows = (contextData.activeUsers || []).slice(0, 50).map((a: any) => ({
        user: a.user,
        system: 'Hotspot',
        address: a.address,
        macAddress: a.macAddress,
        uptime: a.uptime,
        volume: formatBytes((a.bytesIn || 0) + (a.bytesOut || 0))
      }));

      defaultResult.sections = [
        {
          title: 'حركة منافذ الشبكة والسرعات اللحظية (Network Interfaces)',
          columns: [
            { key: 'name', label: 'المنفذ', width: '18%' },
            { key: 'type', label: 'النوع', width: '14%' },
            { key: 'status', label: 'الحالة', align: 'center', width: '15%' },
            { key: 'rxSpeed', label: 'سرعة الاستقبال RX', align: 'left', isMonospace: true, width: '17%' },
            { key: 'txSpeed', label: 'سرعة الإرسال TX', align: 'left', isMonospace: true, width: '17%' },
            { key: 'totalRx', label: 'إجمالي المستلم', align: 'left', isMonospace: true, width: '19%' }
          ],
          rows: ifaceRows
        },
        {
          title: 'أبرز الجلسات النشطة المتصلة الآن (Top Active Sessions)',
          columns: [
            { key: 'user', label: 'المستخدم', width: '22%' },
            { key: 'address', label: 'عنوان IP', align: 'left', isMonospace: true, width: '18%' },
            { key: 'macAddress', label: 'الماك أدرس MAC', align: 'left', isMonospace: true, width: '22%' },
            { key: 'uptime', label: 'وقت الاتصال', isMonospace: true, width: '16%' },
            { key: 'volume', label: 'البيانات المستهلكة', align: 'left', isMonospace: true, width: '22%' }
          ],
          rows: sessionRows
        }
      ];
      break;
    }

    // Comprehensive Subscribers Management (Hotspot, PPPoE, User Manager, All Systems)
    case 'subscribers':
    case 'hotspot_users':
    case 'ppp':
    case 'userman': {
      const targetSystem =
        selectedSys !== 'all'
          ? selectedSys
          : activeTab === 'ppp'
          ? 'pppoe'
          : activeTab === 'userman'
          ? 'userman'
          : activeTab === 'hotspot_users'
          ? 'hotspot'
          : 'all';

      const hsActiveSet = new Set((contextData.activeUsers || []).map((a: any) => String(a.user || '').toLowerCase()));
      const pppActiveSet = new Set((contextData.pppActive || []).map((a: any) => String(a.name || '').toLowerCase()));
      const umActiveSet = new Set((contextData.usermanActive || []).map((a: any) => String(a.user || a.username || '').toLowerCase()));

      interface NormalizedSubscriber {
        id: string;
        name: string;
        password?: string;
        system: string;
        systemKey: 'hotspot' | 'pppoe' | 'userman';
        profile: string;
        uptime: string;
        dataUsed: string;
        status: string;
        statusRaw: 'online' | 'expired' | 'idle' | 'suspended';
        comment: string;
        ipAddress?: string;
      }

      const allSubscribers: NormalizedSubscriber[] = [];

      // 1. Hotspot Subscribers
      if (targetSystem === 'hotspot' || targetSystem === 'all') {
        (contextData.users || []).forEach((u: any) => {
          const uName = String(u.name || '').toLowerCase();
          const isOnline = hsActiveSet.has(uName);
          const isSuspended = Boolean(u.disabled);
          const commentStr = String(u.comment || '').toLowerCase();
          const isExpired =
            commentStr.includes('expired') ||
            commentStr.includes('منتهي') ||
            (u.limitUptime && u.uptime && u.uptime >= u.limitUptime) ||
            (u.limitBytesTotal && (Number(u.bytesIn || 0) + Number(u.bytesOut || 0)) >= Number(u.limitBytesTotal));

          const statusRaw: 'online' | 'expired' | 'idle' | 'suspended' = isSuspended
            ? 'suspended'
            : isExpired
            ? 'expired'
            : isOnline
            ? 'online'
            : 'idle';

          allSubscribers.push({
            id: String(u.id || u['.id'] || u.name),
            name: u.name || 'مستخدم',
            password: u.password || '—',
            system: 'الهوتسبوت',
            systemKey: 'hotspot',
            profile: u.profile || 'default',
            uptime: u.uptime || '0s',
            dataUsed: formatBytes((Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0)),
            status: isSuspended ? 'معطل' : isExpired ? 'منتهي' : isOnline ? 'متصل' : 'خامل',
            statusRaw,
            comment: u.comment || '—',
            ipAddress: u.address || (u.raw && u.raw.address) || ''
          });
        });
      }

      // 2. PPPoE Subscribers
      if (targetSystem === 'pppoe' || targetSystem === 'all') {
        (contextData.pppSecrets || []).forEach((s: any) => {
          const sName = String(s.name || '').toLowerCase();
          const isOnline = pppActiveSet.has(sName);
          const isSuspended = Boolean(s.disabled);
          const commentStr = String(s.comment || '').toLowerCase();
          const isExpired = commentStr.includes('expired') || commentStr.includes('منتهي');

          const statusRaw: 'online' | 'expired' | 'idle' | 'suspended' = isSuspended
            ? 'suspended'
            : isExpired
            ? 'expired'
            : isOnline
            ? 'online'
            : 'idle';

          allSubscribers.push({
            id: String(s.id || s['.id'] || s.name),
            name: s.name || 'مشترك PPPoE',
            password: s.password || '—',
            system: 'البرودباند PPPoE',
            systemKey: 'pppoe',
            profile: s.profile || 'default',
            uptime: isOnline ? 'متصل الآن' : '0s',
            dataUsed: '—',
            status: isSuspended ? 'معطل' : isExpired ? 'منتهي' : isOnline ? 'متصل' : 'خامل',
            statusRaw,
            comment: s.comment || '—',
            ipAddress: s.remoteAddress || s.localAddress || ''
          });
        });
      }

      // 3. User Manager Subscribers
      if (targetSystem === 'userman' || targetSystem === 'all') {
        (contextData.usermanUsers || []).forEach((u: any) => {
          const uName = String(u.name || u.username || '').toLowerCase();
          const isOnline = umActiveSet.has(uName);
          const isSuspended = Boolean(u.disabled || u.state === 'disabled');
          const isExpired =
            u.state === 'expired' ||
            u.state === 'used_up' ||
            String(u.comment || '').toLowerCase().includes('expired') ||
            String(u.comment || '').includes('منتهي');

          const statusRaw: 'online' | 'expired' | 'idle' | 'suspended' = isSuspended
            ? 'suspended'
            : isExpired
            ? 'expired'
            : isOnline
            ? 'online'
            : 'idle';

          allSubscribers.push({
            id: String(u.id || u['.id'] || u.name),
            name: u.name || u.username || 'مشترك UM',
            password: u.password || '—',
            system: 'اليوزر مانجر',
            systemKey: 'userman',
            profile: u.profile || u.actualProfile || 'default',
            uptime: u.uptime || '0s',
            dataUsed: formatBytes((Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0)),
            status: isSuspended ? 'معطل' : isExpired ? 'منتهي' : isOnline ? 'متصل' : 'خامل',
            statusRaw,
            comment: u.comment || (u.customer ? `Customer: ${u.customer}` : '—'),
            ipAddress: ''
          });
        });
      }

      // Filter by Status subset:
      let filteredSubscribers = allSubscribers;
      if (statusFilt === 'selected' && selectedIdsSet.size > 0) {
        filteredSubscribers = allSubscribers.filter((s) => selectedIdsSet.has(s.id) || selectedIdsSet.has(s.name));
      } else if (statusFilt === 'online') {
        filteredSubscribers = allSubscribers.filter((s) => s.statusRaw === 'online');
      } else if (statusFilt === 'expired') {
        filteredSubscribers = allSubscribers.filter((s) => s.statusRaw === 'expired');
      } else if (statusFilt === 'idle') {
        filteredSubscribers = allSubscribers.filter((s) => s.statusRaw === 'idle');
      } else if (statusFilt === 'suspended') {
        filteredSubscribers = allSubscribers.filter((s) => s.statusRaw === 'suspended');
      } else if (options?.filterScope === 'filtered' && options?.filteredItems?.length) {
        // If external filtered items were passed and no specific status button pressed
        const filteredNames = new Set(options.filteredItems.map((it: any) => String(it.name || it.id).toLowerCase()));
        filteredSubscribers = allSubscribers.filter((s) => filteredNames.has(s.name.toLowerCase()) || filteredNames.has(s.id.toLowerCase()));
      }

      const totalCount = filteredSubscribers.length;
      const onlineCount = allSubscribers.filter((s) => s.statusRaw === 'online').length;
      const expiredCount = allSubscribers.filter((s) => s.statusRaw === 'expired').length;
      const idleCount = allSubscribers.filter((s) => s.statusRaw === 'idle').length;
      const suspendedCount = allSubscribers.filter((s) => s.statusRaw === 'suspended').length;

      const systemLabel =
        targetSystem === 'hotspot'
          ? 'الهوتسبوت Hotspot'
          : targetSystem === 'pppoe'
          ? 'البرودباند PPPoE'
          : targetSystem === 'userman'
          ? 'اليوزر مانجر User Manager'
          : 'كافة أنظمة الاشتراكات';

      const statusLabel =
        statusFilt === 'online'
          ? 'المتصلين الآن (Online)'
          : statusFilt === 'expired'
          ? 'المنتهين (Expired)'
          : statusFilt === 'idle'
          ? 'الخاملين (Offline)'
          : statusFilt === 'suspended'
          ? 'المعلقين / الموقوفين'
          : statusFilt === 'selected'
          ? 'المشتركين المحددين'
          : 'كافة الحسابات';

      defaultResult.title = options?.customTitle || `تقرير مشتركي ${systemLabel} - ${statusLabel}`;
      defaultResult.titleEn = `SUBSCRIBERS REPORT - ${targetSystem.toUpperCase()}`;
      defaultResult.subtitle = `بيانات المشتركين، الحسابات، استهلاك الباندويث والحالة اللحظية بالسيرفر`;
      defaultResult.kpis = [
        { label: 'إجمالي المشمولين', value: totalCount, sublabel: 'سجلات التقرير الحالية', color: 'blue' },
        { label: 'المتصلين الآن Online', value: onlineCount, sublabel: 'جلسات نشطة حقيقية', color: 'emerald' },
        { label: 'المنتهين Expired', value: expiredCount, sublabel: 'انتهت حصتهم أو وقتهم', color: 'amber' },
        { label: 'الحسابات المعلقة', value: suspendedCount, sublabel: 'موقوفة بالسيرفر', color: 'rose' },
        { label: 'الخاملين Offline', value: idleCount, sublabel: 'غير متصلين حالياً', color: 'slate' }
      ];

      // Columns layout: if unified all systems, include system column
      const columns: ReportColumn[] = [];
      columns.push({ key: 'name', label: 'اسم المشترك / الحساب', width: targetSystem === 'all' ? '18%' : '20%' });
      if (targetSystem === 'all') {
        columns.push({ key: 'system', label: 'النظام', align: 'center', width: '14%' });
      }
      columns.push({ key: 'password', label: 'كلمة المرور', width: '13%' });
      columns.push({ key: 'profile', label: 'البروفايل', width: '15%' });
      columns.push({ key: 'uptime', label: 'وقت الاستخدام', isMonospace: true, width: '12%' });
      columns.push({ key: 'dataUsed', label: 'البيانات المنقولة', align: 'left', isMonospace: true, width: '14%' });
      columns.push({ key: 'status', label: 'الحالة', align: 'center', width: '12%' });
      columns.push({ key: 'comment', label: 'الملاحظات', width: targetSystem === 'all' ? '14%' : '14%' });

      defaultResult.sections = [
        {
          columns,
          rows: filteredSubscribers
        }
      ];
      break;
    }

    // Profiles Management (Hotspot Profiles, PPPoE Profiles, Userman Profiles, All)
    case 'profiles': {
      const targetSystem = selectedSys; // 'all' | 'hotspot' | 'pppoe' | 'userman'

      const hProfiles = contextData.profiles || [];
      const pProfiles = contextData.pppProfiles || [];
      const umProfiles = contextData.usermanProfiles || [];

      interface NormalizedProfile {
        id: string;
        name: string;
        system: string;
        systemKey: string;
        rateLimit: string;
        sharedUsers: string | number;
        validityOrTimeout: string;
        pricing: string;
        details: string;
      }

      const allProfiles: NormalizedProfile[] = [];

      if (targetSystem === 'hotspot' || targetSystem === 'all') {
        hProfiles.forEach((p: any) => {
          allProfiles.push({
            id: String(p.id || p['.id'] || p.name),
            name: p.name || 'default',
            system: 'الهوتسبوت',
            systemKey: 'hotspot',
            rateLimit: p.rateLimit || 'مفتوح (غير محدد)',
            sharedUsers: p.sharedUsers || 1,
            validityOrTimeout: p.sessionTimeout || p.keepaliveTimeout || 'غير محدد',
            pricing: p.price ? `${p.price} د.ع` : '—',
            details: p.pool ? `Pool: ${p.pool}` : '—'
          });
        });
      }

      if (targetSystem === 'pppoe' || targetSystem === 'all') {
        pProfiles.forEach((p: any) => {
          allProfiles.push({
            id: String(p.id || p['.id'] || p.name),
            name: p.name || 'default',
            system: 'البرودباند PPPoE',
            systemKey: 'pppoe',
            rateLimit: p.rateLimit || 'مفتوح (غير محدد)',
            sharedUsers: p.onlyOne === 'yes' ? 1 : 'متعدد',
            validityOrTimeout: p.sessionTimeout || '—',
            pricing: '—',
            details: p.remoteAddress ? `IP: ${p.remoteAddress}` : '—'
          });
        });
      }

      if (targetSystem === 'userman' || targetSystem === 'all') {
        umProfiles.forEach((p: any) => {
          allProfiles.push({
            id: String(p.id || p['.id'] || p.name),
            name: p.name || 'default',
            system: 'اليوزر مانجر',
            systemKey: 'userman',
            rateLimit: p.rateLimit || 'حسب القيود',
            sharedUsers: p.sharedUsers || 1,
            validityOrTimeout: p.validity || '30d',
            pricing: p.price ? `${p.price}` : '—',
            details: p.owner ? `Owner: ${p.owner}` : '—'
          });
        });
      }

      let filteredProfiles = allProfiles;
      if (statusFilt === 'limited') {
        filteredProfiles = allProfiles.filter((p) => p.rateLimit !== 'مفتوح (غير محدد)' && p.rateLimit !== 'حسب القيود');
      } else if (statusFilt === 'unlimited') {
        filteredProfiles = allProfiles.filter((p) => p.rateLimit === 'مفتوح (غير محدد)');
      } else if (statusFilt === 'selected' && selectedIdsSet.size > 0) {
        filteredProfiles = allProfiles.filter((p) => selectedIdsSet.has(p.id) || selectedIdsSet.has(p.name));
      }

      const systemLabel =
        targetSystem === 'hotspot'
          ? 'بروفايلات الهوتسبوت'
          : targetSystem === 'pppoe'
          ? 'بروفايلات البرودباند PPPoE'
          : targetSystem === 'userman'
          ? 'بروفايلات اليوزر مانجر'
          : 'كافة باقات وبروفايلات السرعة';

      defaultResult.title = options?.customTitle || `تقرير ${systemLabel}`;
      defaultResult.titleEn = 'PROFILES & BANDWIDTH PACKAGES REPORT';
      defaultResult.subtitle = 'باقات وتحديدات السرعات، الحصص، والمستخدمين المشتركين لكل بروفايل';
      defaultResult.kpis = [
        { label: 'إجمالي الباقات بالتقرير', value: filteredProfiles.length, color: 'blue' },
        { label: 'بروفايلات الهوتسبوت', value: hProfiles.length, color: 'emerald' },
        { label: 'بروفايلات PPPoE', value: pProfiles.length, color: 'purple' },
        { label: 'بروفايلات اليوزر مانجر', value: umProfiles.length, color: 'amber' }
      ];

      const columns: ReportColumn[] = [
        { key: 'name', label: 'اسم البروفايل / الباقة', width: '22%' },
        ...(targetSystem === 'all' ? [{ key: 'system', label: 'النظام', align: 'center' as const, width: '15%' }] : []),
        { key: 'rateLimit', label: 'تحديد السرعة (رفع / تنزيل)', isMonospace: true, width: '24%' },
        { key: 'sharedUsers', label: 'المستخدمين المشتركين', align: 'center' as const, width: '13%' },
        { key: 'validityOrTimeout', label: 'الصلاحية / المهلة', isMonospace: true, width: '14%' },
        { key: 'details', label: 'تفاصيل إضافية', width: '12%' }
      ];

      defaultResult.sections = [
        {
          columns,
          rows: filteredProfiles
        }
      ];
      break;
    }

    // Active Live Sessions
    case 'active_sessions': {
      const targetSystem = selectedSys; // 'all' | 'hotspot' | 'pppoe' | 'userman'

      const hotspotList = contextData.activeUsers || [];
      const pppList = contextData.pppActive || [];
      const usermanList = contextData.usermanActive || [];

      const rows: any[] = [];

      if (targetSystem === 'hotspot' || targetSystem === 'all') {
        hotspotList.forEach((a: any) => {
          rows.push({
            user: a.user,
            system: 'الهوتسبوت',
            systemKey: 'hotspot',
            address: a.address,
            macAddress: a.macAddress,
            uptime: a.uptime,
            rxRate: a.rxRateBps ? formatBps(a.rxRateBps) : '—',
            txRate: a.txRateBps ? formatBps(a.txRateBps) : '—',
            rawBytes: (Number(a.bytesIn) || 0) + (Number(a.bytesOut) || 0),
            volume: formatBytes((Number(a.bytesIn) || 0) + (Number(a.bytesOut) || 0))
          });
        });
      }

      if (targetSystem === 'pppoe' || targetSystem === 'all') {
        pppList.forEach((p: any) => {
          rows.push({
            user: p.name,
            system: 'PPPoE',
            systemKey: 'pppoe',
            address: p.address,
            macAddress: p.callerId || '—',
            uptime: p.uptime,
            rxRate: '—',
            txRate: '—',
            rawBytes: (Number(p.bytesIn) || 0) + (Number(p.bytesOut) || 0),
            volume: formatBytes((Number(p.bytesIn) || 0) + (Number(p.bytesOut) || 0))
          });
        });
      }

      if (targetSystem === 'userman' || targetSystem === 'all') {
        usermanList.forEach((u: any) => {
          rows.push({
            user: u.user || u.username,
            system: 'اليوزر مانجر',
            systemKey: 'userman',
            address: u.assignedIp || u.address || '—',
            macAddress: u.callerId || '—',
            uptime: u.uptime || '0s',
            rxRate: '—',
            txRate: '—',
            rawBytes: (Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0),
            volume: formatBytes((Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0))
          });
        });
      }

      let filteredSessions = rows;
      if (statusFilt === 'top_bandwidth') {
        filteredSessions = [...rows].sort((a, b) => (b.rawBytes || 0) - (a.rawBytes || 0));
      }

      defaultResult.title = options?.customTitle || 'تقرير الجلسات النشطة والمتصلة حالياً';
      defaultResult.titleEn = 'ACTIVE LIVE SESSIONS REPORT';
      defaultResult.subtitle = 'قائمة المشتركين المتصلين حالياً على السيرفر واستهلاكهم المباشر للباندويث';
      defaultResult.kpis = [
        { label: 'إجمالي الجلسات النشطة', value: rows.length, color: 'emerald' },
        { label: 'جلسات الهوتسبوت', value: hotspotList.length, color: 'blue' },
        { label: 'جلسات PPPoE', value: pppList.length, color: 'purple' },
        { label: 'جلسات اليوزر مانجر', value: usermanList.length, color: 'amber' }
      ];

      defaultResult.sections = [
        {
          columns: [
            { key: 'user', label: 'اسم المشترك', width: '22%' },
            { key: 'system', label: 'النظام', align: 'center', width: '13%' },
            { key: 'address', label: 'عنوان IP', align: 'left', isMonospace: true, width: '17%' },
            { key: 'macAddress', label: 'الماك أدرس MAC', align: 'left', isMonospace: true, width: '20%' },
            { key: 'uptime', label: 'مدة الاتصال', isMonospace: true, width: '13%' },
            { key: 'volume', label: 'البيانات المنقولة', align: 'left', isMonospace: true, width: '15%' }
          ],
          rows: filteredSessions
        }
      ];
      break;
    }

    // Queues / Bandwidth Limiting
    case 'queues': {
      let queues = contextData.simpleQueues || [];
      if (statusFilt === 'active') {
        queues = queues.filter((q: any) => !q.disabled);
      } else if (statusFilt === 'disabled') {
        queues = queues.filter((q: any) => q.disabled);
      }

      defaultResult.title = options?.customTitle || 'تقرير محددات السرعة وتوزيع الباندويث (Queues)';
      defaultResult.titleEn = 'BANDWIDTH QUEUES REPORT';
      defaultResult.subtitle = 'قواعد تحديد السرعات والمعدلات القصوى والأولويات في المايكروتك';
      defaultResult.kpis = [
        { label: 'إجمالي الكيوز بالتقرير', value: queues.length, color: 'blue' },
        { label: 'الكيوز الفعالة', value: (contextData.simpleQueues || []).filter((q: any) => !q.disabled).length, color: 'emerald' },
        { label: 'الكيوز المعطلة', value: (contextData.simpleQueues || []).filter((q: any) => q.disabled).length, color: 'rose' }
      ];

      const rows = queues.map((q: any) => ({
        name: q.name,
        target: q.target,
        maxLimit: q.maxLimit || 'غير محدد',
        rate: q.rate || '0/0',
        bytes: q.bytes ? formatBytes(Number(q.bytes.split('/')[0] || 0) + Number(q.bytes.split('/')[1] || 0)) : '0 B',
        priority: q.priority || '8/8',
        status: q.disabled ? 'معطل' : 'مفعل'
      }));

      defaultResult.sections = [
        {
          columns: [
            { key: 'name', label: 'اسم الكيو', width: '22%' },
            { key: 'target', label: 'الهدف (IP / Subnet)', align: 'left', isMonospace: true, width: '20%' },
            { key: 'maxLimit', label: 'أقصى سرعة (رفع/تنزيل)', isMonospace: true, width: '22%' },
            { key: 'bytes', label: 'إجمالي البيانات', align: 'left', isMonospace: true, width: '16%' },
            { key: 'status', label: 'الحالة', align: 'center', width: '10%' },
            { key: 'priority', label: 'الأولوية', align: 'center', width: '10%' }
          ],
          rows
        }
      ];
      break;
    }

    // DHCP Server Leases
    case 'dhcp': {
      let leases = contextData.dhcpLeases || [];
      if (statusFilt === 'bound') {
        leases = leases.filter((l: any) => l.status === 'bound');
      } else if (statusFilt === 'dynamic') {
        leases = leases.filter((l: any) => l.dynamic);
      } else if (statusFilt === 'static') {
        leases = leases.filter((l: any) => !l.dynamic);
      }

      defaultResult.title = options?.customTitle || 'تقرير توزيع عناوين سيرفر DHCP والأجهزة';
      defaultResult.titleEn = 'DHCP SERVER LEASES REPORT';
      defaultResult.subtitle = 'قائمة العناوين الموزعة، الأجهزة المتصلة، الماك أدرس، وفترات الصلاحية';
      defaultResult.kpis = [
        { label: 'إجمالي العناوين بالتقرير', value: leases.length, color: 'blue' },
        { label: 'العناوين النشطة Bound', value: (contextData.dhcpLeases || []).filter((l: any) => l.status === 'bound').length, color: 'emerald' },
        { label: 'عناوين ديناميكية', value: (contextData.dhcpLeases || []).filter((l: any) => l.dynamic).length, color: 'purple' },
        { label: 'عناوين ثابتة Static', value: (contextData.dhcpLeases || []).filter((l: any) => !l.dynamic).length, color: 'amber' }
      ];

      const rows = leases.map((l: any) => ({
        address: l.address,
        macAddress: l.macAddress,
        hostName: l.hostName || l['host-name'] || '—',
        type: l.dynamic ? 'ديناميكي' : 'ثابت',
        status: l.status || 'bound',
        expiresAfter: l.expiresAfter || l['expires-after'] || '—'
      }));

      defaultResult.sections = [
        {
          columns: [
            { key: 'address', label: 'عنوان IP', align: 'left', isMonospace: true, width: '20%' },
            { key: 'macAddress', label: 'عنوان MAC', align: 'left', isMonospace: true, width: '24%' },
            { key: 'hostName', label: 'اسم الجهاز', width: '22%' },
            { key: 'type', label: 'النوع', align: 'center', width: '11%' },
            { key: 'status', label: 'الحالة', align: 'center', width: '11%' },
            { key: 'expiresAfter', label: 'الصلاحية', isMonospace: true, width: '12%' }
          ],
          rows
        }
      ];
      break;
    }

    // Network Interfaces & Traffic
    case 'traffic': {
      let ifaces = contextData.interfaces || [];
      if (statusFilt === 'running') {
        ifaces = ifaces.filter((i: any) => i.running);
      } else if (statusFilt === 'ethernet') {
        ifaces = ifaces.filter((i: any) => String(i.type || '').includes('ether'));
      } else if (statusFilt === 'wireless') {
        ifaces = ifaces.filter((i: any) => String(i.type || '').includes('wlan') || String(i.type || '').includes('bridge'));
      }

      defaultResult.title = options?.customTitle || 'تقرير حركة المنافذ والترافيك المباشر';
      defaultResult.titleEn = 'INTERFACES & TRAFFIC REPORT';
      defaultResult.subtitle = 'حالة منافذ الإيثرنت والوايرلس، معدلات الاستقبال والإرسال اللحظية والتراكمية';
      defaultResult.kpis = [
        { label: 'إجمالي المنافذ بالتقرير', value: ifaces.length, color: 'blue' },
        { label: 'المنافذ المتصلة Running', value: (contextData.interfaces || []).filter((i: any) => i.running).length, color: 'emerald' },
        { label: 'المنافذ المعطلة', value: (contextData.interfaces || []).filter((i: any) => i.disabled).length, color: 'rose' }
      ];

      const rows = ifaces.map((i: any) => ({
        name: i.name,
        type: i.type || 'ether',
        status: i.running ? 'متصل' : 'معطل',
        rxRate: i.rxBps ? formatBps(i.rxBps) : '0 bps',
        txRate: i.txBps ? formatBps(i.txBps) : '0 bps',
        totalRx: i.rxBytes ? formatBytes(i.rxBytes) : '0 B',
        totalTx: i.txBytes ? formatBytes(i.txBytes) : '0 B'
      }));

      defaultResult.sections = [
        {
          columns: [
            { key: 'name', label: 'اسم المنفذ', width: '16%' },
            { key: 'type', label: 'النوع', width: '12%' },
            { key: 'status', label: 'الحالة', align: 'center', width: '12%' },
            { key: 'rxRate', label: 'سرعة الاستقبال RX', align: 'left', isMonospace: true, width: '16%' },
            { key: 'txRate', label: 'سرعة الإرسال TX', align: 'left', isMonospace: true, width: '16%' },
            { key: 'totalRx', label: 'إجمالي المستلم', align: 'left', isMonospace: true, width: '14%' },
            { key: 'totalTx', label: 'إجمالي المرسل', align: 'left', isMonospace: true, width: '14%' }
          ],
          rows
        }
      ];
      break;
    }

    // Firewall Security Rules
    case 'firewall': {
      let rules = contextData.firewallRules || [];
      const subSys = selectedSys; // 'all' | 'filter' | 'nat' | 'mangle'

      if (subSys !== 'all') {
        rules = rules.filter((r: any) => (r.table || 'filter') === subSys || (r.chain && r.chain.includes(subSys)));
      }
      if (statusFilt === 'drop') {
        rules = rules.filter((r: any) => r.action === 'drop' || r.action === 'reject');
      } else if (statusFilt === 'accept') {
        rules = rules.filter((r: any) => r.action === 'accept');
      } else if (statusFilt === 'active') {
        rules = rules.filter((r: any) => !r.disabled);
      }

      defaultResult.title = options?.customTitle || 'تقرير قواعد الجدار الناري والأمان (Firewall)';
      defaultResult.titleEn = 'FIREWALL SECURITY RULES REPORT';
      defaultResult.subtitle = 'قواعد التصفية والفلترة والحماية ضد الهجمات في المايكروتك';
      defaultResult.kpis = [
        { label: 'إجمالي القواعد بالتقرير', value: rules.length, color: 'blue' },
        { label: 'قواعد المنع Drop', value: (contextData.firewallRules || []).filter((r: any) => r.action === 'drop').length, color: 'rose' },
        { label: 'قواعد السماح Accept', value: (contextData.firewallRules || []).filter((r: any) => r.action === 'accept').length, color: 'emerald' },
        { label: 'القواعد المعطلة', value: (contextData.firewallRules || []).filter((r: any) => r.disabled).length, color: 'slate' }
      ];

      const rows = rules.map((r: any) => ({
        chain: r.chain,
        action: r.action,
        protocol: r.protocol || 'any',
        srcAddress: r.srcAddress || 'any',
        dstAddress: r.dstAddress || 'any',
        dstPort: r.dstPort || 'any',
        status: r.disabled ? 'معطل' : 'مفعل',
        comment: r.comment || '—'
      }));

      defaultResult.sections = [
        {
          columns: [
            { key: 'chain', label: 'المسار Chain', width: '14%' },
            { key: 'action', label: 'الإجراء', align: 'center', width: '12%' },
            { key: 'protocol', label: 'البروتوكول', align: 'center', width: '12%' },
            { key: 'srcAddress', label: 'عنوان المصدر', align: 'left', isMonospace: true, width: '18%' },
            { key: 'dstAddress', label: 'عنوان الوجهة', align: 'left', isMonospace: true, width: '18%' },
            { key: 'status', label: 'الحالة', align: 'center', width: '10%' },
            { key: 'comment', label: 'الملاحظات', width: '16%' }
          ],
          rows
        }
      ];
      break;
    }

    // System Logs
    case 'logs': {
      let logs = contextData.systemLogs || [];
      if (statusFilt === 'errors') {
        logs = logs.filter((l: any) => String(l.topics || '').includes('error') || String(l.topics || '').includes('warning'));
      } else if (statusFilt === 'hotspot') {
        logs = logs.filter((l: any) => String(l.topics || '').includes('hotspot'));
      } else if (statusFilt === 'system') {
        logs = logs.filter((l: any) => String(l.topics || '').includes('system'));
      }

      defaultResult.title = options?.customTitle || 'تقرير سجل أحداث وتحذيرات السيرفر (Logs)';
      defaultResult.titleEn = 'ROUTER SYSTEM LOGS REPORT';
      defaultResult.subtitle = 'سجل التنبيهات، تسجيل الدخول، رسائل الجدار الناري، والتحذيرات';
      defaultResult.kpis = [
        { label: 'إجمالي السجلات بالتقرير', value: logs.length, color: 'blue' },
        { label: 'أحداث التنبيهات والخطأ', value: (contextData.systemLogs || []).filter((l: any) => String(l.topics || '').includes('error') || String(l.topics || '').includes('warning')).length, color: 'rose' },
        { label: 'أحداث الهوتسبوت', value: (contextData.systemLogs || []).filter((l: any) => String(l.topics || '').includes('hotspot')).length, color: 'emerald' }
      ];

      const rows = logs.slice(0, 200).map((l: any) => ({
        time: l.time || '—',
        topics: l.topics || 'system,info',
        message: l.message || '—'
      }));

      defaultResult.sections = [
        {
          columns: [
            { key: 'time', label: 'الوقت والتاريخ', isMonospace: true, width: '22%' },
            { key: 'topics', label: 'التصنيف Topics', width: '24%' },
            { key: 'message', label: 'رسالة الحدث', width: '54%' }
          ],
          rows
        }
      ];
      break;
    }

    // IP Binding
    case 'ip_binding': {
      let bindings = contextData.ipBindings || [];
      if (statusFilt === 'bypassed') {
        bindings = bindings.filter((b: any) => b.type === 'bypassed');
      } else if (statusFilt === 'blocked') {
        bindings = bindings.filter((b: any) => b.type === 'blocked');
      }

      defaultResult.title = options?.customTitle || 'تقرير الأجهزة المستثناة والمقيدة (IP Binding)';
      defaultResult.titleEn = 'HOTSPOT IP BINDING REPORT';
      defaultResult.subtitle = 'الأجهزة المسموح لها بتجاوز شاشة الدخول (Bypassed) أو المحظورة (Blocked)';
      defaultResult.kpis = [
        { label: 'إجمالي الأجهزة بالتقرير', value: bindings.length, color: 'blue' },
        { label: 'أجهزة مستثناة (Bypassed)', value: (contextData.ipBindings || []).filter((b: any) => b.type === 'bypassed').length, color: 'emerald' },
        { label: 'أجهزة محظورة (Blocked)', value: (contextData.ipBindings || []).filter((b: any) => b.type === 'blocked').length, color: 'rose' }
      ];

      const rows = bindings.map((b: any) => ({
        macAddress: b.macAddress || '—',
        address: b.address || '—',
        type: b.type === 'bypassed' ? 'مستثنى (Bypass)' : b.type === 'blocked' ? 'محظور (Block)' : 'عادي',
        status: b.disabled ? 'معطل' : 'مفعل',
        comment: b.comment || '—'
      }));

      defaultResult.sections = [
        {
          columns: [
            { key: 'macAddress', label: 'عنوان MAC', align: 'left', isMonospace: true, width: '25%' },
            { key: 'address', label: 'عنوان IP', align: 'left', isMonospace: true, width: '20%' },
            { key: 'type', label: 'نوع الاستثناء', align: 'center', width: '18%' },
            { key: 'status', label: 'الحالة', align: 'center', width: '12%' },
            { key: 'comment', label: 'الملاحظات', width: '25%' }
          ],
          rows
        }
      ];
      break;
    }

    default: {
      defaultResult.title = options?.customTitle || `تقرير قسم ${activeTab}`;
      defaultResult.titleEn = `${String(activeTab).toUpperCase()} REPORT`;
      defaultResult.subtitle = 'بيانات وسجلات قسم السيرفر المحددة';
      defaultResult.kpis = [
        { label: 'حالة الاتصال', value: 'متصل ومحدث', color: 'emerald' },
        { label: 'السيرفر', value: routerName, color: 'blue' }
      ];
      defaultResult.sections = [
        {
          columns: [
            { key: 'item', label: 'العنصر', width: '30%' },
            { key: 'value', label: 'القيمة / البيان', width: '70%' }
          ],
          rows: [
            { item: 'اسم السيرفر', value: routerName },
            { item: 'عنوان IP والمنفذ', value: routerHost },
            { item: 'موديل الراوتر', value: routerModel },
            { item: 'إصدار النظام', value: routerVersion },
            { item: 'وقت التشغيل', value: routerUptime },
            { item: 'استهلاك المعالج', value: `${routerCpu}%` },
            { item: 'الذاكرة الحرة', value: routerRam }
          ]
        }
      ];
      break;
    }
  }

  return defaultResult;
}
