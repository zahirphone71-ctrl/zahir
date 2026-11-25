import React, { useState, useRef, useEffect } from "react";
import { 
  Palette, Sparkles, Check, Plus, Trash2, Download, Upload, Sliders, RotateCcw
} from "lucide-react";
import { VoucherDesignState } from "./types";
import { VoucherCardPreview } from "./VoucherCardPreview";
import { THEME_PRESETS, applyThemeToDesign } from "./themePresets";
import { safeStorage } from "../../utils/safeStorage";
import { secureFetch, safeParseJson } from "../../lib/api";
import { ConfirmModal } from "../ConfirmModal";

export interface SavedTemplateItem {
  id: string;
  name: string;
  design: VoucherDesignState;
  createdAt: string;
}

interface ThemeGalleryViewProps {
  design: VoucherDesignState;
  setDesign: React.Dispatch<React.SetStateAction<VoucherDesignState>>;
  applyTemplate: (templateName: VoucherDesignState["theme"]) => void;
  resetToDefaults: () => void;
  exportDesign: () => void;
  importDesign: (file: File) => void;
  showToast?: (msg: string, type?: "success" | "error" | "info") => void;
  onGoToStudio?: () => void;
}

export const ThemeGalleryView: React.FC<ThemeGalleryViewProps> = ({
  design,
  setDesign,
  applyTemplate,
  resetToDefaults,
  exportDesign,
  importDesign,
  showToast,
  onGoToStudio
}) => {
  const [galleryFilter, setGalleryFilter] = useState<"all" | "presets" | "custom">("all");
  
  // Saved Custom Templates from safeStorage + Server Store
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplateItem[]>(() => {
    try {
      const stored = safeStorage.getItem("zahir_saved_voucher_templates");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
      return [];
    } catch {
      return [];
    }
  });

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load persistent templates from server on mount
  useEffect(() => {
    const controller = new AbortController();
    secureFetch('/api/vouchers/templates', {
      signal: controller.signal
    })
      .then(async res => {
        if (!res.ok) return null;
        return safeParseJson(res);
      })
      .then(data => {
        if (isMountedRef.current && data?.success && Array.isArray(data.templates) && data.templates.length > 0) {
          setSavedTemplates(data.templates);
          safeStorage.setItem("zahir_saved_voucher_templates", JSON.stringify(data.templates));
        }
      })
      .catch(() => {});
    return () => { controller.abort(); };
  }, []);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Save Current Design as Custom Template (Server + Local)
  const handleSaveCustomTemplate = async () => {
    if (savingTemplate) return;
    if (!newTemplateName.trim()) {
      showToast?.("الرجاء إدخال اسم للقالب", "error");
      return;
    }
    setSavingTemplate(true);
    const item: SavedTemplateItem = {
      id: "tmpl_" + Date.now(),
      name: newTemplateName.trim(),
      design: JSON.parse(JSON.stringify(design)),
      createdAt: new Date().toISOString()
    };
    const updated = [item, ...savedTemplates.filter(t => t.id !== item.id)];
    setSavedTemplates(updated);
    safeStorage.setItem("zahir_saved_voucher_templates", JSON.stringify(updated));
    setNewTemplateName("");
    setShowSaveModal(false);

    // Persistent server save
    let serverSynced = false;
    try {
      const res = await secureFetch('/api/vouchers/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        const data = (await safeParseJson(res)) || {};
        serverSynced = data?.success !== false;
      }
    } catch (e) {
      console.warn('Failed to sync template to server:', e);
    } finally {
      if (isMountedRef.current) setSavingTemplate(false);
    }

    if (!isMountedRef.current) return;
    if (serverSynced) {
      showToast?.(`تم حفظ القالب (${item.name}) بنجاح في قاعدة البيانات الدائمة ومعرض القوالب`, "success");
    } else {
      showToast?.(`تم حفظ القالب (${item.name}) محلياً (تعذر المزامنة مع السيرفر)`, "info");
    }
  };

  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);

  // Delete Custom Template (Server + Local)
  const handleDeleteCustomTemplate = (id: string, name: string) => {
    setTemplateToDelete({ id, name });
  };

  const handleExecuteDeleteTemplate = async () => {
    if (!templateToDelete || deletingTemplate) return;
    setDeletingTemplate(true);
    const { id, name } = templateToDelete;
    const updated = savedTemplates.filter(t => t.id !== id);
    setSavedTemplates(updated);
    safeStorage.setItem("zahir_saved_voucher_templates", JSON.stringify(updated));

    let serverDeleted = false;
    try {
      const token = safeStorage.getItem("zcontrol_active_token");
      const res = await fetch(`/api/vouchers/templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: token ? { 'X-Router-Token': token } : {}
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        serverDeleted = data?.success !== false;
      }
    } catch (e) {
      console.warn('Failed to delete template from server:', e);
    } finally {
      if (isMountedRef.current) {
        setDeletingTemplate(false);
        setTemplateToDelete(null);
      }
    }

    if (!isMountedRef.current) return;
    showToast?.(
      serverDeleted
        ? `تم حذف القالب (${name}) بنجاح`
        : `تم حذف القالب (${name}) محلياً (تعذر الحذف من السيرفر)`,
      "info"
    );
  };

  // Load Custom Template
  const handleLoadCustomTemplate = (item: SavedTemplateItem) => {
    setDesign(item.design);
    showToast?.(`تم تطبيق القالب المخصص: ${item.name}`, "success");
    if (onGoToStudio) onGoToStudio();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importDesign(file);
    }
    e.target.value = "";
  };

  // All 9 Built-in Distinct Preset Themes
  const BUILTIN_PRESETS: Array<{
    id: VoucherDesignState["theme"];
    title: string;
    desc: string;
    badge: string;
    fontName: string;
    shapeDesc: string;
  }> = [
    { id: "modern", title: "💡 عصري A4 الحديث", desc: "خلفية كربونية كحلي متدرجة مع خط تجوال وأزرار توهج نيون عالية التباين", badge: "شائع", fontName: "خط تجوال", shapeDesc: "حواف ناعمة 10px" },
    { id: "luxury", title: "👑 ملكي فاخر VIP", desc: "تصميم ملكي ذهبي بخط أميري الأصيل وإطار ذهبي مزدوج مع أقواس زخرفية", badge: "فئة VIP", fontName: "خط أميري (Serif)", shapeDesc: "إطار ذهبي مزدوج 4px" },
    { id: "gamer", title: "🎮 سايبر جيمر نيون", desc: "تخطيط تيك فريد معكوس (الباركود يساراً والكود يميناً) بخط كايرو عريض وأقواس سيان", badge: "قيمنق", fontName: "خط كايرو عريض", shapeDesc: "تخطيط معكوس 1px" },
    { id: "minimal", title: "📐 مبسط نظيف هندسي", desc: "خلفية بيضاء نقية للطباعة بأقل حبر، بخط المراعي وأسطر سفلية أنيقة بدون صناديق", badge: "مبسط", fontName: "خط المراعي", shapeDesc: "حواف 16px بدون إطارات" },
    { id: "neon", title: "⚡ نيون سايبر مشع", desc: "خلفية ليلية كربونية مع توهج نيون وردي وأخضر زمردي وخط تجوال أسود 900", badge: "نيون", fontName: "تجوال 900 مشع", shapeDesc: "توهج نيون 12px" },
    { id: "classic", title: "📜 كلاسيكي ورقي عتيق", desc: "كرت شحن ورقي كلاسيكي بخط أميري عتيق وإطار مشرشر عتيق وزوايا حادة تماماً", badge: "اقتصادي", fontName: "خط أميري كلاسيكي", shapeDesc: "إطار مشرشر حاد 0px" },
    { id: "glass", title: "🪟 زجاجي بلوري شفاف", desc: "تأثير بلوري زجاجي شفاف فاخر مع كبسولات دائرية كاملة لبيانات الدخول بخط المراعي", badge: "بلوري", fontName: "خط المراعي", shapeDesc: "كبسولات دائرية 22px" },
    { id: "swiss", title: "🇨🇭 سويسري تايبوغرافي", desc: "تنسيق شبكي سويسري دقيق بزوايا حادة 0px وأرقام JetBrains ضخمة وأحمر سويسري", badge: "احترافي", fontName: "كايرو معماري", shapeDesc: "زوايا حادة 0px هندسي" },
    { id: "dark", title: "🖤 ليلي كربوني فخم", desc: "خلفية كربونية عميقة وألوان رمادية متدرجة مريحة للعين بخط تجوال أنيق", badge: "داكن", fontName: "خط تجوال", shapeDesc: "كربوني داكن 8px" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-150 font-sans" dir="rtl">
      {/* Gallery Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 p-6 rounded-2xl border border-indigo-500/30 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2.5">
            <Palette className="w-6 h-6 text-amber-400 animate-pulse" />
            <span>معرض الأنماط والثيمات والقوالب الشامل</span>
          </h2>
          <p className="text-slate-300 text-xs mt-1">
            دمج كامل لجميع الأنماط الجاهزة الـ 8 والقوالب المخصصة مع معاينة مباشرة وتطبيق فوري على الكروت
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            className="flex-1 md:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            <span>حفظ التصميم الحالي كقالب</span>
          </button>

          <label className="flex-1 md:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 cursor-pointer transition-colors flex items-center justify-center gap-1.5">
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>استيراد قالب</span>
            <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
          </label>

          <button
            type="button"
            onClick={exportDesign}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-bold text-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>تصدير التصميم</span>
          </button>

          {onGoToStudio && (
            <button
              type="button"
              onClick={onGoToStudio}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
              <span>العودة للمصمم والتوليد</span>
            </button>
          )}
        </div>
      </div>

      {/* Save Template Modal Form */}
      {showSaveModal && (
        <div className="bg-slate-950 border border-indigo-500/40 p-5 rounded-2xl shadow-2xl space-y-3 animate-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-black text-amber-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>حفظ التصميم الحالي كقالب مخصص</span>
            </h4>
            <button
              type="button"
              onClick={() => setShowSaveModal(false)}
              className="text-slate-400 hover:text-white font-bold text-sm"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-400">
            سيتم حفظ جميع إعدادات كرتك الحالية (الألوان، الخطوط، المقاسات، المواقع، الشعار والخلفيات) في معرض القوالب للاستخدام المباشر لاحقاً.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTemplateName}
              onChange={e => setNewTemplateName(e.target.value)}
              placeholder="اسم القالب (مثلاً: كروت VIP الذهبية، طابعة حرارية 80mm...)"
              className="flex-1 bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={handleSaveCustomTemplate}
              disabled={savingTemplate}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-black cursor-pointer shadow disabled:opacity-50"
            >
              {savingTemplate ? "جاري الحفظ..." : "حفظ في المعرض"}
            </button>
            <button
              type="button"
              onClick={() => setShowSaveModal(false)}
              className="bg-slate-800 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-2.5 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGalleryFilter("all")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              galleryFilter === "all"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-slate-950 text-slate-400 hover:text-white"
            }`}
          >
            <span>✨ كافة التصاميم والقوالب ({BUILTIN_PRESETS.length + savedTemplates.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setGalleryFilter("presets")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              galleryFilter === "presets"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-slate-950 text-slate-400 hover:text-white"
            }`}
          >
            <span>🎨 الأنماط الجاهزة ({BUILTIN_PRESETS.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setGalleryFilter("custom")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              galleryFilter === "custom"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-slate-950 text-slate-400 hover:text-white"
            }`}
          >
            <span>📌 قوالبي المحفوظة ({savedTemplates.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={resetToDefaults}
          className="text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1.5 bg-rose-950/40 px-3 py-1.5 rounded-xl border border-rose-900/40 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>استعادة النمط الافتراضي</span>
        </button>
      </div>

      {/* SECTION 1: CUSTOM SAVED TEMPLATES (IF ANY OR IF FILTERED) */}
      {(galleryFilter === "all" || galleryFilter === "custom") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-black text-amber-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>قوالبي المخصصة المحفوظة ({savedTemplates.length})</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums">القوالب التي قمت بتصميمها وحفظها محلياً</span>
          </div>

          {savedTemplates.length === 0 ? (
            <div className="bg-slate-950/60 p-6 rounded-2xl border border-dashed border-slate-800 text-center space-y-2">
              <Palette className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-bold text-slate-400">لا توجد قوالب مخصصة محفوظة بعد</p>
              <p className="text-[11px] text-slate-500">
                يمكنك تصميم كرتك المفضل بالاستوديو ثم الضغط على "حفظ التصميم الحالي كقالب" ليظهر هنا.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {savedTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="bg-slate-900 border border-indigo-500/30 hover:border-indigo-400 rounded-2xl p-4 space-y-3 shadow-lg transition-all flex flex-col justify-between"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-md">
                        قالب مخصص
                      </span>
                      <h4 className="text-sm font-black text-white mt-1">{tmpl.name}</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomTemplate(tmpl.id, tmpl.name)}
                      className="text-rose-400 hover:text-rose-300 p-1 bg-rose-950/40 rounded-lg border border-rose-900/40 cursor-pointer"
                      title="حذف القالب"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Card Visual Preview */}
                  <div className="py-1">
                    <VoucherCardPreview
                      code="user7744"
                      pin="pass1122"
                      price={tmpl.design.price || 500}
                      timeLimit={tmpl.design.timeLimit || "30 يوم"}
                      dataLimit={tmpl.design.dataLimit || "5 GB"}
                      profileName="باقة مخصصة VIP"
                      networkName={tmpl.design.networkName || design.networkName}
                      design={tmpl.design}
                      fontScale={1}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(tmpl.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleLoadCustomTemplate(tmpl)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-xs shadow cursor-pointer transition-all flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>تطبيق هذا القالب</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: BUILT-IN PRESET THEMES SHOWCASE (8 THEMES) */}
      {(galleryFilter === "all" || galleryFilter === "presets") && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Palette className="w-4 h-4 text-indigo-400" />
              <span>الأنماط والثيمات القياسية المصممة إتاحتها ({BUILTIN_PRESETS.length} ثيمات)</span>
            </h3>
            <span className="text-[11px] text-slate-400">اضغط على أي نمط لتطبيقه فوراً على المصمم والمعاينة والطباعة</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {BUILTIN_PRESETS.map((preset) => {
              const isCurrent = design.theme === preset.id;
              const previewDesign = applyThemeToDesign(design, preset.id);
              const presetData = THEME_PRESETS[preset.id];
              return (
                <div
                  key={preset.id}
                  className={`bg-slate-900 rounded-2xl p-4 border transition-all flex flex-col justify-between space-y-3 shadow-xl ${
                    isCurrent
                      ? "border-amber-400 ring-2 ring-amber-400/30 bg-slate-900/90"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isCurrent
                          ? "bg-amber-400/20 text-amber-300 border-amber-400/40"
                          : "bg-slate-800 text-slate-300 border-slate-700"
                      }`}>
                        {preset.badge}
                      </span>
                      <h4 className="text-sm font-black text-white mt-1">{preset.title}</h4>
                    </div>

                    {isCurrent && (
                      <span className="p-1 bg-amber-400 text-slate-950 rounded-full font-black text-[10px] flex items-center gap-1 shrink-0">
                        <Check className="w-3 h-3" />
                        <span>مُفعل</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed min-h-[32px]">
                    {preset.desc}
                  </p>

                  {/* Real Live Card Render with this specific preset */}
                  <div className="py-1">
                    <VoucherCardPreview
                      theme={preset.id}
                      design={previewDesign}
                      code="user8821"
                      pin="pass9988"
                      price={previewDesign.price || 500}
                      currency={previewDesign.currencySymbol || "ريال"}
                      timeLimit={previewDesign.timeLimit || "30 يوم"}
                      dataLimit={previewDesign.dataLimit || "10 GB"}
                      profileName="باقة النجوم"
                      networkName={previewDesign.networkName || "شبكة زاهر للإنترنت"}
                      fontScale={0.92}
                    />
                  </div>

                  {/* Distinctive Specs Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-300 font-mono flex items-center gap-1">
                      <span>🖋️</span> {preset.fontName}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-slate-300 flex items-center gap-1">
                      <span>📐</span> {preset.shapeDesc}
                    </span>
                    {presetData && (
                      <span className="px-2 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-amber-300/90 font-mono">
                        {presetData.userBoxStyle === 'underline' ? 'سطر سفلي' : presetData.userBoxStyle === 'pill' ? 'كبسولة' : presetData.userBoxStyle === 'none' ? 'أرقام مباشرة' : 'صندوق نيون'}
                      </span>
                    )}
                  </div>

                  {/* Apply Button */}
                  <button
                    type="button"
                    onClick={() => {
                      applyTemplate(preset.id);
                      showToast?.(`تم تفعيل نمط ${preset.title}`, "success");
                      if (onGoToStudio) onGoToStudio();
                    }}
                    className={`w-full py-2 px-3 rounded-xl font-black text-xs transition-all shadow cursor-pointer flex items-center justify-center gap-1.5 ${
                      isCurrent
                        ? "bg-amber-400 hover:bg-amber-300 text-slate-950"
                        : "bg-indigo-600 hover:bg-indigo-500 text-white"
                    }`}
                  >
                    {isCurrent ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>القالب المطبق حالياً</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>تطبيق هذا النمط</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Custom Template Confirm Modal */}
      <ConfirmModal
        isOpen={!!templateToDelete}
        title="تأكيد حذف القالب المحفوظ"
        message={`هل تريد بالتأكيد حذف القالب المحفوظ (${templateToDelete?.name}) نهائياً من قاعدة البيانات ومعرض القوالب؟`}
        confirmText="نعم، حذف القالب"
        cancelText="إلغاء"
        type="danger"
        isLoading={deletingTemplate}
        onConfirm={handleExecuteDeleteTemplate}
        onClose={() => !deletingTemplate && setTemplateToDelete(null)}
      />
    </div>
  );
};
