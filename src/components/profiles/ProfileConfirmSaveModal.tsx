import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Copy,
  Zap,
  ShieldAlert,
} from 'lucide-react';

interface ProfileConfirmSaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  systemType: 'hotspot' | 'pppoe' | 'userman';
  isEditing: boolean;
  profileName: string;
  summaryItems: { label: string; value: string | number; icon?: React.ComponentType<{ className?: string }> }[];
  cliCommand: string;
}

export const ProfileConfirmSaveModal: React.FC<ProfileConfirmSaveModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  systemType,
  isEditing,
  profileName,
  summaryItems,
  cliCommand
}) => {
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  const sysNameAr =
    systemType === 'hotspot'
      ? 'سيرفر الهوتسبوت (Hotspot User Profile)'
      : systemType === 'pppoe'
      ? 'سيرفر البرودباند (PPP Profile)'
      : 'نظام اليوزر مانجر (User Manager Profile)';

  const sysColor =
    systemType === 'hotspot'
      ? 'text-blue-400 bg-blue-500/10 border-blue-500/30'
      : systemType === 'pppoe'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : 'text-purple-400 bg-purple-500/10 border-purple-500/30';

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopied(true);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = cliCommand;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
      setCopied(true);
    }
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-150" dir="rtl">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden my-auto mx-auto flex flex-col max-h-[92vh]">
        {/* Header Alert */}
        <div className="p-5 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-b border-amber-500/20 flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${sysColor}`}>
                {sysNameAr}
              </span>
              <span className="text-xs font-mono font-bold text-amber-400">
                {isEditing ? 'تعديل بروفايل قائم' : 'إنشاء بروفايل جديد'}
              </span>
            </div>
            <h3 className="text-base font-black text-white mt-1">
              تأكيد وتحذير: تطبيق البروفايل ({profileName}) على ZCtrl
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              يرجى مراجعة كافة العناصر والمعايير التي تم إدخالها يدوياً أدناه قبل تأكيد الحفظ والتنفيذ الفعلي على الراوتر.
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs">
          {/* Summary Grid of Entered Parameters */}
          <div>
            <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>العناصر والمعايير المدخلة يدوياً:</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800">
              {summaryItems.map((item, idx) => {
                const Icon = item.icon || Zap;
                return (
                  <div key={idx} className="bg-slate-900/90 border border-slate-800/80 rounded-xl p-2.5 space-y-1">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Icon className="w-3 h-3 text-slate-400" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    <div className="font-bold text-slate-100 font-mono text-[11px] truncate" title={String(item.value)}>
                      {item.value === 0 ? '0' : item.value || 'غير محدد'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Real MikroTik CLI Command Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span>أمر MikroTik RouterOS CLI المولد:</span>
              </span>
              <button
                type="button"
                onClick={handleCopyCli}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-950/40 px-2 py-0.5 rounded-lg border border-blue-800/40 cursor-pointer"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'تم النسخ' : 'نسخ الأمر'}</span>
              </button>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed shadow-inner">
              {cliCommand}
            </div>
          </div>

          {/* Impact Warning Notice */}
          <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-amber-200 text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">ملاحظة تنفيذية هامة:</span>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                بمجرد الضغط على زر التأكيد، سيتم إرسال هذا البروفايل مباشرة لقلب نظام RouterOS وسيعتمد فوراً للمشتركين الجدد والاتصالات الحية.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
          >
            تراجع ومراجعة العناصر
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-black shadow-lg flex items-center gap-2 transition-all cursor-pointer ${
              systemType === 'hotspot'
                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                : systemType === 'pppoe'
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
            } ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? (
              <span>جاري الحفظ والتطبيق...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>أوافق، احفظ البروفايل في ZCtrl</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
