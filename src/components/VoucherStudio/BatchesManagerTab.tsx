import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Layers, RefreshCw, Printer, Trash2, CheckCircle2, AlertCircle, 
  Search, Eye, Server, Clock, Hash, ShieldCheck, Calendar, ArrowDownToLine, ChevronDown, ChevronUp, X, Filter
} from 'lucide-react';
import { VoucherItem, VoucherDesignState } from './types';
import { generateStandaloneVoucherHtmlAsync } from './voucherHtmlGenerator';
import { preGenerateQrCodes } from './qrPreGenerator';
import { safeStorage } from '../../utils/safeStorage';
import { printHtmlSafely } from '../../lib/printHelper';
import { secureFetch, safeParseJson } from '../../lib/api';
import { ConfirmModal } from '../ConfirmModal';

interface BatchSummary {
  batchId: string;
  count?: number;
  totalGenerated?: number;
  activeCount?: number;
  usedCount?: number;
  syncedCount?: number;
  totalSynced?: number;
  profileName: string;
  serviceType: string;
  authMode: string;
  price: number;
  comment?: string;
  createdAt: string;
}

interface BatchesManagerTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  networkName: string;
  currencySymbol: string;
  loginUrl: string;
  design?: VoucherDesignState;
  onPrintBatch?: (vouchers: VoucherItem[], batchId: string) => void;
}

