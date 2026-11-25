import React, { useEffect, useState } from 'react';
import { TOKENS, ICON_MAP } from '../../designTokens';
import { Icon } from './Icon';

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: keyof typeof ICON_MAP | string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ open, onClose, title, subtitle, icon, size = 'md', children, footer }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setMounted(false), 200);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!mounted && !open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]',
  };

  const mappedIcon = icon ? (ICON_MAP as Record<string, string>)[icon] || icon : undefined;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-3 transition-opacity duration-200 ${
        open ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        zIndex: TOKENS.z.modal,
        background: TOKENS.color.bg.overlay,
        backdropFilter: 'blur(8px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`bg-slate-900 border border-slate-800 shadow-2xl w-full ${sizes[size]} max-h-[92vh] flex flex-col overflow-hidden transition-all duration-250 ${
          open ? 'scale-100 translate-y-0' : 'scale-95 translate-y-2'
        }`}
        style={{
          borderRadius: TOKENS.dim.modal.radius,
          transitionTimingFunction: TOKENS.motion.easing.spring,
        }}
      >
        <div
          className="border-b border-slate-800 flex items-center justify-between shrink-0"
          style={{ padding: `0 ${TOKENS.dim.modal.p}px`, height: TOKENS.dim.modal.headerH }}
        >
          <div className="flex items-center gap-3">
            {mappedIcon && (
              <div className="p-2 bg-indigo-500/20 rounded-xl text-indigo-400">
                <Icon name={mappedIcon} size="lg" />
              </div>
            )}
            <div>
              <h2 className="text-base font-black text-white">{title}</h2>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <Icon name="X" size="md" />
          </button>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar" style={{ padding: TOKENS.dim.modal.p }}>
          {children}
        </div>

        {footer && (
          <div
            className="border-t border-slate-800 bg-slate-950/50 shrink-0"
            style={{ padding: `${TOKENS.space[3]} ${TOKENS.dim.modal.p}px` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
