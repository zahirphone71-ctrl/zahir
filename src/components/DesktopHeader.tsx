import React, { useState, useEffect, useRef } from 'react';
import { useConnectionSession, useRouterTelemetry, useMikroTikActions } from '../context/MikroTikContext';
import { TabType, getCategoryForTab } from './Sidebar';
import { LogoZ } from './LogoZ';
import { ZCtrlTitle } from './ZCtrlTitle';
import {
  Server,
  RefreshCw,
  Zap,
  Activity,
  Cpu,
  Radio,
  Clock,
  LogOut,
  Sliders,
  CheckCircle,
  AlertCircle,
  Info,
  Menu,
  ChevronLeft,
  RotateCcw,
  ArrowRight,
  Shield,
  ShieldCheck,
  Layers,
  Search,
  Command,
  Database,
  Wifi,
  PanelRightClose,
  PanelRightOpen,
  FileDown,
  Thermometer
} from 'lucide-react';
import { formatBytes } from '../lib/formatters';
import { HeaderProfileSwitcher } from './connection/HeaderProfileSwitcher';
import { RouterConnectionProfilesModal } from './connection/RouterConnectionProfilesModal';
import { ConnectionDiagnosticIndicator } from './ConnectionDiagnosticIndicator';

interface DesktopHeaderProps {
  onOpenConnectModal: () => void;
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onToggleMobileMenu?: () => void;
  canGoBack?: boolean;
  onGoBack?: () => void;
  historyLength?: number;
  onOpenCommandPalette?: () => void;
  onOpenDiagnostics?: () => void;
  onOpenPdfExport?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebarCollapse?: () => void;
}

