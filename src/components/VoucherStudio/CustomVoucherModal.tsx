import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X,
  Sparkles,
  CreditCard,
  User,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Printer,
  RefreshCw,
  Clock,
  Database,
  Tag,
  Wifi,
  Server
} from 'lucide-react';
import { VoucherItem } from './types';
import { secureFetch, safeParseJson } from '../../lib/api';
import { printHtmlSafely } from '../../lib/printHelper';
import { escapeHtml } from './voucherRenderCore';

interface CustomVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Array<{ id: string; name: string; price?: number; rateLimit?: string; [key: string]: any }>;
  hotspotProfiles?: Array<{ id: string; name: string; price?: number; rateLimit?: string; [key: string]: any }>;
  usermanProfiles?: Array<{ id: string; name: string; price?: number; rateLimit?: string; [key: string]: any }>;
  pppProfiles?: Array<{ id: string; name: string; price?: number; rateLimit?: string; [key: string]: any }>;
  isConnected: boolean;
  currencySymbol?: string;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onVoucherGenerated?: (voucher: VoucherItem) => void;
}

const TIME_PRESETS = [
  { label: 'ساعة واحدة', value: '1h' },
  { label: '3 ساعات', value: '3h' },
  { label: '12 ساعة', value: '12h' },
  { label: 'يوم كامل (24h)', value: '1d' },
  { label: 'أسبوع (7d)', value: '7d' },
  { label: 'شهر (30d)', value: '30d' },
  { label: 'غير محدود', value: '' }
];

const DATA_PRESETS = [
  { label: '500 MB', value: '500 MB' },
  { label: '1 GB', value: '1 GB' },
  { label: '2 GB', value: '2 GB' },
  { label: '5 GB', value: '5 GB' },
  { label: '10 GB', value: '10 GB' },
  { label: 'غير محدود', value: '' }
];

