import React from 'react';
import { TOKENS } from '../../designTokens';

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'indigo';
  size?: 'sm' | 'md';
  className?: string;
}> = ({ children, variant = 'neutral', size = 'md', className = '' }) => {
  const styles = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    error: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    info: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
    indigo: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  };

  const dim = TOKENS.dim.badge[size];

  return (
    <span
      style={{
        height: dim.h,
        padding: `0 ${dim.px}px`,
        fontSize: dim.font,
        borderRadius: TOKENS.radius.full,
      }}
      className={`inline-flex items-center justify-center font-black border select-none ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
