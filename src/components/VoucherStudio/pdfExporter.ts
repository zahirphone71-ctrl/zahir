import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { VoucherItem, VoucherDesignState, PrintLayoutOption } from './types';
import { generateStandaloneVoucherHtmlAsync } from './voucherHtmlGenerator';
import { preGenerateQrCodes } from './qrPreGenerator';
import { getPaperSpec } from './gridCalculator';
import { yieldToMain } from '../../lib/scheduler';

export interface ExportBatchPdfParams {
  vouchers: VoucherItem[];
  design: VoucherDesignState;
  layout: PrintLayoutOption;
  networkName: string;
  currencySymbol: string;
  loginUrl: string;
  showPin: boolean;
  showQr: boolean;
  fileName?: string;
  fontScale?: number;
  gapMm?: number;
  paddingMm?: number;
  onProgress?: (progress: number, message?: string) => void;
  signal?: AbortSignal;
}

export interface ExportPdfParams {
  element: HTMLElement | HTMLElement[];
  fileName?: string;
  orientation?: 'portrait' | 'landscape';
  paperType?: VoucherDesignState['paperType'] | string;
  cardHeightMm?: number;
  paddingMm?: number;
  onProgress?: (progress: number, message?: string) => void;
  signal?: AbortSignal;
}

function destroyCanvas(canvas: HTMLCanvasElement): void {
  try {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
  } catch (err) {
    console.warn('destroyCanvas cleanup warning:', err);
  }
}

async function waitForImagesToLoad(container: Document | HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
  if (imgs.length === 0) return;

  await Promise.all(
    imgs.map((img) => {
      if (img.complete && img.naturalWidth !== 0) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const done = () => {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
          img.removeEventListener('load', done);
          img.removeEventListener('error', done);
          resolve();
        };
        img.addEventListener('load', done);
        img.addEventListener('error', done);
        timeoutId = setTimeout(done, 3000);
      });
    })
  );
}

function resolvePdfPaperDimensions(
  paperType: string = 'a4',
  orientation: 'portrait' | 'landscape' = 'portrait',
  cardHeightMm: number = 52,
  paddingMm: number = 4
) {
  const spec = getPaperSpec(
    paperType as VoucherDesignState['paperType'],
    orientation,
    undefined,
    undefined,
    cardHeightMm,
    paddingMm
  );
  if (spec.isPos) {
    return {
      paperWidth: spec.widthMm,
      paperHeight: spec.heightMm,
      pdfWidth: spec.widthMm,
      pdfHeight: spec.heightMm,
      pdfFormat: [spec.widthMm, spec.heightMm] as [number, number],
      isLandscape: false,
      isPos: true,
    };
  }

  const normalized = (paperType || 'a4').toLowerCase();
  const namedFormat: string =
    normalized === 'a3' || normalized === 'a5' || normalized === 'letter' ? normalized : 'a4';

  return {
    paperWidth: spec.widthMm,
    paperHeight: spec.heightMm,
    pdfWidth: spec.widthMm,
    pdfHeight: spec.heightMm,
    pdfFormat: namedFormat,
    isLandscape: orientation === 'landscape',
    isPos: false,
  };
}

