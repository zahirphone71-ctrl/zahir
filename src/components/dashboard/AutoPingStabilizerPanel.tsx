import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Gauge,
  Zap,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Sliders,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Power,
  Radio,
  Cpu
} from 'lucide-react';
import { useMikroTik } from '../../context/MikroTikContext';
import type { PingStabilizerMode, PingStabilizerState } from '../../context/mikrotikContextTypes';
import { formatBytes } from '../../lib/formatters';

const MODE_OPTIONS: Array<{
  id: PingStabilizerMode;
  label: string;
  hint: string;
}> = [
  { id: 'auto', label: 'تلقائي ذكي', hint: 'يضبط البينج والمعالج ديناميكياً حسب الحمل' },
  { id: 'aggressive', label: 'حماية قصوى', hint: 'أقل ضغط ممكن على الراوتر والبينج' },
  { id: 'balanced', label: 'متوازن', hint: 'تحديث أسرع مع حماية متوسطة للبينج' },
  { id: 'off', label: 'إيقاف', hint: 'بدون تدخل تلقائي في وتيرة الطلبات' }
];

const TARGET_PING_OPTIONS = [30, 45, 60, 100];

const STATE_META: Record<
  PingStabilizerState,
  { label: string; badgeClass: string; barClass: string; desc: string }
> = {
  optimal: {
    label: 'البينج مثالي ومستقر',
    badgeClass: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300',
    barClass: 'bg-emerald-500',
    desc: 'استجابة الراوتر سريعة واستهلاك المعالج في النطاق الآمن'
  },
  elevated: {
    label: 'ارتفاع طفيف — تنظيم نشط',
    badgeClass: 'bg-cyan-500/15 border-cyan-500/35 text-cyan-300',
    barClass: 'bg-cyan-400',
    desc: 'تم تهدئة وتيرة الطلبات قليلاً للحفاظ على استقرار البينج'
  },
  stabilizing: {
    label: 'جاري ضبط البينج تلقائياً',
    badgeClass: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    barClass: 'bg-amber-400',
    desc: 'تم تقليص التوازي إلى طلب واحد وإيقاف الاستعلامات الثقيلة مؤقتاً'
  },
  critical: {
    label: 'درع الحماية القصوى للبينج',
    badgeClass: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
    barClass: 'bg-rose-500',
    desc: 'تم تفعيل أقصى تهدئة لحماية الراوتر واستعادة انخفاض البينج فوراً'
  }
};

