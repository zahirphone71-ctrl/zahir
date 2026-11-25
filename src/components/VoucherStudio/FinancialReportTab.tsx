import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Layers,
  Calendar,
  FileSpreadsheet,
  RefreshCw,
  Coins,
  CheckCircle2,
  Clock,
  Printer,
  Sparkles,
  ArrowUpRight,
  PieChart
} from 'lucide-react';
import { secureFetch, safeParseJson } from '../../lib/api';

interface FinancialSummaryData {
  totalRevenue: number;
  syncedRevenue: number;
  unsyncedRevenue: number;
  usedRevenue: number;
  todayRevenue: number;
  totalVouchersCount: number;
  totalBatchesCount: number;
  profileBreakdown: Record<string, { count: number; totalValue: number; price: number; synced: number }>;
  batchesBreakdown: Array<{
    batchId: string;
    comment: string;
    profileName: string;
    price: number;
    totalGenerated: number;
    totalSynced: number;
    totalValue: number;
    createdAt: string;
  }>;
}

interface FinancialReportTabProps {
  currencySymbol?: string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const FinancialReportTab: React.FC<FinancialReportTabProps> = ({
  currencySymbol = 'ريال',
  showToast
}) => {
  const [data, setData] = useState<FinancialSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchBatch, setSearchBatch] = useState('');

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  const fetchFinancialReport = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await secureFetch('/api/vouchers/financial-report', {
        signal: controller.signal
      });
      const json = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && json.success && json.data) {
        setData(json.data);
      } else if (!res.ok) {
        showToast(json.error || `تعذر جلب التقرير المالي (${res.status})`, 'error');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && isMountedRef.current) {
        console.error('Failed to fetch financial report:', err);
        showToast('تعذر جلب التقرير المالي', 'error');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchFinancialReport();
  }, [fetchFinancialReport]);

  const exportFinancialCsv = () => {
    if (!data || !data.batchesBreakdown || data.batchesBreakdown.length === 0) {
      showToast('لا توجد دفعات لتصديرها', 'info');
      return;
    }

    const esc = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const headers = ['رقم الدفعة', 'البروفايل', 'سعر الكرت', 'العدد الإجمالي', 'المحقون للراوتر', 'إجمالي القيمة', 'تاريخ التوليد', 'البيان'];
    const rows = data.batchesBreakdown.map((b) => [
      esc(b.batchId),
      esc(b.profileName || 'Default'),
      b.price,
      b.totalGenerated,
      b.totalSynced,
      b.totalValue,
      esc(new Date(b.createdAt).toLocaleString('ar-EG')),
      esc(b.comment || '')
    ]);

    const csvContent = '\uFEFF' + [headers.map(esc).join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ZCtrl_Financial_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const tid = setTimeout(() => {
      timersRef.current.delete(tid);
      URL.revokeObjectURL(url);
    }, 1000);
    timersRef.current.add(tid);
    showToast('تم تصدير التقرير المالي كملف CSV بنجاح', 'success');
  };

  const filteredBatches = (data?.batchesBreakdown || []).filter((b) => {
    if (!searchBatch) return true;
    const q = searchBatch.toLowerCase();
    return (
      b.batchId.toLowerCase().includes(q) ||
      b.profileName.toLowerCase().includes(q) ||
      (b.comment && b.comment.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
              <span>دفتر المحاسبة وتقارير المبيعات (POS Financial Accounting)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                مباشر
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              متابعة الإيرادات الكلية، حركة مبيعات الدفعات، وأرصدة الموزعين وقيم الكروت المحقونة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={fetchFinancialReport}
            disabled={loading}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={exportFinancialCsv}
            disabled={!data || (data.batchesBreakdown && data.batchesBreakdown.length === 0)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>تصدير Excel / CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Financial Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Generated Value */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-blue-500 to-indigo-600" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">إجمالي قيمة الكروت المصدرة</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-slate-100 flex items-baseline gap-1.5">
            <span>{(data?.totalRevenue || 0).toLocaleString()}</span>
            <span className="text-xs text-blue-400 font-bold">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            <span>إجمالي {data?.totalVouchersCount || 0} كرت في {data?.totalBatchesCount || 0} دفعة</span>
          </p>
        </div>

        {/* Card 2: Synced / Ready in Router */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-emerald-500 to-teal-600" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">قيمة الكروت المحقونة (جاهزة للبيع)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 flex items-baseline gap-1.5">
            <span>{(data?.syncedRevenue || 0).toLocaleString()}</span>
            <span className="text-xs text-emerald-500 font-bold">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-emerald-400/70 mt-2 flex items-center gap-1">
            <span>نشطة ومخزنة على راوتر المايكروتك</span>
          </p>
        </div>

        {/* Card 3: Today's Revenue */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-amber-500 to-orange-600" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">مبيعات / إصدارات اليوم</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 flex items-baseline gap-1.5">
            <span>{(data?.todayRevenue || 0).toLocaleString()}</span>
            <span className="text-xs text-amber-500 font-bold">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            <span>منذ بداية اليوم الحالي</span>
          </p>
        </div>

        {/* Card 4: Used / Consumed */}
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-purple-500 to-pink-600" />
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">قيمة الكروت المستهلكة</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-purple-300 flex items-baseline gap-1.5">
            <span>{(data?.usedRevenue || 0).toLocaleString()}</span>
            <span className="text-xs text-purple-400 font-bold">{currencySymbol}</span>
          </div>
          <p className="text-[11px] text-purple-400/70 mt-2 flex items-center gap-1">
            <span>كروت تم استهلاك رصيدها بالكامل</span>
          </p>
        </div>
      </div>

      {/* Profiles Breakdown Section */}
      <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-400" />
            <span>توزيع الإيرادات حسب البروفايل والباقة</span>
          </h3>
          <span className="text-xs text-slate-400">
            {Object.keys(data?.profileBreakdown || {}).length} باقة مسجلة
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(data?.profileBreakdown || {}).map(([profName, profInfo]) => (
            <div
              key={profName}
              className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-2 hover:border-slate-700 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-200 truncate max-w-[150px]" title={profName}>
                  {profName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 font-bold border border-indigo-500/20">
                  {profInfo.price} {currencySymbol}
                </span>
              </div>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-500">القيمة الإجمالية:</span>
                <span className="font-bold text-emerald-400">{profInfo.totalValue.toLocaleString()} {currencySymbol}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>العدد: {profInfo.count} كرت</span>
                <span className="text-emerald-400/80">المحقون: {profInfo.synced}</span>
              </div>
            </div>
          ))}
          {(!data || Object.keys(data.profileBreakdown || {}).length === 0) && (
            <div className="col-span-full py-6 text-center text-xs text-slate-500">
              لا توجد كروت مولدة حتى الآن لحساب توزيع الباقات
            </div>
          )}
        </div>
      </div>

      {/* Batches Ledger / Financial Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-100">سجل الدفعات والمبيعات التفصيلي</h3>
            <span className="text-xs text-slate-400">({filteredBatches.length} دفعة)</span>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              value={searchBatch}
              onChange={(e) => setSearchBatch(e.target.value)}
              placeholder="بحث برقم الدفعة أو البروفايل أو البيان..."
              className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 text-[11px] font-bold border-b border-slate-800">
              <tr>
                <th className="p-3">رقم الدفعة</th>
                <th className="p-3">البروفايل</th>
                <th className="p-3">سعر الكرت</th>
                <th className="p-3">العدد الكلي</th>
                <th className="p-3">المحقون</th>
                <th className="p-3">إجمالي القيمة</th>
                <th className="p-3">تاريخ التوليد</th>
                <th className="p-3">البيان / الموزع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredBatches.map((b) => (
                <tr key={b.batchId} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-mono text-indigo-300 font-bold">{b.batchId}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                      {b.profileName || 'Default'}
                    </span>
                  </td>
                  <td className="p-3 font-bold text-amber-400">{b.price} {currencySymbol}</td>
                  <td className="p-3">{b.totalGenerated}</td>
                  <td className="p-3">
                    <span className="text-emerald-400 font-bold">{b.totalSynced}</span>
                    <span className="text-slate-500 text-[10px]"> ({Math.round(((b.totalSynced || 0) / (b.totalGenerated || 1)) * 100)}%)</span>
                  </td>
                  <td className="p-3 font-black text-emerald-400">
                    {b.totalValue.toLocaleString()} {currencySymbol}
                  </td>
                  <td className="p-3 text-[11px] text-slate-400">
                    {new Date(b.createdAt).toLocaleDateString('ar-EG', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="p-3 text-[11px] text-slate-400 max-w-[150px] truncate" title={b.comment || '-'}>
                    {b.comment || '-'}
                  </td>
                </tr>
              ))}

              {filteredBatches.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    لا توجد دفعات مطابقة في السجل
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
