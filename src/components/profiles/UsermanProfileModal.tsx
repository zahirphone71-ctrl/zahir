import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMikroTik } from '../../context/MikroTikContext';
import {
  X,
  Zap,
  Clock,
  HardDrive,
  Users,
  DollarSign,
  Terminal,
  Sparkles,
  UserCheck,
  CheckCircle2,
  Sliders,
  AlertCircle,
  Calendar
} from 'lucide-react';
import { UsermanProfile } from '../../types/mikrotik';
import { ProfileConfirmSaveModal } from './ProfileConfirmSaveModal';
import { ValidityDurationPicker } from './ValidityDurationPicker';
import { formatDurationArabic } from '../../lib/formatters';

interface UsermanProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    profile: any,
    signal?: AbortSignal
  ) => Promise<{ success: boolean; message?: string }>;
  initialProfile?: UsermanProfile | null;
  existingProfiles: UsermanProfile[];
}

export const UsermanProfileModal: React.FC<UsermanProfileModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProfile,
  existingProfiles
}) => {
  const { router } = useMikroTik();
  const isRosV6 = router?.majorVersion === 6 || /^6\./.test(router?.version || '');
  const isEditing = !!initialProfile && !!initialProfile.id && initialProfile.id.trim() !== '';

  // Active Tab State
  const [activeTab, setActiveTab] = useState<'profile' | 'limitation' | 'schedule'>('profile');

  // Form Fields - Winbox User Manager Profile & Limitation Parameters
  const [name, setName] = useState('');
  const [nameForUsers, setNameForUsers] = useState('');
  const [owner, setOwner] = useState('admin');
  const [validity, setValidity] = useState('');
  const [startsAt, setStartsAt] = useState<'first-auth' | 'at-creation' | 'now'>('first-auth');
  const [overrideSharedUsers, setOverrideSharedUsers] = useState<number | string>(1);
  const [price, setPrice] = useState<number>(0);

  // Limitation tab
  const [limitationName, setLimitationName] = useState('');
  const [rateLimit, setRateLimit] = useState('2M/8M');
  const [rateLimitMin, setRateLimitMin] = useState('');
  const [transferLimitMb, setTransferLimitMb] = useState<number>(0);
  const [downloadLimitMb, setDownloadLimitMb] = useState<number>(0);
  const [uploadLimitMb, setUploadLimitMb] = useState<number>(0);
  const [uptimeLimit, setUptimeLimit] = useState('');

  // Schedule tab
  const [fromTime, setFromTime] = useState('00:00:00');
  const [tillTime, setTillTime] = useState('23:59:59');
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([
    'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'
  ]);

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

  const allWeekdays = [
    { id: 'saturday', nameAr: 'السبت' },
    { id: 'sunday', nameAr: 'الأحد' },
    { id: 'monday', nameAr: 'الاثنين' },
    { id: 'tuesday', nameAr: 'الثلاثاء' },
    { id: 'wednesday', nameAr: 'الأربعاء' },
    { id: 'thursday', nameAr: 'الخميس' },
    { id: 'friday', nameAr: 'الجمعة' },
  ];

  useEffect(() => {
    if (initialProfile) {
      setName(initialProfile.name || '');
      setNameForUsers(initialProfile.nameForUsers || initialProfile.name || '');
      setOwner(initialProfile.owner || 'admin');
      setValidity(initialProfile.validity || '');
      setStartsAt(initialProfile.startsAt || 'first-auth');
      setOverrideSharedUsers(initialProfile.overrideSharedUsers ?? 1);
      setPrice(initialProfile.price || 0);

      setLimitationName(initialProfile.limitationName || `Lim-${initialProfile.name}`);
      setRateLimit(initialProfile.rateLimit || '2M/8M');
      setRateLimitMin(initialProfile.rateLimitMin || '');
      const rawTransfer = Number(initialProfile.transferLimitMb || initialProfile.transferLimit || initialProfile.dataQuotaMb) || 0;
      setTransferLimitMb(rawTransfer > 10485760 ? Math.round(rawTransfer / 1048576) : rawTransfer);

      const rawDl = Number(initialProfile.downloadLimitMb || initialProfile.downloadLimit) || 0;
      setDownloadLimitMb(rawDl > 10485760 ? Math.round(rawDl / 1048576) : rawDl);

      const rawUl = Number(initialProfile.uploadLimitMb || initialProfile.uploadLimit) || 0;
      setUploadLimitMb(rawUl > 10485760 ? Math.round(rawUl / 1048576) : rawUl);

      setUptimeLimit(initialProfile.uptimeLimit || initialProfile.timeLimit || '');

      setFromTime(initialProfile.fromTime || '00:00:00');
      setTillTime(initialProfile.tillTime || '23:59:59');
      if (initialProfile.weekdays) {
        setSelectedWeekdays(initialProfile.weekdays.split(',').map(s => s.trim()).filter(Boolean));
      } else {
        setSelectedWeekdays(['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
      }
    } else {
      setName('');
      setNameForUsers('');
      setOwner('admin');
      setValidity('');
      setStartsAt('first-auth');
      setOverrideSharedUsers(1);
      setPrice(0);

      setLimitationName('');
      setRateLimit('2M/8M');
      setRateLimitMin('');
      setTransferLimitMb(0);
      setDownloadLimitMb(0);
      setUploadLimitMb(0);
      setUptimeLimit('');

      setFromTime('00:00:00');
      setTillTime('23:59:59');
      setSelectedWeekdays(['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    }
    setFormError(null);
    setShowConfirmModal(false);
  }, [initialProfile, isOpen]);

  const toggleWeekday = (dayId: string) => {
    setSelectedWeekdays(prev =>
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId]
    );
  };

  // Generate RouterOS CLI commands
  const generatedCli = useMemo(() => {
    const profName = name || 'um-profile';
    const limName = limitationName || `Lim-${profName}`;
    const weekdaysStr = selectedWeekdays.join(',');
    const baseRate = rateLimit.trim().split(/\s+/)[0] || '';
    const [rx = '', tx = ''] = baseRate.split('/');
    const baseMinRate = rateLimitMin.trim().split(/\s+/)[0] || '';
    const [minRx = '', minTx = ''] = baseMinRate.split('/');

    const lines: string[] = [];

    if (isRosV6) {
      const v6Starts = startsAt === 'at-creation' || startsAt === 'now' ? 'create-and-activate' : 'logon';
      lines.push(`# 1. إنشاء قيد السرعة والحصص (RouterOS v6):`);
      lines.push(
        `/tool user-manager profile limitation add name="${limName}" owner="${owner}"${rx ? ` rate-limit-rx="${rx}"` : ''}${tx ? ` rate-limit-tx="${tx}"` : ''}${minRx ? ` rate-limit-min-rx="${minRx}"` : ''}${minTx ? ` rate-limit-min-tx="${minTx}"` : ''}${downloadLimitMb ? ` download-limit=${downloadLimitMb}M` : ''}${uploadLimitMb ? ` upload-limit=${uploadLimitMb}M` : ''}${transferLimitMb ? ` transfer-limit=${transferLimitMb}M` : ''}${uptimeLimit ? ` uptime-limit="${uptimeLimit}"` : ''}`
      );
      lines.push(`\n# 2. إنشاء البروفايل وربطه بالقيد والجدول (RouterOS v6):`);
      lines.push(
        `/tool user-manager profile add name="${profName}" name-for-users="${nameForUsers || profName}" owner="${owner}" price=${price}${validity ? ` validity="${validity}"` : ''} starts-at=${v6Starts} override-shared-users=${overrideSharedUsers}`
      );
      lines.push(
        `/tool user-manager profile profile-limitation add profile="${profName}" limitation="${limName}" from-time="${fromTime}" till-time="${tillTime}" weekdays="${weekdaysStr}"`
      );
    } else {
      const v7Starts = startsAt === 'at-creation' || startsAt === 'now' ? 'assigned' : 'first-auth';
      lines.push(`# 1. إنشاء قيد السرعة والحصص (RouterOS v7):`);
      lines.push(
        `/user-manager limitation add name="${limName}"${rx ? ` rate-limit-rx="${rx}"` : ''}${tx ? ` rate-limit-tx="${tx}"` : ''}${minRx ? ` rate-limit-min-rx="${minRx}"` : ''}${minTx ? ` rate-limit-min-tx="${minTx}"` : ''}${downloadLimitMb ? ` download-limit=${downloadLimitMb}M` : ''}${uploadLimitMb ? ` upload-limit=${uploadLimitMb}M` : ''}${transferLimitMb ? ` transfer-limit=${transferLimitMb}M` : ''}${uptimeLimit ? ` uptime-limit="${uptimeLimit}"` : ''}`
      );
      lines.push(`\n# 2. إنشاء البروفايل وربطه بالقيد والجدول (RouterOS v7):`);
      lines.push(
        `/user-manager profile add name="${profName}" name-for-users="${nameForUsers || profName}" price=${price}${validity ? ` validity="${validity}"` : ' validity=unlimited'} starts-when=${v7Starts}`
      );
      lines.push(
        `/user-manager profile-limitation add profile="${profName}" limitation="${limName}" from-time="${fromTime}" till-time="${tillTime}" weekdays="${weekdaysStr}"`
      );
    }

    return lines.join('\n');
  }, [
    isRosV6,
    name,
    nameForUsers,
    owner,
    validity,
    startsAt,
    overrideSharedUsers,
    price,
    limitationName,
    rateLimit,
    rateLimitMin,
    transferLimitMb,
    downloadLimitMb,
    uploadLimitMb,
    uptimeLimit,
    fromTime,
    tillTime,
    selectedWeekdays
  ]);

  if (!isOpen) return null;

  const handleInitiateSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('يرجى إدخال اسم بروفايل اليوزر مانجر');
      setActiveTab('profile');
      return;
    }

    if (!isEditing) {
      const duplicate = existingProfiles.some(
        p => p.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicate) {
        setFormError(`بروفايل اليوزر مانجر (${trimmedName}) موجود مسبقاً`);
        setActiveTab('profile');
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
      const limName = limitationName.trim() || `Lim-${name.trim()}`;
      const payload: any = {
        id: initialProfile?.id,
        serviceType: 'userman',
        isEditing,
        oldName: initialProfile?.name,
        name: name.trim(),
        nameForUsers: nameForUsers.trim() || name.trim(),
        owner: owner.trim() || 'admin',
        price: Number(price) || 0,
        validity: validity.trim(),
        overrideSharedUsers: Number(overrideSharedUsers) || 1,
        startsAt,
        limitationName: limName,
        rateLimit: rateLimit.trim(),
        rateLimitMin: rateLimitMin.trim(),
        dataQuotaMb: Number(transferLimitMb) || 0,
        transferLimitMb: Number(transferLimitMb) || 0,
        downloadLimitMb: Number(downloadLimitMb) || 0,
        uploadLimitMb: Number(uploadLimitMb) || 0,
        timeLimit: uptimeLimit.trim(),
        uptimeLimit: uptimeLimit.trim(),
        fromTime,
        tillTime,
        weekdays: selectedWeekdays.join(',')
      };

      const res = await onSave(payload, ctrl.signal);
      if (res && res.success) {
        setShowConfirmModal(false);
        onClose();
      } else {
        setShowConfirmModal(false);
        setFormError(res?.message || 'حدث خطأ أثناء حفظ بروفايل اليوزر مانجر');
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
    { label: 'حد السرعة (Rx/Tx)', value: rateLimit || 'غير محدود', icon: Zap },
    { label: 'صلاحية الباقة', value: formatDurationArabic(validity), icon: Clock },
    { label: 'بدء احتساب الوقت', value: startsAt === 'first-auth' ? 'أول دخول' : 'عند الإنشاء', icon: Clock },
    { label: 'حصة النقل الإجمالية', value: transferLimitMb > 0 ? `${transferLimitMb} MB` : 'مفتوح', icon: HardDrive },
    { label: 'حد وقت الاستخدام', value: formatDurationArabic(uptimeLimit), icon: Clock },
    { label: 'المستخدمون المشتركون', value: `${overrideSharedUsers} جهاز`, icon: Users },
    { label: 'سعر الباقة', value: `${price} ر.ي/د.إ`, icon: DollarSign },
  ];

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto" dir="rtl">
        <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto mx-auto flex flex-col max-h-[92vh] max-w-[96vw] sm:max-w-[90vw] md:max-w-3xl lg:max-w-4xl">
          {/* Header */}
          <div className="p-5 bg-gradient-to-r from-purple-950/70 via-slate-900 to-slate-900 border-b border-purple-500/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-400">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    User Manager Profile & Limitation (WinBox Parity)
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    /user-manager/profile
                  </span>
                </div>
                <h3 className="text-base font-black text-white mt-0.5">
                  {isEditing ? `تعديل بروفايل يوزر مانجر: ${initialProfile?.name}` : 'إنشاء بروفايل يوزر مانجر جديد (WinBox كامل)'}
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
              onClick={() => setActiveTab('profile')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'profile'
                  ? 'text-purple-400 border-purple-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>عام البروفايل (Profile)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('limitation')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'limitation'
                  ? 'text-purple-400 border-purple-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>قيود السرعة والبيانات (Limitations)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`px-3.5 py-2 font-bold rounded-t-xl transition-all border-b-2 whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'schedule'
                  ? 'text-purple-400 border-purple-500 bg-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>الأيام والأوقات المجدولة (Schedule)</span>
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

            {/* TAB: PROFILE GENERAL */}
            {activeTab === 'profile' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      اسم البروفايل (Name) <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="مثال: UM-Monthly-5M أو VIP-Unlimited"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">
                      اسم العرض للمستخدمين (Name for Users)
                    </label>
                    <input
                      type="text"
                      value={nameForUsers}
                      onChange={e => setNameForUsers(e.target.value)}
                      placeholder="الاسم الظاهر في بطاقة المشترك أو صفحة الدخول"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">المالك (Owner / Customer)</label>
                    <input
                      type="text"
                      value={owner}
                      onChange={e => setOwner(e.target.value)}
                      placeholder="admin"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">سعر الباقة (Price)</label>
                    <input
                      type="number"
                      min={0}
                      value={price}
                      onChange={e => setPrice(Number(e.target.value) || 0)}
                      placeholder="25"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Validity Picker */}
                <ValidityDurationPicker
                  value={validity}
                  onChange={setValidity}
                  colorTheme="purple"
                  label="صلاحية باقة اليوزر مانجر (Validity)"
                  subLabel="تحديد مدة صلاحية الباقة بالأيام والساعات والدقائق والثواني أو إدخال يدوي حر"
                />

                {/* Shared Devices (Override Shared Users) & Accounting Start (Starts At) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                  {/* Override Shared Users */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                        <Users className="w-4 h-4 text-purple-400" />
                        <span>عدد الأجهزة المشاركة (Override Shared Users)</span>
                        <span className="text-red-400">*</span>
                      </label>
                      <span className="text-[10px] text-purple-400 font-mono font-bold">
                        {overrideSharedUsers ? `${overrideSharedUsers} جهاز` : 'افتراضي (1)'}
                      </span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={overrideSharedUsers || 1}
                      onChange={e => setOverrideSharedUsers(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      placeholder="1"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500 font-bold"
                      required
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500">خيارات سريعة:</span>
                      {[1, 2, 3, 5, 10].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setOverrideSharedUsers(n)}
                          className={`px-2 py-0.5 text-[10px] rounded-lg font-mono font-bold transition-all cursor-pointer border ${
                            overrideSharedUsers === n
                              ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                          }`}
                        >
                          {n === 1 ? '1 جهاز (افتراضي)' : `${n} أجهزة`}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 block">
                      تجاوز عدد الأجهزة المتزامنة المسوح لها بالدخول بنفس كرت اليوزر مانجر في وقت واحد
                    </span>
                  </div>

                  {/* Starts At (Accounting Start) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-200 font-bold flex items-center gap-1.5 text-xs">
                        <Clock className="w-4 h-4 text-purple-400" />
                        <span>بداية الحساب (Starts At)</span>
                        <span className="text-red-400">*</span>
                      </label>
                      <span className="text-[10px] text-purple-400 font-mono font-bold">
                        {startsAt === 'at-creation' ? 'فور التوليد' : startsAt === 'now' ? 'الآن' : 'أول تسجيل دخول'}
                      </span>
                    </div>
                    <select
                      value={startsAt}
                      onChange={e => setStartsAt(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <option value="first-auth">first-auth (عند أول تسجيل دخول للمشترك - الأكثر استخداماً)</option>
                      <option value="at-creation">at-creation (فور توليد أو إنشاء الكرت في النظام)</option>
                      <option value="now">now (لحظياً الآن)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {startsAt === 'first-auth'
                        ? 'يبدأ احتساب صلاحية كرت اليوزر مانجر فقط عند أول مصادقة/تسجيل دخول ناجح للعميل.'
                        : startsAt === 'at-creation'
                        ? 'يبدأ العد التنازلي لمدة الكرت فوراً لحظة طباعته أو توليده في النظام.'
                        : 'يبدأ الحساب فور تطبيق هذا الخيار الآن.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LIMITATION */}
            {activeTab === 'limitation' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold">اسم قيد السرعة (Limitation Name)</label>
                  <input
                    type="text"
                    value={limitationName}
                    onChange={e => setLimitationName(e.target.value)}
                    placeholder={`مثال: Lim-${name || '5M-30GB'}`}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-purple-400" />
                      <span>السرعة القصوى (Rate Limit: Rx/Tx)</span>
                    </label>
                    <input
                      type="text"
                      value={rateLimit}
                      onChange={e => setRateLimit(e.target.value)}
                      placeholder="2M/8M أو 5M/20M"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-slate-400" />
                      <span>السرعة الأدنى المضمونة (Min Rate: Rx/Tx)</span>
                    </label>
                    <input
                      type="text"
                      value={rateLimitMin}
                      onChange={e => setRateLimitMin(e.target.value)}
                      placeholder="1M/2M"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">إجمالي النقل (Transfer Limit MB)</label>
                    <input
                      type="number"
                      min={0}
                      value={transferLimitMb}
                      onChange={e => setTransferLimitMb(Number(e.target.value) || 0)}
                      placeholder="30720 (30 GB)"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">حد التنزيل (Download Limit MB)</label>
                    <input
                      type="number"
                      min={0}
                      value={downloadLimitMb}
                      onChange={e => setDownloadLimitMb(Number(e.target.value) || 0)}
                      placeholder="25600"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">حد الرفع (Upload Limit MB)</label>
                    <input
                      type="number"
                      min={0}
                      value={uploadLimitMb}
                      onChange={e => setUploadLimitMb(Number(e.target.value) || 0)}
                      placeholder="5120"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Uptime Limit Picker */}
                <ValidityDurationPicker
                  value={uptimeLimit}
                  onChange={setUptimeLimit}
                  colorTheme="purple"
                  label="حد وقت الاستخدام النشط (Uptime Limit)"
                  subLabel="الوقت الإجمالي التراكمي المسموح به للمشترك (مثال: 12h أو 30d أو 0s لغير محدود)"
                />
              </div>
            )}

            {/* TAB: SCHEDULE */}
            {activeTab === 'schedule' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">وقت بدء الصلاحية اليومي (From Time)</label>
                    <input
                      type="text"
                      value={fromTime}
                      onChange={e => setFromTime(e.target.value)}
                      placeholder="00:00:00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-slate-300 font-bold">وقت انتهاء الصلاحية اليومي (Till Time)</label>
                    <input
                      type="text"
                      value={tillTime}
                      onChange={e => setTillTime(e.target.value)}
                      placeholder="23:59:59"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>

                {/* Weekdays Multi-selection */}
                <div className="space-y-2 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-200 font-bold flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-purple-400" />
                      <span>أيام الأسبوع النشطة (Active Weekdays):</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedWeekdays(allWeekdays.map(w => w.id))}
                        className="text-[10px] text-purple-400 hover:text-purple-300 cursor-pointer"
                      >
                        تحديد الكل
                      </button>
                      <span className="text-slate-600">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedWeekdays([])}
                        className="text-[10px] text-slate-400 hover:text-slate-300 cursor-pointer"
                      >
                        إلغاء الكل
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    {allWeekdays.map(day => {
                      const isSelected = selectedWeekdays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleWeekday(day.id)}
                          className={`p-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          <span>{day.nameAr}</span>
                          <span className="text-[10px] font-mono text-slate-500">{day.id.substring(0, 3)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* LIVE TERMINAL PREVIEW */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-purple-400" />
                  <span>معاينة أوامر اليوزر مانجر الفعلية (RouterOS CLI Commands):</span>
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
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black shadow-lg shadow-purple-600/30 flex items-center gap-2 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isEditing ? 'حفظ التعديلات والتطبيق' : 'إنشاء وتطبيق بروفايل اليوزر مانجر'}</span>
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
        systemType="userman"
        isEditing={isEditing}
        profileName={name}
        summaryItems={summaryItems}
        cliCommand={generatedCli}
      />
    </>
  );
};
