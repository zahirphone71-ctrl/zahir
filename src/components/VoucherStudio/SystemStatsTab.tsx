import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ShieldCheck, Cpu, HardDrive, RefreshCw, Server, Lock
} from 'lucide-react';
import { RouterPrecheckInfo } from './types';
import { secureFetch, safeParseJson } from '../../lib/api';

interface DashboardStats {
  totalVouchers: number;
  activeVouchers: number;
  usedVouchers: number;
  syncedVouchers: number;
  unsyncedVouchers: number;
  totalBatches: number;
  databaseSizeBytes: number;
}

interface SystemStatsTabProps {
  precheck: RouterPrecheckInfo | null;
  onRefreshPrecheck: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const SystemStatsTab: React.FC<SystemStatsTabProps> = ({
  precheck,
  onRefreshPrecheck,
  showToast
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [vacuuming, setVacuuming] = useState(false);

  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const fetchStats = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await secureFetch('/api/vouchers/dashboard', {
        signal: controller.signal
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success && data.data) {
        setStats(data.data);
      } else if (!res.ok) {
        showToast(data.error || `فشل جلب الإحصائيات (${res.status})`, 'error');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Failed to fetch dashboard stats:', err);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleVacuum = async () => {
    setVacuuming(true);
    try {
      const res = await secureFetch('/api/vouchers/maintenance/vacuum', {
        method: 'POST'
      });
      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast('تمت صيانة وفهرسة وضغط قاعدة البيانات بنجاح', 'success');
        fetchStats();
      } else {
        showToast(data.error || `فشلت الصيانة (${res.status})`, 'error');
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast('خطأ: ' + err.message, 'error');
      }
    } finally {
      if (isMountedRef.current) setVacuuming(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6 text-right font-sans" dir="rtl">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <span>نظام الأمان الخماسي وصحة السيرفر (5-Layer Zero Collision)</span>
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm mt-1.5">
            مراقبة الأداء الحي، فحص استهلاك الرام والمعالج للراوتر، وضمان انعدام تكرار الأكواد نهائياً
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => {
              fetchStats();
              onRefreshPrecheck();
            }}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>تحديث البيانات</span>
          </button>

          <button
            type="button"
            onClick={handleVacuum}
            disabled={vacuuming}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <HardDrive className={`w-4 h-4 ${vacuuming ? 'animate-pulse' : ''}`} />
            <span>ضغط وصيانة القاعدة</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
          <div className="text-[11px] text-slate-400">إجمالي الكروت</div>
          <div className="text-xl font-black text-white font-mono">
            {stats ? stats.totalVouchers.toLocaleString() : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
          <div className="text-[11px] text-emerald-400">الكروت المتاحة</div>
          <div className="text-xl font-black text-emerald-400 font-mono">
            {stats ? stats.activeVouchers.toLocaleString() : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
          <div className="text-[11px] text-blue-400">الكروت المستخدمة</div>
          <div className="text-xl font-black text-blue-400 font-mono">
            {stats ? stats.usedVouchers.toLocaleString() : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
          <div className="text-[11px] text-indigo-400">الكروت المتزامنة</div>
          <div className="text-xl font-black text-indigo-400 font-mono">
            {stats ? stats.syncedVouchers.toLocaleString() : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
          <div className="text-[11px] text-amber-400">إجمالي الدفعات</div>
          <div className="text-xl font-black text-amber-400 font-mono">
            {stats ? stats.totalBatches.toLocaleString() : '...'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center space-y-1">
          <div className="text-[11px] text-slate-400">حجم قاعدة البيانات</div>
          <div className="text-xl font-black text-slate-200 font-mono">
            {stats ? formatBytes(stats.databaseSizeBytes) : '...'}
          </div>
        </div>
      </div>

      {/* Router Hardware Health Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-base font-black text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-indigo-400" />
          <span>مواصفات وموارد راوتر المايكروتك المتصل (RouterOS Hardware)</span>
        </h3>

        {precheck?.routerInfo ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-bold">طراز الجهاز (Model)</div>
              <div className="text-sm font-black text-white font-mono mt-1">
                {precheck.routerInfo.boardName}
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-bold">إصدار النظام (RouterOS)</div>
              <div className="text-sm font-black text-amber-300 font-mono mt-1">
                v{precheck.routerInfo.version}
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-bold">ضغط المعالج (CPU Load)</div>
              <div className="text-sm font-black text-emerald-400 font-mono mt-1 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                <span>{precheck.routerInfo.cpuLoad}%</span>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-bold">الذاكرة الحرة (Free RAM)</div>
              <div className="text-sm font-black text-indigo-400 font-mono mt-1">
                {formatBytes(precheck.routerInfo.freeMemory)}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950 p-4 rounded-xl text-slate-400 text-xs">
            الراوتر غير متصل حالياً — النظام يعمل في وضع المعاينة والتوليد المحلي.
          </div>
        )}
      </div>

      {/* 5-Layer Security Architecture Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <h3 className="text-base font-black text-white flex items-center gap-2">
          <Lock className="w-5 h-5 text-amber-400" />
          <span>آلية الحماية الخماسية لمنع تكرار الكروت وتصادم الأكواد</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-black text-sm">
              <span className="w-5 h-5 rounded-full bg-indigo-900/60 flex items-center justify-center text-xs">1</span>
              <span>توليد تشفيري حقيقي (crypto.randomBytes)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              استخدام مولد الأرقام العشوائية التشفيري في Node.js بإنتروبيا 256-بت، مما يضمن أماناً فائقاً واستحالة التنبؤ بالأكواد.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-black text-sm">
              <span className="w-5 h-5 rounded-full bg-indigo-900/60 flex items-center justify-center text-xs">2</span>
              <span>حساب الطول الآمن (Birthday Paradox Engine)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              خوارزمية رياضية متقدمة لاحتساب الحد الأدنى لطول الكود بناءً على كمية الدفعة لتقليل احتمالية التصادم الرياضي إلى أقل من 1 بالمليار.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-black text-sm">
              <span className="w-5 h-5 rounded-full bg-indigo-900/60 flex items-center justify-center text-xs">3</span>
              <span>أقفال التزامن (Mutex Concurrency Locks)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              منع عمليات التوليد المتزامنة في نفس اللحظة عبر قفل المعالجة العام، مما يمنع التوليد المتوازي المتداخل.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-black text-sm">
              <span className="w-5 h-5 rounded-full bg-indigo-900/60 flex items-center justify-center text-xs">4</span>
              <span>معاملات ذرية وفهرسة فريدة (Atomic DB Index)</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              فهرس فريد (UNIQUE Index) على عمود الأكواد، ومعاملة حفظ دفعة كاملة (Transaction) تلغي العملية تلقائياً عند أي خطأ.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
