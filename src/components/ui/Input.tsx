import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, hint, className = '', id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="space-y-1 text-right w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-bold text-slate-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute right-3 top-2.5 text-slate-500 pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-slate-950 border ${
              error ? 'border-rose-500 focus:ring-rose-500' : 'border-slate-800 focus:border-blue-500 focus:ring-blue-500'
            } rounded-xl ${icon ? 'pr-9 pl-3' : 'px-3'} py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 transition-all font-medium ${className}`}
            {...props}
          />
        </div>
        {error ? (
          <p className="text-[11px] font-bold text-rose-400">{error}</p>
        ) : hint ? (
          <p className="text-[10px] text-slate-500">{hint}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
