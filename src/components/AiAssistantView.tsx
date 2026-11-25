import React, { useState, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { secureFetch } from '../lib/api';
import { SystemIntelligenceService, SystemHealth } from '../services/systemIntelligence';
import {
  Bot,
  Sparkles,
  Send,
  Copy,
  Terminal,
  Shield,
  Zap,
  CheckCircle,
  HelpCircle,
  Cpu,
  Layers,
  ArrowRight,
  Activity,
  AlertTriangle,
  RefreshCw,
  Gauge
} from 'lucide-react';

export const AiAssistantView: React.FC<{ onNavigateToTerminal: () => void }> = ({ onNavigateToTerminal }) => {
  const { router, users, profiles, showToast, runCommand } = useMikroTik();

  const [inputPrompt, setInputPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: `أهلاً بك! أنا مهندس وخبير شبكات ZCtrl الذكي (MikroTik AI Engineer).

أنا متصل حالياً بسيرفرك **(${router?.name || 'MikroTik Core'})** ومستعد لمساعدتك في:
- توليد سكربتات حماية الفايروول ضد الـ Netcut والهجمات
- إعداد دمج خطين أو أكثر (PCC Load Balancing)
- تسريع الألعاب وحل مشاكل بطء التصفح (QoS Queues)
- أتمتة حذف الكروت المنتهية وصيانة الهوتسبوت

اختر موضوعاً من المقترحات أدناه أو اسألني أي سؤال مباشرة!`
    }
  ]);

  // AI System Intelligence States
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [qosStatus, setQosStatus] = useState<'idle' | 'optimizing' | 'success' | 'error'>('idle');
  const [healingStatus, setHealingStatus] = useState<'idle' | 'healing' | 'success' | 'error'>('idle');
  const [turboEnabled, setTurboEnabled] = useState(false);
  const [togglingTurbo, setTogglingTurbo] = useState(false);

  const isMountedRef = useRef(true);
  const chatAbortRef = useRef<AbortController | null>(null);
  const healthReqIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      chatAbortRef.current?.abort();
    };
  }, []);

  const getConnectionConfig = () => {
    if (!router) return null;
    return {
      ip: router.host,
      user: router.username,
      host: router.host,
      port: router.port,
      username: router.username,
      useSsl: router.useSsl,
      name: router.name
    };
  };

  const fetchHealth = async () => {
    const config = getConnectionConfig();
    if (!config) return;
    const reqId = ++healthReqIdRef.current;
    setLoadingHealth(true);
    try {
      const [res, turboStatus] = await Promise.all([
        SystemIntelligenceService.getSystemHealth(config, 'ar'),
        SystemIntelligenceService.getTurboModeStatus(config)
      ]);
      if (!isMountedRef.current || reqId !== healthReqIdRef.current) return;
      setHealth(res);
      setTurboEnabled(turboStatus);
    } catch (e) {
      console.error(e);
    } finally {
      if (isMountedRef.current && reqId === healthReqIdRef.current) {
        setLoadingHealth(false);
      }
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [router]);

  const handleOptimizeQoS = async () => {
    const config = getConnectionConfig();
    if (!config || qosStatus === 'optimizing') return;
    setQosStatus('optimizing');
    try {
      const success = await SystemIntelligenceService.applyDynamicQoS(config);
      if (!isMountedRef.current) return;
      if (success) {
        setQosStatus('success');
        showToast('تم تطبيق التوزيع الديناميكي PCQ وتحسين أولويات الشبكة بنجاح!', 'success');
      } else {
        setQosStatus('error');
        showToast('فشل تطبيق تحسين السرعات PCQ.', 'error');
      }
    } catch {
      if (!isMountedRef.current) return;
      setQosStatus('error');
      showToast('حدث خطأ أثناء تطبيق التوزيع الديناميكي PCQ.', 'error');
    }
  };

  const handleSelfHealing = async () => {
    const config = getConnectionConfig();
    if (!config || healingStatus === 'healing') return;
    setHealingStatus('healing');
    try {
      const success = await SystemIntelligenceService.performSelfHealing(config);
      if (!isMountedRef.current) return;
      if (success) {
        setHealingStatus('success');
        showToast('تمت عملية الصيانة الذاتية وتنظيف ملفات الارتباط المنتهية بنجاح!', 'success');
        fetchHealth();
      } else {
        setHealingStatus('error');
        showToast('فشلت عملية الصيانة الذاتية.', 'error');
      }
    } catch {
      if (!isMountedRef.current) return;
      setHealingStatus('error');
      showToast('حدث خطأ أثناء تنفيذ الصيانة الذاتية.', 'error');
    }
  };

  const handleToggleTurbo = async () => {
    const config = getConnectionConfig();
    if (!config || togglingTurbo) return;
    const nextState = !turboEnabled;
    setTogglingTurbo(true);
    try {
      const success = await SystemIntelligenceService.toggleTurboMode(config, nextState);
      if (!isMountedRef.current) return;
      if (success) {
        setTurboEnabled(nextState);
        showToast(nextState ? 'تم تفعيل الوضع النفاث (Turbo Fasttrack) بنجاح!' : 'تم إلغاء تفعيل الوضع النفاث.', 'success');
      } else {
        showToast('فشل تغيير حالة الوضع النفاث.', 'error');
      }
    } catch {
      if (isMountedRef.current) showToast('خطأ أثناء تعديل إعدادات المعالجة.', 'error');
    } finally {
      if (isMountedRef.current) setTogglingTurbo(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    if (loading) return;
    const prompt = (textToSend || inputPrompt).trim();
    if (!prompt) return;

    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;

    const newMsgs = [...messages, { role: 'user' as const, text: prompt }];
    setMessages(newMsgs);
    setInputPrompt('');
    setLoading(true);

    try {
      const res = await secureFetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!isMountedRef.current) return;

      if (res.ok && data.success && data.reply) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', ...(typeof data.reply === 'string' ? { text: data.reply } : data.reply) }
        ]);
      } else {
        const errMsg = data?.message || `تعذر الحصول على رد من المساعد الذكي (${res.status})`;
        setMessages((prev) => [...prev, { role: 'assistant', text: `⚠️ ${errMsg}` }]);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || !isMountedRef.current) return;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: '⚠️ تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى.' }
      ]);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const presetQuestions = [
    'اعطني سكربت حماية ZCtrl من برامج قطع النت Netcut وهجمات ARP Poisoning',
    'كيف أقوم بحذف كروت الهوتسبوت المنتهية تلقائياً كل 24 ساعة؟',
    'أريد سكربت لتحسين سرعة التصفح وتقديم أولوية البينج للألعاب كـ PUBG و Valorant',
    'سكربت دمج خطين إنترنت بتقنية PCC Load Balancing مع Failover'
  ];

  return (
    <div className="space-y-6 flex flex-col">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
          <Sparkles className="w-6 h-6 text-purple-400" />
          <span>المساعد الذكي لشبكات وسيرفرات ZCtrl (AI Network Assistant)</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-semibold">
            GEMINI ENGINE
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          تحليل مباشر لمشاكل الشبكة، توليد سكربتات RouterOS جاهزة للنسخ والتنفيذ، وتقديم نصائح الأمان والسرعة
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main AI Assistant chat (2 columns on lg) */}
        <div className="lg:col-span-2 space-y-6 flex flex-col">
          {/* Suggested Questions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {presetQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => handleSend(q)}
                className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/40 rounded-xl text-right text-xs text-slate-300 transition-all flex flex-col justify-between group disabled:opacity-50 cursor-pointer"
              >
                <span className="group-hover:text-purple-300 font-medium leading-relaxed">{q}</span>
                <div className="mt-2 text-[10px] text-purple-400 flex items-center gap-1">
                  <span>توليد السكربت</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 space-y-4 overflow-y-auto min-h-[380px] max-h-[500px]">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 ${
                  m.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`p-2.5 rounded-xl shrink-0 ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20'
                  }`}
                >
                  {m.role === 'user' ? <Shield className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                <div
                  className={`p-4 rounded-2xl max-w-2xl text-xs leading-relaxed space-y-2 ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tl-none font-medium'
                      : 'bg-slate-950/80 text-slate-200 border border-slate-800 rounded-tr-none'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-3 text-xs text-purple-300 animate-pulse">
                <div className="p-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30">
                  <Bot className="w-4 h-4 text-purple-400" />
                </div>
                <span>جاري تحليل إعدادات ZCtrl وتوليد الحل...</span>
              </div>
            )}
          </div>

          {/* Input bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-2xl p-2 shadow-xl"
          >
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="اسأل مهندس ZCtrl الذكي عن أي سكربت أو مشكلة في شبكتك..."
              className="flex-1 bg-transparent border-none text-xs text-slate-100 placeholder-slate-500 focus:outline-none px-3"
            />
            <button
              type="submit"
              disabled={loading || !inputPrompt.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-purple-600/25 transition-all disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>إرسال</span>
            </button>
          </form>
        </div>

        {/* AI Operations Center (1 column) */}
        <div className="space-y-6">
          {/* Diagnostic Stats Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>تحليل الأداء الذكي (AI Health)</span>
              </h2>
              <button 
                onClick={fetchHealth} 
                disabled={loadingHealth}
                className="p-1 hover:bg-slate-800 rounded transition-colors"
                title="تحديث البيانات"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${loadingHealth ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingHealth ? (
              <div className="space-y-3 py-4 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-2/3" />
                <div className="h-3 bg-slate-800 rounded w-full" />
                <div className="h-3 bg-slate-800 rounded w-5/6" />
              </div>
            ) : health ? (
              <div className="space-y-4">
                {/* Security Score */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-300">مستوى الأمان والتحصين</span>
                    <span className={health.securityScore > 80 ? 'text-emerald-400' : 'text-amber-400'}>
                      {health.securityScore} / 100
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${health.securityScore > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${health.securityScore}%` }}
                    />
                  </div>
                </div>

                {/* Resource Stats */}
                <div className="grid grid-cols-2 gap-3.5 pt-1">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block mb-0.5">استهلاك CPU</span>
                    <span className="text-xs font-bold text-slate-200 font-mono">{health.cpuUsage}%</span>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block mb-0.5">استهلاك RAM</span>
                    <span className="text-xs font-bold text-slate-200 font-mono">{health.memoryUsage}%</span>
                  </div>
                </div>

                {/* Recommendations */}
                {health.recommendations.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>توصيات الذكاء الاصطناعي:</span>
                    </span>
                    <ul className="space-y-1">
                      {health.recommendations.map((rec, i) => (
                        <li key={i} className="text-[11px] text-slate-300 bg-slate-950/40 p-2 rounded border border-slate-800/50 leading-relaxed">
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-3 text-center">لا توجد بيانات تشخيصية متاحة حالياً.</p>
            )}
          </div>

          {/* Quick AI Operations Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Zap className="w-4 h-4 text-purple-400" />
              <span>التحكم والمحسنات السريعة (AI Optimize)</span>
            </h2>

            <div className="space-y-3 pt-1">
              {/* QoS PCQ Dynamic Optimizer */}
              <button
                onClick={handleOptimizeQoS}
                disabled={qosStatus === 'optimizing'}
                className="w-full flex items-center justify-between p-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-purple-500/30 rounded-xl transition-all cursor-pointer text-right group disabled:opacity-50"
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block group-hover:text-purple-300 transition-colors">
                    توزيع السرعات العادل PCQ
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    يضمن تقسيم السرعة بعدل وتلقائية بين المستخدمين
                  </span>
                </div>
                <div className="shrink-0 p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <Gauge className={`w-4 h-4 text-purple-400 ${qosStatus === 'optimizing' ? 'animate-spin' : ''}`} />
                </div>
              </button>

              {/* Self Healing */}
              <button
                onClick={handleSelfHealing}
                disabled={healingStatus === 'healing'}
                className="w-full flex items-center justify-between p-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/30 rounded-xl transition-all cursor-pointer text-right group disabled:opacity-50"
              >
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block group-hover:text-emerald-300 transition-colors">
                    الصيانة الذاتية التلقائية
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    تنظيف الملفات المؤقتة وإلغاء ارتباطات المتصفح المنتهية
                  </span>
                </div>
                <div className="shrink-0 p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <Activity className={`w-4 h-4 text-emerald-400 ${healingStatus === 'healing' ? 'animate-spin' : ''}`} />
                </div>
              </button>

              {/* Turbo Mode Toggle */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-200 block">
                    الوضع النفاث (Turbo Fasttrack)
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    تجاوز المعالجة الزائدة لتسريع التحميل والتصفح 10x
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleTurbo}
                  disabled={togglingTurbo}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                    turboEnabled ? 'bg-purple-600' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      turboEnabled ? '-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
