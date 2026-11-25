import React, { useState } from "react";
import { 
  Palette, RefreshCw, Network, Key, ChevronDown, ChevronUp,
  Type, Sparkles, LayoutGrid, Smartphone, Download, Archive, Hash,
  Printer, Move, Upload, Trash2, Eye, EyeOff, Minus, Plus
} from "lucide-react";
import { VoucherDesignState } from "./types";
import { GridResult } from "./gridCalculator";

interface ProfileItem {
  id: string;
  name: string;
  price: number;
  validity?: string | number;
  rateLimit?: string;
  sharedUsers?: string | number;
  sessionTimeout?: string;
  idleTimeout?: string;
  [key: string]: any;
}

interface DesignTabProps {
  design: VoucherDesignState;
  setDesign: React.Dispatch<React.SetStateAction<VoucherDesignState>>;
  profiles: ProfileItem[];
  exportDesign: () => void;
  importDesign: (file: File) => void;
  onFetchNetworkTabInfo?: () => void;
  gridInfo?: GridResult | null;
  fontScale?: number;
  onOpenCustomVoucherModal?: () => void;
}

export interface SavedTemplateItem {
  id: string;
  name: string;
  design: VoucherDesignState;
  createdAt: string;
}

export const DesignTab: React.FC<DesignTabProps> = ({
  design,
  setDesign,
  profiles = [],
  exportDesign,
  importDesign,
  onFetchNetworkTabInfo,
  gridInfo,
  fontScale,
  onOpenCustomVoucherModal
}) => {
  // Collapsible accordion open states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    generate: true,
    templates: true,
    paper: false,
    network: false,
    currency: false,
    elements: false
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      importDesign(file);
    }
    e.target.value = "";
  };

  const handleElementConfigChange = (
    elementKey: keyof VoucherDesignState["elements"],
    prop: string,
    value: any
  ) => {
    setDesign(prev => ({
      ...prev,
      elements: {
        ...prev.elements,
        [elementKey]: {
          ...(prev.elements[elementKey] || { show: true, color: "#ffffff", fontSize: 14, rotation: 0, hasShadow: false }),
          [prop]: value
        }
      }
    }));
  };

  return (
    <div className="space-y-4 text-right font-sans max-w-5xl mx-auto" dir="rtl">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Palette className="h-5 w-5 text-indigo-400 shrink-0" />
            <span>تخصيص وتصميم الكروت والتوليد التفاعلي</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            تخصيص القوالب والمقاسات والألوان وفواصل القص والطباعة الحرارية ومواقع العناصر بالسحب والإفلات المباشر
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {onOpenCustomVoucherModal && (
            <button
              type="button"
              onClick={onOpenCustomVoucherModal}
              className="flex-1 md:flex-none px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Sparkles size={14} className="text-slate-950" />
              <span>توليد كرت مخصص</span>
            </button>
          )}

          <label className="flex-1 md:flex-none text-center px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium text-slate-300 cursor-pointer transition-colors flex items-center justify-center gap-1.5">
            <Archive size={14} />
            <span>استيراد قالب</span>
            <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
          </label>
          <button 
            type="button" 
            onClick={exportDesign}
            className="flex-1 md:flex-none px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download size={14} />
            <span>تصدير التصميم</span>
          </button>
        </div>
      </div>

      {/* ACCORDION 1: BATCH GENERATION & PROFILE SETTINGS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("generate")}
          className="w-full p-4 sm:p-5 flex items-center justify-between bg-slate-900 hover:bg-slate-800/80 transition-colors cursor-pointer text-right border-b border-slate-800"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-slate-800 rounded-xl text-indigo-400 border border-slate-700">
              <Hash className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">بيانات الكروت والتوليد وباقة ZCtrl</h3>
              <p className="text-[11px] text-slate-400">تحديد الباقات، الكميات، بادئة الأكواد والصلاحيات</p>
            </div>
          </div>
          <span className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
            {openSections.generate ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {openSections.generate && (
          <div className="p-5 space-y-5 bg-slate-950/40 animate-in fade-in duration-150">
            {/* System Type Selector */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
              <label className="block text-xs font-bold text-slate-300">نظام ZCtrl المستهدف (System Target):</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "hotspot", label: "📶 سيرفر الهوتسبوت", desc: "كروت مستخدمي الهوتسبوت" },
                  { id: "pppoe", label: "🌐 اشتراكات PPPoE", desc: "يوزرات وسيرفرات البرودباند" },
                  { id: "userman", label: "🛡️ اليوزر مانجر", desc: "User Manager V6/V7" }
                ].map(sys => (
                  <button
                    key={sys.id}
                    type="button"
                    onClick={() => setDesign(prev => ({ ...prev, systemType: sys.id as any }))}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                      (design.systemType || "hotspot") === sys.id
                        ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-black">{sys.label}</div>
                    <div className="text-[10px] opacity-70 font-normal mt-0.5">{sys.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Target Profile */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">بروفايل وباقة الكروت</label>
                <select 
                  value={design.targetProfile} 
                  onChange={e => {
                    const profName = e.target.value;
                    const found = (profiles || []).find(p => p.name === profName);
                    setDesign(prev => ({
                      ...prev,
                      targetProfile: profName,
                      price: found?.price !== undefined ? found.price : prev.price,
                      timeLimit: found
                        ? (found.validityDays ? `${found.validityDays} يوم` : (found.validity ? String(found.validity) : ''))
                        : prev.timeLimit,
                      dataLimit: found
                        ? (found.dataQuotaMb ? `${found.dataQuotaMb} MB` : '')
                        : prev.dataLimit
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">اختر باقة...</option>
                  {(profiles || []).map((p, i) => (
                    <option key={p.id || i} value={p.name}>
                      {p.name} {p.price ? `- ${p.price} ريال` : ''} {p.validity ? `[${p.validity}]` : ''} ({p.rateLimit || 'كامل السرعة'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity with Presets */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-300">كمية الكروت</label>
                  <span className="text-[10px] text-indigo-400 font-mono font-bold">حتى 10,000 كرت</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={design.quantity}
                  onChange={e => setDesign(prev => ({ ...prev, quantity: Math.min(10000, Math.max(1, parseInt(e.target.value, 10) || 10)) }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-indigo-500"
                />
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {[10, 50, 100, 250, 500, 1000, 2000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDesign(prev => ({ ...prev, quantity: preset }))}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                        design.quantity === preset
                          ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prefix */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-300">بادئة الكود (اختياري)</label>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={design.autoPrefix}
                      onChange={e => setDesign(prev => ({
                        ...prev,
                        autoPrefix: e.target.checked,
                        prefixValue: e.target.checked ? prev.prefixValue : ""
                      }))}
                      className="w-3 h-3 rounded text-indigo-600 bg-slate-950 border-slate-700"
                    />
                    <span className="text-[10px] text-slate-400">إضافة بادئة</span>
                  </label>
                </div>
                <input
                  type="text"
                  disabled={!design.autoPrefix}
                  value={design.autoPrefix ? design.prefixValue : ""}
                  onChange={e => setDesign(prev => ({ ...prev, prefixValue: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-indigo-500 disabled:opacity-40"
                  placeholder="بدون بادئة (نفس الكود)"
                />
              </div>

              {/* Character Type */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">نوع الرموز والأكواد</label>
                <select
                  value={design.charType || (design.codeType === "numeric" ? "numbers" : design.codeType === "alpha" ? "letters" : "mixed")}
                  onChange={e => {
                    const val = e.target.value as any;
                    setDesign(prev => ({
                      ...prev,
                      charType: val,
                      codeType: val === "numbers" ? "numeric" : val === "letters" ? "alpha" : "alphanumeric"
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="numbers">[123] أرقام فقط (0123456789)</option>
                  <option value="letters">[ABC] حروف فقط (abcdefgh)</option>
                  <option value="mixed">[#] أرقام وحروف مدمجة</option>
                  <option value="uppercase_pin">[*] أكواد PIN كبيرة بدون التباس</option>
                </select>
              </div>
            </div>

            {/* Auth Mode, User length, Pass length, Price */}
            {/* Auth Mode, User length, Pass length, Price */}
            <div className="space-y-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              {/* Auth Mode Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">نمط تسجيل الدخول والتعامل مع كلمة المرور</label>
                  <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80">
                    ✨ متوافق 100% مع نظام المايكروتك
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDesign(prev => ({ ...prev, authMode: "user_equals_pass", sameUserPass: true }))}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                      design.authMode === "user_equals_pass" || (design.sameUserPass && design.authMode !== "user_only")
                        ? "bg-gradient-to-r from-emerald-600 to-indigo-600 text-white border-emerald-400 shadow-md shadow-emerald-500/20 font-black"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-1 font-black">
                      <span>🔑</span>
                      <span>اسم المستخدم = كلمة المرور</span>
                    </span>
                    <span className="text-[9px] opacity-80 font-normal">كود موحد متوافق مع المايكروتك</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDesign(prev => ({ ...prev, authMode: "user_only", sameUserPass: false }))}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                      design.authMode === "user_only"
                        ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/20 font-black"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-1 font-black">
                      <span>🎫</span>
                      <span>كود واحد فقط (بدون رمز)</span>
                    </span>
                    <span className="text-[9px] opacity-80 font-normal">نفس الكرت فقط بدون كلمة مرور</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDesign(prev => ({ ...prev, authMode: "user_pass", sameUserPass: false }))}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                      design.authMode === "user_pass" && !design.sameUserPass
                        ? "bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/20 font-black"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    <span className="flex items-center gap-1 font-black">
                      <span>🔐</span>
                      <span>يوزر + باسورد مختلفين</span>
                    </span>
                    <span className="text-[9px] opacity-80 font-normal">كلمة مرور مستقلة عشوائية</span>
                  </button>
                </div>
              </div>

              {/* Quick Same-Password Toggle Banner */}
              <div className="flex flex-wrap items-center justify-between p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 font-bold text-xs">⚡ خيار التطابق التام:</span>
                  <span className="text-[11px] text-slate-300">جعل اسم المستخدم مساوياً لكلمة المرور في المايكروتك</span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={design.authMode === "user_equals_pass" || design.sameUserPass === true}
                    onChange={e => {
                      const isChecked = e.target.checked;
                      setDesign(prev => ({
                        ...prev,
                        authMode: isChecked ? "user_equals_pass" : "user_pass",
                        sameUserPass: isChecked,
                        passwordLength: prev.codeLength
                      }));
                    }}
                    className="w-4 h-4 rounded text-emerald-600 bg-slate-950 border-slate-700 cursor-pointer"
                  />
                  <span className={`text-xs font-bold ${design.authMode === "user_equals_pass" || design.sameUserPass ? "text-emerald-400" : "text-slate-400"}`}>
                    تفعيل (اسم المستخدم = كلمة المرور)
                  </span>
                </label>
              </div>

              {/* Hide Password from Print Option when Username Equals Password */}
              {(design.authMode === "user_equals_pass" || design.sameUserPass) && (
                <div className="flex items-center justify-between p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 font-bold text-xs">👁️ إخفاء الباسورد عند الطباعة:</span>
                    <span className="text-[11px] text-slate-300">إخفاء حقل كلمة المرور من الكروت المطبوعة لكونها مطابقة تماماً لاسم المستخدم</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={design.hidePasswordIfEqual === true}
                      onChange={e => {
                        const isChecked = e.target.checked;
                        setDesign(prev => ({
                          ...prev,
                          hidePasswordIfEqual: isChecked
                        }));
                      }}
                      className="w-4 h-4 rounded text-indigo-600 bg-slate-950 border-slate-700 cursor-pointer"
                    />
                    <span className={`text-xs font-bold ${design.hidePasswordIfEqual ? "text-indigo-400" : "text-slate-400"}`}>
                      إخفاء كلمة المرور من الطباعة
                    </span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                {/* Code Length */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">طول اسم المستخدم (الخانات)</label>
                  <input
                    type="number"
                    min="4"
                    max="16"
                    value={design.codeLength}
                    onChange={e => {
                      const val = Math.max(4, parseInt(e.target.value, 10) || 6);
                      setDesign(prev => ({
                        ...prev,
                        codeLength: val,
                        passwordLength: (prev.authMode === "user_equals_pass" || prev.sameUserPass) ? val : prev.passwordLength
                      }));
                    }}
                    className="w-full bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Password Length */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-300">طول كلمة المرور</label>
                    {(design.authMode === "user_equals_pass" || design.sameUserPass) && (
                      <span className="text-[10px] text-emerald-400 font-bold">مطابق للكود</span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="4"
                    max="16"
                    disabled={design.authMode === "user_only" || design.authMode === "user_equals_pass" || design.sameUserPass === true}
                    value={(design.authMode === "user_equals_pass" || design.sameUserPass) ? design.codeLength : (design.passwordLength || design.codeLength)}
                    onChange={e => setDesign(prev => ({ ...prev, passwordLength: Math.max(4, parseInt(e.target.value, 10) || 6) }))}
                    className="w-full bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-indigo-500 disabled:opacity-40"
                  />
                </div>

                {/* Price & Currency */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">السعر والعملة</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={design.price !== undefined ? design.price : 500}
                      onChange={e => setDesign(prev => ({ ...prev, price: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                      className="w-1/2 bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs font-mono font-bold text-amber-300 outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={design.currencySymbol || "ريال"}
                      onChange={e => setDesign(prev => ({ ...prev, currencySymbol: e.target.value, currency: "CUSTOM" }))}
                      className="w-1/2 bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-slate-300 outline-none focus:border-indigo-500"
                      placeholder="رمز العملة"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Comment & Validity */}
            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-400">وقت الصلاحية (تلقائي من الباقة):</label>
                  <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl text-xs font-black text-emerald-400 flex items-center justify-center gap-1.5 h-[38px]">
                    <span>⏱️</span>
                    <span>{design.timeLimit || "مستخرج تلقائياً"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-300">حجم البيانات المطبوع:</label>
                  <input
                    type="text"
                    value={design.dataLimit || ""}
                    onChange={e => setDesign(prev => ({ ...prev, dataLimit: e.target.value }))}
                    placeholder="مثال: 5 GB ، 10 GB ، 500 MB ، مفتوح"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500"
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    {["500 MB", "1 GB", "2 GB", "5 GB", "10 GB", "50 GB", "مفتوح"].map((dPreset) => (
                      <button
                        key={dPreset}
                        type="button"
                        onClick={() => setDesign(prev => ({ ...prev, dataLimit: dPreset }))}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                          design.dataLimit === dPreset
                            ? "bg-emerald-600 text-white border-emerald-400"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                        }`}
                      >
                        {dPreset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-slate-300">تعليق أو اسم الدفعة (Batch Comment / Name):</label>
                  <input
                    type="text"
                    value={design.batchComment || ""}
                    onChange={e => setDesign(prev => ({ ...prev, batchComment: e.target.value }))}
                    placeholder="مثال: دفعة رمضان 2026 - فئة 500"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500 block pt-1">يُحفظ كرمز/اسم للدفعة لسهولة البحث والفلترة والحذف الجماعي</span>
                </div>
              </div>

              {/* Guidance & Instruction Text Inputs for Printed Voucher */}
              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-amber-300 flex items-center gap-1">
                    <span>💬</span>
                    <span>نص التوجيه والإرشادات 1 (مطبوع على الكرت):</span>
                  </label>
                  <input
                    type="text"
                    value={design.customText1Content || ""}
                    onChange={e => setDesign(prev => ({ ...prev, customText1Content: e.target.value }))}
                    placeholder="مثال: للدعم الفني اتصل برقم: 777123456"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 block">نص إرشادي أو رقم الدعم الفني يظهر بأسفل الكرت</span>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-amber-300 flex items-center gap-1">
                    <span>💡</span>
                    <span>نص التوجيه والإرشادات 2 (تعليمات الدخول):</span>
                  </label>
                  <input
                    type="text"
                    value={design.customText2Content || ""}
                    onChange={e => setDesign(prev => ({ ...prev, customText2Content: e.target.value }))}
                    placeholder="مثال: طريقة الدخول: افتح المتصفح واكتب الكود"
                    className="w-full bg-slate-900 border border-slate-800 p-2 rounded-xl text-xs font-bold text-white outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400 block">نص إرشادي ثانٍ لطريقة تسجيل الدخول بالشبكة</span>
                </div>
              </div>
            </div>

            {/* Informational note redirecting to Live Voucher Preview Generate Button */}
            <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>لتوليد الكروت وتطبيق التصميم، يرجى استخدام زر <strong>"توليد الكروت وتجهيز المعاينة والطباعة"</strong> أسفل شاشة المعاينة. يتم توليد الكروت محلياً أولاً؛ وتتم عملية الحقن بالمايكروتك من النافذة المنبثقة.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Theme Gallery removed from DesignTab as requested (it remains only in the dedicated Gallery tab) */}

      {/* ACCORDION 3: PAPER & THERMAL ROLL CONTROLS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("paper")}
          className="w-full p-4 sm:p-5 flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/80 transition-colors cursor-pointer text-right border-b border-slate-800/60"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              <Printer className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-white">تنسيق الورق والطابعات الحرارية وفواصل القص</h3>
              <p className="text-[11px] text-slate-400">قياسات A4 (حتى 100 كرت بالصفحة)، طابعات الإيصالات 80mm/58mm</p>
            </div>
          </div>
          <span className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
            {openSections.paper ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {openSections.paper && (
          <div className="p-5 space-y-4 bg-slate-950/40 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setDesign(prev => ({ ...prev, paperType: "a4", columnsCount: 2 }))}
                className={`p-3.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  design.paperType === "a4" && design.columnsCount !== 10
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500 shadow-md"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span className="text-base">📄</span>
                <span>A4 قياسي (10-20 كرت)</span>
                <span className="text-[10px] text-slate-500 font-normal">كروت حجم كلاسيكي</span>
              </button>

              <button
                type="button"
                onClick={() => setDesign(prev => ({ ...prev, paperType: "a3", columnsCount: 4 }))}
                className={`p-3.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  design.paperType === "a3"
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500 shadow-md"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span className="text-base">📄</span>
                <span>A3 كبير</span>
                <span className="text-[10px] text-slate-500 font-normal">ضعف حجم A4</span>
              </button>

              <button
                type="button"
                onClick={() => setDesign(prev => ({ ...prev, paperType: "a5", columnsCount: 1 }))}
                className={`p-3.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  design.paperType === "a5"
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500 shadow-md"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span className="text-base">📄</span>
                <span>A5 صغير</span>
                <span className="text-[10px] text-slate-500 font-normal">نصف حجم A4</span>
              </button>

              <button
                type="button"
                onClick={() => setDesign(prev => ({ ...prev, paperType: "a4_100", columnsCount: 10, cardGap: 1, cardMarginTop: 3, cardMarginSide: 3 }))}
                className={`p-3.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1.5 relative overflow-hidden cursor-pointer ${
                  design.paperType === "a4_100" || design.columnsCount === 10
                    ? "bg-emerald-600/20 text-emerald-300 border-emerald-500 shadow-md"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span className="text-base">✂️</span>
                <span className="text-emerald-400 font-black">A4 مصغر (100 كرت/ورقة)</span>
                <span className="text-[10px] text-emerald-300/80 font-normal">100 كرت بالضبط + فواصل قص</span>
              </button>

              <button
                type="button"
                onClick={() => setDesign(prev => ({ ...prev, paperType: "thermal_80mm", columnsCount: 1 }))}
                className={`p-3.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  design.paperType === "thermal_80mm"
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span className="text-base">🧾</span>
                <span>طابعة حرارية POS (80mm)</span>
                <span className="text-[10px] text-slate-500 font-normal">رول الإيصالات 80 مم</span>
              </button>

              <button
                type="button"
                onClick={() => setDesign(prev => ({ ...prev, paperType: "thermal_58mm", columnsCount: 1 }))}
                className={`p-3.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  design.paperType === "thermal_58mm"
                    ? "bg-indigo-600/20 text-indigo-300 border-indigo-500"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span className="text-base">📟</span>
                <span>طابعة حرارية (58mm)</span>
                <span className="text-[10px] text-slate-500 font-normal">رول الماكينات 58 مم</span>
              </button>
            </div>

            {/* Paper Orientation Toggle Controls */}
            {!design.paperType.startsWith("thermal") && (
              <div className="bg-slate-950/90 p-4 rounded-xl border border-slate-800 space-y-3 mt-3">
                <label className="block text-xs font-bold text-slate-300">وضعية واتجاه ورقة الطباعة (Page Orientation):</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDesign(prev => ({ ...prev, paperOrientation: "portrait" }))}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      design.paperOrientation !== "landscape"
                        ? "bg-indigo-600/20 text-indigo-300 border-indigo-500 shadow-md shadow-indigo-500/20"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <span>↕️ وضع طولي (Portrait)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDesign(prev => ({ ...prev, paperOrientation: "landscape" }))}
                    className={`p-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      design.paperOrientation === "landscape"
                        ? "bg-indigo-600/20 text-indigo-300 border-indigo-500 shadow-md shadow-indigo-500/20"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <span>↔️ وضع عرضي (Landscape)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Grid Rows & Columns Control Panel */}
            <div className="bg-slate-950/90 p-4 rounded-xl border border-indigo-500/40 space-y-3.5 mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-black text-white">التحكم في عدد الصفوف والأعمدة في الورقة:</span>
                </div>

                {/* Mode Selector: Auto vs Custom */}
                <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800 gap-1">
                  <button
                    type="button"
                    onClick={() => setDesign(prev => ({ ...prev, gridMode: "auto" }))}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      design.gridMode !== "custom"
                        ? "bg-indigo-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    حساب تلقائي ذكي
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const c = design.customCols || design.columnsCount || 3;
                      const r = design.customRows || design.rowsCount || 7;
                      setDesign(prev => ({
                        ...prev,
                        gridMode: "custom",
                        customCols: c,
                        customRows: r,
                        columnsCount: c,
                        rowsCount: r
                      }));
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      design.gridMode === "custom"
                        ? "bg-amber-500 text-slate-950 font-black shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    ⚙️ تخصيص يدوي حر
                  </button>
                </div>
              </div>

              {/* Rows & Columns Number Steppers & Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Columns Control */}
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">عدد الأعمدة (Columns):</label>
                    <span className="text-xs font-mono font-black text-amber-300">
                      {design.gridMode === "custom" ? (design.customCols || design.columnsCount || 3) : (design.columnsCount || 3)} عمود
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const current = design.gridMode === "custom" ? (design.customCols || design.columnsCount || 3) : (design.columnsCount || 3);
                        const next = Math.max(1, current - 1);
                        setDesign(prev => ({
                          ...prev,
                          gridMode: "custom",
                          customCols: next,
                          columnsCount: next
                        }));
                      }}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer transition-colors"
                      title="إنقاص عمود"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={design.gridMode === "custom" ? (design.customCols || design.columnsCount || 3) : (design.columnsCount || 3)}
                      onChange={e => {
                        const val = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1));
                        setDesign(prev => ({
                          ...prev,
                          gridMode: "custom",
                          customCols: val,
                          columnsCount: val
                        }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-center font-mono font-black text-sm text-amber-300 outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = design.gridMode === "custom" ? (design.customCols || design.columnsCount || 3) : (design.columnsCount || 3);
                        const next = Math.min(20, current + 1);
                        setDesign(prev => ({
                          ...prev,
                          gridMode: "custom",
                          customCols: next,
                          columnsCount: next
                        }));
                      }}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer transition-colors"
                      title="زيادة عمود"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Rows Control */}
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300">عدد الصفوف (Rows):</label>
                    <span className="text-xs font-mono font-black text-amber-300">
                      {design.gridMode === "custom" ? (design.customRows || design.rowsCount || 7) : (design.rowsCount || 7)} صف
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const current = design.gridMode === "custom" ? (design.customRows || design.rowsCount || 7) : (design.rowsCount || 7);
                        const next = Math.max(1, current - 1);
                        setDesign(prev => ({
                          ...prev,
                          gridMode: "custom",
                          customRows: next,
                          rowsCount: next
                        }));
                      }}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer transition-colors"
                      title="إنقاص صف"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={design.gridMode === "custom" ? (design.customRows || design.rowsCount || 7) : (design.rowsCount || 7)}
                      onChange={e => {
                        const val = Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 1));
                        setDesign(prev => ({
                          ...prev,
                          gridMode: "custom",
                          customRows: val,
                          rowsCount: val
                        }));
                      }}
                      className="w-full bg-slate-950 border border-slate-700 p-2 rounded-lg text-center font-mono font-black text-sm text-amber-300 outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = design.gridMode === "custom" ? (design.customRows || design.rowsCount || 7) : (design.rowsCount || 7);
                        const next = Math.min(30, current + 1);
                        setDesign(prev => ({
                          ...prev,
                          gridMode: "custom",
                          customRows: next,
                          rowsCount: next
                        }));
                      }}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer transition-colors"
                      title="زيادة صف"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Layout Presets Grid Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-slate-400 ml-1">أنماط شبكة سريعة:</span>
                {[
                  { name: "2 × 5 (10 كروت)", c: 2, r: 5 },
                  { name: "3 × 7 (21 كرت)", c: 3, r: 7 },
                  { name: "4 × 10 (40 كرت)", c: 4, r: 10 },
                  { name: "5 × 10 (50 كرت)", c: 5, r: 10 },
                  { name: "6 × 12 (72 كرت)", c: 6, r: 12 },
                  { name: "10 × 10 (100 كرت)", c: 10, r: 10 },
                ].map(preset => {
                  const isActive = (design.columnsCount === preset.c || design.customCols === preset.c) &&
                                   (design.rowsCount === preset.r || design.customRows === preset.r);
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        setDesign(prev => ({
                          ...prev,
                          gridMode: "custom",
                          customCols: preset.c,
                          customRows: preset.r,
                          columnsCount: preset.c,
                          rowsCount: preset.r,
                        }));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                        isActive
                          ? "bg-indigo-600 text-white border-indigo-400 shadow-sm"
                          : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700"
                      }`}
                    >
                      {preset.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">الهامش العلوي (mm):</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={design.cardMarginTop ?? 5}
                  onChange={e => setDesign(prev => ({ ...prev, cardMarginTop: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">الهامش السفلي (mm):</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={design.cardMarginBottom ?? 5}
                  onChange={e => setDesign(prev => ({ ...prev, cardMarginBottom: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">الهامش الجانبي (mm):</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={design.cardMarginSide ?? 4}
                  onChange={e => setDesign(prev => ({ ...prev, cardMarginSide: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">الفجوة بين الكروت (mm):</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={design.cardGap ?? 4}
                  onChange={e => setDesign(prev => ({ ...prev, cardGap: parseInt(e.target.value, 10) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white"
                />
              </div>
            </div>

            {/* Custom Card Dimensions (Width & Height / Length) */}
            <div className="bg-slate-950/80 p-4 rounded-xl border border-indigo-500/30 space-y-3 mt-3">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">عرض الكرت (Width):</label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min="20"
                      max="200"
                      value={design.cardWidthMm || 85}
                      onChange={e => setDesign(prev => ({ ...prev, cardWidthMm: Math.max(20, parseInt(e.target.value) || 85) }))}
                      className="w-full bg-slate-900 border border-slate-700 p-2 rounded-r-lg text-sm font-bold text-white focus:border-indigo-500"
                    />
                    <span className="bg-slate-800 text-slate-400 p-2 text-sm rounded-l-lg border border-l-0 border-slate-700">mm</span>
                  </div>
                </div>

                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">طول الكرت (Height):</label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min="20"
                      max="200"
                      value={design.cardHeightMm || 52}
                      onChange={e => setDesign(prev => ({ ...prev, cardHeightMm: Math.max(20, parseInt(e.target.value) || 52) }))}
                      className="w-full bg-slate-900 border border-slate-700 p-2 rounded-r-lg text-sm font-bold text-white focus:border-indigo-500"
                    />
                    <span className="bg-slate-800 text-slate-400 p-2 text-sm rounded-l-lg border border-l-0 border-slate-700">mm</span>
                  </div>
                </div>

                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">دوران الكرت (Radius):</label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min="0"
                      max="40"
                      value={design.cardRadiusMm ?? 6}
                      onChange={e => setDesign(prev => ({ ...prev, cardRadiusMm: Math.max(0, parseInt(e.target.value) || 0) }))}
                      className="w-full bg-slate-900 border border-slate-700 p-2 rounded-r-lg text-sm font-bold text-white focus:border-indigo-500"
                    />
                    <span className="bg-slate-800 text-slate-400 p-2 text-sm rounded-l-lg border border-l-0 border-slate-700">mm</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Real Grid Auto-Calculation Live Badge */}
            {gridInfo && (
              <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 p-4 rounded-xl border border-emerald-500/40 space-y-3 mt-3">
                <div className="flex items-center justify-between border-b border-emerald-800/60 pb-2">
                  <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                    <span>الحساب التلقائي والتوزيع الذكي على الورقة:</span>
                  </span>
                  <span className="text-[10px] font-bold bg-emerald-900 text-emerald-200 px-2 py-0.5 rounded border border-emerald-700">
                    مطابقة تامة 100%
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-900/50">
                    <span className="block text-[10px] text-slate-400 font-bold">الأعمدة والصفوف</span>
                    <span className="text-base font-black text-white font-mono">{gridInfo.cols} × {gridInfo.rows}</span>
                    <span className="block text-[9px] text-emerald-400">عمود × صف</span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-900/50">
                    <span className="block text-[10px] text-slate-400 font-bold">كروت بالصفحة</span>
                    <span className="text-base font-black text-emerald-300 font-mono">{gridInfo.totalPerPage}</span>
                    <span className="block text-[9px] text-slate-400">كرت في كل ورقة</span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-900/50">
                    <span className="block text-[10px] text-slate-400 font-bold">مقاس الكرت الفعلي</span>
                    <span className="text-sm font-black text-amber-300 font-mono">{gridInfo.actualCardWidthMm}×{gridInfo.actualCardHeightMm}</span>
                    <span className="block text-[9px] text-slate-400">ملليمتر (mm)</span>
                  </div>

                  <div className="bg-slate-950/80 p-2.5 rounded-xl border border-emerald-900/50">
                    <span className="block text-[10px] text-slate-400 font-bold">نسبة تصغير الخط</span>
                    <span className="text-base font-black text-cyan-300 font-mono">{Math.round((fontScale ?? gridInfo.fontScale) * 100)}%</span>
                    <span className="block text-[9px] text-slate-400">مقياس موحد</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300 pt-1">
                  <span>إجمالي الكروت المطلوبة: <strong className="text-white font-mono">{gridInfo.totalCards}</strong> كرت</span>
                  <span>عدد الصفحات للطباعة: <strong className="text-emerald-300 font-mono">{gridInfo.totalPages}</strong> {gridInfo.totalPages === 1 ? "صفحة واحدة" : "صفحات"}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACCORDION 4: NETWORK & LOGIN SETTINGS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("network")}
          className="w-full p-4 sm:p-5 flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/80 transition-colors cursor-pointer text-right border-b border-slate-800/60"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              <Network className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-white">بيانات الشبكة ونمط تسجيل الدخول</h3>
              <p className="text-[11px] text-slate-400">عنوان الشبكة المطبوع ورابط صفحة الهوتسبوت ونوع المصادقة</p>
            </div>
          </div>
          <span className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
            {openSections.network ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {openSections.network && (
          <div className="p-5 space-y-4 bg-slate-950/40 animate-in fade-in duration-150">
            {/* Auto Fetch Banner from Network Tab */}
            <div className="p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 rounded-xl border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
              <div className="text-right space-y-0.5">
                <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>المزامنة المباشرة مع تبويبة الشبكة (Network Tab)</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  جلب اسم شبكة البث اللاسلكي (SSID) ورابط تسجيل الدخول (Hotspot DNS) تلقائياً من إعدادات الشبكة بالراوتر
                </p>
              </div>

              {onFetchNetworkTabInfo && (
                <button
                  type="button"
                  onClick={onFetchNetworkTabInfo}
                  className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg hover:shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/40 shrink-0 active:scale-95"
                >
                  <RefreshCw className="w-4 h-4 text-amber-300" />
                  <span>⚡ جلب اسم الشبكة ورابط الدخول من تبويبة الشبكة</span>
                </button>
              )}
            </div>

            {/* Network Name Visibility & Custom Name Control */}
            <div className="bg-slate-950/80 p-4 rounded-xl border border-indigo-500/30 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-black text-white">التحكم في طباعة اسم الشبكة وإخفائه وتغييره:</span>
                </div>

                {/* Show/Hide Network Name Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const nextShow = design.showNetworkName === false ? true : false;
                    setDesign(prev => ({
                      ...prev,
                      showNetworkName: nextShow,
                      elements: {
                        ...prev.elements,
                        network: {
                          ...prev.elements.network,
                          show: nextShow
                        }
                      }
                    }));
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    design.showNetworkName !== false
                      ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-300"
                      : "bg-rose-950/60 border-rose-500/50 text-rose-300"
                  }`}
                >
                  {design.showNetworkName !== false ? (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>اسم الشبكة: ظاهر في الطباعة</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                      <span>اسم الشبكة: مخفي من الطباعة</span>
                    </>
                  )}
                </button>
              </div>

              {/* Source Selector: Real vs Custom Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDesign(prev => ({
                      ...prev,
                      showNetworkName: true,
                      networkNameSource: "real",
                      networkName: prev.networkName || "شبكة زاهر للإنترنت",
                      elements: {
                        ...prev.elements,
                        network: { ...prev.elements.network, show: true }
                      }
                    }));
                  }}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    design.showNetworkName !== false && design.networkNameSource !== "custom"
                      ? "bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-sm"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    <span>اسم الشبكة الحقيقي (الافتراضي)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">طباعة اسم الشبكة المعتمد أو المجلوب من المايكروتك</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDesign(prev => ({
                      ...prev,
                      showNetworkName: true,
                      networkNameSource: "custom",
                      networkName: prev.customNetworkName || prev.networkName || "شبكة المنار للإنترنت",
                      elements: {
                        ...prev.elements,
                        network: { ...prev.elements.network, show: true }
                      }
                    }));
                  }}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-start gap-1 cursor-pointer ${
                    design.showNetworkName !== false && design.networkNameSource === "custom"
                      ? "bg-amber-500/20 border-amber-500 text-amber-200 shadow-sm"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>طباعة اسم شبكة مختلف ومخصص (Custom)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">إخفاء الاسم الحقيقي وكتابة اسم دعائي أو تجاري آخر</span>
                </button>
              </div>

              {/* Network Name Input Field */}
              <div className="pt-2">
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    {design.networkNameSource === "custom" ? "الاسم المخصص المراد طباعته على الكرت:" : "اسم الشبكة المطبوع على الكرت:"}
                  </label>
                  {onFetchNetworkTabInfo && (
                    <button
                      type="button"
                      onClick={onFetchNetworkTabInfo}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                      title="جلب من تبويبة الشبكة"
                    >
                      <RefreshCw className="w-3 h-3 text-emerald-400" />
                      <span>مزامنة الاسم من الراوتر</span>
                    </button>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={design.networkName}
                    disabled={design.showNetworkName === false}
                    onChange={e => {
                      const val = e.target.value;
                      setDesign(prev => ({
                        ...prev,
                        networkName: val,
                        customNetworkName: val
                      }));
                    }}
                    className={`w-full p-2.5 rounded-xl text-xs font-bold border outline-none transition-all ${
                      design.showNetworkName === false
                        ? "bg-slate-950/50 border-slate-800 text-slate-600 cursor-not-allowed"
                        : "bg-slate-950 border-slate-800 text-white focus:border-indigo-500"
                    }`}
                    placeholder={design.showNetworkName === false ? "اسم الشبكة مخفي من الطباعة" : "اكتب اسم الشبكة المراد طباعتها على الكروت..."}
                  />
                  {design.showNetworkName === false && (
                    <span className="absolute left-3 top-2.5 text-[10px] bg-rose-950/80 text-rose-400 px-2 py-0.5 rounded border border-rose-800 font-bold">
                      مخفي من الكروت
                    </span>
                  )}
                </div>

                {/* Real-time status text */}
                <div className="flex items-center gap-2 mt-2 text-[11px]">
                  <span className="text-slate-400 font-bold">حالة الطباعة الحالية:</span>
                  {design.showNetworkName === false ? (
                    <span className="text-rose-400 font-bold">🚫 لن يتم طباعة أي اسم شبكة على الكروت (مخفي)</span>
                  ) : (
                    <span className="text-emerald-400 font-bold">
                      ✅ سيتم طباعة: <span className="underline font-black text-amber-300 font-sans">{design.networkName || "بدون اسم"}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-400">رابط صفحة تسجيل الدخول (Login URL)</label>
                  {onFetchNetworkTabInfo && (
                    <button
                      type="button"
                      onClick={onFetchNetworkTabInfo}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                      title="جلب من تبويبة الشبكة"
                    >
                      <RefreshCw className="w-3 h-3 text-emerald-400" />
                      <span>مزامنة من الشبكة</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={design.loginUrl}
                  onChange={e => setDesign(prev => ({ ...prev, loginUrl: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-mono font-bold text-white outline-none focus:border-indigo-500 text-left"
                  placeholder="10.0.0.1 أو hotspot.lan"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">نوع الخدمة بالنظام:</label>
                <select
                  value={design.systemType || "hotspot"}
                  onChange={e => setDesign(prev => ({ ...prev, systemType: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white cursor-pointer"
                >
                  <option value="hotspot">🔥 سيرفر الهوتسبوت (Hotspot Users)</option>
                  <option value="ppp">🌐 اشتراكات البرودباند (PPPoE / PPP Secrets)</option>
                  <option value="userman">👥 يوزر مانجر (User Manager)</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-400">نمط تسجيل الدخول وقبول الكروت في المايكروتك</label>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                  متوافق مع RouterOS Hotspot
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setDesign(prev => ({ ...prev, authMode: "user_equals_pass", sameUserPass: true }))}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center text-center gap-1 cursor-pointer ${
                    design.authMode === "user_equals_pass" || (design.sameUserPass && design.authMode !== "user_only")
                      ? "bg-gradient-to-r from-emerald-600/30 to-indigo-600/30 text-white border-emerald-400 shadow-md shadow-emerald-500/20 font-black ring-1 ring-emerald-500"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-amber-300">
                    <span>✨</span>
                    <span>اسم المستخدم = كلمة المرور</span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-normal">متطابق 100% مع صفحات الدخول وQR</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDesign(prev => ({ ...prev, authMode: "user_only", sameUserPass: false }))}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center text-center gap-1 cursor-pointer ${
                    design.authMode === "user_only"
                      ? "bg-indigo-600/20 text-indigo-300 border-indigo-500 font-black shadow-md"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-white">
                    <Smartphone className="w-4 h-4 text-indigo-400" />
                    <span>كود واحد فقط (بدون رمز)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">بدون كلمة مرور على المايكروتك</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDesign(prev => ({ ...prev, authMode: "user_pass", sameUserPass: false }))}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center text-center gap-1 cursor-pointer ${
                    design.authMode === "user_pass" && !design.sameUserPass
                      ? "bg-indigo-600/20 text-indigo-300 border-indigo-500 font-black shadow-md"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-white">
                    <Key className="w-4 h-4 text-indigo-400" />
                    <span>اسم مستخدم وكلمة سر منفصلين</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">باسورد عشوائي مستقل</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 5: CURRENCY & PRICING */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("currency")}
          className="w-full p-4 sm:p-5 flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/80 transition-colors cursor-pointer text-right border-b border-slate-800/60"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              💰
            </span>
            <div>
              <h3 className="text-sm font-black text-white">تحديد عملة الكروت والطباعة (Currency)</h3>
              <p className="text-[11px] text-slate-400">الريال اليمني، الريال السعودي، الدولار، وكافة العملات العربية والخاصة</p>
            </div>
          </div>
          <span className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
            {openSections.currency ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {openSections.currency && (
          <div className="p-5 space-y-4 bg-slate-950/40 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">اختر العملة:</label>
                <select
                  value={design.currency || "YER"}
                  onChange={e => {
                    const val = e.target.value;
                    let sym = "ريال";
                    if (val === "YER") sym = "ريال";
                    else if (val === "YER_OLD") sym = "ر.ي";
                    else if (val === "SAR") sym = "ر.س";
                    else if (val === "USD") sym = "$";
                    else if (val === "EGP") sym = "ج.م";
                    else if (val === "JOD") sym = "د.أ";
                    else if (val === "AED") sym = "د.إ";
                    else if (val === "QAR") sym = "ر.ق";
                    else if (val === "KWD") sym = "د.ك";
                    else if (val === "IQD") sym = "د.ع";
                    else if (val === "OMR") sym = "ر.ع";
                    else if (val === "BHD") sym = "د.ب";
                    else if (val === "LYD") sym = "د.ل";
                    else if (val === "SYP") sym = "ل.س";
                    else if (val === "LBP") sym = "ل.ل";
                    else if (val === "SDG") sym = "ج.س";
                    else if (val === "TRY") sym = "₺";
                    else if (val === "EUR") sym = "€";
                    else if (val === "GBP") sym = "£";

                    setDesign(prev => ({
                      ...prev,
                      currency: val,
                      currencySymbol: val === "CUSTOM" ? prev.currencySymbol || "ريال" : sym
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-bold text-white cursor-pointer"
                >
                  <option value="YER">🇾🇪 ريال يمني (ريال)</option>
                  <option value="YER_OLD">🇾🇪 ريال يمني - قديم (ر.ي)</option>
                  <option value="SAR">🇸🇦 ريال سعودي (ر.س)</option>
                  <option value="USD">🇺🇸 دولار أمريكي ($)</option>
                  <option value="EGP">🇪🇬 جنيه مصري (ج.م)</option>
                  <option value="JOD">🇯🇴 دينار أردني (د.أ)</option>
                  <option value="AED">🇦🇪 درهم إماراتي (د.إ)</option>
                  <option value="QAR">🇶🇦 ريال قطري (ر.ق)</option>
                  <option value="KWD">🇰🇼 دينار كويتي (د.ك)</option>
                  <option value="IQD">🇮🇶 دينار عراقي (د.ع)</option>
                  <option value="OMR">🇴🇲 ريال عماني (ر.ع)</option>
                  <option value="BHD">🇧🇭 دينار بحريني (د.ب)</option>
                  <option value="LYD">🇱🇾 دينار ليبي (د.ل)</option>
                  <option value="SYP">🇸🇾 ليرة سورية (ل.س)</option>
                  <option value="LBP">🇱🇧 ليرة لبنانية (ل.ل)</option>
                  <option value="SDG">🇸🇩 جنيه سوداني (ج.س)</option>
                  <option value="TRY">🇹🇷 ليرة تركية (₺)</option>
                  <option value="EUR">🇪🇺 يورو (€)</option>
                  <option value="GBP">🇬🇧 جنيه إسترليني (£)</option>
                  <option value="CUSTOM">✍️ تحديد عملة مخصصة يدوياً...</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1.5">رمز العملة المطبوع على الكرت:</label>
                <input
                  type="text"
                  value={design.currencySymbol || "ريال"}
                  onChange={e => setDesign(prev => ({ ...prev, currencySymbol: e.target.value, currency: "CUSTOM" }))}
                  className="w-full bg-slate-950 border border-slate-800 p-2.5 rounded-xl text-xs font-mono font-bold text-amber-300 outline-none focus:border-indigo-500"
                  placeholder="مثال: ريال، $، ر.س"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ACCORDION 6: ELEMENT STYLING OPTIONS */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection("elements")}
          className="w-full p-4 sm:p-5 flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/80 transition-colors cursor-pointer text-right border-b border-slate-800/60"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400 border border-indigo-500/20">
              <Type className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-white">تخصيص الخطوط، الألوان، حجوم وتدوير نصوص الكرت</h3>
              <p className="text-[11px] text-slate-400">التحكم الفردي بألوان الأحجام والدوران وإظهار/إخفاء العناصر عند الطباعة</p>
            </div>
          </div>
          <span className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
            {openSections.elements ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </button>

        {openSections.elements && (
          <div className="p-5 space-y-5 divide-y divide-slate-800 bg-slate-950/40 animate-in fade-in duration-150">
            {/* Card Background & Primary Color Settings */}
            <div className="p-3.5 bg-slate-900/90 rounded-xl border border-indigo-500/30 space-y-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Palette className="w-4 h-4 text-indigo-400" />
                  <span>خلفية الكرت وألوان القالب العامة</span>
                </span>
                {design.bgImage && (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    صورة خلفية مخصصة مفعلة
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Card BG Color */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">لون خلفية الكرت (Background)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={design.bgColor || "#0f172a"}
                      onChange={e => setDesign(prev => ({ ...prev, bgColor: e.target.value }))}
                      className="w-8 h-8 rounded border border-slate-700 cursor-pointer p-0 shrink-0"
                    />
                    <input
                      type="text"
                      value={design.bgColor || "#0f172a"}
                      onChange={e => setDesign(prev => ({ ...prev, bgColor: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 px-2 py-1.5 rounded-lg font-mono text-white text-xs"
                    />
                  </div>
                </div>

                {/* Primary Accent Color */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">اللون الرئيسي / الإطار (Primary)</label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={design.primaryColor || "#6366f1"}
                      onChange={e => setDesign(prev => ({ ...prev, primaryColor: e.target.value }))}
                      className="w-8 h-8 rounded border border-slate-700 cursor-pointer p-0 shrink-0"
                    />
                    <input
                      type="text"
                      value={design.primaryColor || "#6366f1"}
                      onChange={e => setDesign(prev => ({ ...prev, primaryColor: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-800 px-2 py-1.5 rounded-lg font-mono text-white text-xs"
                    />
                  </div>
                </div>

                {/* Custom BG Image Upload */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">صورة خلفية الكرت (اختياري)</label>
                  <div className="flex gap-2">
                    <label className="w-full bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/60 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>{design.bgImage ? "تغيير الصورة" : "رفع صورة..."}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const res = ev.target?.result;
                              if (typeof res === "string") {
                                setDesign(prev => ({ ...prev, bgImage: res, showBgImage: true }));
                              }
                            };
                            reader.onerror = () => {
                              console.warn("Failed to read background image");
                            };
                            reader.readAsDataURL(file);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {design.bgImage && (
                      <button
                        type="button"
                        onClick={() => setDesign(prev => ({ ...prev, bgImage: undefined, showBgImage: false }))}
                        className="p-2 text-rose-400 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 rounded-lg cursor-pointer"
                        title="حذف خلفية الكرت"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {(["network", "user", "password", "price", "time", "profile", "dataLimit"] as const).map((elKey) => {
              if (elKey === "password" && design.authMode === "user_only") return null;

              const elConfig = design.elements?.[elKey] || {
                show: true,
                color: "#ffffff",
                fontSize: 14,
                fontFamily: "Cairo",
                fontWeight: "bold",
                rotation: 0,
                hasShadow: false
              };

              const titleMap = {
                network: "🌐 اسم الشبكة (Network Title)",
                user: "👤 اسم المستخدم / الكود (Username)",
                password: "🔑 كلمة المرور / PIN (Password)",
                price: "💰 السعر والعملة (Price & Currency)",
                time: "⏰ الزمن والصلاحية (Validity / Time)",
                profile: "🏷️ اسم البروفايل/الباقة (Profile Name)",
                dataLimit: "📊 حجم البيانات والـ Quota (Data Limit)"
              };

              return (
                <div key={elKey} className="pt-4 first:pt-0 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-white">{titleMap[elKey]}</span>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={elConfig.show ?? true}
                        onChange={e => handleElementConfigChange(elKey, "show", e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-950 border-slate-700"
                      />
                      <span className="text-xs text-slate-400">إظهار عند الطباعة</span>
                    </label>
                  </div>

                  {(elConfig.show ?? true) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800 items-end">
                      {/* Color */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">اللون</label>
                        <div className="flex gap-1 items-center">
                          <input
                            type="color"
                            value={elConfig.color || "#ffffff"}
                            onChange={e => handleElementConfigChange(elKey, "color", e.target.value)}
                            className="w-7 h-7 rounded border border-slate-700 cursor-pointer p-0 shrink-0"
                          />
                          <input
                            type="text"
                            value={elConfig.color || "#ffffff"}
                            onChange={e => handleElementConfigChange(elKey, "color", e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 px-1.5 py-1 rounded text-[10px] font-mono text-white text-center"
                          />
                        </div>
                      </div>

                      {/* Font size */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">الحجم (px)</label>
                        <input
                          type="number"
                          min="8"
                          max="72"
                          value={elConfig.fontSize || 14}
                          onChange={e => handleElementConfigChange(elKey, "fontSize", parseInt(e.target.value, 10) || 12)}
                          className="w-full bg-slate-900 border border-slate-800 px-2 py-1 rounded text-xs font-mono text-center font-bold text-white"
                        />
                      </div>

                      {/* Font Family */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">نوع الخط</label>
                        <select
                          value={elConfig.fontFamily || design.fontFamily || "Tajawal"}
                          onChange={e => handleElementConfigChange(elKey, "fontFamily", e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 px-1.5 py-1 rounded text-[11px] text-white cursor-pointer"
                        >
                          <option value="Tajawal">Tajawal (تجوال)</option>
                          <option value="Cairo">Cairo (كايرو)</option>
                          <option value="Almarai">Almarai (المراعي)</option>
                          <option value="Amiri">Amiri (أميري)</option>
                          <option value="JetBrains Mono">JetBrains Mono</option>
                          <option value="monospace">Monospace</option>
                        </select>
                      </div>

                      {/* Font Weight */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">وزن الخط</label>
                        <select
                          value={elConfig.fontWeight || "bold"}
                          onChange={e => handleElementConfigChange(elKey, "fontWeight", e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 px-1.5 py-1 rounded text-[11px] text-white cursor-pointer"
                        >
                          <option value="normal">عادي (Normal)</option>
                          <option value="bold">عريض (Bold)</option>
                          <option value="extrabold">عريض جداً (Black)</option>
                        </select>
                      </div>

                      {/* Rotation */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1">الدوران</label>
                        <select
                          value={elConfig.rotation || 0}
                          onChange={e => handleElementConfigChange(elKey, "rotation", parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 px-1.5 py-1 rounded text-[11px] text-white text-center cursor-pointer"
                        >
                          <option value="0">0° أفقي</option>
                          <option value="90">90° عمودي</option>
                          <option value="180">180° مقلوب</option>
                          <option value="270">270° جانبي</option>
                        </select>
                      </div>

                      {/* Has Shadow */}
                      <div className="flex items-center justify-center pb-1">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={elConfig.hasShadow || false}
                            onChange={e => handleElementConfigChange(elKey, "hasShadow", e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-indigo-600 bg-slate-900 border-slate-700"
                          />
                          <span className="text-xs font-bold text-slate-400">ظل النص</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