export async function exportA4SheetToPdf({
  element,
  fileName = `vouchers-${Date.now()}.pdf`,
  orientation = 'portrait',
  paperType = 'a4',
  cardHeightMm = 52,
  paddingMm = 4,
  onProgress,
  signal,
}: ExportPdfParams): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const elements = Array.isArray(element) ? element : [element];
  if (elements.length === 0) return;

  let hostContainer: HTMLElement | null = null;

  try {
    onProgress?.(5, 'جاري إعداد محرك PDF وتجهيز الخطوط...');
    await yieldToMain();

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const isLandscape = orientation === 'landscape';
    const dim = resolvePdfPaperDimensions(paperType, orientation, cardHeightMm, paddingMm);

    const pdf = new jsPDF({
      orientation: dim.isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: dim.pdfFormat,
      compress: true,
    });

    hostContainer = document.createElement('div');
    hostContainer.id = 'zctrl-pdf-render-isolated-host';
    hostContainer.style.position = 'fixed';
    hostContainer.style.top = '0';
    hostContainer.style.left = '-99999px';
    hostContainer.style.zIndex = '-99999';
    hostContainer.style.opacity = '1';
    hostContainer.style.visibility = 'visible';
    hostContainer.style.pointerEvents = 'none';
    hostContainer.style.background = '#ffffff';
    hostContainer.style.overflow = 'visible';
    document.body.appendChild(hostContainer);

    for (let i = 0; i < elements.length; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const sourceEl = elements[i];
      if (!sourceEl) continue;

      const pageNum = i + 1;
      const baseProgress = Math.round((i / elements.length) * 85);

      onProgress?.(baseProgress + 5, `معالجة الصفحة ${pageNum} من ${elements.length}...`);
      await yieldToMain();

      hostContainer.innerHTML = '';
      const clone = sourceEl.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      clone.style.margin = '0';
      clone.style.boxShadow = 'none';
      hostContainer.appendChild(clone);

      await waitForImagesToLoad(hostContainer);
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const renderScale = elements.length > 5 ? 2.3 : 2.8;
      const canvas = await html2canvas(clone, {
        scale: renderScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        ignoreElements: (node) =>
          node.classList?.contains('no-print') || node.classList?.contains('no-export'),
      });

      onProgress?.(baseProgress + 15, `تحويل الصفحة ${pageNum} إلى PDF عالي الدقة...`);
      await yieldToMain();

      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      if (i > 0) {
        pdf.addPage(dim.pdfFormat, isLandscape && !dim.isPos ? 'landscape' : 'portrait');
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, dim.pdfWidth, dim.pdfHeight, undefined, 'FAST');

      destroyCanvas(canvas);
      hostContainer.innerHTML = '';
      await yieldToMain();
    }

    onProgress?.(95, 'جاري حفظ وتنزيل ملف PDF...');
    await yieldToMain();

    pdf.save(fileName);
    onProgress?.(100, 'تم إنشاء ملف PDF بنجاح!');
  } catch (error) {
    console.error('Error generating PDF in exportA4SheetToPdf:', error);
    throw error;
  } finally {
    if (hostContainer && hostContainer.parentNode) {
      hostContainer.innerHTML = '';
      hostContainer.parentNode.removeChild(hostContainer);
    }
  }
}

