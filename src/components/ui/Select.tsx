import React from 'react';
import { TOKENS } from '../../designTokens';

export interface SelectOption {
  value: string | number;
  label: string;
}

export const Select: React.FC<{
  value: string | number;
  onChange: (v: string) => void;
  options: SelectOption[];
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}> = ({ value, onChange, options, label, error, disabled, className = '' }) => {
  const s = TOKENS.dim.input.md;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && <label className="text-xs font-bold text-slate-300 block select-none">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          height: s.h,
          padding: `0 ${s.px}px`,
          fontSize: s.font,
          borderRadius: TOKENS.radius.md,
          transitionDuration: TOKENS.motion.duration.fast,
        }}
        className={`w-full bg-slate-950 border text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-all ${
          error ? 'border-rose-500' : 'border-slate-800'
        }`}
      >
        {options.map((opt) => (
          <option key={String(opt.value)} value={opt.value} className="bg-slate-900 text-slate-200">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-[11px] text-rose-400">{error}</p>}
    </div>
  );
};
