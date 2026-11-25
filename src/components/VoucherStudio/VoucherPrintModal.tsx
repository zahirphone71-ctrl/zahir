import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { 
  Zap, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Loader2, 
  Printer, 
  FileCode, 
  Download, 
  RefreshCw, 
  Image as ImageIcon, 
  Table, 
  Scissors, 
  ZoomIn, 
  ZoomOut, 
  LayoutGrid,
  Sliders,
  Compass,
  QrCode,
  AlertCircle
} from "lucide-react";
import html2canvas from "html2canvas";
import { 
  PageDataResponse, 
  PrintLayoutOption, 
  VoucherProfile, 
  VoucherDesignState, 
  LAYOUT_OPTIONS, 
  VoucherItem 
} from "./types";
import { VoucherCardPreview } from "./VoucherCardPreview";
import { exportA4SheetToPdf, exportBatchVouchersToPdf } from "./pdfExporter";
import { autoCalcGrid } from "./gridCalculator";
import { generateStandaloneVoucherHtmlAsync } from "./voucherHtmlGenerator";
import { preGenerateQrCodes, clearQrCache } from "./qrPreGenerator";
import { printHtmlSafely } from "../../lib/printHelper";

interface VoucherPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  modalData: PageDataResponse | null;
  modalPage: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  layout: PrintLayoutOption;
  onLayoutChange?: (newLayout: PrintLayoutOption) => void;
  networkName: string;
  currencySymbol: string;
  showPin: boolean;
  showQr: boolean;
  loginUrl: string;
  selectedProfileObj?: VoucherProfile;
  design?: VoucherDesignState;
  allVouchers?: VoucherItem[];

  // Actions
  onPrint: () => void;
  onSaveHTML: () => void;
  onExportPDF: () => void;
  onExportCSV: () => void;
  onSync: () => void;
  onDeleteUnsynced?: () => void;
  syncing: boolean;
  syncProgress: { done: number; total: number };
}

