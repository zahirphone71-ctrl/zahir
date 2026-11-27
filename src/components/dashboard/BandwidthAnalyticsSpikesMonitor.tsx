import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouterTelemetry, useSubscribersState, useMikroTikActions } from '../../context/MikroTikContext';
import { ActiveHotspotUser } from '../../types/mikrotik';
import { formatBytes, formatBps } from '../../lib/formatters';
import { safeStorage } from '../../utils/safeStorage';
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Zap,
  ShieldAlert,
  UserX,
  Sliders,
  Volume2,
  VolumeX,
  Info,
  X,
  Gauge,
  RefreshCw
} from 'lucide-react';

interface TrafficPoint {
  ts: number;
  time: string;
  download: number; // in Mbps
  upload: number;   // in Mbps
  total: number;    // in Mbps
  spikesCount: number;
}

export interface SpikeSession extends ActiveHotspotUser {
  severity: 'critical' | 'high' | 'elevated';
  reason: string;
  spikeRateMbps: number;
  ratioToTotal: number;
}

interface BandwidthAnalyticsSpikesMonitorProps {
  onNavigateToSessions?: () => void;
  onNavigateToQueues?: () => void;
}

// Web Audio API Gentle Alert Chime (Zero external assets needed)
// Web Audio API Alert Chime (Completely silent by default)
function playSpikeAlertSound() {
  if (typeof window === 'undefined') return;
  try {
    if (safeStorage.getItem('zctrl_spike_sound') !== 'true') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(440, now);
    osc2.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);

    gainNode.gain.setValueAtTime(0.08, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.onended = () => {
      try {
        osc1.disconnect();
        osc2.disconnect();
        gainNode.disconnect();
        ctx.close().catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    };

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.26);
    osc2.stop(now + 0.26);
  } catch {
    // Ignore audio permission or storage errors
  }
}