export async function exportBatchVouchersToPdf(params: ExportBatchPdfParams): Promise<void> {
  const {
    vouchers,
    design,
    layout,
    networkName,
    currencySymbol,
    loginUrl,
    showPin,
    showQr,
    fileName = `vouchers-${(networkName || 'network').replace(/\s+/g, '_')}-${Date.now()}.pdf`,
    fontScale = 1.0,
    gapMm,
    paddingMm,
    onProgress,
    signal,
  } = params;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!vouchers || vouchers.length === 0) {
    throw new Error('لا توجد كروت للتصدير');
  }

  const resolvedGapMm = gapMm ?? design.cardGap ?? (design.paperType === 'a4_100' ? 1 : 4);
  const resolvedPaddingMm = paddingMm ?? design.cardMarginSide ?? (design.paperType === 'a4_100' ? 2 : 4);
  const isPos = Boolean(
    layout.isPos ||
    layout.id.startsWith('pos') ||
    design.paperType?.includes('thermal') ||
    design.paperType?.startsWith('pos') ||
    (layout.cols === 1 && layout.rows === 1)
  );
  const orientation: 'portrait' | 'landscape' = design.paperOrientation === 'landscape' ? 'landscape' : 'portrait';
  const dim = resolvePdfPaperDimensions(
    design.paperType || 'a4',
    orientation,
    design.cardHeightMm || 52,
    resolvedPaddingMm
  );

  let iframe: HTMLIFrameElement | null = null;
  let qrMap: Map<string, string> | undefined;

  try {
    onProgress?.(5, 'تجهيز باركودات QR للكروت...');
    await yieldToMain();

    if (showQr) {
      qrMap = await preGenerateQrCodes(
        vouchers,
        design.loginUrl || loginUrl || '10.0.0.1',
        design.authMode || 'user_only',
        Math.max(60, Math.round(130 * fontScale)),
        (done, total) => {
          if (done % 25 === 0 || done === total) {
            onProgress?.(5 + Math.round((done / total) * 15), `توليد باركود QR: ${done} من ${total}...`);
          }
        },
        signal
      );
    }

    onProgress?.(22, 'بناء صفحات الطباعة الحقيقية...');
    await yieldToMain();

    const fullHtml = await generateStandaloneVoucherHtmlAsync(
      {
        vouchers,
        design,
        layout,
        networkName,
        currencySymbol,
        loginUrl,
        showPin,
        showQr,
        cols: layout.cols,
        rows: layout.rows,
        theme: design.theme,
        isPos,
        qrDataUrlMap: qrMap,
        fontScale,
        gapMm: resolvedGapMm,
        paddingMm: resolvedPaddingMm,
        signal,
      },
      (msg) => {
        onProgress?.(25, msg);
      }
    );

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // مسار Electron الأصلي (Vector PDF بجودة طباعة احترافية ونصوص حقيقية)
    if (typeof window !== 'undefined' && window.zctrlDesktopPrint?.printToPdf) {
      onProgress?.(55, 'تحويل الصفحات إلى Vector PDF عبر محرك سطح المكتب...');
      const res = await window.zctrlDesktopPrint.printToPdf({
        html: fullHtml,
        fileName,
        paperType: design.paperType || 'a4',
        paperHeightMm: dim.paperHeight,
        orientation,
        isPos,
      });

      if (res.canceled) {
        onProgress?.(0, 'تم إلغاء الحفظ');
        return;
      }
      if (!res.success) {
        throw new Error(res.error || 'فشل تصدير ملف PDF عبر محرك سطح المكتب');
      }
      onProgress?.(100, 'تم حفظ ملف Vector PDF بنجاح!');
      return;
    }

    // مسار المتصفح المعزول عبر Iframe مخفي (دون أي تعديل على document.head)
    iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-99999px';
    iframe.style.top = '0';
    iframe.style.width = '1400px';
    iframe.style.height = '1800px';
    iframe.style.border = 'none';
    iframe.style.pointerEvents = 'none';
    iframe.style.opacity = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      iframe!.addEventListener('load', done, { once: true });
      iframe!.srcdoc = fullHtml;
      setTimeout(done, 1500);
    });

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error('تعذر تهيئة بيئة تصدير PDF المعزولة');
    }

    if (iframeDoc.fonts && iframeDoc.fonts.ready) {
      await iframeDoc.fonts.ready;
    }
    await waitForImagesToLoad(iframeDoc);

    const pageElements = Array.from(iframeDoc.querySelectorAll<HTMLElement>('.a4-page, .pos-page'));
    const totalPages = Math.max(1, pageElements.length);

    const pdf = new jsPDF({
      orientation: dim.isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: dim.pdfFormat,
      compress: true,
    });

    // Adaptive resolution & compression keep memory flat even on 500-1,000+ card batches
    const renderScale = totalPages > 40 ? 1.45 : totalPages > 20 ? 1.7 : totalPages > 8 ? 2.0 : 2.4;
    const jpegQuality = totalPages > 30 ? 0.82 : 0.9;

    for (let p = 0; p < totalPages; p++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const pageEl = pageElements[p];
      if (!pageEl) continue;

      const basePct = 28 + Math.round((p / totalPages) * 65);
      onProgress?.(basePct, `معالجة وتصيير صفحة ${p + 1} من ${totalPages}...`);
      await yieldToMain();

      pageEl.style.margin = '0';
      pageEl.style.boxShadow = 'none';

      const canvas = await html2canvas(pageEl, {
        scale: renderScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        windowWidth: Math.max(iframe.contentWindow?.innerWidth || 1400, 1400),
        ignoreElements: (node) =>
          node.classList?.contains('no-print') || node.classList?.contains('no-export'),
      });

      let imgData: string | null = canvas.toDataURL('image/jpeg', jpegQuality);

      if (p > 0) {
        pdf.addPage(dim.pdfFormat, dim.isLandscape ? 'landscape' : 'portrait');
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, dim.pdfWidth, dim.pdfHeight, undefined, 'FAST');

      imgData = null;
      destroyCanvas(canvas);
      if (totalPages > 10 && (p + 1) % 5 === 0) {
        await new Promise<void>((r) => setTimeout(r, 16));
      } else {
        await yieldToMain();
      }
    }

    onProgress?.(96, 'جاري حفظ وتنزيل ملف PDF المكتمل...');
    await yieldToMain();

    pdf.save(fileName);
    onProgress?.(100, 'تم تصدير ملف PDF بنجاح وبكافة البيانات الحقيقية!');
  } catch (error: unknown) {
    console.error('خطأ تصدير PDF دفعات:', error);
    throw error;
  } finally {
    qrMap?.clear();
    qrMap = undefined;
    if (iframe && iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }
}