export const VoucherPrintModal: React.FC<VoucherPrintModalProps> = ({
  isOpen,
  onClose,
  loading,
  modalData,
  modalPage,
  totalPages,
  onPageChange,
  layout,
  onLayoutChange,
  networkName,
  currencySymbol,
  showPin,
  showQr,
  loginUrl,
  selectedProfileObj,
  design,
  allVouchers,
  onPrint,
  onSaveHTML,
  onExportPDF,
  onExportCSV,
  onSync,
  syncing,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const a4SheetRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const pdfAbortRef = useRef<AbortController | null>(null);

  const trackTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pdfAbortRef.current?.abort();
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  const [zoomScale, setZoomScale] = useState<number>(0.85);
  const [showCutMarks, setShowCutMarks] = useState<boolean>(true);
  const [exportingImage, setExportingImage] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [exportingHtml, setExportingHtml] = useState<boolean>(false);
  const [pdfProgress, setPdfProgress] = useState<number>(0);
  const [pdfStatusMessage, setPdfStatusMessage] = useState<string>("");

  // Paper Orientation state (Portrait / Landscape)
  const [localOrientation, setLocalOrientation] = useState<'portrait' | 'landscape'>(
    design?.paperOrientation || 'portrait'
  );

  // Local QR Size state
  const [localQrSize, setLocalQrSize] = useState<number>(
    design?.qrSize ?? 36
  );
  const [showQrSlider, setShowQrSlider] = useState<boolean>(false);

  // Update local orientation if external design changes
  useEffect(() => {
    if (design?.paperOrientation) {
      setLocalOrientation(design.paperOrientation);
    }
  }, [design?.paperOrientation]);

  // Check if current vouchers are sample preview cards vs real batch
  const isSampleVouchers = useMemo(() => {
    const list = (allVouchers && allVouchers.length > 0) ? allVouchers : (modalData?.vouchers || []);
    if (list.length === 0) return true;
    return list.every(v => !v.batchId && (v.voucherId.startsWith('v-') || v.voucherId.startsWith('sample')));
  }, [allVouchers, modalData?.vouchers]);

  // Sync statistics
  const syncStats = useMemo(() => {
    const list = allVouchers || modalData?.vouchers || [];
    const total = list.length;
    const synced = list.filter(v => v.isSynced).length;
    const unsynced = isSampleVouchers ? 0 : Math.max(0, total - synced);
    return { total, synced, unsynced };
  }, [allVouchers, modalData?.vouchers, isSampleVouchers]);

  // Grid calculation using unified localOrientation
  const gridInfo = useMemo(() => {
    if (!design) return null;
    return autoCalcGrid({
      cardWidthMm: design.cardWidthMm || 85,
      cardHeightMm: design.cardHeightMm || 52,
      paperType: design.paperType || 'a4',
      paperOrientation: localOrientation,
      cardGap: design.cardGap ?? 4,
      cardMarginTop: design.cardMarginTop ?? 5,
      cardMarginSide: design.cardMarginSide ?? 4,
      totalCards: allVouchers?.length || modalData?.totalCount || 50,
      customCols: layout.cols,
      customRows: layout.rows,
    });
  }, [
    design,
    localOrientation,
    layout.cols,
    layout.rows,
    allVouchers?.length,
    modalData?.totalCount,
  ]);

  // Custom rows & cols state if user wants custom grid
  const [customCols, setCustomCols] = useState<number>(layout.cols);
  const [customRows, setCustomRows] = useState<number>(layout.rows);
  const [showCustomGridModal, setShowCustomGridModal] = useState<boolean>(false);

  useEffect(() => {
    setCustomCols(layout.cols);
    setCustomRows(layout.rows);
  }, [layout.cols, layout.rows]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      // Auto adjust zoom scale based on screen width
      if (window.innerWidth < 640) {
        setZoomScale(0.45);
      } else if (window.innerWidth < 1024) {
        setZoomScale(0.65);
      } else {
        setZoomScale(0.85);
      }
    } else {
      document.body.style.overflow = "";
      clearQrCache();
    }
    return () => {
      document.body.style.overflow = "";
      clearQrCache();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Export High-Res PNG of current A4 Sheet (isolated from zoomScale)
  const handleExportPNG = useCallback(async () => {
    if (!a4SheetRef.current) return;
    setExportingImage(true);
    let host: HTMLDivElement | null = null;
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      host = document.createElement("div");
      host.style.position = "fixed";
      host.style.top = "0";
      host.style.left = "0";
      host.style.zIndex = "-99999";
      host.style.opacity = "1";
      host.style.pointerEvents = "none";
      host.style.background = "#ffffff";
      document.body.appendChild(host);

      const clone = a4SheetRef.current.cloneNode(true) as HTMLElement;
      clone.style.transform = "none";
      clone.style.margin = "0";
      clone.style.boxShadow = "none";
      host.appendChild(clone);

      await new Promise<void>(r => trackTimer(r, 60));
      if (!isMountedRef.current) return;

      const canvas = await html2canvas(clone, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false
      });
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `vouchers-${(networkName || 'cards').replace(/\s+/g, "_")}-page-${modalPage}-${Date.now()}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    } catch (err) {
      console.error("PNG export error:", err);
    } finally {
      if (host && host.parentNode) {
        host.innerHTML = "";
        host.parentNode.removeChild(host);
      }
      if (isMountedRef.current) setExportingImage(false);
    }
  }, [networkName, modalPage, trackTimer]);

  // Direct PDF Download Handler (Batch or Current Page)
  const handleDirectPdfExport = useCallback(async () => {
    pdfAbortRef.current?.abort();
    const controller = new AbortController();
    pdfAbortRef.current = controller;
    setExportingPdf(true);
    setPdfProgress(5);
    setPdfStatusMessage("جاري تجهيز محرك PDF عالي الدقة...");
    await new Promise<void>(r => trackTimer(r, 60));
    if (!isMountedRef.current || controller.signal.aborted) return;
    try {
      if (allVouchers && allVouchers.length > 0 && design) {
        const designWithOrientation: VoucherDesignState = {
          ...design,
          paperOrientation: localOrientation,
          qrSize: localQrSize
        };
        await exportBatchVouchersToPdf({
          vouchers: allVouchers,
          design: designWithOrientation,
          layout,
          networkName,
          currencySymbol,
          loginUrl,
          showPin,
          showQr,
          fontScale: gridInfo?.fontScale ?? 1.0,
          gapMm: gridInfo?.gapMm ?? 4,
          paddingMm: gridInfo?.paddingMm ?? 4,
          fileName: `vouchers-${(networkName || "network").replace(/\s+/g, "_")}-${Date.now()}.pdf`,
          signal: controller.signal,
          onProgress: (p, msg) => {
            if (!isMountedRef.current) return;
            setPdfProgress(p);
            if (msg) setPdfStatusMessage(msg);
          }
        });
      } else if (a4SheetRef.current) {
        await exportA4SheetToPdf({
          element: a4SheetRef.current,
          fileName: `vouchers-${(networkName || "network").replace(/\s+/g, "_")}-page-${modalPage}.pdf`,
          orientation: localOrientation,
          paperType: design?.paperType || 'a4',
          signal: controller.signal,
          onProgress: (p, msg) => {
            if (!isMountedRef.current) return;
            setPdfProgress(p);
            if (msg) setPdfStatusMessage(msg);
          }
        });
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.error("Direct PDF export error:", err);
        // Fallback to parent onExportPDF handler
        onExportPDF();
      }
    } finally {
      if (isMountedRef.current) {
        setExportingPdf(false);
        setPdfProgress(0);
        setPdfStatusMessage("");
      }
    }
  }, [
    allVouchers,
    design,
    localOrientation,
    localQrSize,
    layout,
    networkName,
    currencySymbol,
    loginUrl,
    showPin,
    showQr,
    gridInfo,
    modalPage,
    onExportPDF,
    trackTimer
  ]);

  // Direct Save as HTML with 1:1 Live Preview Match
  const handleDirectSaveHtml = useCallback(async () => {
    setExportingHtml(true);
    try {
      const vouchersToExport = (allVouchers && allVouchers.length > 0)
        ? allVouchers
        : (modalData?.vouchers && modalData.vouchers.length > 0)
        ? modalData.vouchers
        : [];

      if (vouchersToExport.length === 0) {
        onSaveHTML();
        return;
      }

      const designWithOrientation: VoucherDesignState = {
        ...(design || ({} as any)),
        paperOrientation: localOrientation,
        qrSize: localQrSize,
        columnsCount: layout.cols,
        rowsCount: layout.rows
      };

      const qrMap = showQr
        ? await preGenerateQrCodes(
            vouchersToExport,
            designWithOrientation.loginUrl || loginUrl || "10.0.0.1",
            designWithOrientation.authMode || "user_only",
            Math.max(80, Math.round(150 * (gridInfo?.fontScale ?? 1.0)))
          )
        : new Map<string, string>();

      const htmlContent = await generateStandaloneVoucherHtmlAsync({
        vouchers: vouchersToExport,
        design: designWithOrientation,
        networkName: designWithOrientation.networkName || networkName,
        currencySymbol: designWithOrientation.currencySymbol || currencySymbol || "ريال",
        loginUrl: designWithOrientation.loginUrl || loginUrl,
        cols: layout.cols,
        rows: layout.rows,
        layout,
        theme: designWithOrientation.theme || "modern",
        showPin,
        showQr,
        isPos: layout.cols === 1 && layout.rows === 1,
        qrDataUrlMap: qrMap,
        fontScale: gridInfo?.fontScale ?? 1.0,
        gapMm: gridInfo?.gapMm ?? 4,
        paddingMm: gridInfo?.paddingMm ?? 4,
        showCutMarks,
        qrSize: localQrSize
      });

      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vouchers-${(networkName || "network").replace(/\s+/g, "_")}-${Date.now()}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      trackTimer(() => URL.revokeObjectURL(url), 5000);
    } catch (err: unknown) {
      console.error("Direct HTML export error:", err);
      onSaveHTML();
    } finally {
      if (isMountedRef.current) setExportingHtml(false);
    }
  }, [
    allVouchers,
    modalData?.vouchers,
    design,
    localOrientation,
    localQrSize,
    layout,
    networkName,
    currencySymbol,
    loginUrl,
    showPin,
    showQr,
    gridInfo,
    showCutMarks,
    onSaveHTML,
    trackTimer
  ]);

  // Direct Print handler with high resolution
  const handleDirectPrint = useCallback(async () => {
    try {
      const vouchersToExport = (allVouchers && allVouchers.length > 0)
        ? allVouchers
        : (modalData?.vouchers && modalData.vouchers.length > 0)
        ? modalData.vouchers
        : [];

      if (vouchersToExport.length === 0) {
        onPrint();
        return;
      }

      const designWithOrientation: VoucherDesignState = {
        ...(design || ({} as any)),
        paperOrientation: localOrientation,
        qrSize: localQrSize,
        columnsCount: layout.cols,
        rowsCount: layout.rows
      };

      const qrMap = showQr
        ? await preGenerateQrCodes(
            vouchersToExport,
            designWithOrientation.loginUrl || loginUrl || "10.0.0.1",
            designWithOrientation.authMode || "user_only",
            Math.max(80, Math.round(150 * (gridInfo?.fontScale ?? 1.0)))
          )
        : new Map<string, string>();

      const htmlContent = await generateStandaloneVoucherHtmlAsync({
        vouchers: vouchersToExport,
        design: designWithOrientation,
        networkName: designWithOrientation.networkName || networkName,
        currencySymbol: designWithOrientation.currencySymbol || currencySymbol || "ريال",
        loginUrl: designWithOrientation.loginUrl || loginUrl,
        cols: layout.cols,
        rows: layout.rows,
        layout,
        theme: designWithOrientation.theme || "modern",
        showPin,
        showQr,
        isPos: layout.cols === 1 && layout.rows === 1,
        qrDataUrlMap: qrMap,
        fontScale: gridInfo?.fontScale ?? 1.0,
        gapMm: gridInfo?.gapMm ?? 4,
        paddingMm: gridInfo?.paddingMm ?? 4,
        showCutMarks,
        qrSize: localQrSize
      });

      await printHtmlSafely(htmlContent, {
        fileName: `vouchers-sheet-${layout.id || 'print'}.html`,
        onFallbackDownload: () => {
          onPrint();
        }
      });
    } catch {
      onPrint();
    }
  }, [
    allVouchers,
    modalData?.vouchers,
    design,
    localOrientation,
    localQrSize,
    layout,
    networkName,
    currencySymbol,
    loginUrl,
    showPin,
    showQr,
    gridInfo,
    showCutMarks,
    onPrint
  ]);

  // Direct CSV Export with proper UTF-8 BOM
  const handleExportCSVDirect = useCallback(() => {
    const list = (allVouchers && allVouchers.length > 0)
      ? allVouchers
      : (modalData?.vouchers && modalData.vouchers.length > 0)
      ? modalData.vouchers
      : [];

    if (list.length === 0) {
      onExportCSV();
      return;
    }

    const csvRows = [
      "م,كود المستخدم,كلمة المرور,الباقة,السعر,صلاحية الوقت,حد البيانات,الحالة,تاريخ الإنشاء"
    ];

    list.forEach((v, idx) => {
      csvRows.push(
        [
          idx + 1,
          `"${(v.voucherCode || "").replace(/"/g, '""')}"`,
          `"${(v.voucherPin || "").replace(/"/g, '""')}"`,
          `"${(v.profileName || "").replace(/"/g, '""')}"`,
          v.price || 0,
          `"${(v.timeLimit || "").replace(/"/g, '""')}"`,
          `"${(v.dataLimit || "").replace(/"/g, '""')}"`,
          `"${(v.statusCd || "active").replace(/"/g, '""')}"`,
          `"${(v.createdAt || "").replace(/"/g, '""')}"`
        ].join(",")
      );
    });

    const blob = new Blob(["\uFEFF" + csvRows.join("\r\n")], {
      type: "text/csv;charset=utf-8;"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vouchers-${(networkName || "network").replace(/\s+/g, "_")}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    trackTimer(() => URL.revokeObjectURL(url), 5000);
  }, [allVouchers, modalData?.vouchers, networkName, onExportCSV, trackTimer]);

  if (!isOpen) return null;

  const safeTotalPages = Math.max(1, totalPages || 1);
  const isPos = layout.cols === 1 && layout.rows === 1;
  const isUltraDense = layout.cols >= 15 || layout.rows >= 15;
  const isHighDense = layout.cols >= 8 || layout.rows >= 8;

  const totalSlots = isPos ? (modalData?.vouchers.length || 1) : layout.cols * layout.rows;
  const vouchersOnPage = modalData?.vouchers || [];
  
  // Fill missing slots for visual stability on screen
  const filledVouchers: VoucherItem[] = [...vouchersOnPage];
  if (!isPos) {
    while (filledVouchers.length < totalSlots) {
      filledVouchers.push({
        voucherId: `empty-${filledVouchers.length}`,
        voucherCode: "",
        voucherPin: "",
        statusCd: "",
        price: 0,
        profileName: "",
        timeLimit: "",
        createdAt: "",
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-1 sm:p-3 animate-in fade-in duration-150 print:p-0 print:bg-white"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className="bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-100 border border-slate-800 w-full max-w-6xl h-[94vh] print:h-auto print:border-none print:shadow-none print:p-0 print:bg-white"
      >
        {/* TOP HEADER: Information & Page Navigator */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 text-white shrink-0 border-b border-slate-800 print:hidden">
          <div className="flex items-center gap-3 text-sm">
            <div className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
              <Zap className="w-5 h-5 shrink-0" />
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base flex items-center gap-2 flex-wrap">
                <span>استوديو الكروت - محاكي ورقة A4 والطباعة المباشرة</span>
                {isSampleVouchers ? (
                  <span className="text-[11px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-600/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    كروت معاينة تجريبية (غير محقونة بالراوتر)
                  </span>
                ) : syncStats.unsynced === 0 ? (
                  <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-950/70 border border-emerald-600/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                    دفعة محقونة ومتزامنة بالمايكروتك ({syncStats.synced} كرت)
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-600/40 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono tabular-nums">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    دفعة مولدة جاهزة للحقن ({syncStats.unsynced} كرت)
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                شبكة: <span className="text-slate-200 font-bold">{networkName}</span> | 
                تنسيق: <span className="text-indigo-400 font-bold">{layout.cols} عمود × {layout.rows} صف ({layout.cols * layout.rows} كرت/صفحة)</span> | 
                إجمالي: <span className="text-amber-400 font-bold">{modalData?.totalCount || vouchersOnPage.length} كرت</span> | 
                الورقة: <span className="text-cyan-400 font-bold">{localOrientation === 'portrait' ? 'A4 طولي' : 'A4 عرضي'}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Page Navigation */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => onPageChange(modalPage - 1)}
                disabled={modalPage <= 1}
                className="p-1.5 hover:bg-slate-800 text-slate-300 rounded-lg disabled:opacity-30 transition-all cursor-pointer"
                title="الصفحة السابقة"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              
              <span className="text-xs font-mono font-bold px-2 text-indigo-300">
                صفحة {modalPage} من {safeTotalPages}
              </span>

              <button
                type="button"
                onClick={() => onPageChange(modalPage + 1)}
                disabled={modalPage >= safeTotalPages}
                className="p-1.5 hover:bg-slate-800 text-slate-300 rounded-lg disabled:opacity-30 transition-all cursor-pointer"
                title="الصفحة التالية"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 rounded-xl border border-transparent hover:border-rose-500/30 transition-all cursor-pointer"
              title="إغلاق النافذة"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SAMPLE PREVIEW WARNING BANNER & UNSYNCED ALERT */}
        {isSampleVouchers ? (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>تنبيه حماية:</strong> الكروت المعروضة حالياً هي <u>عينات تجريبية للمعاينة فقط</u> (ليست كروتاً حقيقية في المخزون وليست محقونة بالراوتر)!
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg transition-all text-xs cursor-pointer shadow-sm"
            >
              ⚡ إغلاق وتوليد دفعة كروت حقيقية
            </button>
          </div>
        ) : syncStats.unsynced > 0 ? (
          <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-indigo-950/80 border-b border-indigo-500/40 px-4 py-2.5 text-xs text-indigo-100 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden shadow-inner">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              </span>
              <div>
                <p className="font-bold text-white flex items-center gap-2">
                  <span>تم تجهيز الدفعة المولدة بنجاح ({syncStats.unsynced} كرت)!</span>
                  <span className="text-[10px] font-normal text-amber-300 bg-amber-950/60 border border-amber-700/60 px-2 py-0.5 rounded-md">
                    جاهزة للمعاينة والطباعة أو الحقن
                  </span>
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  تم حفظ الكروت محلياً؛ يمكنك مراجعتها وطباعتها الآن، أو الضغط على زر الحقن لإرسالها وتفعيلها في راوتر المايكروتك مباشرة.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={syncing}
              onClick={onSync}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl transition-all text-xs cursor-pointer shadow-lg shadow-emerald-700/25 flex items-center gap-2 disabled:opacity-50 active:scale-95 border border-emerald-400/40"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? 'جاري حقن الكروت بالمايكروتك...' : '⚡ حقن ومزامنة الكروت بالمايكروتك الآن'}</span>
            </button>
          </div>
        ) : !isSampleVouchers && syncStats.synced > 0 ? (
          <div className="bg-emerald-950/40 border-b border-emerald-500/30 px-4 py-2 text-xs text-emerald-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400"></span>
              <span>
                <strong>الكروت نشطة بالمايكروتك:</strong> تم حقن جميع كروت هذه الدفعة (<strong>{syncStats.synced}</strong> كرت) بنجاح في راوتر المايكروتك وهي جاهزة ومفعلة.
              </span>
            </div>
            <span className="text-[11px] font-mono text-emerald-400 font-bold bg-emerald-900/60 px-2.5 py-0.5 rounded-lg border border-emerald-700/50">
              ✓ محقونة ومفعلة 100%
            </span>
          </div>
        ) : null}

        {/* PRIMARY ACTION BAR: ALL EXPORT & PRINT BUTTONS */}
        <div className="bg-slate-900/95 border-b border-slate-800 p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0 print:hidden">
          {/* Main Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. PRINT BUTTON */}
            <button
              type="button"
              onClick={handleDirectPrint}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg cursor-pointer border ${
                isSampleVouchers
                  ? "bg-amber-600/90 hover:bg-amber-500 text-white border-amber-400/40 shadow-amber-600/20"
                  : "bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white border-blue-400/40 shadow-blue-600/25"
              }`}
              title={isSampleVouchers ? "طباعة تجريبية لاختبار مقاسات الورقة فقط" : "طباعة الصفحة المحددة فوراً"}
            >
              <Printer className="w-4 h-4 text-amber-300" />
              <span>{isSampleVouchers ? "طباعة تجريبية للمقاسات فقط (عينة)" : "طباعة الكروت (🖨️)"}</span>
            </button>

            {/* 2. SAVE AS PDF BUTTON */}
            <button
              type="button"
              onClick={handleDirectPdfExport}
              disabled={exportingPdf}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer border border-rose-400/30 disabled:opacity-50"
              title="تصدير وحفظ ملف PDF عالي الدقة"
            >
              <Download className="w-4 h-4 text-amber-200" />
              <span>{exportingPdf ? `جاري تجهيز PDF (${pdfProgress}%)...` : "حفظ بصيغة PDF"}</span>
            </button>

            {/* 3. SAVE AS STANDALONE HTML BUTTON */}
            <button
              type="button"
              onClick={handleDirectSaveHtml}
              disabled={exportingHtml}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-cyan-500/30 cursor-pointer disabled:opacity-50"
              title="تصدير صفحة HTML متكاملة بنفس التصميم والمعاينة الحية"
            >
              {exportingHtml ? (
                <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              ) : (
                <FileCode className="w-4 h-4 text-cyan-400" />
              )}
              <span>{exportingHtml ? "جاري الحفظ..." : "حفظ HTML"}</span>
            </button>

            {/* 4. EXPORT CSV / EXCEL */}
            <button
              type="button"
              onClick={handleExportCSVDirect}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-emerald-500/30 cursor-pointer"
              title="تصدير بيانات الكروت بجدول Excel / CSV متوافق مع اللغة العربية"
            >
              <Table className="w-4 h-4 text-emerald-400" />
              <span>جدول CSV</span>
            </button>

            {/* 5. EXPORT PNG IMAGE */}
            <button
              type="button"
              onClick={handleExportPNG}
              disabled={exportingImage}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-amber-500/30 cursor-pointer disabled:opacity-50"
              title="تصدير ورقة A4 كصورة PNG عالية الدقة"
            >
              <ImageIcon className="w-4 h-4 text-amber-400" />
              <span>{exportingImage ? "جاري التصدير..." : "صورة PNG"}</span>
            </button>
          </div>

          {/* Controls: Layout Switcher, Orientation, QR Size, Custom Grid, Zoom, Cut Lines & Sync */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Paper Orientation Toggle Button */}
            <button
              type="button"
              onClick={() => setLocalOrientation(prev => (prev === 'portrait' ? 'landscape' : 'portrait'))}
              className="px-2.5 py-1.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="تبديل اتجاه الورقة بين طولي وعرضي"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              <span>{localOrientation === 'portrait' ? 'A4 طولي 📄' : 'A4 عرضي 📑'}</span>
            </button>

            {/* QR Size Slider Toggle */}
            <button
              type="button"
              onClick={() => setShowQrSlider(!showQrSlider)}
              className={`p-1.5 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                showQrSlider 
                  ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow"
                  : "bg-slate-950 border-slate-800 text-slate-300 hover:text-white"
              }`}
              title="التحكم بحجم باركود QR"
            >
              <QrCode className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono">{localQrSize}px</span>
            </button>

            {/* Layout Quick Selector */}
            {onLayoutChange && (
              <select
                value={layout.id}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom_prompt") {
                    setShowCustomGridModal(true);
                    return;
                  }
                  const found = LAYOUT_OPTIONS.find(l => l.id === val);
                  if (found) onLayoutChange(found);
                }}
                className="bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200 px-2.5 py-1.5 rounded-xl outline-none focus:border-indigo-500 cursor-pointer"
              >
                {LAYOUT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
                <option value="custom_prompt">⚙️ تخصيص الصفوف والأعمدة...</option>
              </select>
            )}

            {/* Custom Grid Adjuster Button */}
            {onLayoutChange && (
              <button
                type="button"
                onClick={() => setShowCustomGridModal(!showCustomGridModal)}
                className={`p-1.5 px-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                  showCustomGridModal 
                    ? "bg-amber-500/20 border-amber-500 text-amber-300 shadow"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:text-white"
                }`}
                title="تعديل يدوي لعدد الصفوف وعدد الأعمدة بالورقة"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">شبكة ({layout.cols}×{layout.rows})</span>
              </button>
            )}

            {/* Cut Lines Toggle */}
            <button
              type="button"
              onClick={() => setShowCutMarks(!showCutMarks)}
              className={`p-1.5 px-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                showCutMarks 
                  ? "bg-indigo-950/60 border-indigo-500/50 text-indigo-300" 
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
              title="إظهار / إخفاء خطوط وفواصل القص"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">فواصل القص</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setZoomScale(prev => Math.max(0.35, prev - 0.1))}
                className="p-1 hover:bg-slate-800 text-slate-300 rounded-lg transition-all cursor-pointer"
                title="تصغير المعاينة"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 px-1 font-bold">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale(prev => Math.min(1.6, prev + 0.1))}
                className="p-1 hover:bg-slate-800 text-slate-300 rounded-lg transition-all cursor-pointer"
                title="تكبير المعاينة"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* SYNC WITH MIKROTIK / REAL BATCH BUTTON */}
            {isSampleVouchers ? (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
                title="هذه عينات للمعاينة فقط - اضغط هنا لتوليد دفعة كروت حقيقية وحفظها بالمخزون"
              >
                <Zap className="w-3.5 h-3.5 text-slate-950" />
                <span>⚡ توليد دفعة كروت حقيقية</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSync}
                disabled={syncing || syncStats.unsynced === 0}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 ${
                  syncStats.unsynced > 0
                    ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white ring-2 ring-emerald-400/30 border border-emerald-400/40"
                    : "bg-slate-800 text-emerald-400 border border-emerald-500/30"
                }`}
                title={syncStats.unsynced > 0 ? "حقن الكروت المولدة الآن في راوتر المايكروتك" : "تم حقن كافة كروت هذه الدفعة في المايكروتك"}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                <span>
                  {syncing 
                    ? "جاري الحقن..." 
                    : syncStats.unsynced > 0 
                    ? `⚡ حقن بالمايكروتك (${syncStats.unsynced})` 
                    : "✓ محقونة بالمايكروتك"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* QR Code Size Interactive Slider Drawer */}
        {showQrSlider && (
          <div className="bg-slate-900 border-b border-amber-500/40 p-2 px-6 flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <QrCode className="w-4 h-4 text-amber-400" />
              <span>تعديل حجم رمز QR بالكروت المطبوعة:</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">صغير (16px)</span>
              <input
                type="range"
                min="16"
                max="80"
                step="2"
                value={localQrSize}
                onChange={(e) => setLocalQrSize(Number(e.target.value))}
                className="w-40 sm:w-64 accent-amber-500 cursor-pointer"
              />
              <span className="text-xs text-slate-400">كبير (80px)</span>
              <span className="text-xs font-mono font-black text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-700">
                {localQrSize}px
              </span>
              <button
                type="button"
                onClick={() => setLocalQrSize(36)}
                className="text-[11px] text-slate-400 hover:text-amber-300 underline cursor-pointer mr-2"
              >
                إعادة ضبط (36px)
              </button>
            </div>
          </div>
        )}

        {/* Custom Rows & Columns Floating Control Bar */}
        {showCustomGridModal && onLayoutChange && (
          <div className="bg-slate-900 border-b border-amber-500/40 p-3 px-6 flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>تخصيص شبكة الطباعة (الصفوف والأعمدة):</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <span>الأعمدة:</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={customCols}
                  onChange={e => setCustomCols(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))}
                  className="w-16 bg-slate-950 border border-slate-700 p-1.5 rounded-lg text-center font-mono font-bold text-amber-300 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <span>الصفوف:</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={customRows}
                  onChange={e => setCustomRows(Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1)))}
                  className="w-16 bg-slate-950 border border-slate-700 p-1.5 rounded-lg text-center font-mono font-bold text-amber-300 text-xs"
                />
              </div>

              <span className="text-xs font-mono font-bold text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                = {customCols * customRows} كرت/ورقة
              </span>

              <button
                type="button"
                onClick={() => {
                  onLayoutChange({
                    id: `custom_${customCols}x${customRows}`,
                    label: `مخصص (${customCols} أعمدة × ${customRows} صفوف)`,
                    cols: customCols,
                    rows: customRows,
                    isPos: false
                  });
                  setShowCustomGridModal(false);
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg cursor-pointer transition-all shadow"
              >
                تطبيق الشبكة المخصصة
              </button>

              <button
                type="button"
                onClick={() => setShowCustomGridModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PDF Export In-Flight Progress Notification Banner */}
        {exportingPdf && (
          <div className="bg-rose-950/80 border-b border-rose-500/40 p-3 px-6 flex flex-col gap-2 animate-in slide-in-from-top duration-200">
            <div className="flex items-center justify-between text-xs font-bold text-rose-200">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-rose-400 animate-spin" />
                <span>{pdfStatusMessage || "جاري تجهيز وتصيير ملف PDF عالي الدقة..."}</span>
              </div>
              <span className="font-mono text-rose-300 font-black">{pdfProgress}%</span>
            </div>
            <div className="w-full bg-slate-900/80 h-2 rounded-full overflow-hidden border border-rose-800/40">
              <div 
                className="bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 h-full transition-all duration-200 rounded-full"
                style={{ width: `${Math.max(5, pdfProgress)}%` }}
              />
            </div>
          </div>
        )}

        {/* A4 PRINT SHEET PREVIEW */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 bg-slate-950 print:hidden flex flex-col justify-start items-center custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center my-auto space-y-3 p-8">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs font-bold text-slate-400">جاري معالجة صفحة الكروت وتجهيز ورقة A4...</p>
            </div>
          ) : filledVouchers.length > 0 ? (
            <div 
              className="flex justify-center items-start transition-transform duration-200 origin-top my-2"
              style={{ transform: `scale(${zoomScale})` }}
            >
              {/* THE REALISTIC A4 SHEET (210mm x 297mm or 297mm x 210mm) */}
              <div
                ref={a4SheetRef}
                id="a4-sheet-container"
                className="bg-white text-slate-900 shadow-2xl rounded-xs relative flex flex-col justify-between overflow-hidden"
                style={{
                  width: isPos ? "80mm" : (localOrientation === "landscape" ? (design?.paperType === 'a3' ? '420mm' : design?.paperType === 'a5' ? '210mm' : design?.paperType === 'letter' ? '279.4mm' : '297mm') : (design?.paperType === 'a3' ? '297mm' : design?.paperType === 'a5' ? '148mm' : design?.paperType === 'letter' ? '215.9mm' : '210mm')),
                  height: isPos ? "auto" : (localOrientation === "landscape" ? (design?.paperType === 'a3' ? '297mm' : design?.paperType === 'a5' ? '148mm' : design?.paperType === 'letter' ? '215.9mm' : '210mm') : (design?.paperType === 'a3' ? '420mm' : design?.paperType === 'a5' ? '210mm' : design?.paperType === 'letter' ? '279.4mm' : '297mm')),
                  minHeight: isPos ? "140mm" : (localOrientation === "landscape" ? (design?.paperType === 'a3' ? '297mm' : design?.paperType === 'a5' ? '148mm' : design?.paperType === 'letter' ? '215.9mm' : '210mm') : (design?.paperType === 'a3' ? '420mm' : design?.paperType === 'a5' ? '210mm' : design?.paperType === 'letter' ? '279.4mm' : '297mm')),
                  padding: gridInfo ? `${design?.cardMarginTop ?? gridInfo.paddingMm}mm ${gridInfo.paddingMm}mm ${design?.cardMarginBottom ?? gridInfo.paddingMm}mm ${gridInfo.paddingMm}mm` : isPos ? "3mm" : "4mm",
                  boxSizing: "border-box",
                  boxShadow: "0 15px 45px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)"
                }}
              >
                {/* Visual Paper Sheet Header Meta (Screen Only) */}
                {!isPos && (
                  <div className="flex justify-between items-center text-[7pt] text-slate-400 border-b border-slate-200 pb-1 mb-1 font-mono select-none">
                    <span>
                      {design?.showNetworkName !== false ? `شبكة: ${design?.networkName || networkName}` : "اسم الشبكة: [مخفي من الطباعة]"}
                    </span>
                    <span>صفحة {modalPage} من {safeTotalPages} (شبكة {layout.cols} × {layout.rows} = {layout.cols * layout.rows} كرت/صفحة)</span>
                    <span>{new Date().toLocaleDateString('ar-YE')}</span>
                  </div>
                )}

                {/* THE RIGID FIXED GRID: Zero overlap, Zero shifting */}
                <div
                  className="w-full h-full flex-1"
                  style={{
                    display: "grid",
                    gridTemplateColumns: isPos ? "1fr" : `repeat(${layout.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: isPos ? "auto" : `repeat(${layout.rows}, minmax(0, 1fr))`,
                    gap: gridInfo ? `${gridInfo.gapMm}mm` : isUltraDense ? "1px" : "1.5px",
                    boxSizing: "border-box",
                    overflow: "hidden"
                  }}
                >
                  {filledVouchers.map((v, i) => {
                    if (!v.voucherCode && !isPos) {
                      return (
                        <div
                          key={`empty-${i}`}
                          className="box-border rounded-xs"
                          style={{
                            border: showCutMarks ? "0.5px dashed #e2e8f0" : "none",
                            background: "transparent"
                          }}
                        />
                      );
                    }

                    const isUnsynced = v.isSynced === false;

                    return (
                      <div
                        key={v.voucherId || `v-${i}`}
                        className="box-border overflow-hidden rounded-xs relative group"
                        style={{
                          border: isUnsynced 
                            ? "1px dashed #f43f5e" 
                            : (showCutMarks ? "0.5px dashed #94a3b8" : "none"),
                          boxSizing: "border-box"
                        }}
                      >
                        <VoucherCardPreview
                          code={v.voucherCode}
                          pin={showPin ? v.voucherPin : undefined}
                          price={v.price}
                          networkName={networkName}
                          currency={currencySymbol}
                          timeLimit={v.timeLimit || selectedProfileObj?.validity || "30 يوم"}
                          dataLimit={v.dataLimit}
                          profileName={v.profileName || selectedProfileObj?.profileName}
                          isDense={isHighDense || isUltraDense}
                          showQr={showQr}
                          loginUrl={loginUrl}
                          theme={design?.theme}
                          cardBgColor={design?.bgColor}
                          fontFamily={design?.fontFamily}
                          fontSize={isUltraDense ? "sm" : "md"}
                          design={design}
                          fontScale={gridInfo?.fontScale ?? 1.0}
                          qrSize={localQrSize}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* ذيل الصفحة — لا يُطبَع */}
                {!isPos && (
                  <div className="flex justify-between items-center text-[6pt] text-slate-300 border-t border-slate-100 pt-0.5 mt-1 font-mono select-none no-print">
                    <span>{networkName}</span>
                    <span>{localOrientation === 'portrait' ? 'A4 طولي' : 'A4 عرضي'}</span>
                    <span>fontScale: {(gridInfo?.fontScale ?? 1.0).toFixed(3)}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center my-auto text-slate-400 text-sm font-medium">
              لا توجد كروت في هذه الصفحة
            </div>
          )}
        </div>

        {/* ============ شريط معلومات سريع أسفل النافذة ============ */}
        <div className="bg-slate-950 border-t border-slate-800 px-4 py-2 flex items-center justify-between text-[10px] text-slate-500 font-mono shrink-0 print:hidden">
          <div className="flex items-center gap-4">
            <span>
              الوضع:{' '}
              <span className={localOrientation === 'landscape' ? 'text-indigo-400' : 'text-slate-300'}>
                {localOrientation === 'portrait' ? 'طولي' : 'عرضي'}
              </span>
            </span>
            <span>
              QR: <span className="text-amber-400">{localQrSize}px</span>
            </span>
            <span>
              fontScale: <span className="text-cyan-400">{(gridInfo?.fontScale ?? 1.0).toFixed(3)}</span>
            </span>
            <span>
              بطاقة فعلي: <span className="text-slate-300">{gridInfo?.actualCardWidthMm?.toFixed(1)}×{gridInfo?.actualCardHeightMm?.toFixed(1)}mm</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            {syncStats.total > 0 && (
              <span>
                مزامنة: <span className="text-emerald-400">{syncStats.synced}</span>/{' '}
                <span className="text-rose-400">{syncStats.unsynced}</span>
              </span>
            )}
            <span>
              صفحة {modalPage}/{safeTotalPages}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
