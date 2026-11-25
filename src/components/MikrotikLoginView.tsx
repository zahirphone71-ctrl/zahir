import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { LoginForm } from './LoginForm';
import { safeStorage } from '../utils/safeStorage';
import {
  Server,
  Globe,
  Zap,
  Trash2,
  Loader2,
  Key,
  Activity,
  Eye,
  EyeOff,
  SlidersHorizontal,
  RefreshCw,
  Home,
  Building2,
  Store
} from 'lucide-react';
import { RouterConnectionProfilesModal } from './connection/RouterConnectionProfilesModal';
import { RouterConnectionProfile } from '../types/mikrotik';

interface MikrotikLoginViewProps {
  onSuccessNavigate?: () => void;
}

// Helper to safely read partial config
const getSafeSavedConfig = () => {
  try {
    const raw = safeStorage.getItem('zahir_config_partial');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const MikrotikLoginView: React.FC<MikrotikLoginViewProps> = ({ onSuccessNavigate }) => {
  const {
    connectToRouter,
    cancelConnecting,
    isConnecting,
    savedRouters,
    saveRouter,
    deleteSavedRouter,
    connectionProfiles,
    activateConnectionProfile,
    router: currentRouter,
    showToast
  } = useMikroTik();

  const [showProfilesModal, setShowProfilesModal] = useState(false);
  const [lang, setLang] = useState<'ar' | 'en'>(() => {
    try {
      return (safeStorage.getItem('zahir_language') as 'ar' | 'en') || 'ar';
    } catch {
      return 'ar';
    }
  });

  const handleSetLang = (newLang: 'ar' | 'en') => {
    setLang(newLang);
    try {
      safeStorage.setItem('zahir_language', newLang);
    } catch {}
  };

  // Connection Error Banner State (Clear reason & Actionable steps)
  const [connectionError, setConnectionError] = useState<{
    message: string;
    suggestion?: string;
    reasonType?: string;
    rawError?: string;
    host?: string;
  } | null>(null);

  // RouterOS Admin Form State (Strictly Real MikroTik Defaults)
  const [name, setName] = useState('MikroTik RouterOS');
  const [host, setHost] = useState(() => {
    const saved = getSafeSavedConfig();
    return saved.ip || '192.168.88.1';
  });
  const [customPort, setCustomPort] = useState<string>(() => {
    const saved = getSafeSavedConfig();
    return saved.port ? String(saved.port) : '8728';
  });
  const [username, setUsername] = useState(() => {
    const saved = getSafeSavedConfig();
    return saved.user || 'admin';
  });
  const [useSsl, setUseSsl] = useState(() => {
    const saved = getSafeSavedConfig();
    return !!saved.useSsl;
  });

  const isMountedRef = useRef(true);
  const diagnoseAbortRef = useRef<AbortController | null>(null);
  const passInputRef = useRef<HTMLInputElement>(null);

  // Zero Password Retention: purge any stored passwords immediately on mount
  useEffect(() => {
    isMountedRef.current = true;
    try {
      safeStorage.removeItem('zcontrol_cached_pass');
      safeStorage.removeItem('zcontrol_save_password_opt');
      safeStorage.removeItem('zahir_auto_connect');
    } catch {}
    return () => {
      isMountedRef.current = false;
      diagnoseAbortRef.current?.abort();
    };
  }, []);

  // Diagnostic Test State
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<{
    reachable: boolean;
    apiPortOpen: boolean;
    sslPortOpen?: boolean;
    winboxOpen: boolean;
    webOpen: boolean;
    sshOpen?: boolean;
    recommendedPort?: number;
    recommendedService?: string;
    useSsl?: boolean;
    latencyMs: number;
    diagnosticMessage: string;
    portsSummary?: Array<{
      port: number;
      name: string;
      open: boolean;
      latency: number;
      isApi: boolean;
      description: string;
    }>;
  } | null>(null);

  const runPortDiagnosis = async (ipOverride?: string) => {
    const targetHost = (ipOverride ?? host).trim();
    if (!targetHost) {
      showToast('يرجى كتابة عنوان IP الراوتر أولاً', 'error');
      return;
    }
    diagnoseAbortRef.current?.abort();
    const controller = new AbortController();
    diagnoseAbortRef.current = controller;

    setIsDiagnosing(true);
    setDiagnosticResult(null);
    try {
      const pNum = customPort && Number(customPort) > 0 ? Number(customPort) : (useSsl ? 8729 : 8728);
      const res = await fetch('/api/mikrotik/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: targetHost, port: pNum }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isMountedRef.current) return;
      setIsDiagnosing(false);
      if (data.success && data.diagnostic) {
        setDiagnosticResult(data.diagnostic);
        if (data.diagnostic.apiPortOpen || data.diagnostic.sslPortOpen) {
          showToast(`منفذ الـ API مفتوح وجاهز للاتصال (${data.diagnostic.latencyMs}ms)`, 'success');
        } else if (data.diagnostic.reachable) {
          showToast('الراوتر يستجيب لكن منفذ API مغلق. يرجى تفعيله في IP > Services', 'error');
        } else {
          showToast('تعذر الوصول لعنوان الراوتر. تحقق من اتصال الشبكة والـ IP', 'error');
        }
      } else {
        showToast(data.message || 'فشل فحص الاتصال بالشبكة', 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      setIsDiagnosing(false);
      showToast('فشل فحص الاتصال بالشبكة', 'error');
    }
  };

  // Remote connection guide modal state
  const [showRemoteGuide, setShowRemoteGuide] = useState(false);

  // Password Prompt Modal for Saved Routers
  const [savedRouterToConnect, setSavedRouterToConnect] = useState<any | null>(null);
  const [savedPasswordInput, setSavedPasswordInput] = useState('');
  const [showSavedPassword, setShowSavedPassword] = useState(false);

  useEffect(() => {
    if (!savedRouterToConnect && !showRemoteGuide) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (savedRouterToConnect && !isConnecting) setSavedRouterToConnect(null);
        else if (showRemoteGuide) setShowRemoteGuide(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [savedRouterToConnect, showRemoteGuide, isConnecting]);

  // تم إيقاف أي محاولة لتسجيل الدخول التلقائي نهائياً بناءً على طلب المستخدم الصارم لمنع التكرار المفاجئ
  useEffect(() => {
    // التأكد من ملء الحقول المحفوظة دون أي بدء تلقائي لعملية الاتصال
    try {
      const saved = getSafeSavedConfig();
      if (saved.ip && !host) setHost(saved.ip.trim());
      if (saved.user && !username) setUsername(saved.user.trim());
      if (saved.port && !customPort && saved.port !== '8728') setCustomPort(saved.port.toString());
      if (saved.name && !name) setName(saved.name.trim());
    } catch {}
  }, []);

  const handleLoginFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const ipVal = (formData.get('ip') as string) || '192.168.88.1';
    const userVal = (formData.get('user') as string) || 'admin';
    const passVal = (formData.get('pass') as string) || '';
    const rememberVal = formData.get('remember') === 'on' || formData.get('remember') === 'true';

    const formPort = formData.get('port') ? String(formData.get('port')) : '';
    const formUseSsl = formData.get('useSsl') === 'on' || formData.get('useSsl') === 'true';
    const formStrictTls = formData.get('strictTls') === 'on' || formData.get('strictTls') === 'true';
    const formTlsFingerprint = ((formData.get('tlsFingerprint') as string) || '').trim();
    const formOperatorUsername = ((formData.get('operatorUsername') as string) || '').trim();
    const formOperatorPassword = ((formData.get('operatorPassword') as string) || '').trim();

    if (formPort) setCustomPort(formPort);
    setUseSsl(formUseSsl);

    // Limit port range: 1 to 65535
    const parsedPort = parseInt(formPort) || (formUseSsl ? 8729 : 8728);
    const portNum = Math.min(65535, Math.max(1, parsedPort));

    if (!ipVal.trim()) {
      showToast(lang === 'ar' ? 'يرجى إدخال عنوان الـ IP الخاص بالمايكروتك' : 'Please enter the MikroTik IP address', 'error');
      return;
    }

    if (!userVal.trim()) {
      showToast(lang === 'ar' ? 'يرجى إدخال اسم مستخدم مدير الراوتر (admin)' : 'Please enter router username (admin)', 'error');
      return;
    }

    const routerConfig = {
      name: name.trim() || 'MikroTik RouterOS',
      host: ipVal.trim(),
      port: portNum,
      username: userVal.trim(),
      password: passVal.trim(),
      useSsl: formUseSsl,
      ...(formStrictTls ? { strictTls: true } : {}),
      ...(formTlsFingerprint ? { tlsFingerprint: formTlsFingerprint } : {}),
      ...(formOperatorUsername ? { operatorUsername: formOperatorUsername } : {}),
      ...(formOperatorPassword ? { operatorPassword: formOperatorPassword } : {}),
    };

    setConnectionError(null);
    safeStorage.removeItem('zctrl_explicit_logout');
    safeStorage.removeItem('zctrl_auto_connect_attempted_session');

    const result = await connectToRouter(routerConfig);

    if (result.success && result.router) {
      setConnectionError(null);
      try {
        safeStorage.setItem('zahir_config_partial', JSON.stringify({ 
          ip: ipVal.trim(), 
          user: userVal.trim(),
          port: portNum,
          useSsl: formUseSsl,
          strictTls: formStrictTls,
          ...(formTlsFingerprint ? { tlsFingerprint: formTlsFingerprint } : {}),
          ...(formOperatorUsername ? { operatorUsername: formOperatorUsername } : {})
        }));
        if (rememberVal) {
          safeStorage.setItem('zahir_remember_me', 'true');
          saveRouter(result.router);
        } else {
          safeStorage.setItem('zahir_remember_me', 'false');
        }
        // Zero Password Retention: ensure password is never written to storage
        safeStorage.removeItem('zcontrol_cached_pass');
        safeStorage.removeItem('zcontrol_save_password_opt');
      } catch {}
      if (onSuccessNavigate) {
        onSuccessNavigate();
      }
    } else {
      setConnectionError({
        message: result.message || (lang === 'ar' ? 'تعذر الاتصال بسيرفر المايكروتك.' : 'Failed to connect to MikroTik server.'),
        suggestion: result.suggestion,
        reasonType: result.reasonType,
        rawError: result.rawError,
        host: ipVal.trim()
      });
    }
  };

  const handlePromptSavedConnect = (r: any) => {
    setSavedRouterToConnect(r);
    setConnectionError(null);
    // Security: user must explicitly enter admin password for saved router
    setSavedPasswordInput('');
  };

  const handleExecuteSavedConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!savedRouterToConnect) return;

    const passToUse = savedPasswordInput ? savedPasswordInput.trim() : '';
    setSavedPasswordInput('');
    setConnectionError(null);

    const result = await connectToRouter({
      ...savedRouterToConnect,
      username: savedRouterToConnect.username,
      password: passToUse,
    });
    if (!isMountedRef.current) return;

    setSavedRouterToConnect(null);

    if (result.success && result.router) {
      saveRouter(result.router);
      if (onSuccessNavigate) {
        onSuccessNavigate();
      }
    } else {
      setConnectionError({
        message: result.message || 'تعذر الاتصال بالسيرفر المحفوظ.',
        suggestion: result.suggestion,
        reasonType: result.reasonType,
        rawError: result.rawError,
        host: savedRouterToConnect.host
      });
    }
  };

  const handleProfileOneClick = async (p: RouterConnectionProfile) => {
    if (p.password) {
      const res = await activateConnectionProfile(p.id);
      if (!isMountedRef.current) return;
      if (res.success && onSuccessNavigate) {
        onSuccessNavigate();
      }
    } else {
      setHost(p.host);
      setCustomPort(String(p.port || 8728));
      setUsername(p.username);
      setUseSsl(Boolean(p.useSsl));
      setName(p.name);
      showToast(`تم اختيار بروفايل: ${p.name} - أدخل كلمة المرور واضغط اتصال`, 'info');
      passInputRef.current?.focus();
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative selection:bg-blue-600 selection:text-white" dir="rtl">
      {/* Background Subtle Ambience */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-3xl z-10 space-y-4 my-auto">
        {/* Connection Profiles 1-Click Cards Strip (منزل، مكتب، فرع) */}
        {connectionProfiles.length > 0 && (
          <div className="bg-slate-900/90 border border-slate-800/90 backdrop-blur-xl rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl shadow-md shadow-blue-500/20">
                  <Zap className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <span>بروفايلات الاتصال السريع بالراوتر</span>
                    <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                      تبديل بضغطة زر ⚡
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    اختر الراوتر المطلوب (منزل، مكتب، فرع) للاتصال المباشر دون إعادة إدخال البيانات في كل مرة
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowProfilesModal(true)}
                className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                <span>إدارة البروفايلات</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {connectionProfiles.slice(0, 3).map((p) => {
                const Icon = p.category === 'home' ? Home : p.category === 'office' ? Building2 : p.category === 'branch' ? Store : Globe;
                const bgBadge = p.category === 'home' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                  p.category === 'office' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                  'bg-amber-500/10 text-amber-400 border-amber-500/30';

                return (
                  <div
                    key={p.id}
                    className="bg-slate-950/80 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-3 flex flex-col justify-between space-y-2.5 transition-all group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-xl border shrink-0 ${bgBadge}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-white truncate block">{p.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono block truncate" dir="ltr">
                          {p.host}:{p.port || 8728}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleProfileOneClick(p)}
                      disabled={isConnecting}
                      className="w-full py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300" />
                      <span>{p.password ? 'اتصال فوري ⚡' : 'تحديد البروفايل'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Direct Login View without Tab Headers */}
        <div className="space-y-4">
          <LoginForm
            onSubmit={handleLoginFormSubmit}
            isLoading={isConnecting}
            error={connectionError?.message}
            suggestion={connectionError?.suggestion}
            lang={lang}
            setLang={handleSetLang}
            onCancel={cancelConnecting}
            port={Number(customPort) || 8728}
            useSsl={useSsl}
            setPort={(p) => setCustomPort(p.toString())}
            setUseSsl={setUseSsl}
            host={host}
            onHostChange={setHost}
            username={username}
            onUsernameChange={setUsername}
            passInputRef={passInputRef}
          />

          {/* Quick Actions & Diagnostic Panel */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center justify-between">
            <div className="text-right">
              <h4 className="text-xs font-bold text-slate-300">أدوات الفحص والتشخيص المتقدمة</h4>
              <p className="text-[10px] text-slate-500">تحقق من حالة المنفذ وقابلية الوصول للراوتر الفعلي</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRemoteGuide(true)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                <span>دليل الاتصال الفني عن بعد</span>
              </button>
              <button
                type="button"
                onClick={() => runPortDiagnosis(host)}
                disabled={isDiagnosing}
                className="px-3 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDiagnosing ? 'animate-spin' : ''}`} />
                <span>تشخيص منفذ الاتصال</span>
              </button>
            </div>
          </div>

          {/* Diagnostic Results Display */}
          {diagnosticResult && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-right">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[10px] text-slate-500 font-mono">RTT: {diagnosticResult.latencyMs}ms</span>
                <h4 className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  <span>تقرير تشخيص منافذ وخدمات الراوتر التلقائي</span>
                </h4>
              </div>

              {/* Status Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {diagnosticResult.portsSummary ? (
                  diagnosticResult.portsSummary.map((p) => (
                    <div
                      key={p.port}
                      className={`flex flex-col justify-between p-2 rounded-xl border ${
                        p.open
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-[11px]">{p.port}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
                            p.open ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {p.open ? `مفتوح ${p.latency}ms` : 'مغلق'}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold mt-1 truncate">{p.name}</span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="flex items-center justify-between p-2 bg-slate-950/40 rounded-lg">
                      <span className={diagnosticResult.reachable ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {diagnosticResult.reachable ? "نشط (Reachable)" : "غير نشط (Offline)"}
                      </span>
                      <span className="text-slate-400">عنوان الـ IP:</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slate-950/40 rounded-lg">
                      <span className={diagnosticResult.apiPortOpen ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {diagnosticResult.apiPortOpen ? "مفتوح (Open)" : "مغلق (Closed)"}
                      </span>
                      <span className="text-slate-400">منفذ الـ API (8728):</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slate-950/40 rounded-lg">
                      <span className={diagnosticResult.winboxOpen ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {diagnosticResult.winboxOpen ? "مفتوح (Open)" : "مغلق (Closed)"}
                      </span>
                      <span className="text-slate-400">منفذ Winbox (8291):</span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-slate-950/40 rounded-lg">
                      <span className={diagnosticResult.webOpen ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        {diagnosticResult.webOpen ? "نشط (Active)" : "مغلق (Inactive)"}
                      </span>
                      <span className="text-slate-400">واجهة الويب (Port 80):</span>
                    </div>
                  </>
                )}
              </div>

              {/* Recommended Port & Action Button */}
              {diagnosticResult.recommendedPort && (
                <div className="p-2.5 bg-blue-950/40 border border-blue-800/40 rounded-xl flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (diagnosticResult.recommendedPort) {
                        setCustomPort(String(diagnosticResult.recommendedPort));
                        setUseSsl(!!diagnosticResult.useSsl);
                        showToast(`تم تعيين المنفذ ${diagnosticResult.recommendedPort} تلقائياً`, 'info');
                      }
                    }}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer shrink-0"
                  >
                    استخدام هذا المنفذ في خانة الاتصال
                  </button>
                  <div className="text-right">
                    <span className="text-[10px] text-blue-300 block">منفذ الإدارة الموصى به:</span>
                    <span className="text-xs font-bold text-white font-mono">
                      Port {diagnosticResult.recommendedPort} ({diagnosticResult.recommendedService || 'API'})
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400 bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                {diagnosticResult.diagnosticMessage}
              </p>
            </div>
          )}

          {/* Saved Routers Section (if any saved) */}
          {savedRouters.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 text-right">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="bg-blue-900/40 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                  {savedRouters.length} راوترات
                </span>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-blue-400" />
                  <span>الراوترات المحفوظة</span>
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {savedRouters.map((r) => {
                  const isCurrent = currentRouter?.host === r.host;
                  return (
                    <div
                      key={r.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col justify-between space-y-2 ${
                        isCurrent
                          ? 'bg-blue-950/40 border-blue-500/60'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-white">{r.name}</h4>
                            {isCurrent && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                                متصل
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 font-mono" dir="ltr">
                            {r.host}:{r.port || 8728} • {r.username}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteSavedRouter(r.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                          title="حذف"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-slate-400 font-mono">
                          {r.boardName || 'RouterBOARD'} {r.version && `(${r.version})`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handlePromptSavedConnect(r)}
                          disabled={isConnecting}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold py-1 px-2.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Zap className="w-3 h-3" />
                          <span>اتصال</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal: Enter password to connect to saved router */}
        {savedRouterToConnect && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4 text-right" dir="rtl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">تسجيل الدخول إلى {savedRouterToConnect.name}</h3>
                    <p className="text-[11px] text-slate-400 font-mono" dir="ltr">{savedRouterToConnect.host} ({savedRouterToConnect.username})</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleExecuteSavedConnect} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 mb-1.5 block">أدخل كلمة المرور:</label>
                  <div className="relative">
                    <input
                      type={showSavedPassword ? 'text' : 'password'}
                      value={savedPasswordInput}
                      onChange={(e) => setSavedPasswordInput(e.target.value)}
                      placeholder="فارغة افتراضياً"
                      autoFocus
                      autoComplete="new-password"
                      data-lpignore="true"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono text-left pl-10"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSavedPassword(!showSavedPassword)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showSavedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isConnecting}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    <span>اتصال</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSavedRouterToConnect(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Remote Connection Guide Modal */}
        {showRemoteGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200" dir="rtl">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-5 text-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-blue-400 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  <span>دليل الاتصال بالمايكروتك عن بُعد</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRemoteGuide(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-slate-200">1. توجيه البورتات (Port Forwarding):</div>
                  <p className="text-slate-400">
                    في المايكروتك، توجه إلى <code className="text-blue-400">IP &gt; Firewall &gt; NAT</code> وقم بإضافة قاعدة تحويل (<code className="text-blue-400">dst-nat</code>) لمنفذ API رقم <code className="text-blue-400">8728</code>.
                  </p>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                  <div className="font-bold text-slate-200">2. استخدام WireGuard أو VPN (موصى به):</div>
                  <p className="text-slate-400">
                    قم بإنشاء نفق VPN افتراضي للاتصال الآمن بالراوتر كأنه داخل الشبكة المحلية تماماً.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRemoteGuide(false)}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg text-xs transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        {/* Router Connection Profiles Management Modal */}
        <RouterConnectionProfilesModal
          isOpen={showProfilesModal}
          onClose={() => setShowProfilesModal(false)}
          onProfileActivated={() => {
            if (onSuccessNavigate) onSuccessNavigate();
          }}
        />
      </div>
    </div>
  );
};
