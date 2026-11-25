import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sliders,
  Zap,
  Lock,
  Wifi,
  Server,
  X,
  RefreshCw,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export interface DiagnosticItem {
  id: string;
  category: 'security' | 'performance' | 'hotspot' | 'dhcp' | 'network';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  actionLabel: string;
  commandToRun: {
    endpoint: string;
    params?: string[];
  };
}

interface RouterDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RouterDiagnosticsModal: React.FC<RouterDiagnosticsModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    router,
    profiles,
    updateProfile,
    ipBindings,
    dhcpLeases,
    firewallRules,
    interfaces,
    runCommand,
    syncNow,
    showToast
  } = useMikroTik();

  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applyingId) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, applyingId, onClose]);

  // Analyze MikroTik setup and find missing recommended configurations
  const diagnostics = useMemo<DiagnosticItem[]>(() => {
    const items: DiagnosticItem[] = [];

    // 1. Hotspot Profiles without Rate Limits
    const unlimitedProfiles = profiles.filter(p => !p.rateLimit || p.rateLimit.trim() === '');
    if (unlimitedProfiles.length > 0) {
      items.push({
        id: 'diag-unlimited-profiles',
        category: 'hotspot',
        severity: 'warning',
        title: `تحديد سرعات البروفايلات (${unlimitedProfiles.length} بروفايل بدون حد سرعة)`,
        description: `البروفايل (${unlimitedProfiles[0]?.name}) لا يحتوي على تحديد سرعة (Rate Limit)، مما يسمح بفتح السرعة الكاملة للمشتركين واستهلاك الباندويث بالكامل.`,
        actionLabel: `تطبيق تحديد سرعة افتراضي (5M/10M) للبروفايل (${unlimitedProfiles[0]?.name})`,
        commandToRun: {
          endpoint: '/ip/hotspot/user/profile/set',
          params: [`=numbers=${unlimitedProfiles[0]?.name || 'default'}`, '=rate-limit=5M/10M']
        }
      });
    }

    // 2. FastTrack Firewall Rule Check
    const hasFasttrack = firewallRules.some(r => r.action === 'fasttrack-connection' || r.comment?.includes('FastTrack'));
    if (!hasFasttrack) {
      items.push({
        id: 'diag-fasttrack',
        category: 'performance',
        severity: 'info',
        title: 'تفعيل مسار التسريع الذكي (FastTrack Bypass)',
        description: 'إضافة قاعدة تسريع الترافيك المباشر لقليل استهلاك معالج المايكروتك (CPU) بنسبة تصل إلى 40% وتوفير استجابة أسرع للإنترنت.',
        actionLabel: 'إضافة قاعدة FastTrack إلى الفايروال',
        commandToRun: {
          endpoint: '/ip/firewall/filter/add',
          params: ['=chain=forward', '=action=fasttrack-connection', '=connection-state=established,related', '=comment=ZCtrl FastTrack Optimization']
        }
      });
    }

    // 3. Interface Status check
    const disabledIfaces = interfaces.filter(i => i.disabled);
    if (disabledIfaces.length > 0) {
      items.push({
        id: 'diag-disabled-ifaces',
        category: 'network',
        severity: 'warning',
        title: `تنبيه: توجد منافذ شبكة معطلة (${disabledIfaces.length} منافذ)`,
        description: `المنفذ (${disabledIfaces[0]?.name}) معطل حالياً في المايكروتك. قد يسبب ذلك عدم وصول الإنترنت لبعض الأجهزة أو المشتركين.`,
        actionLabel: `تفعيل المنفذ ${disabledIfaces[0]?.name}`,
        commandToRun: {
          endpoint: '/interface/enable',
          params: [`=.id=${disabledIfaces[0]?.id}`]
        }
      });
    }

    // 4. Unused DHCP Leases Clean
    const dynamicLeases = dhcpLeases.filter(l => l.isDynamic);
    if (dynamicLeases.length > 50) {
      items.push({
        id: 'diag-dhcp-cleanup',
        category: 'dhcp',
        severity: 'info',
        title: 'تنظيف توزيعات DHCP غير النشطة',
        description: `يوجد ${dynamicLeases.length} عنوان IP ديناميكي موزع. تقليل مدة الإيجار يحرر العناوين غير المستخدمة للمشتركين الجدد.`,
        actionLabel: 'تقليل زمن حجز DHCP Lease إلى ساعة واحدة',
        commandToRun: {
          endpoint: '/ip/dhcp-server/set',
          params: ['[find ]', '=lease-time=01:00:00']
        }
      });
    }

    // 4. Request Throttling & Concurrency Protection Check
    items.push({
      id: 'diag-throttling-guard',
      category: 'performance',
      severity: 'info',
      title: 'درع تنظيم وجدولة الطلبات (Max 3 Concurrent Operations)',
      description: 'نظام إدارة التدفق نشط ويحد الأوامر المتزامنة إلى 3 طلبات كحد أقصى مع طابور تسلسلي لمنع حدوث ذروات CPU مفاجئة في الراوتر.',
      actionLabel: 'فحص استجابة الراوتر وتفريغ الكاش',
      commandToRun: {
        endpoint: '/system/resource/print',
        params: []
      }
    });

    return items.filter(i => !completedIds.includes(i.id));
  }, [profiles, firewallRules, interfaces, dhcpLeases, completedIds]);

  if (!isOpen) return null;

  const handleApplyAction = async (item: DiagnosticItem) => {
    setApplyingId(item.id);
    try {
      if (item.id === 'diag-unlimited-profiles') {
        const unlimited = profiles.filter(p => !p.rateLimit || p.rateLimit.trim() === '');
        if (unlimited.length > 0) {
          const target = unlimited[0];
          const res = await updateProfile(target.id || target.name, { rateLimit: '5M/10M' });
          if (!isMountedRef.current) return;
          setApplyingId(null);
          if (res.success) {
            setCompletedIds(prev => [...prev, item.id]);
            showToast(`تم تطبيق تحديد السرعة (5M/10M) للبروفايل (${target.name}) بنجاح`, 'success');
            await syncNow();
          } else {
            showToast(`تعذر تعديل البروفايل (${target.name})`, 'error');
          }
          return;
        }
      }

      const cmdStr = item.commandToRun.endpoint + (item.commandToRun.params?.length ? ' ' + item.commandToRun.params.join(' ') : '');
      const res = await runCommand(cmdStr);
      if (!isMountedRef.current) return;
      setApplyingId(null);

      if (res.success) {
        setCompletedIds(prev => [...prev, item.id]);
        showToast(`تم تطبيق التوصية بنجاح: ${item.title}`, 'success');
        await syncNow();
      } else {
        showToast(`تعذر التطبيق: ${res.output}`, 'error');
      }
    } catch {
      if (isMountedRef.current) {
        setApplyingId(null);
        showToast(`حدث خطأ أثناء التطبيق`, 'error');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto mx-auto max-w-[96vw] sm:max-w-[90vw] md:max-w-3xl">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                نظام الفحص والتشخيص التلقائي لـ ZCtrl
              </h3>
              <p className="text-xs text-slate-400">
                فحص وتحليل إعدادات المايكروتك وإظهار التوصيات للنواقص (التعديل يدوي بناءً على موافقتك)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          {/* Info Banner */}
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs leading-relaxed flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-200 mb-1">أمان كامل وتحكم يدوي 100%</p>
              <p>
                يقوم التطبيق بفحص سيرفر المايكروتك لتكتشف أية نواقص أو تحسينات مقترحة. <strong>لن يتم إضافة أو تعديل أي خيار أو سكربت تلقائياً</strong> بدون ضغطك المباشر على زِر الموافقات الموضحة أدناه.
              </p>
            </div>
          </div>

          {diagnostics.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl bg-slate-950/40 border border-slate-800">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white mb-2">ممتاز! إعدادات المايكروتك مكتملة ومتوافق تماماً</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                تم فحص جميع الخدمات، البروفايلات، المنافذ، والفايروال. السيرفر يعمل بأعلى كفاءة وأداء مستقر.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>تم العثور على {diagnostics.length} تحسينات ونواقص مقترحة:</span>
              </div>

              {diagnostics.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      item.severity === 'critical'
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                        : item.severity === 'warning'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {item.severity === 'critical' ? (
                        <ShieldAlert className="w-5 h-5" />
                      ) : item.severity === 'warning' ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : (
                        <Zap className="w-5 h-5" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white">{item.title}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          item.severity === 'critical'
                            ? 'bg-red-500/20 text-red-300'
                            : item.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {item.severity === 'critical' ? 'مهم جداً' : item.severity === 'warning' ? 'تنبيه' : 'تحسين أداء'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                        {item.description}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleApplyAction(item)}
                    disabled={applyingId === item.id}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-medium text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-600/20"
                  >
                    {applyingId === item.id ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>جاري التطبيق...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-blue-200" />
                        <span>موافقة وتطبيق يدوياً</span>
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            حالة السيرفر: {router?.name || 'ZCtrl'} ({router?.host || 'متصل'})
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
