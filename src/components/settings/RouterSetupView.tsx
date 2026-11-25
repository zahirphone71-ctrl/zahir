import React, { useState, useEffect, useRef } from 'react';
import { 
  Server, 
  CheckCircle, 
  RefreshCw, 
  AlertCircle, 
  Play, 
  Shield, 
  Wifi, 
  Network, 
  KeyRound, 
  Clock, 
  AlertTriangle,
  Zap,
  HelpCircle,
  Layers,
  ChevronDown
} from 'lucide-react';
import { useMikroTik } from '../../context/MikroTikContext';
import { secureFetch } from '../../lib/api';
import { safeStorage } from '../../utils/safeStorage';

interface CheckDetail {
  name: string;
  category: string;
  status: 'ok' | 'missing' | 'warning';
  message: string;
}

interface CheckResult {
  success: boolean;
  message: string;
  summary?: {
    total: number;
    ok: number;
    missing: number;
  };
  details?: CheckDetail[];
}

export const RouterSetupView: React.FC = () => {
  const { isConnected, router, showToast } = useMikroTik();

  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<'check' | 'update' | 'apply' | null>(null);
  const [results, setResults] = useState<CheckResult | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const isMountedRef = useRef(true);
  const actionAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      actionAbortRef.current?.abort();
    };
  }, []);

  const [config, setConfig] = useState({
    wanInterface: 'ether1',
    lanBridge: 'bridge1',
    ssid: 'Al-afia -Net',
    wanIp: '192.168.1.20/24',
    gateway: '192.168.1.1',
    radiusSecret: '2026',
    timeZone: 'Asia/Riyadh'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAction = async (type: 'check' | 'update' | 'apply') => {
    if (!isConnected) {
      showToast('يرجى الاتصال بالراوتر أولاً لتطبيق هذه العملية', 'error');
      return;
    }

    actionAbortRef.current?.abort();
    const controller = new AbortController();
    actionAbortRef.current = controller;

    setLoading(true);
    setAction(type);
    setResults(null);

    try {
      const activeToken = safeStorage.getItem('zcontrol_active_token') || safeStorage.getItem('zahir_auth_token');
      const res = await secureFetch(`/api/mikrotik/setup/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { 'X-Router-Token': activeToken } : {})
        },
        body: JSON.stringify(config),
        signal: controller.signal
      });

      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;

      const normalized: CheckResult = {
        ...data,
        success: Boolean(res.ok && data?.success),
        message: data?.message || (res.ok ? 'تمت العملية بنجاح' : `فشلت العملية (${res.status})`)
      };
      setResults(normalized);

      if (normalized.success) {
        showToast(normalized.message, 'success');
      } else {
        showToast(normalized.message, 'error');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      const errMsg = err?.message || 'تعذر الاتصال بالخادم الداخلي';
      setResults({ success: false, message: errMsg });
      showToast(errMsg, 'error');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const okCount = results?.summary?.ok ?? 0;
  const totalCount = results?.summary?.total ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((okCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Connection Notice */}
      {!isConnected && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3 text-amber-300">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="text-xs">
            <span className="font-bold">تنبيه: أنت غير متصل بالمايكروتك حالياً!</span>
            <p className="mt-0.5 text-amber-400/80">
              يرجى تسجيل الدخول للراوتر أولاً حتى تتمكن أداة التجهيز التلقائي من فحص وتطبيق الإعدادات مباشرة.
            </p>
          </div>
        </div>
      )}

      {/* Router Info Header if connected */}
      {isConnected && router && (
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-200">{router.name || 'MikroTik Router'}</div>
              <div className="text-[11px] text-slate-400">{router.host} • إصدار {router.version || 'RouterOS'}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-400 font-bold text-[11px] border border-emerald-500/30">
              متصل ومصادق كمدير
            </span>
          </div>
        </div>
      )}

      {/* Form Fields Card */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>معايير الضبط التلقائي للشبكة</span>
          </h3>
          <span className="text-[11px] text-slate-500">قابلة للتعديل حسب شبكتك</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* WAN Interface */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-blue-400" />
              <span>منفذ الإنترنت (WAN)</span>
            </label>
            <input 
              type="text" 
              name="wanInterface" 
              value={config.wanInterface} 
              onChange={handleChange} 
              placeholder="ether1"
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" 
              dir="ltr"
            />
          </div>

          {/* LAN Bridge */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span>بريدج الخروج (LAN Bridge)</span>
            </label>
            <input 
              type="text" 
              name="lanBridge" 
              value={config.lanBridge} 
              onChange={handleChange} 
              placeholder="bridge1"
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" 
              dir="ltr"
            />
          </div>

          {/* Wi-Fi SSID */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-amber-400" />
              <span>اسم شبكة الواي فاي (SSID)</span>
            </label>
            <input 
              type="text" 
              name="ssid" 
              value={config.ssid} 
              onChange={handleChange} 
              placeholder="شبكتي - Hotspot"
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" 
            />
          </div>

          {/* WAN IP */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5 text-purple-400" />
              <span>آي بي الإنترنت للراوتر (WAN IP)</span>
            </label>
            <input 
              type="text" 
              name="wanIp" 
              value={config.wanIp} 
              onChange={handleChange} 
              placeholder="192.168.1.20/24"
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" 
              dir="ltr"
            />
          </div>

          {/* Gateway */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span>بوابة الراوتر للمودم (Gateway)</span>
            </label>
            <input 
              type="text" 
              name="gateway" 
              value={config.gateway} 
              onChange={handleChange} 
              placeholder="192.168.1.1"
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" 
              dir="ltr"
            />
          </div>

          {/* Radius Secret */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-rose-400" />
              <span>كلمة سر الراديوس المشتركة</span>
            </label>
            <input 
              type="text" 
              name="radiusSecret" 
              value={config.radiusSecret} 
              onChange={handleChange} 
              placeholder="2026"
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" 
              dir="ltr"
            />
          </div>

          {/* Time Zone */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>المنطقة الزمنية (Time Zone)</span>
            </label>
            <select
              name="timeZone"
              value={config.timeZone}
              onChange={handleChange}
              className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
              dir="ltr"
            >
              <option value="Asia/Riyadh">Asia/Riyadh (+03:00)</option>
              <option value="Asia/Baghdad">Asia/Baghdad (+03:00)</option>
              <option value="Asia/Kuwait">Asia/Kuwait (+03:00)</option>
              <option value="Africa/Cairo">Africa/Cairo (+02:00)</option>
              <option value="Asia/Dubai">Asia/Dubai (+04:00)</option>
              <option value="Asia/Amman">Asia/Amman (+03:00)</option>
              <option value="Asia/Damascus">Asia/Damascus (+03:00)</option>
              <option value="Africa/Khartoum">Africa/Khartoum (+02:00)</option>
              <option value="Africa/Tripoli">Africa/Tripoli (+02:00)</option>
              <option value="Africa/Algiers">Africa/Algiers (+01:00)</option>
              <option value="Africa/Casablanca">Africa/Casablanca (+01:00)</option>
              <option value="Asia/Aden">Asia/Aden (+03:00)</option>
              <option value="UTC">UTC (+00:00)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center gap-3">
        {/* 1. Check Button */}
        <button
          type="button"
          onClick={() => handleAction('check')}
          disabled={loading || !isConnected}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading && action === 'check' ? (
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
          ) : (
            <Shield className="w-4 h-4 text-blue-400" />
          )}
          <span>فحص الراوتر ومقارنة الإعدادات</span>
        </button>

        {/* 2. Update Button */}
        <button
          type="button"
          onClick={() => handleAction('update')}
          disabled={loading || !isConnected}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
        >
          {loading && action === 'update' ? (
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
          ) : (
            <RefreshCw className="w-4 h-4 text-amber-400" />
          )}
          <span>تطبيق وتحديث الإعدادات الناقصة</span>
        </button>

        {/* 3. Full Setup Button */}
        <button
          type="button"
          onClick={() => setShowConfirmModal(true)}
          disabled={loading || !isConnected}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer mr-auto"
        >
          {loading && action === 'apply' ? (
            <RefreshCw className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Play className="w-4 h-4 text-white" />
          )}
          <span>ضبط راوتر جديد بالكامل (من الصفر)</span>
        </button>
      </div>

      {/* Progress & Results Area */}
      {results && (
        <div className={`p-5 rounded-xl border ${
          results.success 
            ? 'bg-slate-950/80 border-slate-800' 
            : 'bg-red-950/20 border-red-900/40'
        }`}>
          {/* Header Message */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2.5">
              {results.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              )}
              <div>
                <h4 className={`text-xs font-bold ${results.success ? 'text-slate-100' : 'text-red-300'}`}>
                  {results.message}
                </h4>
                {results.summary && (
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    اكتملت {results.summary.ok} من أصل {results.summary.total} عناصر فحص أساسية
                  </p>
                )}
              </div>
            </div>

            {results.summary && (
              <div className="text-left shrink-0">
                <span className={`text-sm font-black ${
                  progressPercent === 100 ? 'text-emerald-400' : progressPercent >= 70 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {progressPercent}%
                </span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {results.summary && (
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mt-3">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  progressPercent === 100 ? 'bg-emerald-500' : progressPercent >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}

          {/* Detailed items */}
          {results.details && results.details.length > 0 && (
            <div className="space-y-2 mt-4 max-h-80 overflow-y-auto pr-1">
              {results.details.map((detail, idx) => (
                <div 
                  key={idx} 
                  className="flex items-start justify-between gap-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 text-xs"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    {detail.status === 'ok' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-slate-200 flex items-center gap-2">
                        <span>{detail.name}</span>
                        <span className="text-[10px] font-normal px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded">
                          {detail.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {detail.message}
                      </p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    detail.status === 'ok' 
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                  }`}>
                    {detail.status === 'ok' ? 'جاهز' : 'مفقود'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-100">
                تأكيد ضبط الراوتر من البداية
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                هذا الخيار معد لتهيئة وتجهيز راوتر مايكروتك جديد (أو بعد تصفير الـ Reset) وتطبيق بنية الهوتسبوت، البريدج، عناوين IP، جدار الحماية، وقواعد اليوزر منجر والراديوس بالكامل.
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <div className="font-bold text-amber-400">القيم التي سيتم ضبطها:</div>
              <div>• البريدج: <span className="text-white font-mono">{config.lanBridge}</span></div>
              <div>• آي بي الدخول: <span className="text-white font-mono">10.0.0.1/22</span></div>
              <div>• اسم الواي فاي: <span className="text-white">{config.ssid}</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  handleAction('apply');
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                متابعة وتطبيق الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
