import React, { useState, useEffect, useId } from 'react';
import { Clock, Sliders, Edit3, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  parseMikrotikDuration,
  buildMikrotikDuration,
  formatDurationArabic,
} from '../../lib/formatters';

export interface ValidityDurationPickerProps {
  value: string | number | undefined;
  onChange: (value: string) => void;
  label?: string;
  subLabel?: string;
  hint?: string;
  colorTheme?: 'blue' | 'emerald' | 'purple' | 'amber';
  allowUnlimited?: boolean;
  showSeconds?: boolean;
}

export const ValidityDurationPicker: React.FC<ValidityDurationPickerProps> = ({
  value,
  onChange,
  label = 'صلاحية البروفايل ومدة الاستخدام',
  subLabel = 'تحديد وقت الصلاحية بالأيام، الساعات، الدقائق، والثواني أو إدخال يدوي حر',
  hint,
  colorTheme = 'blue',
  allowUnlimited = true,
  showSeconds = true
}) => {
  const componentId = useId();
  const [entryMode, setEntryMode] = useState<'stepper' | 'manual'>('stepper');

  // Internal breakdown state
  const [days, setDays] = useState<number>(0);
  const [hours, setHours] = useState<number>(0);
  const [minutes, setMinutes] = useState<number>(0);
  const [seconds, setSeconds] = useState<number>(0);
  const [manualText, setManualText] = useState<string>('');

  const isDirty = React.useRef(false);
  const lastEmittedValueRef = React.useRef<string | number | undefined>(undefined);

  // Sync internal state when external `value` prop changes
  useEffect(() => {
    if (value !== lastEmittedValueRef.current) {
      isDirty.current = false;
      lastEmittedValueRef.current = value;
    }
    if (!isDirty.current) {
      const parsed = parseMikrotikDuration(value);
      setDays(parsed.days);
      setHours(parsed.hours);
      setMinutes(parsed.minutes);
      setSeconds(parsed.seconds);
      setManualText(parsed.isUnlimited ? '' : parsed.raw || buildMikrotikDuration(parsed));
    }
  }, [value]);

  // Color mappings
  const themeColors = {
    blue: {
      border: 'focus:border-blue-500',
      activeTab: 'bg-blue-600 text-white shadow-blue-600/30',
      badge: 'bg-blue-950/60 text-blue-300 border-blue-800/60',
      pillActive: 'bg-blue-600 text-white border-blue-500',
      pillHover: 'hover:border-blue-500/50 hover:bg-blue-950/40 text-slate-300',
      accentText: 'text-blue-400',
      accentBg: 'bg-blue-500/10'
    },
    emerald: {
      border: 'focus:border-emerald-500',
      activeTab: 'bg-emerald-600 text-white shadow-emerald-600/30',
      badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
      pillActive: 'bg-emerald-600 text-white border-emerald-500',
      pillHover: 'hover:border-emerald-500/50 hover:bg-emerald-950/40 text-slate-300',
      accentText: 'text-emerald-400',
      accentBg: 'bg-emerald-500/10'
    },
    purple: {
      border: 'focus:border-purple-500',
      activeTab: 'bg-purple-600 text-white shadow-purple-600/30',
      badge: 'bg-purple-950/60 text-purple-300 border-purple-800/60',
      pillActive: 'bg-purple-600 text-white border-purple-500',
      pillHover: 'hover:border-purple-500/50 hover:bg-purple-950/40 text-slate-300',
      accentText: 'text-purple-400',
      accentBg: 'bg-purple-500/10'
    },
    amber: {
      border: 'focus:border-amber-500',
      activeTab: 'bg-amber-600 text-white shadow-amber-600/30',
      badge: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
      pillActive: 'bg-amber-600 text-white border-amber-500',
      pillHover: 'hover:border-amber-500/50 hover:bg-amber-950/40 text-slate-300',
      accentText: 'text-amber-400',
      accentBg: 'bg-amber-500/10'
    }
  }[colorTheme];

  // Quick Preset options for ISP networks & vouchers
  const presets = [
    { label: '15 دقيقة', value: '15m' },
    { label: '30 دقيقة', value: '30m' },
    { label: '1 ساعة', value: '1h' },
    { label: '2 ساعة', value: '2h' },
    { label: '3 ساعات', value: '3h' },
    { label: '6 ساعات', value: '6h' },
    { label: '12 ساعة', value: '12h' },
    { label: '1 يوم', value: '1d' },
    { label: '3 أيام', value: '3d' },
    { label: '7 أيام (أسبوع)', value: '7d' },
    { label: '15 يوم', value: '15d' },
    { label: '30 يوم (شهر)', value: '30d' },
    ...(allowUnlimited ? [{ label: 'غير محدد (مفتوح)', value: '0s' }] : [])
  ];

  // Handle Stepper Changes
  const handleUnitChange = (unit: 'days' | 'hours' | 'minutes' | 'seconds', newVal: number) => {
    isDirty.current = false;
    const maxVal = unit === 'hours' ? 23 : unit === 'minutes' ? 59 : unit === 'seconds' ? 59 : 3650;
    const safeVal = Math.min(maxVal, Math.max(0, isNaN(newVal) ? 0 : newVal));
    const updated = {
      days: unit === 'days' ? safeVal : days,
      hours: unit === 'hours' ? safeVal : hours,
      minutes: unit === 'minutes' ? safeVal : minutes,
      seconds: unit === 'seconds' ? safeVal : seconds
    };

    setDays(updated.days);
    setHours(updated.hours);
    setMinutes(updated.minutes);
    setSeconds(updated.seconds);

    const formatted = buildMikrotikDuration(updated);
    setManualText(formatted === '0s' ? '' : formatted);
    lastEmittedValueRef.current = formatted;
    onChange(formatted);
  };

  // Handle Manual String Input
  const handleManualChange = (text: string) => {
    isDirty.current = true;
    setManualText(text);
    const parsed = parseMikrotikDuration(text);
    setDays(parsed.days);
    setHours(parsed.hours);
    setMinutes(parsed.minutes);
    setSeconds(parsed.seconds);
    const trimmed = text.trim();
    lastEmittedValueRef.current = trimmed;
    onChange(trimmed);
  };

  // Handle Preset Click
  const handleApplyPreset = (presetVal: string) => {
    isDirty.current = false;
    const parsed = parseMikrotikDuration(presetVal);
    setDays(parsed.days);
    setHours(parsed.hours);
    setMinutes(parsed.minutes);
    setSeconds(parsed.seconds);
    setManualText(presetVal === '0s' ? '' : presetVal);
    lastEmittedValueRef.current = presetVal;
    onChange(presetVal);
  };

  const parsedCurrent = parseMikrotikDuration(value);
  const arabicDescription = formatDurationArabic(value);

  return (
    <div
      id={`duration-picker-${componentId}`}
      className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 space-y-3.5 shadow-md"
    >
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div>
          <label className="block text-xs font-bold text-white flex items-center gap-1.5">
            <div className={`w-4 h-4 ${themeColors.accentText}`} />
            <span>{label}</span>
          </label>
          {subLabel && <p className="text-[10px] text-slate-400 mt-0.5">{subLabel}</p>}
        </div>

        {/* Toggle Entry Mode */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            id={`btn-mode-stepper-${componentId}`}
            onClick={() => setEntryMode('stepper')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              entryMode === 'stepper'
                ? themeColors.activeTab
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>إدخال تفصيلي (أيام/ساعات/دقائق)</span>
          </button>

          <button
            type="button"
            id={`btn-mode-manual-${componentId}`}
            onClick={() => setEntryMode('manual')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              entryMode === 'manual'
                ? themeColors.activeTab
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Edit3 className="w-3 h-3" />
            <span>إدخال يدوي حر</span>
          </button>
        </div>
      </div>

      {/* MODE 1: STEPPERS / DETAILED NUMERIC UNITS */}
      {entryMode === 'stepper' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Days */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 block">الأيام (Days)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleUnitChange('days', days - 1)}
                  disabled={days <= 0}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={days}
                  onChange={e => handleUnitChange('days', parseInt(e.target.value, 10))}
                  className={`w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-center text-sm font-mono font-black text-white focus:outline-none ${themeColors.border}`}
                />
                <button
                  type="button"
                  onClick={() => handleUnitChange('days', days + 1)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Hours */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 block">الساعات (Hours)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleUnitChange('hours', hours - 1)}
                  disabled={hours <= 0}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hours}
                  onChange={e => handleUnitChange('hours', parseInt(e.target.value, 10))}
                  className={`w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-center text-sm font-mono font-black text-white focus:outline-none ${themeColors.border}`}
                />
                <button
                  type="button"
                  onClick={() => handleUnitChange('hours', hours + 1)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Minutes */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 block">الدقائق (Minutes)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleUnitChange('minutes', minutes - 5 >= 0 ? minutes - 5 : minutes - 1)}
                  disabled={minutes <= 0}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  -
                </button>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={e => handleUnitChange('minutes', parseInt(e.target.value, 10))}
                  className={`w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-center text-sm font-mono font-black text-white focus:outline-none ${themeColors.border}`}
                />
                <button
                  type="button"
                  onClick={() => handleUnitChange('minutes', minutes + 5 <= 59 ? minutes + 5 : minutes + 1)}
                  disabled={minutes >= 59}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>

            {/* Seconds (Optional) */}
            {showSeconds ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 block">الثواني (Seconds)</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleUnitChange('seconds', seconds - 10 >= 0 ? seconds - 10 : seconds - 1)}
                    disabled={seconds <= 0}
                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={seconds}
                    onChange={e => handleUnitChange('seconds', parseInt(e.target.value, 10))}
                    className={`w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-center text-sm font-mono font-black text-white focus:outline-none ${themeColors.border}`}
                  />
                  <button
                    type="button"
                    onClick={() => handleUnitChange('seconds', seconds + 10 <= 59 ? seconds + 10 : seconds + 1)}
                    disabled={seconds >= 59}
                    className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-bold text-xs flex items-center justify-center transition-all cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center bg-slate-950/50 border border-dashed border-slate-800 rounded-xl p-2.5 text-[10px] text-slate-500 font-mono">
                صيغة RouterOS المعيارية
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MODE 2: DIRECT MANUAL TEXT INPUT */
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              id={`input-manual-duration-${componentId}`}
              value={manualText}
              onChange={e => handleManualChange(e.target.value)}
              placeholder="مثال: 12h أو 30m أو 1d 06:00:00 أو 30d أو 0s"
              className={`w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder:text-slate-500 focus:outline-none ${themeColors.border}`}
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-mono">الصيغة: d / h / m / s</span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            يدعم كتابة صيغ MikroTik القياسية مثل:{' '}
            <code className="text-slate-300 font-mono bg-slate-800/80 px-1 py-0.5 rounded">12h</code> (12 ساعة)،{' '}
            <code className="text-slate-300 font-mono bg-slate-800/80 px-1 py-0.5 rounded">30m</code> (30 دقيقة)،{' '}
            <code className="text-slate-300 font-mono bg-slate-800/80 px-1 py-0.5 rounded">1d 12:30:00</code>،{' '}
            <code className="text-slate-300 font-mono bg-slate-800/80 px-1 py-0.5 rounded">30d</code> (شهر)،{' '}
            <code className="text-slate-300 font-mono bg-slate-800/80 px-1 py-0.5 rounded">0s</code> (غير محدد).
          </p>
        </div>
      )}

      {/* PRESET CHIPS */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span className="font-bold flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>قوالب وفترات سريعة شائعة:</span>
          </span>
          <span className="font-mono text-[9px] text-slate-500">انقر للتطبيق الفوري</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {presets.map(p => {
            const isSelected =
              (p.value === '0s' && parsedCurrent.isUnlimited) ||
              p.value.toLowerCase() === String(value).trim().toLowerCase() ||
              (p.value === '30d' && parsedCurrent.days === 30 && parsedCurrent.hours === 0 && parsedCurrent.minutes === 0) ||
              (p.value === '1d' && parsedCurrent.days === 1 && parsedCurrent.hours === 0 && parsedCurrent.minutes === 0) ||
              (p.value === '12h' && parsedCurrent.days === 0 && parsedCurrent.hours === 12 && parsedCurrent.minutes === 0) ||
              (p.value === '1h' && parsedCurrent.days === 0 && parsedCurrent.hours === 1 && parsedCurrent.minutes === 0) ||
              (p.value === '30m' && parsedCurrent.days === 0 && parsedCurrent.hours === 0 && parsedCurrent.minutes === 30);

            return (
              <button
                key={p.value}
                type="button"
                onClick={() => handleApplyPreset(p.value)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  isSelected
                    ? themeColors.pillActive
                    : `bg-slate-950/70 border-slate-800 ${themeColors.pillHover}`
                }`}
              >
                <span>{p.label}</span>
                <span className="text-[9px] opacity-75 font-mono ml-1">({p.value})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* LIVE ARABIC & MIKROTIK PREVIEW FOOTER */}
      <div className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${themeColors.badge}`}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <div className="text-xs">
            <span className="text-[10px] opacity-80 block">النتيجة المقروءة للمشتركين والبطاقات:</span>
            <strong className="font-bold">{arabicDescription}</strong>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 text-[10px] font-mono">
          <span className="text-slate-400">RouterOS:</span>
          <span className="text-emerald-400 font-bold">
            {parsedCurrent.isUnlimited ? '0s (مفتوح)' : buildMikrotikDuration(parsedCurrent)}
          </span>
        </div>
      </div>

      {hint && <p className="text-[10px] text-slate-400 leading-relaxed">{hint}</p>}
    </div>
  );
};
