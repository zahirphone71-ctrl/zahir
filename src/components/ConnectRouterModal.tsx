import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { safeStorage } from '../utils/safeStorage';
import {
  Server,
  Key,
  Globe,
  Lock,
  Zap,
  CheckCircle2,
  Trash2,
  BookmarkPlus,
  Loader2,
  X,
  Radio,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Home,
  Building2,
  Store,
  Plus
} from 'lucide-react';

interface ConnectRouterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectRouterModal: React.FC<ConnectRouterModalProps> = ({ isOpen, onClose }) => {
  const {
    connectToRouter,
    isConnecting,
    isConnected,
    savedRouters,
    saveRouter,
    deleteSavedRouter,
    connectionProfiles,
    activeProfileId,
    activateConnectionProfile,
    deleteConnectionProfile,
    router: currentRouter
  } = useMikroTik();

  const [name, setName] = useState('سيرفر ZCtrl');
  const [host, setHost] = useState('');
  const [customPort, setCustomPort] = useState<string>('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [useSsl, setUseSsl] = useState(false);
  const [strictTls, setStrictTls] = useState(true);
  const [tlsFingerprint, setTlsFingerprint] = useState('');
  const [tlsPrompt, setTlsPrompt] = useState<{
    message: string;
    pendingFingerprint: string;
    attemptConfig: any;
    saveOnSuccess?: boolean;
  } | null>(null);

  // Zero-Trust Security: Passwords are NEVER cached or stored in localStorage (Rules 8 & 32)
  useEffect(() => {
    safeStorage.removeItem('zcontrol_cached_pass');
    safeStorage.removeItem('zcontrol_save_password_opt');
  }, []);

  const handlePasswordChange = (val: string) => {
    setPassword(val);
  };
  const [activeTab, setActiveTab] = useState<'profiles' | 'new' | 'saved'>('profiles');
  const [selectedSavedId, setSelectedSavedId] = useState<string>('');

  // Password for connecting saved router
  const [savedPasswordInput, setSavedPasswordInput] = useState('');
  const [activeSavedTarget, setActiveSavedTarget] = useState<any | null>(null);

  // Real Router Discovery State
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveredRouters, setDiscoveredRouters] = useState<any[]>([]);
  const [discoveryAttempted, setDiscoveryAttempted] = useState(false);

