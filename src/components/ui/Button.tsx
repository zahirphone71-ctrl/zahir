import React from 'react';
import { TOKENS } from '../../lib/designTokens';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]';

  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20 focus:ring-blue-500 border border-blue-500/30',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 focus:ring-slate-500',
    ghost: 'bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-slate-200 focus:ring-slate-500',
    danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 focus:ring-rose-500 border border-rose-500/30',
    success: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 focus:ring-emerald-500 border border-emerald-500/30',
    amber: 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 focus:ring-amber-500 border border-amber-500/30'
  };

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5 min-h-[32px]',
    md: 'px-3.5 py-2 text-xs gap-2 min-h-[40px]',
    lg: 'px-5 py-2.5 text-sm gap-2.5 min-h-[48px]'
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children && <span className="truncate">{children}</span>}
    </button>
  );
};
