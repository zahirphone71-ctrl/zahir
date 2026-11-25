import React from 'react';
import { AlertTriangle, Trash2, ShieldAlert, X, AlertOctagon } from 'lucide-react';

interface ProfileConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
  systemType: 'hotspot' | 'pppoe' | 'userman';
  profileName: string;
  profileId: string;
  assignedUsersCount?: number;
}

export const ProfileConfirmDeleteModal: React.FC<ProfileConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isDeleting = false,
  systemType,
  profileName,
  profileId,
  assignedUsersCount = 0
}) => {
  if (!isOpen) return null;

  const isDefaultProfile =
    systemType === 'hotspot'
      ? profileName === 'default' || profileId === '*0' || profileId === '*1'
      : systemType === 'pppoe'
      ? profileName === 'default' || profileName === 'default-encryption' || profileId === '*0' || profileId === '*1'
      : profileName === 'default';

  const sysLabel =
    systemType === 'hotspot'
      ? 'هوتسبوت (Hotspot Profile)'
      : systemType === 'pppoe'
      ? 'برودباند (PPPoE Profile)'
      : 'يوزر مانجر (User Manager Profile)';

  return (
    <div className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-150" dir="rtl">
      <div className="bg-slate-900 border border-red-500/40 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden my-auto mx-auto flex flex-col">
        {/* Header Alert */}
        <div className="p-5 bg-gradient-to-r from-red-950/80 via-slate-900 to-slate-900 border-b border-red-500/30 flex items-start gap-3">
          <div className="p-3 rounded-2xl bg-red-500/20 border border-red-500/30 text-red-400 shrink-0">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
                {sysLabel}
              </span>
              <span className="text-[11px] font-mono text-red-400 font-bold">
                تحذير حذف بروفايل
              </span>
            </div>
            <h3 className="text-base font-black text-white mt-1">
              تأكيد حذف البروفايل ({profileName})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {isDefaultProfile ? (
            <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-red-300">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>عملية محظورة:</span>
              </div>
              <p className="text-xs leading-relaxed text-red-200/90">
                البروفايل <strong className="text-white">default</strong> هو البروفايل الأساسي الافتراضي لـ ZCtrl ولا يمكن حذفه للحفاظ على استقرار النظام والشبكة.
              </p>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">اسم البروفايل المستهدف:</span>
                  <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                    {profileName}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-300">
                  <span className="text-slate-400">المشتركون / الكروت المرتبطة:</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded-lg ${
                    assignedUsersCount > 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {assignedUsersCount} مشترك
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-200 text-xs space-y-1 leading-relaxed">
                <p className="font-bold text-red-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>تنبيه هام ومباشر:</span>
                </p>
                <p className="text-[11px] text-red-200/90">
                  سيتم حذف هذا البروفايل نهائياً من نظام وقوائم ZCtrl. أي مستخدمين أو كروت مرتبطة بهذا البروفايل ستفقد إعدادات السرعة المخصصة لها.
                </p>
              </div>

              <p className="text-center font-bold text-slate-200 text-xs pt-1">
                هل توافق على إتمام عملية الحذف النهائي لهذا البروفايل؟
              </p>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer flex-1"
          >
            إلغاء وتراجع
          </button>

          {!isDefaultProfile && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className={`px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer flex-1 ${
                isDeleting ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {isDeleting ? (
                <span>جاري الحذف...</span>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>نعم، أوافق على الحذف</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
