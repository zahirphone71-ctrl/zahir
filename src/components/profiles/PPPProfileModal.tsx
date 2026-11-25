import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Zap,
  Clock,
  DollarSign,
  Terminal,
  Shield,
  Sparkles,
  Network,
  FileCode,
  CheckCircle2,
  Sliders,
  AlertCircle,
  Globe,
  Radio,
  Users
} from 'lucide-react';
import { PPPProfile } from '../../types/mikrotik';
import { ProfileConfirmSaveModal } from './ProfileConfirmSaveModal';
import { ValidityDurationPicker } from './ValidityDurationPicker';
import { formatDurationArabic, parseMikrotikDuration } from '../../lib/formatters';

interface PPPProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    profile: any,
    signal?: AbortSignal
  ) => Promise<{ success: boolean; message?: string }>;
  initialProfile?: PPPProfile | null;
  existingProfiles: PPPProfile[];
}

export const PPPProfileModal: React.FC<PPPProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
  existingProfiles
}) => {
  const isEditing = !!initialProfile && !!initialProfile.id && initialProfile.id.trim() !== '';

  // Active Tab State
  const [activeTab, setActiveTab] = useState<'general' | 'protocols' | 'limits' | 'dns' | 'scripts' | 'billing'>('general');

  // Form Fields - Full Winbox PPP Profile Parameters
  const [name, setName] = useState('');
  const [localAddress, setLocalAddress] = useState('');
  const [remoteAddress, setRemoteAddress] = useState('');
  const [changeRemoteAddress, setChangeRemoteAddress] = useState(false);
  const [remoteIpv6PrefixPool, setRemoteIpv6PrefixPool] = useState('none');
  const [bridge, setBridge] = useState('none');
  const [bridgeHorizon, setBridgeHorizon] = useState('');

  // Shared devices & Accounting start
  const [sharedUsers, setSharedUsers] = useState<number>(1);
  const [startsAt, setStartsAt] = useState<'first-login' | 'at-creation' | 'now'>('first-login');

  // Protocols tab
  const [onlyOne, setOnlyOne] = useState<'default' | 'yes' | 'no'>('yes');
  const [useIpv6, setUseIpv6] = useState<'default' | 'yes' | 'no' | 'required'>('default');
  const [useMpls, setUseMpls] = useState<'default' | 'yes' | 'no' | 'required'>('default');
  const [useCompression, setUseCompression] = useState<'default' | 'yes' | 'no'>('default');
  const [useEncryption, setUseEncryption] = useState<'default' | 'yes' | 'no' | 'required'>('default');

  // Limits & Queues tab
  const [rateLimit, setRateLimit] = useState('5M/20M');
  const [sessionTimeout, setSessionTimeout] = useState('00:00:00');
  const [idleTimeout, setIdleTimeout] = useState('none');
  const [parentQueue, setParentQueue] = useState('none');
  const [queueType, setQueueType] = useState('default');

  // DNS & WINS tab
  const [dnsServer, setDnsServer] = useState('');
  const [winsServer, setWinsServer] = useState('');
  const [addressList, setAddressList] = useState('');

  // Scripts tab
  const [onUpScript, setOnUpScript] = useState('');
  const [onDownScript, setOnDownScript] = useState('');

  // Billing
  const [price, setPrice] = useState<number>(0);
  const [validity, setValidity] = useState<string>('');

  // Advanced Queue / Burst states
  const [burstLimit, setBurstLimit] = useState('');
  const [burstThreshold, setBurstThreshold] = useState('');
  const [burstTime, setBurstTime] = useState('');
  const [priority, setPriority] = useState('');
  const [limitAt, setLimitAt] = useState('');

  // Errors & Modals
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

  // Discovered pools and addresses from existing PPP profiles
  const availableRemotePools = useMemo(() => {
    return Array.from(new Set(existingProfiles.map(p => p.remoteAddress).filter(Boolean))) as string[];
  }, [existingProfiles]);

  const availableLocalAddresses = useMemo(() => {
    return Array.from(new Set(existingProfiles.map(p => p.localAddress).filter(Boolean))) as string[];
  }, [existingProfiles]);

  useEffect(() => {
    if (initialProfile) {
      setName(initialProfile.name || '');
      setLocalAddress(initialProfile.localAddress || '');
      setRemoteAddress(initialProfile.remoteAddress || '');
      setChangeRemoteAddress(false);
      setRemoteIpv6PrefixPool(initialProfile.remoteIpv6PrefixPool || 'none');
      setBridge(initialProfile.bridge || 'none');
      setBridgeHorizon(initialProfile.bridgeHorizon || '');

      setOnlyOne(
        typeof initialProfile.onlyOne === 'boolean'
          ? initialProfile.onlyOne ? 'yes' : 'no'
          : initialProfile.onlyOne || 'yes'
      );
      setSharedUsers(
        initialProfile.sharedUsers !== undefined && Number(initialProfile.sharedUsers) > 0
          ? Number(initialProfile.sharedUsers)
          : (initialProfile.onlyOne === 'no' ? 2 : 1)
      );
      setStartsAt(initialProfile.startsAt || 'first-login');
      setUseIpv6(initialProfile.useIpv6 || 'default');
      setUseMpls(initialProfile.useMpls || 'default');
      setUseCompression(initialProfile.useCompression || 'default');
      setUseEncryption(initialProfile.useEncryption || 'default');

      const rawRate = initialProfile.rateLimit || '';
      const parts = rawRate.trim().split(/\s+/).filter(Boolean);
      setRateLimit(parts[0] || '');
      setBurstLimit(parts[1] || '');
      setBurstThreshold(parts[2] || '');
      setBurstTime(parts[3] || '');
      setPriority(parts[4] || '');
      setLimitAt(parts[5] || '');

      setSessionTimeout(initialProfile.sessionTimeout || '00:00:00');
      setIdleTimeout(initialProfile.idleTimeout || 'none');
      setParentQueue(initialProfile.parentQueue || 'none');
      setQueueType(initialProfile.queueType || 'default');

      setDnsServer(initialProfile.dnsServer || '');
      setWinsServer(initialProfile.winsServer || '');
      setAddressList(initialProfile.addressList || '');

      setOnUpScript(initialProfile.onUpScript || '');
      setOnDownScript(initialProfile.onDownScript || '');

      setPrice(initialProfile.price || 0);
      setValidity(
        initialProfile.validity ||
        (initialProfile.validityDays && initialProfile.validityDays > 0 ? `${initialProfile.validityDays}d` : '')
      );
    } else {
      setName('');
      setLocalAddress('');
      setRemoteAddress('');
      setRemoteIpv6PrefixPool('none');
      setBridge('none');
      setBridgeHorizon('');

      setOnlyOne('yes');
      setSharedUsers(1);
      setStartsAt('first-login');
      setUseIpv6('default');
      setUseMpls('default');
      setUseCompression('default');
      setUseEncryption('default');

      setRateLimit('5M/20M');
      setBurstLimit('');
      setBurstThreshold('');
      setBurstTime('');
      setPriority('');
      setLimitAt('');

      setSessionTimeout('00:00:00');
      setIdleTimeout('none');
      setParentQueue('none');
      setQueueType('default');

      setDnsServer('');
      setWinsServer('');
      setAddressList('');

      setOnUpScript('');
      setOnDownScript('');

      setPrice(0);
      setValidity('');
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
      parts.push(`/ppp profile set [find name="${initialProfile?.name}"]`);
      if (name !== initialProfile?.name) parts.push(`name="${name}"`);
    } else {
      parts.push(`/ppp profile add name="${name || 'pppoe-profile'}"`);
    }

    if (localAddress) parts.push(`local-address="${localAddress}"`);
    if (remoteAddress) parts.push(`remote-address="${remoteAddress}"`);
    if (remoteIpv6PrefixPool && remoteIpv6PrefixPool !== 'none') parts.push(`remote-ipv6-prefix-pool="${remoteIpv6PrefixPool}"`);
    if (bridge && bridge !== 'none') parts.push(`bridge="${bridge}"`);
    if (bridgeHorizon) parts.push(`bridge-horizon="${bridgeHorizon}"`);

    if (assembledRateLimit) parts.push(`rate-limit="${assembledRateLimit}"`);
    if (sharedUsers > 1) {
      parts.push(`only-one=no`);
      parts.push(`comment="# ZCtrl|Shared:${sharedUsers}|StartsAt:${startsAt}#"`);
    } else {
      if (onlyOne && onlyOne !== 'default') parts.push(`only-one=${onlyOne}`);
      parts.push(`comment="# ZCtrl|Shared:1|StartsAt:${startsAt}#"`);
    }
    if (useIpv6 && useIpv6 !== 'default') parts.push(`use-ipv6=${useIpv6}`);
    if (useMpls && useMpls !== 'default') parts.push(`use-mpls=${useMpls}`);
    if (useCompression && useCompression !== 'default') parts.push(`use-compression=${useCompression}`);
    if (useEncryption && useEncryption !== 'default') parts.push(`use-encryption=${useEncryption}`);

    if (sessionTimeout && sessionTimeout !== '00:00:00') parts.push(`session-timeout="${sessionTimeout}"`);
    if (idleTimeout && idleTimeout !== 'none') parts.push(`idle-timeout="${idleTimeout}"`);
    if (parentQueue && parentQueue !== 'none') parts.push(`parent-queue="${parentQueue}"`);
    if (queueType && queueType !== 'default') parts.push(`queue-type="${queueType}"`);

    if (dnsServer) parts.push(`dns-server="${dnsServer}"`);
    if (winsServer) parts.push(`wins-server="${winsServer}"`);
    if (addressList) parts.push(`address-list="${addressList}"`);

    if (onUpScript) parts.push(`on-up="${onUpScript.replace(/\n/g, ' ')}"`);
    if (onDownScript) parts.push(`on-down="${onDownScript.replace(/\n/g, ' ')}"`);

    return parts.join(' \\\n  ');
  }, [
    isEditing,
    initialProfile,
    name,
    localAddress,
    remoteAddress,
    remoteIpv6PrefixPool,
    bridge,
    bridgeHorizon,
    assembledRateLimit,
    sharedUsers,
    startsAt,
    onlyOne,
    useIpv6,
    useMpls,
    useCompression,
    useEncryption,
    sessionTimeout,
    idleTimeout,
    parentQueue,
    queueType,
    dnsServer,
    winsServer,
    addressList,
    onUpScript,
    onDownScript
  ]);

  if (!isOpen) return null;

  const handleInitiateSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('يرجى إدخال اسم بروفايل الـ PPP');
      setActiveTab('general');
      return;
    }

    if (!isEditing) {
      const duplicate = existingProfiles.some(
        p => p.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        setFormError(`بروفايل الـ PPP (${trimmedName}) موجود مسبقاً`);
        setActiveTab('general');
        return;
      }
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (activeAbortCtrlRef.current) {
      activeAbortCtrlRef.current.abort();
    }
    const ctrl = new AbortController();
    activeAbortCtrlRef.current = ctrl;
    setIsSubmitting(true);
    try {
      const finalOnlyOne = sharedUsers > 1 ? 'no' : onlyOne;
      const payload: any = {
        id: initialProfile?.id,
        serviceType: 'pppoe',
        isEditing,
        oldName: initialProfile?.name,
        name: name.trim(),
        sharedUsers: Number(sharedUsers) || 1,
        startsAt,
        localAddress: localAddress.trim(),
        remoteAddress: remoteAddress.trim(),
        changeRemoteAddress,
        remoteIpv6PrefixPool,
        bridge,
        bridgeHorizon,
        onlyOne: finalOnlyOne,
        useIpv6,
        useMpls,
        useCompression,
        useEncryption,
        rateLimit: assembledRateLimit,
        sessionTimeout,
        idleTimeout,
        parentQueue,
        queueType,
        dnsServer: dnsServer.trim(),
        winsServer: winsServer.trim(),
        addressList: addressList.trim(),
        onUpScript,
        onDownScript,
        price: Number(price) || 0,
        validity: validity.trim(),
        validityDays: parseMikrotikDuration(validity).days || 0
      };

      const res = await onSave(payload, ctrl.signal);
      if (res && res.success) {
        setShowConfirmModal(false);
        onClose();
      } else {
        setShowConfirmModal(false);
        setFormError(res?.message || 'حدث خطأ أثناء حفظ بروفايل PPP');
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
    { label: 'عدد الأجهزة المسموحة', value: `${sharedUsers} ${sharedUsers > 1 ? 'أجهزة (مشاركة)' : 'جهاز واحد'}`, icon: Users },
    { label: 'بداية الحساب', value: startsAt === 'first-login' ? 'عند أول تسجيل دخول' : 'فوري عند الإنشاء', icon: Clock },
    { label: 'عنوان الراوتر (Local)', value: localAddress || 'none', icon: Network },
    { label: 'مسبح المشتركين (Remote)', value: remoteAddress || 'none', icon: Radio },
    { label: 'خوادم DNS', value: dnsServer || 'none', icon: Globe },
    { label: 'جلسة واحدة فقط (Only One)', value: sharedUsers > 1 ? 'لا (مسموح بتعدد الأجهزة)' : (onlyOne === 'yes' ? 'نعم (حظر التعدد)' : onlyOne), icon: Shield },
    { label: 'التشفير (Encryption)', value: useEncryption, icon: Shield },
    { label: 'صلاحية الاشتراك', value: validity.trim() ? formatDurationArabic(validity) : 'غير مقيد بصلاحية (مفتوح)', icon: Clock },
    { label: 'السعر الشهري', value: `${price} ر.ي/د.إ`, icon: DollarSign },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto" dir="rtl">
        <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto mx-auto flex flex-col max-h-[92vh] max-w-[96vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-4xl">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-emerald-950/70 via-slate-900 to-slate-900 border-b border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                <Network className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    PPP / PPPoE Profile (WinBox Parity)
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    /ppp/profile
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-0.5">
                  {isEditing ? `تعديل بروفايل برودباند: ${initialProfile?.name}` : 'إنشاء بروفايل PPPoE جديد (WinBox كامل)'}
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
                  ? 'text-emerald-400 border-emerald-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>عام (General)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('protocols')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'protocols'
                  ? 'text-emerald-400 border-emerald-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>البروتوكولات (Protocols)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('limits')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'limits'
                  ? 'text-emerald-400 border-emerald-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>السرعات والحدود (Limits)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('dns')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'dns'
                  ? 'text-emerald-400 border-emerald-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>DNS & WINS</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('scripts')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'scripts'
                  ? 'text-emerald-400 border-emerald-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>السكربتات (Scripts)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('billing')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'billing'
                  ? 'text-emerald-400 border-emerald-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>الفوترة والأسعار</span>
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
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      اسم بروفايل الـ PPP <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="مثال: pppoe-fiber-20M أو ppp-corp-vip"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-300 font-bold">
                        عنوان الراوتر المحلي (Local Address)
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">IP أو Pool</span>
                    </div>
                    <input
                      type="text"
                      list="ppp-local-options"
                      value={localAddress}
                      onChange={e => setLocalAddress(e.target.value)}
                      placeholder="مثال: 10.10.10.1 أو pool-name"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <datalist id="ppp-local-options">
                      {availableLocalAddresses.map(addr => (
                        <option key={addr} value={addr}>{addr}</option>
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-300 font-bold">
                        عنوان أو مسبح العميل (Remote Address)
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">none للتفريغ</span>
                    </div>
                    <input
                      type="text"
                      list="ppp-remote-options"
                      value={remoteAddress}
                      onChange={e => { setRemoteAddress(e.target.value); setChangeRemoteAddress(true); }}
                      placeholder="مثال: ppp-pool-10 أو 10.10.10.2 أو none"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    <datalist id="ppp-remote-options">
                      <option value="none">بدون مسبح (none)</option>
                      {availableRemotePools.map(pool => (
                        <option key={pool} value={pool}>{pool}</option>
                      ))}
                    </datalist>
                    {availableRemotePools.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-500">مسابح مكتشفة:</span>
                        <button
                          type="button"
                          onClick={() => { setRemoteAddress('none'); setChangeRemoteAddress(true); }}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                            remoteAddress === 'none'
                              ? 'bg-red-500/30 text-red-300 border border-red-500/50'
                              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          none
                        </button>
                        {availableRemotePools.slice(0, 4).map(pool => (
                          <button
                            key={pool}
                            type="button"
                            onClick={() => { setRemoteAddress(pool); setChangeRemoteAddress(true); }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                              remoteAddress === pool
                                ? 'bg-emerald-600/40 text-emerald-300 border border-emerald-500/50'
                                : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                            }`}
                          >
                            {pool}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      مسبح بادئة IPv6 للعميل (Remote IPv6 Prefix Pool)
                    </label>
                    <input
                      type="text"
                      value={remoteIpv6PrefixPool}
                      onChange={e => setRemoteIpv6PrefixPool(e.target.value)}
                      placeholder="none أو ipv6-pool"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      جسر التوصيل (Bridge)
                    </label>
                    <input
                      type="text"
                      value={bridge}
                      onChange={e => setBridge(e.target.value)}
                      placeholder="none أو bridge-local"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      أفق الجسر (Bridge Horizon)
                    </label>
                    <input
                      type="text"
                      value={bridgeHorizon}
                      onChange={e => setBridgeHorizon(e.target.value)}
                      placeholder="none أو رقم"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Shared Devices (Shared Users) & Accounting Start (Starts At) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                  {/* Shared Users */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                        <Users className="w-4 h-4 text-emerald-400" />
                        <span>عدد الأجهزة المشاركة (Shared Users)</span>
                        <span className="text-red-400">*</span>
                      </label>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">{sharedUsers} جهاز</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={sharedUsers}
                      onChange={e => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setSharedUsers(val);
                        if (val > 1) setOnlyOne('no');
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500 font-bold"
                      required
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500">خيارات سريعة:</span>
                      {[1, 2, 3, 5, 10].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setSharedUsers(n);
                            if (n > 1) setOnlyOne('no');
                            else setOnlyOne('yes');
                          }}
                          className={`px-2 py-0.5 text-[10px] rounded-lg font-mono font-bold transition-all cursor-pointer border ${
                            sharedUsers === n
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {n === 1 ? '1 جهاز (only-one=yes)' : `${n} أجهزة`}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      في MikroTik PPP: جهاز واحد يضبط (only-one=yes) لمنع التعدد، وتعدد الأجهزة يضبط (only-one=no) ويُحفظ العدد كمرجع في ZCtrl.
                    </span>
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
                        {startsAt === 'at-creation' ? 'فور الإنشاء' : 'أول اتصال'}
                      </span>
                    </div>
                    <select
                      value={startsAt}
                      onChange={e => setStartsAt(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="first-login">عند أول اتصال بالخدمة (First Login - الافتراضي)</option>
                      <option value="at-creation">فور إنشاء أو تفعيل الحساب (At Creation)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {startsAt === 'first-login'
                        ? 'يبدأ احتساب الصلاحية والاشتراك فقط لحظة أول اتصال PPPoE ناجح من العميل.'
                        : 'يبدأ العد التنازلي لمدة الاشتراك فور إضافة الحساب في الراوتر.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PROTOCOLS */}
            {activeTab === 'protocols' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      جلسة واحدة فقط (Only One)
                    </label>
                    <select
                      value={onlyOne}
                      onChange={e => setOnlyOne(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    >
                      <option value="yes">yes (حظر التعدد - جلسة واحدة)</option>
                      <option value="no">no (السماح بعدة جلسات)</option>
                      <option value="default">default</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      استخدام التشفير (Use Encryption)
                    </label>
                    <select
                      value={useEncryption}
                      onChange={e => setUseEncryption(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    >
                      <option value="yes">yes (تفعيل التشفير)</option>
                      <option value="required">required (إلزامي)</option>
                      <option value="no">no (بدون تشفير)</option>
                      <option value="default">default</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      بروتوكول IPv6
                    </label>
                    <select
                      value={useIpv6}
                      onChange={e => setUseIpv6(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    >
                      <option value="no">no (معطل)</option>
                      <option value="yes">yes (مفعل)</option>
                      <option value="required">required</option>
                      <option value="default">default</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      بروتوكول MPLS
                    </label>
                    <select
                      value={useMpls}
                      onChange={e => setUseMpls(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    >
                      <option value="default">default</option>
                      <option value="yes">yes</option>
                      <option value="no">no</option>
                      <option value="required">required</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      ضغط البيانات (Compression)
                    </label>
                    <select
                      value={useCompression}
                      onChange={e => setUseCompression(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    >
                      <option value="no">no</option>
                      <option value="yes">yes</option>
                      <option value="default">default</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LIMITS */}
            {activeTab === 'limits' && (
              <div className="space-y-4">
                <div className="space-y-2 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-200 font-bold flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span>تحديد السرعة (Rate Limit: Rx/Tx)</span>
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">Format: [rx/tx] e.g. 10M/30M</span>
                  </div>
                  <input
                    type="text"
                    value={rateLimit}
                    onChange={e => setRateLimit(e.target.value)}
                    placeholder="مثال: 5M/20M أو 10M/50M 20M/100M"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 self-center">سرعات فايبر / برودباند:</span>
                    {['2M/8M', '5M/20M', '10M/30M', '20M/50M', '50M/100M', '100M/200M'].map(spd => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setRateLimit(spd)}
                        className={`px-2 py-0.5 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                          rateLimit === spd
                            ? 'bg-emerald-600 text-white border-emerald-500'
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">مهلة الجلسة (Session Timeout)</label>
                    <input
                      type="text"
                      value={sessionTimeout}
                      onChange={e => setSessionTimeout(e.target.value)}
                      placeholder="00:00:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">مهلة الخمول (Idle Timeout)</label>
                    <input
                      type="text"
                      value={idleTimeout}
                      onChange={e => setIdleTimeout(e.target.value)}
                      placeholder="none أو 00:10:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">الطابور الرئيسي (Parent Queue)</label>
                    <input
                      type="text"
                      value={parentQueue}
                      onChange={e => setParentQueue(e.target.value)}
                      placeholder="none أو PPPoE-Root"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">نوع الطابور (Queue Type)</label>
                    <input
                      type="text"
                      value={queueType}
                      onChange={e => setQueueType(e.target.value)}
                      placeholder="default أو pcq-upload-default"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: DNS */}
            {activeTab === 'dns' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    <span>خوادم الـ DNS الممررة للعميل</span>
                  </label>
                  <input
                    type="text"
                    value={dnsServer}
                    onChange={e => setDnsServer(e.target.value)}
                    placeholder="8.8.8.8,1.1.1.1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400">يمكن إدخال أكثر من خادم مفصولين بفاصلة</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">خادم WINS (WINS Server)</label>
                    <input
                      type="text"
                      value={winsServer}
                      onChange={e => setWinsServer(e.target.value)}
                      placeholder="none أو عنوان IP"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">قائمة العناوين (Address List)</label>
                    <input
                      type="text"
                      value={addressList}
                      onChange={e => setAddressList(e.target.value)}
                      placeholder="pppoe-subscribers"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SCRIPTS */}
            {activeTab === 'scripts' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5 font-mono">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      <span>سكربت عند اتصال العميل (On Up Script):</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">متغيرات: $user, $address, $caller-id</span>
                  </div>
                  <textarea
                    rows={3}
                    value={onUpScript}
                    onChange={e => setOnUpScript(e.target.value)}
                    placeholder=':log info "PPPoE client $user connected IP $address";'
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-emerald-400 font-mono text-xs focus:outline-none focus:border-emerald-500 leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5 font-mono">
                      <FileCode className="w-3.5 h-3.5 text-amber-400" />
                      <span>سكربت عند انقطاع اتصال العميل (On Down Script):</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">متغيرات: $user, $address</span>
                  </div>
                  <textarea
                    rows={3}
                    value={onDownScript}
                    onChange={e => setOnDownScript(e.target.value)}
                    placeholder=':log info "PPPoE client $user disconnected";'
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-emerald-400 font-mono text-xs focus:outline-none focus:border-emerald-500 leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* TAB: BILLING */}
            {activeTab === 'billing' && (
              <div className="space-y-4">
                {/* Validity Duration Picker */}
                <ValidityDurationPicker
                  value={validity}
                  onChange={setValidity}
                  colorTheme="emerald"
                  label="صلاحية اشتراك البرودباند PPPoE"
                  subLabel="تحديد مدة صلاحية الحساب بالأيام والساعات والدقائق والثواني أو إدخال يدوي حر"
                  hint="تُحفظ الصلاحية والسعر في إعدادات البروفايل بـ ZCtrl وتُطبّق تلقائياً عند إنشاء أو تجديد اشتراكات PPPoE وتقارير الفوترة."
                />

                <div className="space-y-1.5 pt-1">
                  <label className="block text-slate-300 font-bold flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>سعر الاشتراك المالي (ريال / دينار)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={price}
                    onChange={e => setPrice(Number(e.target.value) || 0)}
                    placeholder="50"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}

            {/* LIVE TERMINAL PREVIEW */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
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
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEditing ? 'حفظ التعديلات والتطبيق' : 'إنشاء وتطبيق بروفايل PPP'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ProfileConfirmSaveModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmSave}
        isSubmitting={isSubmitting}
        systemType="pppoe"
        isEditing={isEditing}
        profileName={name}
        summaryItems={summaryItems}
        cliCommand={generatedCli}
      />
    </>
  );
};