  // Diagnostic State
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    tested: boolean;
    pingOk?: boolean;
    pingLatency?: number;
    apiReachable?: boolean;
    message?: string;
  } | null>(null);

  const isMountedRef = useRef(true);
  const diagnoseAbortRef = useRef<AbortController | null>(null);
  const discoverAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      diagnoseAbortRef.current?.abort();
      discoverAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isConnecting) {
        if (activeSavedTarget) setActiveSavedTarget(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isConnecting, activeSavedTarget, onClose]);

  const runPortDiagnostic = async () => {
    if (!host.trim()) return;
    diagnoseAbortRef.current?.abort();
    const controller = new AbortController();
    diagnoseAbortRef.current = controller;

    setIsDiagnosing(true);
    setDiagnosticResult(null);
    try {
      const portNum = customPort && Number(customPort) > 0 ? Number(customPort) : (useSsl ? 8729 : 8728);
      const res = await fetch('/api/mikrotik/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), port: portNum }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      const diag = data.diagnostic;
      const isOpenPort = Boolean(diag?.apiPortOpen || diag?.sslPortOpen);
      setDiagnosticResult({
        tested: true,
        pingOk: Boolean(diag?.reachable),
        pingLatency: diag?.latencyMs,
        apiReachable: isOpenPort,
        message: diag?.diagnosticMessage || (
          isOpenPort
            ? `المنفذ ${portNum} مفتوح ومتاح للاستجابة السريعة (زمن الاستجابة: ${diag?.latencyMs ?? '< 5'}ms)`
            : `تعذر الوصول للمنفذ ${portNum} (اتصال مغلق أو محظور بجدار الحماية)`
        )
      });
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      setDiagnosticResult({
        tested: true,
        apiReachable: false,
        message: 'فشل الفحص: تحقق من الاتصال بالشبكة'
      });
    } finally {
      if (isMountedRef.current) setIsDiagnosing(false);
    }
  };

  const discoverNetworkRouters = async () => {
    discoverAbortRef.current?.abort();
    const controller = new AbortController();
    discoverAbortRef.current = controller;

    setIsDiscovering(true);
    setDiscoveredRouters([]);
    setDiscoveryAttempted(true);

    try {
      const res = await fetch('/api/mikrotik/discover', { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      setIsDiscovering(false);

      if (data.success && Array.isArray(data.routers) && data.routers.length > 0) {
        setDiscoveredRouters(data.routers);
        const primary = data.routers[0];
        setHost(primary.host);
        if (primary.port && primary.port !== 8728) {
          setCustomPort(primary.port.toString());
        }
        setName(primary.name || 'سيرفر ZCtrl');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      console.warn('Router discovery failed:', err);
      setIsDiscovering(false);
    }
  };

  if (!isOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = customPort && Number(customPort) > 0 ? Number(customPort) : undefined;
    const currentPass = password ? password.trim() : '';
    // Clear password immediately
    setPassword('');
    setTlsPrompt(null);

    const attemptConfig = {
      name: name.trim() || 'سيرفر ZCtrl',
      host: host.trim(),
      port: portNum,
      username: username.trim(),
      password: currentPass,
      useSsl,
      strictTls,
      ...(tlsFingerprint.trim() ? { tlsFingerprint: tlsFingerprint.trim() } : {})
    };

    const result = await connectToRouter(attemptConfig);
    if (!isMountedRef.current) return;

    if (result.success) {
      onClose();
    } else if (result.reasonType === 'tls_untrusted_tofu' && result.pendingFingerprint) {
      setTlsPrompt({
        message: result.message || 'شهادة TLS غير مثبتة مسبقاً. يرجى التحقق من البصمة قبل الاعتماد.',
        pendingFingerprint: result.pendingFingerprint,
        attemptConfig
      });
    }
  };

  const handleSaveAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = customPort && Number(customPort) > 0 ? Number(customPort) : undefined;
    const currentPass = password ? password.trim() : '';
    setPassword('');
    setTlsPrompt(null);

    const attemptConfig = {
      name: name.trim() || 'سيرفر ZCtrl',
      host: host.trim(),
      port: portNum,
      username: username.trim(),
      password: currentPass,
      useSsl,
      strictTls,
      ...(tlsFingerprint.trim() ? { tlsFingerprint: tlsFingerprint.trim() } : {})
    };

    const result = await connectToRouter(attemptConfig);
    if (!isMountedRef.current) return;

    if (result.success && result.router) {
      saveRouter({ ...result.router, isSaved: true });
      onClose();
    } else if (result.reasonType === 'tls_untrusted_tofu' && result.pendingFingerprint) {
      setTlsPrompt({
        message: result.message || 'شهادة TLS غير مثبتة مسبقاً. يرجى التحقق من البصمة قبل الاعتماد.',
        pendingFingerprint: result.pendingFingerprint,
        attemptConfig,
        saveOnSuccess: true
      });
    }
  };

  const handleConnectSaved = async (r: any) => {
    setSelectedSavedId(r.id);
    setActiveSavedTarget(r);
    setSavedPasswordInput('');
    setTlsPrompt(null);
  };

  const handleExecuteSavedConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSavedTarget) return;

    const passToUse = savedPasswordInput ? savedPasswordInput.trim() : '';
    setSavedPasswordInput('');
    setTlsPrompt(null);

    const attemptConfig = {
      ...activeSavedTarget,
      password: passToUse
    };

    const result = await connectToRouter(attemptConfig);
    if (!isMountedRef.current) return;

    if (result.success) {
      setActiveSavedTarget(null);
      onClose();
    } else if (result.reasonType === 'tls_untrusted_tofu' && result.pendingFingerprint) {
      setActiveSavedTarget(null);
      setTlsPrompt({
        message: result.message || 'شهادة TLS غير مثبتة مسبقاً. يرجى التحقق من البصمة قبل الاعتماد.',
        pendingFingerprint: result.pendingFingerprint,
        attemptConfig
      });
    } else {
      setActiveSavedTarget(null);
    }
  };

  const handleConfirmTofu = async () => {
    if (!tlsPrompt) return;
    const { pendingFingerprint, attemptConfig, saveOnSuccess } = tlsPrompt;
    setTlsFingerprint(pendingFingerprint);
    setTlsPrompt(null);
    const result = await connectToRouter({
      ...attemptConfig,
      tlsFingerprint: pendingFingerprint,
      acceptTlsFingerprint: true,
      strictTls: true
    });
    if (!isMountedRef.current) return;
    if (result.success) {
      if (saveOnSuccess && result.router) {
        saveRouter({ ...result.router, isSaved: true });
      }
      onClose();
    } else if (result.reasonType === 'tls_untrusted_tofu' && result.pendingFingerprint) {
      setTlsPrompt({
        message: result.message || 'يرجى التحقق من البصمة الجديدة.',
        pendingFingerprint: result.pendingFingerprint,
        attemptConfig,
        saveOnSuccess
      });
    }
  };

  const fillQuickPreset = (presetHost: string, presetPort?: string, isSsl = false) => {
    setHost(presetHost);
    setCustomPort(presetPort || '');
    setUseSsl(isSsl);
    setUsername('admin');
    setPassword('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200" dir="rtl">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl text-slate-100 overflow-hidden flex flex-col max-h-[90vh] my-auto mx-auto max-w-[96vw] sm:max-w-[90vw] md:max-w-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-2xl border border-blue-500/30">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                بوابة الاتصال الموحدة لـ ZCtrl
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-normal">
                  WinBox • REST • API
                </span>
              </h2>
              <p className="text-xs text-slate-400">ربط مباشر ذكي مع التحقق والتفاوض التلقائي للبروتوكولات</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الاتصال"
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/40 gap-2 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('profiles')}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'profiles'
                ? 'bg-slate-900 border-t border-x border-slate-800 text-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            بروفايلات الاتصال ({connectionProfiles.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'new'
                ? 'bg-slate-900 border-t border-x border-slate-800 text-blue-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            اتصال مباشر (البوابة الموحدة)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('saved')}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-xl transition-all flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              activeTab === 'saved'
                ? 'bg-slate-900 border-t border-x border-slate-800 text-indigo-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            الأجهزة المحفوظة ({savedRouters.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {tlsPrompt && (
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/40 rounded-2xl space-y-3" role="alert">
              <div className="flex items-start gap-2.5 text-xs text-emerald-300">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold text-white">تأكيد بصمة شهادة TLS قبل الاتصال (TOFU)</div>
                  <p className="text-slate-300 leading-relaxed">{tlsPrompt.message}</p>
                </div>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300 break-all" dir="ltr">
                SHA-256: {tlsPrompt.pendingFingerprint}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmTofu}
                  disabled={isConnecting}
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  تثبيت هذه البصمة والاتصال الآمن (TOFU)
                </button>
                <button
                  type="button"
                  onClick={() => setTlsPrompt(null)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

          {activeTab === 'profiles' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>بروفايلات الاتصال المتعددة بالراوتر</span>
                    <span className="text-xs text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      تبديل بضغطة زر
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    احفظ راوترات متعددة (منزل، مكتب، فرع) وبدّل بينها فورياً دون إعادة إدخال بيانات الاتصال
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('new')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة بروفايل</span>
                </button>
              </div>

              {connectionProfiles.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-2 bg-slate-950/40 rounded-2xl border border-slate-800">
                  <Home className="w-8 h-8 mx-auto text-slate-600" />
                  <p className="text-xs">لا توجد بروفايلات اتصال مسجلة</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {connectionProfiles.map((p) => {
                    const isCurrent = isConnected && currentRouter?.host === p.host;
                    const Icon = p.category === 'home' ? Home : p.category === 'office' ? Building2 : p.category === 'branch' ? Store : Server;
                    const bgBadge = p.category === 'home' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                      p.category === 'office' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      'bg-amber-500/10 text-amber-400 border-amber-500/30';

                    return (
                      <div
                        key={p.id}
                        className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                          isCurrent
                            ? 'bg-blue-950/40 border-blue-500/60 ring-1 ring-blue-500/30'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-xl border shrink-0 ${bgBadge}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h4 className="font-bold text-xs text-white">{p.name}</h4>
                                {isCurrent && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">
                                    متصل
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">
                                {p.host}:{p.port || 8728} • {p.username}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => deleteConnectionProfile(p.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                            title="حذف البروفايل"
                            aria-label="حذف البروفايل"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            {p.password ? (
                              <>
                                <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span>كلمة المرور محفوظة</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>يتطلب كلمة مرور</span>
                              </>
                            )}
                          </span>

                          <button
                            type="button"
                            onClick={async () => {
                              if (p.password) {
                                const res = await activateConnectionProfile(p.id);
                                if (isMountedRef.current && res.success) onClose();
                              } else {
                                setActiveSavedTarget(p);
                                setSavedPasswordInput('');
                              }
                            }}
                            disabled={isConnecting || isCurrent}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                              isCurrent
                                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/20 active:scale-95'
                            }`}
                          >
                            <Zap className="w-3.5 h-3.5 text-amber-300" />
                            <span>{isCurrent ? 'متصل الآن' : 'تفعيل والاتصال'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'new' ? (
            <form onSubmit={handleConnect} className="space-y-4" autoComplete="off">
              {/* Live Router Discovery Trigger */}
              <div className="flex items-center justify-between bg-blue-950/30 border border-blue-500/20 p-3 rounded-2xl">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-blue-300 block">كشف الراوترات المتصلة تلقائياً</span>
                    <span className="text-xs text-slate-400 block">فحص حقيقي للشبكة وتعبئة التفاصيل مباشرة</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={discoverNetworkRouters}
                  disabled={isDiscovering}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {isDiscovering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isDiscovering ? 'جاري الفحص...' : 'فحص الشبكة الآن'}</span>
                </button>
              </div>

              {/* Discovered Routers List or Cloud Help */}
              {discoveredRouters.length > 0 ? (
                <div className="space-y-2 bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-xs font-bold text-slate-300 block">الراوترات التي تم اكتشافها الحقيقية ({discoveredRouters.length}):</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {discoveredRouters.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setHost(r.host);
                          if (r.port && r.port !== 8728) setCustomPort(r.port.toString());
                          setName(r.name);
                        }}
                        className={`p-2.5 rounded-xl border text-start transition-all flex items-center justify-between cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          host === r.host
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold">{r.name}</div>
                          <div className="text-xs font-mono text-slate-400">{r.host}:{r.port || 8728}</div>
                        </div>
                        {host === r.host && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                      </button>
                    ))}
                  </div>
                </div>
              ) : discoveryAttempted && !isDiscovering ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-200/90 leading-relaxed space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-400">
                    <Radio className="w-3.5 h-3.5" />
                    <span>تنبيه البيئات السحابية والافتراضية (Cloud & Remote Networks):</span>
                  </div>
                  <p>
                    حزم البث التلقائي (MNDP Broadcast) لا تعبر الحاويات السحابية أو شبكات الـ WAN الخارجية. إذا كان الراوتر بعيداً، أدخل الـ IP الثابت أو رابط المايكروتك السحابي (مثل <code className="bg-amber-900/40 px-1 rounded text-amber-300">xxxx.sn.mynetname.net</code> من <span className="font-semibold">IP &gt; Cloud</span>) أو اتصل عبر VPN.
                  </p>
                </div>
              ) : null}

              {/* Quick Presets */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-xs text-slate-400 font-semibold shrink-0">عناوين شائعة:</span>
                <button
                  type="button"
                  onClick={() => fillQuickPreset('192.168.88.1')}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono border border-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  192.168.88.1 (الافتراضي)
                </button>
                <button
                  type="button"
                  onClick={() => fillQuickPreset('192.168.1.1')}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono border border-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  192.168.1.1 (LAN)
                </button>
                <button
                  type="button"
                  onClick={() => fillQuickPreset('10.0.0.1')}
                  className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono border border-slate-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  10.0.0.1
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300 block">
                      عنوان الـ IP أو المضيف (Host IP) <span className="text-rose-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={runPortDiagnostic}
                      disabled={isDiagnosing || !host.trim()}
                      className="text-xs text-blue-400 hover:text-blue-300 disabled:text-slate-600 flex items-center gap-1 cursor-pointer font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                      {isDiagnosing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                      <span>فحص المنفذ والاستجابة</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    required
                    placeholder="192.168.88.1"
                    autoComplete="off"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 text-left font-mono"
                    dir="ltr"
                  />
                  {diagnosticResult && (
                    <div className={`mt-1.5 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1.5 ${
                      diagnosticResult.apiReachable 
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                    }`}>
                      {diagnosticResult.apiReachable ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <AlertTriangle className="w-3 h-3 shrink-0" />}
                      <span>{diagnosticResult.message}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1.5 block">تسمية الجهاز (اختياري)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: راوتر برج الأمل"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1.5 block">اسم المستخدم (Username) *</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="admin"
                    autoComplete="off"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 text-left font-mono"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                    <span>كلمة المرور</span>
                    <span className="text-xs text-emerald-400 font-normal">اختياري</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => handlePasswordChange(e.target.value)}
                      placeholder="فارغة لـ ZCtrl الافتراضي"
                      autoComplete="new-password"
                      data-lpignore="true"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 text-left font-mono pl-9"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1.5 block">منفذ مخصص (اختياري)</label>
                  <input
                    type="number"
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    placeholder="تلقائي (فحص 8728 / 8291 / 443)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 text-left font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2.5 p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-slate-300 font-semibold">
                    <input
                      type="checkbox"
                      checked={useSsl}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseSsl(checked);
                        if (checked && (!customPort || customPort === '8728')) setCustomPort('8729');
                      }}
                      className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>استخدام تشفير آمن SSL / TLS (منفذ 8729)</span>
                  </label>
                  <div className="text-xs text-blue-400 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>تأمين الاتصال</span>
                  </div>
                </div>
                {useSsl && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>تثبيت شهادة TLS (TOFU Certificate Pinning)</span>
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={strictTls}
                          onChange={(e) => setStrictTls(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                        />
                        <span>تحقق صارم</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      value={tlsFingerprint}
                      onChange={(e) => setTlsFingerprint(e.target.value)}
                      dir="ltr"
                      placeholder="SHA-256 Fingerprint (اختياري أو يُطلب تأكيده عند أول اتصال)"
                      className="w-full h-9 bg-slate-900/90 border border-slate-700/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg text-xs text-emerald-300 font-mono placeholder:text-slate-600 px-3 text-left"
                    />
                  </div>
                )}
                {!useSsl && (
                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2">
                    <span className="text-xs text-amber-300">
                      تحذير: المنفذ 8728 غير مشفر. يُنصح بتفعيل <code className="font-mono">api-ssl (8729)</code> لحماية كلمات المرور.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setUseSsl(true);
                        setCustomPort('8729');
                      }}
                      className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    >
                      تفعيل 8729
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الاتصال والتحقق...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>اتصال فوري ومزامنة</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndConnect}
                  disabled={isConnecting}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 px-4 rounded-xl border border-slate-700 flex items-center gap-2 transition-all disabled:opacity-50 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <BookmarkPlus className="w-4 h-4 text-blue-400" />
                  <span>حفظ واتصال</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {savedRouters.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-2">
                  <Server className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-xs">لا توجد أجهزة ZCtrl محفوظة حالياً</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('new')}
                    className="text-xs text-blue-400 hover:underline font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    أضف أول جهاز ZCtrl الآن
                  </button>
                </div>
              ) : (
                savedRouters.map((r) => {
                  const isCurrent = currentRouter?.id === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        isCurrent
                          ? 'bg-blue-950/30 border-blue-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-slate-100">{r.name}</h4>
                            {isCurrent && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                                متصل
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 font-mono" dir="ltr">
                            <span>{r.host}</span>
                            <span>•</span>
                            <span>{r.username}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleConnectSaved(r)}
                          disabled={isConnecting && selectedSavedId === r.id}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          {isConnecting && selectedSavedId === r.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Zap className="w-3.5 h-3.5" />
                          )}
                          <span>اتصال</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedRouter(r.id)}
                          aria-label="حذف من الأجهزة المحفوظة"
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                          title="حذف من الأجهزة المحفوظة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Active Saved Router Password Prompt in Modal */}
          {activeSavedTarget && (
            <div className="p-4 bg-slate-950 border border-blue-500/40 rounded-2xl space-y-3 animate-in fade-in duration-200">
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <Key className="w-4 h-4 text-blue-400" />
                <span>أدخل كلمة المرور للاتصال بـ {activeSavedTarget.name} ({activeSavedTarget.host}):</span>
              </div>
              <form onSubmit={handleExecuteSavedConnect} className="flex gap-2">
                <input
                  type="password"
                  value={savedPasswordInput}
                  onChange={(e) => setSavedPasswordInput(e.target.value)}
                  placeholder="كلمة مرور ZCtrl"
                  autoFocus
                  autoComplete="new-password"
                  data-lpignore="true"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus:border-blue-500 font-mono text-left"
                  dir="ltr"
                />
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>دخول</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSavedTarget(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                >
                  إلغاء
                </button>
              </form>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800/80 text-xs text-slate-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>حماية مشددة: لا يتم حفظ أو تخزين كلمة مرور الأدمن نهائياً في المتصفح أو أي ذاكرة محلية.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
