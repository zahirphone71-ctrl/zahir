import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../../context/MikroTikContext';
import { AntiSharingStatus } from '../../types/mikrotik';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  RotateCcw,
  Copy,
  Check,
  Terminal,
  Server,
  Layers,
  Info,
  X,
  Lock,
  Wifi,
  Sparkles
} from 'lucide-react';

interface AntiSharingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RAW_ROUTEROS_SCRIPT = `# ==========================================================
# ZCTRL UNIVERSAL ANTI-SHARING & ANTI-TETHERING v4.0
# RouterOS 6.x / 7.x — HotSpot + PPP + User Manager
# Covers: credential sharing, tethering, proxy bypass
# ==========================================================

:local ts [:pick [/system clock get date] 0 11]
:local backupName ("zctrl-antishare-v4-before-" . $ts)

:log info "ZCTRL: Anti-Sharing v4.0 starting"

# ----------------------------------------------------------
# 01. BACKUP (timestamped, never overwrite)
# ----------------------------------------------------------
:if ([:len [/file find where name=$backupName]] > 0) do={
    /file remove [find where name=$backupName]
}
/system backup save name=$backupName
/export hide-sensitive file=$backupName
:log info ("ZCTRL: Backup saved as " . $backupName)

# ----------------------------------------------------------
# 02. CREDENTIAL SHARING (Hotspot + PPP + User Manager)
# ----------------------------------------------------------

# 02a. HOTSPOT PROFILES (existing + future users inherit)
:local hpCount 0
:foreach p in=[/ip hotspot user profile find] do={
    /ip hotspot user profile set $p shared-users=1
    :set hpCount ($hpCount + 1)
}
:log info ("ZCTRL: Hotspot profiles updated = " . $hpCount)

# 02b. PPP PROFILES (existing + future users inherit)
:local ppCount 0
:foreach p in=[/ppp profile find] do={
    /ppp profile set $p only-one=yes
    :set ppCount ($ppCount + 1)
}
:log info ("ZCTRL: PPP profiles updated = " . $ppCount)

# 02c. ROS7 USER MANAGER — set on PROFILE (not user)
:do {
    :local umCount 0
    :foreach p in=[/user-manager profile find] do={
        /user-manager profile set $p shared-users=1
        :set umCount ($umCount + 1)
    }
    :log info ("ZCTRL: ROS7 UM profiles updated = " . $umCount)
} on-error={
    :log info "ZCTRL: ROS7 User Manager not available"
}

# 02d. ROS6 LEGACY USER MANAGER — set on PROFILE
:do {
    :local lmCount 0
    :foreach p in=[/tool user-manager profile find] do={
        /tool user-manager profile set $p shared-users=1
        :set lmCount ($lmCount + 1)
    }
    :log info ("ZCTRL: ROS6 UM profiles updated = " . $lmCount)
} on-error={
    :log info "ZCTRL: ROS6 User Manager not available"
}

# ----------------------------------------------------------
# 03. ANTI-TETHERING (Bluetooth / Wi-Fi Hotspot / USB)
# Forces TTL=1 on traffic leaving LAN toward clients
# ----------------------------------------------------------
/ip firewall mangle add chain=postrouting out-interface=LAN \\
    action=change-ttl new-ttl=set:1 passthrough=no \\
    comment="ZCTRL Anti-Tethering: force TTL=1"

:log info "ZCTRL: TTL Mangle added for interface LAN"

# ----------------------------------------------------------
# 04. ANTI-PROXY (block unauthorized proxy apps/hotspots)
# Drops common proxy ports used to bypass HotSpot/TTL limits
# ----------------------------------------------------------
/ip firewall filter add chain=forward protocol=tcp \\
    dst-port=3128,54321,6515,6666,8000,8001,8008,808,8080,8081,8088 \\
    action=drop comment="ZCTRL Anti-Proxy: Drop common proxy ports (1/2)"

/ip firewall filter add chain=forward protocol=tcp \\
    dst-port=8090,81,8118,8181,82,83,84,85,86,8888,8909,9000,9090 \\
    action=drop comment="ZCTRL Anti-Proxy: Drop common proxy ports (2/2)"

:log info "ZCTRL: Anti-Proxy forward filter rules added"

# ----------------------------------------------------------
# 05. VERIFICATION
# ----------------------------------------------------------
:local unprotHP [:len [/ip hotspot user profile find where shared-users>1]]
:local unprotPP [:len [/ppp profile find where only-one=no]]

:if ($unprotHP = 0 and $unprotPP = 0) do={
    :log info "ZCTRL: Anti-Sharing v4.0 APPLIED SUCCESSFULLY"
} else={
    :log warn ("ZCTRL: WARNING - Unprotected profiles remain: HP=" . $unprotHP . " PPP=" . $unprotPP)
}`;

