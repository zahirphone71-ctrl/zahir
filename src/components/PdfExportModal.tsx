import React, { useState, useMemo, useEffect, useRef } from 'react';
import { TabType } from './Sidebar';
import { useMikroTik } from '../context/MikroTikContext';
import {
  FileDown,
  Printer,
  X,
  FileText,
  Sliders,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Layers,
  Sparkles,
  Server,
  ArrowRight,
  Eye,
  Settings2,
  HelpCircle,
  Users,
  Wifi,
  Globe,
  UserCheck,
  ShieldAlert,
  Clock,
  Radio,
  Activity,
  HardDrive
} from 'lucide-react';
import {
  extractViewReportData,
  exportViewDataToPdf,
  printViewData,
  ViewReportData
} from '../utils/viewPdfExporter';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabType | string;
  customData?: any;
  customTitle?: string;
  selectedIds?: string[];
  filteredItems?: any[];
}

const VIEW_ARABIC_NAMES: Record<string, string> = {
  dashboard: 'لوحة المراقبة المركزية',
  subscribers: 'إدارة المشتركين',
  hotspot_users: 'مستخدمي وبطاقات الهوتسبوت',
  ppp: 'اشتراكات البرودباند PPPoE / VPN',
  userman: 'مشتركي سيرفر اليوزر مانجر',
  profiles: 'بروفايلات السرعات والاشتراكات',
  active_sessions: 'الجلسات المتصلة الآن',
  queues: 'محددات السرعة وتوزيع الباندويث (Queues)',
  dhcp: 'سيرفر DHCP وعناوين الأجهزة',
  traffic: 'حركة المنافذ والترافيك المباشر',
  firewall: 'قواعد الجدار الناري والأمان',
  ip_binding: 'الأجهزة المستثناة (IP Binding)',
  network_center: 'الشبكة والوايرلس (SSID & Antennas)',
  terminal: 'طرفية الأوامر والعمليات',
  scheduled_tasks: 'جدولة المهام (Scheduled Tasks)',
  logs: 'سجل الأحداث والتحذيرات (Logs)',
  ai_assistant: 'المساعد الذكي',
  backup: 'النسخ الاحتياطي وملفات السيرفر',
  settings: 'إعدادات النظام',
  guide: 'دليل المستخدم',
  generator: 'استوديو الكروت والبطاقات',
  card_studio: 'استوديو الكروت والبطاقات',
  mikrotik_login: 'شاشة تسجيل الدخول'
};

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  customData,
  customTitle,
  selectedIds = [],
  filteredItems
}) => {
  const context = useMikroTik();
  const { showToast } = context;

  // Determine if current view is subscribers-related
  const isSubscribersView =
    activeTab === 'subscribers' ||
    activeTab === 'hotspot_users' ||
    activeTab === 'ppp' ||
    activeTab === 'userman';

  const isProfilesView = activeTab === 'profiles';
  const isActiveSessionsView = activeTab === 'active_sessions';
  const isFirewallView = activeTab === 'firewall';
  const isDhcpView = activeTab === 'dhcp';
  const isQueuesView = activeTab === 'queues';
  const isLogsView = activeTab === 'logs';
  const isTrafficView = activeTab === 'traffic';
  const isIpBindingView = activeTab === 'ip_binding';

  // Sub-System Selector State (e.g. Hotspot vs PPPoE vs Userman vs All)
  const initialSystem = useMemo(() => {
    if (customData?.activeSystem) return customData.activeSystem;
    if (activeTab === 'ppp') return 'pppoe';
    if (activeTab === 'userman') return 'userman';
    if (activeTab === 'hotspot_users') return 'hotspot';
    return 'all';
  }, [activeTab, customData]);

  const [selectedSystem, setSelectedSystem] = useState<string>(initialSystem);

  // Status Filter Subset State (e.g. All, Online, Expired, Idle, Suspended, Selected)
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Configuration States
  const [reportTitle, setReportTitle] = useState('');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [theme, setTheme] = useState<'corporate' | 'print'>('corporate');
  const [includeKpis, setIncludeKpis] = useState(true);
  const [includeRouterInfo, setIncludeRouterInfo] = useState(true);

  // Generation States
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const isMountedRef = useRef(true);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  // Live counts for subscriber sub-systems & status
  const subscribersCounts = useMemo(() => {
    const hsList = context.users || [];
    const pppList = context.pppSecrets || [];
    const umList = context.usermanUsers || [];

    const hsActSet = new Set((context.activeUsers || []).map((a: any) => String(a.user || '').toLowerCase()));
    const pppActSet = new Set((context.pppActive || []).map((a: any) => String(a.name || '').toLowerCase()));
    const umActSet = new Set((context.usermanActive || []).map((a: any) => String(a.user || a.username || '').toLowerCase()));

    // Hotspot status counts
    let hsOnline = 0, hsExpired = 0, hsIdle = 0, hsSuspended = 0;
    hsList.forEach((u: any) => {
      const uName = String(u.name || '').toLowerCase();
      if (u.disabled) { hsSuspended++; return; }
      const cStr = String(u.comment || '').toLowerCase();
      if (cStr.includes('expired') || cStr.includes('منتهي') || (u.limitUptime && u.uptime && u.uptime >= u.limitUptime)) {
        hsExpired++;
        return;
      }
      if (hsActSet.has(uName)) { hsOnline++; return; }
      hsIdle++;
    });

    // PPPoE status counts
    let pppOnline = 0, pppExpired = 0, pppIdle = 0, pppSuspended = 0;
    pppList.forEach((s: any) => {
      const sName = String(s.name || '').toLowerCase();
      if (s.disabled) { pppSuspended++; return; }
      const cStr = String(s.comment || '').toLowerCase();
      if (cStr.includes('expired') || cStr.includes('منتهي')) {
        pppExpired++;
        return;
      }
      if (pppActSet.has(sName)) { pppOnline++; return; }
      pppIdle++;
    });

    // Userman status counts
    let umOnline = 0, umExpired = 0, umIdle = 0, umSuspended = 0;
    umList.forEach((u: any) => {
      const uName = String(u.name || u.username || '').toLowerCase();
      if (u.disabled || u.state === 'disabled') { umSuspended++; return; }
      if (u.state === 'expired' || u.state === 'used_up') { umExpired++; return; }
      if (umActSet.has(uName)) { umOnline++; return; }
      umIdle++;
    });

    return {
      hotspot: { total: hsList.length, online: hsOnline, expired: hsExpired, idle: hsIdle, suspended: hsSuspended },
      pppoe: { total: pppList.length, online: pppOnline, expired: pppExpired, idle: pppIdle, suspended: pppSuspended },
      userman: { total: umList.length, online: umOnline, expired: umExpired, idle: umIdle, suspended: umSuspended },
      all: {
        total: hsList.length + pppList.length + umList.length,
        online: hsOnline + pppOnline + umOnline,
        expired: hsExpired + pppExpired + umExpired,
        idle: hsIdle + pppIdle + umIdle,
        suspended: hsSuspended + pppSuspended + umSuspended
      }
    };
  }, [context.users, context.pppSecrets, context.usermanUsers, context.activeUsers, context.pppActive, context.usermanActive]);

  // Profile counts
  const profilesCounts = useMemo(() => {
    const hs = context.profiles || [];
    const ppp = context.pppProfiles || [];
    const um = context.usermanProfiles || [];
    return {
      hotspot: hs.length,
      pppoe: ppp.length,
      userman: um.length,
      all: hs.length + ppp.length + um.length
    };
  }, [context.profiles, context.pppProfiles, context.usermanProfiles]);

  // Active session counts
  const activeSessionCounts = useMemo(() => {
    const hs = (context.activeUsers || []).length;
    const ppp = (context.pppActive || []).length;
    const um = (context.usermanActive || []).length;
    return {
      hotspot: hs,
      pppoe: ppp,
      userman: um,
      all: hs + ppp + um
    };
  }, [context.activeUsers, context.pppActive, context.usermanActive]);

  // Reset states when opened
  useEffect(() => {
    if (isOpen) {
      const sys = customData?.activeSystem || initialSystem;
      setSelectedSystem(sys);

      if (selectedIds.length > 0) {
        setStatusFilter('selected');
      } else {
        setStatusFilter('all');
      }

      const defaultTitle = customTitle || VIEW_ARABIC_NAMES[activeTab] || 'تقرير النظام';
      setReportTitle(defaultTitle);
      setProgressPercent(0);
      setProgressMessage('');
    }
  }, [isOpen, activeTab, customTitle, initialSystem, customData?.activeSystem, selectedIds.length]);

  // Extract structured report data dynamically based on chosen system and status filter
  const reportData: ViewReportData = useMemo(() => {
    if (!isOpen) {
      return {
        title: '',
        titleEn: '',
        subtitle: '',
        viewKey: String(activeTab),
        routerName: '',
        routerHost: '',
        kpis: [],
        sections: []
      };
    }

    return extractViewReportData(activeTab, context, {
      customTitle: reportTitle,
      selectedSystem,
      statusFilter,
      selectedIds,
      filteredItems
    });
  }, [isOpen, activeTab, context, reportTitle, selectedSystem, statusFilter, selectedIds, filteredItems]);

  const totalRowsCount = useMemo(() => {
    return reportData.sections.reduce((acc, s) => acc + s.rows.length, 0);
  }, [reportData]);

  // Dynamic estimated page count based on calibrated capacities
  const estimatedPages = useMemo(() => {
    const isLandscape = orientation === 'landscape';
    const rowsOnP1 = isLandscape ? (includeKpis ? 11 : 14) : (includeKpis ? 17 : 22);
    const rowsOnSub = isLandscape ? 17 : 25;

    if (totalRowsCount <= rowsOnP1) return 1;
    const remaining = totalRowsCount - rowsOnP1;
    return 1 + Math.ceil(remaining / rowsOnSub);
  }, [totalRowsCount, orientation, includeKpis]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    if (isGenerating) return;

    try {
      setIsGenerating(true);
      setProgressPercent(5);
      setProgressMessage('جاري تهيئة محرك PDF عالي الدقة...');

      const safeSystemName = selectedSystem !== 'all' ? `_${selectedSystem}` : '';
      const safeFileName = `${activeTab}${safeSystemName}_${(context.router?.name || 'mikrotik').replace(/\s+/g, '_')}_${Date.now()}.pdf`;

      await exportViewDataToPdf(reportData, {
        orientation,
        theme,
        includeKpis,
        includeRouterInfo,
        fileName: safeFileName,
        onProgress: (pct, msg) => {
          if (!isMountedRef.current) return;
          setProgressPercent(pct);
          if (msg) setProgressMessage(msg);
        }
      });

      if (!isMountedRef.current) return;
      showToast(`تم تنزيل مستند PDF بنجاح (${estimatedPages} ${estimatedPages === 1 ? 'صفحة' : 'صفحات'})`, 'success');
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) onClose();
      }, 500);
    } catch (err: any) {
      console.error('PDF export error:', err);
      if (isMountedRef.current) {
        showToast('حدث خطأ أثناء إنشاء وتصدير ملف الـ PDF', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  };

  const handleDirectPrint = () => {
    try {
      printViewData(reportData, { orientation, theme });
      showToast('تم فتح معاينة الطباعة المباشرة للمتصفح بنجاح', 'success');
    } catch {
      showToast('تعذر فتح نافذة الطباعة، يرجى استخدام زر تنزيل PDF', 'error');
    }
  };

  // Helper counts for current active subscriber system
  const currentSubCounts =
    selectedSystem === 'hotspot'
      ? subscribersCounts.hotspot
      : selectedSystem === 'pppoe'
      ? subscribersCounts.pppoe
      : selectedSystem === 'userman'
      ? subscribersCounts.userman
      : subscribersCounts.all;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in-50 duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/80 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-500 text-white flex items-center justify-center shadow-lg shadow-rose-900/40">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>تصدير تقرير PDF رسمي منسق</span>
                <span className="text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                  {VIEW_ARABIC_NAMES[activeTab] || activeTab}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                توليد وطباعة وثيقة PDF واضحة الدقة بدقة فائقة وبدون تداخل في الكلمات
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4.5 custom-scrollbar">

          {/* 1. SUBSCRIBERS / USERS SYSTEM & STATUS SELECTION */}
          {isSubscribersView && (
            <div className="bg-slate-950/90 border border-blue-500/30 rounded-2xl p-3.5 space-y-3 shadow-inner">
              {/* System Choice: Hotspot vs PPPoE vs Userman vs All */}
              <div>
                <label className="text-xs font-bold text-blue-300 flex items-center gap-2 mb-2">
                  <Wifi className="w-3.5 h-3.5 text-blue-400" />
                  <span>اختر نظام المشتركين المراد تصديره:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('hotspot');
                      setReportTitle(`تقرير مستخدمي وبطاقات الهوتسبوت`);
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'hotspot'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>الهوتسبوت (Hotspot)</span>
                    <span className="text-[10px] font-mono opacity-80">{subscribersCounts.hotspot.total} مشترك</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('pppoe');
                      setReportTitle(`تقرير اشتراكات البرودباند PPPoE`);
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'pppoe'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>البرودباند (PPPoE)</span>
                    <span className="text-[10px] font-mono opacity-80">{subscribersCounts.pppoe.total} مشترك</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('userman');
                      setReportTitle(`تقرير مشتركي سيرفر اليوزر مانجر`);
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'userman'
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>اليوزر مانجر (UserMan)</span>
                    <span className="text-[10px] font-mono opacity-80">{subscribersCounts.userman.total} مشترك</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('all');
                      setReportTitle(`تقرير شامل لكافة المشتركين (جميع الأنظمة)`);
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'all'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>شامل كافة الأنظمة</span>
                    <span className="text-[10px] font-mono opacity-80">{subscribersCounts.all.total} مشترك</span>
                  </button>
                </div>
              </div>

              {/* Status Subset Choice: All vs Online vs Expired vs Idle vs Suspended vs Selected */}
              <div className="pt-2 border-t border-slate-800">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2 mb-2">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>تحديد فئة الجدول المراد تصديرها:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      statusFilter === 'all'
                        ? 'bg-blue-600/30 text-blue-200 border-blue-500 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>📋 الكل (All)</span>
                    <span className="font-mono text-[10px]">{currentSubCounts.total}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('online')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      statusFilter === 'online'
                        ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>🟢 المتصلين الآن</span>
                    <span className="font-mono text-[10px]">{currentSubCounts.online}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('expired')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      statusFilter === 'expired'
                        ? 'bg-amber-600/30 text-amber-200 border-amber-500 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>🟡 المنتهين (Expired)</span>
                    <span className="font-mono text-[10px]">{currentSubCounts.expired}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('idle')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      statusFilter === 'idle'
                        ? 'bg-slate-800 text-slate-200 border-slate-600 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>⚪ الخاملين (Offline)</span>
                    <span className="font-mono text-[10px]">{currentSubCounts.idle}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('suspended')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                      statusFilter === 'suspended'
                        ? 'bg-rose-600/30 text-rose-200 border-rose-500 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>🔴 المعلقين / الموقوفين</span>
                    <span className="font-mono text-[10px]">{currentSubCounts.suspended}</span>
                  </button>

                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter('selected')}
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                        statusFilter === 'selected'
                          ? 'bg-purple-600/30 text-purple-200 border-purple-500 shadow-sm'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🔵 المحددين فقط</span>
                      <span className="font-mono text-[10px]">{selectedIds.length}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. PROFILES SYSTEM & CLASSIFICATION SELECTION */}
          {isProfilesView && (
            <div className="bg-slate-950/90 border border-indigo-500/30 rounded-2xl p-3.5 space-y-3 shadow-inner">
              <div>
                <label className="text-xs font-bold text-indigo-300 flex items-center gap-2 mb-2">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  <span>اختر فئة البروفايلات المراد تصديرها:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('hotspot');
                      setReportTitle('تقرير بروفايلات الهوتسبوت');
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'hotspot'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>الهوتسبوت (Hotspot)</span>
                    <span className="text-[10px] font-mono opacity-80">{profilesCounts.hotspot} بروفايل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('pppoe');
                      setReportTitle('تقرير بروفايلات البرودباند PPPoE');
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'pppoe'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>البرودباند (PPPoE)</span>
                    <span className="text-[10px] font-mono opacity-80">{profilesCounts.pppoe} بروفايل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('userman');
                      setReportTitle('تقرير بروفايلات اليوزر مانجر');
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'userman'
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>اليوزر مانجر (UserMan)</span>
                    <span className="text-[10px] font-mono opacity-80">{profilesCounts.userman} بروفايل</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSystem('all');
                      setReportTitle('تقرير شامل لكافة البروفايلات والباقات');
                    }}
                    className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                      selectedSystem === 'all'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-900/40'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>كافة البروفايلات معاً</span>
                    <span className="text-[10px] font-mono opacity-80">{profilesCounts.all} بروفايل</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-2 mb-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400" />
                  <span>تحديد نوع الباقات:</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      statusFilter === 'all'
                        ? 'bg-blue-600/30 text-blue-200 border-blue-500 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    كافة البروفايلات
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('limited')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      statusFilter === 'limited'
                        ? 'bg-amber-600/30 text-amber-200 border-amber-500 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    باقات محددة السرعة
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('unlimited')}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      statusFilter === 'unlimited'
                        ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500 shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    باقات مفتوحة السرعة
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. ACTIVE SESSIONS SYSTEM SELECTION */}
          {isActiveSessionsView && (
            <div className="bg-slate-950/90 border border-emerald-500/30 rounded-2xl p-3.5 space-y-3 shadow-inner">
              <label className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span>اختر نوع الجلسات النشطة لتضمينها في التقرير:</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSystem('all')}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    selectedSystem === 'all'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-900/40'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>كافة الجلسات النشطة</span>
                  <span className="text-[10px] font-mono opacity-80">{activeSessionCounts.all} متصل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSystem('hotspot')}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    selectedSystem === 'hotspot'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/40'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>جلسات الهوتسبوت</span>
                  <span className="text-[10px] font-mono opacity-80">{activeSessionCounts.hotspot} متصل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSystem('pppoe')}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    selectedSystem === 'pppoe'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-900/40'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>جلسات PPPoE</span>
                  <span className="text-[10px] font-mono opacity-80">{activeSessionCounts.pppoe} متصل</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSystem('userman')}
                  className={`px-2.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    selectedSystem === 'userman'
                      ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-900/40'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>جلسات اليوزر مانجر</span>
                  <span className="text-[10px] font-mono opacity-80">{activeSessionCounts.userman} متصل</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. OTHER VIEWS (DHCP, Queues, Firewall, Logs) FILTERS */}
          {isDhcpView && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 space-y-2">
              <label className="text-xs font-bold text-slate-300">تصنيف عناوين DHCP:</label>
              <div className="grid grid-cols-4 gap-2">
                {['all', 'bound', 'dynamic', 'static'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-2 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      statusFilter === f ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {f === 'all' ? 'كافة العناوين' : f === 'bound' ? 'النشطة Bound' : f === 'dynamic' ? 'ديناميكية' : 'ثابتة Static'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isQueuesView && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 space-y-2">
              <label className="text-xs font-bold text-slate-300">تصنيف محددات السرعة (Queues):</label>
              <div className="grid grid-cols-3 gap-2">
                {['all', 'active', 'disabled'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-2 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      statusFilter === f ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {f === 'all' ? 'كافة الكيوز' : f === 'active' ? 'الفعالة والنشطة' : 'المعطلة'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isFirewallView && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 space-y-2">
              <label className="text-xs font-bold text-slate-300">نوع وتصنيف قواعد الجدار الناري:</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {['all', 'filter', 'nat', 'mangle'].map((sys) => (
                  <button
                    key={sys}
                    type="button"
                    onClick={() => setSelectedSystem(sys)}
                    className={`px-2 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      selectedSystem === sys ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {sys === 'all' ? 'كافة الجداول' : sys === 'filter' ? 'الفلترة Filter' : sys === 'nat' ? 'توجيه NAT' : 'Mangle'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['all', 'drop', 'accept'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-2 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      statusFilter === f ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {f === 'all' ? 'كافة الإجراءات' : f === 'drop' ? 'قواعد الحظر Drop' : 'قواعد السماح Accept'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLogsView && (
            <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 space-y-2">
              <label className="text-xs font-bold text-slate-300">تصنيف سجلات الأحداث:</label>
              <div className="grid grid-cols-4 gap-2">
                {['all', 'errors', 'hotspot', 'system'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setStatusFilter(f)}
                    className={`px-2 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      statusFilter === f ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {f === 'all' ? 'كافة الأحداث' : f === 'errors' ? 'الأخطاء والتحذير' : f === 'hotspot' ? 'الهوتسبوت' : 'أحداث النظام'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 5. EDITABLE REPORT TITLE */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>عنوان التقرير (المستند الرسمي):</span>
              <button
                type="button"
                onClick={() => setReportTitle(customTitle || VIEW_ARABIC_NAMES[activeTab] || 'تقرير النظام')}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
              >
                استعادة العنوان الافتراضي
              </button>
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder="اكتب عنوان التقرير..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* 6. ORIENTATION & THEME */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Orientation */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">اتجاه الصفحة (A4 Orientation):</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    orientation === 'portrait'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-200 font-bold shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="w-4 h-6 border-2 border-current rounded-sm"></div>
                  <span className="text-xs">عمودي (Portrait)</span>
                  <span className="text-[10px] text-slate-500">للجداول والقوائم</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    orientation === 'landscape'
                      ? 'bg-blue-600/20 border-blue-500 text-blue-200 font-bold shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="w-6 h-4 border-2 border-current rounded-sm"></div>
                  <span className="text-xs">أفقي (Landscape)</span>
                  <span className="text-[10px] text-slate-500">للأعمدة العريضة</span>
                </button>
              </div>
            </div>

            {/* Visual Theme */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300">نمط التنسيق اللوني:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme('corporate')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    theme === 'corporate'
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-bold shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs">مؤسسي حديث</span>
                  <span className="text-[10px] text-slate-500">ألوان وتظليل أنيق</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('print')}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${
                    theme === 'print'
                      ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 font-bold shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs">طباعة اقتصادي</span>
                  <span className="text-[10px] text-slate-500">خلفية بيضاء نقية</span>
                </button>
              </div>
            </div>
          </div>

          {/* 7. INCLUSION TOGGLES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2.5 bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl cursor-pointer hover:bg-slate-900/60 transition-colors">
              <input
                type="checkbox"
                checked={includeKpis}
                onChange={(e) => setIncludeKpis(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0 focus:outline-none"
              />
              <div className="text-right">
                <div className="text-xs font-bold text-slate-200">تضمين ملخص المؤشرات (KPIs)</div>
                <div className="text-[10px] text-slate-400">بطاقات إحصائية ملخصة في رأس التقرير</div>
              </div>
            </label>

            <label className="flex items-center gap-2.5 bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl cursor-pointer hover:bg-slate-900/60 transition-colors">
              <input
                type="checkbox"
                checked={includeRouterInfo}
                onChange={(e) => setIncludeRouterInfo(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-0 focus:outline-none"
              />
              <div className="text-right">
                <div className="text-xs font-bold text-slate-200">تضمين بيانات السيرفر والعتاد</div>
                <div className="text-[10px] text-slate-400">الموديل، عنوان IP، المعالج، والذاكرة</div>
              </div>
            </label>
          </div>

          {/* 8. DOCUMENT SPECS & LIVE PREVIEW BADGES */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                معاينة مواصفات التقرير المولد:
              </span>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                ~ {estimatedPages} {estimatedPages === 1 ? 'صفحة A4' : 'صفحات A4'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">إجمالي السجلات المشمولة</div>
                <div className="text-sm font-bold text-white font-mono mt-0.5">{totalRowsCount}</div>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">السيرفر المصدر</div>
                <div className="text-xs font-bold text-blue-400 truncate mt-0.5">{context.router?.name || 'MikroTik'}</div>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">الأقسام في المستند</div>
                <div className="text-sm font-bold text-purple-400 font-mono mt-0.5">{reportData.sections.length}</div>
              </div>
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400">وضوح الطباعة</div>
                <div className="text-xs font-bold text-emerald-400 font-mono mt-0.5">Vector / 2.5x Retina</div>
              </div>
            </div>

            {includeKpis && reportData.kpis.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {reportData.kpis.map((k, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-medium"
                  >
                    {k.label}: <strong className="text-blue-400 font-mono" dir="ltr">{k.value}</strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Progress Bar (during generation) */}
          {isGenerating && (
            <div className="bg-blue-950/60 border border-blue-500/40 rounded-2xl p-4 space-y-2 animate-in fade-in-50">
              <div className="flex items-center justify-between text-xs font-bold text-blue-200">
                <span>{progressMessage || 'جاري توليد ملف الـ PDF...'}</span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-[10px] text-blue-300/80 text-center font-mono">
                يرجى الانتظار، يتم تحويل وتنسيق الصفحات بدقة فائقة وبدون تداخل
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950/80 border-t border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            إلغاء
          </button>

          <div className="flex items-center gap-2">
            {/* Direct Browser Print / Preview */}
            <button
              type="button"
              onClick={handleDirectPrint}
              disabled={isGenerating || totalRowsCount === 0}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
              title="معاينة الطباعة المباشرة عبر المتصفح"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span>معاينة وطباعة</span>
            </button>

            {/* Download PDF Document */}
            <button
              type="button"
              onClick={handleStartExport}
              disabled={isGenerating || totalRowsCount === 0}
              className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50 min-w-[200px]"
            >
              <FileDown className={`w-4 h-4 ${isGenerating ? 'animate-bounce' : ''}`} />
              <span>{isGenerating ? 'جاري التوليد والتنزيل...' : 'تنزيل ملف PDF الآن'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
