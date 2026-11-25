import React, { useEffect } from 'react';
import { TOKENS, ICON_MAP } from '../../designTokens';
import { Icon } from './Icon';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

export const Toast: React.FC<{
  toast: ToastMessage | null;
  onClose: () => void;
}> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => onClose(), toast.duration ?? 4000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  const styles = {
    success: 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200',
    error: 'bg-rose-950/90 border-rose-500/40 text-rose-200',
    warning: 'bg-amber-950/90 border-amber-500/40 text-amber-200',
    info: 'bg-cyan-950/90 border-cyan-500/40 text-cyan-200',
  };

  const icons = {
    success: 'CheckCircle2',
    error: 'AlertCircle',
    warning: 'AlertTriangle',
    info: 'Info',
  };

  return (
    <div
      style={{
        zIndex: TOKENS.z.toast,
        borderRadius: TOKENS.dim.toast.radius,
      }}
      className={`fixed bottom-6 right-6 border shadow-2xl p-4 flex items-center gap-3 backdrop-blur-md animate-slide-up max-w-md ${styles[toast.type]}`}
    >
      <Icon name={icons[toast.type]} size="lg" />
      <div className="flex-1">
        <h4 className="font-extrabold text-xs">{toast.title}</h4>
        {toast.message && <p className="text-[11px] opacity-80 mt-0.5">{toast.message}</p>}
      </div>
      <button onClick={onClose} className="p-1 hover:opacity-75 cursor-pointer">
        <Icon name="X" size="sm" />
      </button>
    </div>
  );
};