export const AutoPingStabilizerPanel: React.FC = () => {
  const {
    router,
    isConnected,
    pingStabilizer,
    isOptimizingPing,
    refreshPingStabilizer,
    updatePingStabilizerConfig,
    optimizePingNow,
    toggleQosFastLane,
    activeRealtimeFrequencySec
  } = useMikroTik();

  const [isUpdatingConfig, setIsUpdatingConfig] = useState(false);
  const [isTogglingQos, setIsTogglingQos] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    refreshPingStabilizer(false).catch(() => {});
  }, [isConnected, refreshPingStabilizer]);

  const state: PingStabilizerState = pingStabilizer?.state || 'optimal';
  const meta = STATE_META[state] || STATE_META.optimal;

  const ewmaPing = pingStabilizer?.ewmaPingMs || router?.pingMs || 0;
  const currentPing = pingStabilizer?.currentPingMs || router?.pingMs || 0;
  const jitterMs = pingStabilizer?.jitterMs ?? 0;
  const packetLoss = pingStabilizer?.packetLossPercent ?? 0;
  const cpuLoad = pingStabilizer?.cpuLoad ?? router?.cpuLoad ?? 0;
  const mode: PingStabilizerMode = pingStabilizer?.mode || 'auto';
  const targetPingMs = pingStabilizer?.targetPingMs || 45;
  const maxConcurrent = pingStabilizer?.recommendedMaxConcurrent ?? 2;
  const pacingMs = pingStabilizer?.recommendedPacingMs ?? 20;
  const wsSec = pingStabilizer?.recommendedWsIntervalMs
    ? Math.round((pingStabilizer.recommendedWsIntervalMs / 1000) * 10) / 10
    : activeRealtimeFrequencySec;
  const qos = pingStabilizer?.qosFastLane;
  const qosActive = Boolean(qos?.active);

  const historyBars = useMemo(() => {
    const items = pingStabilizer?.history || [];
    if (items.length === 0) return [];
    const maxVal = Math.max(targetPingMs * 1.5, ...items.map((h) => h.pingMs), 20);
    return items.slice(-18).map((item) => ({
      ...item,
      heightPct: Math.max(12, Math.min(100, Math.round((item.pingMs / maxVal) * 100)))
    }));
  }, [pingStabilizer?.history, targetPingMs]);

  const handleModeChange = async (nextMode: PingStabilizerMode) => {
    if (!isConnected || isUpdatingConfig || nextMode === mode) return;
    setIsUpdatingConfig(true);
    try {
      await updatePingStabilizerConfig({ mode: nextMode });
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleTargetChange = async (nextTarget: number) => {
    if (!isConnected || isUpdatingConfig || nextTarget === targetPingMs) return;
    setIsUpdatingConfig(true);
    try {
      await updatePingStabilizerConfig({ targetPingMs: nextTarget });
    } finally {
      setIsUpdatingConfig(false);
    }
  };

  const handleOptimizeNow = async () => {
    if (!isConnected || isOptimizingPing) return;
    await optimizePingNow({ count: 3, applyQos: false });
  };

  const handleToggleQos = async () => {
    if (!isConnected || isTogglingQos) return;
    setIsTogglingQos(true);
    try {
      await toggleQosFastLane(!qosActive, true);
    } finally {
      setIsTogglingQos(false);
    }
  };

  const pingValueColor =
    ewmaPing === 0
      ? 'text-slate-300'
      : ewmaPing <= targetPingMs
      ? 'text-emerald-400'
      : ewmaPing <= targetPingMs * 1.6
      ? 'text-amber-400'
      : 'text-rose-400';

  return (
    <section
      id="auto-ping-stabilizer-panel"
      className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4"
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-slate-100">
                منظّم البينج والمعالج التلقائي (Auto-Ping Stabilizer)
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[11px] font-bold ${meta.badgeClass}`}
              >
                {state === 'critical' || state === 'stabilizing' ? (
                  <ShieldAlert className="w-3.5 h-3.5" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>{meta.label}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{meta.desc}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            id="btn-optimize-ping-now"
            onClick={handleOptimizeNow}
            disabled={!isConnected || isOptimizingPing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isOptimizingPing ? 'animate-spin' : ''}`} />
            <span>{isOptimizingPing ? 'جاري الفحص والضبط...' : 'فحص وضبط البينج الآن'}</span>
          </button>

          <button
            type="button"
            id="btn-toggle-qos-fastlane"
            onClick={handleToggleQos}
            disabled={!isConnected || isTogglingQos}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${
              qosActive
                ? 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/45 text-emerald-200'
                : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700 text-slate-200'
            }`}
            title="ينشئ قواعد Mangle + Queue Tree بأولوية 1 لحزم ICMP و DNS و TCP ACK وإدارة المايكروتك بدون تكرار"
          >
            {isTogglingQos ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : qosActive ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>
              {qosActive
                ? 'مسار أولوية البينج مُفعّل بالراوتر (QoS P1)'
                : 'تفعيل أولوية البينج بالراوتر (QoS Fast-Lane)'}
            </span>
          </button>
        </div>
      </div>

      {/* Live Telemetry Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              متوسط البينج
            </span>
            <span className="font-mono text-[10px] text-slate-500" dir="ltr">
              الهدف ≤{targetPingMs}ms
            </span>
          </div>
          <div className={`text-lg font-extrabold font-mono tabular-nums ${pingValueColor}`} dir="ltr">
            {ewmaPing > 0 ? `${ewmaPing} ms` : '--'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono tabular-nums mt-0.5" dir="ltr">
            Live: {currentPing > 0 ? `${currentPing}ms` : '--'}
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Radio className="w-3.5 h-3.5 text-indigo-400" />
              التذبذب (Jitter)
            </span>
          </div>
          <div
            className={`text-lg font-extrabold font-mono tabular-nums ${
              jitterMs > 25 ? 'text-rose-400' : jitterMs > 12 ? 'text-amber-400' : 'text-emerald-400'
            }`}
            dir="ltr"
          >
            {jitterMs} ms
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {jitterMs <= 12 ? 'اتصال ثابت جداً' : jitterMs <= 25 ? 'تذبذب متوسط' : 'تذبذب مرتفع'}
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              فقدان الحزم
            </span>
          </div>
          <div
            className={`text-lg font-extrabold font-mono tabular-nums ${
              packetLoss > 5 ? 'text-rose-400' : packetLoss > 0 ? 'text-amber-400' : 'text-emerald-400'
            }`}
            dir="ltr"
          >
            {packetLoss}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {packetLoss === 0 ? 'بدون فقدان حزم' : 'تم خفض معدل الطلبات'}
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              ضغط المعالج
            </span>
          </div>
          <div
            className={`text-lg font-extrabold font-mono tabular-nums ${
              cpuLoad >= 75 ? 'text-rose-400' : cpuLoad >= 55 ? 'text-amber-400' : 'text-blue-400'
            }`}
            dir="ltr"
          >
            {cpuLoad}%
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {pingStabilizer?.suppressHeavyTelemetry ? 'إيقاف الاستعلام الثقيل' : 'المراقبة خفيفة'}
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              التنظيم الآلي
            </span>
          </div>
          <div className="text-sm font-extrabold font-mono text-slate-100 tabular-nums" dir="ltr">
            {maxConcurrent} slot • {wsSec}s
          </div>
          <div className="text-[10px] text-slate-500 font-mono tabular-nums mt-1" dir="ltr">
            Pacing: {pacingMs}ms
          </div>
        </div>

        <div className="bg-slate-950/80 border border-slate-800/90 rounded-2xl p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              QoS بالراوتر
            </span>
          </div>
          <div
            className={`text-sm font-extrabold ${qosActive ? 'text-emerald-400' : 'text-slate-400'}`}
          >
            {qosActive ? `نشط (${qos?.mangleRulesCount || 0}M + ${qos?.queueRulesCount || 0}Q)` : 'غير مفعّل'}
          </div>
          <div className="text-[10px] text-slate-500 font-mono tabular-nums mt-1" dir="ltr">
            {qosActive && qos
              ? `${qos.fastLanePackets.toLocaleString()} pkt • ${formatBytes(qos.fastLaneBytes || 0, 0)}`
              : 'Priority 1 ICMP/DNS/ACK'}
          </div>
        </div>
      </div>

      {/* Controls + Sparkline + Recent Automatic Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 pt-1">
        {/* Mode & Target Ping Controls */}
        <div className="xl:col-span-5 bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              وضع التنظيم التلقائي للبينج
            </span>
            {mode === 'off' && (
              <span className="text-[10px] text-amber-400 flex items-center gap-1">
                <Power className="w-3 h-3" />
                متوقف
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {MODE_OPTIONS.map((opt) => {
              const active = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!isConnected || isUpdatingConfig}
                  onClick={() => handleModeChange(opt.id)}
                  title={opt.hint}
                  className={`px-2.5 py-2 rounded-xl border text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 ${
                    active
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200 shadow-xs'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/70">
            <span className="text-[11px] text-slate-400 font-medium">حد البينج المستهدف:</span>
            <div className="flex items-center gap-1.5">
              {TARGET_PING_OPTIONS.map((ms) => {
                const active = targetPingMs === ms;
                return (
                  <button
                    key={ms}
                    type="button"
                    disabled={!isConnected || isUpdatingConfig}
                    onClick={() => handleTargetChange(ms)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-bold transition-all cursor-pointer disabled:opacity-50 ${
                      active
                        ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                    dir="ltr"
                  >
                    {ms}ms
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mini Ping History Sparkline */}
        <div className="xl:col-span-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-200">منحنى استجابة البينج</span>
            <span className="text-[10px] font-mono text-slate-500" dir="ltr">
              {pingStabilizer && pingStabilizer.samplesCount > 0
                ? `${pingStabilizer.minPingMs}-${pingStabilizer.maxPingMs}ms`
                : 'بانتظار القياس'}
            </span>
          </div>

          <div className="h-16 flex items-end gap-1 pt-2">
            {historyBars.length > 0 ? (
              historyBars.map((bar, idx) => {
                const color =
                  bar.pingMs <= targetPingMs
                    ? 'bg-emerald-500/80'
                    : bar.pingMs <= targetPingMs * 1.6
                    ? 'bg-amber-400/85'
                    : 'bg-rose-500/90';
                return (
                  <div
                    key={`${bar.timestamp}-${idx}`}
                    className="flex-1 h-full flex items-end"
                    title={`Ping: ${bar.pingMs}ms | Jitter: ${bar.jitterMs}ms | CPU: ${bar.cpuLoad}%`}
                  >
                    <div
                      className={`w-full rounded-t-sm transition-all duration-300 ${color}`}
                      style={{ height: `${bar.heightPct}%` }}
                    />
                  </div>
                );
              })
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500">
                {isConnected ? 'جاري جمع عينات البينج الخفيفة...' : 'اتصل بالراوتر لبدء قياس البينج'}
              </div>
            )}
          </div>
        </div>

        {/* Automatic Actions Log */}
        <div className="xl:col-span-4 bg-slate-950/70 border border-slate-800/80 rounded-2xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-200">سجل قرارات التنظيم التلقائي</span>
            <span className="text-[10px] text-slate-500">
              {pingStabilizer?.recentActions?.length || 0} إجراء
            </span>
          </div>
          <div className="space-y-1.5 max-h-20 overflow-y-auto pr-0.5">
            {pingStabilizer?.recentActions && pingStabilizer.recentActions.length > 0 ? (
              pingStabilizer.recentActions.slice(0, 4).map((act) => (
                <div
                  key={act.id}
                  className="flex items-start justify-between gap-2 text-[11px] bg-slate-900/70 border border-slate-800/70 rounded-lg px-2 py-1"
                >
                  <span className="text-slate-300 leading-snug">{act.message}</span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0" dir="ltr">
                    {new Date(act.timestamp).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-slate-500 py-2">
                يعمل المنظّم بصمت في الخلفية وسيُسجّل أي تهدئة تلقائية أو تعديل عند ارتفاع البينج أو المعالج.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
