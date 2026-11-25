import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { secureFetch } from '../lib/api';
import {
  HardDrive,
  Download,
  RotateCcw,
  Power,
  RefreshCw,
  FileCode,
  ShieldAlert,
  CheckCircle,
  Copy,
  Server,
  Settings,
  CalendarClock,
  ArrowLeft,
  Clock,
  Sparkles,
  Archive
} from 'lucide-react';

interface BackupSettingsViewProps {
  onNavigate?: (tab: string) => void;
}

export const BackupSettingsView: React.FC<BackupSettingsViewProps> = ({ onNavigate }) => {
  const { router, users, profiles, pppSecrets, simpleQueues, rebootRouter, showToast, syncNow, scheduledTasks } = useMikroTik();

  const [routerName, setRouterName] = useState(router?.name || router?.host || 'MikroTik');

  useEffect(() => {
    if (router?.name) setRouterName(router.name);
  }, [router?.name]);
  const [exportedScript, setExportedScript] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isSavingIdentity, setIsSavingIdentity] = useState(false);
  const [isFlushingDns, setIsFlushingDns] = useState(false);
  const [isRebooting, setIsRebooting] = useState(false);
  const [showRebootConfirm, setShowRebootConfirm] = useState(false);

  const isMountedRef = useRef(true);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const identityAbortRef = useRef<AbortController | null>(null);
  const backupAbortRef = useRef<AbortController | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const flushAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      identityAbortRef.current?.abort();
      backupAbortRef.current?.abort();
      exportAbortRef.current?.abort();
      flushAbortRef.current?.abort();
    };
  }, []);

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = routerName.trim();
    if (!cleanName || isSavingIdentity) return;
    identityAbortRef.current?.abort();
    const controller = new AbortController();
    identityAbortRef.current = controller;
    setIsSavingIdentity(true);
    try {
      const res = await secureFetch('/api/mikrotik/system/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message || `تم تغيير اسم جهاز ZCtrl إلى (${cleanName})`, 'success');
        syncNow();
      } else {
        showToast(data.message || 'فشل تغيير اسم الراوتر', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast('تعذر تغيير اسم الراوتر', 'error');
    } finally {
      if (isMountedRef.current) setIsSavingIdentity(false);
    }
  };

  const handleCreateBinaryBackup = async () => {
    if (isBackingUp) return;
    backupAbortRef.current?.abort();
    const controller = new AbortController();
    backupAbortRef.current = controller;
    setIsBackingUp(true);
    try {
      const res = await secureFetch('/api/mikrotik/system/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${routerName || 'backup'}_${new Date().toISOString().slice(0, 10)}` }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message || 'تم أخذ نسخة احتياطية حقيقية (.backup) بنجاح وحفظها بالراوتر', 'success');
        syncNow();
      } else {
        showToast(data.message || 'فشل أخذ النسخة الاحتياطية', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast('تعذر إنشاء النسخة الاحتياطية', 'error');
    } finally {
      if (isMountedRef.current) setIsBackingUp(false);
    }
  };

  const handleGenerateBackupScript = async () => {
    if (isExporting) return;
    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setIsExporting(true);
    try {
      const res = await secureFetch('/api/mikrotik/system/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compact: true }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success && data.script) {
        setExportedScript(data.script);
        showToast('تم تصدير وتوليد سكربت الإعدادات (.rsc) بنجاح من المايكروتك', 'success');
      } else {
        showToast(data.message || 'فشل تصدير سكربت الإعدادات من المايكروتك', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast('تعذر تصدير السكربت', 'error');
    } finally {
      if (isMountedRef.current) setIsExporting(false);
    }
  };

  const handleDownloadBackupFile = () => {
    const backupContent = exportedScript || `# MikroTik Backup RSC Export\n# Identity: ${router?.name || routerName}\n# Total Hotspot Users: ${users.length}\n# Total Profiles: ${profiles.length}\n# Total PPP Secrets: ${pppSecrets?.length || 0}\n# Total Queues: ${simpleQueues?.length || 0}\n/export compact\n`;
    const blob = new Blob([backupContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${router?.name || 'mikrotik'}_backup_${new Date().toISOString().slice(0, 10)}.rsc`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      URL.revokeObjectURL(url);
    }, 1000);
    timersRef.current.add(timer);
    showToast('تم تحميل ملف النسخة الاحتياطية .rsc', 'success');
  };

  const handleCopyScript = async () => {
    if (!exportedScript) return;
    try {
      await navigator.clipboard.writeText(exportedScript);
      if (isMountedRef.current) showToast('تم نسخ السكربت بالكامل', 'success');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = exportedScript;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(ta);
        if (isMountedRef.current) {
          showToast(copied ? 'تم نسخ السكربت بالكامل' : 'تعذر نسخ السكربت تلقائياً', copied ? 'success' : 'error');
        }
      } catch {
        if (isMountedRef.current) showToast('تعذر نسخ السكربت للحافظة', 'error');
      }
    }
  };

  const handleFlushDns = async () => {
    if (isFlushingDns) return;
    flushAbortRef.current?.abort();
    const controller = new AbortController();
    flushAbortRef.current = controller;
    setIsFlushingDns(true);
    try {
      const res = await secureFetch('/api/mikrotik/system/flush-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        showToast(data.message || 'تم تفريغ وحذف كاش الـ DNS بنجاح', 'success');
      } else {
        showToast(data.message || 'فشل تفريغ كاش DNS', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      showToast('تعذر تفريغ كاش DNS', 'error');
    } finally {
      if (isMountedRef.current) setIsFlushingDns(false);
    }
  };

  const handleReboot = async () => {
    if (isRebooting) return;
    setIsRebooting(true);
    try {
      const res = await rebootRouter();
      if (!isMountedRef.current) return;
      if (res.success) {
        showToast('تم إرسال أمر إعادة تشغيل جهاز ZCtrl بنجاح...', 'info');
      } else {
        showToast(res.message || 'فشل إرسال أمر إعادة التشغيل', 'error');
      }
    } catch {
      if (isMountedRef.current) showToast('تعذر إرسال أمر إعادة التشغيل', 'error');
    } finally {
      if (isMountedRef.current) setIsRebooting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
          <HardDrive className="w-6 h-6 text-blue-400" />
          <span>النسخ الاحتياطي، التصدير وإعدادات النظام (System & Backup)</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          أخذ نسخ احتياطية شاملة، تصدير ملفات السكربت (.rsc)، إعادة التشغيل، والتحكم بخصائص السيرفر
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Router Identity Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-100 border-b border-slate-800 pb-3">
            <Server className="w-4 h-4 text-blue-400" />
            <span>تسمية السيرفر (Router Identity)</span>
          </div>

          <form onSubmit={handleSaveIdentity} className="space-y-4 text-xs">
            <div>
              <label className="text-slate-300 mb-1.5 block">اسم الجهاز في شبكة ZCtrl:</label>
              <input
                type="text"
                value={routerName}
                onChange={(e) => setRouterName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-100 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingIdentity || !routerName.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:opacity-50 cursor-pointer"
            >
              {isSavingIdentity ? 'جاري الحفظ...' : 'حفظ التسمية في ZCtrl'}
            </button>
          </form>
        </div>

        {/* Quick System Tools */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-100 border-b border-slate-800 pb-3">
            <Settings className="w-4 h-4 text-indigo-400" />
            <span>أدوات النظام السريعة (System Maintenance)</span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div>
                <div className="text-xs font-semibold text-slate-200">تفريغ كاش الـ DNS (Flush DNS)</div>
                <div className="text-[11px] text-slate-400">تنظيف الذاكرة المؤقتة لمواقع الويب</div>
              </div>
              <button
                type="button"
                onClick={handleFlushDns}
                disabled={isFlushingDns}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isFlushingDns ? 'جاري التفريغ...' : 'تفريغ الآن'}
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-rose-950/20 rounded-xl border border-rose-500/20">
              <div>
                <div className="text-xs font-semibold text-rose-300">إعادة تشغيل ZCtrl (Reboot)</div>
                <div className="text-[11px] text-slate-400">إعادة إقلاع السيرفر وتحديث الجلسات</div>
              </div>
              <button
                type="button"
                onClick={() => setShowRebootConfirm(true)}
                disabled={isRebooting}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isRebooting ? 'جاري الإرسال...' : 'إعادة التشغيل'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Automated Task Scheduling Highlight Card */}
      <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-500/30 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-400">
                <CalendarClock className="w-5 h-5" />
              </span>
              <h3 className="text-sm font-bold text-slate-100">
                الجدولة التلقائية للمهام (RouterOS Scheduled Tasks)
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono border border-blue-500/30">
                {scheduledTasks.filter(t => !t.disabled).length} مهام نشطة
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              يمكنك جدولة إعادة التشغيل اليومي التلقائي (مثل الفجر في 04:00 AM لتفريغ الرام)، والنسخ الاحتياطي التلقائي اليومي دون أي تدخل يدوي، مع حفظ واستعادة الإعدادات بأمان.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px]">
              {(() => {
                const rebootTask = scheduledTasks.find(t => t.onEvent?.includes('reboot') || t.name?.toLowerCase().includes('reboot'));
                const backupTask = scheduledTasks.find(t => t.onEvent?.includes('backup') || t.name?.toLowerCase().includes('backup'));
                return (
                  <>
                    <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                      rebootTask && !rebootTask.disabled
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}>
                      <Clock className="w-3.5 h-3.5" />
                      <span>إعادة التشغيل اليومي:</span>
                      <strong className="font-mono">
                        {rebootTask && !rebootTask.disabled ? `نشط (${rebootTask.startTime || '04:00:00'})` : 'غير مجدول'}
                      </strong>
                    </div>

                    <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                      backupTask && !backupTask.disabled
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400'
                    }`}>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>النسخ الاحتياطي الآلي:</span>
                      <strong className="font-mono">
                        {backupTask && !backupTask.disabled ? `نشط (${backupTask.startTime || '03:30:00'})` : 'غير مجدول'}
                      </strong>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('scheduled_tasks')}
              className="shrink-0 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer hover:gap-3"
            >
              <span>فتح تبويب المهام المجدولة</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Backup & Export Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>تصدير إعدادات وسكربت النسخ الاحتياطي (.RSC Backup Script)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              توليد سكربت نصي يحتوي على كافة إعدادات الهوتسبوت والمستخدمين والبروفايلات
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCreateBinaryBackup}
              disabled={isBackingUp}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="إنشاء نسخة احتياطية ثنائية كاملة وحفظها في ذاكرة الراوتر"
            >
              <Archive className={`w-3.5 h-3.5 ${isBackingUp ? 'animate-spin' : ''}`} />
              <span>{isBackingUp ? 'جاري أخذ النسخة...' : 'أخذ نسخة ثنائية (.backup)'}</span>
            </button>

            <button
              onClick={handleGenerateBackupScript}
              disabled={isExporting}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isExporting ? 'animate-spin' : ''}`} />
              <span>{isExporting ? 'جاري التصدير...' : 'توليد سكربت (.rsc)'}</span>
            </button>

            <button
              onClick={handleDownloadBackupFile}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل ملف السكربت (.rsc)</span>
            </button>
          </div>
        </div>

        {exportedScript ? (
          <div className="relative">
            <pre
              className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono overflow-x-auto max-h-72 whitespace-pre-wrap text-left"
              dir="ltr"
            >
              {exportedScript}
            </pre>
            <button
              type="button"
              onClick={handleCopyScript}
              className="absolute top-3 right-3 bg-slate-800/80 hover:bg-slate-700 text-slate-300 p-2 rounded-lg text-xs flex items-center gap-1 border border-slate-700 backdrop-blur cursor-pointer"
              title="نسخ"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-center py-8 bg-slate-950/50 rounded-xl border border-slate-800/60 text-xs text-slate-500">
            اضغط على &quot;توليد السكربت&quot; لعرض وتصدير كود إعدادات ZCtrl الحالية بالكامل
          </div>
        )}
      </div>

      {/* Reboot Confirmation Modal */}
      {showRebootConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4 text-right">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-bold text-slate-100">تحذير: إعادة تشغيل جهاز المايكروتك</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              تحذير: أنت على وشك إرسال أمر إعادة التشغيل (Reboot) لجهاز الراوتر ميكروتك ZCtrl. 
              هذا الإجراء سيؤدي إلى انقطاع الإنترنت مؤقتاً وفصل جميع المشتركين المتصلين حالياً حتى يكتمل إقلاع الجهاز.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRebootConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 cursor-pointer"
              >
                تراجع وإلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowRebootConfirm(false);
                  await handleReboot();
                }}
                className="px-5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-500 shadow-md shadow-rose-600/30 cursor-pointer"
              >
                نعم، أعد التشغيل الآن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
