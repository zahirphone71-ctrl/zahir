import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../../context/MikroTikContext';
import { RouterConnectionProfile, RouterProfileCategory } from '../../types/mikrotik';
import {
  Home,
  Building2,
  Store,
  Server,
  Globe,
  Zap,
  CheckCircle2,
  Trash2,
  Edit3,
  Plus,
  Star,
  Lock,
  Eye,
  EyeOff,
  Activity,
  Download,
  Upload,
  Copy,
  ShieldCheck,
  X,
  Radio,
  ArrowRight,
  Info,
  Check
} from 'lucide-react';

interface RouterConnectionProfilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileActivated?: (profile: RouterConnectionProfile) => void;
}

const CATEGORY_META: Record<RouterProfileCategory, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  home: {
    label: 'منزل',
    icon: Home,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30'
  },
  office: {
    label: 'مكتب',
    icon: Building2,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/30'
  },
  branch: {
    label: 'فرع',
    icon: Store,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30'
  },
  datacenter: {
    label: 'مركز بيانات',
    icon: Server,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/30'
  },
  custom: {
    label: 'مخصص',
    icon: Globe,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/30'
  }
};

export const RouterConnectionProfilesModal: React.FC<RouterConnectionProfilesModalProps> = ({
  isOpen,
  onClose,
  onProfileActivated
}) => {
  const {
    connectionProfiles,
    activeProfileId,
    saveConnectionProfile,
    deleteConnectionProfile,
    setDefaultConnectionProfile,
    activateConnectionProfile,
    isConnecting,
    isConnected,
    router: currentRouter,
    showToast
  } = useMikroTik();

  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<RouterProfileCategory>('home');
  const [formHost, setFormHost] = useState('192.168.88.1');
  const [formPort, setFormPort] = useState('8728');
  const [formUsername, setFormUsername] = useState('admin');
  const [formUseSsl, setFormUseSsl] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [formIsDefault, setFormIsDefault] = useState(false);

  // Ping Testing state
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latency?: number; message?: string }>>({});

  // Prompt password modal state for profiles without saved password
  const [passwordPromptProfile, setPasswordPromptProfile] = useState<RouterConnectionProfile | null>(null);
  const [promptPasswordInput, setPromptPasswordInput] = useState('');
  const isMountedRef = useRef(true);
  const testAbortRef = useRef<AbortController | null>(null);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      testAbortRef.current?.abort();
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isConnecting) {
        if (passwordPromptProfile) setPasswordPromptProfile(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isConnecting, passwordPromptProfile, onClose]);

  if (!isOpen) return null;

  const handleOpenAddForm = (presetCategory?: RouterProfileCategory) => {
    setEditingId(null);
    if (presetCategory === 'home') {
      setFormName('الراوتر المنزلي (منزل)');
      setFormCategory('home');
      setFormHost('192.168.88.1');
      setFormPort('8728');
      setFormNotes('راوتر المنزل والشبكة الشخصية');
    } else if (presetCategory === 'office') {
      setFormName('راوتر المكتب (مكتب)');
      setFormCategory('office');
      setFormHost('192.168.1.1');
      setFormPort('8728');
      setFormNotes('راوتر مكتب العمل والشركة');
    } else if (presetCategory === 'branch') {
      setFormName('راوتر الفرع (فرع)');
      setFormCategory('branch');
      setFormHost('10.0.0.1');
      setFormPort('8728');
      setFormNotes('راوتر الفرع الخارجي والمستودع');
    } else {
      setFormName('بروفايل راوتر جديد');
      setFormCategory('custom');
      setFormHost('192.168.88.1');
      setFormPort('8728');
      setFormNotes('');
    }
    setFormUsername('admin');
    setFormUseSsl(false);
    setFormIsDefault(false);
    setIsEditing(true);
  };

  const handleOpenEditForm = (profile: RouterConnectionProfile) => {
    setEditingId(profile.id);
    setFormName(profile.name);
    setFormCategory(profile.category || 'custom');
    setFormHost(profile.host);
    setFormPort(String(profile.port || 8728));
    setFormUsername(profile.username || 'admin');
    setFormUseSsl(Boolean(profile.useSsl));
    setFormNotes(profile.notes || '');
    setFormIsDefault(Boolean(profile.isDefault));
    setIsEditing(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formHost.trim()) {
      showToast('يرجى كتابة اسم البروفايل وعنوان IP', 'error');
      return;
    }

    const saved = saveConnectionProfile({
      id: editingId || undefined,
      name: formName.trim(),
      category: formCategory,
      host: formHost.trim(),
      port: Number(formPort) || (formUseSsl ? 8729 : 8728),
      username: formUsername.trim() || 'admin',
      useSsl: formUseSsl,
      notes: formNotes.trim(),
      isDefault: formIsDefault
    });

    setIsEditing(false);
    setEditingId(null);
    showToast(`تم حفظ بروفايل "${saved.name}" بنجاح`, 'success');
  };

  // 1-Click Activate & Connect with Zero-Trust transient password prompt
  const handleActivateOneClick = async (profile: RouterConnectionProfile) => {
    setPasswordPromptProfile(profile);
    setPromptPasswordInput('');
  };

  const handleExecutePromptPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordPromptProfile) return;

    const targetProfile = passwordPromptProfile;
    const res = await activateConnectionProfile(targetProfile.id, promptPasswordInput);
    if (!isMountedRef.current) return;
    if (res.success) {
      setPasswordPromptProfile(null);
      setPromptPasswordInput('');
      if (onProfileActivated) onProfileActivated(targetProfile);
      onClose();
    }
  };

  // Ping Test Reachability
  const handleTestProfile = async (profile: RouterConnectionProfile) => {
    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;

    setTestingId(profile.id);
    try {
      const portNum = profile.port || (profile.useSsl ? 8729 : 8728);
      const res = await fetch('/api/mikrotik/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: profile.host.trim(), port: portNum }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      const diag = data.diagnostic;
      const isOpenPort = Boolean(diag?.apiPortOpen || diag?.sslPortOpen);
      setTestResults(prev => ({
        ...prev,
        [profile.id]: {
          ok: isOpenPort,
          latency: diag?.latencyMs,
          message: isOpenPort
            ? `متاح وجاهز للاستجابة (${diag?.latencyMs ?? '<5'}ms)`
            : 'المنفذ مغلق أو تعذر الوصول'
        }
      }));
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      setTestResults(prev => ({
        ...prev,
        [profile.id]: {
          ok: false,
          message: 'فشل الفحص'
        }
      }));
    } finally {
      if (isMountedRef.current) setTestingId(null);
    }
  };

  // Export Profiles to JSON (explicitly strip any transient passwords)
  const handleExportProfiles = () => {
    try {
      const sanitized = connectionProfiles.map(({ password: _pw, ...rest }) => rest);
      const blob = new Blob([JSON.stringify(sanitized, null, 2)], { type: 'application/json;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = blobUrl;
      downloadAnchor.download = `zctrl-router-profiles-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current);
      exportTimerRef.current = setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      showToast('تم تصدير بروفايلات الاتصال كملف JSON', 'success');
    } catch {
      showToast('حدث خطأ أثناء التصدير', 'error');
    }
  };

  // Import Profiles from JSON
  const handleImportProfiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onerror = () => {
      if (isMountedRef.current) showToast('فشل قراءة ملف البروفايلات', 'error');
    };
    reader.onload = (event) => {
      if (!isMountedRef.current) return;
      try {
        const raw = event.target?.result;
        if (typeof raw !== 'string') {
          showToast('تنسيق الملف غير صالح', 'error');
          return;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let importedCount = 0;
          parsed.forEach((p: any) => {
            if (p && typeof p.name === 'string' && typeof p.host === 'string' && p.name.trim() && p.host.trim()) {
              const { password: _pw, ...safeProfile } = p;
              saveConnectionProfile(safeProfile);
              importedCount++;
            }
          });
          if (importedCount > 0) {
            showToast(`تم استيراد ${importedCount} بروفايل اتصال بنجاح`, 'success');
          } else {
            showToast('لم يتم العثور على بروفايلات صالحة داخل الملف', 'error');
          }
        } else {
          showToast('تنسيق الملف غير صالح', 'error');
        }
      } catch {
        showToast('فشل قراءة ملف البروفايلات', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl text-slate-100 overflow-hidden flex flex-col max-h-[92vh] my-auto mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shadow-md shadow-blue-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">بروفايلات اتصال الراوتر (ZCtrl Profiles)</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                  {connectionProfiles.length} بروفايلات
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                تبديل فوري بضغطة زر بين راوترات متعددة (منزل، مكتب، فرع) دون إعادة إدخال البيانات في كل مرة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6">

          {/* Quick Presets & Add Bar */}
          {!isEditing && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-400 ml-1">إضافة سريعة:</span>
                <button
                  type="button"
                  onClick={() => handleOpenAddForm('home')}
                  className="px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Home className="w-3.5 h-3.5 text-blue-400" />
                  <span>+ بروفايل منزل</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAddForm('office')}
                  className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>+ بروفايل مكتب</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAddForm('branch')}
                  className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Store className="w-3.5 h-3.5 text-amber-400" />
                  <span>+ بروفايل فرع</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAddForm()}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>بروفايل جديد</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportProfiles}
                  title="تصدير كملف JSON"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700/80 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <label
                  title="استيراد من JSON"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700/80 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <input type="file" accept=".json" onChange={handleImportProfiles} className="hidden" />
                </label>
              </div>
            </div>
          )}

          {/* Form: Add / Edit Profile */}
          {isEditing ? (
            <form onSubmit={handleSaveForm} className="bg-slate-950/80 border border-blue-500/40 rounded-2xl p-5 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-blue-400" />
                  <span>{editingId ? 'تعديل بروفايل الاتصال' : 'إنشاء بروفايل اتصال جديد'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

              {/* Category selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400">تصنيف البروفايل ومكانه:</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(Object.keys(CATEGORY_META) as RouterProfileCategory[]).map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const Icon = meta.icon;
                    const isSelected = formCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setFormCategory(cat)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? `${meta.bg} ${meta.color} font-bold ring-2 ring-blue-500/50`
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[11px]">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Profile Name & Host IP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">اسم البروفايل*</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="مثال: راوتر المنزل، مكتب الإدارة، فرع 2"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">عنوان الـ IP أو الدومين (Host)*</label>
                  <input
                    type="text"
                    required
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    placeholder="192.168.88.1 أو host.domain.com"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white font-mono text-left focus:outline-none"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Port & User */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">اسم المستخدم (User)*</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white font-mono text-left focus:outline-none"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">منفذ API (Port)</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(e.target.value)}
                    placeholder="8728"
                    className="w-full bg-slate-900 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white font-mono text-left focus:outline-none"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Zero-Trust Security Policy Notice (Rules 8 & 32) */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-200 block mb-0.5">سياسة الأمان الصارمة (Zero-Trust):</span>
                  <span className="text-[11px] text-slate-400 leading-relaxed block">
                    لحماية بيانات المايكروتك، لا يتم حفظ كلمة المرور على القرص نهائياً. سيُطلب إدخال كلمة المرور مؤقتاً عند تفعيل هذا البروفايل لتبقى في الذاكرة الحية فقط.
                  </span>
                </div>
              </div>

              {/* SSL & Default checkbox & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={formUseSsl}
                      onChange={(e) => setFormUseSsl(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <span>استخدام اتصال مشفر آمن (SSL / Port 8729)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={formIsDefault}
                      onChange={(e) => setFormIsDefault(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <span>تعيين هذا البروفايل كافتراضي للاتصال</span>
                  </label>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">ملاحظات توضيحية (اختياري)</label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="ملاحظات مثل: راوتر الفرع الثاني، الدور الأرضي..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Form buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingId ? 'تحديث البروفايل' : 'حفظ البروفايل الجديد'}</span>
                </button>
              </div>
            </form>
          ) : null}

          {/* Profiles Cards Grid */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 flex items-center justify-between">
              <span>البروفايلات المتوفرة للتبديل السريع:</span>
              <span className="text-[10px] text-slate-500">انقر على زر "تفعيل والاتصال" للتبديل بضغطة زر واحدة</span>
            </h4>

            {connectionProfiles.length === 0 ? (
              <div className="text-center py-10 bg-slate-950/40 border border-slate-800 rounded-2xl p-6 space-y-3">
                <Home className="w-10 h-10 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">لا توجد أي بروفايلات اتصال محفوظة حتى الآن.</p>
                <button
                  type="button"
                  onClick={() => handleOpenAddForm('home')}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  إضافة بروفايل المنزل الآن
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {connectionProfiles.map((p) => {
                  const meta = CATEGORY_META[p.category || 'custom'] || CATEGORY_META.custom;
                  const Icon = meta.icon;
                  const isCurrentActive = isConnected && currentRouter?.host === p.host;
                  const isProfileDefault = p.isDefault;
                  const testRes = testResults[p.id];

                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 relative overflow-hidden ${
                        isCurrentActive
                          ? 'bg-blue-950/40 border-blue-500/60 shadow-lg shadow-blue-900/20 ring-1 ring-blue-500/30'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Top Bar: Icon, Name, Category Badge & Options */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2.5 rounded-xl border ${meta.bg} ${meta.color}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-bold text-sm text-white">{p.name}</h3>
                              {isCurrentActive && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                  متصل حالياً
                                </span>
                              )}
                              {isProfileDefault && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                  افتراضي
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5" dir="ltr">
                              <span>{p.host}:{p.port || 8728}</span>
                              <span>•</span>
                              <span>{p.username}</span>
                              {p.useSsl && <span className="text-[10px] text-blue-400 font-bold">SSL</span>}
                            </span>
                          </div>
                        </div>

                        {/* Top quick actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditForm(p)}
                            className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="تعديل بيانات البروفايل"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteConnectionProfile(p.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                            title="حذف البروفايل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Notes / Password status */}
                      <div className="text-[11px] text-slate-400 space-y-1">
                        {p.notes && <p className="truncate text-slate-300 font-medium">📝 {p.notes}</p>}
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            {p.password ? (
                              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                كلمة المرور محفوظة (اتصال فوري بضغطة زر)
                              </span>
                            ) : (
                              <span className="text-amber-400 font-medium flex items-center gap-1">
                                <Lock className="w-3 h-3 text-amber-400" />
                                يتطلب إدخال كلمة المرور
                              </span>
                            )}
                          </span>
                          {p.lastConnectedAt && (
                            <span className="font-mono">
                              آخر اتصال: {new Date(p.lastConnectedAt).toLocaleDateString('ar-EG')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ping Diagnostic Output if tested */}
                      {testRes && (
                        <div className={`p-2 rounded-xl text-[10px] flex items-center justify-between ${
                          testRes.ok ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                        }`}>
                          <span className="font-bold">{testRes.message}</span>
                          {testRes.latency !== undefined && <span className="font-mono">{testRes.latency}ms</span>}
                        </div>
                      )}

                      {/* Bottom Action Bar */}
                      <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTestProfile(p)}
                            disabled={testingId === p.id}
                            className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                            title="فحص سرعة الاستجابة ومنفذ الاتصال"
                          >
                            <Activity className={`w-3 h-3 text-blue-400 ${testingId === p.id ? 'animate-spin' : ''}`} />
                            <span>فحص</span>
                          </button>
                          {!p.isDefault && (
                            <button
                              type="button"
                              onClick={() => setDefaultConnectionProfile(p.id)}
                              className="px-2 py-1.5 text-slate-400 hover:text-amber-400 rounded-xl text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                              title="جعله البروفايل الافتراضي"
                            >
                              <Star className="w-3 h-3" />
                              <span>تعيين كافتراضي</span>
                            </button>
                          )}
                        </div>

                        {/* 1-Click Activate & Connect Button */}
                        <button
                          type="button"
                          onClick={() => handleActivateOneClick(p)}
                          disabled={isConnecting || isCurrentActive}
                          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50 ${
                            isCurrentActive
                              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30 active:scale-95'
                          }`}
                        >
                          <Zap className={`w-3.5 h-3.5 ${isCurrentActive ? 'text-emerald-400' : 'text-amber-300'}`} />
                          <span>{isCurrentActive ? 'البروفايل مفعّل حالياً' : 'تفعيل والاتصال بضغطة زر'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Security / Info Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>يتم تخزين بيانات البروفايلات محلياً فقط. التبديل بضغطة زر ينقلك مباشرة للراوتر المطلوب دون الحاجة لإعادة كتابة IP أو اسم المستخدم أو كلمة المرور.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>

      {/* Password Prompt Sub-modal for profiles without saved password */}
      {passwordPromptProfile && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 text-right" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">إدخال كلمة المرور للاتصال</h4>
                  <p className="text-[10px] text-slate-400 font-mono">{passwordPromptProfile.name} ({passwordPromptProfile.host})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordPromptProfile(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecutePromptPassword} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">كلمة مرور الأدمن:</label>
                <input
                  type="password"
                  autoFocus
                  required
                  value={promptPasswordInput}
                  onChange={(e) => setPromptPasswordInput(e.target.value)}
                  placeholder="أدخل كلمة المرور..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-xl px-3 py-2 text-xs text-white font-mono text-left focus:outline-none"
                  dir="ltr"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordPromptProfile(null)}
                  className="px-3.5 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>اتصال وتفعيل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
