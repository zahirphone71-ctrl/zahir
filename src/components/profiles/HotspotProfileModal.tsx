import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Zap,
  Clock,
  HardDrive,
  Users,
  DollarSign,
  Terminal,
  Shield,
  Layers,
  Sparkles,
  Radio,
  FileCode,
  CheckCircle2,
  Info,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { HotspotProfile } from '../../types/mikrotik';
import { ProfileConfirmSaveModal } from './ProfileConfirmSaveModal';
import { ValidityDurationPicker } from './ValidityDurationPicker';
import { formatDurationArabic, parseMikrotikDuration } from '../../lib/formatters';

interface HotspotProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    profile: any,
    signal?: AbortSignal
  ) => Promise<{ success: boolean; message?: string }>;
  initialProfile?: HotspotProfile | null;
  existingProfiles: HotspotProfile[];
}

export const HotspotProfileModal: React.FC<HotspotProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
  existingProfiles
}) => {
  const isEditing = !!initialProfile && !!initialProfile.id && initialProfile.id.trim() !== '';

  // Active Tab State
  const [activeTab, setActiveTab] = useState<'general' | 'queue' | 'advertise' | 'scripts' | 'security' | 'billing'>('general');

  // Form Fields - Full Winbox Parameters
  const [name, setName] = useState('');
  const [addressPool, setAddressPool] = useState('');
  const [changeAddressPool, setChangeAddressPool] = useState(false);
  const [idleTimeout, setIdleTimeout] = useState('00:05:00');
  const [keepaliveTimeout, setKeepaliveTimeout] = useState('00:02:00');
  const [statusAutorefresh, setStatusAutorefresh] = useState('00:01:00');
  const [sharedUsers, setSharedUsers] = useState<number>(1);
  const [startsAt, setStartsAt] = useState<'first-login' | 'at-creation'>('first-login');
  const [rateLimit, setRateLimit] = useState('2M/5M');
  const [sessionTimeout, setSessionTimeout] = useState('00:00:00');
  const [macCookieTimeout, setMacCookieTimeout] = useState('3d 00:00:00');
  const [openStatusPage, setOpenStatusPage] = useState<'always' | 'http-login'>('always');
  const [transparentProxy, setTransparentProxy] = useState<boolean>(false);

  // Queue tab
  const [parentQueue, setParentQueue] = useState('none');
  const [queueType, setQueueType] = useState('default');
  const [insertQueueBefore, setInsertQueueBefore] = useState('none');

  // Advertise tab
  const [advertise, setAdvertise] = useState(false);
  const [advertiseUrl, setAdvertiseUrl] = useState('');
  const [advertiseInterval, setAdvertiseInterval] = useState('00:30:00');
  const [advertiseTimeout, setAdvertiseTimeout] = useState('00:00:10');

  // Scripts tab
  const [onLoginScript, setOnLoginScript] = useState('');
  const [onLogoutScript, setOnLogoutScript] = useState('');

  // Security & Filter
  const [incomingFilter, setIncomingFilter] = useState('');
  const [outgoingFilter, setOutgoingFilter] = useState('');
  const [addressList, setAddressList] = useState('');

  // Billing & Quota
  const [price, setPrice] = useState<number>(0);
  const [validity, setValidity] = useState<string>('');
  const [dataQuotaMb, setDataQuotaMb] = useState<number>(0);

  // Advanced Queue / Burst states
  const [burstLimit, setBurstLimit] = useState('');
  const [burstThreshold, setBurstThreshold] = useState('');
  const [burstTime, setBurstTime] = useState('');
  const [priority, setPriority] = useState('');
  const [limitAt, setLimitAt] = useState('');

  // Error & Confirmation State
  const [formError, setFormError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeAbortCtrlRef = useRef<AbortController | null>(null);
  const formScrollRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (formError && formScrollRef.current) {
      formScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [formError]);

  useEffect(() => {
    if (!isOpen && activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort();
      activeAbortCtrlRef.current = null;
    }
    return () => {
      if (activeAbortCtrlRef.current) {
        activeAbortCtrlRef.current.abort();
        activeAbortCtrlRef.current = null;
      }
    };
  }, [isOpen]);

  // Discovered address pools from existing profiles
  const availablePools = useMemo(() => {
    return Array.from(new Set(existingProfiles.map(p => p.addressPool).filter(Boolean))) as string[];
  }, [existingProfiles]);

  useEffect(() => {
    if (initialProfile) {
      setName(initialProfile.name || '');
      setAddressPool(initialProfile.addressPool || '');
      setChangeAddressPool(false);
      setIdleTimeout(initialProfile.idleTimeout || '00:05:00');
      setKeepaliveTimeout(initialProfile.keepaliveTimeout || '00:02:00');
      setStatusAutorefresh(initialProfile.statusAutorefresh || '00:01:00');
      setSharedUsers(initialProfile.sharedUsers ?? 1);
      setStartsAt(initialProfile.startsAt === 'at-creation' ? 'at-creation' : 'first-login');
      
      const rawRate = initialProfile.rateLimit || '';
      const parts = rawRate.trim().split(/\s+/).filter(Boolean);
      setRateLimit(parts[0] || '');
      setBurstLimit(parts[1] || '');
      setBurstThreshold(parts[2] || '');
      setBurstTime(parts[3] || '');
      setPriority(parts[4] || '');
      setLimitAt(parts[5] || '');

      setSessionTimeout(initialProfile.sessionTimeout || '00:00:00');
      setMacCookieTimeout(initialProfile.macCookieTimeout || '3d 00:00:00');
      setOpenStatusPage(initialProfile.openStatusPage || 'always');
      setTransparentProxy(!!initialProfile.transparentProxy);

      setParentQueue(initialProfile.parentQueue || 'none');
      setQueueType(initialProfile.queueType || 'default');
      setInsertQueueBefore(initialProfile.insertQueueBefore || 'none');

      setAdvertise(!!initialProfile.advertise);
      setAdvertiseUrl(initialProfile.advertiseUrl || '');
      setAdvertiseInterval(initialProfile.advertiseInterval || '00:30:00');
      setAdvertiseTimeout(initialProfile.advertiseTimeout || '00:00:10');

      setOnLoginScript(initialProfile.onLoginScript || '');
      setOnLogoutScript(initialProfile.onLogoutScript || '');

      setIncomingFilter(initialProfile.incomingFilter || '');
      setOutgoingFilter(initialProfile.outgoingFilter || '');
      setAddressList(initialProfile.addressList || '');

      setPrice(initialProfile.price || 0);
      setValidity(
        initialProfile.validity ||
        (initialProfile.validityDays && initialProfile.validityDays > 0 ? `${initialProfile.validityDays}d` : '')
      );
      setDataQuotaMb(initialProfile.dataQuotaMb || 0);
    } else {
      // Default new profile
      setName('');
      setAddressPool('');
      setIdleTimeout('00:05:00');
      setKeepaliveTimeout('00:02:00');
      setStatusAutorefresh('00:01:00');
      setSharedUsers(1);
      setStartsAt('first-login');
      setRateLimit('2M/5M');
      setBurstLimit('');
      setBurstThreshold('');
      setBurstTime('');
      setPriority('');
      setLimitAt('');
      setSessionTimeout('00:00:00');
      setMacCookieTimeout('3d 00:00:00');
      setOpenStatusPage('always');
      setTransparentProxy(false);

      setParentQueue('none');
      setQueueType('default');
      setInsertQueueBefore('none');

      setAdvertise(false);
      setAdvertiseUrl('');
      setAdvertiseInterval('00:30:00');
      setAdvertiseTimeout('00:00:10');

      setOnLoginScript('');
      setOnLogoutScript('');

      setIncomingFilter('');
      setOutgoingFilter('');
      setAddressList('');

      setPrice(0);
      setValidity('');
      setDataQuotaMb(0);
    }
    setFormError(null);
    setShowConfirmModal(false);
  }, [initialProfile, isOpen]);

  const assembledRateLimit = useMemo(() => {
    const baseRate = rateLimit.trim().split(/\s+/)[0] || '';
    let result = baseRate;
    if (baseRate) {
      if (burstLimit.trim() || burstThreshold.trim() || burstTime.trim() || priority.trim() || limitAt.trim()) {
        const b = burstLimit.trim() || '0/0';
        const th = burstThreshold.trim() || '0/0';
        const t = burstTime.trim() || '0s/0s';
        result += ` ${b} ${th} ${t}`;

        if (priority.trim() || limitAt.trim()) {
          const p = priority.trim() || '8';
          result += ` ${p}`;

          if (limitAt.trim()) {
            result += ` ${limitAt.trim()}`;
          }
        }
      }
    }
    return result;
  }, [rateLimit, burstLimit, burstThreshold, burstTime, priority, limitAt]);

  // Generate real RouterOS CLI command
  const generatedCli = useMemo(() => {
    const parts: string[] = [];
    if (isEditing) {
      parts.push(`/ip hotspot user profile set [find name="${initialProfile?.name}"]`);
      if (name !== initialProfile?.name) parts.push(`name="${name}"`);
    } else {
      parts.push(`/ip hotspot user profile add name="${name || 'my-profile'}"`);
    }

    if (addressPool) parts.push(`address-pool="${addressPool}"`);
    if (assembledRateLimit) parts.push(`rate-limit="${assembledRateLimit}"`);
    if (sharedUsers) parts.push(`shared-users=${sharedUsers}`);
    if (idleTimeout && idleTimeout !== 'none') parts.push(`idle-timeout="${idleTimeout}"`);
    if (keepaliveTimeout && keepaliveTimeout !== 'none') parts.push(`keepalive-timeout="${keepaliveTimeout}"`);
    if (statusAutorefresh && statusAutorefresh !== 'none') parts.push(`status-autorefresh="${statusAutorefresh}"`);
    if (sessionTimeout && sessionTimeout !== '00:00:00') parts.push(`session-timeout="${sessionTimeout}"`);
    if (macCookieTimeout && macCookieTimeout !== 'none') parts.push(`mac-cookie-timeout="${macCookieTimeout}"`);
    if (openStatusPage) parts.push(`open-status-page=${openStatusPage}`);
    if (transparentProxy) parts.push(`transparent-proxy=yes`);

    if (parentQueue && parentQueue !== 'none') parts.push(`parent-queue="${parentQueue}"`);
    if (queueType && queueType !== 'default') parts.push(`queue-type="${queueType}"`);
    if (insertQueueBefore && insertQueueBefore !== 'none') parts.push(`insert-queue-before="${insertQueueBefore}"`);

    if (advertise) {
      parts.push(`advertise=yes`);
      if (advertiseUrl) parts.push(`advertise-url="${advertiseUrl}"`);
      if (advertiseInterval) parts.push(`advertise-interval="${advertiseInterval}"`);
      if (advertiseTimeout) parts.push(`advertise-timeout="${advertiseTimeout}"`);
    }

    if (incomingFilter) parts.push(`incoming-filter="${incomingFilter}"`);
    if (outgoingFilter) parts.push(`outgoing-filter="${outgoingFilter}"`);
    if (addressList) parts.push(`address-list="${addressList}"`);

    if (onLoginScript) parts.push(`on-login="${onLoginScript.replace(/\n/g, ' ')}"`);
    if (onLogoutScript) parts.push(`on-logout="${onLogoutScript.replace(/\n/g, ' ')}"`);

    return parts.join(' \\\n  ');
  }, [
    isEditing,
    initialProfile,
    name,
    addressPool,
    assembledRateLimit,
    sharedUsers,
    idleTimeout,
    keepaliveTimeout,
    statusAutorefresh,
    sessionTimeout,
    macCookieTimeout,
    openStatusPage,
    transparentProxy,
    parentQueue,
    queueType,
    insertQueueBefore,
    advertise,
    advertiseUrl,
    advertiseInterval,
    advertiseTimeout,
    incomingFilter,
    outgoingFilter,
    addressList,
    onLoginScript,
    onLogoutScript
  ]);

  if (!isOpen) return null;

  // Validation before triggering the Confirmation Alert
  const handleInitiateSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('يرجى إدخال اسم البروفايل');
      setActiveTab('general');
      return;
    }

    // Check duplicate name on new profile
    if (!isEditing) {
      const duplicate = existingProfiles.some(
        p => p.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        setFormError(`البروفايل (${trimmedName}) موجود مسبقاً في السيرفر`);
        setActiveTab('general');
        return;
      }
    }

    // Open the warning and confirmation modal
    setShowConfirmModal(true);
  };

  // Actual Save upon user explicit approval in confirmation modal
  const handleConfirmSave = async () => {
    if (activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    activeAbortCtrlRef.current = ctrl;
    setIsSubmitting(true);
    try {
      const payload: any = {
        id: initialProfile?.id,
        serviceType: 'hotspot',
        isEditing,
        oldName: initialProfile?.name,
        name: name.trim(),
        addressPool,
        changeAddressPool,
        idleTimeout,
        keepaliveTimeout,
        statusAutorefresh,
        sharedUsers: Number(sharedUsers) || 1,
        startsAt,
        rateLimit: assembledRateLimit,
        sessionTimeout,
        macCookieTimeout,
        openStatusPage,
        transparentProxy,
        parentQueue,
        queueType,
        insertQueueBefore,
        advertise,
        advertiseUrl,
        advertiseInterval,
        advertiseTimeout,
        onLoginScript,
        onLogoutScript,
        incomingFilter,
        outgoingFilter,
        addressList,
        price: Number(price) || 0,
        validity: validity.trim(),
        validityDays: parseMikrotikDuration(validity).days || 0,
        dataQuotaMb: Number(dataQuotaMb) || 0
      };

      const res = await onSave(payload, ctrl.signal);
      if (res && res.success) {
        setShowConfirmModal(false);
        onClose();
      } else {
        setShowConfirmModal(false);
        setFormError(res?.message || 'حدث خطأ أثناء حفظ البروفايل');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setShowConfirmModal(false);
      setFormError(err.message || 'فشل الاتصال بالراوتر');
    } finally {
      if (activeAbortCtrlRef.current === ctrl) {
        activeAbortCtrlRef.current = null;
      }
      if (!ctrl.signal.aborted) {
        setIsSubmitting(false);
      }
    }
  };

  const summaryItems = [
    { label: 'اسم البروفايل', value: name, icon: Sparkles },
    { label: 'حد السرعة (Rx/Tx)', value: assembledRateLimit || 'غير محدود', icon: Zap },
    { label: 'مسبح العناوين (Pool)', value: addressPool || 'none', icon: Radio },
    { label: 'عدد الأجهزة المشاركة', value: `${sharedUsers} جهاز`, icon: Users },
    { label: 'بداية الحساب', value: startsAt === 'at-creation' ? 'فور إنشاء الكرت' : 'عند أول تسجيل دخول', icon: Clock },
    { label: 'مهلة الخمول (Idle)', value: idleTimeout, icon: Clock },
    { label: 'مهلة الجلسة (Session)', value: sessionTimeout === '00:00:00' ? 'مفتوح' : sessionTimeout, icon: Clock },
    { label: 'حصة البيانات (Quota)', value: dataQuotaMb > 0 ? `${dataQuotaMb} MB` : 'غير محدود', icon: HardDrive },
    { label: 'صلاحية البروفايل', value: validity.trim() ? formatDurationArabic(validity) : 'غير مقيد بصلاحية (مفتوح)', icon: Clock },
    { label: 'سعر الاشتراك', value: `${price} ر.ي/د.إ`, icon: DollarSign },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto" dir="rtl">
        <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto mx-auto flex flex-col max-h-[92vh] max-w-[96vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-4xl">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-900 border-b border-blue-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-blue-500/20 border border-blue-500/30 text-blue-400">
                <Radio className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                    Hotspot User Profile (WinBox Parity)
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    /ip/hotspot/user/profile
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-0.5">
                  {isEditing ? `تعديل بروفايل هوتسبوت: ${initialProfile?.name}` : 'إنشاء بروفايل هوتسبوت جديد (WinBox كامل)'}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center gap-1.5 px-5 pt-3 border-b border-slate-800 bg-slate-950/60 overflow-x-auto text-xs scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'general'
                  ? 'text-blue-400 border-blue-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>عام (General)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'queue'
                  ? 'text-blue-400 border-blue-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>الطوابير (Queue)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('advertise')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'advertise'
                  ? 'text-blue-400 border-blue-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>الإعلانات (Advertise)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('scripts')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'scripts'
                  ? 'text-blue-400 border-blue-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>السكربتات (Scripts)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('security')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'security'
                  ? 'text-blue-400 border-blue-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>الفلترة والأمان</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('billing')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'billing'
                  ? 'text-blue-400 border-blue-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>الفوترة والباقات</span>
            </button>
          </div>

          {/* Form Content */}
          <form ref={formScrollRef} onSubmit={handleInitiateSave} noValidate className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-xs">
            {formError && (
              <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{formError}</span>
              </div>
            )}

            {/* TAB: GENERAL */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      اسم البروفايل <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="مثال: hs-5M-VIP أو 10M-Unlimited"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  {/* Address Pool */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-300 font-bold">
                        مسبح العناوين (Address Pool)
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">none للتفريغ</span>
                    </div>
                    <input
                      type="text"
                      list="hs-pool-options"
                      value={addressPool}
                      onChange={e => { setAddressPool(e.target.value); setChangeAddressPool(true); }}
                      placeholder="مثال: hs-pool أو dhcp_pool1 أو none"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                    <datalist id="hs-pool-options">
                      <option value="none">بدون مسبح (none)</option>
                      {availablePools.map(pool => (
                        <option key={pool} value={pool}>{pool}</option>
                      ))}
                    </datalist>
                    {availablePools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-500">مسابح مكتشفة:</span>
                        <button
                          type="button"
                          onClick={() => { setAddressPool('none'); setChangeAddressPool(true); }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                            addressPool === 'none'
                              ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          none
                        </button>
                        {availablePools.slice(0, 4).map(pool => (
                          <button
                            key={pool}
                            type="button"
                            onClick={() => { setAddressPool(pool); setChangeAddressPool(true); }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                              addressPool === pool
                                ? 'bg-blue-600/40 text-blue-300 border border-blue-500/50'
                                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                            }`}
                          >
                            {pool}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Rate Limit with Presets */}
                <div className="space-y-2 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-200 font-bold flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span>تحديد السرعة (Rate Limit: Rx/Tx)</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">Format: [rx/tx] e.g. 2M/5M</span>
                  </div>
                  <input
                    type="text"
                    value={rateLimit}
                    onChange={e => setRateLimit(e.target.value)}
                    placeholder="مثال: 1M/4M أو 2M/5M 4M/10M 512k/1M 10s"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                  {/* Quick speed buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 self-center">سرعات جاهزة:</span>
                    {['512k/1M', '1M/2M', '2M/5M', '4M/8M', '5M/10M', '10M/20M', '20M/50M'].map(spd => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setRateLimit(spd)}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                          rateLimit === spd
                            ? 'bg-blue-600 text-white border-blue-500'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                        }`}
                      >
                        {spd}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setRateLimit('')}
                      className="px-2 py-0.5 text-[10px] rounded-lg border border-slate-700 bg-slate-800/60 text-slate-400 hover:text-white"
                    >
                      بدون حد (Open)
                    </button>
                  </div>
                </div>

                {/* Shared Devices (Shared Users) & Accounting Start (Starts At) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                  {/* Shared Users */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>عدد الأجهزة المشاركة (Shared Users)</span>
                        <span className="text-red-400">*</span>
                      </label>
                      <span className="text-[10px] text-blue-400 font-mono font-bold">{sharedUsers} جهاز</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={sharedUsers}
                      onChange={e => setSharedUsers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500 font-bold"
                      required
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500">خيارات سريعة:</span>
                      {[1, 2, 3, 5, 10].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setSharedUsers(n)}
                          className={`px-2 py-0.5 text-[10px] rounded-lg font-mono font-bold transition-all cursor-pointer border ${
                            sharedUsers === n
                              ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {n === 1 ? '1 جهاز (افتراضي)' : `${n} أجهزة`}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 block">عدد الأجهزة المسموح بدخولها بنفس الكرت/الحساب في وقت واحد</span>
                  </div>

                  {/* Starts At (Accounting Start) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                        <Clock className="w-4 h-4 text-emerald-400" />
                        <span>بداية الحساب (Accounting Start)</span>
                        <span className="text-red-400">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">
                        {startsAt === 'at-creation' ? 'فور الإنشاء' : 'أول دخول'}
                      </span>
                    </div>
                    <select
                      value={startsAt}
                      onChange={e => setStartsAt(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="first-login">عند أول تسجيل دخول للمشترك (First Login - الأكثر شيوعاً)</option>
                      <option value="at-creation">فور إنشاء أو توليد الكرت (At Creation - يبدأ العد فوراً)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {startsAt === 'first-login'
                        ? 'يبدأ احتساب صلاحية الكرت فقط عند قيام المشترك بالاتصال وتسجيل الدخول لأول مرة.'
                        : 'يبدأ العد التنازلي للصلاحية فوراً لحظة توليد الكرت في النظام حتى لو لم يسجل دخوله.'}
                    </p>
                  </div>
                </div>

                {/* Status Autorefresh */}
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold">
                    تحديث الحالة التلقائي (Status Autorefresh)
                  </label>
                  <input
                    type="text"
                    value={statusAutorefresh}
                    onChange={e => setStatusAutorefresh(e.target.value)}
                    placeholder="00:01:00 أو none"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  <span className="text-[10px] text-slate-500 font-mono">الفاصل الزمني لتحديث نافذة حالة الهوتسبوت لدى المشترك (WinBox: status-autorefresh)</span>
                </div>

                {/* Timeouts Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-bold">مهلة الخمول (Idle Timeout)</label>
                    <input
                      type="text"
                      value={idleTimeout}
                      onChange={e => setIdleTimeout(e.target.value)}
                      placeholder="00:05:00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-bold">مهلة الاتصال (Keepalive)</label>
                    <input
                      type="text"
                      value={keepaliveTimeout}
                      onChange={e => setKeepaliveTimeout(e.target.value)}
                      placeholder="00:02:00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-300 font-bold">مهلة الجلسة (Session Timeout)</label>
                    <input
                      type="text"
                      value={sessionTimeout}
                      onChange={e => setSessionTimeout(e.target.value)}
                      placeholder="00:00:00 (مفتوح)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* MAC Cookie & Proxy Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      مهلة كوكيز الماك (MAC Cookie Timeout)
                    </label>
                    <input
                      type="text"
                      value={macCookieTimeout}
                      onChange={e => setMacCookieTimeout(e.target.value)}
                      placeholder="3d 00:00:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      صفحة الحالة (Open Status Page)
                    </label>
                    <select
                      value={openStatusPage}
                      onChange={e => setOpenStatusPage(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    >
                      <option value="always">always (دائماً)</option>
                      <option value="http-login">http-login (عند تسجيل الدخول)</option>
                    </select>
                  </div>
                </div>

                {/* Transparent Proxy Checkbox */}
                <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition-all">
                  <input
                    type="checkbox"
                    checked={transparentProxy}
                    onChange={e => setTransparentProxy(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-200">البروكسي الشفاف (Transparent Proxy)</span>
                    <p className="text-[10px] text-slate-400">توجيه طلبات HTTP تلقائياً للبروكسي الداخلي في ZCtrl</p>
                  </div>
                </label>
              </div>
            )}

            {/* TAB: QUEUE */}
            {activeTab === 'queue' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <span>تتيح هذه الإعدادات دمج مستخدمي هذا البروفايل ضمن طوابير بسيطة وشجرة سرعات (Queue Tree) رئيسية.</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      الطابور الرئيسي (Parent Queue)
                    </label>
                    <input
                      type="text"
                      value={parentQueue}
                      onChange={e => setParentQueue(e.target.value)}
                      placeholder="none أو Total-Hotspot"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      نوع الطابور (Queue Type)
                    </label>
                    <input
                      type="text"
                      value={queueType}
                      onChange={e => setQueueType(e.target.value)}
                      placeholder="default أو hotspot-default أو pcq-upload"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold">
                    مكان إدراج الطابور (Insert Queue Before)
                  </label>
                  <select
                    value={insertQueueBefore}
                    onChange={e => setInsertQueueBefore(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  >
                    <option value="first">first (في البداية - الأولوية القصوى)</option>
                    <option value="bottom">bottom (في الأسفل)</option>
                    <option value="none">none (بدون)</option>
                  </select>
                </div>

                {/* Advanced Queue / Burst Config */}
                <div className="border-t border-slate-800/80 pt-4 mt-2">
                  <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-slate-400" />
                    تخصيص الـ Queue المتقدم (البرست، الأولوية، والسرعة الأدنى)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400 font-bold">
                        أقصى حد للسرعة المؤقتة (Burst Limit)
                      </label>
                      <input
                        type="text"
                        value={burstLimit}
                        onChange={e => setBurstLimit(e.target.value)}
                        placeholder="مثال: 4M/8M"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400 font-bold">
                        عتبة التبديل (Burst Threshold)
                      </label>
                      <input
                        type="text"
                        value={burstThreshold}
                        onChange={e => setBurstThreshold(e.target.value)}
                        placeholder="مثال: 1M/2M"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400 font-bold">
                        زمن البرست (Burst Time)
                      </label>
                      <input
                        type="text"
                        value={burstTime}
                        onChange={e => setBurstTime(e.target.value)}
                        placeholder="مثال: 10s/10s"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] text-slate-400 font-bold">
                        الأولوية (Priority)
                      </label>
                      <input
                        type="text"
                        value={priority}
                        onChange={e => setPriority(e.target.value)}
                        placeholder="رقم من 1 إلى 8 (افتراضي 8)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <label className="block text-[11px] text-slate-400 font-bold">
                        السرعة الأدنى المضمونة (Limit At)
                      </label>
                      <input
                        type="text"
                        value={limitAt}
                        onChange={e => setLimitAt(e.target.value)}
                        placeholder="مثال: 512k/1M"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: ADVERTISE */}
            {activeTab === 'advertise' && (
              <div className="space-y-4">
                <label className="flex items-center gap-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={advertise}
                    onChange={e => setAdvertise(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-slate-200">تفعيل الإعلانات التلقائية (Advertise)</span>
                    <p className="text-[10px] text-slate-400">إظهار صفحة إعلانات أو رابط مخصص للمستخدمين بشكل دوري أثناء التصفح</p>
                  </div>
                </label>

                {advertise && (
                  <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800 animate-in fade-in duration-150">
                    <div className="space-y-1.5">
                      <label className="block text-slate-300 font-bold">رابط الإعلان (Advertise URL)</label>
                      <input
                        type="text"
                        value={advertiseUrl}
                        onChange={e => setAdvertiseUrl(e.target.value)}
                        placeholder="http://example.com/promo أو صفحة داخلية"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block text-slate-300 font-bold">الفاصل الزمني (Interval)</label>
                        <input
                          type="text"
                          value={advertiseInterval}
                          onChange={e => setAdvertiseInterval(e.target.value)}
                          placeholder="00:30:00"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="block text-slate-300 font-bold">مدة بقاء الإعلان (Timeout)</label>
                        <input
                          type="text"
                          value={advertiseTimeout}
                          onChange={e => setAdvertiseTimeout(e.target.value)}
                          placeholder="00:00:10"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB: SCRIPTS */}
            {activeTab === 'scripts' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5 font-mono">
                      <FileCode className="w-3.5 h-3.5 text-blue-400" />
                      <span>سكربت عند تسجيل الدخول (On Login Script):</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">متغيرات: $user, $address, $interface</span>
                  </div>
                  <textarea
                    rows={3}
                    value={onLoginScript}
                    onChange={e => setOnLoginScript(e.target.value)}
                    placeholder=':log info "Hotspot user $user logged in from IP $address";'
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-emerald-400 font-mono text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5 font-mono">
                      <FileCode className="w-3.5 h-3.5 text-amber-400" />
                      <span>سكربت عند تسجيل الخروج (On Logout Script):</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">متغيرات: $user, $address, $uptime</span>
                  </div>
                  <textarea
                    rows={3}
                    value={onLogoutScript}
                    onChange={e => setOnLogoutScript(e.target.value)}
                    placeholder=':log info "Hotspot user $user logged out (Total uptime $uptime)";'
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-emerald-400 font-mono text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* TAB: SECURITY */}
            {activeTab === 'security' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      سلسلة فلترة الحزم الواردة (Incoming Filter)
                    </label>
                    <input
                      type="text"
                      value={incomingFilter}
                      onChange={e => setIncomingFilter(e.target.value)}
                      placeholder="مثال: hs-input أو none"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      سلسلة فلترة الحزم الصادرة (Outgoing Filter)
                    </label>
                    <input
                      type="text"
                      value={outgoingFilter}
                      onChange={e => setOutgoingFilter(e.target.value)}
                      placeholder="مثال: hs-output أو none"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold">
                    قائمة العناوين (Address List)
                  </label>
                  <input
                    type="text"
                    value={addressList}
                    onChange={e => setAddressList(e.target.value)}
                    placeholder="إضافة المشتركين تلقائياً لقائمة عناوين جدار الحماية"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* TAB: BILLING & QUOTA */}
            {activeTab === 'billing' && (
              <div className="space-y-4">
                {/* Duration & Validity Picker Component */}
                <ValidityDurationPicker
                  value={validity}
                  onChange={setValidity}
                  colorTheme="blue"
                  label="صلاحية كرت الهوتسبوت وفترة الاستخدام"
                  subLabel="يدعم الأيام والساعات والدقائق والثواني والإدخال اليدوي المباشر والقوالب السريعة لشبكات المايكروتك"
                  hint="تُحفظ الصلاحية والسعر وحصة البيانات كبيانات وصفية (Metadata) داخل تعليق البروفايل في ZCtrl وتُطبّق تلقائياً عند توليد الكروت أو إنشاء المشتركين على الراوتر."
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span>السعر المالي (ريال / دينار)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={price}
                      onChange={e => setPrice(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold flex items-center gap-1.5">
                      <HardDrive className="w-4 h-4 text-purple-400" />
                      <span>حصة البيانات الإجمالية (MB)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={dataQuotaMb}
                      onChange={e => setDataQuotaMb(Number(e.target.value) || 0)}
                      placeholder="10240 (10 GB) أو 0 لغير المحدود"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* LIVE TERMINAL PREVIEW */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span>معاينة أمر ZCtrl الفعلي (RouterOS CLI Command):</span>
                </span>
                <span className="text-amber-400 text-[10px] font-sans font-bold">
                  ⓘ هذا الأمر للعرض والتدقيق فقط — التنفيذ الفعلي يتم حقيقياً عبر API الراوتر عند الضغط على "حفظ"
                </span>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 font-mono text-[11px] text-emerald-400 overflow-x-auto whitespace-pre-wrap select-all leading-relaxed shadow-inner">
                {generatedCli}
              </div>
            </div>

            {/* Footer Form Buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEditing ? 'حفظ التعديلات والتطبيق' : 'إنشاء وتطبيق البروفايل'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Mandatory Confirmation Alert Dialog before saving */}
      <ProfileConfirmSaveModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        isSubmitting={isSubmitting}
        systemType="hotspot"
        isEditing={isEditing}
        profileName={name}
        summaryItems={summaryItems}
        cliCommand={generatedCli}
      />
    </>
  );
};