export const CustomVoucherModal: React.FC<CustomVoucherModalProps> = ({
  isOpen,
  onClose,
  profiles = [],
  hotspotProfiles = [],
  usermanProfiles = [],
  pppProfiles = [],
  isConnected,
  currencySymbol = 'ريال',
  showToast,
  onVoucherGenerated
}) => {
  // Form State
  const [serviceType, setServiceType] = useState<'HOTSPOT' | 'USERMAN' | 'PPPOE'>('HOTSPOT');
  const [code, setCode] = useState('');
  const [authMode, setAuthMode] = useState<'user_only' | 'user_pass' | 'user_equals_pass'>('user_only');
  const [pin, setPin] = useState('');

  // Active profiles list depending on selected service type
  const activeProfilesList = useMemo(() => {
    if (serviceType === 'USERMAN' && usermanProfiles.length > 0) return usermanProfiles;
    if (serviceType === 'PPPOE' && pppProfiles.length > 0) return pppProfiles;
    if (serviceType === 'HOTSPOT' && hotspotProfiles.length > 0) return hotspotProfiles;
    return profiles;
  }, [serviceType, usermanProfiles, pppProfiles, hotspotProfiles, profiles]);

  const [profileName, setProfileName] = useState(() => (profiles[0]?.name || 'default'));
  const [price, setPrice] = useState<number | string>(() => (profiles[0]?.price || 500));
  const [timeLimit, setTimeLimit] = useState('30d');
  const [dataLimit, setDataLimit] = useState('5 GB');
  const [comment, setComment] = useState('');
  const [autoSync, setAutoSync] = useState(isConnected);

  useEffect(() => {
    setAutoSync(isConnected);
  }, [isConnected]);

  // Sync profile when serviceType changes
  useEffect(() => {
    if (activeProfilesList.length > 0) {
      if (!activeProfilesList.some((p) => p.name === profileName)) {
        const first = activeProfilesList[0];
        setProfileName(first.name);
        if (first.price !== undefined) {
          setPrice(first.price);
        }
      }
    }
  }, [serviceType, activeProfilesList, profileName]);

  // Execution State
  const [loading, setLoading] = useState(false);
  const [generatedVoucher, setGeneratedVoucher] = useState<VoucherItem | null>(null);
  const [copied, setCopied] = useState(false);

  const isMountedRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const submitAbortRef = useRef<AbortController | null>(null);

  const trackTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      if (isMountedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      submitAbortRef.current?.abort();
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  if (!isOpen) return null;

  // Generate cryptographically secure random quick code using rejection sampling
  const handleGenerateRandomCode = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const maxValid = Math.floor(256 / chars.length) * chars.length;
    let result = '';
    const byteBuf = new Uint8Array(32);
    while (result.length < 6) {
      crypto.getRandomValues(byteBuf);
      for (let i = 0; i < byteBuf.length && result.length < 6; i++) {
        if (byteBuf[i] < maxValid) {
          result += chars.charAt(byteBuf[i] % chars.length);
        }
      }
    }
    setCode(result);
    if (authMode === 'user_pass' && !pin) {
      const range = 9000;
      const maxPinValid = Math.floor(65536 / range) * range;
      const pinBuf = new Uint16Array(8);
      let randomPin = 0;
      while (!randomPin) {
        crypto.getRandomValues(pinBuf);
        for (let i = 0; i < pinBuf.length; i++) {
          if (pinBuf[i] < maxPinValid) {
            randomPin = 1000 + (pinBuf[i] % range);
            break;
          }
        }
      }
      setPin(String(randomPin));
    }
  };

  // Submit generation
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode) {
      showToast('يرجى كتابة اسم المستخدم أو كود الكرت المخصص', 'error');
      return;
    }

    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    setLoading(true);
    try {
      const res = await secureFetch('/api/vouchers/generate-custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          code: cleanCode,
          pin: authMode === 'user_pass' ? (pin.trim() || cleanCode) : authMode === 'user_equals_pass' ? cleanCode : '',
          authMode,
          sameUserPass: authMode === 'user_equals_pass',
          profileName: profileName || 'default',
          price: Number(price) || 0,
          timeLimit: timeLimit.trim(),
          dataLimit: dataLimit.trim(),
          serviceType,
          comment: comment.trim() || `كرت مخصص [${cleanCode}]`,
          autoSync: isConnected && autoSync
        })
      });

      const data = (await safeParseJson(res)) || {};
      if (!isMountedRef.current) return;
      if (!res.ok || !data.success) {
        showToast(data.error || `فشل توليد الكرت المخصص (HTTP ${res.status})`, 'error');
        return;
      }

      showToast(data.message || 'تم توليد الكرت المخصص بنجاح', 'success');
      setGeneratedVoucher(data.voucher);
      window.dispatchEvent(new CustomEvent('zctrl:vouchers-changed'));

      if (onVoucherGenerated && data.voucher) {
        onVoucherGenerated(data.voucher);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || !isMountedRef.current) return;
      console.error('Custom voucher generation failed:', err);
      showToast(err.message || 'فشل الاتصال بالخادم لتوليد الكرت', 'error');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  // Quick Copy
  const handleCopyDetails = async () => {
    if (!generatedVoucher) return;
    const text = `بيانات الكرت المخصص:
اسم المستخدم: ${generatedVoucher.voucherCode}
${generatedVoucher.voucherPin ? `كلمة المرور: ${generatedVoucher.voucherPin}\n` : ''}البروفايل: ${generatedVoucher.profileName}
السعر: ${generatedVoucher.price} ${currencySymbol}
الصلاحية: ${generatedVoucher.timeLimit || 'غير محدود'}
البيانات: ${generatedVoucher.dataLimit || 'غير محدود'}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        showToast('تعذر النسخ إلى الحافظة', 'error');
        return;
      }
    }
    if (!isMountedRef.current) return;
    setCopied(true);
    showToast('تم نسخ بيانات الكرت إلى الحافظة', 'success');
    trackTimer(() => setCopied(false), 2000);
  };

  // Quick Print Single Voucher
  const handlePrintSingle = async () => {
    if (!generatedVoucher) return;

    const safeCode = escapeHtml(generatedVoucher.voucherCode);
    const safePin = escapeHtml(generatedVoucher.voucherPin);
    const safeProfile = escapeHtml(generatedVoucher.profileName);
    const safeTime = escapeHtml(generatedVoucher.timeLimit || 'مفتوح');
    const safeData = escapeHtml(generatedVoucher.dataLimit || 'مفتوح');
    const safePrice = escapeHtml(generatedVoucher.price);
    const safeCurrency = escapeHtml(currencySymbol);

    const html = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8" />
          <title>طباعة كرت مخصص - ${safeCode}</title>
          <style>
            body {
              font-family: 'Tajawal', 'Cairo', 'Segoe UI', Tahoma, sans-serif;
              margin: 0;
              padding: 20px;
              background: #f8fafc;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
            }
            .voucher-card {
              width: 85mm;
              height: 52mm;
              background: #0f172a;
              color: #f8fafc;
              border: 2px solid #3b82f6;
              border-radius: 12px;
              padding: 14px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-shadow: 0 10px 25px rgba(0,0,0,0.2);
              page-break-inside: avoid;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 1px solid rgba(255,255,255,0.1);
              padding-bottom: 6px;
            }
            .title { font-weight: 900; font-size: 14px; color: #60a5fa; }
            .price { font-weight: 900; font-size: 14px; color: #34d399; }
            .content { text-align: center; margin: 8px 0; }
            .code-box {
              background: #1e293b;
              border: 1px dashed #64748b;
              border-radius: 8px;
              padding: 6px 12px;
              font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
              font-size: 20px;
              font-weight: 900;
              letter-spacing: 2px;
              color: #facc15;
              display: inline-block;
            }
            .pin-box {
              font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
              font-size: 14px;
              color: #cbd5e1;
              margin-top: 4px;
            }
            .footer {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid rgba(255,255,255,0.1);
              padding-top: 6px;
            }
            @media print {
              body { background: transparent; padding: 0; }
              .voucher-card { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="voucher-card">
            <div class="header">
              <div class="title">كرت إنترنت مخصص</div>
              <div class="price">${safePrice} ${safeCurrency}</div>
            </div>
            <div class="content">
              <div class="code-box">${safeCode}</div>
              ${authMode === 'user_equals_pass' && generatedVoucher.voucherPin
                ? `<div class="pin-box">كلمة المرور: <strong style="color:#60a5fa;">${safePin}</strong> <span style="font-size:11px; color:#34d399;">(مطابقة لاسم المستخدم)</span></div>`
                : (generatedVoucher.voucherPin && generatedVoucher.voucherPin !== generatedVoucher.voucherCode
                    ? `<div class="pin-box">كلمة المرور: ${safePin}</div>`
                    : '')}
            </div>
            <div class="footer">
              <div>البروفايل: ${safeProfile}</div>
              <div>الوقت: ${safeTime}</div>
              <div>البيانات: ${safeData}</div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    await printHtmlSafely(html, {
      fileName: `voucher-${generatedVoucher.voucherCode}.html`,
      onFallbackDownload: () => {
        showToast('تم تحميل الكرت كملف HTML للطباعة', 'info');
      }
    });
  };

  const handleResetForAnother = () => {
    setGeneratedVoucher(null);
    setCode('');
    setPin('');
    setComment('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto" dir="rtl">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                توليد كرت مخصص (Custom Voucher)
              </h2>
              <p className="text-xs text-slate-400">
                إنشاء كرت باسم مستخدم مخصص مع فحص عدم التكرار وحقنه في المايكروتك فوراً
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {generatedVoucher ? (
            // Success Card View
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 space-y-3">
                <div className="flex items-center gap-2 font-bold text-base">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>تم توليد الكرت المخصص بنجاح وحفظه في النظام!</span>
                </div>
                {generatedVoucher.isSynced ? (
                  <p className="text-xs text-emerald-400/90 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    تم حقن الكرت بنجاح في جهاز المايكروتك الحي وهو جاهز لتسجيل الدخول فوراً.
                  </p>
                ) : (
                  <p className="text-xs text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    تم حفظ الكرت في قاعدة البيانات. لم تتم مزامنته تلقائياً أو أن الراوتر غير متصل.
                  </p>
                )}
              </div>

              {/* Card Credential Box */}
              <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="text-center space-y-2">
                  <div className="text-xs text-slate-400">اسم المستخدم / كود الدخول</div>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-amber-400 tracking-wider bg-slate-900 border border-slate-800 py-3 px-6 rounded-xl inline-block">
                    {generatedVoucher.voucherCode}
                  </div>
                </div>

                {authMode === 'user_equals_pass' && generatedVoucher.voucherPin ? (
                  <div className="text-center space-y-1">
                    <div className="text-xs text-emerald-400 font-bold">كلمة المرور (مطابقة لاسم المستخدم)</div>
                    <div className="text-lg font-mono font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 py-1.5 px-4 rounded-lg inline-block">
                      {generatedVoucher.voucherPin}
                    </div>
                  </div>
                ) : generatedVoucher.voucherPin && generatedVoucher.voucherPin !== generatedVoucher.voucherCode ? (
                  <div className="text-center space-y-1">
                    <div className="text-xs text-slate-400">كلمة المرور</div>
                    <div className="text-lg font-mono font-bold text-slate-200 bg-slate-900/80 border border-slate-800 py-1.5 px-4 rounded-lg inline-block">
                      {generatedVoucher.voucherPin}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-3 border-t border-slate-800 text-slate-300">
                  <div className="bg-slate-900/70 p-2.5 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">البروفايل:</span>
                    <strong className="font-semibold text-white">{generatedVoucher.profileName}</strong>
                  </div>
                  <div className="bg-slate-900/70 p-2.5 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">السعر:</span>
                    <strong className="font-semibold text-emerald-400">{generatedVoucher.price} {currencySymbol}</strong>
                  </div>
                  <div className="bg-slate-900/70 p-2.5 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">الصلاحية:</span>
                    <strong className="font-semibold text-white">{generatedVoucher.timeLimit || 'مفتوح'}</strong>
                  </div>
                  <div className="bg-slate-900/70 p-2.5 rounded-lg">
                    <span className="text-slate-500 block text-[10px]">البيانات:</span>
                    <strong className="font-semibold text-white">{generatedVoucher.dataLimit || 'مفتوح'}</strong>
                  </div>
                </div>
              </div>

              {/* Action Buttons for Generated Voucher */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyDetails}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-blue-400" />
                    <span>{copied ? 'تم النسخ!' : 'نسخ البيانات'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintSingle}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-500/20"
                  >
                    <Printer className="w-4 h-4" />
                    <span>طباعة الكرت الآن</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetForAnother}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>توليد كرت مخصص آخر</span>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Form View
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Service Type Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">نظام الخدمة في المايكروتك</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'HOTSPOT', label: 'الهوتسبوت (Hotspot)', icon: Wifi },
                    { key: 'USERMAN', label: 'يوزر مانجر (User Manager)', icon: Database },
                    { key: 'PPPOE', label: 'برودباند (PPPoE)', icon: Server }
                  ].map((srv) => {
                    const Icon = srv.icon;
                    const isSelected = serviceType === srv.key;
                    return (
                      <button
                        key={srv.key}
                        type="button"
                        onClick={() => setServiceType(srv.key as any)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/60 text-amber-400 shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`} />
                        <span>{srv.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Username / Custom Code & Auth Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-400" />
                      <span>اسم المستخدم / الكود المخصص *</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomCode}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer"
                    >
                      كود عشوائي
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="مثال: VIP-Ahmed أو 771234"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 block">طريقة تسجيل الدخول وكلمة المرور</label>
                    <span className="text-[10px] text-emerald-400 font-bold">متوافق مع RouterOS</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode('user_equals_pass')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                        authMode === 'user_equals_pass'
                          ? 'bg-gradient-to-r from-emerald-600/30 to-indigo-600/30 border-emerald-400 text-white font-black ring-1 ring-emerald-500'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🔑 الاسم = كلمة المرور</span>
                      <span className="text-[9px] text-emerald-400 font-normal">مطابق 100% للمايكروتك</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('user_only')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                        authMode === 'user_only'
                          ? 'bg-blue-600/20 border-blue-500/60 text-blue-300 font-black'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🎫 كود موحد فقط</span>
                      <span className="text-[9px] text-slate-500 font-normal">خانة واحدة فقط</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('user_pass')}
                      className={`py-2 px-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-0.5 ${
                        authMode === 'user_pass'
                          ? 'bg-blue-600/20 border-blue-500/60 text-blue-300 font-black'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🔐 كلمة سر مستقلة</span>
                      <span className="text-[9px] text-slate-500 font-normal">باسورد مختلف</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Password indicator when user_equals_pass */}
              {authMode === 'user_equals_pass' && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>كلمة المرور ستكون مطابقة تماماً لاسم المستخدم: <strong className="font-mono text-amber-300 font-bold">{code || '(سيتم توليده تلقائياً)'}</strong></span>
                  </div>
                  <span className="text-[10px] bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded border border-emerald-700 font-bold shrink-0">
                    دخول سريع
                  </span>
                </div>
              )}

              {/* Password field if user_pass */}
              {authMode === 'user_pass' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>كلمة المرور المخصصة</span>
                  </label>
                  <input
                    type="text"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="أدخل كلمة المرور أو اتركها فارغة لتوليد رقم عشوائي"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              )}

              {/* Profile & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-indigo-400" />
                    <span>البروفايل / باقة السرعة *</span>
                  </label>
                  <select
                    value={profileName}
                    onChange={(e) => {
                      const selected = e.target.value;
                      setProfileName(selected);
                      const found = activeProfilesList.find((p) => p.name === selected);
                      if (found && found.price !== undefined) {
                        setPrice(found.price);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                  >
                    {activeProfilesList.map((p) => (
                      <option key={p.id || p.name} value={p.name}>
                        {p.name} {p.rateLimit ? `(${p.rateLimit})` : ''} {p.price ? `- ${p.price} ${currencySymbol}` : ''}
                      </option>
                    ))}
                    {!activeProfilesList.some((p) => p.name === 'default') && (
                      <option value="default">default (الافتراضي)</option>
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
                    <span>سعر الكرت ({currencySymbol})</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="500"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>

              {/* Time Limit Presets */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>مدة الصلاحية (الوقت)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setTimeLimit(preset.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        timeLimit === preset.value
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  placeholder="صلاحية مخصصة (مثال: 5h أو 15d)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors mt-1"
                />
              </div>

              {/* Data Quota Presets */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>حصة البيانات (جيجابايت / ميجابايت)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DATA_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDataLimit(preset.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                        dataLimit === preset.value
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={dataLimit}
                  onChange={(e) => setDataLimit(e.target.value)}
                  placeholder="حصة مخصصة (مثال: 750 MB أو 15 GB)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors mt-1"
                />
              </div>

              {/* Comment / Customer Note */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">ملاحظة / اسم العميل (اختياري)</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="مثال: كرت VIP خاص بالزبون محمد صالح"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Auto Sync Toggle */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    المزامنة والحقن الفوري بالمايكروتك
                  </span>
                  <p className="text-[11px] text-slate-400">
                    {isConnected
                      ? 'سيتم فحص الكود بالمايكروتك وحقنه فوراً ليصبح جاهزاً للاتصال'
                      : 'الراوتر غير متصل حالياً؛ سيتم حفظ الكرت في قاعدة البيانات للمزامنة لاحقاً'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                    disabled={!isConnected}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={loading || !code.trim()}
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                      <span>جاري التحقق والتوليد...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-slate-950" />
                      <span>توليد الكرت وحفظه الآن</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
