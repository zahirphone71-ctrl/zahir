import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMikroTik } from '../../context/MikroTikContext';
import { formatBytes } from '../../lib/formatters';
import {
  Cpu,
  Database,
  Activity,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Thermometer,
  RotateCcw
} from 'lucide-react';

export type ResourceChartMode = 'combined' | 'cpu' | 'ram';

interface ResourceDataPoint {
  time: string;
  timestamp: number;
  cpu: number;
  ramPercent: number;
  freeRamMb: number;
  usedRamMb: number;
  totalRamMb: number;
  temperature?: number;
}

export const RouterResourcesMonitor: React.FC = () => {
  const {
    router,
    isConnected,
    lastSyncTime,
    ecoMode,
    setEcoMode,
    thermalShieldActive,
    syncNow,
    runCommand,
    showToast
  } = useMikroTik();

  const [chartMode, setChartMode] = useState<ResourceChartMode>('combined');
  const [isFlushingDns, setIsFlushingDns] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Compute Current Metrics from real router hardware
  const cpuLoad = router?.cpuLoad ?? 0;
  const totalRamBytes = router?.totalMemory || 0;
  const freeRamBytes = router?.freeMemory || 0;
  const usedRamBytes = totalRamBytes > freeRamBytes ? totalRamBytes - freeRamBytes : 0;
  const ramUsagePercent = totalRamBytes > 0 ? Math.min(100, Math.round((usedRamBytes / totalRamBytes) * 100)) : 0;
  const cpuTemperature = router?.cpuTemperature ?? router?.boardTemperature;

  const totalRamMb = totalRamBytes > 0 ? Math.round(totalRamBytes / (1024 * 1024)) : 0;
  const freeRamMb = freeRamBytes > 0 ? Math.round(freeRamBytes / (1024 * 1024)) : 0;
  const usedRamMb = usedRamBytes > 0 ? Math.round(usedRamBytes / (1024 * 1024)) : 0;

  // Threshold Constants (85% Critical Limit for CPU/RAM as required)
  const CPU_SAFE_LIMIT = 70;
  const CPU_CRITICAL_LIMIT = 85;
  const RAM_SAFE_LIMIT = 75;
  const RAM_CRITICAL_LIMIT = 85;

  // Real-time Historic Buffer (Keeps last 20 readings to protect browser RAM & prevent leaks)
  const [history, setHistory] = useState<ResourceDataPoint[]>(() => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return [
      {
        time: timeStr,
        timestamp: now.getTime(),
        cpu: cpuLoad,
        ramPercent: ramUsagePercent,
        freeRamMb,
        usedRamMb,
        totalRamMb,
        temperature: cpuTemperature
      }
    ];
  });

  // Track Peak Values
  const peakCpu = useMemo(() => {
    return history.reduce((max, pt) => Math.max(max, pt.cpu), cpuLoad);
  }, [history, cpuLoad]);

  const peakRamPercent = useMemo(() => {
    return history.reduce((max, pt) => Math.max(max, pt.ramPercent), ramUsagePercent);
  }, [history, ramUsagePercent]);

  // Average Values
  const avgCpu = useMemo(() => {
    if (history.length === 0) return cpuLoad;
    const sum = history.reduce((acc, pt) => acc + pt.cpu, 0);
    return Math.round(sum / history.length);
  }, [history, cpuLoad]);

  const avgRam = useMemo(() => {
    if (history.length === 0) return ramUsagePercent;
    const sum = history.reduce((acc, pt) => acc + pt.ramPercent, 0);
    return Math.round(sum / history.length);
  }, [history, ramUsagePercent]);

  // Update history on every sync tick
  useEffect(() => {
    if (!isConnected) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setHistory((prev) => {
      // Prevent duplicate points if timestamp is within 2 seconds
      const lastPoint = prev[prev.length - 1];
      if (lastPoint && now.getTime() - lastPoint.timestamp < 2000) {
        return prev;
      }

      const nextPoint: ResourceDataPoint = {
        time: timeStr,
        timestamp: now.getTime(),
        cpu: cpuLoad,
        ramPercent: ramUsagePercent,
        freeRamMb,
        usedRamMb,
        totalRamMb,
        temperature: cpuTemperature
      };

      const updated = [...prev, nextPoint];
      return updated.slice(-20); // Keep max 20 samples (Memory safe)
    });
  }, [lastSyncTime, isConnected, cpuLoad, ramUsagePercent, freeRamMb, usedRamMb, totalRamMb, cpuTemperature]);

  // Safe Status Evaluators
  const isCpuCritical = cpuLoad >= CPU_CRITICAL_LIMIT;
  const isCpuElevated = cpuLoad >= CPU_SAFE_LIMIT && cpuLoad < CPU_CRITICAL_LIMIT;

  const isRamCritical = ramUsagePercent >= RAM_CRITICAL_LIMIT;
  const isRamElevated = ramUsagePercent >= RAM_SAFE_LIMIT && ramUsagePercent < RAM_CRITICAL_LIMIT;

  const isOverallSafe = !isCpuCritical && !isCpuElevated && !isRamCritical && !isRamElevated;

  // Actions
  const handleQuickFlushDns = async () => {
    setIsFlushingDns(true);
    try {
      const res = await runCommand('/ip dns cache flush');
      if (!isMountedRef.current) return;
      if (res.success) {
        showToast('تم تفريغ وحذف كاش الـ DNS بنجاح لتخفيف الذاكرة RAM', 'success');
        await syncNow();
      } else {
        showToast(res.output || 'تعذر تفريغ كاش الـ DNS', 'error');
      }
    } catch {
      if (isMountedRef.current) {
        showToast('خطأ أثناء تنفيذ تفريغ الكاش', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsFlushingDns(false);
      }
    }
  };

  const handleManualRefresh = async () => {
    setIsManualSyncing(true);
    try {
      await syncNow(true);
      if (isMountedRef.current) {
        showToast('تم تحديث قراءات استهلاك موارد الراوتر لحظياً', 'info');
      }
    } finally {
      if (isMountedRef.current) {
        setIsManualSyncing(false);
      }
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
      {/* 1. Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/30 text-blue-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>مراقبة استهلاك موارد الراوتر (CPU / RAM Live Monitor)</span>
                {isOverallSafe ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    ضمن الحدود الآمنة
                  </span>
                ) : isCpuCritical || isRamCritical ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20 animate-pulse">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    تجاوز الحدود الآمنة!
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    منطقة الحمل المرتفع
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                <span>معالج CPU: {cpuLoad}%</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>الذاكرة RAM: {ramUsagePercent}% ({formatBytes(usedRamBytes, 0)})</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>الحرارة: {cpuTemperature ? `${cpuTemperature}°C` : 'غير مدعوم بالراوتر'}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span>الحد الآمن الأقصى: 70%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls & Mode Switcher */}
        <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center">
          {/* Chart Mode Switcher */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => setChartMode('combined')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                chartMode === 'combined'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="عرض استهلاك المعالج والذاكرة معاً"
            >
              عرض مدمج
            </button>
            <button
              type="button"
              onClick={() => setChartMode('cpu')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                chartMode === 'cpu'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="عرض مخطط المعالج فقط"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>المعالج (CPU)</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode('ram')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                chartMode === 'ram'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="عرض مخطط الذاكرة فقط"
            >
              <Database className="w-3.5 h-3.5" />
              <span>الذاكرة (RAM)</span>
            </button>
          </div>

          {/* Quick DNS Cache Flush Action (Frees Router Memory) */}
          <button
            type="button"
            onClick={handleQuickFlushDns}
            disabled={isFlushingDns || !isConnected}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            title="تفريغ ذاكرة التخزين المؤقت للـ DNS لتحرير الذاكرة RAM فوراً"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-indigo-400 ${isFlushingDns ? 'animate-spin' : ''}`} />
            <span>تفريغ كاش DNS</span>
          </button>

          {/* Thermal Shield / Eco Mode Toggle */}
          <button
            type="button"
            onClick={() => setEcoMode(!ecoMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              ecoMode || thermalShieldActive
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 shadow-sm'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={ecoMode ? 'درع التبريد وحفظ طاقة المايكروتك نشط' : 'تفعيل درع التبريد التلقائي لخفض الحرارة واللود'}
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${ecoMode || thermalShieldActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
            <span>{ecoMode || thermalShieldActive ? 'درع التبريد نشط ✓' : 'تفعيل التبريد'}</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isManualSyncing || !isConnected}
            className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            title="تحديث البيانات لحظياً"
          >
            <RefreshCw className={`w-4 h-4 ${isManualSyncing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Real-Time Actual Metrics History Table (Replacing charts with real numerical logging) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs px-1 text-slate-400">
          <span className="font-bold text-slate-200">سجل القراءات الحية المباشرة (Real-Time Metrics Log)</span>
          <span className="font-mono text-[11px] text-slate-500">تحديث مستمر من الراوتر</span>
        </div>

        <div className="bg-slate-950/85 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="p-3">وقت القراءة</th>
                  {chartMode !== 'ram' && <th className="p-3">معالج CPU (%)</th>}
                  {chartMode !== 'cpu' && <th className="p-3">استهلاك RAM (%)</th>}
                  {chartMode !== 'cpu' && <th className="p-3">الذاكرة الحرة المتبقية</th>}
                  <th className="p-3">الحالة التشغيلية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
                {history.slice(-6).reverse().map((pt, i) => (
                  <tr key={pt.timestamp || i} className="hover:bg-slate-900/50 transition-colors">
                    <td className="p-3 text-slate-400">{pt.time}</td>
                    {chartMode !== 'ram' && (
                      <td className="p-3">
                        <span className={`font-bold px-2 py-0.5 rounded border ${pt.cpu >= 85 ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' : pt.cpu >= 70 ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'}`}>
                          {pt.cpu}%
                        </span>
                      </td>
                    )}
                    {chartMode !== 'cpu' && (
                      <td className="p-3">
                        <span className="text-indigo-400 font-bold">{pt.ramPercent}%</span> ({pt.usedRamMb} MB)
                      </td>
                    )}
                    {chartMode !== 'cpu' && (
                      <td className="p-3 text-emerald-400 font-bold">{pt.freeRamMb} MB</td>
                    )}
                    <td className="p-3">
                      {pt.cpu >= 85 || pt.ramPercent >= 85 ? (
                        <span className="text-rose-400 font-semibold">⚠️ حرج</span>
                      ) : pt.cpu >= 70 ? (
                        <span className="text-amber-400 font-semibold">⚡ مرتفع</span>
                      ) : (
                        <span className="text-emerald-400 font-semibold">✓ مستقر</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Real-Time Resource Gauges & Safety Health Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
        {/* CPU Health Card */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>حالة المعالج (CPU)</span>
            </div>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${
              isCpuCritical ? 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse' :
              isCpuElevated ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
              'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
            }`}>
              {cpuLoad}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  isCpuCritical ? 'bg-rose-500' : isCpuElevated ? 'bg-amber-500' : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, cpuLoad))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>الذروة: {peakCpu}%</span>
              <span>المتوسط: {avgCpu}%</span>
              <span>الحد الآمن: 70%</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isCpuCritical ? (
              <span className="text-rose-400 font-semibold">المعالج يتعرض لحمل حرج! درع التبريد يتولى إبطاء المزامنة تلقائياً.</span>
            ) : isCpuElevated ? (
              <span className="text-amber-400">الحمل مرتفع - يوصى بمراقبة قواعد الفايروول واليوزرات النشطة.</span>
            ) : (
              <span className="text-emerald-400">أداء المعالج ممتاز وبارد مع استهلاك طاقة مثالي.</span>
            )}
          </p>
        </div>

        {/* RAM Health Card */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>حالة الذاكرة (RAM)</span>
            </div>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${
              isRamCritical ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' :
              isRamElevated ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
              'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
            }`}>
              {ramUsagePercent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  isRamCritical ? 'bg-rose-500' : isRamElevated ? 'bg-amber-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, ramUsagePercent))}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>المستخدمة: {usedRamMb} MB</span>
              <span>الحرة: {freeRamMb} MB</span>
              <span>الإجمالي: {totalRamMb} MB</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isRamCritical ? (
              <span className="text-rose-400 font-semibold">استهلاك الذاكرة تجاوز 85%! يرجى تفريغ الكاش فوراً للتدخل السريع.</span>
            ) : isRamElevated ? (
              <span className="text-amber-400 font-semibold">الذاكرة تقترب من الحد الآمن (75%)، راقب استهلاك الجلسات.</span>
            ) : (
              <span className="text-slate-400">
                متاح <strong className="text-slate-200 font-mono">{freeRamMb} MB</strong> شاغرة لعمليات التوجيه والتخزين المؤقت.
              </span>
            )}
          </p>
        </div>

        {/* Thermal & Hardware Safety Guard Card */}
        <div className="bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
              <Thermometer className="w-4 h-4 text-emerald-400" />
              <span>الحرارة ودرع الأمان</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/30">
              {cpuTemperature ? `${cpuTemperature}°C` : 'غير مدعوم'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-300">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">درع التبريد (Zero-Heat):</span>
              <span className={ecoMode || thermalShieldActive ? 'text-emerald-400 font-bold' : 'text-slate-400 font-mono'}>
                {ecoMode || thermalShieldActive ? 'مُفعّل تلقائياً ✓' : 'جاهز للعمل'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">حماية المقبس (Pacing):</span>
              <span className="text-slate-200 font-mono text-[11px]">نشط (25ms فواصل)</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-[11px]">وضع توفير الطاقة:</span>
              <span className="text-slate-200 text-[11px]">إيقاف عند تصغير التبويب</span>
            </div>
          </div>

          <p className="text-[11px] text-emerald-400/90 leading-relaxed">
            محرك ZCtrl يضمن عدم سخونة المايكروتك بنسبة 100% ويحافظ على استهلاك RAM و CPU أدنى من الحدود الآمنة.
          </p>
        </div>
      </div>
    </div>
  );
};
