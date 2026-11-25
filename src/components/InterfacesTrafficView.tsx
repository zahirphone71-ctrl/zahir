import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  FileDown,
  Zap,
  ShieldCheck,
  Pause,
  Play
} from 'lucide-react';
import { formatBytes, formatBps } from '../lib/formatters';
import { PdfExportModal } from './PdfExportModal';

export const InterfacesTrafficView: React.FC = () => {
  const {
    interfaces,
    syncNow,
    lastSyncTime,
    isRealtimeWsConnected,
    realtimeSyncMode,
    setRealtimeSyncMode,
    realtimeFrequency,
    setRealtimeFrequency,
    activeRealtimeFrequencySec,
    isResourceSaving,
    triggerRealtimeSync
  } = useMikroTik();
  const [selectedInterface, setSelectedInterface] = useState<string>(() => interfaces[0]?.name || '');
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (interfaces.length > 0 && (!selectedInterface || !interfaces.some((i) => i.name === selectedInterface))) {
      setSelectedInterface(interfaces[0].name);
    }
  }, [interfaces, selectedInterface]);

  const currentIface = interfaces.find((i) => i.name === selectedInterface) || interfaces[0];

  const rxRateMb = currentIface ? Number((currentIface.rxBps / 1000000).toFixed(2)) : 0;
  const txRateMb = currentIface ? Number((currentIface.txBps / 1000000).toFixed(2)) : 0;

  // Aggregate network bandwidth throughput across all active interfaces
  const totalNetworkRx = interfaces.reduce((acc, i) => acc + (Number(i.rxBps) || 0), 0);
  const totalNetworkTx = interfaces.reduce((acc, i) => acc + (Number(i.txBps) || 0), 0);

  // Bounded per-interface history map so switching interfaces doesn't mix readings
  const [historyByIface, setHistoryByIface] = useState<Record<string, Array<{ ts: number; time: string; rx: number; tx: number }>>>({});
  const currentIfaceName = currentIface?.name || '';

  useEffect(() => {
    if (!currentIfaceName) return;
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistoryByIface((prev) => {
      const existing = prev[currentIfaceName] || [];
      const nextList = [...existing, { ts: now, time: timeStr, rx: rxRateMb, tx: txRateMb }].slice(-15);
      // Prune deleted interfaces to keep cache strictly bounded
      const validNames = new Set(interfaces.map((i) => i.name));
      const nextMap: Record<string, Array<{ ts: number; time: string; rx: number; tx: number }>> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (validNames.has(k)) nextMap[k] = v;
      }
      nextMap[currentIfaceName] = nextList;
      return nextMap;
    });
  }, [lastSyncTime, currentIfaceName, rxRateMb, txRateMb, interfaces]);

  const chartHistory = historyByIface[currentIfaceName] || [];

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      triggerRealtimeSync(true);
      await syncNow(true).catch(() => {});
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setIsRefreshing(false);
      }, 450);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <Activity className="w-6 h-6 text-blue-400" />
            <span>مراقبة حركة المنافذ والشبكة (Interface Traffic Monitor)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            متابعة حية لسرعات الاستقبال (Rx) والإرسال (Tx) لكل منفذ إيثرنت أو لاسلكي في ZCtrl لحظة بلحظة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-blue-500 flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-600/20 active:scale-95 disabled:opacity-50"
            title="تحديث فوري لبيانات الترافيك الآن"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث الآن</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPdfModalOpen(true)}
            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-rose-500/30 flex items-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
            title="تصدير بيانات المنافذ والترافيك كتقرير PDF"
          >
            <FileDown className="w-4 h-4 text-rose-400" />
            <span>تصدير تقرير PDF</span>
          </button>
        </div>
      </div>

      {/* Real-Time Auto-Synchronization & Variable-Frequency Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg backdrop-blur-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Engine Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="relative flex h-2.5 w-2.5">
              {realtimeSyncMode === 'paused' ? (
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              ) : isRealtimeWsConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </>
              ) : (
                <>
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                </>
              )}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              {realtimeSyncMode === 'paused'
                ? 'المزامنة الحية متوقفة'
                : isRealtimeWsConnected
                ? 'بث مباشر عبر WebSockets'
                : 'استطلاع ذكي متكيف'}
            </span>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md" dir="ltr">
              {activeRealtimeFrequencySec}s
            </span>
          </div>

          {/* Aggregate Network Speed Badges */}
          <div className="flex items-center gap-2 text-xs font-mono" dir="ltr">
            <div className="px-2.5 py-1 rounded-lg bg-blue-950/50 border border-blue-500/20 text-blue-300 flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5 text-blue-400" />
              <span>Total Rx: {formatBps(totalNetworkRx)}</span>
            </div>
            <div className="px-2.5 py-1 rounded-lg bg-emerald-950/50 border border-emerald-500/20 text-emerald-300 flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span>Total Tx: {formatBps(totalNetworkTx)}</span>
            </div>
          </div>
        </div>

        {/* Variable-Frequency Selectors & Resource Shield */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
          {isResourceSaving && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg" title="يتم تقليل تردد الاستعلام تلقائياً عند الانتقال لتبويب آخر لحماية معالج المايكروتك">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>توفير الموارد نشط</span>
            </div>
          )}

          <div className="flex items-center bg-slate-950/90 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency('auto');
              }}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                realtimeFrequency === 'auto' && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تردد متغير ذكي يتكيف تلقائياً مع حركة الترافيك (1.5 - 3 ثوانٍ)"
            >
              <Zap className="w-3 h-3 inline-block ml-1 text-amber-400" />
              <span>تلقائي ذكي</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency(1);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all font-mono font-medium cursor-pointer ${
                realtimeFrequency === 1 && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تحديث فوري عالي السرعة كل 1 ثانية"
            >
              1s
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency(2);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all font-mono font-medium cursor-pointer ${
                realtimeFrequency === 2 && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تحديث متوازن كل 2 ثانية"
            >
              2s
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency(5);
              }}
              className={`px-2.5 py-1 rounded-lg transition-all font-mono font-medium cursor-pointer ${
                realtimeFrequency === 5 && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تحديث هادئ كل 5 ثوانٍ"
            >
              5s
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode(realtimeSyncMode === 'paused' ? 'hybrid' : 'paused');
              }}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                realtimeSyncMode === 'paused'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
              title={realtimeSyncMode === 'paused' ? 'استئناف المزامنة الحية' : 'إيقاف مؤقت للمزامنة الحية'}
            >
              {realtimeSyncMode === 'paused' ? (
                <span className="flex items-center gap-1">
                  <Play className="w-3 h-3 fill-current" />
                  <span>استئناف</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Pause className="w-3 h-3" />
                  <span>إيقاف</span>
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Interfaces Grid Selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.isArray(interfaces) && interfaces.length > 0 ? (
          interfaces.map((iface) => {
            const isSelected = selectedInterface === iface.name;
            return (
              <button
                key={iface.id || iface.name}
                onClick={() => setSelectedInterface(iface.name)}
                className={`p-4 rounded-2xl border text-right transition-all flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold font-mono" dir="ltr">{iface.name || 'Interface'}</span>
                  <span className={`w-2 h-2 rounded-full ${iface.disabled ? 'bg-rose-500' : 'bg-emerald-400 animate-pulse'}`} />
                </div>

                <div className="mt-3 space-y-1 text-xs font-mono" dir="ltr">
                  <div className="text-blue-400 flex items-center gap-1">
                    <ArrowDownLeft className="w-3 h-3" />
                    <span>Rx: {formatBps(Number(iface.rxBps) || 0)}</span>
                  </div>
                  <div className="text-emerald-400 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" />
                    <span>Tx: {formatBps(Number(iface.txBps) || 0)}</span>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="col-span-full py-6 text-center text-slate-500 text-xs">
            لم يتم العثور على منافذ شبكة متصلة
          </div>
        )}
      </div>

      {/* Active Interface Live Table Log (Replacing charts) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              <span>سجل القراءات الحية للمنفذ:</span>
              <span className="font-mono text-blue-400 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20" dir="ltr">
                {currentIface?.name}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">سجل تفصيلي دقيق لكل فترات القياس الحية</p>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono" dir="ltr">
            <div className="p-2 rounded-xl bg-blue-950/60 border border-blue-500/30 text-blue-300 flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-blue-400" />
              <span>Download: {currentIface ? formatBps(currentIface.rxBps) : '0 bps'}</span>
            </div>
            <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              <span>Upload: {currentIface ? formatBps(currentIface.txBps) : '0 bps'}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto bg-slate-950/80 rounded-xl border border-slate-800">
          <table className="w-full text-right text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 text-[11px] border-b border-slate-800">
              <tr>
                <th className="p-3">وقت القياس</th>
                <th className="p-3">سرعة التحميل (Download Rx)</th>
                <th className="p-3">سرعة الرفع (Upload Tx)</th>
                <th className="p-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {chartHistory.slice(-6).reverse().map((pt, i) => (
                <tr key={`${pt.ts}-${i}`} className="hover:bg-slate-900/40 transition-colors">
                  <td className="p-3 text-slate-400">{pt.time}</td>
                  <td className="p-3 text-blue-400 font-bold">{pt.rx} Mbps</td>
                  <td className="p-3 text-emerald-400 font-bold">{pt.tx} Mbps</td>
                  <td className={`p-3 font-medium ${currentIface?.disabled ? 'text-rose-400' : currentIface?.running ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {currentIface?.disabled ? 'معطل' : currentIface?.running ? 'نشط مستقر' : 'غير متصل'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">إجمالي المستلم (Total Rx)</span>
            <span className="font-mono font-bold text-slate-200 text-sm" dir="ltr">
              {currentIface ? formatBytes(currentIface.rxBytes) : '0 B'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">إجمالي المرسل (Total Tx)</span>
            <span className="font-mono font-bold text-slate-200 text-sm" dir="ltr">
              {currentIface ? formatBytes(currentIface.txBytes) : '0 B'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">نوع المنفذ (Type)</span>
            <span className="font-mono font-bold text-indigo-400 text-sm uppercase" dir="ltr">
              {currentIface?.type || '—'}
            </span>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
            <span className="text-slate-400 block mb-1">الحالة الفعلية (Status)</span>
            <span className={`font-semibold text-sm flex items-center gap-1.5 ${
              currentIface?.disabled ? 'text-rose-400' : currentIface?.running ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                currentIface?.disabled ? 'bg-rose-400' : currentIface?.running ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              {currentIface?.disabled
                ? 'معطل (Disabled)'
                : currentIface?.running
                ? 'متصل نشط (Running)'
                : 'غير متصل (Link Down)'}
            </span>
          </div>
        </div>
      </div>

      {/* Formatted Interfaces Traffic PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="traffic"
      />
    </div>
  );
};
