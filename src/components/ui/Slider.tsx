import React from 'react';
import { TOKENS } from '../../designTokens';

export const Slider: React.FC<{
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  unit?: string;
  className?: string;
}> = ({ value, onChange, min, max, step = 1, label, unit = '', className = '' }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex justify-between items-center text-xs font-bold text-slate-300 select-none">
          <span>{label}</span>
          <span className="text-indigo-400 font-mono">{value}{unit}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ height: TOKENS.dim.slider.trackH }}
        className="w-full bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
    </div>
  );
};