const TAB_TITLES: Record<TabType, string> = {
  mikrotik_login: 'تسجيل الدخول والاتصال',
  dashboard: 'لوحة المراقبة',
  hotspot_users: 'مستخدمي الهوتسبوت',
  profiles: 'البروفايلات والسرعات',
  generator: 'استوديو الكروت',
  card_studio: 'استوديو الكروت',
  active_sessions: 'الجلسات المتصلة الآن',
  network_center: 'الشبكة والوايرلس (SSID & Antennas)',
  ip_binding: 'الأجهزة المستثناة (IP Binding)',
  dhcp: 'سيرفر DHCP والأجهزة',
  ppp: 'اشتراكات PPPoE / VPN',
  userman: 'إدارة اليوزر مانجر',
  queues: 'تحديد السرعات (Queues)',
  firewall: 'الجدار الناري والأمان',
  traffic: 'حركة المنافذ والمراقبة',
  terminal: 'طرفية الأوامر (Terminal)',
  scheduled_tasks: 'جدولة المهام (Scheduled Tasks)',
  logs: 'سجل الأحداث (Logs)',
  ai_assistant: 'المساعد الذكي لـ ZCtrl',
  backup: 'النسخ الاحتياطي والضبط',
  settings: 'إعدادات البرنامج (Settings)',
  guide: 'دليل المستخدم (User Guide)'
};

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  onOpenConnectModal,
  activeTab,
  onSelectTab,
  onToggleMobileMenu,
  canGoBack = false,
  onGoBack,
  historyLength = 0,
  onOpenCommandPalette,
  onOpenDiagnostics,
  onOpenPdfExport,
  isSidebarCollapsed = false,
  onToggleSidebarCollapse
}) => {
  const { isConnected } = useConnectionSession();
  const {
    router,
    ecoMode,
    thermalShieldActive,
    dataPrefetcher,
    streamStatus,
    isRealtimeWsConnected,
    realtimeSyncMode,
    activeRealtimeFrequencySec,
    pingStabilizer,
    isOptimizingPing
  } = useRouterTelemetry();
  const {
    setAutoSync,
    syncNow,
    setEcoMode,
    runCommand,
    disconnectRouter,
    showToast,
    optimizePingNow
  } = useMikroTikActions();
  const { autoSync } = useRouterTelemetry();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isFlushingDns, setIsFlushingDns] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const isMountedRef = useRef(true);
  const logoutPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!showLogoutConfirm) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (logoutPopupRef.current && !logoutPopupRef.current.contains(e.target as Node)) {
        setShowLogoutConfirm(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowLogoutConfirm(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLogoutConfirm]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncNow(true);
    } finally {
      if (isMountedRef.current) setIsSyncing(false);
    }
  };

  const handleQuickFlushDns = async () => {
    setIsFlushingDns(true);
    try {
      const res = await runCommand('/ip dns cache flush');
      if (!isMountedRef.current) return;
      if (res.success) {
        showToast('تم تفريغ وحذف كاش الـ DNS بنجاح من السيرفر', 'success');
      } else {
        showToast(res.output || 'تعذر تفريغ كاش الـ DNS على الراوتر', 'error');
      }
    } catch (err) {
      console.warn('Quick DNS flush failed:', err);
      if (isMountedRef.current) {
        showToast('حدث خطأ أثناء تفريغ كاش الـ DNS', 'error');
      }
    } finally {
      if (isMountedRef.current) setIsFlushingDns(false);
    }
  };

  const handleConfirmLogout = () => {
    disconnectRouter();
    setShowLogoutConfirm(false);
    onSelectTab('mikrotik_login');
  };

  const cpuLoad = router?.cpuLoad || 0;
  const cpuColor =
    cpuLoad > 80 ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' :
    cpuLoad > 50 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
    'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';

  const cpuTemperature = router?.cpuTemperature ?? router?.boardTemperature;
  const tempColor =
    (cpuTemperature && cpuTemperature > 68) ? 'text-rose-400 bg-rose-500/10 border-rose-500/30' :
    (cpuTemperature && cpuTemperature > 55) ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
    'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

  const pingMs = pingStabilizer?.ewmaPingMs || router?.pingMs || 0;
  const jitterMs = pingStabilizer?.jitterMs ?? 0;
  const stabilizerState = pingStabilizer?.state || 'optimal';
  const isStabilizing = stabilizerState === 'stabilizing' || stabilizerState === 'critical';
  const pingColor =
    pingMs <= 0 ? 'text-slate-300 bg-slate-800/70 border-slate-700' :
    pingMs < 15 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' :
    pingMs < 45 ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' :
    pingMs < 80 ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' :
    'text-rose-400 bg-rose-500/10 border-rose-500/30';

  return (
    <>
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 text-slate-100 px-3 sm:px-5 py-2.5 flex items-center justify-between select-none shadow-lg z-30 flex-nowrap gap-2 sm:gap-3 overflow-x-auto no-scrollbar min-w-0">
        {/* Left Section: Back Button + Menu Toggle + Sidebar Rail Toggle + Title & Breadcrumbs */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="فتح القائمة والتبويبات"
            aria-label="فتح القائمة والتبويبات"
          >
            <Menu className="w-5 h-5 text-blue-400" />
          </button>

          {/* Desktop Sidebar Collapse / Expand Toggle Button */}
          {onToggleSidebarCollapse && (
            <button
              type="button"
              id="header-sidebar-toggle-btn"
              onClick={onToggleSidebarCollapse}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition-all text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isSidebarCollapsed
                  ? 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40 text-blue-300 hover:text-white shadow-xs'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700/80 text-slate-300 hover:text-white'
              }`}
              title={isSidebarCollapsed ? 'توسيع القائمة الجانبية بالكامل' : 'طي القائمة الجانبية لحافة الشاشة (توسيع العرض)'}
            >
              {isSidebarCollapsed ? (
                <>
                  <PanelRightOpen className="w-4 h-4 text-blue-400" />
                  <span className="hidden xl:inline text-xs">إظهار القائمة</span>
                </>
              ) : (
                <>
                  <PanelRightClose className="w-4 h-4 text-slate-400" />
                  <span className="hidden xl:inline text-xs">طي القائمة</span>
                </>
              )}
            </button>
          )}

          {/* Back Step Button (زر الرجوع للخلف خطوة) */}
          <button
            type="button"
            id="header-back-step-btn"
            onClick={onGoBack}
            disabled={!canGoBack}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              canGoBack
                ? 'bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/40 text-blue-300 hover:text-white shadow-xs cursor-pointer active:scale-95'
                : 'bg-slate-800/30 border-slate-800 text-slate-500 cursor-not-allowed opacity-40'
            }`}
            title={canGoBack ? 'الرجوع للقسم السابق' : 'لا توجد صفحات سابقة'}
          >
            <ArrowRight className="w-4 h-4 text-blue-400 rotate-180" />
            <span className="hidden sm:inline">رجوع</span>
            {canGoBack && historyLength > 1 && (
              <span className="text-xs font-mono bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded-full border border-blue-500/30">
                {historyLength - 1}
              </span>
            )}
          </button>

          {/* Brand Logo & Current Section Breadcrumb */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center shrink-0 select-none">
              <LogoZ size={32} />
            </div>

            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <div className="hidden lg:inline-flex items-center">
                  <ZCtrlTitle size="sm" />
                </div>
                <span className="text-slate-600 hidden lg:inline">/</span>
                <span className="text-slate-400 hidden sm:inline truncate max-w-[130px]">
                  {getCategoryForTab(activeTab).title}
                </span>
                <span className="text-slate-600 hidden sm:inline">/</span>
                <span className="font-bold text-blue-400 text-xs sm:text-sm truncate max-w-[160px] sm:max-w-[220px]">
                  {TAB_TITLES[activeTab] || 'لوحة التحكم'}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono hidden xl:block">
                RouterOS v7 Enterprise Suite
              </span>
            </div>
          </div>
        </div>

        {/* Live Stream Progress Badge */}
        {streamStatus?.isStreaming && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-cyan-950/90 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs font-medium shadow-md shadow-cyan-950/40 shrink-0">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span className="text-xs font-semibold">بث حقيقي للمشتركين: {streamStatus.receivedItems} / {streamStatus.totalItems || '...'}</span>
            <div className="w-12 bg-cyan-900/80 rounded-full h-1.5 overflow-hidden">
              <div className="bg-cyan-400 h-1.5 transition-all duration-200" style={{ width: `${streamStatus.progressPercent}%` }} />
            </div>
          </div>
        )}

        {/* Top Corner Live Hardware Monitor Pod (Real-time Continuous Ping/Latency & CPU Load) */}
        {isConnected && router ? (
          <>
            {/* Desktop & Tablet View Pod */}
            <div className="hidden sm:flex items-center gap-2.5 bg-slate-950/90 border border-blue-500/35 rounded-2xl px-3 py-1.5 text-xs shadow-md shadow-blue-950/40 shrink-0">
              <div className="flex items-center gap-1.5" title="اتصال مباشر وحي بالمايكروتك">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"></span>
                </span>
                <span className="font-bold text-slate-200 text-xs truncate max-w-[110px]">{router.name || 'MikroTik'}</span>
              </div>

              {/* Real-Time WebSocket / Adaptive Polling Badge */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border border-slate-800 bg-slate-900/80 text-xs font-mono" title={`المزامنة التلقائية: ${isRealtimeWsConnected ? 'WebSocket متصل' : 'استطلاع ذكي'} (${activeRealtimeFrequencySec} ث)`}>
                <span className="relative flex h-2 w-2">
                  {realtimeSyncMode === 'paused' ? (
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  ) : isRealtimeWsConnected ? (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" />
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.7)]" />
                  )}
                </span>
                <span className="text-slate-300 font-semibold">
                  {isRealtimeWsConnected ? 'WS' : 'Sync'} {activeRealtimeFrequencySec}s
                </span>
              </div>

              <div className="h-3 w-px bg-slate-800" />

              {/* Ping / Latency Metric + One-Click Auto-Ping Optimize */}
              <button
                type="button"
                onClick={() => optimizePingNow({ count: 3, applyQos: false })}
                disabled={isOptimizingPing}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-mono tabular-nums cursor-pointer hover:brightness-125 transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${pingColor}`}
                dir="ltr"
                title={pingMs > 0 ? `زمن الاستجابة (Ping: ${pingMs}ms | Jitter: ${jitterMs}ms) — انقر للفحص وضبط البينج تلقائياً الآن` : 'انقر لقياس زمن الاستجابة الفعلي (ICMP Ping)'}
              >
                {isOptimizingPing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5" />
                )}
                <span className="font-bold">{pingMs > 0 ? `Ping: ${pingMs}ms` : 'Ping: --'}</span>
                {isStabilizing && (
                  <span className="text-xs font-sans font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ضبط آلي
                  </span>
                )}
              </button>

              {/* CPU Load Metric (Real-Time Hardware Load) */}
              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs font-mono tabular-nums ${cpuColor}`} dir="ltr" title="أداء واستهلاك معالج الراوتر لحظياً (CPU Load)">
                <Cpu className="w-3.5 h-3.5" />
                <span className="font-bold">CPU: {cpuLoad}%</span>
              </div>

              {/* CPU & Board Temperature Metric */}
              {cpuTemperature !== undefined && (
                <div className={`hidden lg:flex items-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-mono tabular-nums ${tempColor}`} dir="ltr" title="درجة حرارة معالج الراوتر">
                  <Thermometer className="w-3 h-3" />
                  <span>{cpuTemperature}°C</span>
                </div>
              )}

              {/* Free RAM */}
              <div className="hidden xl:flex items-center gap-1 text-xs text-slate-300 font-mono tabular-nums" dir="ltr" title="الذاكرة المتاحة في الراوتر">
                <Database className="w-3 h-3 text-slate-400" />
                <span>RAM: {router.freeMemory ? formatBytes(router.freeMemory, 0) : (isConnected ? '-' : '0 B')}</span>
              </div>

              {/* Data Prefetcher Idle/Cancelled Status */}
              {dataPrefetcher && (
                <div className="hidden 2xl:flex items-center gap-1">
                  {dataPrefetcher.status === 'prefetching' ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                      <span>جلب خامل بطيء...</span>
                    </span>
                  ) : dataPrefetcher.status === 'cancelled' ? (
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300/80 text-xs" title="تم إلغاء الجلب المسبق لتخفيف الضغط تماماً عن معالج الراوتر في هذه الصفحة الثقيلة">
                      جلب ملغى (حماية المعالج)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-300 text-xs" title="ميزة الجلب عند الخمول في وضع الاستعداد">
                      مزامنة خاملة جاهزة
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Mobile View Compact Pod */}
            <div className="flex sm:hidden items-center gap-1.5 bg-slate-950/90 border border-blue-500/35 rounded-xl px-2 py-1 text-xs font-mono tabular-nums shrink-0" title="استجابة ومعالج الراوتر">
              <span className="relative flex h-1.5 w-1.5">
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]"></span>
              </span>
              <span className="text-emerald-400 font-bold">{pingMs > 0 ? `${pingMs}ms` : '--'}</span>
              <span className="text-slate-600">|</span>
              <span className={`${cpuLoad > 80 ? 'text-rose-400' : 'text-blue-400'} font-bold`}>CPU {cpuLoad}%</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800 rounded-2xl px-2.5 py-1 text-xs text-slate-400 shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-xs">غير متصل</span>
          </div>
        )}

        {/* Right Section: Command Palette Trigger + Sync + Quick Actions + Router Switcher + Logout */}
        <div className="flex items-center gap-2">
          {/* Router Thermal Shield & Eco Saver Button */}
          {isConnected && (
            <button
              type="button"
              onClick={() => setEcoMode(!ecoMode)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                ecoMode || thermalShieldActive
                  ? 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
              title={ecoMode ? 'درع التبريد وحفظ طاقة المايكروتك نشط (انقر للتعطيل)' : 'تفعيل درع التبريد وحفظ طاقة معالج الراوتر'}
            >
              <ShieldCheck className={`w-3.5 h-3.5 ${ecoMode || thermalShieldActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline text-xs font-bold">
                {ecoMode || thermalShieldActive ? 'درع التبريد نشط' : 'تبريد وحفظ طاقة'}
              </span>
            </button>
          )}

          {/* Connection Diagnostic & Heartbeat Status Indicator */}
          <ConnectionDiagnosticIndicator />

          {/* Router Health Diagnostic Check */}
          {isConnected && onOpenDiagnostics && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="flex items-center gap-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="فحص المايكروتك وتوضيح النواقص والمقترحات"
            >
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span className="hidden sm:inline text-xs font-bold">فحص النواقص</span>
            </button>
          )}

          {/* Export Formatted PDF Report for Current View */}
          {isConnected && onOpenPdfExport && (
            <button
              type="button"
              id="header-export-pdf-btn"
              onClick={onOpenPdfExport}
              className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500/15 to-red-500/15 hover:from-rose-500/25 hover:to-red-500/25 border border-rose-500/40 text-rose-300 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              title={`تصدير بيانات (${TAB_TITLES[activeTab] || 'القسم الحالي'}) كتقرير PDF رسمي منسق`}
            >
              <FileDown className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">تصدير PDF</span>
              <span className="sm:hidden text-xs">PDF</span>
            </button>
          )}

          {/* Spotlight Command Search Button (Ctrl+K) */}
          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="flex items-center gap-2 bg-slate-950/70 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="بحث سريع في كل الأقسام والأوامر (Ctrl + K)"
            >
              <Search className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden lg:inline text-xs text-slate-400">بحث...</span>
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-400">
                Ctrl+K
              </kbd>
            </button>
          )}

          {/* Quick Flush DNS Cache */}
          {isConnected && (
            <button
              type="button"
              onClick={handleQuickFlushDns}
              disabled={isFlushingDns}
              aria-label="تفريغ وحذف كاش الـ DNS من السيرفر"
              className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-slate-200 rounded-xl transition-all disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="تفريغ وحذف كاش الـ DNS من السيرفر"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-slate-300 ${isFlushingDns ? 'animate-spin text-amber-400' : ''}`} />
            </button>
          )}

          {/* Auto-Sync Toggle */}
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            title={autoSync ? 'المزامنة التلقائية مفعلة (تحديث حي)' : 'المزامنة التلقائية متوقفة'}
            className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              autoSync
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-800/80 border-slate-700/80 text-slate-400 hover:text-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoSync ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            <span className="hidden sm:inline">مزامنة حية</span>
          </button>

          {/* Sync Button */}
          <button
            type="button"
            onClick={handleManualSync}
            disabled={!isConnected || isSyncing}
            aria-label="تحديث البيانات الآن"
            className="p-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/80 text-slate-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="تحديث البيانات الآن"
          >
            <RefreshCw className={`w-4 h-4 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>

          {/* Router Connection Profile 1-Click Quick Switcher */}
          <HeaderProfileSwitcher
            onOpenManageModal={() => setShowProfilesModal(true)}
            onOpenAddModal={() => setShowProfilesModal(true)}
          />

          {/* Router Switcher / Connect Button */}
          <button
            type="button"
            onClick={onOpenConnectModal}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/25 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            title="إدارة والاتصال بالسيرفرات"
          >
            <Server className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isConnected ? 'تبديل السيرفر' : 'اتصال بـ ZCtrl'}</span>
            <span className="sm:hidden">{isConnected ? 'السيرفر' : 'اتصال'}</span>
          </button>

          {/* Dedicated Logout / Disconnect Button */}
          {isConnected && (
            <div className="relative" ref={logoutPopupRef}>
              <button
                type="button"
                id="header-logout-btn"
                onClick={() => setShowLogoutConfirm(true)}
                className="bg-rose-500/10 hover:bg-rose-600 border border-rose-500/30 hover:border-rose-600 text-rose-300 hover:text-white px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                title="تسجيل الخروج وقطع الاتصال بالسيرفر"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تسجيل الخروج</span>
              </button>

              {/* Logout Confirmation Popup */}
              {showLogoutConfirm && (
                <div className="absolute end-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in-50 zoom-in-95">
                  <div className="text-start space-y-2">
                    <p className="text-xs font-bold text-slate-200">هل ترغب في تسجيل الخروج؟</p>
                    <p className="text-xs text-slate-400">سيتم فصل الاتصال بالراوتر الحالي وإيقاف التحديث الحي.</p>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowLogoutConfirm(false)}
                        className="px-3 py-1.5 text-xs text-slate-300 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      >
                        إلغاء
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmLogout}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                      >
                        تأكيد الخروج
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Router Connection Profiles Management Modal */}
      <RouterConnectionProfilesModal
        isOpen={showProfilesModal}
        onClose={() => setShowProfilesModal(false)}
      />
    </>
  );
};
