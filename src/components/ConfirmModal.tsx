import React from 'react';
import { AlertTriangle, Trash2, X, Check, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
  checkboxOption?: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  };
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'تأكيد التنفيذ',
  cancelText = 'إلغاء',
  type = 'danger',
  isLoading = false,
  checkboxOption,
  onConfirm,
  onClose
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const typeConfig = {
    danger: {
      icon: Trash2,
      iconColor: 'text-rose-400',
      iconBg: 'bg-rose-500/10 border-rose-500/30',
      confirmBtn: 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10 border-amber-500/30',
      confirmBtn: 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30'
    },
    info: {
      icon: Check,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10 border-blue-500/30',
      confirmBtn: 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/30'
    }
  };

  const config = typeConfig[type];
  const IconComponent = config.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      dir="rtl"
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl p-5 sm:p-6 space-y-4 animate-in zoom-in-95 duration-150 text-right"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${config.iconBg}`}>
              <IconComponent className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-100">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{message}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Optional Checkbox */}
        {checkboxOption && (
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checkboxOption.checked}
              onChange={(e) => checkboxOption.onChange(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 focus:ring-offset-slate-900"
            />
            <span className="font-medium">{checkboxOption.label}</span>
          </label>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 text-xs font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${config.confirmBtn}`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
