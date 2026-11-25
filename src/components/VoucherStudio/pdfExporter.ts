import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { VoucherItem, VoucherDesignState, PrintLayoutOption } from './types';
import { generateStandaloneVoucherHtmlAsync } from './voucherHtmlGenerator';
import { preGenerateQrCodes } from './qrPreGenerator';
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
  } catch {}
}

async function waitForImagesToLoad(container: HTMLElement): Promise<void> {
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

function getPaperDimensions(paperType: string = 'a4', isLandscape: boolean = false, isPos: boolean = false) {
  let widthMm = 210;
  let heightMm = 297;
  let format: string | [number, number] = 'a4';

  if (isPos || (paperType && paperType.includes('thermal'))) {
    const is58 = paperType === 'thermal_58mm';
    widthMm = is58 ? 58 : 80;
    heightMm = 200;
    format = [widthMm, heightMm];
    return {
      paperWidth: widthMm,
      paperHeight: heightMm,
      pdfWidth: widthMm,
      pdfHeight: heightMm,
      pdfFormat: [widthMm, heightMm] as [number, number],
      isLandscape: false,
    };
  }

  const pType = (paperType || 'a4').toLowerCase();
  if (pType === 'a3') {
    widthMm = 297;
    heightMm = 420;
    format = 'a3';
  } else if (pType === 'a5') {
    widthMm = 148;
    heightMm = 210;
    format = 'a5';
  } else if (pType === 'letter') {
    widthMm = 215.9;
    heightMm = 279.4;
    format = 'letter';
  } else {
    widthMm = 210;
    heightMm = 297;
    format = 'a4';
  }

  const pdfWidth = isLandscape ? heightMm : widthMm;
  const pdfHeight = isLandscape ? widthMm : heightMm;

  return {
    paperWidth: widthMm,
    paperHeight: heightMm,
    pdfWidth,
    pdfHeight,
    pdfFormat: format,
    isLandscape,
  };
}

export async function exportA4SheetToPdf({
  element,
  fileName = `vouchers-${Date.now()}.pdf`,
  orientation = 'portrait',
  paperType = 'a4',
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
    const dim = getPaperDimensions(paperType, isLandscape, false);

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: dim.pdfFormat,
      compress: true,
    });

    hostContainer = document.createElement('div');
    hostContainer.id = 'zctrl-pdf-render-isolated-host';
    hostContainer.style.position = 'fixed';
    hostContainer.style.top = '0';
    hostContainer.style.left = '0';
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
        pdf.addPage(dim.pdfFormat, isLandscape ? 'landscape' : 'portrait');
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
    gapMm = 4,
    paddingMm = 4,
    onProgress,
    signal,
  } = params;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!vouchers || vouchers.length === 0) {
    throw new Error('لا توجد كروت للتصدير');
  }

  let tempContainer: HTMLElement | null = null;
  let injectedStyleEl: HTMLStyleElement | null = null;
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

    const isLandscape = design.paperOrientation === 'landscape';
    const isPos = layout.id.startsWith('pos') || (layout.cols === 1 && layout.rows === 1);

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
        gapMm,
        paddingMm,
        signal,
      },
      (msg) => {
        onProgress?.(25, msg);
      }
    );

    const dim = getPaperDimensions(design.paperType, isLandscape, isPos);

    const parser = new DOMParser();
    const doc = parser.parseFromString(fullHtml, 'text/html');

    const styles = doc.querySelectorAll('style');
    let allCssText = '';
    styles.forEach((s) => {
      allCssText += '\n' + (s.textContent || '');
    });

    injectedStyleEl = document.createElement('style');
    injectedStyleEl.id = 'zctrl-pdf-export-runtime-styles';
    injectedStyleEl.textContent = allCssText;
    document.head.appendChild(injectedStyleEl);

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    tempContainer = document.createElement('div');
    tempContainer.id = 'temp-pdf-export-host';
    tempContainer.style.position = 'fixed';
    tempContainer.style.top = '0';
    tempContainer.style.left = '0';
    tempContainer.style.width = isPos ? '80mm' : `${dim.pdfWidth}mm`;
    tempContainer.style.minHeight = isPos ? '200mm' : `${dim.pdfHeight}mm`;
    tempContainer.style.zIndex = '-99999';
    tempContainer.style.opacity = '1';
    tempContainer.style.visibility = 'visible';
    tempContainer.style.pointerEvents = 'none';
    tempContainer.style.overflow = 'visible';
    tempContainer.style.background = '#ffffff';
    document.body.appendChild(tempContainer);

    const pageElements = Array.from(doc.querySelectorAll<HTMLElement>('.a4-page, .pos-page'));
    const totalPages = Math.max(1, pageElements.length);

    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
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

      tempContainer.innerHTML = '';

      const pageClone = pageEl.cloneNode(true) as HTMLElement;
      pageClone.style.margin = '0';
      pageClone.style.boxShadow = 'none';

      // Note: allCssText is already injected once in document.head via injectedStyleEl,
      // avoiding O(N) stylesheet duplication and CSSOM bloat on multi-page batches.
      tempContainer.appendChild(pageClone);

      await waitForImagesToLoad(tempContainer);
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const canvas = await html2canvas(pageClone, {
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
        windowWidth: Math.max(window.innerWidth, 1600),
        ignoreElements: (node) =>
          node.classList?.contains('no-print') || node.classList?.contains('no-export'),
      });

      let imgData: string | null = canvas.toDataURL('image/jpeg', jpegQuality);

      if (p > 0) {
        pdf.addPage(dim.pdfFormat, isLandscape ? 'landscape' : 'portrait');
      }

      pdf.addImage(imgData, 'JPEG', 0, 0, dim.pdfWidth, dim.pdfHeight, undefined, 'FAST');

      imgData = null;
      destroyCanvas(canvas);
      tempContainer.innerHTML = '';
      // Give browser GC a clean breathing frame every 5 pages on large exports
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
    if (tempContainer && tempContainer.parentNode) {
      tempContainer.innerHTML = '';
      tempContainer.parentNode.removeChild(tempContainer);
    }
    if (injectedStyleEl && injectedStyleEl.parentNode) {
      injectedStyleEl.parentNode.removeChild(injectedStyleEl);
    }
  }
}