export const AntiSharingModal: React.FC<AntiSharingModalProps> = ({ isOpen, onClose }) => {
  const { fetchAntiSharingStatus, applyAntiSharing, revertAntiSharing, showToast } = useMikroTik();

  const [activeTab, setActiveTab] = useState<'execute' | 'details' | 'code'>('execute');
  const [status, setStatus] = useState<AntiSharingStatus | null>(null);
  const [selectedLanInterface, setSelectedLanInterface] = useState<string>('LAN');
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [copiedScript, setCopiedScript] = useState(false);

  const isMountedRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [executionLogs]);

  // Load Status when Modal opens
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadStatus = async () => {
      setIsLoadingStatus(true);
      try {
        const res = await fetchAntiSharingStatus();
        if (cancelled || !isMountedRef.current) return;
        const data: AntiSharingStatus | undefined = res.status || res.data;
        if (data) {
          setStatus(data);
          if (data.defaultLanInterface) {
            setSelectedLanInterface(data.defaultLanInterface);
          }
        }
      } catch (err: any) {
        if (!cancelled && isMountedRef.current && err?.name !== 'AbortError') {
          showToast('تعذر جلب حالة منع المشاركة من الراوتر', 'error');
        }
      } finally {
        if (!cancelled && isMountedRef.current) {
          setIsLoadingStatus(false);
        }
      }
    };

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [isOpen, fetchAntiSharingStatus, showToast]);

  if (!isOpen) return null;

  // Handle Apply Anti-Sharing
  const handleApply = async () => {
    setIsExecuting(true);
    setExecutionLogs([
      `[${new Date().toLocaleTimeString()}] 🚀 بدء تنفيذ حزمة ZCTRL Universal Anti-Sharing v4.0...`,
      `[${new Date().toLocaleTimeString()}] 📡 الواجهة المختارة للتطبيق: ${selectedLanInterface}`
    ]);

    try {
      const res = await applyAntiSharing({ lanInterface: selectedLanInterface, createBackup: true });
      if (!isMountedRef.current) return;
      if (res.success && res.data) {
        setExecutionLogs((prev) => [
          ...prev,
          ...(res.data?.logs || []).map((l: string) => `[${new Date().toLocaleTimeString()}] ${l}`),
          `[${new Date().toLocaleTimeString()}] ✅ ${res.message || 'تم التطبيق بنجاح'}`
        ]);
        showToast(res.message || 'تم تطبيق حماية منع مشاركة وبث الانترنت بنجاح على المايكروتك', 'success');

        // Refresh Status
        const statusRes = await fetchAntiSharingStatus();
        if (!isMountedRef.current) return;
        const data: AntiSharingStatus | undefined = statusRes.status || statusRes.data;
        if (data) {
          setStatus(data);
        }
      } else {
        const errMsg = res.message || 'فشل تطبيق الحماية على الراوتر';
        setExecutionLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] ❌ خطأ: ${errMsg}`
        ]);
        showToast(errMsg, 'error');
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      const errMsg = err?.message || 'حدث خطأ غير متوقع أثناء التنفيذ';
      setExecutionLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ استثناء: ${errMsg}`
      ]);
      showToast(errMsg, 'error');
    } finally {
      if (isMountedRef.current) setIsExecuting(false);
    }
  };

  // Handle Revert Anti-Sharing
  const handleRevert = async () => {
    setIsReverting(true);
    try {
      const res = await revertAntiSharing();
      if (!isMountedRef.current) return;
      if (res.success) {
        showToast(res.message || 'تم إزالة قواعد Mangle والبروكسي بنجاح', 'success');
        setExecutionLogs((prev) => [
          ...prev,
          `[${new Date().toLocaleTimeString()}] 🔄 تم إرجاع قواعد الجدار الناري بنجاح: تم حذف قواعد منع البث والبروكسي.`
        ]);
        const statusRes = await fetchAntiSharingStatus();
        if (!isMountedRef.current) return;
        const data: AntiSharingStatus | undefined = statusRes.status || statusRes.data;
        if (data) {
          setStatus(data);
        }
      } else {
        showToast(res.message || 'فشل التراجع عن القواعد', 'error');
      }
    } catch {
      if (isMountedRef.current) showToast('خطأ أثناء التراجع', 'error');
    } finally {
      if (isMountedRef.current) setIsReverting(false);
    }
  };

  // Copy script
  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(RAW_ROUTEROS_SCRIPT);
      if (!isMountedRef.current) return;
      setCopiedScript(true);
      showToast('تم نسخ كود RouterOS v4.0 إلى الحافظة', 'success');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setCopiedScript(false);
      }, 2000);
    } catch {
      showToast('تعذر نسخ الكود إلى الحافظة', 'error');
    }
  };

  const isFullyProtected = Boolean(status?.isFullyProtected);
  const hsProtected = status?.hotspot ? status.hotspot.unprotected === 0 : false;
  const pppProtected = status?.ppp ? status.ppp.unprotected === 0 : false;
  const umProtected = status?.userManager ? status.userManager.unprotected === 0 : false;
  const ttlActive = Boolean(status?.antiTetheringMangle?.active);
  const proxyActive = Boolean(status?.antiProxyFilters?.active);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      dir="rtl"
      id="modal-anti-sharing"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-rose-950/30 to-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/50">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-white">
                  منع مشاركة وبث الإنترنت (Anti-Sharing & Tethering)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono">
                  v4.0 Universal
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                تأمين الهوتسبوت، PPP، ويوزر مانجر ضد مشاركة الكروت، وبث الواي فاي الثانوي (Hotspot Sharing)، وتجاوز البروكسي عبر TTL=1.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setIsLoadingStatus(true);
                try {
                  const res = await fetchAntiSharingStatus();
                  if (!isMountedRef.current) return;
                  const data: AntiSharingStatus | undefined = res.status || res.data;
                  if (res.success !== false && data) {
                    setStatus(data);
                    showToast('تم تحديث حالة الحماية من الراوتر', 'success');
                  } else {
                    showToast(res.message || 'تعذر جلب حالة الحماية من الراوتر', 'error');
                  }
                } catch {
                  if (isMountedRef.current) showToast('تعذر الاتصال بالراوتر لتحديث الحالة', 'error');
                } finally {
                  if (isMountedRef.current) setIsLoadingStatus(false);
                }
              }}
              disabled={isLoadingStatus || isExecuting}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all disabled:opacity-50"
              title="تحديث الحالة"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingStatus ? 'animate-spin text-rose-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
              id="btn-close-anti-sharing"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Quick Banner */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400">حالة الحماية العامة:</span>
            {isLoadingStatus ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> جاري الفحص الحي...
              </span>
            ) : isFullyProtected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                الشبكة محمية بالكامل من المشاركة
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                الحماية غير مكتملة — تحتاج لتنفيذ الإجراء
              </span>
            )}
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('execute')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'execute'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              التنفيذ واللوحة 🚀
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'details'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              تفاصيل الفحص والقواعد 🔍
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'code'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              كود RouterOS المصدري 📜
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: EXECUTE & CONTROL */}
          {activeTab === 'execute' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* 5 Security Pillars Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* 1. Hotspot Profiles */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${hsProtected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <Lock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-200 block">بروفايلات الهوتسبوت</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      قفل المشتركين المتزامنين: <span dir="ltr" className="font-mono text-white">shared-users=1</span>
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      {hsProtected ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> محمي بالكامل ({status?.hotspot.total || 0} بروفايل)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> يحتاج ضبط ({status?.hotspot.unprotected || 0} غير محمي)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. PPP Profiles */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${pppProtected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <Server className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-200 block">بروفايلات اشتراكات PPP</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      حصر الجلسة الفردية: <span dir="ltr" className="font-mono text-white">only-one=yes</span>
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      {pppProtected ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> محمي بالكامل ({status?.ppp.total || 0} بروفايل)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> يحتاج ضبط ({status?.ppp.unprotected || 0} غير محمي)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. User Manager Profiles */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${umProtected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Layers className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-200 block">يوزر مانجر ({status?.userManager.version || 'ROS'})</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      ضبط <span dir="ltr" className="font-mono text-white">shared-users=1</span> على البروفايل
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      {umProtected ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> محمي أو غير مفعل
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> يحتاج فحص ({status?.userManager.unprotected || 0})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. Anti-Tethering Mangle TTL=1 */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${ttlActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-200 block">منع البث الثانوي (Anti-Tethering)</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      جعل <span dir="ltr" className="font-mono text-white">TTL=1</span> على واجهة خروج المشتركين
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      {ttlActive ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> قاعدة Mangle مفعلة ({status?.antiTetheringMangle.interface})
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> قاعدة TTL غير مضافة
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 5. Anti-Proxy Filter Rules */}
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-start gap-3 sm:col-span-2 lg:col-span-2">
                  <div className={`p-2.5 rounded-xl shrink-0 ${proxyActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-bold text-slate-200 block">حظر منافذ البروكسي وتطبيقات الالتفاف (Anti-Proxy)</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      إسقاط اتصالات المنافذ المخصصة لمشاركة النت مثل (Every Proxy, NetShare, Proxy Server)
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      {proxyActive ? (
                        <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> قواعد حظر البروكسي نشطة ({status?.antiProxyFilters.rulesCount || 2} قاعدة)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> قواعد الفلتر غير مضافة
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Execution Options & LAN Interface Selector */}
              <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label htmlFor="anti-sharing-lan-select" className="text-xs font-bold text-slate-300 block">
                      واجهة الخروج المحلية للعملاء (LAN Interface):
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      سيتم تطبيق قاعدة خفض الـ TTL=1 عليها لمنع هواتف وأجهزة المشتركين من إعادة توزيع النت.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      id="anti-sharing-lan-select"
                      value={selectedLanInterface}
                      onChange={(e) => setSelectedLanInterface(e.target.value)}
                      disabled={isExecuting}
                      dir="ltr"
                      className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-rose-500"
                    >
                      {status?.availableInterfaces && status.availableInterfaces.length > 0 ? (
                        status.availableInterfaces.map((iface) => (
                          <option key={iface} value={iface}>
                            {iface}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="LAN">LAN (افتراضي)</option>
                          <option value="bridge">bridge</option>
                          <option value="bridge1">bridge1</option>
                          <option value="ether2">ether2</option>
                        </>
                      )}
                    </select>

                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={isExecuting || isReverting}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 hover:from-rose-500 hover:to-amber-500 text-white text-xs sm:text-sm font-black transition-all shadow-lg shadow-rose-900/40 active:scale-95 disabled:opacity-50"
                      id="btn-apply-anti-sharing-now"
                    >
                      {isExecuting ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>جاري التنفيذ المباشر...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 fill-white" />
                          <span>تنفيذ إجراءات منع المشاركة الآن 🛡️</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Safety Notice */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
                  <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-bold">ضمان الأمان وعدم الانقطاع:</span> يقوم الإجراء تلقائياً بإنشاء نسخة احتياطية ذاتية باسم <span dir="ltr" className="font-mono bg-amber-950/50 px-1 py-0.5 rounded border border-amber-500/30">zctrl-antishare-v4-before-...</span> قبل أي تعديل، ولا يؤثر إطلاقاً على تصفح المشتركين الحاليين الصالحين.
                  </div>
                </div>
              </div>

              {/* Live Execution Console / Output */}
              {executionLogs.length > 0 && (
                <div className="p-4 rounded-2xl bg-black/90 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                    <span className="flex items-center gap-1.5 font-bold text-slate-200">
                      <Terminal className="w-4 h-4 text-rose-400" />
                      سجل التنفيذ الحي في الراوتر (Execution Console)
                    </span>
                    <button
                      type="button"
                      onClick={() => setExecutionLogs([])}
                      className="text-[11px] text-slate-500 hover:text-slate-300"
                    >
                      مسح السجل
                    </button>
                  </div>

                  <div className="font-mono text-xs text-slate-300 space-y-1 max-h-48 overflow-y-auto pr-2" dir="ltr">
                    {executionLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`leading-relaxed ${
                          log.includes('❌') ? 'text-rose-400 font-bold' : log.includes('✅') ? 'text-emerald-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </div>
              )}

              {/* Revert Bar */}
              {(ttlActive || proxyActive) && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-slate-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-300 block">إلغاء قيود الجدار الناري (Mangle / Proxy)</span>
                      <span className="text-[11px] text-slate-500">
                        إذا رغبت مؤقتاً في إزالة قيود الـ TTL وحظر البروكسي للتجربة.
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRevert}
                    disabled={isReverting || isExecuting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/20 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {isReverting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    <span>إلغاء قواعد الفلتر والمانجل</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DETAILED BREAKDOWN */}
          {activeTab === 'details' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-rose-400" />
                  تفاصيل حالة بروفايلات وقواعد المايكروتك
                </h3>

                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span>إجمالي بروفايلات الهوتسبوت:</span>
                    <span className="font-mono font-bold text-white">{status?.hotspot.total ?? '-'}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span>بروفايلات هوتسبوت غير مقفلة (shared-users &gt; 1):</span>
                    <span className={`font-mono font-bold ${status?.hotspot.unprotected ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {status?.hotspot.unprotected ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span>إجمالي بروفايلات PPP:</span>
                    <span className="font-mono font-bold text-white">{status?.ppp.total ?? '-'}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span>بروفايلات PPP غير مقفلة (only-one=no):</span>
                    <span className={`font-mono font-bold ${status?.ppp.unprotected ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {status?.ppp.unprotected ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span>قواعد Mangle المضافة (TTL=1):</span>
                    <span className="font-mono font-bold text-cyan-400">{status?.antiTetheringMangle.active ? 1 : 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span>قواعد إسقاط منافذ البروكسي (Filter Drop):</span>
                    <span className="font-mono font-bold text-cyan-400">{status?.antiProxyFilters.rulesCount ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <span>الواجهات المتوفرة على الراوتر:</span>
                    <span className="font-mono text-slate-400" dir="ltr">
                      {(status?.availableInterfaces || []).join(', ') || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SOURCE CODE */}
          {activeTab === 'code' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  كود RouterOS Script v4.0 المعتمد والمدمج داخل المايكروتك:
                </span>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all"
                >
                  {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedScript ? 'تم النسخ!' : 'نسخ الكود بالكامل'}</span>
                </button>
              </div>

              <div className="relative rounded-2xl bg-black border border-slate-800 p-4 font-mono text-xs text-slate-300 max-h-96 overflow-y-auto" dir="ltr">
                <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 selection:bg-rose-900 selection:text-white">
                  {RAW_ROUTEROS_SCRIPT}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>نظام زاهر كنترول · أمان الشبكات وإدارة التوزيع العادل للإنترنت</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
