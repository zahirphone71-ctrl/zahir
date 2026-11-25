import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  WirelessInterface,
  WirelessClientStation,
  HotspotServerProfile,
  PingResult,
  RouterStorageFile
} from '../types/mikrotik';
import {
  Wifi,
  WifiOff,
  Radio,
  Globe,
  Layers,
  Settings,
  RefreshCw,
  Plus,
  Edit3,
  Trash2,
  Power,
  ShieldCheck,
  ShieldAlert,
  Check,
  FileCode,
  Folder,
  ExternalLink,
  CheckCircle2,
  Lock,
  Info,
  Search,
  X,
  Palette,
  Play,
  Terminal,
  Signal,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Copy,
  Zap,
  Server,
  Activity
} from 'lucide-react';
import { PortalStudioModal } from './PortalStudioModal';
import { AccessPointsSection } from './network/AccessPointsSection';
import { WirelessFrequencyScanner } from './network/WirelessFrequencyScanner';
import { AntiSharingModal } from './network/AntiSharingModal';
import { ConfirmModal } from './ConfirmModal';

export const NetworkView: React.FC = () => {
  const {
    router,
    isConnected,
    wirelessInterfaces,
    registrationTable,
    neighbors,
    remoteCaps,
    accessPoints,
    hotspotServerProfiles,
    hotspotServers,
    routerFiles,
    isLoadingWireless,
    isLoadingAntennas,
    isLoadingAccessPoints,
    isLoadingPortalProfiles,
    fetchWirelessData,
    updateWirelessInterface,
    toggleWirelessInterface,
    createVirtualAp,
    fetchAntennasData,
    kickWirelessClient,
    pingHost,
    deleteRouterFile,
    fetchHotspotServerProfiles,
    updateHotspotServerProfile,
    createHotspotServerProfile,
    showToast
  } = useMikroTik();

  const [activeSection, setActiveSection] = useState<'access-points' | 'wireless' | 'antennas' | 'scanner' | 'portals' | 'files' | 'audit'>('access-points');
  const [scannerTargetInterface, setScannerTargetInterface] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBand, setFilterBand] = useState<'all' | '2ghz' | '5ghz'>('all');
  const [filterSignal, setFilterSignal] = useState<'all' | 'strong' | 'medium' | 'weak'>('all');

  // Edit Wireless Modal State
  const [editingInterface, setEditingInterface] = useState<WirelessInterface | null>(null);
  const [editSsid, setEditSsid] = useState('');
  const [editFrequency, setEditFrequency] = useState('');
  const [editChannelWidth, setEditChannelWidth] = useState('');
  const [editBand, setEditBand] = useState('');
  const [editHideSsid, setEditHideSsid] = useState(false);
  const [editDisabled, setEditDisabled] = useState(false);
  const [editComment, setEditComment] = useState('');
  const [editTxPower, setEditTxPower] = useState('default');
  const [isSavingWireless, setIsSavingWireless] = useState(false);

  // Virtual AP (VAP) Modal State
  const [isVapModalOpen, setIsVapModalOpen] = useState(false);
  const [vapMaster, setVapMaster] = useState('');
  const [vapName, setVapName] = useState('');
  const [vapSsid, setVapSsid] = useState('');
  const [vapComment, setVapComment] = useState('');
  const [vapHideSsid, setVapHideSsid] = useState(false);
  const [isSavingVap, setIsSavingVap] = useState(false);

  // Edit Hotspot Server Profile Modal State
  const [editingProfile, setEditingProfile] = useState<HotspotServerProfile | null>(null);
  const [editHtmlDir, setEditHtmlDir] = useState('');
  const [editDnsName, setEditDnsName] = useState('');
  const [editHotspotAddress, setEditHotspotAddress] = useState('');
  const [editLoginBy, setEditLoginBy] = useState<string[]>([]);
  const [editCookieLifetime, setEditCookieLifetime] = useState('');
  const [editTrialLimit, setEditTrialLimit] = useState('');
  const [editTrialReset, setEditTrialReset] = useState('');
  const [editRateLimit, setEditRateLimit] = useState('');
  const [editSslCert, setEditSslCert] = useState('none');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Create New Profile Modal
  const [isNewProfileModalOpen, setIsNewProfileModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileHtmlDir, setNewProfileHtmlDir] = useState('hotspot');
  const [newProfileDnsName, setNewProfileDnsName] = useState('');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  // Live Hotspot Portal Studio Modal State
  const [isPortalStudioOpen, setIsPortalStudioOpen] = useState(false);
  const [studioSelectedProfile, setStudioSelectedProfile] = useState<HotspotServerProfile | null>(null);

  // Anti-Sharing & Anti-Tethering Modal State
  const [isAntiSharingOpen, setIsAntiSharingOpen] = useState(false);

  // Router File Deletion Confirmation State
  const [fileToDelete, setFileToDelete] = useState<RouterStorageFile | null>(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);

  // Live Router Ping Diagnostic Tool State
  const [pingTarget, setPingTarget] = useState('8.8.8.8');
  const [pingCount, setPingCount] = useState(4);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [isPinging, setIsPinging] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const copyToClipboard = async (text: string, label: string = 'النص') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast(`تم نسخ ${label}: ${text}`, 'info');
    } catch {
      showToast(`تعذر نسخ ${label} إلى الحافظة`, 'error');
    }
  };

  const handleOpenStudio = (profile?: HotspotServerProfile) => {
    setStudioSelectedProfile(profile || hotspotServerProfiles[0] || null);
    setIsPortalStudioOpen(true);
  };

  // Handle external navigation events (e.g. from Command Palette or Access Points overview)
  useEffect(() => {
    const handleOpenSection = (e: any) => {
      const section = e?.detail?.section || e?.detail;
      const targetIface = e?.detail?.iface;
      if (section && ['access-points', 'wireless', 'antennas', 'scanner', 'portals', 'files', 'audit'].includes(section)) {
        setActiveSection(section);
        if (targetIface) {
          setScannerTargetInterface(targetIface);
        }
      }
    };
    window.addEventListener('zctrl:open-network-section', handleOpenSection);
    return () => {
      window.removeEventListener('zctrl:open-network-section', handleOpenSection);
    };
  }, []);

  // Auto-refresh when viewing the tab
  useEffect(() => {
    if (isConnected) {
      fetchWirelessData();
      fetchAntennasData();
      fetchHotspotServerProfiles();
    }
  }, [isConnected, fetchWirelessData, fetchAntennasData, fetchHotspotServerProfiles]);

  // Handler for opening Wireless edit modal
  const handleOpenEditWireless = (iface: WirelessInterface) => {
    setEditingInterface(iface);
    setEditSsid(iface.ssid || '');
    setEditFrequency(iface.frequency ? String(iface.frequency) : 'auto');
    setEditChannelWidth(iface.channelWidth || '20/40mhz');
    setEditBand(iface.band || '2ghz-b/g/n');
    setEditHideSsid(!!iface.hideSsid);
    setEditDisabled(!!iface.disabled);
    setEditComment(iface.comment || '');
    setEditTxPower(iface.txPower || 'default');
  };

  // Quick Toggle Wireless Interface State (Enable / Disable)
  const handleToggleInterface = async (iface: WirelessInterface) => {
    const newDisabledState = !iface.disabled;
    await toggleWirelessInterface(iface.id, newDisabledState, iface.name);
  };

  // Save Wireless Settings
  const handleSaveWireless = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInterface) return;

    if (!editSsid.trim()) {
      showToast('يجب إدخال اسم للشبكة (SSID)', 'error');
      return;
    }

    setIsSavingWireless(true);
    try {
      const result = await updateWirelessInterface(editingInterface.id, {
        name: editingInterface.name,
        ssid: editSsid.trim(),
        frequency: editFrequency,
        channelWidth: editChannelWidth,
        band: editBand,
        hideSsid: editHideSsid,
        disabled: editDisabled,
        comment: editComment.trim(),
        txPower: editTxPower
      });

      if (!isMountedRef.current) return;
      if (result.success) {
        setEditingInterface(null);
      }
    } finally {
      if (isMountedRef.current) setIsSavingWireless(false);
    }
  };

  // Create Virtual AP (VAP)
  const handleCreateVap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vapMaster || !vapSsid.trim()) {
      showToast('يجب اختيار الواجهة الرئيسية وتحديد اسم الشبكة (SSID)', 'error');
      return;
    }

    setIsSavingVap(true);
    try {
      const result = await createVirtualAp({
        masterInterface: vapMaster,
        name: vapName.trim() || undefined,
        ssid: vapSsid.trim(),
        comment: vapComment.trim() || undefined,
        hideSsid: vapHideSsid
      });

      if (!isMountedRef.current) return;
      if (result.success) {
        setIsVapModalOpen(false);
        setVapName('');
        setVapSsid('');
        setVapComment('');
        setVapHideSsid(false);
      }
    } finally {
      if (isMountedRef.current) setIsSavingVap(false);
    }
  };

  // Handler for opening Hotspot Profile Edit modal
  const handleOpenEditProfile = (profile: HotspotServerProfile) => {
    setEditingProfile(profile);
    setEditHtmlDir(profile.htmlDirectory || 'hotspot');
    setEditDnsName(profile.dnsName || '');
    setEditHotspotAddress(profile.hotspotAddress || '');
    setEditLoginBy(Array.isArray(profile.loginBy) ? [...profile.loginBy] : ['http-chap', 'cookie']);
    setEditCookieLifetime(profile.httpCookieLifetime || '3d');
    setEditTrialLimit(profile.trialUptimeLimit || '0s');
    setEditTrialReset(profile.trialUptimeReset || '1d');
    setEditRateLimit(profile.rateLimit || '');
    setEditSslCert(profile.sslCertificate || 'none');
  };

  // Toggle login method in profile edit
  const toggleLoginMethod = (method: string) => {
    setEditLoginBy((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    );
  };

  // Save Hotspot Server Profile Settings
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    if (!editHtmlDir.trim()) {
      showToast('يجب تحديد مجلد صفحة تسجيل الدخول (HTML Directory)', 'error');
      return;
    }

    if (editLoginBy.length === 0) {
      showToast('يجب اختيار طريقة تسجيل دخول واحدة على الأقل', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      const result = await updateHotspotServerProfile(editingProfile.id, {
        name: editingProfile.name,
        htmlDirectory: editHtmlDir.trim(),
        dnsName: editDnsName.trim(),
        hotspotAddress: editHotspotAddress.trim(),
        loginBy: editLoginBy,
        httpCookieLifetime: editCookieLifetime.trim(),
        trialUptimeLimit: editTrialLimit.trim(),
        trialUptimeReset: editTrialReset.trim(),
        rateLimit: editRateLimit.trim(),
        sslCertificate: editSslCert
      });

      if (!isMountedRef.current) return;
      if (result.success) {
        setEditingProfile(null);
      }
    } finally {
      if (isMountedRef.current) setIsSavingProfile(false);
    }
  };

  // Create New Profile Submit
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) {
      showToast('اسم البروفايل مطلوب', 'error');
      return;
    }

    setIsCreatingProfile(true);
    try {
      const result = await createHotspotServerProfile({
        name: newProfileName.trim(),
        htmlDirectory: newProfileHtmlDir.trim() || 'hotspot',
        dnsName: newProfileDnsName.trim(),
        loginBy: ['http-chap', 'cookie']
      });

      if (!isMountedRef.current) return;
      if (result.success) {
        setIsNewProfileModalOpen(false);
        setNewProfileName('');
        setNewProfileHtmlDir('hotspot');
        setNewProfileDnsName('');
      }
    } finally {
      if (isMountedRef.current) setIsCreatingProfile(false);
    }
  };

  // Kick client state & handler
  const [clientToKick, setClientToKick] = useState<WirelessClientStation | null>(null);

  const handleKickClient = (client: WirelessClientStation) => {
    setClientToKick(client);
  };

  const handleConfirmKickClient = async () => {
    if (!clientToKick) return;
    await kickWirelessClient(clientToKick.id, clientToKick.macAddress);
    if (isMountedRef.current) setClientToKick(null);
  };

  // Confirm delete router file
  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    setIsDeletingFile(true);
    try {
      const res = await deleteRouterFile(fileToDelete.name, fileToDelete.id);
      if (isMountedRef.current && res.success) {
        setFileToDelete(null);
      }
    } finally {
      if (isMountedRef.current) setIsDeletingFile(false);
    }
  };

  // Run Real Router Ping Diagnostic
  const handleRunPing = async (e?: React.FormEvent, targetOverride?: string, countOverride?: number) => {
    if (e) e.preventDefault();
    const target = (targetOverride || pingTarget || '').trim();
    const count = countOverride || pingCount || 4;
    if (!target) {
      showToast('الرجاء إدخال عنوان IP أو دومين للفحص', 'error');
      return;
    }

    if (targetOverride) {
      setPingTarget(targetOverride);
    }

    setIsPinging(true);
    try {
      const res = await pingHost(target, count);
      if (!isMountedRef.current) return;
      if (res.success && res.data) {
        setPingResult(res.data);
        showToast(`اكتمل الفحص: فقدان الحزم ${res.data.packetLoss}% - متوسط الاستجابة ${res.data.avgTime}ms`, 'success');
      } else {
        showToast(res.message || 'فشل تنفيذ أمر فحص الاتصال', 'error');
      }
    } catch {
      if (isMountedRef.current) showToast('تعذر إجراء فحص الاتصال', 'error');
    } finally {
      if (isMountedRef.current) setIsPinging(false);
    }
  };

  // Filtered Wireless Interfaces
  const filteredWireless = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return (wirelessInterfaces || []).filter((w) => {
      if (!w) return false;
      const name = (w.name || '').toLowerCase();
      const ssid = (w.ssid || '').toLowerCase();
      const comment = (w.comment || '').toLowerCase();
      const mac = (w.macAddress || '').toLowerCase();

      const matchSearch =
        !term ||
        name.includes(term) ||
        ssid.includes(term) ||
        comment.includes(term) ||
        mac.includes(term);

      const matchBand =
        filterBand === 'all' ||
        (filterBand === '2ghz' && ((w.band || '').includes('2ghz') || (typeof w.frequency === 'number' && w.frequency < 3000))) ||
        (filterBand === '5ghz' && ((w.band || '').includes('5ghz') || (typeof w.frequency === 'number' && w.frequency > 4000)));

      return matchSearch && matchBand;
    });
  }, [wirelessInterfaces, searchTerm, filterBand]);

  // Filtered Connected Antennas (Registration Table)
  const filteredStations = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return (registrationTable || []).filter((r) => {
      if (!r) return false;
      const mac = (r.macAddress || '').toLowerCase();
      const iface = (r.interface || '').toLowerCase();
      const comment = (r.comment || '').toLowerCase();

      const matchSearch = !term || mac.includes(term) || iface.includes(term) || comment.includes(term);

      const sigStr = r.signalStrength || '';
      const sigNum = parseInt(sigStr.replace(/[^0-9-]/g, ''), 10);
      let matchSignal = true;
      if (filterSignal === 'strong') matchSignal = !isNaN(sigNum) && sigNum >= -65;
      else if (filterSignal === 'medium') matchSignal = !isNaN(sigNum) && sigNum < -65 && sigNum >= -80;
      else if (filterSignal === 'weak') matchSignal = !isNaN(sigNum) && sigNum < -80;

      return matchSearch && matchSignal;
    });
  }, [registrationTable, searchTerm, filterSignal]);

  const filteredNeighbors = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return (neighbors || []).filter((n) => {
      if (!n) return false;
      const identity = (n.identity || '').toLowerCase();
      const platform = (n.platform || '').toLowerCase();
      const board = (n.board || '').toLowerCase();
      const address = (n.address || '').toLowerCase();
      const mac = (n.macAddress || '').toLowerCase();

      return (
        !term ||
        identity.includes(term) ||
        platform.includes(term) ||
        board.includes(term) ||
        address.includes(term) ||
        mac.includes(term)
      );
    });
  }, [neighbors, searchTerm]);

  const filteredServerProfiles = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return (hotspotServerProfiles || []).filter((p) => {
      if (!p) return false;
      if (!term) return true;
      return (
        (p.name || '').toLowerCase().includes(term) ||
        (p.dnsName || '').toLowerCase().includes(term) ||
        (p.htmlDirectory || '').toLowerCase().includes(term) ||
        (p.hotspotAddress || '').toLowerCase().includes(term)
      );
    });
  }, [hotspotServerProfiles, searchTerm]);

  const filteredRouterFiles = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return (routerFiles || []).filter((f) => {
      if (!f || !f.name) return false;
      const isHotspotAsset = f.name.includes('hotspot') || f.name.endsWith('.html') || f.name.endsWith('.js') || f.name.endsWith('.css');
      if (!isHotspotAsset) return false;
      if (!term) return true;
      return f.name.toLowerCase().includes(term) || (f.type || '').toLowerCase().includes(term);
    });
  }, [routerFiles, searchTerm]);

  // HTML Portal Directory Folders extracted from Router Files
  const portalFolders = useMemo(() => {
    const folders = new Set<string>();
    folders.add('hotspot');

    (routerFiles || []).forEach((f) => {
      if (!f || !f.name) return;
      const fname = f.name;
      if (fname.includes('hotspot') || fname.includes('portal') || fname.includes('login')) {
        const parts = fname.split('/');
        if (parts.length > 1) {
          folders.add(parts.slice(0, -1).join('/'));
        } else if (f.isFolder) {
          folders.add(fname);
        }
      }
    });

    // Also include from profiles
    (hotspotServerProfiles || []).forEach((p) => {
      if (p && p.htmlDirectory) folders.add(p.htmlDirectory);
    });

    return Array.from(folders);
  }, [routerFiles, hotspotServerProfiles]);

  // Calculate Signal Quality
  const getSignalBadge = (signalStr: string) => {
    if (!signalStr || typeof signalStr !== 'string') {
      return { label: 'غير معروف', color: 'text-slate-400 bg-slate-800 border-slate-700', icon: Signal };
    }
    const num = parseInt(signalStr.replace(/[^0-9-]/g, ''), 10);
    if (isNaN(num)) return { label: signalStr, color: 'text-slate-400 bg-slate-800 border-slate-700', icon: Signal };
    if (num >= -60) return { label: `${num} dBm (ممتاز)`, color: 'text-emerald-300 bg-emerald-950/60 border-emerald-500/40', icon: SignalHigh };
    if (num >= -72) return { label: `${num} dBm (جيد)`, color: 'text-cyan-300 bg-cyan-950/60 border-cyan-500/40', icon: SignalMedium };
    if (num >= -82) return { label: `${num} dBm (متوسط)`, color: 'text-amber-300 bg-amber-950/60 border-amber-500/40', icon: SignalLow };
    return { label: `${num} dBm (ضعيف/تشويش)`, color: 'text-rose-300 bg-rose-950/60 border-rose-500/40', icon: SignalLow };
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300" id="network-management-view">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-950/50 shrink-0">
            <Radio className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                مركز إدارة الشبكة والبث اللاسلكي
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                SSID & Antennas & Portals
              </span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm mt-1 leading-relaxed max-w-3xl">
              قراءة وتعديل أسماء شبكات البث (SSID) في المايكروتك، مراقبة الأنتنات والمحطات المتصلة وجودة الإشارة، وضبط بوابات وصفحات تسجيل دخول المشتركين بدقة وأمان.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 relative z-10 self-end lg:self-center flex-wrap">
          <button
            type="button"
            onClick={() => setIsAntiSharingOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 hover:from-rose-500 hover:to-amber-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-rose-950/40 active:scale-95"
            id="btn-anti-sharing-header"
          >
            <ShieldAlert className="w-4 h-4 animate-pulse text-amber-200" />
            <span>منع مشاركة الانترنت 🛡️</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenStudio()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg shadow-indigo-600/30 active:scale-95"
            id="btn-open-portal-studio-header"
          >
            <Palette className="w-4 h-4" />
            <span>استوديو صفحات الدخول 🎨</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await Promise.all([
                fetchWirelessData(),
                fetchAntennasData(),
                fetchHotspotServerProfiles()
              ]);
              if (isMountedRef.current) {
                showToast('تم تحديث بيانات الشبكة والوايرلس والأنتنات', 'success');
              }
            }}
            disabled={isLoadingWireless || isLoadingAntennas || isLoadingPortalProfiles}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50"
            id="btn-refresh-network-data"
          >
            <RefreshCw className={`w-4 h-4 text-indigo-400 ${(isLoadingWireless || isLoadingAntennas || isLoadingPortalProfiles) ? 'animate-spin' : ''}`} />
            <span>تحديث شامل</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveSection('access-points')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveSection('access-points');
            }
          }}
          className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-indigo-500/50 cursor-pointer transition-all shadow-lg flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-400 block truncate">نقاط الوصول (Access Points)</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-white">{accessPoints.length}</span>
              <span className="text-[10px] text-indigo-300 font-semibold">
                (Ubiquiti, TP-Link, MikroTik)
              </span>
            </div>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveSection('wireless')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveSection('wireless');
            }
          }}
          className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-blue-500/50 cursor-pointer transition-all shadow-lg flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Wifi className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-400 block truncate">شبكات البث المدمجة (SSIDs)</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-white">{wirelessInterfaces.length}</span>
              <span className="text-[10px] text-emerald-400 font-semibold">
                ({wirelessInterfaces.filter((w) => !w.disabled && w.running).length} نشطة)
              </span>
            </div>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveSection('antennas')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveSection('antennas');
            }
          }}
          className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/50 cursor-pointer transition-all shadow-lg flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Radio className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-400 block truncate">الأنتنات والمحطات المتصلة</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-white">{registrationTable.length}</span>
              <span className="text-[10px] text-slate-400 font-semibold">محطة</span>
            </div>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveSection('portals')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveSection('portals');
            }
          }}
          className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all shadow-lg flex items-center gap-3.5"
        >
          <div className="w-11 h-11 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-slate-400 block truncate">بوابات الدخول (Hotspot)</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-black text-white">{hotspotServerProfiles.length}</span>
              <span className="text-[10px] text-purple-300 font-semibold">بروفايل</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sections Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveSection('access-points')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeSection === 'access-points'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          id="tab-network-access-points"
        >
          <Radio className="w-4 h-4 text-indigo-300" />
          <span>نقاط الوصول والأكسس بوينت (Access Points)</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 text-white font-mono">
            {accessPoints.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('scanner')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
            activeSection === 'scanner'
              ? 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          id="tab-network-scanner"
        >
          <Activity className="w-4 h-4 text-indigo-400" />
          <span>ماسح الترددات والتشويش (Frequency Scanner)</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
            جديد ✨
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('wireless')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeSection === 'wireless'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          id="tab-network-wireless"
        >
          <Wifi className="w-4 h-4" />
          <span>شبكات البث المدمجة (SSIDs)</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 text-white font-mono">
            {wirelessInterfaces.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('antennas')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeSection === 'antennas'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          id="tab-network-antennas"
        >
          <Radio className="w-4 h-4" />
          <span>الأنتنات والمحطات المتصلة</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 text-white font-mono">
            {registrationTable.length + neighbors.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('portals')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeSection === 'portals'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          id="tab-network-portals"
        >
          <Globe className="w-4 h-4" />
          <span>صفحات وبوابات تسجيل الدخول</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 text-white font-mono">
            {hotspotServerProfiles.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('files')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeSection === 'files'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          id="tab-network-files"
        >
          <FileCode className="w-4 h-4" />
          <span>ملفات صفحات الهوتسبوت (HTML Files)</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20 text-white font-mono">
            {routerFiles.filter((f) => f.name.includes('hotspot') || f.name.endsWith('.html') || f.name.endsWith('.js') || f.name.endsWith('.css')).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeSection === 'audit'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/40'
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          id="tab-network-audit"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>فحص الأمان والاتصال الحي (Ping)</span>
        </button>

        <button
          type="button"
          onClick={() => setIsAntiSharingOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-500/30 shadow-md shadow-rose-950/40 cursor-pointer"
          id="tab-network-anti-sharing"
        >
          <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
          <span>منع مشاركة وبث الانترنت (Anti-Sharing)</span>
          <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-rose-500/30 text-rose-200 font-mono font-bold">
            v4.0 🛡️
          </span>
        </button>
      </div>

      {/* Control & Search Bar */}
      {activeSection !== 'scanner' && activeSection !== 'audit' && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/70 border border-slate-800/80">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم، SSID، عنوان MAC، التردد، الملاحظات، أو الجهاز..."
            className="w-full pl-4 pr-10 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {activeSection === 'wireless' && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">التردد:</span>
              <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterBand('all')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterBand === 'all' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setFilterBand('2ghz')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterBand === '2ghz' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  2.4 GHz
                </button>
                <button
                  type="button"
                  onClick={() => setFilterBand('5ghz')}
                  className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                    filterBand === '5ghz' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  5 GHz
                </button>
              </div>
            </div>

            {wirelessInterfaces.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setVapMaster(wirelessInterfaces[0]?.name || '');
                  setIsVapModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 text-xs font-bold transition-all shadow-sm active:scale-95"
                id="btn-add-vap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة شبكة افتراضية (Virtual AP)</span>
              </button>
            )}
          </div>
        )}

        {activeSection === 'antennas' && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400">قوة الإشارة:</span>
            <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterSignal('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  filterSignal === 'all' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل ({registrationTable.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterSignal('strong')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  filterSignal === 'strong' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-400 hover:text-white'
                }`}
              >
                ممتازة (&gt; -65)
              </button>
              <button
                type="button"
                onClick={() => setFilterSignal('medium')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  filterSignal === 'medium' ? 'bg-amber-600 text-white font-bold' : 'text-amber-400 hover:text-white'
                }`}
              >
                متوسطة
              </button>
              <button
                type="button"
                onClick={() => setFilterSignal('weak')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  filterSignal === 'weak' ? 'bg-rose-600 text-white font-bold' : 'text-rose-400 hover:text-white'
                }`}
              >
                ضعيفة (&lt; -80)
              </button>
            </div>
          </div>
        )}

        {activeSection === 'portals' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenStudio()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95"
              id="btn-open-portal-studio-bar"
            >
              <Palette className="w-4 h-4" />
              <span>استوديو التصميم والمعاينة الحية 🎨</span>
            </button>

            <button
              type="button"
              onClick={() => setIsNewProfileModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95"
              id="btn-new-hotspot-profile"
            >
              <Plus className="w-4 h-4" />
              <span>بروفايل جديد</span>
            </button>
          </div>
        )}
      </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 0: ACCESS POINTS & ANTENNAS (UBIQUITI, TP-LINK, MIKROTIK, CAMBIUM) */}
      {/* ========================================================================= */}
      {activeSection === 'access-points' && (
        <AccessPointsSection searchTerm={searchTerm} />
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: WIRELESS INTERFACES & SSIDs */}
      {/* ========================================================================= */}
      {activeSection === 'wireless' && (
        <div className="space-y-4">
          {filteredWireless.length === 0 ? (
            <div className="p-10 rounded-2xl bg-slate-900/50 border border-slate-800 text-center space-y-3">
              <WifiOff className="w-12 h-12 text-slate-500 mx-auto opacity-60" />
              <h3 className="text-base font-bold text-slate-300">لا توجد واجهات بث لاسلكية مطابقة</h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                إذا كان الراوتر سلكياً فقط (مثل Cloud Core Router) ويتم بث الواي فاي عبر أكسس بوينت خارجية (Access Points)، يمكنك مراجعة قسم <strong>الأنتنات المتصلة</strong> لإدارتها.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredWireless.map((w) => (
                <div
                  key={w.id}
                  className={`p-5 rounded-2xl border transition-all shadow-xl space-y-4 relative overflow-hidden group ${
                    w.disabled
                      ? 'bg-slate-950/70 border-slate-800/80 opacity-80'
                      : 'bg-slate-900/90 border-slate-800 hover:border-indigo-500/50'
                  }`}
                >
                  {/* Top Bar */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center border shadow-md shrink-0 ${
                          w.disabled
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : w.running
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        }`}
                      >
                        <Wifi className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-white tracking-tight">{w.ssid}</h3>
                          {w.hideSsid && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              مخفية (Hidden)
                            </span>
                          )}
                          {w.disabled && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              معطلة (Disabled)
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono text-slate-400 block mt-0.5">
                          الواجهة: <strong className="text-indigo-300">{w.name}</strong> • {w.mode}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleInterface(w)}
                        title={w.disabled ? 'تشغيل وتفعيل البث اللاسلكي' : 'إيقاف وتعطيل الواجهة اللاسلكية'}
                        className={`p-2 rounded-xl border transition-all shadow-sm active:scale-95 flex items-center gap-1 text-xs font-bold ${
                          w.disabled
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                            : 'bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{w.disabled ? 'تشغيل' : 'إيقاف'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setScannerTargetInterface(w.name);
                          setActiveSection('scanner');
                        }}
                        className="p-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all shadow-sm active:scale-95 flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                        title="فحص ومسح الترددات واختيار القناة الأقل تشويشاً"
                      >
                        <Radio className="w-3.5 h-3.5 text-indigo-400" />
                        <span>فحص التشويش</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditWireless(w)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white border border-slate-700 transition-all shadow-sm active:scale-95 flex items-center gap-1.5 text-xs font-bold"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل SSID</span>
                      </button>
                    </div>
                  </div>

                  {/* Comment */}
                  {w.comment && (
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 flex items-center gap-2">
                      <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{w.comment}</span>
                    </div>
                  )}

                  {/* Specs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] font-semibold text-slate-400 block">التردد والترخيص</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block">
                        {w.frequency === 'auto' ? 'تلقائي (Auto)' : `${w.frequency} MHz`}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] font-semibold text-slate-400 block">عرض القناة (Channel)</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block truncate">
                        {w.channelWidth || '20/40 MHz'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] font-semibold text-slate-400 block">نطاق البث (Band)</span>
                      <span className="text-xs font-bold text-indigo-300 font-mono mt-0.5 block truncate">
                        {w.band || '2.4GHz b/g/n'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] font-semibold text-slate-400 block">العملاء المتصلين</span>
                      <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5 block">
                        {w.clientsCount || 0} جهاز متصل
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] font-semibold text-slate-400 block">قوة الإرسال (Tx Power)</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block">
                        {w.txPower === 'default' ? 'افتراضي (Auto)' : `${w.txPower} dBm`}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] font-semibold text-slate-400 block">حالة الواجهة</span>
                      <span
                        className={`text-xs font-bold mt-0.5 block ${
                          w.disabled ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {w.disabled ? 'معطلة (Disabled)' : 'شغالة وتبث الآن'}
                      </span>
                    </div>
                  </div>

                  {/* MAC & Radio */}
                  {w.macAddress && (
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                      <div className="flex items-center gap-1.5">
                        <span>MAC: {w.macAddress}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(w.macAddress!, 'عنوان MAC')}
                          className="text-slate-500 hover:text-white"
                          title="نسخ عنوان MAC"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      {w.radioName && <span>الراديو: {w.radioName}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION: WIRELESS FREQUENCY & INTERFERENCE SCANNER */}
      {/* ========================================================================= */}
      {activeSection === 'scanner' && (
        <WirelessFrequencyScanner
          initialInterfaceName={scannerTargetInterface}
          onNavigateBack={() => setActiveSection('wireless')}
          onChannelApplied={() => {
            fetchWirelessData();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: CONNECTED ANTENNAS & STATIONS */}
      {/* ========================================================================= */}
      {activeSection === 'antennas' && (
        <div className="space-y-6">
          {/* Wireless Registration Table (Live Clients & Antennas) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">
                  جدول المحطات والأنتنات المتصلة بالوايرلس (Registration Table)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {filteredStations.length} متصل
                </span>
              </div>
            </div>

            {filteredStations.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-slate-400 text-sm">
                لا توجد محطات أو أنتنات متصلة حالياً بالواجهات اللاسلكية المباشرة.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl">
                <table className="w-full text-right text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">عنوان MAC والجهاز</th>
                      <th className="p-3.5">الواجهة</th>
                      <th className="p-3.5">قوة الإشارة (Signal)</th>
                      <th className="p-3.5">جودة الاتصال (CCQ / SNR)</th>
                      <th className="p-3.5">معدل السرعة (Tx/Rx Rate)</th>
                      <th className="p-3.5">مدة الاتصال</th>
                      <th className="p-3.5 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredStations.map((station) => {
                      const sig = getSignalBadge(station.signalStrength);
                      const SigIcon = sig.icon;
                      return (
                        <tr key={station.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-3.5">
                            <div className="font-mono font-bold text-white flex items-center gap-1.5">
                              <span>{station.macAddress}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(station.macAddress, 'عنوان MAC')}
                                className="text-slate-500 hover:text-white"
                                title="نسخ عنوان MAC"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              {station.routerOs && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  RouterOS
                                </span>
                              )}
                            </div>
                            {station.comment && (
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                {station.comment}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-indigo-300">{station.interface}</td>
                          <td className="p-3.5">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${sig.color}`}>
                              <SigIcon className="w-3.5 h-3.5" />
                              <span>{sig.label}</span>
                            </span>
                            {station.signalStrengthCh0 && station.signalStrengthCh1 && (
                              <span className="text-[10px] text-slate-400 block font-mono mt-0.5">
                                Ch0: {station.signalStrengthCh0} | Ch1: {station.signalStrengthCh1}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div className="flex flex-col gap-0.5">
                              {station.ccq && (
                                <span className="font-bold text-emerald-400 font-mono">
                                  CCQ: {station.ccq}
                                </span>
                              )}
                              {station.signalToNoise && (
                                <span className="text-[11px] text-slate-400 font-mono">
                                  SNR: {station.signalToNoise}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 font-mono text-slate-300">
                            {station.txRate && station.rxRate ? (
                              <span>
                                {station.txRate} / {station.rxRate}
                              </span>
                            ) : (
                              '--'
                            )}
                          </td>
                          <td className="p-3.5 font-mono text-slate-400">{station.uptime || 'لحظات'}</td>
                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleKickClient(station)}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold transition-colors cursor-pointer"
                              title="فصل المحطة من البث اللاسلكي"
                            >
                              فصل
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Connected Neighbor Antennas & Access Points (Ubiquiti, MikroTik, Cambium) */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  الأنتنات والأجهزة المجاورة المكتشفة في الشبكة (IP Neighbors)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {filteredNeighbors.length} جهاز
                </span>
              </div>
            </div>

            {filteredNeighbors.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800 text-center text-slate-400 text-sm">
                لم يتم العثور على أجهزة أو أنتنات مجاورة عبر بروتوكول MNDP / CDP / LLDP.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredNeighbors.map((nb) => (
                  <div
                    key={nb.id}
                    className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all shadow-lg space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                          <Radio className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-white truncate max-w-[180px]">{nb.identity}</h4>
                          <span className="text-[11px] text-amber-400 font-medium block">
                            {nb.platform} • {nb.board}
                          </span>
                        </div>
                      </div>

                      {nb.address && (
                        <a
                          href={`http://${nb.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition-colors"
                          title="فتح صفحة الدخول للأنتينة"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-400 block text-[10px]">عنوان IP:</span>
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-white">{nb.address || 'بدون IP'}</span>
                          {nb.address && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(nb.address, 'عنوان IP')}
                              className="text-slate-500 hover:text-white"
                              title="نسخ IP"
                            >
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">المنفذ المتصل به:</span>
                        <span className="font-mono font-bold text-indigo-300">{nb.interface}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">عنوان MAC:</span>
                        <span className="font-mono text-slate-300 truncate block">{nb.macAddress}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">مدة العمل:</span>
                        <span className="font-mono text-slate-300">{nb.uptime || '--'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: HOTSPOT LOGIN PORTALS & PROFILES */}
      {/* ========================================================================= */}
      {activeSection === 'portals' && (
        <div className="space-y-5">
          {/* LIVE PORTAL STUDIO HERO BANNER */}
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-indigo-950/80 via-slate-900 to-purple-950/60 border border-indigo-500/40 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

            <div className="flex items-start gap-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/30 shrink-0">
                <Palette className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base sm:text-lg font-black text-white">
                    استوديو تصميم وبوابات تسجيل الدخول الحية
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                    معاينة حية + تثبيت فوري بالراوتر
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                  تخصيص كامل للهوية البصرية (الشعارات، الأيقونات، الألوان)، إضافة الإعلانات المتحركة والرسائل الترويجية، عرض جدول أسعار الكروت وبيانات الدعم الفني، مع مساحة جانبية للمعاينة التفاعلية في الوقت الفعلي والتثبيت الحقيقي في راوتر المايكروتك.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 relative z-10">
              <button
                type="button"
                onClick={() => handleOpenStudio()}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm font-black shadow-xl shadow-indigo-600/30 active:scale-95 transition-all"
                id="btn-open-portal-studio-hero"
              >
                <Palette className="w-5 h-5" />
                <span>فتح استوديو التصميم والمعاينة الحية 🎨</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredServerProfiles.map((p) => {
              // Find server instances that use this profile
              const boundServers = hotspotServers.filter((s) => s.profile === p.name);

              return (
                <div
                  key={p.id}
                  className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 transition-all shadow-xl space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                        <Globe className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-black text-white">{p.name}</h3>
                          {p.dnsName && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {p.dnsName}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 block mt-0.5 font-mono">
                          مجلد الصفحة: <strong className="text-amber-300">{p.htmlDirectory}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleOpenStudio(p)}
                        className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600/30 to-purple-600/30 hover:from-indigo-600 hover:to-purple-600 text-indigo-200 hover:text-white border border-indigo-500/40 transition-all text-xs font-bold flex items-center gap-1.5 shadow-sm"
                        title="تصميم وتعديل ومعاينة صفحة الدخول لهذا البروفايل"
                      >
                        <Palette className="w-3.5 h-3.5 text-indigo-400" />
                        <span>تصميم ومعاينة حية 📱</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditProfile(p)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all text-xs font-bold flex items-center gap-1"
                        title="تعديل اسم الدومين وطرق تسجيل الدخول"
                      >
                        <Settings className="w-4 h-4" />
                        <span>ضبط البروفايل</span>
                      </button>
                    </div>
                  </div>

                  {/* Specs & Security */}
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">عنوان IP البوابة:</span>
                      <span className="font-bold text-white font-mono mt-0.5 block">
                        {p.hotspotAddress || 'تلقائي (Interface IP)'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">دومين تسجيل الدخول (DNS Name):</span>
                      <span className="font-bold text-cyan-300 font-mono mt-0.5 block">
                        {p.dnsName || 'بدون دومين (عبر IP)'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">صلاحية الكوكيز (Cookie Lifetime):</span>
                      <span className="font-bold text-emerald-300 font-mono mt-0.5 block">
                        {p.httpCookieLifetime || '3 أيام'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">شهادة SSL / HTTPS:</span>
                      <span className="font-bold text-white font-mono mt-0.5 block">
                        {p.sslCertificate === 'none' || !p.sslCertificate ? 'غير مفعل (HTTP)' : p.sslCertificate}
                      </span>
                    </div>
                  </div>

                  {/* Login By Methods Badges */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 block">طرق تسجيل الدخول المفعلة:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.loginBy.map((m) => (
                        <span
                          key={m}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                        >
                          {m.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bound Hotspot Servers */}
                  {boundServers.length > 0 && (
                    <div className="text-[11px] text-slate-400 pt-1 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>مرتبط مع سيرفر: </span>
                      {boundServers.map((s) => (
                        <strong key={s.id} className="text-white font-mono">
                          {s.name} ({s.interface})
                        </strong>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: ROUTER STORAGE & HTML FILES */}
      {/* ========================================================================= */}
      {activeSection === 'files' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCode className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">ملفات ومجلدات صفحات تسجيل الدخول في المايكروتك</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              إجمالي الملفات: {routerFiles.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredRouterFiles.map((file) => (
                <div
                  key={file.id}
                  className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-all shadow-md group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        file.isFolder
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : file.name.endsWith('.html')
                          ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {file.isFolder ? <Folder className="w-5 h-5" /> : <FileCode className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-white truncate block font-mono" title={file.name}>
                        {file.name}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {file.isFolder ? 'مجلد صفحة' : `${(file.size / 1024).toFixed(1)} KB`} • {file.type}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFileToDelete(file)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                    title="حذف الملف من ذاكرة الراوتر"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 5: WIRELESS AUDIT & REAL-TIME PING DIAGNOSTIC */}
      {/* ========================================================================= */}
      {activeSection === 'audit' && (
        <div className="space-y-6">
          {/* Live Router Ping Diagnostic Tool */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    أداة فحص الاتصال الحية من الراوتر (Live Ping Diagnostics)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    إرسال حزم فحص اتصال مباشرة عبر راوتر المايكروتك لقياس زمن الاستجابة ونسبة الفقدان بدقة.
                  </p>
                </div>
              </div>
            </div>

            {/* Ping Controls */}
            <form onSubmit={handleRunPing} className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={pingTarget}
                  onChange={(e) => setPingTarget(e.target.value)}
                  placeholder="أدخل عنوان IP أو الدومين (مثال: 8.8.8.8 أو 1.1.1.1)..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <span className="text-slate-400 px-2 font-medium">عدد الحزم:</span>
                  {[4, 6, 10].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPingCount(c)}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-colors ${
                        pingCount === c ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={isPinging}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 shrink-0"
                  id="btn-execute-ping"
                >
                  {isPinging ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الفحص...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>بدء الفحص (Ping)</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Quick Ping Presets */}
            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
              <span>فحص سريع:</span>
              <button
                type="button"
                onClick={() => handleRunPing(undefined, '8.8.8.8')}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-mono"
              >
                Google DNS (8.8.8.8)
              </button>
              <button
                type="button"
                onClick={() => handleRunPing(undefined, '1.1.1.1')}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono"
              >
                Cloudflare (1.1.1.1)
              </button>
              {router?.host && (
                <button
                  type="button"
                  onClick={() => handleRunPing(undefined, router.host)}
                  className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-mono"
                >
                  بوابة الراوتر ({router.host})
                </button>
              )}
            </div>

            {/* Ping Results Display */}
            {pingResult && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 animate-in fade-in-50 duration-200">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">الهدف (Target):</span>
                    <span className="font-mono font-bold text-white mt-0.5 block">{pingResult.target}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">الحزم (Sent / Received):</span>
                    <span className="font-mono font-bold text-white mt-0.5 block">
                      {pingResult.sent} / {pingResult.received}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">نسبة الفقدان (Packet Loss):</span>
                    <span
                      className={`font-mono font-bold mt-0.5 block ${
                        pingResult.packetLoss === 0
                          ? 'text-emerald-400'
                          : pingResult.packetLoss <= 20
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {pingResult.packetLoss}%
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">متوسط زمن الاستجابة (Avg):</span>
                    <span className="font-mono font-bold text-indigo-300 mt-0.5 block">
                      {pingResult.avgTime} ms
                    </span>
                  </div>
                </div>

                {/* Packet Details Log */}
                {pingResult.details.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-slate-800 font-mono text-[11px]">
                    {pingResult.details.map((p) => (
                      <div
                        key={p.seq}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800/60"
                      >
                        <span className="text-slate-400">حزمة #{p.seq}</span>
                        <span className="text-slate-300">الحجم: {p.size} بايت</span>
                        <span className="text-slate-300">TTL: {p.ttl}</span>
                        <span
                          className={`font-bold ${
                            p.status === 'success' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {p.time}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Security & Wireless Engineering Audit */}
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
              <div>
                <h3 className="text-lg font-bold text-white">فحص أمان واستقرار الشبكة اللاسلكية</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  توصيات ذكية ومعايير هندسية لأفضل أداء بث دون انقطاع وتفادي التداخل في الترددات.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>ترددات 2.4 GHz النظيفة</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  احرص على استخدام القنوات غير المتداخلة فقط (1 - 6 - 11) مع عرض قناة 20MHz لتفادي التشويش على هواتف العملاء القديمة.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs">
                  <Zap className="w-4 h-4" />
                  <span>قطاعات 5 GHz للربط ونقل البيانات</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  استخدم ترددات 5180 - 5800 MHz مع عرض قناة 40/80MHz للأنتنات والمحطات الخارجية (CPEs) لضمان نقل سرعات تزيد عن 100Mbps.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                  <Lock className="w-4 h-4" />
                  <span>أمان بروتوكول CHAP و Cookies</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  تفعيل HTTP-CHAP و MAC-Cookie يمنع برامج سحب الكروت NetCut وتزوير عناوين IP مع الحفاظ على تسجيل دخول فوري وسلس للمستخدم.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EDIT WIRELESS INTERFACE & SSID */}
      {/* ========================================================================= */}
      {editingInterface && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    تعديل إعدادات الشبكة اللاسلكية ({editingInterface.name})
                  </h3>
                  <span className="text-xs text-slate-400">ضبط اسم البث، التردد، وقوة الإرسال بأمان</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingInterface(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWireless} className="p-5 space-y-4 text-right">
              {/* SSID Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  اسم الشبكة المرئي للمستخدمين (SSID) *
                </label>
                <input
                  type="text"
                  required
                  value={editSsid}
                  onChange={(e) => setEditSsid(e.target.value)}
                  placeholder="مثال: ZCtrl_Free_WiFi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Band & Width */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">نطاق البث (Band)</label>
                  <select
                    value={editBand}
                    onChange={(e) => setEditBand(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="2ghz-b/g/n">2.4 GHz (b/g/n)</option>
                    <option value="2ghz-only-n">2.4 GHz (Only N)</option>
                    <option value="5ghz-a/n/ac">5 GHz (a/n/ac)</option>
                    <option value="5ghz-only-ac">5 GHz (Only AC)</option>
                    <option value="5ghz-ax">5 GHz (Wi-Fi 6 AX)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">عرض القناة (Channel Width)</label>
                  <select
                    value={editChannelWidth}
                    onChange={(e) => setEditChannelWidth(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="20mhz">20 MHz (الأكثر استقراراً)</option>
                    <option value="20/40mhz-Ce">20/40 MHz (سرعة مضاعفة)</option>
                    <option value="20/40/80mhz-XXXX">20/40/80 MHz (لشبكات 5G AC)</option>
                  </select>
                </div>
              </div>

              {/* Frequency & Tx Power */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">التردد (Frequency)</label>
                  <input
                    type="text"
                    value={editFrequency}
                    onChange={(e) => setEditFrequency(e.target.value)}
                    placeholder="auto أو 2412 أو 5180"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">قوة الإرسال (Tx Power)</label>
                  <select
                    value={editTxPower}
                    onChange={(e) => setEditTxPower(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  >
                    <option value="default">تلقائي (Default Auto)</option>
                    <option value="17">17 dBm (50 mW - متوسط)</option>
                    <option value="20">20 dBm (100 mW - قياسي)</option>
                    <option value="23">23 dBm (200 mW - قوي خارجي)</option>
                    <option value="27">27 dBm (500 mW - أقصى تغطية)</option>
                  </select>
                </div>
              </div>

              {/* Comment */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">ملاحظات تعريفية (Comment)</label>
                <input
                  type="text"
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  placeholder="مثال: قطاع شمالي - شبكة الهوتسبوت الرئيسية"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editHideSsid}
                    onChange={(e) => setEditHideSsid(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs font-semibold text-slate-300">إخفاء الشبكة (Hide SSID)</span>
                </label>

                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editDisabled}
                    onChange={(e) => setEditDisabled(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs font-semibold text-rose-300">تعطيل الواجهة (Disable)</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingInterface(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingWireless}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {isSavingWireless ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ في المايكروتك...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>حفظ الإعدادات بأمان</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD VIRTUAL AP (SLAVE SSID) */}
      {/* ========================================================================= */}
      {isVapModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                  <Wifi className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">إضافة نقطة بث افتراضية (Virtual AP)</h3>
                  <span className="text-xs text-slate-400">بث اسم شبكة إضافي (SSID) على نفس كرت الوايرلس الفيزيائي</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVapModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateVap} className="p-5 space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">الواجهة الرئيسية (Master Interface) *</label>
                <select
                  value={vapMaster}
                  onChange={(e) => setVapMaster(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                >
                  {wirelessInterfaces.map((w) => (
                    <option key={w.id} value={w.name}>
                      {w.name} ({w.ssid})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">اسم الشبكة الجديد (SSID) *</label>
                <input
                  type="text"
                  required
                  value={vapSsid}
                  onChange={(e) => setVapSsid(e.target.value)}
                  placeholder="مثال: Guest_WiFi أو VIP_Network"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">اسم الواجهة في المايكروتك (اختياري)</label>
                <input
                  type="text"
                  value={vapName}
                  onChange={(e) => setVapName(e.target.value)}
                  placeholder="مثال: wlan-guest أو يترك فارغاً للإنشاء التلقائي"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">ملاحظات (Comment)</label>
                <input
                  type="text"
                  value={vapComment}
                  onChange={(e) => setVapComment(e.target.value)}
                  placeholder="مثال: شبكة ضيوف الهوتسبوت"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={vapHideSsid}
                    onChange={(e) => setVapHideSsid(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-0 w-4 h-4 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs font-semibold text-slate-300">إخفاء الشبكة (Hide SSID)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsVapModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingVap}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {isSavingVap ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الإنشاء في الراوتر...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>إنشاء نقطة البث</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT HOTSPOT SERVER PROFILE (LOGIN PORTAL) */}
      {/* ========================================================================= */}
      {editingProfile && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 my-8">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    ضبط بوابة وصفحة تسجيل الدخول ({editingProfile.name})
                  </h3>
                  <span className="text-xs text-slate-400">تحديد مجلد القالب، الدومين، وطرق المصادقة</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfile(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-5 space-y-4 text-right">
              {/* HTML Directory */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">
                  مجلد صفحة تسجيل الدخول في المايكروتك (HTML Directory) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={editHtmlDir}
                    onChange={(e) => setEditHtmlDir(e.target.value)}
                    placeholder="مثال: hotspot أو flash/hotspot"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  {portalFolders.length > 0 && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) setEditHtmlDir(e.target.value);
                      }}
                      className="px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono"
                    >
                      <option value="">اختر مجلد موجود...</option>
                      {portalFolders.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 block">
                  المجلد في ذاكرة الراوتر الذي يحتوي على ملفات <code>login.html</code> و <code>status.html</code>
                </span>
              </div>

              {/* DNS Name & Hotspot Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    دومين بوابة الدخول (DNS Name)
                  </label>
                  <input
                    type="text"
                    value={editDnsName}
                    onChange={(e) => setEditDnsName(e.target.value)}
                    placeholder="مثال: login.net أو wifi.hotspot"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block">
                    الرابط الذي يفتح للعميل عند محاولة الاتصال بالإنترنت
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">
                    عنوان IP البوابة (Hotspot Address)
                  </label>
                  <input
                    type="text"
                    value={editHotspotAddress}
                    onChange={(e) => setEditHotspotAddress(e.target.value)}
                    placeholder="مثال: 192.168.88.1"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Login Methods (Checkboxes) */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <label className="text-xs font-bold text-slate-300 block">
                  طرق تسجيل الدخول المسموح بها (Login By Methods) *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'http-chap', label: 'HTTP CHAP (مشفر وآمن)' },
                    { id: 'http-pap', label: 'HTTP PAP (بسيط)' },
                    { id: 'cookie', label: 'Cookie (حفظ الجلسة)' },
                    { id: 'mac', label: 'MAC Address (تلقائي)' },
                    { id: 'mac-cookie', label: 'MAC Cookie (موصى به)' },
                    { id: 'https', label: 'HTTPS (تشفير SSL)' },
                    { id: 'trial', label: 'Trial (تجربة مجانية)' }
                  ].map((method) => {
                    const isChecked = editLoginBy.includes(method.id);
                    return (
                      <button
                        type="button"
                        key={method.id}
                        onClick={() => toggleLoginMethod(method.id)}
                        className={`p-2.5 rounded-xl border text-right transition-all flex items-center gap-2 ${
                          isChecked
                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200 font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] border ${
                            isChecked ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700'
                          }`}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                        </div>
                        <span className="text-[11px] truncate">{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cookie Lifetime & Rate Limits */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">صلاحية الكوكيز</label>
                  <input
                    type="text"
                    value={editCookieLifetime}
                    onChange={(e) => setEditCookieLifetime(e.target.value)}
                    placeholder="مثال: 3d أو 7d أو 1d"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 block">تحديد سرعة البوابة (Rate Limit)</label>
                  <input
                    type="text"
                    value={editRateLimit}
                    onChange={(e) => setEditRateLimit(e.target.value)}
                    placeholder="مثال: 2M/5M أو فارغ"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                  {isSavingProfile ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ في المايكروتك...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>حفظ إعدادات البوابة</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CREATE NEW HOTSPOT SERVER PROFILE */}
      {/* ========================================================================= */}
      {isNewProfileModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <h3 className="text-base font-bold text-white">إنشاء بروفايل بوابة هوتسبوت جديد</h3>
              <button
                type="button"
                onClick={() => setIsNewProfileModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProfile} className="p-5 space-y-4 text-right">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">اسم البروفايل *</label>
                <input
                  type="text"
                  required
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="مثال: hsprof-vip أو portal-custom"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">مجلد صفحة تسجيل الدخول (HTML Directory)</label>
                <input
                  type="text"
                  value={newProfileHtmlDir}
                  onChange={(e) => setNewProfileHtmlDir(e.target.value)}
                  placeholder="مثال: hotspot أو flash/hotspot"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">دومين تسجيل الدخول (DNS Name)</label>
                <input
                  type="text"
                  value={newProfileDnsName}
                  onChange={(e) => setNewProfileDnsName(e.target.value)}
                  placeholder="مثال: wifi.hotspot"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs sm:text-sm focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewProfileModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProfile}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg flex items-center gap-2 disabled:opacity-50"
                >
                  {isCreatingProfile && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isCreatingProfile ? 'جاري الإنشاء...' : 'إنشاء البروفايل'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DELETE ROUTER FILE CONFIRMATION */}
      {/* ========================================================================= */}
      {fileToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 text-right">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-white">تأكيد حذف الملف من الراوتر</h3>
              <p className="text-xs text-slate-400">
                هل أنت متأكد من رغبتك في حذف الملف{' '}
                <strong className="text-rose-400 font-mono">"{fileToDelete.name}"</strong> من ذاكرة راوتر المايكروتك؟
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteFile}
                disabled={isDeletingFile}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingFile ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري الحذف...</span>
                  </>
                ) : (
                  <span>نعم، حذف الملف</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: LIVE PORTAL STUDIO & INTERACTIVE PREVIEW */}
      {/* ========================================================================= */}
      <PortalStudioModal
        isOpen={isPortalStudioOpen}
        onClose={() => setIsPortalStudioOpen(false)}
        selectedProfile={studioSelectedProfile}
        serverProfiles={hotspotServerProfiles}
        portalFolders={portalFolders}
      />

      {/* Confirm Kick Client Modal */}
      <ConfirmModal
        isOpen={!!clientToKick}
        title="تأكيد فصل العميل / الأنتينة"
        message={`هل أنت متأكد من رغبتك في فصل وطرد العميل (${clientToKick?.macAddress} - ${clientToKick?.comment || clientToKick?.interface}) من شبكة الوايرلس؟`}
        confirmText="فصل العميل الآن"
        cancelText="إلغاء"
        type="warning"
        onConfirm={handleConfirmKickClient}
        onClose={() => setClientToKick(null)}
      />

      {/* ========================================================================= */}
      {/* MODAL 7: ANTI-SHARING & ANTI-TETHERING STUDIO */}
      {/* ========================================================================= */}
      <AntiSharingModal
        isOpen={isAntiSharingOpen}
        onClose={() => setIsAntiSharingOpen(false)}
      />
    </div>
  );
};
