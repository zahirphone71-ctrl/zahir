import React from 'react';
import {
  Edit2,
  Layers,
  RefreshCw,
  Power,
  Zap,
  Printer,
  Trash2,
  Copy,
  X,
  CheckSquare,
  Users,
  SlidersHorizontal,
  FileDown
} from 'lucide-react';
import { ActionModalType } from './SubscriberActionModals';

interface FloatingSubscribersActionBarProps {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onOpenActionModal: (type: ActionModalType) => void;
  onCopySelected: () => void;
  onOpenColumnCustomizer?: () => void;
  onExportPdf?: () => void;
  isConnected?: boolean;
}

export const FloatingSubscribersActionBar: React.FC<FloatingSubscribersActionBarProps> = ({
  selectedCount,
  totalCount,
  allSelected,
  onToggleSelectAll,
  onClearSelection,
  onOpenActionModal,
  onCopySelected,
  onOpenColumnCustomizer,
  onExportPdf,
  isConnected = true
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      id="floating-subscribers-action-bar"
      className="sticky bottom-4 z-40 mx-auto w-max max-w-full animate-in slide-in-from-bottom-5 fade-in duration-200 mt-4"
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-blue-500/50 shadow-xl shadow-blue-900/40 rounded-2xl p-2 sm:p-2.5 flex flex-col md:flex-row items-center justify-between gap-3 text-right">
        {/* Right Section: Counter & Selection Toggles */}
        <div className="flex items-center justify-between w-full md:w-auto gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-200 font-bold text-[11px]">
            <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>محدد:</span>
            <span className="font-mono px-1.5 py-0.5 rounded-lg bg-blue-500 text-white font-black shadow-sm">
              {selectedCount}
            </span>
            <span className="text-slate-400 font-normal">/ {totalCount}</span>
          </div>

          {!isConnected && (
            <div className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold flex items-center gap-1">
              <span>⚠️ الراوتر غير متصل</span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleSelectAll}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold border border-slate-700/90 transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
              title={allSelected ? 'إلغاء تحديد الكل' : 'تحديد كل المشتركين'}
            >
              <CheckSquare className="w-3 h-3 text-blue-400" />
              <span>{allSelected ? 'إلغاء الكل' : 'تحديد الكل'}</span>
            </button>

            <button
              type="button"
              onClick={onClearSelection}
              className="p-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors cursor-pointer"
              title="إلغاء التحديد الحالي"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Left / Middle Section: Vividly Colored, Balanced Action Buttons Grid */}
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-1.5 w-full md:w-auto">
          {/* 1. Edit */}
          <button
            type="button"
            onClick={() => onOpenActionModal('edit')}
            className="px-2.5 py-1 rounded-lg bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 hover:text-white text-[10px] font-bold border border-blue-500/40 hover:border-blue-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            title="تعديل بيانات الحسابات المحددة"
          >
            <Edit2 className="w-3 h-3 text-blue-400" />
            <span>تعديل</span>
          </button>

          {/* 2. Change Profile */}
          <button
            type="button"
            onClick={() => onOpenActionModal('change_profile')}
            className="px-2.5 py-1 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 text-indigo-300 hover:text-white text-[10px] font-bold border border-indigo-500/40 hover:border-indigo-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            title="تغيير البروفايل ونقل الباقة للمشتركين"
          >
            <Layers className="w-3 h-3 text-indigo-400" />
            <span>نقل باقة</span>
          </button>

          {/* 3. Renew & Reset */}
          <button
            type="button"
            onClick={() => onOpenActionModal('renew')}
            className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 hover:text-white text-[10px] font-bold border border-emerald-500/45 hover:border-emerald-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            title="تجديد الاشتراك وتصفير عدادات الوقت والبيانات"
          >
            <RefreshCw className="w-3 h-3 text-emerald-400" />
            <span>تجديد وتصفير</span>
          </button>

          {/* 4. Suspend / Activate */}
          <button
            type="button"
            onClick={() => onOpenActionModal('toggle_status')}
            className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900/90 text-amber-300 hover:text-white text-[10px] font-bold border border-amber-500/45 hover:border-amber-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            title="تعليق أو تفعيل الحسابات المحددة"
          >
            <Power className="w-3 h-3 text-amber-400" />
            <span>تعليق / تفعيل</span>
          </button>

          {/* 5. Disconnect Active Sessions */}
          <button
            type="button"
            onClick={() => onOpenActionModal('disconnect')}
            className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white text-[10px] font-bold border border-rose-500/40 hover:border-rose-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            title="طرد وفصل الجلسات الحية النشطة"
          >
            <Zap className="w-3 h-3 text-rose-400" />
            <span>فصل</span>
          </button>

          {/* 6. Print & Export */}
          <button
            type="button"
            onClick={() => onOpenActionModal('print_export')}
            className="px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 hover:text-white text-[10px] font-bold border border-purple-500/40 hover:border-purple-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            title="طباعة وتصدير الكروت أو ملف CSV"
          >
            <Printer className="w-3 h-3 text-purple-400" />
            <span>طباعة</span>
          </button>

          {/* 6.1 PDF Report Export */}
          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-white text-[10px] font-bold border border-rose-500/40 hover:border-rose-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer active:scale-95"
              title="تصدير بيانات المشتركين المحددين كتقرير PDF منسق"
            >
              <FileDown className="w-3 h-3 text-rose-400" />
              <span>PDF</span>
            </button>
          )}

          {/* 7. Copy Info */}
          <button
            type="button"
            onClick={onCopySelected}
            className="px-2 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 hover:text-white text-[10px] font-bold border border-cyan-500/40 hover:border-cyan-400 transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            title="نسخ بيانات الدخول للمحددين"
          >
            <Copy className="w-3 h-3 text-cyan-400" />
            <span className="hidden sm:inline">نسخ</span>
          </button>

          {/* 8. Column Customizer Trigger (if passed) */}
          {onOpenColumnCustomizer && (
            <button
              type="button"
              onClick={onOpenColumnCustomizer}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold border border-slate-700 transition-all flex items-center justify-center cursor-pointer"
              title="تخصيص أعمدة الجدول"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          {/* 9. Delete Button */}
          <button
            type="button"
            onClick={() => onOpenActionModal('delete')}
            className="px-3 py-1 rounded-lg bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white text-[10px] font-bold shadow-md shadow-rose-600/30 transition-all flex items-center gap-1 cursor-pointer"
            title="حذف الحسابات المحددة نهائياً"
          >
            <Trash2 className="w-3 h-3" />
            <span>حذف</span>
          </button>
        </div>
      </div>
    </div>
  );
};
