import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Search, RefreshCw, Download, ChevronLeft, ChevronRight,
  CheckCircle2, AlertCircle, Database, Printer, Trash2, Server, Eye, ArrowRight
} from 'lucide-react';
import { VoucherItem, VoucherDesignState } from './types';
import { generateStandaloneVoucherHtmlAsync } from './voucherHtmlGenerator';
import { preGenerateQrCodes } from './qrPreGenerator';
import { safeStorage } from '../../utils/safeStorage';
import { printHtmlSafely } from '../../lib/printHelper';
import { secureFetch, safeParseJson } from '../../lib/api';
import { ConfirmModal } from '../ConfirmModal';

interface AllVouchersTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  networkName: string;
  currencySymbol: string;
  loginUrl: string;
  design?: VoucherDesignState;
  onPrintBatch?: (vouchers: VoucherItem[], batchId: string) => void;
}

export const AllVouchersTab: React.FC<AllVouchersTabProps> = ({
  showToast,
  networkName,
  currencySymbol,
  loginUrl,
  design,
  onPrintBatch
}) => {
  // Master state for batches
  const [batches, setBatches] = useState<any[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');

  // Selected batch detailed state
  const [selectedBatch, setSelectedBatch] = useState<any | null>(null);
  const [vouchers, setVouchers] = useState<VoucherItem[]>([]);
  const [loadingVouchers, setLoadingVouchers] = useState(false);
  
  // Scoped voucher filtering and pagination
  const [voucherSearch, setVoucherSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'synced' | 'unsynced' | 'active' | 'used' | 'disabled'>('all');
  const [voucherPage, setVoucherPage] = useState(1);
  const voucherLimit = 20;

  // Sync / deletion progress states
  const [syncingBatchId, setSyncingBatchId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const unsyncedBatchCount = useMemo(() => {
    return vouchers.filter(v => !v.isSynced).length;
  }, [vouchers]);

  // Lifecycle refs
  const isMountedRef = useRef(true);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const batchesAbortRef = useRef<AbortController | null>(null);
  const vouchersAbortRef = useRef<AbortController | null>(null);

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
      batchesAbortRef.current?.abort();
      vouchersAbortRef.current?.abort();
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  // Fetch batches initially
  const fetchBatches = useCallback(async () => {
    batchesAbortRef.current?.abort();
    const controller = new AbortController();
    batchesAbortRef.current = controller;
    setLoadingBatches(true);
    try {
      const res = await secureFetch('/api/vouchers/batches', {
        signal: controller.signal
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success && data.data) {
        setBatches(data.data || []);
      } else if (!res.ok) {
        showToast(data.error || `فشل جلب السجلات (${res.status})`, 'error');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && isMountedRef.current) {
        console.error('Failed to fetch batches:', err);
        showToast('فشل جلب سجلات الكروت والدفعات', 'error');
      }
    } finally {
      if (isMountedRef.current) setLoadingBatches(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchBatches();
    const handleVoucherChange = () => {
      fetchBatches();
    };
    window.addEventListener('zctrl:vouchers-changed', handleVoucherChange);
    return () => {
      window.removeEventListener('zctrl:vouchers-changed', handleVoucherChange);
    };
  }, [fetchBatches]);

  // Fetch vouchers when batch is selected
  const fetchBatchVouchers = useCallback(async (batchId: string) => {
    vouchersAbortRef.current?.abort();
    const controller = new AbortController();
    vouchersAbortRef.current = controller;
    setLoadingVouchers(true);
    try {
      const token = safeStorage.getItem('zcontrol_active_token');
      const res = await fetch(`/api/vouchers/batch/${encodeURIComponent(batchId)}`, {
        signal: controller.signal,
        headers: { ...(token ? { 'X-Router-Token': token } : {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        setVouchers(data.vouchers || []);
        setVoucherPage(1);
      } else {
        showToast(data.error || 'فشل جلب تفاصيل الكروت', 'error');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && isMountedRef.current) {
        console.error('Failed to fetch vouchers:', err);
        showToast('فشل جلب تفاصيل الكروت', 'error');
      }
    } finally {
      if (isMountedRef.current) setLoadingVouchers(false);
    }
  }, [showToast]);

  const handleSelectBatch = (batch: any) => {
    setSelectedBatch(batch);
    setVoucherSearch('');
    setStatusFilter('all');
    fetchBatchVouchers(batch.batchId);
  };

  const handleBackToBatches = () => {
    vouchersAbortRef.current?.abort();
    setSelectedBatch(null);
    setVouchers([]);
    fetchBatches();
  };

  // Sync a batch to MikroTik
  const handleSyncBatch = async (batch: any) => {
    setSyncingBatchId(batch.batchId);
    try {
      const res = await secureFetch('/api/vouchers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.batchId,
          profileOnRouter: batch.profileName,
          serviceType: batch.serviceType || 'HOTSPOT'
        })
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success && data.data) {
        showToast(`تمت مزامنة ${data.data.synced} كرت بنجاح مع راوتر المايكروتك`, 'success');
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        fetchBatches();
        if (selectedBatch?.batchId === batch.batchId) {
          fetchBatchVouchers(batch.batchId);
        }
      } else {
        showToast(data.error || 'فشلت المزامنة مع المايكروتك', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) showToast(err.message || 'حدث خطأ أثناء المزامنة', 'error');
    } finally {
      if (isMountedRef.current) setSyncingBatchId(null);
    }
  };

  // Sync a single voucher to MikroTik
  const handleSyncSingleVoucher = async (code: string) => {
    setSyncingBatchId(code);
    try {
      const res = await secureFetch('/api/vouchers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatch?.batchId,
          voucherCodes: [code],
          profileOnRouter: selectedBatch?.profileName,
          serviceType: selectedBatch?.serviceType || 'HOTSPOT'
        })
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success && data.data) {
        showToast(`تم حقن الكرت (${code}) بنجاح في راوتر المايكروتك`, 'success');
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        if (selectedBatch) {
          fetchBatchVouchers(selectedBatch.batchId);
          fetchBatches();
        }
      } else {
        showToast(data.error || 'فشل حقن الكرت بالراوتر', 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) showToast(err.message || 'حدث خطأ أثناء حقن الكرت', 'error');
    } finally {
      if (isMountedRef.current) setSyncingBatchId(null);
    }
  };

  const [batchToDelete, setBatchToDelete] = useState<any | null>(null);

  // Delete a batch
  const handleDeleteBatch = (batch: any) => {
    setBatchToDelete(batch);
  };

  const handleExecuteDeleteBatch = async () => {
    if (!batchToDelete) return;
    const batch = batchToDelete;
    const syncedCount = batch.syncedCount ?? batch.totalSynced ?? 0;
    const isUnsynced = syncedCount === 0;

    setDeletingBatchId(batch.batchId);
    try {
      const token = safeStorage.getItem('zcontrol_active_token');
      const res = await fetch(`/api/vouchers/batch/${encodeURIComponent(batch.batchId)}?fromRouter=${!isUnsynced}`, {
        method: 'DELETE',
        headers: { ...(token ? { 'X-Router-Token': token } : {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.warning || data.message || 'تم حذف الدفعة بنجاح', data.warning ? 'info' : 'success');
        window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));
        if (selectedBatch?.batchId === batch.batchId) {
          handleBackToBatches();
        } else {
          fetchBatches();
        }
        setBatchToDelete(null);
      } else {
        showToast(data.error || `فشل حذف الدفعة (${res.status})`, 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast(err.message || 'حدث خطأ أثناء حذف الدفعة', 'error');
      }
    } finally {
      if (isMountedRef.current) setDeletingBatchId(null);
    }
  };

  // Print cards of a batch
  const handlePrintBatch = async (batch: any) => {
    try {
      showToast('جاري تحضير ملف الطباعة...', 'info');
      const token = safeStorage.getItem('zcontrol_active_token');
      const res = await fetch(`/api/vouchers/batch/${encodeURIComponent(batch.batchId)}`, {
        headers: { ...(token ? { 'X-Router-Token': token } : {}) }
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success && Array.isArray(data.vouchers) && data.vouchers.length > 0) {
        if (onPrintBatch) {
          onPrintBatch(data.vouchers, batch.batchId);
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
        } as any);

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
          fileName: `vouchers-${batch.batchId}.html`,
          onFallbackDownload: () => {
            showToast('تم تحميل كروت الدفعة كملف HTML للطباعة', 'info');
          }
        });
        showToast('تم فتح أمر الطباعة للدفعة بنجاح', 'success');
      } else {
        showToast('لا توجد كروت في هذه الدفعة للطباعة', 'error');
      }
    } catch (err: any) {
      showToast('فشل تحميل الكروت للطباعة: ' + (err?.message || ''), 'error');
    }
  };

  // Export CSV of batch vouchers
  const handleExportBatchCsv = (batch: any, itemsToExport: VoucherItem[]) => {
    if (itemsToExport.length === 0) {
      showToast('لا توجد كروت للتصدير', 'error');
      return;
    }
    const headers = ['م', 'كود المستخدم', 'كلمة المرور', 'الحالة', 'الباقة', 'السعر', 'صلاحية الوقت', 'حد البيانات', 'تاريخ الإنشاء'];
    const rows = itemsToExport.map((v, idx) => [
      idx + 1,
      v.voucherCode,
      v.voucherPin,
      v.statusCd,
      v.profileName,
      v.price,
      v.timeLimit,
      v.dataLimit || '',
      v.createdAt
    ]);

    const esc = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const csvContent = '\uFEFF' + [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vouchers-batch-${batch.comment || batch.batchId}-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    trackTimer(() => URL.revokeObjectURL(url), 1000);
    showToast('تم تصدير ملف CSV بنجاح', 'success');
  };

  // Filtered Batches List based on search
  const filteredBatches = useMemo(() => {
    return batches.filter(b => {
      const q = batchSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        b.profileName?.toLowerCase().includes(q) ||
        b.comment?.toLowerCase().includes(q) ||
        b.prefix?.toLowerCase().includes(q) ||
        b.batchId?.toLowerCase().includes(q)
      );
    });
  }, [batches, batchSearch]);

  // Client-side filtering of vouchers inside selected batch
  const filteredVouchers = useMemo(() => {
    return vouchers.filter(v => {
      const matchesSearch = 
        !voucherSearch.trim() ||
        v.voucherCode.toLowerCase().includes(voucherSearch.toLowerCase().trim()) ||
        (v.voucherPin && v.voucherPin.toLowerCase().includes(voucherSearch.toLowerCase().trim())) ||
        v.profileName.toLowerCase().includes(voucherSearch.toLowerCase().trim());
      
      const matchesStatus = 
        statusFilter === 'all' ? true :
        statusFilter === 'synced' ? v.isSynced === true :
        statusFilter === 'unsynced' ? !v.isSynced :
        v.statusCd.toLowerCase() === statusFilter.toLowerCase();
        
      return matchesSearch && matchesStatus;
    });
  }, [vouchers, voucherSearch, statusFilter]);

  // Scoped pagination for vouchers
  const paginatedVouchers = useMemo(() => {
    const start = (voucherPage - 1) * voucherLimit;
    return filteredVouchers.slice(start, start + voucherLimit);
  }, [filteredVouchers, voucherPage, voucherLimit]);

  const totalVoucherPages = Math.max(1, Math.ceil(filteredVouchers.length / voucherLimit));

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      
      {/* 1. MASTER BATCHES LIST VIEW */}
      {!selectedBatch ? (
        <>
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2.5">
                <Database className="w-5 h-5 text-indigo-400" />
                <span>سجل وبحث الكروت والدفعات (Cards Batch Records)</span>
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                تصفح وإدارة كافة سجلات كروت المايكروتك التي تم توليدها أو حقنها ومزامنتها على الراوتر بنجاح
              </p>
            </div>

            <button
              type="button"
              onClick={fetchBatches}
              disabled={loadingBatches}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loadingBatches ? 'animate-spin text-indigo-400' : ''}`} />
              <span>تحديث السجلات</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
              <input
                type="text"
                placeholder="ابحث بالبروفايل، البادئة، أو تعليق الدفعة..."
                value={batchSearch}
                onChange={e => setBatchSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 pr-9 pl-3 py-2.5 rounded-xl text-xs text-white outline-none focus:border-indigo-500 font-bold"
              />
            </div>
          </div>

          {/* Batches Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-black">
                  <tr>
                    <th className="p-3.5">البروفايل (Profile)</th>
                    <th className="p-3.5">البادئة (Prefix)</th>
                    <th className="p-3.5">تعليق الدفعة (Comment)</th>
                    <th className="p-3.5 text-center">الكمية وحالة المزامنة</th>
                    <th className="p-3.5">تاريخ التوليد (Date)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {loadingBatches ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                        جاري تحميل سجلات الدفعات...
                      </td>
                    </tr>
                  ) : filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-slate-500 font-bold">
                        لا توجد سجلات دفعات كروت مطابقة لبحثك في هذا القسم
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map(b => {
                      const totalCount = b.count ?? b.totalGenerated ?? 0;
                      const syncedCount = b.syncedCount ?? b.totalSynced ?? 0;
                      const isFullySynced = totalCount > 0 && syncedCount >= totalCount;
                      return (
                        <tr
                          key={b.batchId}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectBatch(b)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectBatch(b);
                            }
                          }}
                          className="hover:bg-slate-800/50 transition-colors cursor-pointer group focus:outline-none focus:bg-slate-800/70"
                          title="انقر لعرض تفاصيل وكروت الدفعة، مزامنتها، طباعتها أو حذفها"
                        >
                          <td className="p-3.5 font-bold text-slate-200 text-sm">
                            <span className="bg-slate-950 px-2 py-1 rounded text-amber-300 font-mono text-xs border border-slate-800">
                              {b.profileName}
                            </span>
                          </td>
                          <td className="p-3.5 text-indigo-300 font-mono font-bold text-sm">
                            <span dir="ltr" className="unicode-isolate">
                              {b.prefix || '-'}
                            </span>
                          </td>
                          <td className="p-3.5 text-slate-300 max-w-xs truncate font-bold" title={b.comment}>
                            {b.comment || '-'}
                          </td>
                          <td className="p-3.5 text-center">
                            <div className="font-mono font-black text-sm text-slate-100">
                              {totalCount} كرت
                            </div>
                            <div className="mt-1">
                              {isFullySynced ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-900/50">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>محقونة بالكامل</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-400 border border-amber-900/50">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>معلقة ({Math.max(0, totalCount - syncedCount)})</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-400 font-sans text-xs">
                            {new Date(b.createdAt).toLocaleDateString('ar-YE', {
                              year: 'numeric',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Total Footer */}
            <div className="p-4 bg-slate-950 text-xs text-slate-400 border-t border-slate-800 flex items-center justify-between">
              <span>إجمالي سجلات الدفعات: <strong className="text-white font-mono">{filteredBatches.length}</strong> دفعة</span>
              <span>الكمية الكلية للكروت المولدة: <strong className="text-amber-400 font-mono">{filteredBatches.reduce((acc, curr) => acc + (curr.count ?? curr.totalGenerated ?? 0), 0).toLocaleString()}</strong> كرت</span>
            </div>
          </div>
        </>
      ) : (
        
        // 2. DETAILED BATCH VOUCHERS VIEW
        <div className="space-y-6">
          {/* Detailed View Header */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBackToBatches}
                className="text-xs font-black text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>الرجوع لسجل الدفعات</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                {unsyncedBatchCount > 0 && (
                  <button
                    type="button"
                    disabled={syncingBatchId === selectedBatch.batchId}
                    onClick={() => handleSyncBatch(selectedBatch)}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-600 via-emerald-600 to-teal-600 hover:from-amber-500 hover:to-emerald-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-950/50 border border-emerald-400/30"
                    title="حقن الكروت غير المحقونة فوراً في راوتر المايكروتك دون تكرار"
                  >
                    <Server className={`w-4 h-4 ${syncingBatchId === selectedBatch.batchId ? 'animate-spin' : ''}`} />
                    <span>⚡ إكمال حقن الكروت المعلقة بالمايكروتك ({unsyncedBatchCount})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handlePrintBatch(selectedBatch)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الدفعة كاملة</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportBatchCsv(selectedBatch, vouchers)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير CSV للدفعة</span>
                </button>
              </div>
            </div>

            {/* Batch Info Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-950/80 p-4 rounded-xl border border-slate-800 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 block font-bold">باقة الكروت (Profile):</span>
                <span className="text-amber-300 text-sm font-black font-mono">{selectedBatch.profileName}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block font-bold">بادئة الكود (Prefix):</span>
                <span className="text-indigo-300 text-sm font-black font-mono">{selectedBatch.prefix || 'بدون بادئة'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block font-bold">حالة الحقن بالراوتر:</span>
                {unsyncedBatchCount === 0 ? (
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    متزامن بالكامل ({vouchers.length} كرت)
                  </span>
                ) : (
                  <span className="text-amber-400 text-xs font-bold flex items-center gap-1 font-mono">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {vouchers.length - unsyncedBatchCount} متزامن / {unsyncedBatchCount} معلق
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block font-bold">تعليق الدفعة:</span>
                <span className="text-slate-200 text-sm font-bold truncate block">{selectedBatch.comment || '-'}</span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block font-bold">تاريخ التوليد:</span>
                <span className="text-slate-200 text-sm font-mono font-bold">
                  {new Date(selectedBatch.createdAt).toLocaleDateString('ar-YE')}
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Filters & Search */}
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                placeholder="ابحث داخل هذه الدفعة بالكود أو كلمة المرور..."
                value={voucherSearch}
                onChange={e => {
                  setVoucherSearch(e.target.value);
                  setVoucherPage(1);
                }}
                className="w-full bg-slate-950 border border-slate-800 pr-9 pl-3 py-2 rounded-xl text-xs text-white outline-none focus:border-indigo-500 font-bold"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] w-full sm:w-auto overflow-x-auto whitespace-nowrap">
                {(['all', 'synced', 'unsynced', 'active', 'used', 'disabled'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st);
                      setVoucherPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'all'
                      ? 'الكل'
                      : st === 'synced'
                      ? 'محقون بالراوتر'
                      : st === 'unsynced'
                      ? `معلق غير محقون (${unsyncedBatchCount})`
                      : st === 'active'
                      ? 'متاح'
                      : st === 'used'
                      ? 'مستخدم'
                      : 'معطل'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => fetchBatchVouchers(selectedBatch.batchId)}
                disabled={loadingVouchers}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 cursor-pointer"
                title="تحديث قائمة الكروت"
              >
                <RefreshCw className={`w-4 h-4 ${loadingVouchers ? 'animate-spin text-indigo-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Vouchers Grid Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold">
                  <tr>
                    <th className="p-3.5">الكود (Username)</th>
                    <th className="p-3.5">كلمة المرور (PIN)</th>
                    <th className="p-3.5">الباقة</th>
                    <th className="p-3.5">السعر</th>
                    <th className="p-3.5">الصلاحية / الحصة</th>
                    <th className="p-3.5">الحالة</th>
                    <th className="p-3.5 text-center">المزامنة مع المايكروتك</th>
                    <th className="p-3.5">تاريخ التوليد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {loadingVouchers ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                        جاري تحميل كروت الدفعة...
                      </td>
                    </tr>
                  ) : paginatedVouchers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 font-sans">
                        لا توجد كروت مطابقة للبحث داخل هذه الدفعة
                      </td>
                    </tr>
                  ) : (
                    paginatedVouchers.map(v => (
                      <tr key={v.voucherId} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3.5 font-bold text-amber-300 text-sm">
                          <span dir="ltr" className="unicode-isolate">{v.voucherCode}</span>
                        </td>
                        <td className="p-3.5 text-slate-300">
                          <span dir="ltr" className="unicode-isolate">{v.voucherPin || <span className="text-slate-500 text-xs font-sans">بدون رمز</span>}</span>
                        </td>
                        <td className="p-3.5 font-sans font-bold text-slate-200">{v.profileName}</td>
                        <td className="p-3.5 text-emerald-400 font-bold font-sans">{v.price} {currencySymbol}</td>
                        <td className="p-3.5 text-slate-400 font-sans">
                          {v.timeLimit} {v.dataLimit ? `• ${v.dataLimit}` : ''}
                        </td>
                        <td className="p-3.5 font-sans">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              v.statusCd === 'active' || v.statusCd === 'ACTIVE'
                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                                : v.statusCd === 'used' || v.statusCd === 'USED'
                                ? 'bg-blue-950/60 text-blue-300 border border-blue-800'
                                : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {v.statusCd === 'active' || v.statusCd === 'ACTIVE' ? 'متاح' : v.statusCd === 'used' || v.statusCd === 'USED' ? 'مستخدم' : 'معطل'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center font-sans">
                          {v.isSynced ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-800">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>محقون بالراوتر</span>
                            </span>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800">
                                <AlertCircle className="w-3 h-3 text-amber-400" />
                                <span>معلق</span>
                              </span>
                              <button
                                type="button"
                                disabled={syncingBatchId === v.voucherCode}
                                onClick={() => handleSyncSingleVoucher(v.voucherCode)}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[10px] font-black transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
                                title="حقن هذا الكرت فوراً وبشكل حقيقي في راوتر المايكروتك دون تكرار"
                              >
                                <Server className={`w-3 h-3 ${syncingBatchId === v.voucherCode ? 'animate-spin' : ''}`} />
                                <span>{syncingBatchId === v.voucherCode ? '...' : 'حقن الآن'}</span>
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-slate-500 text-[11px] font-sans">
                          {new Date(v.createdAt).toLocaleDateString('ar-YE')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-950">
              <span className="text-slate-400 font-sans">
                إجمالي الكروت المطابقة: <strong className="text-white font-mono">{filteredVouchers.length.toLocaleString()}</strong> كرت 
                (صفحة <strong className="text-white font-mono">{voucherPage}</strong> من <strong className="text-white font-mono">{totalVoucherPages}</strong>)
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={voucherPage <= 1}
                  onClick={() => setVoucherPage(prev => Math.max(1, prev - 1))}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 bg-slate-900 rounded-lg border border-slate-800 font-mono text-white font-bold">
                  {voucherPage} / {totalVoucherPages}
                </span>

                <button
                  type="button"
                  disabled={voucherPage >= totalVoucherPages}
                  onClick={() => setVoucherPage(prev => Math.min(totalVoucherPages, prev + 1))}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Batch Confirm Modal */}
      <ConfirmModal
        isOpen={!!batchToDelete}
        title="تأكيد حذف دفعة الكروت"
        message={
          (batchToDelete?.syncedCount ?? batchToDelete?.totalSynced ?? 0) === 0
            ? `هل أنت متأكد من حذف هذه الدفعة (${batchToDelete?.batchId}) نهائياً من قاعدة البيانات؟`
            : `تحذير: هذه الدفعة (${batchToDelete?.batchId}) متزامنة مع المايكروتك. هل تريد حذفها نهائياً من النظام ومن جهاز المايكروتك أيضاً؟`
        }
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
