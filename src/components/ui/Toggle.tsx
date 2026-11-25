import React from 'react';
import { TOKENS } from '../../designTokens';

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, disabled }) => {
  const { w, h, knob } = TOKENS.dim.switch;
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        style={{ width: w, height: h, borderRadius: TOKENS.radius.full }}
        className={`relative transition-colors duration-200 p-0.5 ${checked ? 'bg-indigo-600' : 'bg-slate-800'}`}
      >
        <span
          style={{ width: knob, height: knob }}
          className={`block bg-white rounded-full transition-transform duration-200 shadow-sm ${
            checked ? 'translate-x-[-20px] rtl:translate-x-[20px]' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-xs font-bold text-slate-300">{label}</span>}
    </label>
  );
};
