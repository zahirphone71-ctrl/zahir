import React, { useState, useEffect, useRef } from 'react';
import {
  Palette,
  CheckCircle,
  Sparkles,
  Crown,
  Zap,
  Moon,
  Sun,
  Flame,
  ShieldCheck,
  RotateCcw,
  Sliders,
  Check,
  Laptop,
  CheckSquare,
  Contrast,
  Pipette,
  Save,
  Download,
  Upload,
  RefreshCw,
  Layers,
  Square,
  Type
} from 'lucide-react';
import {
  APP_THEME_PRESETS,
  AppThemeId,
  applyAppTheme,
  getSavedAppTheme,
  getSavedCustomThemeElements,
  saveCustomThemeElements,
  resetCustomThemeElements,
  CustomThemeElements
} from '../utils/themeManager';
import { safeStorage } from '../utils/safeStorage';

interface AppThemeTemplatesViewProps {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const PALETTE_PRESETS = [
  { name: 'ذهبي VIP', primary: '#f59e0b', secondary: '#d97706', glow: 'rgba(245, 158, 11, 0.45)', bgMain: '#0b0c10', bgCard: '#13151f' },
  { name: 'أزرق ياقوتي', primary: '#3b82f6', secondary: '#2563eb', glow: 'rgba(59, 130, 246, 0.35)', bgMain: '#070a13', bgCard: '#0f172a' },
  { name: 'زمردي ملكي', primary: '#10b981', secondary: '#059669', glow: 'rgba(16, 185, 129, 0.4)', bgMain: '#04100d', bgCard: '#0a1d18' },
  { name: 'سايبر نيون', primary: '#06b6d4', secondary: '#a855f7', glow: 'rgba(6, 182, 212, 0.5)', bgMain: '#030712', bgCard: '#0f172a' },
  { name: 'عنابي مخملي', primary: '#f43f5e', secondary: '#e11d48', glow: 'rgba(244, 63, 94, 0.45)', bgMain: '#11080c', bgCard: '#1a0d13' },
  { name: 'أرجواني ليلي', primary: '#8b5cf6', secondary: '#7c3aed', glow: 'rgba(139, 92, 246, 0.45)', bgMain: '#090714', bgCard: '#130f24' },
  { name: 'سواد OLED', primary: '#38bdf8', secondary: '#818cf8', glow: 'rgba(56, 189, 248, 0.45)', bgMain: '#000000', bgCard: '#08080a' },
  { name: 'أبيض لؤلؤي', primary: '#2563eb', secondary: '#1d4ed8', glow: 'rgba(37, 99, 235, 0.2)', bgMain: '#f8fafc', bgCard: '#ffffff' }
];

export const AppThemeTemplatesView: React.FC<AppThemeTemplatesViewProps> = ({ showToast }) => {
  const [currentTheme, setCurrentTheme] = useState<AppThemeId>(getSavedAppTheme);
  const activePreset = APP_THEME_PRESETS[currentTheme] || APP_THEME_PRESETS.classic_sapphire;

  // Custom theme elements state initialized with saved overrides or current preset values
  const [customElements, setCustomElements] = useState<CustomThemeElements>(() => {
    const saved = getSavedCustomThemeElements();
    return {
      primaryColor: saved.primaryColor || activePreset.primaryColor,
      secondaryColor: saved.secondaryColor || activePreset.secondaryColor,
      accentGlow: saved.accentGlow || activePreset.accentGlow,
      bgMain: saved.bgMain || activePreset.bgMain,
      bgCard: saved.bgCard || activePreset.bgCard,
      bgHeader: saved.bgHeader || activePreset.bgHeader,
      bgSidebar: saved.bgSidebar || activePreset.bgSidebar,
      borderColor: saved.borderColor || activePreset.borderColor,
      textColor: saved.textColor || activePreset.textColor,
      textMuted: saved.textMuted || activePreset.textMuted,
      borderRadius: saved.borderRadius || activePreset.borderRadius,
      fontFamily: saved.fontFamily || safeStorage.getItem('set_app_font_family') || activePreset.fontFamily,
      fontSize: saved.fontSize || safeStorage.getItem('set_app_font_size') || '100'
    };
  });

  const isMountedRef = useRef(true);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  // Apply changes in real-time as state updates
  useEffect(() => {
    applyAppTheme(currentTheme, customElements);
  }, [currentTheme, customElements]);

  const handleSelectTheme = (themeId: AppThemeId) => {
    setCurrentTheme(themeId);
    resetCustomThemeElements();
    const preset = APP_THEME_PRESETS[themeId];
    const newDefaults: CustomThemeElements = {
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentGlow: preset.accentGlow,
      bgMain: preset.bgMain,
      bgCard: preset.bgCard,
      bgHeader: preset.bgHeader,
      bgSidebar: preset.bgSidebar,
      borderColor: preset.borderColor,
      textColor: preset.textColor,
      textMuted: preset.textMuted,
      borderRadius: preset.borderRadius,
      fontFamily: preset.fontFamily,
      fontSize: '100'
    };
    setCustomElements(newDefaults);
    applyAppTheme(themeId, newDefaults);
    showToast(`تم تحويل شكل البرنامج إلى "${preset.name}" بنجاح!`, 'success');
  };

  const handleElementChange = (key: keyof CustomThemeElements, value: string) => {
    const updated = { ...customElements, [key]: value };
    setCustomElements(updated);
    saveCustomThemeElements(updated);
    applyAppTheme(currentTheme, updated);
  };

  const handleApplyPalettePreset = (p: typeof PALETTE_PRESETS[0]) => {
    const updated: CustomThemeElements = {
      ...customElements,
      primaryColor: p.primary,
      secondaryColor: p.secondary,
      accentGlow: p.glow,
      bgMain: p.bgMain,
      bgCard: p.bgCard
    };
    setCustomElements(updated);
    saveCustomThemeElements(updated);
    applyAppTheme(currentTheme, updated);
    showToast(`تم تطبيق لوحة ألوان "${p.name}" على العناصر الحالية`, 'success');
  };

  const handleResetCustomizations = () => {
    resetCustomThemeElements();
    const preset = APP_THEME_PRESETS[currentTheme];
    const resetValues: CustomThemeElements = {
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentGlow: preset.accentGlow,
      bgMain: preset.bgMain,
      bgCard: preset.bgCard,
      bgHeader: preset.bgHeader,
      bgSidebar: preset.bgSidebar,
      borderColor: preset.borderColor,
      textColor: preset.textColor,
      textMuted: preset.textMuted,
      borderRadius: preset.borderRadius,
      fontFamily: preset.fontFamily,
      fontSize: '100'
    };
    setCustomElements(resetValues);
    applyAppTheme(currentTheme, resetValues);
    showToast('تمت إعادة ضبط عناصر الثيم إلى الإعدادات الافتراضية للقالب', 'info');
  };

  const handleExportThemeJSON = () => {
    const exportData = {
      themeId: currentTheme,
      themeName: activePreset.name,
      customElements,
      exportedAt: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zctrl-theme-${currentTheme}-custom.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      URL.revokeObjectURL(url);
    }, 1000);
    timersRef.current.add(timer);
    showToast('تم تصدير ملف إعدادات الثيم المخصص بنجاح', 'success');
  };