export const BatchesManagerTab: React.FC<BatchesManagerTabProps> = ({
  showToast,
  networkName,
  currencySymbol,
  loginUrl,
  design,
  onPrintBatch
}) => {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncingBatchId, setSyncingBatchId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatchDetails, setSelectedBatchDetails] = useState<{ batchId: string; vouchers: VoucherItem[] } | null>(null);
  const [resumableBatches, setResumableBatches] = useState<any[]>([]);
  const [isResumingBatchId, setIsResumingBatchId] = useState<string | null>(null);

  // Router Audit & Reconciliation State
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditServiceType, setAuditServiceType] = useState<'HOTSPOT' | 'PPPOE' | 'USERMAN'>('HOTSPOT');
  const [auditData, setAuditData] = useState<{
    summary: { totalRouterUsers: number; matchedWithInventory: number; unmappedCount: number; serviceType: string };
    dateGroups: Array<{ date: string; count: number; cards: any[] }>;
    unmappedCards: any[];
  } | null>(null);
  const [importingDate, setImportingDate] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [loadingBatchCardsId, setLoadingBatchCardsId] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const batchesAbortRef = useRef<AbortController | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      batchesAbortRef.current?.abort();
      auditAbortRef.current?.abort();
    };
  }, []);

  const fetchBatches = useCallback(async () => {
    batchesAbortRef.current?.abort();
    const controller = new AbortController();
    batchesAbortRef.current = controller;
    setLoading(true);
    try {
      const res = await secureFetch('/api/vouchers/batches', {
        signal: controller.signal
      });
      const data = (await safeParseJson(res)) || {};
      if (isMountedRef.current && res.ok && data.success && Array.isArray(data.data)) {
        setBatches(data.data);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to fetch batches:', err);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  const fetchResumableBatches = useCallback(async () => {
    try {
      const res = await secureFetch('/api/vouchers/batches/resumable');
      const data = (await safeParseJson(res)) || {};
      if (isMountedRef.current && res.ok && data.success && Array.isArray(data.data)) {
        setResumableBatches(data.data);
      }
    } catch {}
  }, []);

  const handleOpenAudit = async (sType: 'HOTSPOT' | 'PPPOE' | 'USERMAN' = auditServiceType) => {
    auditAbortRef.current?.abort();
    const controller = new AbortController();
    auditAbortRef.current = controller;
    setIsAuditModalOpen(true);
    setAuditLoading(true);
    try {
      const res = await secureFetch(`/api/vouchers/reconcile-router?serviceType=${encodeURIComponent(sType)}`, {
        signal: controller.signal
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        setAuditData(data);
        const initExpanded: Record<string, boolean> = {};
        if (data.dateGroups && data.dateGroups.length > 0) {
          initExpanded[data.dateGroups[0].date] = true;
          if (data.dateGroups[1]) initExpanded[data.dateGroups[1].date] = true;
        }
        setExpandedDates(initExpanded);
      } else {
        showToast(data.error || 'فشل فحص كروت الراوتر', 'error');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && isMountedRef.current) {
        showToast('خطأ أثناء فحص الراوتر: ' + err.message, 'error');
      }
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setAuditLoading(false);
      }
    }
  };

  const handleImportGroup = async (group: { date: string; count: number; cards: any[] }) => {
    setImportingDate(group.date);
    try {
      const res = await secureFetch('/api/vouchers/import-reconciled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cards: group.cards,
          targetDate: group.date,
          batchComment: `كروت مستوردة من المايكروتك [حقن بتاريخ: ${group.date}]`
        })
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message, 'success');
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        fetchBatches();
        handleOpenAudit(auditServiceType);
      } else {
        showToast(data.error || 'فشل الاستيراد', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast('خطأ أثناء الاستيراد: ' + err.message, 'error');
      }
    } finally {
      if (isMountedRef.current) setImportingDate(null);
    }
  };

  const toggleDateExpanded = (date: string) => {
    setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }));
  };

  const handleResumeBatch = async (batchId: string) => {
    setIsResumingBatchId(batchId);
    try {
      const token = safeStorage.getItem('zcontrol_active_token');
      const res = await fetch(`/api/vouchers/batches/${encodeURIComponent(batchId)}/resume`, {
        method: 'POST',
        headers: { ...(token ? { 'X-Router-Token': token } : {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message || 'تم استئناف وحقن الكروت المتبقية بنجاح على المايكروتك', 'success');
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        fetchBatches();
        fetchResumableBatches();
      } else {
        showToast(data.error || 'تعذر استئناف حقن الكروت بالراوتر', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast('خطأ أثناء استئناف عملية الحقن: ' + err.message, 'error');
      }
    } finally {
      if (isMountedRef.current) setIsResumingBatchId(null);
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchResumableBatches();
    const handleVoucherChange = () => {
      fetchBatches();
      fetchResumableBatches();
    };
    window.addEventListener('zctrl:vouchers-changed', handleVoucherChange);
    return () => {
      window.removeEventListener('zctrl:vouchers-changed', handleVoucherChange);
    };
  }, [fetchBatches, fetchResumableBatches]);

  const handleSyncBatch = async (batch: BatchSummary) => {
    setSyncingBatchId(batch.batchId);
    try {
      const res = await secureFetch('/api/vouchers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.batchId,
          profileOnRouter: batch.profileName,
          serviceType: batch.serviceType
        })
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success && data.data) {
        showToast(`تمت مزامنة ${data.data.synced} كرت بنجاح مع راوتر المايكروتك`, 'success');
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        fetchBatches();
        fetchResumableBatches();
        if (selectedBatchDetails?.batchId === batch.batchId) {
          handleViewBatchCards(batch.batchId);
        }
      } else {
        showToast(data.error || 'فشلت المزامنة', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) showToast('خطأ أثناء المزامنة: ' + err.message, 'error');
    } finally {
      if (isMountedRef.current) setSyncingBatchId(null);
    }
  };

  const [batchToDelete, setBatchToDelete] = useState<string | null>(null);

  const handleDeleteBatch = (batchId: string) => {
    setBatchToDelete(batchId);
  };

  const handleExecuteDeleteBatch = async () => {
    if (!batchToDelete) return;
    const batchId = batchToDelete;
    const batch = batches.find(b => b.batchId === batchId);
    const synced = batch ? (batch.syncedCount ?? batch.totalSynced ?? 0) : 0;
    const isUnsynced = synced === 0;

    setDeletingBatchId(batchId);
    try {
      const token = safeStorage.getItem('zcontrol_active_token');
      const fromRouterParam = isUnsynced ? 'false' : 'true';
      const res = await fetch(`/api/vouchers/batch/${encodeURIComponent(batchId)}?fromRouter=${fromRouterParam}`, {
        method: 'DELETE',
        headers: { ...(token ? { 'X-Router-Token': token } : {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.warning || data.message || 'تم حذف الدفعة بنجاح', data.warning ? 'info' : 'success');
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        if (selectedBatchDetails?.batchId === batchId) {
          setSelectedBatchDetails(null);
        }
        setBatchToDelete(null);
        fetchBatches();
        fetchResumableBatches();
      } else {
        showToast(data.error || `فشل حذف الدفعة (${res.status})`, 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast('خطأ أثناء الحذف: ' + err.message, 'error');
      }
    } finally {
      if (isMountedRef.current) setDeletingBatchId(null);
    }
  };

  const handleViewBatchCards = async (batchId: string) => {
    setLoadingBatchCardsId(batchId);
    try {
      const token = safeStorage.getItem('zcontrol_active_token');
      const res = await fetch(`/api/vouchers/batch/${encodeURIComponent(batchId)}`, {
        headers: { ...(token ? { 'X-Router-Token': token } : {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success && Array.isArray(data.vouchers)) {
        setSelectedBatchDetails({ batchId, vouchers: data.vouchers });
      } else {
        showToast(data.error || 'تعذر جلب كروت الدفعة', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast('خطأ: ' + err.message, 'error');
      }
    } finally {
      if (isMountedRef.current) setLoadingBatchCardsId(null);
    }
  };

  const handleExportBatchHtml = async (batchId: string) => {
    try {
      showToast('جاري جلب كروت الدفعة للطباعة...', 'info');
      const token = safeStorage.getItem('zcontrol_active_token');
      const res = await fetch(`/api/vouchers/batch/${encodeURIComponent(batchId)}`, {
        headers: { ...(token ? { 'X-Router-Token': token } : {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success && Array.isArray(data.vouchers) && data.vouchers.length > 0) {
        if (onPrintBatch) {
          onPrintBatch(data.vouchers, batchId);
          return;
        }

        const baseDesign: VoucherDesignState = design ? { ...design } : ({
          theme: "modern",
          paperOrientation: "portrait",
          columnsCount: 3,
          rowsCount: 7,
          networkName,
          currencySymbol,
          loginUrl,
          showQr: true,
          showCutLines: true,
          coords: {
            network: { x: 18, y: 12 },
            profile: { x: 50, y: 12 },
            price: { x: 88, y: 12 },
            user: { x: 32, y: 44 },
            password: { x: 32, y: 68 },
            qr: { x: 84, y: 54 },
            time: { x: 20, y: 88 },
            dataLimit: { x: 68, y: 88 }
          },
          elements: {
            network:   { show: true, color: "#ffffff", fontSize: 13, fontFamily: "Tajawal", fontWeight: "bold", rotation: 0, hasShadow: false },
            user:      { show: true, color: "#facc15", fontSize: 15, fontFamily: "JetBrains Mono", fontWeight: "extrabold", rotation: 0, hasShadow: false },
            password:  { show: true, color: "#ffffff", fontSize: 13, fontFamily: "JetBrains Mono", fontWeight: "bold", rotation: 0, hasShadow: false },
            price:     { show: true, color: "#f87171", fontSize: 12, fontFamily: "Tajawal", fontWeight: "bold", rotation: 0, hasShadow: false },
            time:      { show: true, color: "#94a3b8", fontSize: 10, fontFamily: "Tajawal", fontWeight: "normal", rotation: 0, hasShadow: false },
            profile:   { show: true, color: "#a5b4fc", fontSize: 11, fontFamily: "Tajawal", fontWeight: "bold", rotation: 0, hasShadow: false },
          }
        } as any);

        const batch = batches.find(b => b.batchId === batchId);
        const batchAuthMode = (batch?.authMode as any) || baseDesign.authMode || "user_only";
        const effectiveDesign: VoucherDesignState = { ...baseDesign, authMode: batchAuthMode };

        const qrMap = await preGenerateQrCodes(
          data.vouchers,
          effectiveDesign.loginUrl || loginUrl || "10.0.0.1",
          batchAuthMode,
          120
        );

        const html = await generateStandaloneVoucherHtmlAsync({
          vouchers: data.vouchers,
          design: effectiveDesign,
          networkName: effectiveDesign.networkName || networkName,
          currencySymbol: effectiveDesign.currencySymbol || currencySymbol,
          loginUrl: effectiveDesign.loginUrl || loginUrl,
          cols: effectiveDesign.columnsCount || 3,
          rows: effectiveDesign.rowsCount || 7,
          theme: effectiveDesign.theme || 'modern',
          showCutMarks: true,
          showQr: true,
          showPin: batchAuthMode === "user_pass" || batchAuthMode === "user_equals_pass" || (effectiveDesign as any).sameUserPass === true,
          qrDataUrlMap: qrMap,
          fontScale: 1.0,
          gapMm: 4,
          paddingMm: 4
        });

        await printHtmlSafely(html, {
          fileName: `vouchers-${batchId}.html`,
          onFallbackDownload: () => {
            showToast('تم تحميل كروت الدفعة كملف HTML للطباعة', 'info');
          }
        });
        showToast('تم فتح أمر الطباعة للدفعة بنجاح', 'success');
      } else {
        showToast('لا توجد كروت في هذه الدفعة للطباعة', 'error');
      }
    } catch (err: any) {
      showToast('خطأ أثناء تصدير الدفعة: ' + err.message, 'error');
    }
  };

  const filteredBatches = batches.filter(b => 
    b.batchId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.profileName && b.profileName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (b.comment && b.comment.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>إدارة دفعات الكروت والمخزون (Batch Manager)</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            استعراض كافة الدفعات المولدة والمخزنة، فحص المزامنة مع الراوتر، إعادة الطباعة، وحذف الدفعات السابقة
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="بحث برقم الدفعة أو الباقة..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 pr-9 pl-3 py-2 rounded-xl text-xs text-white outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={() => handleOpenAudit(auditServiceType)}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-600/30 via-purple-600/30 to-indigo-600/30 hover:from-indigo-600/40 hover:to-purple-600/40 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-950/40"
            title="مراجعة ومطابقة كروت الراوتر مع المخزون وتصنيف الكروت غير المسجلة حسب تاريخ الحقن"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>مطابقة كروت الراوتر مع المخزون</span>
          </button>

          <button
            type="button"
            onClick={fetchBatches}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Resumable Incomplete Batches Banner (Pillar 5) */}
      {resumableBatches.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/70 via-amber-900/40 to-slate-900 border border-amber-500/50 rounded-2xl p-5 shadow-xl space-y-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 shrink-0">
              <AlertCircle className="w-6 h-6 animate-pulse" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-200">
                استئناف العمليات المقطوعة (Resumable Batch Injection)
              </h3>
              <p className="text-xs text-amber-300/80 mt-0.5">
                تم رصد {resumableBatches.length} دفعة كروت مقطوعة لم يكتمل حقنها بالكامل نتيجة انقطاع شبكة أو كهرباء سابق. يمكنك استئناف إرسال الكروت المتبقية فوراً بدون تكرار أي كرت تم إرساله سابقاً.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            {resumableBatches.map((rb) => (
              <div
                key={rb.batchId}
                className="bg-slate-950/80 border border-amber-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">{rb.batchId}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans font-bold">
                      متبقي: {rb.unsyncedCards} من {rb.totalCards}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    باقة: {rb.profileName} | الخدمة: {rb.serviceType} {rb.comment ? `(${rb.comment})` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleResumeBatch(rb.batchId)}
                  disabled={isResumingBatchId === rb.batchId}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResumingBatchId === rb.batchId ? 'animate-spin' : ''}`} />
                  <span>{isResumingBatchId === rb.batchId ? 'جارِ الاستئناف...' : 'استئناف الحقن الآن'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batches Grid / Table */}
      {loading && batches.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-300 text-sm font-bold">جاري تحميل سجل الدفعات...</p>
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-300">لا توجد دفعات كروت بعد</h3>
          <p className="text-slate-500 text-xs mt-1">
            قم بالانتقال إلى تبويب "المصمم التفاعلي" لتوليد دفعتك الأولى بحماية كاملة ضد تكرار الأكواد
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBatches.map(b => {
            const totalCount = b.count ?? b.totalGenerated ?? 0;
            const syncedCount = b.syncedCount ?? b.totalSynced ?? 0;
            const activeCount = b.activeCount ?? totalCount;
            const usedCount = b.usedCount ?? 0;
            const isSynced = totalCount > 0 && syncedCount >= totalCount;
            return (
              <div
                key={b.batchId}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-indigo-400">
                        {b.batchId}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        {b.serviceType || 'HOTSPOT'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {b.profileName} • {b.price} {currencySymbol}
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      isSynced
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                        : 'bg-amber-950/60 text-amber-300 border-amber-800'
                    }`}
                  >
                    {isSynced ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>متزامنة ({syncedCount})</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>غير متزامنة ({syncedCount}/{totalCount})</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-center font-mono">
                  <div>
                    <div className="text-[10px] text-slate-500 font-sans">الإجمالي</div>
                    <div className="text-sm font-black text-white">{totalCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-sans">المتاح</div>
                    <div className="text-sm font-black text-emerald-400">{activeCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 font-sans">المستخدم</div>
                    <div className="text-sm font-black text-slate-400">{usedCount}</div>
                  </div>
                </div>

                {/* Date and Comments */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/60 pt-3">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>{new Date(b.createdAt).toLocaleString('ar-YE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  {b.comment && (
                    <span className="truncate max-w-[140px] text-slate-400 font-sans" title={b.comment}>
                      {b.comment}
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button
                    type="button"
                    disabled={loadingBatchCardsId === b.batchId}
                    onClick={() => handleViewBatchCards(b.batchId)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border border-slate-700 disabled:opacity-50"
                    title="استعراض الكروت"
                  >
                    <Eye className={`w-3.5 h-3.5 text-blue-400 ${loadingBatchCardsId === b.batchId ? 'animate-pulse' : ''}`} />
                    <span className="hidden sm:inline text-[11px]">{loadingBatchCardsId === b.batchId ? '...' : 'عرض'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportBatchHtml(b.batchId)}
                    className="p-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    title="طباعة الدفعة / PDF"
                  >
                    <Printer className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline text-[11px]">طباعة</span>
                  </button>

                  <button
                    type="button"
                    disabled={syncingBatchId === b.batchId || isSynced}
                    onClick={() => handleSyncBatch(b)}
                    className={`p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                      isSynced
                        ? 'bg-slate-800/40 text-slate-500 border-slate-800 opacity-50 cursor-not-allowed'
                        : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/30'
                    }`}
                    title="مزامنة مع المايكروتك"
                  >
                    <Server className={`w-3.5 h-3.5 ${syncingBatchId === b.batchId ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline text-[11px]">{syncingBatchId === b.batchId ? 'مزامنة..' : 'مزامنة'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={deletingBatchId === b.batchId}
                    onClick={() => handleDeleteBatch(b.batchId)}
                    className="p-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    title="حذف الدفعة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline text-[11px]">حذف</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Batch Cards Viewer Modal */}
      {selectedBatchDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Hash className="w-5 h-5 text-amber-400" />
                  <span>كروت الدفعة: {selectedBatchDetails.batchId}</span>
                </h3>
                <div className="flex items-center gap-2 text-slate-400 text-xs mt-1">
                  <span>إجمالي {selectedBatchDetails.vouchers.length} كرت</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-bold">
                    {selectedBatchDetails.vouchers.filter(v => v.isSynced).length} محقون
                  </span>
                  {selectedBatchDetails.vouchers.filter(v => !v.isSynced).length > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-400 font-bold">
                        {selectedBatchDetails.vouchers.filter(v => !v.isSynced).length} معلق غير محقون
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedBatchDetails.vouchers.filter(v => !v.isSynced).length > 0 && (
                  <button
                    type="button"
                    disabled={syncingBatchId === selectedBatchDetails.batchId}
                    onClick={() => {
                      const batch = batches.find(b => b.batchId === selectedBatchDetails.batchId);
                      if (batch) {
                        handleSyncBatch(batch);
                      }
                    }}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-md border border-emerald-400/30"
                    title="حقن الكروت المعلقة غير المحقونة في راوتر المايكروتك بنقرة واحدة"
                  >
                    <Server className={`w-3.5 h-3.5 ${syncingBatchId === selectedBatchDetails.batchId ? 'animate-spin' : ''}`} />
                    <span>⚡ إكمال حقن الكروت المعلقة ({selectedBatchDetails.vouchers.filter(v => !v.isSynced).length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleExportBatchHtml(selectedBatchDetails.batchId)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة فورية</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedBatchDetails(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {selectedBatchDetails.vouchers.map(v => (
                  <div
                    key={v.voucherId}
                    className={`bg-slate-950 border p-2.5 rounded-xl space-y-1.5 text-center font-mono transition-all ${
                      v.isSynced ? 'border-slate-800 hover:border-slate-700' : 'border-amber-800/60 bg-amber-950/10'
                    }`}
                  >
                    <div className="text-[10px] text-slate-500 font-sans flex justify-between items-center">
                      <span>{v.profileName}</span>
                      <span className="text-emerald-400 font-bold">{v.price} {currencySymbol}</span>
                    </div>
                    <div className="text-xs font-black text-amber-300 bg-slate-900 p-1 rounded border border-slate-800 tracking-wider">
                      {v.voucherCode}
                    </div>
                    {v.voucherPin && v.voucherPin !== v.voucherCode && (
                      <div className="text-[11px] text-slate-400 font-bold">
                        PIN: {v.voucherPin}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[9px] pt-1 border-t border-slate-800/80">
                      {v.isSynced ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" /> محقون
                        </span>
                      ) : (
                        <span className="text-amber-400 font-bold flex items-center gap-0.5 animate-pulse">
                          <AlertCircle className="w-2.5 h-2.5" /> غير محقون
                        </span>
                      )}
                      <span className="text-slate-500 font-sans">{v.timeLimit || 'محدد'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Router Audit & Reconciliation Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>مراجعة ومطابقة كروت الراوتر مع المخزون</span>
                    <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800">
                      Router Audit
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    فحص كروت المايكروتك الحية ومقارنتها بالمخزون المحلي وتصنيف الكروت غير المسجلة حسب تاريخ الحقن
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Service Selector */}
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
                  {(['HOTSPOT', 'PPPOE', 'USERMAN'] as const).map(srv => (
                    <button
                      key={srv}
                      type="button"
                      onClick={() => {
                        setAuditServiceType(srv);
                        handleOpenAudit(srv);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                        auditServiceType === srv
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {srv === 'HOTSPOT' ? 'هوت سبوت' : srv === 'PPPOE' ? 'PPPoE' : 'يوزر مانجر'}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsAuditModalOpen(false)}
                  className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {auditLoading ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                  <p className="text-sm font-bold text-slate-300">جاري قراءة كروت المايكروتك ومطابقتها مع المخزون...</p>
                  <p className="text-xs text-slate-500">يتم فحص أكواد الكروت، تواريخ الحقن، والبروفايلات</p>
                </div>
              ) : auditData ? (
                <>
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-xs text-slate-400 font-bold">إجمالي الكروت بالمايكروتك</span>
                      <div className="text-2xl font-black text-white font-mono">{auditData.summary.totalRouterUsers}</div>
                      <span className="text-[10px] text-slate-500">حسابات نشطة بالراوتر</span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-xs text-emerald-400 font-bold">متطابقة ومسجلة في المخزون</span>
                      <div className="text-2xl font-black text-emerald-400 font-mono">{auditData.summary.matchedWithInventory}</div>
                      <span className="text-[10px] text-emerald-500/80">موجودة في الدفعات والمخزون</span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                      <span className="text-xs text-amber-400 font-bold">موجودة بالراوتر وغير مسجلة</span>
                      <div className="text-2xl font-black text-amber-400 font-mono">{auditData.summary.unmappedCount}</div>
                      <span className="text-[10px] text-amber-500/80">غير موجودة بالمخزون المحلي</span>
                    </div>
                  </div>

                  {/* Classification by Injection Date */}
                  {auditData.summary.unmappedCount === 0 ? (
                    <div className="p-8 text-center bg-emerald-950/30 border border-emerald-800/40 rounded-2xl space-y-2">
                      <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                      <h4 className="text-base font-bold text-emerald-300">تطابق تام ومثالي بنسبة 100%!</h4>
                      <p className="text-xs text-slate-400 max-w-md mx-auto">
                        كافة الكروت المحقونة في راوتر المايكروتك مسجلة ومتطابقة بالكامل مع إدارة المخزون والدفعات، ولا توجد أي كروت شاردة أو مفقودة.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-amber-400" />
                            <span>تصنيف الكروت غير المسجلة حسب تاريخ الحقن على المايكروتك:</span>
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            تم تجميع الكروت تلقائياً بناءً على تاريخ حقنها المسجل في تعليقات وبيانات الراوتر:
                          </p>
                        </div>
                      </div>

                      {/* Groups Accordion */}
                      <div className="space-y-3">
                        {auditData.dateGroups.map(group => {
                          const isExpanded = !!expandedDates[group.date];
                          const isImporting = importingDate === group.date;

                          return (
                            <div
                              key={group.date}
                              className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden transition-all"
                            >
                              {/* Group Header */}
                              <div className="p-3.5 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between">
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className="flex items-center gap-3 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg"
                                  onClick={() => toggleDateExpanded(group.date)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleDateExpanded(group.date);
                                    }
                                  }}
                                >
                                  <div className="p-2 bg-slate-800 text-indigo-400 rounded-lg">
                                    <Calendar className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-sm text-white">
                                        {group.date === 'غير محدد التاريخ' ? 'كروت بدون تاريخ محدد' : `تاريخ الحقن: ${group.date}`}
                                      </span>
                                      <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/60 font-bold">
                                        {group.count} كرت
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-400">
                                      انقر لعرض تفاصيل الكروت التابعة لهذا التاريخ
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isImporting}
                                    onClick={() => handleImportGroup(group)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
                                    title="استيراد هذه الكروت إلى إدارة الدفعات والمخزون كدفعة جديدة"
                                  >
                                    {isImporting ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <ArrowDownToLine className="w-3.5 h-3.5" />
                                    )}
                                    <span>{isImporting ? 'جاري الاستيراد...' : 'استيراد إلى المخزون'}</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => toggleDateExpanded(group.date)}
                                    className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-all"
                                  >
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>

                              {/* Group Card List */}
                              {isExpanded && (
                                <div className="p-3 max-h-60 overflow-y-auto">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {group.cards.map((c, cIdx) => (
                                      <div
                                        key={cIdx}
                                        className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1 font-mono"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-black text-amber-300 font-mono tracking-wider">{c.name}</span>
                                          <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded font-sans">
                                            {c.profile}
                                          </span>
                                        </div>
                                        {c.password && c.password !== c.name && (
                                          <div className="text-[11px] text-slate-400">PIN: {c.password}</div>
                                        )}
                                        {c.comment && (
                                          <div className="text-[10px] text-slate-500 truncate font-sans" title={c.comment}>
                                            {c.comment}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>الاستيراد يتم بأمان تام دون تكرار للأكواد ودون التأثير على حسابات الراوتر القائمة</span>
              </span>

              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Batch Confirm Modal */}
      <ConfirmModal
        isOpen={!!batchToDelete}
        title="تأكيد حذف دفعة الكروت"
        message={`هل تريد بالتأكيد حذف الدفعة (${batchToDelete}) نهائياً؟ سيتم مسح مستخدميها من الراوتر والتخزين.`}
        confirmText="نعم، حذف الدفعة"
        cancelText="إلغاء"
        type="danger"
        isLoading={!!deletingBatchId}
        onConfirm={handleExecuteDeleteBatch}
        onClose={() => setBatchToDelete(null)}
      />
    </div>
  );
};
