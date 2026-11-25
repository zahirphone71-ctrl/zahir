import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { HotspotProfile, PPPProfile, UsermanProfile } from '../types/mikrotik';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  Edit2,
  Radio,
  Network,
  UserCheck,
  Clock,
  Zap,
  Users,
  Search,
  Copy,
  Check,
  RefreshCw,
  FileDown,
  CopyPlus
} from 'lucide-react';
import { routerProfilesApi } from '../api/routerProfiles';
import { HotspotProfileModal } from './profiles/HotspotProfileModal';
import { PPPProfileModal } from './profiles/PPPProfileModal';
import { UsermanProfileModal } from './profiles/UsermanProfileModal';
import { ProfileConfirmDeleteModal } from './profiles/ProfileConfirmDeleteModal';
import { PdfExportModal } from './PdfExportModal';
import { formatRateLimit, formatDurationArabic } from '../lib/formatters';

export const ProfilesManagerView: React.FC = () => {
  const {
    router,
    isConnected,
    profiles: hotspotProfiles,
    pppProfiles,
    usermanProfiles,
    users: hotspotUsers,
    pppSecrets,
    usermanUsers,
    refreshProfiles,
    showToast,
    isSyncingHotspot,
    isSyncingPPP
  } = useMikroTik();

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const isSyncingProfiles = isManualRefreshing || isSyncingHotspot || isSyncingPPP;
  const isRosV6 = router?.majorVersion === 6 || /^6\./.test(router?.version || '');

  const handleManualRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      await refreshProfiles();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'hotspot' | 'pppoe' | 'userman'>('hotspot');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  // Modal States
  const [isHsModalOpen, setIsHsModalOpen] = useState(false);
  const [editingHs, setEditingHs] = useState<HotspotProfile | null>(null);

  const [isPppModalOpen, setIsPppModalOpen] = useState(false);
  const [editingPpp, setEditingPpp] = useState<PPPProfile | null>(null);

  const [isUmModalOpen, setIsUmModalOpen] = useState(false);
  const [editingUm, setEditingUm] = useState<UsermanProfile | null>(null);

  // PDF Export Modal State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // Profile Duplication Handlers
  const handleDuplicateHotspot = (prof: HotspotProfile) => {
    setEditingHs({
      ...prof,
      id: '',
      name: `${prof.name}-copy`
    });
    setIsHsModalOpen(true);
  };

  const handleDuplicatePpp = (prof: PPPProfile) => {
    setEditingPpp({
      ...prof,
      id: '',
      name: `${prof.name}-copy`
    });
    setIsPppModalOpen(true);
  };

  const handleDuplicateUm = (prof: UsermanProfile) => {
    setEditingUm({
      ...prof,
      id: '',
      name: `${prof.name}-copy`
    });
    setIsUmModalOpen(true);
  };

  // Delete Confirmation Modal State
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    type: 'hotspot' | 'pppoe' | 'userman';
    assignedCount: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered Lists
  const filteredHotspotProfiles = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    if (!Array.isArray(hotspotProfiles)) return [];
    if (!q) return hotspotProfiles;
    return hotspotProfiles.filter(
      p =>
        p && (
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.rateLimit || '').toLowerCase().includes(q) ||
          String(p.addressPool || '').toLowerCase().includes(q)
        )
    );
  }, [hotspotProfiles, searchQuery]);

  const filteredPPPProfiles = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    if (!Array.isArray(pppProfiles)) return [];
    if (!q) return pppProfiles;
    return pppProfiles.filter(
      p =>
        p && (
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.rateLimit || '').toLowerCase().includes(q) ||
          String(p.localAddress || '').toLowerCase().includes(q) ||
          String(p.remoteAddress || '').toLowerCase().includes(q)
        )
    );
  }, [pppProfiles, searchQuery]);

  const filteredUsermanProfiles = useMemo(() => {
    const q = (searchQuery || '').toLowerCase().trim();
    if (!Array.isArray(usermanProfiles)) return [];
    if (!q) return usermanProfiles;
    return usermanProfiles.filter(
      p =>
        p && (
          String(p.name || '').toLowerCase().includes(q) ||
          String(p.nameForUsers || '').toLowerCase().includes(q) ||
          String(p.rateLimit || '').toLowerCase().includes(q) ||
          String(p.owner || '').toLowerCase().includes(q)
        )
    );
  }, [usermanProfiles, searchQuery]);

  // Statistics Calculations
  const stats = useMemo(() => {
    const totalHs = hotspotProfiles.length;
    const totalPpp = pppProfiles.length;
    const totalUm = usermanProfiles.length;

    const hsLinkedCount = hotspotUsers.length;
    const pppLinkedCount = pppSecrets.length;
    const umLinkedCount = usermanUsers.length;

    return {
      totalHs,
      totalPpp,
      totalUm,
      currentTotal: activeTab === 'hotspot' ? totalHs : activeTab === 'pppoe' ? totalPpp : totalUm,
      currentLinkedUsers: activeTab === 'hotspot' ? hsLinkedCount : activeTab === 'pppoe' ? pppLinkedCount : umLinkedCount
    };
  }, [hotspotProfiles, pppProfiles, usermanProfiles, hotspotUsers, pppSecrets, usermanUsers, activeTab]);

  // Handle Copy CLI for a profile
  const handleCopyProfileCli = async (prof: HotspotProfile | PPPProfile | UsermanProfile, type: 'hotspot' | 'pppoe' | 'userman') => {
    const q = (v: unknown) => String(v ?? '').replace(/["\\]/g, '');
    let cli = '';
    if (type === 'hotspot') {
      const p = prof as HotspotProfile;
      cli = `/ip hotspot user profile add name="${q(p.name)}" rate-limit="${q(p.rateLimit || '')}" shared-users=${Number(p.sharedUsers) || 1} address-pool="${q(p.addressPool || 'none')}" idle-timeout="${q(p.idleTimeout || '00:05:00')}" keepalive-timeout="${q(p.keepaliveTimeout || '00:02:00')}" status-autorefresh="${q(p.statusAutorefresh || '00:01:00')}"`;
    } else if (type === 'pppoe') {
      const p = prof as PPPProfile;
      cli = `/ppp profile add name="${q(p.name)}" local-address="${q(p.localAddress || 'none')}" remote-address="${q(p.remoteAddress || 'none')}" rate-limit="${q(p.rateLimit || '')}" dns-server="${q(p.dnsServer || '8.8.8.8')}" only-one=${q(p.onlyOne || 'yes')}`;
    } else {
      const p = prof as UsermanProfile;
      const baseRate = (p.rateLimit || '').trim().split(/\s+/)[0] || '';
      const [rx = '', tx = ''] = baseRate.split('/');
      if (isRosV6) {
        cli = `/tool user-manager profile add name="${q(p.name)}" name-for-users="${q(p.nameForUsers || p.name)}" owner="${q(p.owner || 'admin')}" price=${Number(p.price) || 0}${p.validity && p.validity !== '0s' ? ` validity="${q(p.validity)}"` : ''} starts-at=${p.startsAt === 'at-creation' ? 'create-and-activate' : 'logon'} override-shared-users=${Number(p.overrideSharedUsers) || 1}\n/tool user-manager profile limitation add name="Lim-${q(p.name)}" owner="${q(p.owner || 'admin')}"${rx ? ` rate-limit-rx="${q(rx)}"` : ''}${tx ? ` rate-limit-tx="${q(tx)}"` : ''}`;
      } else {
        cli = `/user-manager profile add name="${q(p.name)}" name-for-users="${q(p.nameForUsers || p.name)}" price=${Number(p.price) || 0}${p.validity && p.validity !== '0s' ? ` validity="${q(p.validity)}"` : ''} starts-when=${p.startsAt === 'at-creation' ? 'assigned' : 'first-auth'}\n/user-manager limitation add name="Lim-${q(p.name)}"${rx ? ` rate-limit-rx="${q(rx)}"` : ''}${tx ? ` rate-limit-tx="${q(tx)}"` : ''}`;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cli);
      } else {
        throw new Error('Clipboard API not supported');
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = cli;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopiedId(prof.id);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2500);
  };

  // Trigger Delete Confirmation
  const promptDeleteProfile = (id: string, name: string, type: 'hotspot' | 'pppoe' | 'userman') => {
    let assignedCount = 0;
    if (type === 'hotspot') {
      assignedCount = hotspotUsers.filter(u => u.profile === name).length;
    } else if (type === 'pppoe') {
      assignedCount = pppSecrets.filter(s => s.profile === name).length;
    } else {
      assignedCount = usermanUsers.filter(u => u.profile === name).length;
    }

    setDeleteTarget({ id, name, type, assignedCount });
  };

  // Execute Deletion after explicit user confirmation
  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    if (!isConnected) {
      showToast('يجب الاتصال براوتر المايكروتك أولاً قبل حذف البروفايل', 'error');
      setDeleteTarget(null);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await routerProfilesApi.delete(
        deleteTarget.type,
        deleteTarget.id || deleteTarget.name,
        deleteTarget.name
      );
      if (res && res.success) {
        showToast(res.message || `تم حذف البروفايل (${deleteTarget.name}) بنجاح`, 'success');
        await refreshProfiles(deleteTarget.type);
      } else {
        showToast(res?.message || `تعذر حذف البروفايل (${deleteTarget.name})`, 'error');
      }
      setDeleteTarget(null);
    } catch (err: any) {
      showToast(err?.message || 'حدث خطأ أثناء حذف البروفايل', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200" dir="rtl">
      {/* Top Header & Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <SlidersHorizontal className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-black text-white">إدارة وتكوين البروفايلات (WinBox Parity)</h2>
            </div>
            <p className="text-xs text-slate-400">
              إنشاء وإدارة بروفايلات السرعة والتحكم في ZCtrl بنفس دقة وحقول WinBox الحقيقية مع التأكيد والتحذير قبل الحفظ والحذف.
            </p>
          </div>

          {/* Action Buttons: Refresh from Router & New Profile */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isSyncingProfiles}
              title="تحديث وجلب البروفايلات الحقيقية من المايكروتك الآن"
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all flex items-center gap-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncingProfiles ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline">{isSyncingProfiles ? 'جاري الجلب...' : 'تحديث من الراوتر'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              className="p-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/30 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95"
              title="تصدير تقرير شامل للبروفايلات كملف PDF"
            >
              <FileDown className="w-4 h-4 text-rose-400" />
              <span>تصدير PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isConnected) {
                  showToast('يرجى الاتصال براوتر المايكروتك أولاً لإضافة بروفايل جديد مباشرة على الراوتر', 'error');
                  return;
                }
                if (activeTab === 'hotspot') {
                  setEditingHs(null);
                  setIsHsModalOpen(true);
                } else if (activeTab === 'pppoe') {
                  setEditingPpp(null);
                  setIsPppModalOpen(true);
                } else {
                  setEditingUm(null);
                  setIsUmModalOpen(true);
                }
              }}
              className={`px-5 py-2.5 rounded-2xl text-white font-black text-xs shadow-lg flex items-center gap-2 transition-all transform active:scale-95 cursor-pointer ${
                activeTab === 'hotspot'
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                  : activeTab === 'pppoe'
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                  : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>
                {activeTab === 'hotspot'
                  ? 'إضافة بروفايل هوتسبوت (WinBox)'
                  : activeTab === 'pppoe'
                  ? 'إضافة بروفايل برودباند PPPoE'
                  : 'إضافة بروفايل يوزر مانجر'}
              </span>
            </button>
          </div>
        </div>

        {/* Stats Summary Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">إجمالي بروفايلات النظام النشط</span>
            <div className="text-base font-black text-white font-mono mt-0.5">{stats.currentTotal} بروفايل</div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">المشتركون المرتبطون بالنظام</span>
            <div className="text-base font-black text-emerald-400 font-mono mt-0.5">{stats.currentLinkedUsers} مشترك</div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">بروفايلات الهوتسبوت / PPPoE</span>
            <div className="text-base font-black text-blue-400 font-mono mt-0.5">{stats.totalHs} / {stats.totalPpp}</div>
          </div>

          <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block font-medium">بروفايلات اليوزر مانجر</span>
            <div className="text-base font-black text-purple-400 font-mono mt-0.5">{stats.totalUm} باقة</div>
          </div>
        </div>
      </div>

      {/* System Tabs Switcher & Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-2 rounded-2xl">
        {/* System Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          <button
            type="button"
            onClick={() => setActiveTab('hotspot')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'hotspot'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>بروفايلات الهوتسبوت ({hotspotProfiles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pppoe')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'pppoe'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Network className="w-3.5 h-3.5" />
            <span>بروفايلات PPPoE ({pppProfiles.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('userman')}
            className={`px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'userman'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>اليوزر مانجر ({usermanProfiles.length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم أو السرعة أو المسبح..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pr-9 pl-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. HOTSPOT PROFILES GRID */}
      {/* ============================================================== */}
      {activeTab === 'hotspot' && (
        <div className="space-y-4">
          {filteredHotspotProfiles.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800 p-6 space-y-3">
              <Radio className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-300">لا توجد بروفايلات هوتسبوت مطابقة</h3>
              <p className="text-xs text-slate-500">
                {searchQuery ? 'جرّب تعديل نص البحث' : 'اضغط على زر إضافة بروفايل هوتسبوت للبدء في الإدخال اليدوي الكامل'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredHotspotProfiles.map(prof => {
                const assignedCount = hotspotUsers.filter(u => u.profile === prof.name).length;
                const isDefault = String(prof.name || '').trim().toLowerCase() === 'default';

                return (
                  <div
                    key={prof.id}
                    className="bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-3xl p-5 shadow-lg hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      {/* Top Row: Name, System Tag, Actions */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-base font-black text-white font-mono">{prof.name}</h3>
                            {isDefault && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                Default (افتراضي)
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Pool: <strong className="text-slate-200">{prof.addressPool || 'none'}</strong>
                          </span>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyProfileCli(prof, 'hotspot')}
                            title="نسخ أمر RouterOS CLI"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-blue-600/30 text-slate-300 hover:text-blue-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            {copiedId === prof.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicateHotspot(prof)}
                            title="استنساخ وإنشاء بروفايل جديد مشتق"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-indigo-600/30 text-slate-300 hover:text-indigo-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingHs(prof);
                              setIsHsModalOpen(true);
                            }}
                            title="تعديل البروفايل يدوياً"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => promptDeleteProfile(prof.id, prof.name, 'hotspot')}
                              title="حذف البروفايل مع التحذير"
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Speed Badge */}
                      <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">السرعة (Rate Limit)</span>
                            <span className="text-xs font-black text-amber-300 font-mono">
                              {formatRateLimit(prof.rateLimit)}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-bold bg-blue-950/60 text-blue-300 px-2.5 py-1 rounded-xl border border-blue-800/50">
                          {prof.sharedUsers && Number(prof.sharedUsers) > 1 ? `${prof.sharedUsers} أجهزة مشتركة` : 'جهاز واحد'}
                        </span>
                      </div>

                      {/* Parameters Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">مهلة الخمول (Idle)</span>
                          <span className="font-mono text-slate-200 font-bold">{prof.idleTimeout && prof.idleTimeout !== 'none' ? prof.idleTimeout : 'مفتوح (none)'}</span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">مهلة الجلسة (Session)</span>
                          <span className="font-mono text-slate-200 font-bold">
                            {prof.sessionTimeout && prof.sessionTimeout !== '00:00:00' && prof.sessionTimeout !== 'none' ? prof.sessionTimeout : 'مفتوح'}
                          </span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">كوكيز الماك (Cookie)</span>
                          <span className="font-mono text-slate-200 font-bold">{prof.macCookieTimeout && prof.macCookieTimeout !== 'none' ? prof.macCookieTimeout : 'معطل'}</span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">الطابور (Queue)</span>
                          <span className="font-mono text-slate-200 font-bold truncate block">{prof.queueType || 'default'}</span>
                        </div>
                      </div>

                      {/* Feature Indicators */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        {prof.validity ? (
                          <span className="text-[10px] bg-blue-950/60 text-blue-300 border border-blue-800/40 px-2 py-0.5 rounded-lg font-bold">
                            الصلاحية: {formatDurationArabic(prof.validity)}
                          </span>
                        ) : prof.validityDays && prof.validityDays > 0 ? (
                          <span className="text-[10px] bg-blue-950/60 text-blue-300 border border-blue-800/40 px-2 py-0.5 rounded-lg font-bold">
                            الصلاحية: {formatDurationArabic(`${prof.validityDays}d`)}
                          </span>
                        ) : prof.sessionTimeout && prof.sessionTimeout !== '00:00:00' && prof.sessionTimeout !== 'none' ? (
                          <span className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/40 px-2 py-0.5 rounded-lg font-bold">
                            مهلة الجلسة: {formatDurationArabic(prof.sessionTimeout)}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-800/60 text-slate-400 border border-slate-700/40 px-2 py-0.5 rounded-lg font-medium">
                            بدون تحديد صلاحية (مفتوح)
                          </span>
                        )}
                        <span className="text-[10px] bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          <span>{prof.startsAt === 'at-creation' ? 'بدء الحساب: فور التوليد' : 'بدء الحساب: أول دخول'}</span>
                        </span>
                        {prof.transparentProxy && (
                          <span className="text-[10px] bg-cyan-950/50 text-cyan-400 border border-cyan-800/40 px-2 py-0.5 rounded-lg">
                            Proxy
                          </span>
                        )}
                        {prof.advertise && (
                          <span className="text-[10px] bg-indigo-950/50 text-indigo-400 border border-indigo-800/40 px-2 py-0.5 rounded-lg">
                            Advertise
                          </span>
                        )}
                        {prof.onLoginScript && (
                          <span className="text-[10px] bg-emerald-950/50 text-emerald-400 border border-emerald-800/40 px-2 py-0.5 rounded-lg" title={prof.onLoginScript}>
                            On-Login Script
                          </span>
                        )}
                        {prof.dataQuotaMb && prof.dataQuotaMb > 0 ? (
                          <span className="text-[10px] bg-purple-950/50 text-purple-400 border border-purple-800/40 px-2 py-0.5 rounded-lg">
                            {prof.dataQuotaMb} MB
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Footer Row: Assigned Users & Price */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>المشتركون النشطون: <strong className="text-white font-mono">{assignedCount}</strong></span>
                      </span>

                      {prof.price && prof.price > 0 ? (
                        <span className="font-black text-emerald-400 font-mono bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-800/40">
                          {prof.price} ر.ي
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">بدون تسعير</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. PPPoE PROFILES GRID */}
      {/* ============================================================== */}
      {activeTab === 'pppoe' && (
        <div className="space-y-4">
          {filteredPPPProfiles.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800 p-6 space-y-3">
              <Network className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-300">لا توجد بروفايلات PPPoE مطابقة</h3>
              <p className="text-xs text-slate-500">
                {searchQuery ? 'جرّب تعديل نص البحث' : 'اضغط على زر إضافة بروفايل برودباند PPPoE لإنشاء بروفايل WinBox جديد'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPPPProfiles.map(prof => {
                const assignedCount = pppSecrets.filter(s => s.profile === prof.name).length;
                const lowerName = String(prof.name || '').trim().toLowerCase();
                const isDefault = lowerName === 'default' || lowerName === 'default-encryption';

                return (
                  <div
                    key={prof.id}
                    className="bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-3xl p-5 shadow-lg hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      {/* Top Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="text-base font-black text-white font-mono">{prof.name}</h3>
                            {isDefault && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                Default
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Local: <strong className="text-slate-200">{prof.localAddress || 'none'}</strong>
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyProfileCli(prof, 'pppoe')}
                            title="نسخ أمر RouterOS CLI"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-emerald-600/30 text-slate-300 hover:text-emerald-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            {copiedId === prof.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicatePpp(prof)}
                            title="استنساخ وإنشاء بروفايل جديد مشتق"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-emerald-600/30 text-slate-300 hover:text-emerald-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingPpp(prof);
                              setIsPppModalOpen(true);
                            }}
                            title="تعديل البروفايل"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {!isDefault && (
                            <button
                              type="button"
                              onClick={() => promptDeleteProfile(prof.id, prof.name, 'pppoe')}
                              title="حذف البروفايل"
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Speed Badge */}
                      <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">السرعة (Rate Limit)</span>
                            <span className="text-xs font-black text-emerald-300 font-mono">
                              {formatRateLimit(prof.rateLimit)}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-bold bg-emerald-950/60 text-emerald-300 px-2.5 py-1 rounded-xl border border-emerald-800/50">
                          {prof.sharedUsers && Number(prof.sharedUsers) > 1 ? `${prof.sharedUsers} أجهزة مشتركة` : prof.onlyOne === 'no' ? 'متعدد الأجهزة' : 'جهاز واحد'}
                        </span>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">الصلاحية</span>
                          <span className="font-mono text-emerald-300 font-bold">
                            {prof.validity
                              ? formatDurationArabic(prof.validity)
                              : prof.validityDays && prof.validityDays > 0
                              ? formatDurationArabic(`${prof.validityDays}d`)
                              : 'غير محددة (مفتوحة)'}
                          </span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">مسبح العميل (Remote)</span>
                          <span className="font-mono text-slate-200 font-bold truncate block">{prof.remoteAddress || 'none'}</span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">خوادم DNS</span>
                          <span className="font-mono text-slate-200 font-bold truncate block">{prof.dnsServer || 'none'}</span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">التشفير (Encryption)</span>
                          <span className="font-mono text-slate-200 font-bold">{prof.useEncryption ? String(prof.useEncryption) : 'yes'}</span>
                        </div>
                      </div>

                      {/* PPP Feature Indicators */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-400" />
                          <span>{prof.startsAt === 'at-creation' ? 'بدء الحساب: فور التفعيل' : 'بدء الحساب: أول اتصال'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>مشتركو PPPoE: <strong className="text-white font-mono">{assignedCount}</strong></span>
                      </span>

                      {prof.price && prof.price > 0 ? (
                        <span className="font-black text-emerald-400 font-mono bg-emerald-950/40 px-2.5 py-1 rounded-xl border border-emerald-800/40">
                          {prof.price} ر.ي / شهر
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">بدون تسعير</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. USER MANAGER PROFILES GRID */}
      {/* ============================================================== */}
      {activeTab === 'userman' && (
        <div className="space-y-4">
          {filteredUsermanProfiles.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/50 rounded-3xl border border-dashed border-slate-800 p-6 space-y-3">
              <UserCheck className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-300">لا توجد باقات يوزر مانجر مطابقة</h3>
              <p className="text-xs text-slate-500">
                {searchQuery ? 'جرّب تعديل نص البحث' : 'اضغط على زر إضافة بروفايل يوزر مانجر لإنشاء باقة وقيود WinBox كاملة'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredUsermanProfiles.map(prof => {
                const assignedCount = usermanUsers.filter(u => u.profile === prof.name).length;

                return (
                  <div
                    key={prof.id}
                    className="bg-slate-900 border border-slate-800 hover:border-purple-500/40 rounded-3xl p-5 shadow-lg hover:shadow-xl transition-all flex flex-col justify-between group relative overflow-hidden"
                  >
                    <div className="space-y-4">
                      {/* Top Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-black text-white font-mono">{prof.name}</h3>
                          {prof.nameForUsers && prof.nameForUsers !== prof.name && (
                            <span className="text-[11px] text-purple-300 font-bold block">
                              {prof.nameForUsers}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            Owner: <strong className="text-slate-300">{prof.owner || 'admin'}</strong>
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopyProfileCli(prof, 'userman')}
                            title="نسخ أمر RouterOS CLI"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-purple-600/30 text-slate-300 hover:text-purple-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            {copiedId === prof.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicateUm(prof)}
                            title="استنساخ وإنشاء باقة جديدة مشتقة"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-purple-600/30 text-slate-300 hover:text-purple-300 border border-slate-700 transition-all cursor-pointer"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingUm(prof);
                              setIsUmModalOpen(true);
                            }}
                            title="تعديل باقة اليوزر مانجر"
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {prof.name !== 'default' && (
                            <button
                              type="button"
                              onClick={() => promptDeleteProfile(prof.id, prof.name, 'userman')}
                              title="حذف الباقة"
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border border-slate-700 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Speed Badge */}
                      <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-purple-400 shrink-0" />
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">السرعة القصوى</span>
                            <span className="text-xs font-black text-purple-300 font-mono">
                              {formatRateLimit(prof.rateLimit)}
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono font-bold bg-purple-950/60 text-purple-300 px-2.5 py-1 rounded-xl border border-purple-800/50">
                          {prof.validity && prof.validity !== '0s' ? formatDurationArabic(prof.validity) : 'غير محددة (مفتوحة)'}
                        </span>
                      </div>

                      {/* Quota & Time Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">حصة البيانات (Quota)</span>
                          <span className="font-mono text-slate-200 font-bold">
                            {prof.dataQuotaMb || prof.transferLimitMb ? `${prof.dataQuotaMb || prof.transferLimitMb} MB` : 'مفتوح'}
                          </span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">حد الوقت (Uptime)</span>
                          <span className="font-mono text-slate-200 font-bold truncate block">
                            {prof.uptimeLimit || prof.timeLimit ? formatDurationArabic(prof.uptimeLimit || prof.timeLimit || '') : 'مفتوح'}
                          </span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">بدء الاحتساب</span>
                          <span className="text-slate-200 font-bold text-[10px]">
                            {prof.startsAt === 'first-auth' ? 'عند أول دخول' : 'عند الإنشاء'}
                          </span>
                        </div>

                        <div className="bg-slate-950/50 p-2 rounded-xl border border-slate-800/80 space-y-0.5">
                          <span className="text-slate-500 block text-[10px]">الأجهزة المتزامنة</span>
                          <span className="font-mono text-slate-200 font-bold">{prof.overrideSharedUsers ?? 1}</span>
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-500" />
                        <span>مشتركو الباقة: <strong className="text-white font-mono">{assignedCount}</strong></span>
                      </span>

                      <span className="font-black text-purple-400 font-mono bg-purple-950/40 px-2.5 py-1 rounded-xl border border-purple-800/40">
                        {prof.price || 0} ر.ي
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* MODALS */}
      {/* ============================================================== */}

      {/* 1. Hotspot Profile Modal */}
      <HotspotProfileModal
        isOpen={isHsModalOpen}
        onClose={() => setIsHsModalOpen(false)}
        onSave={async (prof, signal) => {
          if (!isConnected) {
            const msg = 'يرجى الاتصال براوتر المايكروتك أولاً لتنفيذ العملية مباشرة على الراوتر';
            showToast(msg, 'error');
            return { success: false, message: msg };
          }
          const isEdit = Boolean(editingHs?.id && editingHs.id.trim() !== '');
          const payload = {
            id: isEdit ? editingHs?.id : undefined,
            ...prof,
            serviceType: 'hotspot' as const,
            isEditing: isEdit,
            oldName: isEdit ? (editingHs?.name || prof.name) : undefined
          };
          const res = isEdit
            ? await routerProfilesApi.update(payload, signal)
            : await routerProfilesApi.create(payload, signal);
          
          if (res && res.success) {
            showToast(res.message || 'تم حفظ بروفايل الهوتسبوت بنجاح', 'success');
            await refreshProfiles('hotspot');
          } else {
            showToast(res?.message || 'فشلت عملية حفظ بروفايل الهوتسبوت', 'error');
          }
          return res;
        }}
        initialProfile={editingHs}
        existingProfiles={hotspotProfiles}
      />

      {/* 2. PPPoE Profile Modal */}
      <PPPProfileModal
        isOpen={isPppModalOpen}
        onClose={() => setIsPppModalOpen(false)}
        onSave={async (prof, signal) => {
          if (!isConnected) {
            const msg = 'يرجى الاتصال براوتر المايكروتك أولاً لتنفيذ العملية مباشرة على الراوتر';
            showToast(msg, 'error');
            return { success: false, message: msg };
          }
          const isEdit = Boolean(editingPpp?.id && editingPpp.id.trim() !== '');
          const payload = {
            id: isEdit ? editingPpp?.id : undefined,
            ...prof,
            serviceType: 'pppoe' as const,
            isEditing: isEdit,
            oldName: isEdit ? (editingPpp?.name || prof.name) : undefined
          };
          const res = isEdit
            ? await routerProfilesApi.update(payload, signal)
            : await routerProfilesApi.create(payload, signal);
          
          if (res && res.success) {
            showToast(res.message || 'تم حفظ بروفايل PPPoE بنجاح', 'success');
            await refreshProfiles('pppoe');
          } else {
            showToast(res?.message || 'فشلت عملية حفظ بروفايل PPPoE', 'error');
          }
          return res;
        }}
        initialProfile={editingPpp}
        existingProfiles={pppProfiles}
      />

      {/* 3. User Manager Profile Modal */}
      <UsermanProfileModal
        isOpen={isUmModalOpen}
        onClose={() => setIsUmModalOpen(false)}
        onSave={async (prof, signal) => {
          if (!isConnected) {
            const msg = 'يرجى الاتصال براوتر المايكروتك أولاً لتنفيذ العملية مباشرة على الراوتر';
            showToast(msg, 'error');
            return { success: false, message: msg };
          }
          const isEdit = Boolean(editingUm?.id && editingUm.id.trim() !== '');
          const payload = {
            id: isEdit ? editingUm?.id : undefined,
            ...prof,
            serviceType: 'userman' as const,
            isEditing: isEdit,
            oldName: isEdit ? (editingUm?.name || prof.name) : undefined
          };
          const res = isEdit
            ? await routerProfilesApi.update(payload, signal)
            : await routerProfilesApi.create(payload, signal);
          
          if (res && res.success) {
            showToast(res.message || 'تم حفظ باقة اليوزر مانجر بنجاح', 'success');
            await refreshProfiles('userman');
          } else {
            showToast(res?.message || 'فشلت عملية حفظ باقة اليوزر مانجر', 'error');
          }
          return res;
        }}
        initialProfile={editingUm}
        existingProfiles={usermanProfiles}
      />

      {/* 4. Delete Confirmation & Warning Modal */}
      {deleteTarget && (
        <ProfileConfirmDeleteModal
          isOpen={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleExecuteDelete}
          isDeleting={isDeleting}
          systemType={deleteTarget.type}
          profileName={deleteTarget.name}
          profileId={deleteTarget.id}
          assignedUsersCount={deleteTarget.assignedCount}
        />
      )}

      {/* 5. Formatted Profiles Report PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="profiles"
        customData={{ activeSystem: activeTab }}
        customTitle={`تقرير بروفايلات ${activeTab === 'hotspot' ? 'الهوتسبوت' : activeTab === 'pppoe' ? 'البرودباند PPPoE' : 'اليوزر مانجر'}`}
      />
    </div>
  );
};