  const handleImportThemeJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (!isMountedRef.current) return;
      try {
        const raw = evt.target?.result;
        if (typeof raw !== 'string') {
          showToast('تعذر قراءة محتوى ملف الثيم', 'error');
          return;
        }
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === 'object' &&
          parsed.customElements &&
          typeof parsed.customElements === 'object' &&
          !Array.isArray(parsed.customElements)
        ) {
          const nextTheme: AppThemeId =
            parsed.themeId && APP_THEME_PRESETS[parsed.themeId as AppThemeId]
              ? (parsed.themeId as AppThemeId)
              : currentTheme;
          setCurrentTheme(nextTheme);
          setCustomElements(parsed.customElements);
          saveCustomThemeElements(parsed.customElements);
          applyAppTheme(nextTheme, parsed.customElements);
          showToast('تم استيراد وتطبيق الثيم المخصص بنجاح', 'success');
        } else {
          showToast('تنسيق ملف الثيم غير صالح', 'error');
        }
      } catch {
        showToast('تعذر قراءة ملف الثيم المخصص', 'error');
      }
    };
    reader.onerror = () => {
      if (isMountedRef.current) showToast('فشل في قراءة الملف المحدد', 'error');
    };
    reader.readAsText(file);
  };

  const themeList = Object.values(APP_THEME_PRESETS);

  return (
    <div className="space-y-8 text-right">
      {/* Top Banner Notice */}
      <div className="p-4 bg-gradient-to-r from-blue-900/30 via-slate-900 to-purple-900/30 border border-blue-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-xl text-blue-400 shrink-0">
            <Palette className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>معرض القوالب ومحرر عناصر الثيم الشامل لبرنامج ZCtrl</span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono">
                {themeList.length} أنماط كليّة + تخصيص كامل
              </span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              يمكنك الاختيار من بين الأنماط الجاهزة أو تعديل كافة عناصر الثيم (الألوان، الخلفيات، الحواف، والخطوط) بدقة وتفاعل حي مباشر.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleSelectTheme('classic_sapphire')}
          className="text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white font-bold px-3.5 py-2 rounded-xl border border-slate-700 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
          <span>إعادة النمط الكلاسيكي</span>
        </button>
      </div>

      {/* SECTION 1: PRESET THEME TEMPLATES GALLERY */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-200 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-400" />
          <span>اختيار القالب الجاهز الشامل:</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {themeList.map((preset) => {
            const isActive = currentTheme === preset.id;
            return (
              <div
                key={preset.id}
                className={`relative bg-slate-900/90 border rounded-2xl p-5 space-y-4 transition-all duration-200 flex flex-col justify-between ${
                  isActive
                    ? 'border-2 shadow-2xl ring-1'
                    : 'border-slate-800 hover:border-slate-700 hover:shadow-lg'
                }`}
                style={{
                  borderColor: isActive ? (customElements.primaryColor || preset.primaryColor) : undefined,
                  boxShadow: isActive ? `0 10px 30px -10px ${customElements.accentGlow || preset.accentGlow}` : undefined,
                  borderRadius: customElements.borderRadius || preset.borderRadius
                }}
              >
                {/* Active Badge Marker */}
                {isActive && (
                  <div
                    className="absolute -top-3 left-4 px-3 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md flex items-center gap-1 z-10"
                    style={{ backgroundColor: customElements.primaryColor || preset.primaryColor }}
                  >
                    <CheckCircle className="w-3 h-3" />
                    <span>النمط النشط كلياً</span>
                  </div>
                )}

                <div className="space-y-3">
                  {/* Header info */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                        {preset.id === 'royal_gold' && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                        {preset.id === 'cyber_matrix' && <Zap className="w-4 h-4 text-cyan-400 shrink-0" />}
                        {preset.id === 'emerald_jade' && <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />}
                        {preset.id === 'crimson_velvet' && <Flame className="w-4 h-4 text-rose-400 shrink-0" />}
                        {preset.id === 'clean_pearl' && <Sun className="w-4 h-4 text-blue-500 shrink-0" />}
                        {preset.id === 'midnight_lavender' && <Moon className="w-4 h-4 text-purple-400 shrink-0" />}
                        {preset.id === 'classic_sapphire' && <Laptop className="w-4 h-4 text-blue-400 shrink-0" />}
                        {preset.id === 'deep_void' && <Contrast className="w-4 h-4 text-sky-400 shrink-0" />}
                        <span>{preset.name}</span>
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {preset.shortDesc}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0"
                      style={{
                        color: preset.primaryColor,
                        borderColor: `${preset.primaryColor}40`,
                        backgroundColor: `${preset.primaryColor}15`
                      }}
                    >
                      {preset.badge}
                    </span>
                  </div>

                  {/* Features & Characteristics List */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] font-bold text-slate-400 block">مميزات وخصائص هذا النمط:</span>
                    <div className="space-y-1">
                      {preset.features.map((feat, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[10.5px] text-slate-300">
                          <CheckSquare className="w-3 h-3 shrink-0" style={{ color: preset.primaryColor }} />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mini Color Swatches */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] text-slate-500 font-semibold">الألوان:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: preset.primaryColor }} title="اللون الرئيسي" />
                      <span className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: preset.secondaryColor }} title="اللون الثانوي" />
                      <span className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: preset.bgMain }} title="خلفية البرنامج" />
                      <span className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: preset.bgCard }} title="خلفية البطاقات" />
                    </div>
                  </div>
                </div>

                {/* Action Apply Button */}
                <button
                  type="button"
                  onClick={() => handleSelectTheme(preset.id)}
                  className={`w-full py-2.5 px-4 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isActive
                      ? 'bg-slate-800 text-slate-200 border border-slate-700 cursor-default'
                      : 'text-white shadow-md hover:brightness-110'
                  }`}
                  style={{
                    background: !isActive ? preset.buttonGradient : undefined,
                    borderRadius: preset.borderRadius
                  }}
                >
                  {isActive ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>القالب المطبق حالياً</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>تحويل القالب لهذا النمط</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: COMPREHENSIVE THEME ELEMENTS CUSTOMIZER */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
              <Pipette className="w-5 h-5 text-amber-400" />
              <span>محرر ومخصص عناصر الثيم المتكامل (Theme Elements Customizer)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              يمكنك التعديل الحر المباشر لكافة ألوان وأشرطة وحواف وخطوط البرنامج مع معايان حية وفورية في الأسفل.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportThemeJSON}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              title="تصدير ملف الإعدادات المخصصة كـ JSON"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>تصدير الثيم</span>
            </button>

            <label className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>استيراد ثيم</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportThemeJSON}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handleResetCustomizations}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              title="استعادة الإعدادات الأصلية للقالب"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>إعادة ضبط القالب</span>
            </button>
          </div>
        </div>

        {/* Quick Color Palette Swatches */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 block">نماذج جاهزة سريعة للوحة الألوان (Quick Palettes):</label>
          <div className="flex flex-wrap items-center gap-2">
            {PALETTE_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPalettePreset(p)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] font-bold text-slate-300 transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-105"
              >
                <span className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: p.primary }} />
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Detailed Element Editors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 1. Primary Accent Color */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">اللون الأساسي (Primary Accent)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.primaryColor }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.primaryColor || activePreset.primaryColor}
                onChange={(e) => handleElementChange('primaryColor', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.primaryColor || activePreset.primaryColor}
                onChange={(e) => handleElementChange('primaryColor', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 2. Secondary Color */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">اللون الثانوي (Secondary Color)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.secondaryColor }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.secondaryColor || activePreset.secondaryColor}
                onChange={(e) => handleElementChange('secondaryColor', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.secondaryColor || activePreset.secondaryColor}
                onChange={(e) => handleElementChange('secondaryColor', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 3. Main Application Background */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">خلفية البرنامج الرئيسية (App Main BG)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.bgMain }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.bgMain || activePreset.bgMain}
                onChange={(e) => handleElementChange('bgMain', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.bgMain || activePreset.bgMain}
                onChange={(e) => handleElementChange('bgMain', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 4. Cards & Tables Background */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">خلفية البطاقات والجداول (Cards BG)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.bgCard }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.bgCard || activePreset.bgCard}
                onChange={(e) => handleElementChange('bgCard', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.bgCard || activePreset.bgCard}
                onChange={(e) => handleElementChange('bgCard', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 5. Header Background */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">خلفية الشريط العلوي (Header BG)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.bgHeader }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.bgHeader || activePreset.bgHeader}
                onChange={(e) => handleElementChange('bgHeader', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.bgHeader || activePreset.bgHeader}
                onChange={(e) => handleElementChange('bgHeader', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 6. Sidebar Background */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">خلفية القائمة الجانبية (Sidebar BG)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.bgSidebar }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.bgSidebar || activePreset.bgSidebar}
                onChange={(e) => handleElementChange('bgSidebar', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.bgSidebar || activePreset.bgSidebar}
                onChange={(e) => handleElementChange('bgSidebar', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 7. Border Color */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">لون الحدود والإطارات (Border Color)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.borderColor }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.borderColor || activePreset.borderColor}
                onChange={(e) => handleElementChange('borderColor', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.borderColor || activePreset.borderColor}
                onChange={(e) => handleElementChange('borderColor', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 8. Text Main Color */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">لون النصوص الرئيسي (Main Text)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.textColor }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.textColor || activePreset.textColor}
                onChange={(e) => handleElementChange('textColor', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.textColor || activePreset.textColor}
                onChange={(e) => handleElementChange('textColor', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 9. Text Muted / Secondary Color */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">لون النصوص الثانوية (Muted Text)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.textMuted || activePreset.textMuted }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.textMuted || activePreset.textMuted}
                onChange={(e) => handleElementChange('textMuted', e.target.value)}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.textMuted || activePreset.textMuted}
                onChange={(e) => handleElementChange('textMuted', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 10. Accent Glow Color */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200">لون التوهج والظلال (Accent Glow)</label>
              <span className="w-4 h-4 rounded-md border border-white/20 shadow" style={{ backgroundColor: customElements.accentGlow || activePreset.accentGlow }} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={customElements.primaryColor || activePreset.primaryColor}
                onChange={(e) => {
                  const hex = e.target.value;
                  const r = parseInt(hex.slice(1, 3), 16) || 0;
                  const g = parseInt(hex.slice(3, 5), 16) || 0;
                  const b = parseInt(hex.slice(5, 7), 16) || 0;
                  handleElementChange('accentGlow', `rgba(${r}, ${g}, ${b}, 0.45)`);
                }}
                className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700 cursor-pointer shrink-0"
              />
              <input
                type="text"
                value={customElements.accentGlow || activePreset.accentGlow}
                onChange={(e) => handleElementChange('accentGlow', e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 font-mono"
              />
            </div>
          </div>

          {/* 11. Border Radius & Shapes */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5 space-y-2">
            <label className="text-xs font-bold text-slate-200 block">درجة استدارة الحواف (Border Radius)</label>
            <div className="grid grid-cols-5 gap-1 pt-1">
              {[
                { label: 'حاد', val: '0px' },
                { label: 'خفيف', val: '0.375rem' },
                { label: 'متوسط', val: '0.75rem' },
                { label: 'دائري', val: '1.25rem' },
                { label: 'كبسولي', val: '1.75rem' }
              ].map((r) => (
                <button
                  key={r.val}
                  type="button"
                  onClick={() => handleElementChange('borderRadius', r.val)}
                  className={`py-1.5 text-[10px] font-bold rounded-lg border transition-all cursor-pointer ${
                    customElements.borderRadius === r.val
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Typography Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-blue-400" />
              <span>خط القوائم والنصوص (Font Family)</span>
            </label>
            <select
              value={customElements.fontFamily || 'cairo'}
              onChange={(e) => {
                handleElementChange('fontFamily', e.target.value);
                safeStorage.setItem('set_app_font_family', e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer font-sans"
            >
              <option value="'Cairo', sans-serif">خط القاهرة (Cairo - القياسي الموصى به)</option>
              <option value="'Tajawal', sans-serif">خط تجوال (Tajawal - أنيق ومريح)</option>
              <option value="'Inter', sans-serif">خط إنتر (Inter - عصري وتقني)</option>
              <option value="system-ui, -apple-system, sans-serif">خط النظام التلقائي (System Default)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>نسبة تكبير وعرض الخطوط (Font Scale)</span>
            </label>
            <select
              value={customElements.fontSize || '100'}
              onChange={(e) => {
                handleElementChange('fontSize', e.target.value);
                safeStorage.setItem('set_app_font_size', e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer font-sans"
            >
              <option value="85">🔍 صغير (85% - مناسب للشاشات الصغيرة)</option>
              <option value="100">⚖️ قياسي متوازن (100% - العرض الموصى به)</option>
              <option value="115">📖 كبير وواضح (115% - سهولة القراءة)</option>
              <option value="125">🔎 ضخم (125% - رؤية واضحة جداً)</option>
            </select>
          </div>
        </div>

        {/* Live Interactive Preview Box */}
        <div className="space-y-2 pt-2 border-t border-slate-800">
          <label className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>معاينة حية تفاعلية لعناصر الثيم المخصص:</span>
          </label>

          <div
            className="p-4 border rounded-2xl space-y-3 transition-all duration-200 shadow-xl"
            style={{
              backgroundColor: customElements.bgMain || activePreset.bgMain,
              borderColor: customElements.borderColor || activePreset.borderColor,
              borderRadius: customElements.borderRadius || activePreset.borderRadius,
              color: customElements.textColor || activePreset.textColor,
              fontFamily: customElements.fontFamily || activePreset.fontFamily
            }}
          >
            {/* Header Preview */}
            <div
              className="flex items-center justify-between p-2.5 border rounded-xl"
              style={{
                backgroundColor: customElements.bgHeader || activePreset.bgHeader,
                borderColor: customElements.borderColor || activePreset.borderColor,
                borderRadius: customElements.borderRadius || activePreset.borderRadius
              }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: customElements.primaryColor || activePreset.primaryColor }} />
                <span className="text-xs font-bold">لوحة التحكم Live Preview</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="px-2 py-0.5 rounded-full font-mono font-bold" style={{ backgroundColor: `${customElements.primaryColor || activePreset.primaryColor}25`, color: customElements.primaryColor || activePreset.primaryColor }}>
                  نشط +150
                </span>
              </div>
            </div>

            {/* Sidebar + Table Card Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              {/* Sidebar */}
              <div
                className="col-span-1 border p-2.5 space-y-1.5"
                style={{
                  backgroundColor: customElements.bgSidebar || activePreset.bgSidebar,
                  borderColor: customElements.borderColor || activePreset.borderColor,
                  borderRadius: customElements.borderRadius || activePreset.borderRadius
                }}
              >
                <div
                  className="p-2 font-bold text-xs flex items-center gap-2"
                  style={{
                    background: `linear-gradient(90deg, ${customElements.primaryColor || activePreset.primaryColor}40 0%, ${customElements.secondaryColor || activePreset.secondaryColor}10 100%)`,
                    color: customElements.primaryColor || activePreset.primaryColor,
                    borderRadius: customElements.borderRadius || activePreset.borderRadius
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: customElements.primaryColor || activePreset.primaryColor }} />
                  <span>المشتركين</span>
                </div>
                <div className="p-1.5 opacity-70 text-xs">الكروت والطباعة</div>
                <div className="p-1.5 opacity-70 text-xs">الإعدادات والمظهر</div>
              </div>

              {/* Card Table */}
              <div
                className="col-span-2 border p-3 space-y-2.5"
                style={{
                  backgroundColor: customElements.bgCard || activePreset.bgCard,
                  borderColor: customElements.borderColor || activePreset.borderColor,
                  borderRadius: customElements.borderRadius || activePreset.borderRadius
                }}
              >
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>جدول المشتركين المباشر</span>
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg text-white font-bold text-[10px] shadow"
                    style={{
                      background: `linear-gradient(135deg, ${customElements.primaryColor || activePreset.primaryColor} 0%, ${customElements.secondaryColor || activePreset.secondaryColor} 100%)`,
                      borderRadius: customElements.borderRadius || activePreset.borderRadius
                    }}
                  >
                    زر إضافة جديد
                  </button>
                </div>

                <div
                  className="p-2 border rounded-xl flex items-center justify-between text-[11px]"
                  style={{
                    borderColor: customElements.borderColor || activePreset.borderColor
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">user_preview</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      متصل الآن
                    </span>
                  </div>
                  <span className="font-mono font-bold" style={{ color: customElements.primaryColor || activePreset.primaryColor }}>
                    باقة 10 ميجا
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Confirmation Button */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => {
              saveCustomThemeElements(customElements);
              applyAppTheme(currentTheme, customElements);
              showToast('تم حفظ وتأكيد كافة عناصر الثيم المخصص بنجاح على البرنامج!', 'success');
            }}
            className="px-6 py-2.5 rounded-xl text-white font-bold text-xs shadow-xl hover:brightness-110 transition-all flex items-center gap-2 cursor-pointer"
            style={{
              background: `linear-gradient(135deg, ${customElements.primaryColor || activePreset.primaryColor} 0%, ${customElements.secondaryColor || activePreset.secondaryColor} 100%)`,
              borderRadius: customElements.borderRadius || activePreset.borderRadius
            }}
          >
            <Save className="w-4 h-4" />
            <span>حفظ وتطبيق عناصر الثيم المخصص الآن</span>
          </button>
        </div>
      </div>
    </div>
  );
};
