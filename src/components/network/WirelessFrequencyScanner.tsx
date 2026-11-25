import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMikroTik } from '../../context/MikroTikContext';
import {
  ChannelInterferenceMetric,
  WirelessScanResult
} from '../../types/mikrotik';
import { secureFetch } from '../../lib/api';
import {
  Radio,
  Wifi,
  Activity,
  Signal,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  Check,
  Info,
  Clock,
  Layers,
  ArrowRight,
  BarChart3
} from 'lucide-react';

interface WirelessFrequencyScannerProps {
  initialInterfaceName?: string;
  onNavigateBack?: () => void;
  onChannelApplied?: () => void;
}

type ChartMetricMode = 'signal' | 'interference' | 'both';

export const WirelessFrequencyScanner: React.FC<WirelessFrequencyScannerProps> = ({
  initialInterfaceName,
  onNavigateBack,
  onChannelApplied
}) => {
  const {
    wirelessInterfaces,
    fetchWirelessData,
    isConnected,
    showToast
  } = useMikroTik();

  // State
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [selectedBand, setSelectedBand] = useState<'2ghz' | '5ghz'>('2ghz');
  const [scanDuration, setScanDuration] = useState<number>(3);
  const [chartMode, setChartMode] = useState<ChartMetricMode>('signal');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<WirelessScanResult | null>(null);
  const [selectedChannelDetail, setSelectedChannelDetail] = useState<ChannelInterferenceMetric | null>(null);
  const [networkSearchQuery, setNetworkSearchQuery] = useState<string>('');
  const [isApplyingChannel, setIsApplyingChannel] = useState<boolean>(false);
  const [applyWidth, setApplyWidth] = useState<string>('20/40mhz');
  const [confirmModalChannel, setConfirmModalChannel] = useState<ChannelInterferenceMetric | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const applyAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Set default interface
  useEffect(() => {
    if (wirelessInterfaces && wirelessInterfaces.length > 0) {
      if (initialInterfaceName && wirelessInterfaces.some((w) => w.name === initialInterfaceName)) {
        setSelectedInterface(initialInterfaceName);
      } else if (!selectedInterface) {
        setSelectedInterface(wirelessInterfaces[0].name);
      }
    }
  }, [wirelessInterfaces, initialInterfaceName, selectedInterface]);

  // Current interface object
  const currentIfaceObj = useMemo(() => {
    return wirelessInterfaces.find((w) => w.name === selectedInterface) || wirelessInterfaces[0];
  }, [wirelessInterfaces, selectedInterface]);

  // Auto-set band based on interface configuration
  useEffect(() => {
    if (currentIfaceObj?.band) {
      const b = currentIfaceObj.band.toLowerCase();
      if (b.includes('5ghz')) {
        setSelectedBand('5ghz');
      } else {
        setSelectedBand('2ghz');
      }
    }
  }, [currentIfaceObj]);

  // Execute Frequency & Channel Scan
  const handleStartScan = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsScanning(true);
    setScanResult(null);
    setSelectedChannelDetail(null);

    try {
      const res = await secureFetch('/api/mikrotik/wireless/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          iface: selectedInterface || currentIfaceObj?.name || 'wlan1',
          duration: scanDuration,
          band: selectedBand
        })
      });

      const data = await res.json();
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (res.ok && data.success) {
        setScanResult(data);
        if (data.bestChannel) {
          const matched = data.channels?.find(
            (c: ChannelInterferenceMetric) => c.channelNumber === data.bestChannel.channelNumber
          );
          if (matched) setSelectedChannelDetail(matched);
        }
        showToast(
          (data.networksCount && data.networksCount > 0)
            ? `اكتمل مسح الأثير الحقيقي: تم رصد ${data.networksCount} شبكة محيطة`
            : 'اكتمل مسح الأثير الحقيقي بنجاح: لم يتم رصد أي شبكات مشوشة في المحيط حالياً',
          'success'
        );
      } else {
        showToast(data.message || 'فشل تنفيذ أمر مسح الترددات', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast(err?.message || 'تعذر إجراء فحص الترددات في الوقت الحالي', 'error');
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setIsScanning(false);
      }
    }
  };

  // Cleanup scanning/applying AbortControllers on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (applyAbortRef.current) applyAbortRef.current.abort();
    };
  }, []);

  // Apply chosen channel directly to MikroTik interface
  const handleApplyChannel = async (channel: ChannelInterferenceMetric) => {
    if (applyAbortRef.current) applyAbortRef.current.abort();
    const controller = new AbortController();
    applyAbortRef.current = controller;

    setIsApplyingChannel(true);
    try {
      const res = await secureFetch('/api/mikrotik/wireless/apply-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          iface: selectedInterface || currentIfaceObj?.name || 'wlan1',
          frequency: channel.frequency,
          channelWidth: applyWidth
        })
      });

      const data = await res.json();
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (res.ok && data.success) {
        showToast(data.message || `تم ضبط القناة ${channel.channelNumber} (${channel.frequency} MHz) بنجاح`, 'success');
        setConfirmModalChannel(null);
        await fetchWirelessData();
        if (isMountedRef.current) onChannelApplied?.();
      } else {
        showToast(data.message || 'فشل تطبيق القناة على الواجهة', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast('تعذر تطبيق التردد على الراوتر', 'error');
    } finally {
      if (isMountedRef.current && !controller.signal.aborted) {
        setIsApplyingChannel(false);
      }
    }
  };

  // Filtered networks list
  const filteredNetworks = useMemo(() => {
    if (!scanResult?.networks) return [];
    const q = networkSearchQuery.trim().toLowerCase();
    if (!q) return scanResult.networks;
    return scanResult.networks.filter(
      (n) =>
        n.ssid?.toLowerCase().includes(q) ||
        n.bssid?.toLowerCase().includes(q) ||
        String(n.frequency).includes(q) ||
        n.radioName?.toLowerCase().includes(q)
    );
  }, [scanResult, networkSearchQuery]);

  // Color helper based on interference score
  // Green = least congested / cleanest
  // Red = most congested / crowded
  const getChannelColorStyle = (channel: ChannelInterferenceMetric) => {
    const score = channel.interferenceScore;
    if (score <= 28) {
      return {
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        barGradient: 'from-emerald-600 via-emerald-500 to-teal-400',
        border: 'border-emerald-500/40',
        badge: 'bg-emerald-500 text-white',
        statusLabel: 'نقية وخالية من التشويش (الأفضل للبث)',
        category: 'clean'
      };
    }
    if (score <= 52) {
      return {
        text: 'text-cyan-400',
        bg: 'bg-cyan-500/10',
        barGradient: 'from-cyan-600 via-blue-500 to-indigo-400',
        border: 'border-cyan-500/40',
        badge: 'bg-cyan-500 text-white',
        statusLabel: 'جيدة ومستقرة',
        category: 'good'
      };
    }
    if (score <= 74) {
      return {
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        barGradient: 'from-amber-600 via-amber-500 to-yellow-400',
        border: 'border-amber-500/40',
        badge: 'bg-amber-500 text-white',
        statusLabel: 'متوسطة التشويش والتداخل',
        category: 'moderate'
      };
    }
    return {
      text: 'text-rose-500',
      bg: 'bg-rose-500/15',
      barGradient: 'from-red-600 via-rose-500 to-pink-500',
      border: 'border-rose-500/60',
      badge: 'bg-rose-600 text-white animate-pulse',
      statusLabel: 'مزدحمة جداً بتشويش قوي (تجنبها)',
      category: 'congested'
    };
  };

  // Convert dBm signal (-105 to -30 dBm) to a visual height percentage (10% to 100%)
  const signalToHeightPercent = (sigDbm: number | undefined) => {
    if (sigDbm === undefined || sigDbm <= -105) return 8; // base floor
    // -30 dBm is 100%, -100 dBm is 10%
    const clamped = Math.max(-105, Math.min(-30, sigDbm));
    const percent = Math.round(((clamped - (-105)) / (-30 - (-105))) * 92) + 8;
    return percent;
  };

  const currentFreqNum = currentIfaceObj?.frequency ? parseInt(String(currentIfaceObj.frequency), 10) : undefined;

  return (
    <div className="space-y-6 text-right animate-in fade-in-50 duration-300" dir="rtl" id="wireless-frequency-scanner">
      {/* 1. Header Banner & Action Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/70 to-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-48 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div className="flex items-start sm:items-center gap-4">
            {onNavigateBack && (
              <button
                type="button"
                onClick={onNavigateBack}
                className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer shrink-0 active:scale-95"
                title="الرجوع لقسم الوايرلس"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            )}

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30 border border-indigo-400/40 shrink-0">
              <Radio className="w-7 h-7 animate-pulse" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  ماسح الترددات وكشف التشويش
                </h2>
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  /interface wireless scan
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  رسم بياني ذكي
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
                رسم بياني يوضح قوة الإشارة ونسبة التشويش لكل قناة، مع تمييز القنوات الأكثر ازدحاماً باللون الأحمر والأقل تشويشاً باللون الأخضر لاختيار أفضل قناة للبث.
              </p>
            </div>
          </div>

          {/* Scanner Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center">
            {/* Interface Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300">
              <Wifi className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="text-slate-500 font-bold text-[10px]">الواجهة:</span>
              <select
                value={selectedInterface}
                onChange={(e) => setSelectedInterface(e.target.value)}
                className="bg-transparent border-0 text-white font-mono font-bold focus:outline-none cursor-pointer text-xs"
              >
                {wirelessInterfaces.length === 0 ? (
                  <option value="wlan1">wlan1 (افتراضي)</option>
                ) : (
                  wirelessInterfaces.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name} ({w.ssid || 'SSID'})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Band Selector */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => setSelectedBand('2ghz')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  selectedBand === '2ghz'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2.4 GHz
              </button>
              <button
                type="button"
                onClick={() => setSelectedBand('5ghz')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                  selectedBand === '5ghz'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                5 GHz
              </button>
            </div>

            {/* Scan Duration Selector */}
            <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={scanDuration}
                onChange={(e) => setScanDuration(Number(e.target.value))}
                className="bg-transparent border-0 text-slate-300 focus:outline-none cursor-pointer text-xs font-medium"
              >
                <option value={3}>3 ثوانٍ</option>
                <option value={5}>5 ثوانٍ</option>
                <option value={8}>8 ثوانٍ (معمق)</option>
              </select>
            </div>

            {/* Start Scan Button */}
            <button
              type="button"
              onClick={handleStartScan}
              disabled={isScanning || !isConnected || !wirelessInterfaces || wirelessInterfaces.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                !isConnected
                  ? 'يتطلب اتصالاً حقيقياً بالراوتر لمنع العمليات الوهمية'
                  : !wirelessInterfaces || wirelessInterfaces.length === 0
                  ? 'لا توجد كروت وايرلس في هذا الراوتر'
                  : 'بدء مسح الترددات الحقيقي'
              }
            >
              <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'جاري مسح الأثير الحقيقي...' : 'مسح الترددات الحقيقي'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Protective Guard: Prevent Fake / Disconnected Operations */}
      {!isConnected && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3.5 text-xs text-rose-200">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block text-rose-300">الراوتر غير متصل — تم تعطيل المسح لمنع العمليات والبيانات الوهمية:</span>
            <p className="text-rose-200/90 leading-relaxed">
              وفقاً لمعايير ZCtrl الصارمة لمنع أي عمليات وهمية أو بيانات مصطنعة، يتطلب مسح طيف الترددات اتصالاً حقيقياً ومباشراً بجهاز مايكروتك فعلي يحتوي على كرت راديو لاسلكي لتنفيذ أمر <code className="font-mono bg-rose-950/80 px-1 py-0.5 rounded text-white">/interface wireless scan</code> على الأثير الحقيقي.
            </p>
          </div>
        </div>
      )}

      {/* Protective Guard: Physical Wireless Interface Required */}
      {isConnected && (!wirelessInterfaces || wirelessInterfaces.length === 0) && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5 text-xs text-amber-200">
          <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block text-amber-300">لا توجد واجهات وايرلس لاسلكية (No Wireless Interfaces):</span>
            <p className="text-amber-200/90 leading-relaxed">
              راوتر المايكروتك المتصل لا يحتوي على بطاقات راديو فيزيائية مثبتة (مثل أجهزة Cloud Hosted Router / x86 الافتراضية). يمنع البرنامج أي مسح وهمي للترددات دون وجود كرت وايرلس حقيقي (مثل wlan1 أو wlan2).
            </p>
          </div>
        </div>
      )}

      {/* 2. Top Summary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Best Recommended Channel Hero Card */}
        <div className="col-span-1 sm:col-span-2 p-5 rounded-2xl bg-gradient-to-tr from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/40 shadow-xl relative overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-1">
                <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
                <span>أفضل قناة مقترحة للبث الآن (Cleanest Channel)</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-white font-mono">
                  قناة {scanResult?.bestChannel?.channelNumber ?? (selectedBand === '2ghz' ? 6 : 36)}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-300 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30">
                  {scanResult?.bestChannel?.frequency ?? (selectedBand === '2ghz' ? 2437 : 5180)} MHz
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500 text-white">
                  أقل تشويش
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {scanResult?.bestChannel?.reason || 'أقل تشويش، قناة قياسية غير متداخلة، أقل عدد شبكات متنافسة في محيط الموقع'}
              </p>
            </div>

            {scanResult?.bestChannel && (
              <button
                type="button"
                onClick={() => {
                  const matched = scanResult.channels.find(
                    (c) => c.channelNumber === scanResult.bestChannel.channelNumber
                  );
                  if (matched) setConfirmModalChannel(matched);
                }}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-900/30 flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تطبيق على الراوتر</span>
              </button>
            )}
          </div>
        </div>

        {/* Metric 2: Total Detected Networks */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">إجمالي الشبكات المحيطة</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-2xl font-black text-white font-mono">
                {scanResult?.networksCount ?? (isScanning ? '...' : 0)}
              </span>
              <span className="text-[10px] text-blue-300 font-semibold">شبكة هوائية</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              ضمن نطاق {selectedBand === '2ghz' ? '2.4 GHz' : '5 GHz'}
            </span>
          </div>
        </div>

        {/* Metric 3: Current Configured Channel on Interface */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-md flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-400 block">القناة الحالية في الراوتر</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-black text-white font-mono">
                {currentFreqNum ? `${currentFreqNum} MHz` : (currentIfaceObj?.frequency || 'تلقائي auto')}
              </span>
            </div>
            <span className="text-[10px] text-purple-300 block mt-0.5 truncate max-w-[130px]">
              الواجهة: {currentIfaceObj?.name || selectedInterface} ({currentIfaceObj?.channelWidth || '20/40MHz'})
            </span>
          </div>
        </div>
      </div>

      {/* 3. Interactive Signal Strength & Interference Bar Chart */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-base text-white">
                رسم بياني لقوة الإشارة والتشويش عبر القنوات (Frequency & Signal Bar Chart)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {chartMode === 'signal'
                ? 'يعرض قوة إشارة أقوى شبكة متنافسة (Signal Strength dBm) على كل تردد — الأعمدة الخضراء تشير للقنوات الأنظف والأقل تشويشاً، والحمراء للأكثر تشويشاً وازدحاماً.'
                : chartMode === 'interference'
                ? 'يعرض نسبة الازدحام والتشويش المئوية (%) — القنوات بالأخضر هي الأنظف والأمثل للبث، وبالأحمر هي الأكثر تشويشاً.'
                : 'عرض مدمج يوضح قوة الإشارة (dBm) ونسبة التشويش التراكمية (%) جنباً إلى جنب.'}
            </p>
          </div>

          {/* Metric Mode Switcher (Signal Strength vs Interference) */}
          <div className="flex items-center gap-2 self-start md:self-center">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => setChartMode('signal')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  chartMode === 'signal'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="عرض قوة الإشارة بالديسيبل (Signal Strength dBm)"
              >
                <Signal className="w-3.5 h-3.5" />
                <span>قوة الإشارة (dBm)</span>
              </button>

              <button
                type="button"
                onClick={() => setChartMode('interference')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  chartMode === 'interference'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="عرض نسبة التشويش المئوية (% Interference)"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>نسبة التشويش (%)</span>
              </button>

              <button
                type="button"
                onClick={() => setChartMode('both')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 ${
                  chartMode === 'both'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="عرض المؤشرين معاً"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>عرض مزدوج</span>
              </button>
            </div>
          </div>
        </div>

        {/* Color Legend (Requested: Red for congested, Green for cleanest) */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-semibold text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-3 h-3 rounded-md bg-emerald-500 shadow-sm shadow-emerald-500/40" />
              <span>الأقل تشويشاً ونقية (Cleanest - أخضر)</span>
            </span>

            <span className="flex items-center gap-1.5 text-cyan-400">
              <span className="w-3 h-3 rounded-md bg-cyan-500" />
              <span>جيدة ومستقرة (Good - أزرق)</span>
            </span>

            <span className="flex items-center gap-1.5 text-amber-400">
              <span className="w-3 h-3 rounded-md bg-amber-500" />
              <span>متوسطة الازدحام (Moderate - برتقالي)</span>
            </span>

            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="w-3 h-3 rounded-md bg-rose-600 shadow-sm shadow-rose-500/40" />
              <span>الأكثر ازدحاماً وتشويشاً (Congested - أحمر)</span>
            </span>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            {selectedBand === '2ghz' ? '2.4 GHz Band (1-13)' : '5 GHz Band'}
          </span>
        </div>

        {/* Frequency Spectrum Bar Chart Visualization */}
        <div className="pt-2">
          {isScanning && !scanResult ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-300">جاري مسح طيف الترددات وقياس نسبة التشويش وقوة الإشارة...</p>
              <p className="text-xs text-slate-500 font-mono">/interface wireless scan numbers={selectedInterface} duration={scanDuration}s</p>
            </div>
          ) : !scanResult ? (
            <div className="py-16 text-center space-y-3 bg-slate-950/40 rounded-2xl border border-slate-800/80 p-6">
              <Radio className="w-10 h-10 text-indigo-400 mx-auto opacity-80" />
              <h4 className="text-sm font-bold text-slate-200">الرسم البياني لطيف الترددات وقوة الإشارة (Bar Chart)</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                اضغط على زر "بدء فحص وتحليل الأثير" لإجراء فحص طيفي حقيقي على بطاقة الوايرلس، وسيقوم النظام فوراً برسم أعمدة قوة الإشارة ونسبة الازدحام لكل قناة واقتراح القناة الأنقى للبث بالأخضر.
              </p>
              <button
                type="button"
                onClick={handleStartScan}
                disabled={!selectedInterface || !wirelessInterfaces || wirelessInterfaces.length === 0 || !isConnected}
                className="mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>بدء فحص الأثير الآن</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Chart Grid with Y-axis markers */}
              <div className="relative pt-6 pb-2">
                {/* Y-Axis Reference Guide */}
                <div className="absolute left-0 right-0 top-6 bottom-16 pointer-events-none flex flex-col justify-between text-[10px] text-slate-600 font-mono border-y border-dashed border-slate-800">
                  <div className="flex justify-between items-center pr-2 pl-2">
                    <span className="bg-slate-900 px-1">{chartMode === 'signal' ? '-30 dBm (قوي جداً)' : '100% (أقصى تشويش)'}</span>
                    <div className="w-full border-t border-dashed border-slate-800/80 mx-2" />
                    <span>مزدحم ⚠️</span>
                  </div>
                  <div className="flex justify-between items-center pr-2 pl-2">
                    <span className="bg-slate-900 px-1">{chartMode === 'signal' ? '-65 dBm (متوسط)' : '50% (متوسط)'}</span>
                    <div className="w-full border-t border-dashed border-slate-800/80 mx-2" />
                    <span>معتدل</span>
                  </div>
                  <div className="flex justify-between items-center pr-2 pl-2">
                    <span className="bg-slate-900 px-1">{chartMode === 'signal' ? '-100 dBm (أرضية الضوضاء)' : '0% (خالي تماماً)'}</span>
                    <div className="w-full border-t border-dashed border-slate-800/80 mx-2" />
                    <span>نقي ✓</span>
                  </div>
                </div>

                {/* Bars Row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-13 gap-2.5 items-end min-h-[260px] relative z-10">
                  {scanResult?.channels?.map((c) => {
                    const style = getChannelColorStyle(c);
                    const isSelected = selectedChannelDetail?.channelNumber === c.channelNumber;
                    const isBest = scanResult.bestChannel?.channelNumber === c.channelNumber;
                    const isCurrent = currentFreqNum ? Math.abs(currentFreqNum - c.frequency) <= 5 : false;

                    // Height calculation based on active chartMode
                    const signalHeight = signalToHeightPercent(c.peakSignal);
                    const interferenceHeight = Math.max(10, c.interferenceScore);
                    const barHeight =
                      chartMode === 'signal'
                        ? signalHeight
                        : chartMode === 'interference'
                        ? interferenceHeight
                        : Math.max(signalHeight, interferenceHeight);

                    return (
                      <div
                        key={c.channelNumber}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedChannelDetail(c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedChannelDetail(c);
                          }
                        }}
                        className={`flex flex-col items-center justify-end h-full p-2 rounded-2xl border transition-all cursor-pointer group relative ${
                          isSelected
                            ? 'bg-slate-800/95 border-indigo-400 ring-2 ring-indigo-500/60 shadow-xl shadow-indigo-950/60 scale-105'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                        }`}
                      >
                        {/* Top Badges (Best / Current) */}
                        <div className="absolute -top-3.5 inset-x-0 flex justify-center gap-1">
                          {isBest && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black shadow-lg shadow-emerald-900/60 animate-bounce">
                              ★ الأفضل
                            </span>
                          )}
                          {isCurrent && !isBest && (
                            <span className="px-1.5 py-0.5 rounded-full bg-purple-500 text-white text-[9px] font-bold shadow-md">
                              الحالية
                            </span>
                          )}
                        </div>

                        {/* Value label above bar */}
                        <div className="text-center mb-1.5 flex flex-col items-center">
                          {chartMode === 'signal' ? (
                            <span className={`text-[10px] font-black font-mono ${style.text}`} dir="ltr">
                              {c.peakSignal && c.peakSignal > -100 ? `${c.peakSignal} dBm` : 'هادئة'}
                            </span>
                          ) : chartMode === 'interference' ? (
                            <span className={`text-[10px] font-black font-mono ${style.text}`}>
                              {c.interferenceScore}%
                            </span>
                          ) : (
                            <div className="text-[9px] font-mono leading-tight">
                              <span className={`font-bold block ${style.text}`}>{c.interferenceScore}%</span>
                              <span className="text-slate-400 block" dir="ltr">
                                {c.peakSignal && c.peakSignal > -100 ? `${c.peakSignal} dBm` : 'Clean'}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Bar Pillar Visual */}
                        <div className="w-full bg-slate-900/90 border border-slate-800/80 rounded-xl h-36 flex flex-col justify-end p-1 overflow-hidden relative shadow-inner">
                          {/* Animated Fill Bar */}
                          <div
                            style={{ height: `${barHeight}%` }}
                            className={`w-full rounded-lg bg-gradient-to-t ${style.barGradient} transition-all duration-500 shadow-md relative group-hover:brightness-110`}
                          >
                            {/* Glow accent on top of bar */}
                            <div className="w-full h-1.5 bg-white/40 rounded-t-lg" />
                          </div>
                        </div>

                        {/* Channel Number & Frequency Label Below Bar */}
                        <div className="text-center mt-2.5 w-full">
                          <div className="flex items-center justify-center gap-1">
                            <span className="font-mono font-black text-xs text-white">
                              Ch {c.channelNumber}
                            </span>
                            {c.isNonOverlapping && (
                              <span
                                className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                                title="قناة غير متداخلة قياسية معتمدة (1, 6, 11)"
                              />
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                            {c.frequency}M
                          </span>
                          <span className={`text-[9px] font-bold block mt-0.5 truncate ${c.apCount > 0 ? 'text-slate-300' : 'text-emerald-400'}`}>
                            {c.apCount > 0 ? `${c.apCount} شبكة` : 'خالية ✓'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2.4 GHz Golden Non-overlapping Rule Hint */}
              {selectedBand === '2ghz' && (
                <div className="flex flex-wrap items-center justify-between text-xs text-slate-300 bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
                    <span className="font-bold text-white">القنوات الذهبية غير المتداخلة في 2.4 GHz:</span>
                    <span className="text-slate-400">
                      القنوات <strong>1</strong> و <strong>6</strong> و <strong>11</strong> هي القنوات الوحيدة التي لا تتداخل ترددياً مع بعضها. يُنصح دائماً باختيار إحداها بناءً على الأقل تشويشاً (الملونة بالأخضر).
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg shrink-0">
                    قنوات 1 / 6 / 11
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Selected Channel Detailed Inspection Card */}
      {selectedChannelDetail && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-lg text-white font-mono">
                    تفاصيل قناة {selectedChannelDetail.channelNumber} ({selectedChannelDetail.frequency} MHz)
                  </h4>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getChannelColorStyle(selectedChannelDetail).badge}`}>
                    {getChannelColorStyle(selectedChannelDetail).statusLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {selectedChannelDetail.recommendation}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfirmModalChannel(selectedChannelDetail)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تطبيق هذه القناة على {selectedInterface || 'الواجهة'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">مؤشر التشويش الإجمالي</span>
              <span className={`text-xl font-black font-mono ${getChannelColorStyle(selectedChannelDetail).text}`}>
                {selectedChannelDetail.interferenceScore}%
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">أقوى إشارة متنافسة (Peak Signal)</span>
              <span className="text-lg font-black text-white font-mono" dir="ltr">
                {selectedChannelDetail.peakSignal && selectedChannelDetail.peakSignal > -100
                  ? `${selectedChannelDetail.peakSignal} dBm`
                  : 'لا يوجد تداخل'}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">شبكات تبث على نفس القناة</span>
              <span className="text-xl font-black text-white font-mono">
                {selectedChannelDetail.apCount} شبكة
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 block text-[11px]">نوع القناة في المعيار</span>
              <span className="text-xs font-bold text-indigo-300 mt-1 block">
                {selectedChannelDetail.isNonOverlapping ? 'قناة قياسية غير متداخلة (1, 6, 11)' : 'قناة متداخلة جزئياً'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 5. Detected Neighboring Networks Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Signal className="w-5 h-5 text-indigo-400" />
              <h4 className="font-bold text-base text-white">
                الشبكات اللاسلكية المرصودة في الأثير ({filteredNetworks.length})
              </h4>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              قائمة نقاط الوصول والراوترات المحيطة المكتشفة أثناء فحص الوايرلس
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={networkSearchQuery}
              onChange={(e) => setNetworkSearchQuery(e.target.value)}
              placeholder="بحث باسم الشبكة، MAC، التردد..."
              className="bg-transparent border-0 text-xs text-white placeholder-slate-500 focus:outline-none w-full"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-right text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold select-none">
              <tr>
                <th className="p-3.5">اسم الشبكة (SSID)</th>
                <th className="p-3.5">عنوان الماك (BSSID)</th>
                <th className="p-3.5">القناة والتردد</th>
                <th className="p-3.5">قوة الإشارة (RSSI)</th>
                <th className="p-3.5">نسبة الإشارة للضوضاء (SNR)</th>
                <th className="p-3.5">نوع الجهاز / Radio Name</th>
                <th className="p-3.5 text-center">الأمان</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredNetworks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 font-sans font-medium">
                    {isScanning ? (
                      <span className="flex items-center justify-center gap-2 text-indigo-400">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري مسح طيف الأثير الفعلي عبر كرت الوايرلس...</span>
                      </span>
                    ) : scanResult && scanResult.networks.length === 0 ? (
                      <div className="space-y-1">
                        <span className="font-bold text-emerald-400 block">✨ الأثير نقي تماماً في هذا النطاق</span>
                        <span className="text-xs text-slate-500">لم يتم التقاط أي شبكات منافسة أو تشويش خارجي في محيط الراوتر خلال نافذة المسح الحقيقي.</span>
                      </div>
                    ) : networkSearchQuery ? (
                      'لم يتم العثور على شبكات تطابق معايير البحث'
                    ) : (
                      'اضغط على زر (مسح الترددات الحقيقي) أعلاه لبدء فحص الأثير الفعلي عبر الراوتر'
                    )}
                  </td>
                </tr>
              ) : (
                filteredNetworks.map((net) => {
                  const sigVal = net.signal;
                  const sigColor =
                    sigVal >= -65 ? 'text-emerald-400' :
                    sigVal >= -75 ? 'text-cyan-400' :
                    sigVal >= -84 ? 'text-amber-400' : 'text-rose-400';

                  return (
                    <tr key={net.id || net.bssid} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-bold text-white font-sans flex items-center gap-2">
                        <Wifi className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span>{net.ssid}</span>
                        {net.routeros && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            RouterOS
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-400 text-xs">{net.bssid}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200">
                          {net.frequency} MHz ({net.channel})
                        </span>
                      </td>
                      <td className="p-3.5" dir="ltr">
                        <span className={`font-bold ${sigColor}`}>
                          {sigVal} dBm
                        </span>
                      </td>
                      <td className="p-3.5 text-emerald-400" dir="ltr">
                        +{net.snr || 25} dB
                      </td>
                      <td className="p-3.5 text-slate-300 font-sans">
                        {net.radioName || '—'}
                      </td>
                      <td className="p-3.5 text-center">
                        {net.privacy ? (
                          <span className="inline-flex p-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" title="مشفر WPA/WPA2">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="inline-flex p-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30" title="مفتوح / هوتسبوت">
                            <Unlock className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Channel Application Confirmation Modal */}
      {confirmModalChannel && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-right animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="p-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                <Radio className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-base text-white">
                  تأكيد ضبط قناة البث على الراوتر
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  سيتم تعديل تردد الواجهة اللاسلكية ({selectedInterface || 'wlan1'}) فوراً
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">الواجهة اللاسلكية:</span>
                <span className="font-bold text-white font-mono">{selectedInterface || 'wlan1'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">القناة الجديدة:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  قناة {confirmModalChannel.channelNumber} ({confirmModalChannel.frequency} MHz)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">مستوى التشويش المقدر:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {confirmModalChannel.interferenceScore}% ({confirmModalChannel.rating})
                </span>
              </div>
            </div>

            {/* Channel Width Setting */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                عرض القناة (Channel Width)
              </label>
              <select
                value={applyWidth}
                onChange={(e) => setApplyWidth(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none cursor-pointer"
              >
                <option value="20mhz">20 MHz (موصى بها بشدة في الأماكن المزدحمة لتقليل التشويش)</option>
                <option value="20/40mhz">20/40 MHz (سرعة مضاعفة عند توفر مساحة طيفية نظيفة)</option>
                {selectedBand === '5ghz' && (
                  <option value="20/40/80mhz">20/40/80 MHz (سرعات فائقة 5GHz)</option>
                )}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalChannel(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isApplyingChannel}
                onClick={() => handleApplyChannel(confirmModalChannel)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isApplyingChannel ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>تطبيق وحفظ الإعدادات</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