export const BandwidthAnalyticsSpikesMonitor: React.FC<BandwidthAnalyticsSpikesMonitorProps> = () => {
  const { interfaces } = useRouterTelemetry();
  const { activeUsers } = useSubscribersState();
  const { kickUser, addQueue, syncNow, showToast } = useMikroTikActions();

  const [activeTab, setActiveTab] = useState<'wan_traffic' | 'top_consumers' | 'spikes_analytics'>('wan_traffic');
  const [spikeThresholdMbps, setSpikeThresholdMbps] = useState<number>(10);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && safeStorage.getItem('zctrl_spike_sound') === 'true';
    } catch {
      return false;
    }
  });
  const [dismissedSpikes, setDismissedSpikes] = useState<Set<string>>(new Set());
  const [selectedSessionForInspect, setSelectedSessionForInspect] = useState<ActiveHotspotUser | null>(null);
  const [throttleModalSession, setThrottleModalSession] = useState<ActiveHotspotUser | null>(null);
  const [throttleSpeedLimit, setThrottleSpeedLimit] = useState<string>('1M/2M');
  const [isThrottling, setIsThrottling] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isKickingId, setIsKickingId] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-detect WAN interface or use ether1 / first running
  const wanInterface = useMemo(() => {
    return (interfaces || []).find((i) =>
      i?.name?.toLowerCase().includes('wan') ||
      i?.name?.toLowerCase().includes('ether1') ||
      i?.name?.toLowerCase().includes('internet')
    ) || (interfaces || [])[0];
  }, [interfaces]);

  // Real-time live speeds (Mbps)
  const rxSpeedMbps = useMemo(() => {
    if (!wanInterface?.rxBps) return 0;
    return Number((wanInterface.rxBps / 1000000).toFixed(2));
  }, [wanInterface?.rxBps]);

  const txSpeedMbps = useMemo(() => {
    if (!wanInterface?.txBps) return 0;
    return Number((wanInterface.txBps / 1000000).toFixed(2));
  }, [wanInterface?.txBps]);

  // Rolling Traffic History
  const [trafficHistory, setTrafficHistory] = useState<TrafficPoint[]>(() => {
    const nowTs = Date.now();
    const initialTime = new Date(nowTs).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return [{
      ts: nowTs,
      time: initialTime,
      download: rxSpeedMbps,
      upload: txSpeedMbps,
      total: Number((rxSpeedMbps + txSpeedMbps).toFixed(2)),
      spikesCount: 0
    }];
  });

  // Track previous bytes across active users to calculate client-side rates if needed
  const prevUsersBytesRef = useRef<Map<string, { bytesIn: number; bytesOut: number; time: number }>>(new Map());
  const [userCalculatedRates, setUserCalculatedRates] = useState<Map<string, { rxBps: number; txBps: number; totalBps: number }>>(new Map());
  const lastCalculationTimeRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    // Throttle calculation to once every 3.5 seconds to prevent browser stutter and CPU freezing
    if (now - lastCalculationTimeRef.current < 3500 && userCalculatedRates.size > 0) {
      return;
    }
    lastCalculationTimeRef.current = now;

    const newRates = new Map<string, { rxBps: number; txBps: number; totalBps: number }>();
    const prevMap = prevUsersBytesRef.current;

    (activeUsers || []).forEach((u) => {
      if (!u) return;
      const key = `${u.user}_${u.address || u.id}`;
      const bytesIn = Number(u.bytesIn) || 0;
      const bytesOut = Number(u.bytesOut) || 0;

      const prev = prevMap.get(key);
      let rxBps = u.rxRateBps || 0;
      let txBps = u.txRateBps || 0;

      if (prev && prev.time > 0) {
        const elapsedSec = (now - prev.time) / 1000;
        if (elapsedSec > 0.5 && elapsedSec < 120) {
          const deltaOut = bytesOut - prev.bytesOut;
          const deltaIn = bytesIn - prev.bytesIn;
          if (deltaOut >= 0 && (!rxBps || rxBps === 0)) {
            rxBps = Math.round((deltaOut * 8) / elapsedSec);
          }
          if (deltaIn >= 0 && (!txBps || txBps === 0)) {
            txBps = Math.round((deltaIn * 8) / elapsedSec);
          }
        }
      }

      newRates.set(key, { rxBps, txBps, totalBps: rxBps + txBps });
      prevMap.set(key, { bytesIn, bytesOut, time: now });
    });

    // Prune stale disconnected sessions to prevent memory leakage over long runs
    if (prevMap.size > 100) {
      const activeKeys = new Set((activeUsers || []).map((u) => `${u?.user}_${u?.address || u?.id}`));
      for (const [k, v] of prevMap.entries()) {
        if (!activeKeys.has(k) || now - v.time > 120000) {
          prevMap.delete(k);
        }
      }
    }

    setUserCalculatedRates(newRates);
  }, [activeUsers]);

  // Abnormal Spikes Evaluation Engine
  const detectedSpikes = useMemo<SpikeSession[]>(() => {
    if (!activeUsers || activeUsers.length === 0) return [];

    const thresholdBps = spikeThresholdMbps * 1000000;
    const allSessions = activeUsers.filter(Boolean);

    // Calculate average rate
    let totalRateSum = 0;
    allSessions.forEach((u) => {
      const key = `${u.user}_${u.address || u.id}`;
      const rateObj = userCalculatedRates.get(key);
      const userRate = u.totalRateBps || rateObj?.totalBps || 0;
      totalRateSum += userRate;
    });
    const avgUserRate = allSessions.length > 0 ? totalRateSum / allSessions.length : 0;

    const results: SpikeSession[] = [];

    allSessions.forEach((u) => {
      const key = `${u.user}_${u.address || u.id}`;
      if (dismissedSpikes.has(key)) return;

      const rateObj = userCalculatedRates.get(key);
      const userRateBps = u.totalRateBps || rateObj?.totalBps || 0;
      const userRateMbps = Number((userRateBps / 1000000).toFixed(2));

      const isDirectThresholdSpike = userRateBps >= thresholdBps;
      const isStatisticalOutlier = allSessions.length >= 2 && userRateBps >= Math.max(5000000, avgUserRate * 3);

      // Volume surge: transferred > 2GB with uptime
      const totalBytes = (Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0);
      const isHeavyVolumeSurge = totalBytes > 2000000000 && userRateBps >= 4000000;

      if (isDirectThresholdSpike || isStatisticalOutlier || isHeavyVolumeSurge) {
        const severity: 'critical' | 'high' | 'elevated' =
          userRateBps >= 20000000 || userRateBps >= Math.max(20000000, avgUserRate * 4)
            ? 'critical'
            : userRateBps >= 10000000 || userRateBps >= avgUserRate * 2.5
            ? 'high'
            : 'elevated';

        let reason = '';
        if (isDirectThresholdSpike) {
          reason = `تجاوز سقف الباندويث المحدد (${userRateMbps} > ${spikeThresholdMbps} Mbps)`;
        } else if (isStatisticalOutlier) {
          reason = `استهلاك مضاعف (${(userRateBps / Math.max(1, avgUserRate)).toFixed(1)}x أضعاف متوسط باقي الجلسات)`;
        } else {
          reason = `حجم استهلاك ضخم ومستمر (${formatBytes(totalBytes)})`;
        }

        const wanTotalBps = (wanInterface?.rxBps || 0) + (wanInterface?.txBps || 0);
        const ratioToTotal = wanTotalBps > 0 ? Number(((userRateBps / wanTotalBps) * 100).toFixed(1)) : 0;

        results.push({
          ...u,
          severity,
          reason,
          spikeRateMbps: userRateMbps,
          ratioToTotal
        });
      }
    });

    return results.sort((a, b) => b.spikeRateMbps - a.spikeRateMbps);
  }, [activeUsers, spikeThresholdMbps, userCalculatedRates, dismissedSpikes, wanInterface]);

  // Audio Chime on Spike
  const prevSpikeCountRef = useRef(0);
  useEffect(() => {
    if (soundEnabled && detectedSpikes.length > prevSpikeCountRef.current && detectedSpikes.length > 0) {
      playSpikeAlertSound();
    }
    prevSpikeCountRef.current = detectedSpikes.length;
  }, [detectedSpikes.length, soundEnabled]);

  // Update Graph Point on sync or timer (Throttled to once every 4 seconds)
  const lastHistoryPointTimeRef = useRef<number>(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastHistoryPointTimeRef.current < 4000) return;
    lastHistoryPointTimeRef.current = now;

    const timeLabel = new Date(now).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setTrafficHistory((prev) => {
      const nextPoint: TrafficPoint = {
        ts: now,
        time: timeLabel,
        download: rxSpeedMbps,
        upload: txSpeedMbps,
        total: Number((rxSpeedMbps + txSpeedMbps).toFixed(2)),
        spikesCount: detectedSpikes.length
      };
      const updated = [...prev, nextPoint];
      return updated.slice(-16); // Keep last 16 points
    });
  }, [rxSpeedMbps, txSpeedMbps, detectedSpikes.length]);

  const spikeIdSet = useMemo(() => new Set(detectedSpikes.map((s) => s.id)), [detectedSpikes]);
  const spikeUserSet = useMemo(() => new Set(detectedSpikes.map((s) => s.user)), [detectedSpikes]);

  // Top Bandwidth Consumers
  const topConsumers = useMemo(() => {
    if (!activeUsers || activeUsers.length === 0) return [];
    return [...activeUsers]
      .filter(Boolean)
      .map((u) => {
        const key = `${u.user}_${u.address || u.id}`;
        const rateObj = userCalculatedRates.get(key);
        const userRateBps = u.totalRateBps || rateObj?.totalBps || 0;
        const totalTransferred = (Number(u.bytesIn) || 0) + (Number(u.bytesOut) || 0);
        return {
          ...u,
          rateBps: userRateBps,
          rateMbps: Number((userRateBps / 1000000).toFixed(2)),
          totalTransferred,
          isSpiking: spikeIdSet.has(u.id) || spikeUserSet.has(u.user)
        };
      })
      .sort((a, b) => (b.rateBps !== a.rateBps ? b.rateBps - a.rateBps : b.totalTransferred - a.totalTransferred))
      .slice(0, 8);
  }, [activeUsers, userCalculatedRates, spikeIdSet, spikeUserSet]);

  // Peak throughput tracking
  const peakThroughput = useMemo(() => {
    return trafficHistory.reduce((max, p) => Math.max(max, p.download + p.upload), 0);
  }, [trafficHistory]);

  // Keep dismissedSpikes strictly bounded (max 200 entries) during 24/7 monitoring sessions
  const addBoundedDismissedSpike = (key: string) => {
    setDismissedSpikes((prev) => {
      const next = new Set(prev);
      next.add(key);
      if (next.size > 200) {
        const excess = next.size - 200;
        let removed = 0;
        for (const oldKey of next) {
          next.delete(oldKey);
          if (++removed >= excess) break;
        }
      }
      return next;
    });
  };

  // Quick Action: Kick Spiking User
  const handleKickUser = async (u: ActiveHotspotUser) => {
    setIsKickingId(u.id);
    try {
      const res = await kickUser(u.id, u.user);
      if (!isMountedRef.current) return;
      if (res.success) {
        showToast(`تم طرد وفصل جلسة المشترك (${u.user}) بنجاح`, 'success');
        addBoundedDismissedSpike(`${u.user}_${u.address || u.id}`);
      } else {
        showToast(res.message || `تعذر فصل جلسة (${u.user})`, 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsKickingId(null);
      }
    }
  };

  // Quick Action: Apply Throttle Queue
  const handleApplyThrottle = async () => {
    if (!throttleModalSession) return;
    const rawAddr = (throttleModalSession.address || '').trim();
    if (!rawAddr) {
      showToast('تعذر تطبيق الخنق: لا يوجد عنوان IP مسجل لهذه الجلسة', 'error');
      return;
    }
    const cleanLimit = (throttleSpeedLimit || '').trim();
    if (!cleanLimit || !cleanLimit.includes('/')) {
      showToast('يرجى إدخال سقف سرعة صالح بصيغة Rx/Tx مثل 1M/2M', 'warning');
      return;
    }

    setIsThrottling(true);
    try {
      const queueName = `spike_limit_${throttleModalSession.user}_${Date.now().toString().slice(-4)}`;
      const targetIp = rawAddr.includes('/') ? rawAddr : `${rawAddr}/32`;

      const res = await addQueue({
        name: queueName,
        target: targetIp,
        maxLimit: cleanLimit,
        comment: `ZCtrl-Spike-Throttle|User:${throttleModalSession.user}|Limit:${cleanLimit}`
      });

      if (!isMountedRef.current) return;
      if (res.success) {
        showToast(`تم تطبيق تحديد السرعة (${cleanLimit}) على المشترك (${throttleModalSession.user}) بنجاح`, 'success');
        addBoundedDismissedSpike(`${throttleModalSession.user}_${throttleModalSession.address || throttleModalSession.id}`);
        setThrottleModalSession(null);
        await syncNow();
      } else {
        showToast(res.message || 'فشل إضافة قاعدة تحديد السرعة في المايكروتك', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsThrottling(false);
      }
    }
  };

  const handleDismissSpike = (key: string) => {
    addBoundedDismissedSpike(key);
    showToast('تم تجاهل تنبيه هذه الجلسة مؤقتاً', 'info');
  };

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    try {
      safeStorage.setItem('zctrl_spike_sound', String(nextVal));
    } catch {
      // Ignore storage quota / private mode error
    }
    if (nextVal) {
      playSpikeAlertSound();
      showToast('تم تفعيل التنبيه الصوتي عند حدوث قفزات الباندويث', 'info');
    } else {
      showToast('تم كتم التنبيه الصوتي', 'info');
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncNow(true);
      if (isMountedRef.current) {
        showToast('تم تحديث بيانات الباندويث والجلسات من المايكروتك بنجاح', 'success');
      }
    } finally {
      if (isMountedRef.current) {
        setIsRefreshing(false);
      }
    }
  };

  return (
    <div className="space-y-4 w-full max-w-full">
      {/* 1. Abnormal Spikes Admin Alert Banner (شريط تنبيه الطوارئ والاستهلاك غير الطبيعي) */}
      {detectedSpikes.length > 0 ? (
        <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-rose-950/70 border-2 border-rose-500/50 rounded-3xl p-4 sm:p-5 shadow-2xl relative overflow-hidden animate-in fade-in-50 duration-300">
          {/* Subtle Ambient Pulse Background */}
          <div className="absolute top-0 right-0 w-80 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none -mr-10 -mt-10" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-rose-500/30">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0 animate-pulse shadow-lg shadow-rose-950/50">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-rose-200">
                    تنبيه المسؤول: رصد استهلاك غير طبيعي للباندويث (Bandwidth Spikes)
                  </h3>
                  <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-500/50">
                    {detectedSpikes.length} {detectedSpikes.length === 1 ? 'جلسة حرجة' : 'جلسات حرجة'}
                  </span>
                </div>
                <p className="text-xs text-rose-300/80 mt-0.5">
                  تم اكتشاف قفزات سحب بيانات مفرطة تتجاوز حد الأمان ({spikeThresholdMbps} Mbps) أو تشكل عبئاً شاذاً على سرعة باقي المشتركين
                </p>
              </div>
            </div>

            {/* Quick Controls in Alert Banner */}
            <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
              {/* Sound Toggle */}
              <button
                type="button"
                onClick={toggleSound}
                title={soundEnabled ? 'كتم صوت التنبيه' : 'تشغيل صوت التنبيه'}
                className={`p-2 rounded-xl border text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  soundEnabled
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-sm'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                <span className="text-[11px] hidden sm:inline">{soundEnabled ? 'الصوت مفعل' : 'صامت'}</span>
              </button>

              {/* Threshold Selector Dropdown */}
              <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-300">
                <Sliders className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[11px] text-slate-400">حساسية الحد:</span>
                <select
                  value={spikeThresholdMbps}
                  onChange={(e) => setSpikeThresholdMbps(Number(e.target.value))}
                  className="bg-transparent font-bold text-rose-300 font-mono focus:outline-none cursor-pointer text-xs"
                >
                  <option value={5} className="bg-slate-900 text-white">5 Mbps</option>
                  <option value={10} className="bg-slate-900 text-white">10 Mbps</option>
                  <option value={15} className="bg-slate-900 text-white">15 Mbps</option>
                  <option value={20} className="bg-slate-900 text-white">20 Mbps</option>
                  <option value={30} className="bg-slate-900 text-white">30 Mbps</option>
                  <option value={50} className="bg-slate-900 text-white">50 Mbps</option>
                </select>
              </div>
            </div>
          </div>

          {/* List of Detected Spiking Sessions with Immediate Mitigation */}
          <div className="mt-3.5 space-y-2.5 max-h-60 overflow-y-auto custom-scrollbar">
            {detectedSpikes.map((spike) => {
              const sessionKey = `${spike.user}_${spike.address || spike.id}`;
              const isKicking = isKickingId === spike.id;

              return (
                <div
                  key={sessionKey}
                  className="bg-slate-950/80 border border-rose-500/30 rounded-2xl p-3 sm:p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md hover:border-rose-500/50 transition-all"
                >
                  {/* Session Profile & Metrics */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 font-bold text-xs">
                      ⚡
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-100 font-mono text-sm" dir="ltr">
                          {spike.user}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20" dir="ltr">
                          {spike.address}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 hidden lg:inline" dir="ltr">
                          MAC: {spike.macAddress}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            spike.severity === 'critical'
                              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                              : 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          }`}
                        >
                          {spike.severity === 'critical' ? '🔴 قفزة حرجة' : '🟠 استهلاك مفرط'}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs mt-1 text-slate-400 flex-wrap">
                        <span className="text-rose-400 font-bold font-mono">
                          معدل السحب: {spike.spikeRateMbps} Mbps
                        </span>
                        <span>•</span>
                        <span className="text-slate-300">
                          {spike.reason}
                        </span>
                        {spike.ratioToTotal > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 font-mono text-[11px]">
                              يستهلك {spike.ratioToTotal}% من الباندويث الكلي
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span className="text-slate-400 text-[11px] font-mono">
                          مدة الاتصال: {spike.uptime}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Immediate Action Buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 flex-wrap">
                    {/* Inspect Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedSessionForInspect(spike)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5 text-blue-400" />
                      <span>فحص وتفاصيل</span>
                    </button>

                    {/* Throttle Button */}
                    <button
                      type="button"
                      onClick={() => setThrottleModalSession(spike)}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      <span>خنق السرعة</span>
                    </button>

                    {/* Kick Button */}
                    <button
                      type="button"
                      disabled={isKicking}
                      onClick={() => handleKickUser(spike)}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-rose-900/30 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <UserX className={`w-3.5 h-3.5 ${isKicking ? 'animate-spin' : ''}`} />
                      <span>{isKicking ? 'جاري الطرد...' : 'طرد وفصل'}</span>
                    </button>

                    {/* Dismiss Button */}
                    <button
                      type="button"
                      onClick={() => handleDismissSpike(sessionKey)}
                      title="تجاهل التنبيه مؤقتاً"
                      className="p-1.5 rounded-xl text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Reassuring Stable Status Pill when no spikes */
        <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold text-emerald-300">
              حالة استهلاك الباندويث مستقرة وآمنة
            </span>
            <span className="text-slate-400 hidden sm:inline">
              — جميع الجلسات الـ ({activeUsers.length}) تعمل ضمن الحدود المقبولة دون رصد قفزات شاذة (سقف الأمان: {spikeThresholdMbps} Mbps)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              className={`p-1.5 rounded-lg border text-xs cursor-pointer ${
                soundEnabled
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title={soundEnabled ? 'كتم صوت التنبيه' : 'تشغيل صوت التنبيه'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            <select
              value={spikeThresholdMbps}
              onChange={(e) => setSpikeThresholdMbps(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-300 font-mono cursor-pointer"
              title="تعديل حساسية كشف القفزات"
            >
              <option value={5}>حد: 5 Mbps</option>
              <option value={10}>حد: 10 Mbps</option>
              <option value={15}>حد: 15 Mbps</option>
              <option value={20}>حد: 20 Mbps</option>
              <option value={30}>حد: 30 Mbps</option>
            </select>
          </div>
        </div>
      )}

      {/* 2. Bandwidth Analytics & Graph Command Center (لوحة تحليل حركة الباندويث والرسم البياني) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-xl backdrop-blur-md relative overflow-hidden">
        {/* Header Strip with View Modes & Metrics */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Gauge className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                  <span>تحليل استهلاك الباندويث المباشر (Bandwidth Analytics)</span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" dir="ltr">
                    {wanInterface?.name || 'WAN'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  رسم بياني حي لمعدل سحب وإرسال البيانات، ومراقبة الجلسات الأكثر استهلاكاً وكشف القفزات غير الطبيعية
                </p>
              </div>
            </div>
          </div>

          {/* Quick Real-Time Metrics Strip */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            {/* Download Rate */}
            <div className="px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5 text-cyan-400" />
              <span>Rx: <strong>{wanInterface ? formatBps(wanInterface.rxBps) : '0 bps'}</strong></span>
            </div>

            {/* Upload Rate */}
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tx: <strong>{wanInterface ? formatBps(wanInterface.txBps) : '0 bps'}</strong></span>
            </div>

            {/* Peak Throughput */}
            <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center gap-1.5 hidden sm:flex">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span>الذروة: <strong>{peakThroughput.toFixed(1)} Mbps</strong></span>
            </div>

            {/* Manual Refresh Button */}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
              title="تحديث البيانات فورياً من المايكروتك"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Switcher for Chart Views */}
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('wan_traffic')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'wan_traffic'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>معدل مرور المنفذ (WAN Live)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('top_consumers')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'top_consumers'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>أعلى الجلسات استهلاكاً ({topConsumers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('spikes_analytics')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'spikes_analytics'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>تحليل القفزات والذروة</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              تحميل (Rx)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              رفع (Tx)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-0.5 bg-rose-400"></span>
              سقف القفزة ({spikeThresholdMbps}M)
            </span>
          </div>
        </div>

        {/* 3. Dynamic Charts View Canvas */}
        <div className="w-full">
          {activeTab === 'wan_traffic' && (
            <div className="overflow-x-auto bg-slate-950/80 rounded-xl border border-slate-800">
              <table className="w-full text-right text-xs font-mono">
                <thead className="bg-slate-900 text-slate-400 text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">وقت القياس</th>
                    <th className="p-3">تحميل WAN (Rx)</th>
                    <th className="p-3">رفع WAN (Tx)</th>
                    <th className="p-3">الإجمالي</th>
                    <th className="p-3">حالة السقف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {trafficHistory.slice(-6).reverse().map((pt, i) => (
                    <tr key={`${pt.ts}-${i}`} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 text-slate-400">{pt.time}</td>
                      <td className="p-3 text-cyan-400 font-bold">{pt.download.toFixed(2)} Mbps</td>
                      <td className="p-3 text-emerald-400 font-bold">{pt.upload.toFixed(2)} Mbps</td>
                      <td className="p-3 text-slate-200 font-bold">{pt.total.toFixed(2)} Mbps</td>
                      <td className="p-3">
                        {pt.download >= spikeThresholdMbps || pt.upload >= spikeThresholdMbps ? (
                          <span className="text-rose-400 font-bold">⚠️ تجاوز السقف</span>
                        ) : (
                          <span className="text-emerald-400">✓ طبيعي</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'top_consumers' && (
            <div className="space-y-3">
              {topConsumers.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  لا توجد جلسات نشطة حالياً لقياس استهلاكها
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto custom-scrollbar">
                  {topConsumers.map((c, idx) => (
                    <div
                      key={c.id || idx}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        c.isSpiking
                          ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs font-mono shrink-0 ${
                          idx === 0
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : idx === 1
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          #{idx + 1}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold font-mono text-sm text-slate-100 truncate" dir="ltr">
                              {c.user}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300" dir="ltr">
                              {c.address}
                            </span>
                            {c.isSpiking && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                قفزة
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                            <span>سرعة: <strong className="text-cyan-400">{c.rateMbps} Mbps</strong></span>
                            <span>•</span>
                            <span>إجمالي: {formatBytes(c.totalTransferred)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Quick 1-click actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setSelectedSessionForInspect(c)}
                          title="فحص الجلسة"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5 text-blue-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setThrottleModalSession(c)}
                          title="خنق وتحديد السرعة"
                          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKickUser(c)}
                          title="طرد وفصل"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
                        >
                          <UserX className="w-3.5 h-3.5 text-rose-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'spikes_analytics' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 text-right">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>حالة القفزات المرصودة</span>
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="text-xl font-black font-mono text-slate-100">
                    {detectedSpikes.length} {detectedSpikes.length === 1 ? 'جلسة' : 'جلسات'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {detectedSpikes.length > 0 ? 'تتطلب تدخلاً فورياً لحماية الخدمة' : 'جميع الجلسات ضمن المعدل الطبيعي'}
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 text-right">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>ذروة السرعة المسجلة</span>
                    <Zap className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-xl font-black font-mono text-purple-300">
                    {peakThroughput.toFixed(2)} Mbps
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    أقصى حمل لحظي تم رصده في هذه الجلسة
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 text-right">
                  <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
                    <span>سقف حساسية التنبيه</span>
                    <Sliders className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-xl font-black font-mono text-blue-300">
                    {spikeThresholdMbps} Mbps
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    أي جلسة تتجاوز هذا المعدل ترسل تنبيهاً فورياً
                  </div>
                </div>
              </div>

              {/* Session Speed Rankings Table (Replacing BarChart) */}
              <div className="overflow-x-auto bg-slate-950/80 rounded-xl border border-slate-800 mt-3">
                <table className="w-full text-right text-xs font-mono">
                  <thead className="bg-slate-900 text-slate-400 text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">المستخدم / الجلسة</th>
                      <th className="p-3">عنوان IP</th>
                      <th className="p-3">سرعة الاستهلاك (Mbps)</th>
                      <th className="p-3">حالة القفزة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {topConsumers.slice(0, 6).map((c, idx) => (
                      <tr key={c.id || idx} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-3 font-bold text-white" dir="ltr">{c.user}</td>
                        <td className="p-3 text-slate-400" dir="ltr">{c.address}</td>
                        <td className="p-3 text-cyan-400 font-bold">{c.rateMbps} Mbps</td>
                        <td className="p-3">
                          {c.rateMbps >= spikeThresholdMbps ? (
                            <span className="text-rose-400 font-bold">⚠️ متجاوز للسقف</span>
                          ) : (
                            <span className="text-emerald-400">✓ ضمن الطبيعي</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Deep Session Inspection Modal (نافذة فحص وتحليل الجلسة) */}
      {selectedSessionForInspect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in-50 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl relative text-right space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    تقرير فحص الجلسة النشطة
                  </h3>
                  <span className="text-xs font-mono text-slate-400" dir="ltr">
                    User: {selectedSessionForInspect.user}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSessionForInspect(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">عنوان IP:</span>
                <span className="font-bold text-blue-400 font-mono text-sm" dir="ltr">
                  {selectedSessionForInspect.address}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">عنوان الماك MAC:</span>
                <span className="font-bold text-slate-200 font-mono text-[11px]" dir="ltr">
                  {selectedSessionForInspect.macAddress || 'غير محدد'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">مدة الاتصال (Uptime):</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {selectedSessionForInspect.uptime}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">طريقة الدخول:</span>
                <span className="font-bold text-slate-300 font-mono">
                  {selectedSessionForInspect.loginBy || 'HTTP-CHAP'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">إجمالي التحميل (Bytes-Out):</span>
                <span className="font-bold text-cyan-400 font-mono">
                  {formatBytes(selectedSessionForInspect.bytesOut)}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">إجمالي الرفع (Bytes-In):</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {formatBytes(selectedSessionForInspect.bytesIn)}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const s = selectedSessionForInspect;
                  setSelectedSessionForInspect(null);
                  setThrottleModalSession(s);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all cursor-pointer"
              >
                تطبيق خنق السرعة (Throttle)
              </button>

              <button
                type="button"
                onClick={() => {
                  const s = selectedSessionForInspect;
                  setSelectedSessionForInspect(null);
                  handleKickUser(s);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-rose-900/30"
              >
                طرد وفصل الجلسة الآن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Throttle Speed Modal (نافذة تحديد وخنق السرعة للمشترك) */}
      {throttleModalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in-50 duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl relative text-right space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    خنق وتحديد سرعة الجلسة
                  </h3>
                  <span className="text-xs text-slate-400 font-mono" dir="ltr">
                    Target: {throttleModalSession.address} ({throttleModalSession.user})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setThrottleModalSession(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              سيتم إنشاء قاعدة تحديد سرعة فورية (Simple Queue) في المايكروتك لتقييد استهلاك الـ IP الخاص بهذا المشترك دون فصل اتصاله.
            </p>

            {/* Speed Limit Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                اختر سقف السرعة المسموح (Max Limit - Rx/Tx):
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'خنق شديد (512k/1M)', value: '512k/1M' },
                  { label: 'متوسط (1M/2M)', value: '1M/2M' },
                  { label: 'متوازن (2M/4M)', value: '2M/4M' },
                  { label: 'خفيف (4M/8M)', value: '4M/8M' }
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setThrottleSpeedLimit(preset.value)}
                    className={`p-2.5 rounded-xl border text-xs font-mono font-bold transition-all text-center cursor-pointer ${
                      throttleSpeedLimit === preset.value
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                أو اكتب حد سرعة مخصص (مثل 256k/512k):
              </label>
              <input
                type="text"
                value={throttleSpeedLimit}
                onChange={(e) => setThrottleSpeedLimit(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono text-left focus:outline-none focus:border-amber-500"
                dir="ltr"
              />
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setThrottleModalSession(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={isThrottling}
                onClick={handleApplyThrottle}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg shadow-amber-900/30 disabled:opacity-50"
              >
                {isThrottling ? 'جاري التطبيق على المايكروتك...' : 'تطبيق خنق السرعة الآن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
