import React, { useState, useEffect, useRef } from 'react';
import { Globe, Lock, ChevronLeft, RefreshCw, AlertCircle, Server, Settings, Eye, EyeOff, ShieldCheck, UserCheck, AlertTriangle } from 'lucide-react';
import { LogoZ } from './LogoZ';
import { ZCtrlTitle } from './ZCtrlTitle';
import { TRANSLATIONS } from '../lib/translations';
import { safeStorage } from '../utils/safeStorage';

interface LoginFormProps {
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  error?: string | null;
  suggestion?: string | null;
  reasonType?: string;
  pendingFingerprint?: string;
  onAcceptTlsFingerprint?: (fingerprint: string) => void;
  lang: 'ar' | 'en';
  setLang: (l: 'ar' | 'en') => void;
  onCancel?: () => void;
  port: number;
  useSsl: boolean;
  setPort: (p: number) => void;
  setUseSsl: (s: boolean) => void;
  host?: string;
  onHostChange?: (host: string) => void;
  username?: string;
  onUsernameChange?: (username: string) => void;
  passInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  onSubmit,
  isLoading,
  error,
  suggestion,
  reasonType,
  pendingFingerprint,
  onAcceptTlsFingerprint,
  lang,
  setLang,
  onCancel,
  port,
  useSsl,
  setPort,
  setUseSsl,
  host: controlledHost,
  onHostChange,
  username: controlledUsername,
  onUsernameChange,
  passInputRef
}) => {
  const t = (TRANSLATIONS[lang] || TRANSLATIONS.ar).login;
  const saved = (() => {
    try {
      const raw = safeStorage.getItem('zahir_config_partial');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn('Failed to parse saved router partial config:', err);
      return {};
    }
  })();
  const isNative = typeof window !== 'undefined' && 
    ((window as any).Capacitor !== undefined || window.location.protocol === 'file:');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [apiUrl, setApiUrl] = useState(() => {
    try {
      return safeStorage.getItem('zahir_api_url') || '';
    } catch (err) {
      console.warn('Failed to read zahir_api_url:', err);
      return '';
    }
  });
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [ip, setIp] = useState(controlledHost ?? saved.ip ?? "");
  const [user, setUser] = useState(controlledUsername ?? saved.user ?? "admin");
  // Zero Password Retention: password is strictly never stored or retrieved from cache
  const [pass, setPass] = useState('');
  const [strictTls, setStrictTls] = useState<boolean>(saved.strictTls !== undefined ? Boolean(saved.strictTls) : true);
  const [tlsFingerprint, setTlsFingerprint] = useState<string>(saved.tlsFingerprint ?? '');
  const [operatorUsername, setOperatorUsername] = useState<string>(saved.operatorUsername ?? '');
  const [operatorPassword, setOperatorPassword] = useState<string>('');
  const [needsInitialAdmin, setNeedsInitialAdmin] = useState<boolean | null>(null);
  const [bootstrapUsername, setBootstrapUsername] = useState('admin');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isMountedRef = useRef(true);
  const pingAbortRef = useRef<AbortController | null>(null);
  const pingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discoverAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      pingAbortRef.current?.abort();
      discoverAbortRef.current?.abort();
      if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (controlledHost !== undefined) {
      setIp(controlledHost);
    }
  }, [controlledHost]);

  useEffect(() => {
    if (controlledUsername !== undefined) {
      setUser(controlledUsername);
    }
  }, [controlledUsername]);

  // Purge any legacy cached passwords and query RBAC bootstrap status
  useEffect(() => {
    try {
      safeStorage.removeItem('zcontrol_cached_pass');
      safeStorage.removeItem('zcontrol_save_password_opt');
      safeStorage.removeItem('zahir_auto_connect');
    } catch (err) {
      console.warn('Legacy storage cleanup skipped:', err);
    }
    const ac = new AbortController();
    fetch('/api/auth/bootstrap-status', { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!isMountedRef.current || !data?.success) return;
        const needsInit = Boolean(data.needsInitialAdmin);
        setNeedsInitialAdmin(needsInit);
        if (!needsInit) {
          setShowAdvanced(true);
        }
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          console.warn('bootstrap-status check failed:', err);
        }
      });
    return () => ac.abort();
  }, []);

  const handleBootstrapAdmin = async () => {
    if (!bootstrapUsername.trim() || bootstrapPassword.length < 10) {
      setBootstrapError(
        lang === 'ar'
          ? 'يجب إدخال اسم مستخدم وكلمة مرور لا تقل عن 10 أحرف'
          : 'Username and password (min 10 chars) required'
      );
      return;
    }
    setBootstrapBusy(true);
    setBootstrapError(null);
    try {
      const res = await fetch('/api/auth/bootstrap-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: bootstrapUsername.trim(),
          password: bootstrapPassword
        })
      });
      const data = await res.json();
      if (!isMountedRef.current) return;
      if (res.ok && data.success) {
        setNeedsInitialAdmin(false);
        setOperatorUsername(bootstrapUsername.trim());
        setOperatorPassword(bootstrapPassword);
        setBootstrapPassword('');
        setShowAdvanced(true);
      } else {
        setBootstrapError(data.message || 'تعذر إنشاء حساب المدير الأول');
      }
    } catch (err) {
      console.warn('bootstrap-admin request failed:', err);
      if (isMountedRef.current) setBootstrapError('تعذر الاتصال بالخادم');
    } finally {
      if (isMountedRef.current) setBootstrapBusy(false);
    }
  };

  const testConnection = async (url: string) => {
    if (!url) return false;
    pingAbortRef.current?.abort();
    if (pingTimeoutRef.current) clearTimeout(pingTimeoutRef.current);

    const controller = new AbortController();
    pingAbortRef.current = controller;
    if (isMountedRef.current) setTestStatus('testing');
    try {
      const cleanUrl = url.replace(/\/+$/, '');
      pingTimeoutRef.current = setTimeout(() => controller.abort(), 8000);
      
      const res = await fetch(`${cleanUrl}/api/ping`, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      
      if (pingTimeoutRef.current) {
        clearTimeout(pingTimeoutRef.current);
        pingTimeoutRef.current = null;
      }
      if (!isMountedRef.current) return false;

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (isMountedRef.current) setTestStatus('success');
          return true;
        }
      }
      if (isMountedRef.current) setTestStatus('error');
    } catch (err: any) {
      if (err?.name === 'AbortError') return false;
      console.error('Test connection failed', err);
      if (window.location.protocol === 'https:' && !url.startsWith('https:')) {
        console.warn('Attempting to connect to insecure HTTP from fixed HTTPS. This usually fails in browsers.');
      }
      if (isMountedRef.current) setTestStatus('error');
    }
    return false;
  };

  useEffect(() => {
    const discover = async () => {
      // Check if we have an auto-discovered URL
      const discovered = safeStorage.getItem('zahir_discovered_origin');
      if (isNative && !apiUrl && discovered) {
        setApiUrl(discovered);
        safeStorage.setItem('zahir_api_url', discovered);
        testConnection(discovered);
      }
    };
    discover();
  }, [isNative, apiUrl]);

  const handleApiUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setApiUrl(val);
    safeStorage.setItem('zahir_api_url', val.replace(/\/+$/, ''));
    setTestStatus('idle');
  };

  return (
    <div className="relative w-full max-w-lg mx-auto p-4 animate-in zoom-in-95 duration-150" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {isDiscovering && (
        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex flex-col items-center justify-center rounded-[2.5rem] border border-white/10 gap-4">
          <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
          <div className="text-center">
            <p className="text-white font-black uppercase tracking-widest font-mono">
              {t.auto_discovering}
            </p>
            <p className="text-xs text-slate-400 uppercase tracking-widest mt-2 px-6">
              {t.linking_cloud}
            </p>
          </div>
          <button 
            type="button"
            onClick={() => setIsDiscovering(false)}
            className="mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-slate-300 uppercase tracking-widest hover:text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t.manual_entry}
          </button>
        </div>
      )}
      <div className="border border-slate-800/80 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.6)] overflow-hidden rounded-3xl bg-slate-900/90 backdrop-blur-xl">
        <div className="p-8 sm:p-10 space-y-7">
          <div className="flex flex-col items-center gap-3">
            <LogoZ size={96} />
            <div className="text-center mt-1">
              <ZCtrlTitle size="xl" />
              <p className="text-xs text-emerald-400 font-bold uppercase tracking-[0.25em] mt-1">{t.subtitle}</p>
            </div>
          </div>

          <div className="flex bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800">
             <button 
               type="button"
               onClick={() => setLang('ar')} 
               className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${lang === 'ar' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
             >
               العربية
             </button>
             <button 
               type="button"
               onClick={() => setLang('en')} 
               className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${lang === 'en' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
             >
               English
             </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl space-y-2 text-red-400 text-start">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
                <p className="text-xs font-bold leading-relaxed">{error}</p>
              </div>
              {suggestion && (
                <div className="text-xs text-amber-400 font-medium border-t border-slate-800 pt-1.5 leading-relaxed">
                  <strong>{lang === 'ar' ? 'اقتراح الحل: ' : 'Suggestion: '}</strong>{suggestion}
                </div>
              )}
              {reasonType === 'tls_untrusted_tofu' && pendingFingerprint && (
                <div className="border-t border-slate-800 pt-2.5 space-y-2">
                  <div className="text-xs font-mono text-emerald-300 bg-slate-950/90 p-2 rounded-lg break-all" dir="ltr">
                    SHA-256: {pendingFingerprint}
                  </div>
                  {onAcceptTlsFingerprint && (
                    <button
                      type="button"
                      onClick={() => {
                        setTlsFingerprint(pendingFingerprint);
                        onAcceptTlsFingerprint(pendingFingerprint);
                      }}
                      className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                    >
                      {lang === 'ar' ? 'تثبيت هذه البصمة والاتصال الآمن (TOFU)' : 'Trust & Pin Certificate (TOFU)'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {needsInitialAdmin === true && (
            <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-2xl space-y-2.5 text-start">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-300">
                <ShieldCheck className="w-4 h-4 shrink-0 text-blue-400" />
                <span>{lang === 'ar' ? 'الإعداد الأولي: أنشئ حساب مدير النظام (Admin)' : 'First-Run Setup: Create Admin Operator'}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {lang === 'ar'
                  ? 'لتأمين النظام، يُنصح بإنشاء حساب المدير الأول (كلمة مرور 10 أحرف فأكثر). بعد الإنشاء سيصبح دخول المشغل إلزامياً.'
                  : 'Create the initial admin account (10+ character password) to protect router access.'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={bootstrapUsername}
                  onChange={(e) => setBootstrapUsername(e.target.value)}
                  dir="ltr"
                  placeholder="admin"
                  className="h-9 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono px-2.5 text-center"
                />
                <input
                  type="password"
                  value={bootstrapPassword}
                  onChange={(e) => setBootstrapPassword(e.target.value)}
                  dir="ltr"
                  placeholder={lang === 'ar' ? 'كلمة مرور (10+ أحرف)' : 'Password (10+ chars)'}
                  className="h-9 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white font-mono px-2.5 text-center"
                />
              </div>
              {bootstrapError && <p className="text-xs text-rose-400 font-bold">{bootstrapError}</p>}
              <button
                type="button"
                disabled={bootstrapBusy}
                onClick={handleBootstrapAdmin}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                {bootstrapBusy
                  ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Creating...')
                  : (lang === 'ar' ? 'حفظ وإنشاء حساب المدير الأول' : 'Create Initial Admin')}
              </button>
            </div>
          )}

          <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {t.router_ip}
                  </label>
                  <button 
                    type="button"
                    onClick={async () => {
                      discoverAbortRef.current?.abort();
                      const controller = new AbortController();
                      discoverAbortRef.current = controller;
                      setIsDiscovering(true);
                      try {
                        const res = await fetch('/api/mikrotik/discover', { signal: controller.signal });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        const data = await res.json();
                        if (!isMountedRef.current) return;
                        if (data.success && Array.isArray(data.routers) && data.routers.length > 0) {
                          const foundHost = data.routers[0].host;
                          setIp(foundHost);
                          onHostChange?.(foundHost);
                        }
                      } catch (e: any) {
                        if (e?.name === 'AbortError' || !isMountedRef.current) return;
                        console.warn('Auto discover failed:', e);
                      } finally {
                        if (isMountedRef.current) setIsDiscovering(false);
                      }
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-300 uppercase tracking-wider cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  >
                    <RefreshCw size={12} className={isDiscovering ? 'animate-spin' : ''} />
                    {t.auto_detect}
                  </button>
                </div>
                <div className="relative">
                  <input 
                    name="ip"
                    type="text" 
                    value={ip}
                    onChange={(e) => {
                      setIp(e.target.value);
                      onHostChange?.(e.target.value);
                    }}
                    placeholder="192.168.88.1"
                    className="w-full h-12 bg-slate-950/80 border border-slate-700/80 focus:border-blue-500 rounded-xl text-center text-base text-white font-mono placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-10 transition-all"
                    required
                  />
                  <Globe className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                    {t.router_user}
                  </label>
                  <input 
                    name="user"
                    type="text" 
                    value={user}
                    onChange={(e) => {
                      setUser(e.target.value);
                      onUsernameChange?.(e.target.value);
                    }}
                    className="w-full h-12 bg-slate-950/80 border border-slate-700/80 focus:border-blue-500 rounded-xl text-center text-sm text-white font-mono placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-3 transition-all"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                    {t.router_pass}
                  </label>
                  <div className="relative">
                    <input 
                      ref={passInputRef}
                      name="pass"
                      type={showPass ? 'text' : 'password'} 
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      className="w-full h-12 bg-slate-950/80 border border-slate-700/80 focus:border-blue-500 rounded-xl text-center text-sm text-white font-mono placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-8 transition-all"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      aria-label={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                      title={showPass ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 px-1">
              <div className="flex items-center justify-between">
                <button 
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-blue-400 uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  <Settings size={13} />
                  {t.advanced_settings}
                </button>
              </div>

              {showAdvanced && (
                <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <p className="text-xs text-amber-400 font-medium leading-relaxed text-center">
                      {t.apk_warning}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.api_url_label}</label>
                        <button
                          type="button"
                          onClick={async () => {
                            setIsDiscovering(true);
                            try {
                              const { discoveryService } = await import('../services/discoveryService');
                              const discovered = await discoveryService.discoverServerUrl();
                              if (!isMountedRef.current) return;
                              if (discovered) {
                                setApiUrl(discovered);
                                safeStorage.setItem('zahir_api_url', discovered);
                                await testConnection(discovered);
                              } else {
                                setTestStatus('error');
                              }
                            } catch (e) {
                              console.error(e);
                              if (isMountedRef.current) setTestStatus('error');
                            } finally {
                              if (isMountedRef.current) setIsDiscovering(false);
                            }
                          }}
                          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase tracking-wider flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          <RefreshCw size={10} className={isDiscovering ? 'animate-spin' : ''} />
                          {lang === 'ar' ? 'جلب السيرفر تلقائياً' : 'Fetch Server Automatically'}
                        </button>
                      </div>
                      {testStatus !== 'idle' && (
                        <span className={`text-xs font-bold uppercase tracking-wider ${
                          testStatus === 'testing' ? 'text-blue-400' :
                          testStatus === 'success' ? 'text-emerald-400' :
                          'text-rose-400'
                        }`}>
                          {testStatus === 'testing' ? t.testing :
                           testStatus === 'success' ? t.connected :
                           t.connection_failed}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input 
                        type="url"
                        value={apiUrl}
                        onChange={handleApiUrlChange}
                        onBlur={() => testConnection(apiUrl)}
                        className={`w-full h-11 bg-slate-950/80 border rounded-xl text-xs text-white font-mono px-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-all ${
                          testStatus === 'success' ? 'border-emerald-500/50' :
                          testStatus === 'error' ? 'border-rose-500/50' : 'border-slate-700/80 focus:border-blue-500'
                        }`}
                        placeholder="https://your-domain.com"
                      />
                      <Server className={`absolute start-3 top-1/2 -translate-y-1/2 ${
                        testStatus === 'success' ? 'text-emerald-400' :
                        testStatus === 'error' ? 'text-rose-400' : 'text-slate-500'
                      } w-4 h-4`} />
                    </div>
                    {!isNative && (
                      <p className="text-xs text-slate-400 font-medium px-1 text-center mt-1">
                        {t.mobile_link_hint}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="space-y-1.5 text-start">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
                        {lang === 'ar' ? 'منفذ الـ API' : 'API Port'}
                      </label>
                      <input 
                        name="port"
                        type="number" 
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        min="1"
                        max="65535"
                        className="w-full h-10 bg-slate-950/80 border border-slate-700/80 focus:border-blue-500 rounded-xl text-center text-xs text-white font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-3"
                      />
                    </div>
                    <div className="space-y-1.5 text-start flex flex-col justify-end">
                      <label className="flex items-center gap-2 cursor-pointer py-2.5 px-3 bg-slate-950/40 border border-slate-700/50 rounded-xl hover:bg-slate-950/60 transition-colors">
                        <input 
                          type="checkbox" 
                          name="useSsl"
                          checked={useSsl}
                          onChange={(e) => setUseSsl(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-700"
                        />
                        <span className="text-xs font-bold text-slate-300">
                          {lang === 'ar' ? 'اتصال آمن (SSL)' : 'Secure (SSL)'}
                        </span>
                      </label>
                    </div>
                  </div>

                  {!useSsl && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-2 text-start">
                      <div className="flex items-start gap-2 text-xs text-amber-300 leading-relaxed">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                        <span>
                          {lang === 'ar'
                            ? 'تحذير: المنفذ 8728 غير مشفر وقد يكشف كلمة المرور على الشبكة. يُنصح بتفعيل api-ssl (8729).'
                            : 'Warning: Port 8728 is unencrypted. Switch to api-ssl (8729) for TLS encryption.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUseSsl(true);
                          setPort(8729);
                        }}
                        className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        {lang === 'ar' ? 'تبديل إلى api-ssl (8729)' : 'Use 8729'}
                      </button>
                    </div>
                  )}

                  {/* TLS Certificate Pinning (SHA-256) */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{lang === 'ar' ? 'تثبيت شهادة TLS (TOFU Certificate Pinning)' : 'TLS Certificate Pinning (SHA-256)'}</span>
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          name="strictTls"
                          checked={strictTls}
                          onChange={(e) => setStrictTls(e.target.checked)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700"
                        />
                        <span className="text-xs font-bold text-slate-300">
                          {lang === 'ar' ? 'تحقق صارم' : 'Strict TLS'}
                        </span>
                      </label>
                    </div>
                    <input
                      name="tlsFingerprint"
                      type="text"
                      value={tlsFingerprint}
                      onChange={(e) => setTlsFingerprint(e.target.value)}
                      dir="ltr"
                      placeholder="SHA-256 Fingerprint (e.g. AB:CD:12:34:...)"
                      className="w-full h-9 bg-slate-900/90 border border-slate-700/80 focus:border-emerald-500 rounded-lg text-xs text-emerald-300 font-mono placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 px-3 text-left"
                    />
                  </div>

                  {/* Operator RBAC Login (Required once operators exist) */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                    <div className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>
                        {needsInitialAdmin === false
                          ? (lang === 'ar' ? 'تسجيل دخول المشغل (إلزامي)' : 'Operator RBAC Credentials (Required)')
                          : (lang === 'ar' ? 'تسجيل دخول المشغل بصلاحيات محددة (RBAC)' : 'Operator RBAC Credentials')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        name="operatorUsername"
                        type="text"
                        value={operatorUsername}
                        onChange={(e) => setOperatorUsername(e.target.value)}
                        dir="ltr"
                        required={needsInitialAdmin === false}
                        placeholder={lang === 'ar' ? 'اسم المشغل (مثال: admin)' : 'Operator username'}
                        className="w-full h-9 bg-slate-900/90 border border-slate-700/80 focus:border-blue-500 rounded-lg text-xs text-white font-mono placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-3 text-center"
                      />
                      <input
                        name="operatorPassword"
                        type="password"
                        value={operatorPassword}
                        onChange={(e) => setOperatorPassword(e.target.value)}
                        dir="ltr"
                        required={needsInitialAdmin === false}
                        placeholder={lang === 'ar' ? 'كلمة مرور المشغل' : 'Operator password'}
                        className="w-full h-9 bg-slate-900/90 border border-slate-700/80 focus:border-blue-500 rounded-lg text-xs text-white font-mono placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 px-3 text-center"
                      />
                    </div>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-3 cursor-pointer group py-1">
                <div className="relative flex items-center justify-center">
                  <input 
                    type="checkbox" 
                    name="remember"
                    className="peer sr-only"
                    defaultChecked={safeStorage.getItem('zahir_remember_me') === 'true'}
                  />
                  <div className="w-5 h-5 border-2 border-slate-700 rounded-lg transition-all peer-checked:bg-blue-600 peer-checked:border-blue-600 group-hover:border-blue-500/50"></div>
                  <Lock className="absolute w-3 h-3 text-white scale-0 transition-transform peer-checked:scale-100" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">
                    {lang === 'ar' ? 'حفظ عنوان الراوتر واسم المستخدم (لا يتم حفظ كلمة المرور نهائياً للأمان)' : 'Remember Router IP & Username (Password is never stored for security)'}
                  </span>
                </div>
              </label>
            </div>

            {isLoading ? (
              <div className="flex gap-3">
                <div className="flex-1 h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 opacity-80">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{lang === 'ar' ? 'جاري تسجيل الدخول...' : 'Logging in...'}</span>
                </div>
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-6 h-14 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>{lang === 'ar' ? 'إلغاء' : 'Cancel'}</span>
                  </button>
                )}
              </div>
            ) : (
              <button 
                type="submit" 
                className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>{t.btn_connect}</span>
                <ChevronLeft className={`w-5 h-5 ${lang === 'en' ? 'rotate-180' : ''}`} />
              </button>
            )}

          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
