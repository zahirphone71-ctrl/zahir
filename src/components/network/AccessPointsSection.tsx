import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useMikroTik } from '../../context/MikroTikContext';
import { AccessPointItem, PingResult } from '../../types/mikrotik';
import {
  Wifi,
  Radio,
  ExternalLink,
  Copy,
  Edit3,
  RefreshCw,
  Plus,
  Zap,
  Activity,
  X
} from 'lucide-react';

interface AccessPointsSectionProps {
  searchTerm: string;
}

export const AccessPointsSection: React.FC<AccessPointsSectionProps> = ({ searchTerm }) => {
  const {
    accessPoints,
    isLoadingAccessPoints,
    isLoadingAntennas,
    fetchAntennasData,
    updateAccessPointComment,
    addIpBinding,
    pingHost,
    showToast
  } = useMikroTik();

  const [selectedVendor, setSelectedVendor] = useState<string>('all');
  const selectedSource = 'all';
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Edit AP Modal State
  const [editingAp, setEditingAp] = useState<AccessPointItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editBypassHotspot, setEditBypassHotspot] = useState(true);
  const [isSavingAp, setIsSavingAp] = useState(false);

  // Manual AP Modal State
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualIp, setManualIp] = useState('');
  const [manualMac, setManualMac] = useState('');
  const [manualVendor, setManualVendor] = useState('Ubiquiti Networks');
  const [manualModel, setManualModel] = useState('');
  const [manualInterface, setManualInterface] = useState('');
  const [manualComment, setManualComment] = useState('');
  const [manualBypass, setManualBypass] = useState(true);
  const [isSavingManual, setIsSavingManual] = useState(false);

  // Ping Testing State per AP
  const [pingingApId, setPingingApId] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, { status: 'loading' | 'success' | 'error'; latency?: string; loss?: string; message?: string }>>({});
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

  // Vendor statistics
  const vendorCounts = useMemo(() => {
    const counts = {
      all: accessPoints.length,
      ubiquiti: 0,
      tplink: 0,
      mikrotik: 0,
      cambium: 0,
      ruijie: 0,
      other: 0
    };

    accessPoints.forEach((ap) => {
      const v = (ap.vendor || '').toLowerCase();
      if (v.includes('ubiquiti')) counts.ubiquiti++;
      else if (v.includes('tp-link')) counts.tplink++;
      else if (v.includes('mikrotik')) counts.mikrotik++;
      else if (v.includes('cambium')) counts.cambium++;
      else if (v.includes('ruijie') || v.includes('reyee')) counts.ruijie++;
      else counts.other++;
    });

    return counts;
  }, [accessPoints]);

  // Filtered AP list
  const filteredAPs = useMemo(() => {
    return accessPoints.filter((ap) => {
      // Search filter
      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (ap.name && ap.name.toLowerCase().includes(q)) ||
        (ap.vendor && ap.vendor.toLowerCase().includes(q)) ||
        (ap.model && ap.model.toLowerCase().includes(q)) ||
        (ap.ssid && ap.ssid.toLowerCase().includes(q)) ||
        (ap.ipAddress && ap.ipAddress.includes(q)) ||
        (ap.macAddress && ap.macAddress.toLowerCase().includes(q)) ||
        (ap.interface && ap.interface.toLowerCase().includes(q)) ||
        (ap.comment && ap.comment.toLowerCase().includes(q));

      // Vendor filter
      let matchesVendor = true;
      if (selectedVendor === 'ubiquiti') matchesVendor = (ap.vendor || '').toLowerCase().includes('ubiquiti');
      else if (selectedVendor === 'tplink') matchesVendor = (ap.vendor || '').toLowerCase().includes('tp-link');
      else if (selectedVendor === 'mikrotik') matchesVendor = (ap.vendor || '').toLowerCase().includes('mikrotik');
      else if (selectedVendor === 'cambium') matchesVendor = (ap.vendor || '').toLowerCase().includes('cambium');
      else if (selectedVendor === 'ruijie') matchesVendor = (ap.vendor || '').toLowerCase().includes('ruijie') || (ap.vendor || '').toLowerCase().includes('reyee');
      else if (selectedVendor === 'other') {
        const v = (ap.vendor || '').toLowerCase();
        matchesVendor = !v.includes('ubiquiti') && !v.includes('tp-link') && !v.includes('mikrotik') && !v.includes('cambium') && !v.includes('ruijie');
      }

      // Source filter
      let matchesSource = true;
      if (selectedSource !== 'all') {
        matchesSource = ap.source === selectedSource;
      }

      return matchesSearch && matchesVendor && matchesSource;
    });
  }, [accessPoints, searchTerm, selectedVendor, selectedSource]);

  // Handle Quick Ping
  const handlePingAp = async (ap: AccessPointItem) => {
    if (!ap.ipAddress) {
      showToast('لا يوجد عنوان IP مسجل لنقطة الوصول هذه لفحص الاتصال', 'error');
      return;
    }

    setPingingApId(ap.id);
    setPingResults((prev) => ({
      ...prev,
      [ap.id]: { status: 'loading' }
    }));

    try {
      const res = await pingHost(ap.ipAddress, 3);
      if (!isMountedRef.current) return;
      if (res.success && res.data) {
        const pingData = res.data as PingResult;
        const avg = pingData.avgTime !== undefined ? `${pingData.avgTime} ms` : 'مستقر';
        const loss = pingData.packetLoss !== undefined ? `${pingData.packetLoss}%` : '0%';
        setPingResults((prev) => ({
          ...prev,
          [ap.id]: {
            status: 'success',
            latency: avg,
            loss: `${loss} فقد`,
            message: `متصل - زمن الاستجابة: ${avg}`
          }
        }));
        showToast(`استجابة ${ap.name || ap.ipAddress}: ${avg} (${loss} loss)`, 'success');
      } else {
        setPingResults((prev) => ({
          ...prev,
          [ap.id]: {
            status: 'error',
            message: res.message || 'لا توجد استجابة (Timeout)'
          }
        }));
        showToast(`فشل استجابة ${ap.name || ap.ipAddress}`, 'error');
      }
    } catch {
      if (!isMountedRef.current) return;
      setPingResults((prev) => ({
        ...prev,
        [ap.id]: { status: 'error', message: 'خطأ في عملية الفحص' }
      }));
    } finally {
      if (isMountedRef.current) setPingingApId(null);
    }
  };

  // Open Edit Modal
  const handleOpenEditAp = (ap: AccessPointItem) => {
    setEditingAp(ap);
    setEditName(ap.name || '');
    setEditComment(ap.comment || '');
    setEditBypassHotspot(true);
  };

  // Save AP Edit
  const handleSaveAp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAp) return;

    setIsSavingAp(true);
    try {
      const combinedComment = editComment.trim()
        ? `[${editName.trim() || editingAp.name}] ${editComment.trim()}`
        : editName.trim() || editingAp.name;

      const res = await updateAccessPointComment({
        macAddress: editingAp.macAddress,
        ipAddress: editingAp.ipAddress,
        iface: editingAp.interface,
        comment: combinedComment
      });

      if (!isMountedRef.current) return;
      if (res.success) {
        if (editBypassHotspot && editingAp.macAddress) {
          try {
            await addIpBinding({
              macAddress: editingAp.macAddress,
              address: editingAp.ipAddress || '',
              type: 'bypassed',
              comment: `AP: ${editName.trim() || editingAp.name}`
            });
          } catch {
            // non-fatal
          }
        }
        if (isMountedRef.current) setEditingAp(null);
      }
    } finally {
      if (isMountedRef.current) setIsSavingAp(false);
    }
  };

  // Save Manual AP
  const handleSaveManualAp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIp = manualIp.trim();
    const cleanMac = manualMac.trim();
    if (!cleanIp && !cleanMac) {
      showToast('يجب إدخال عنوان IP أو عنوان MAC على الأقل', 'error');
      return;
    }

    if (cleanIp && !/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
      showToast('صيغة عنوان IP غير صحيحة (مثال: 192.168.88.20)', 'error');
      return;
    }

    if (cleanMac && !/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(cleanMac)) {
      showToast('صيغة عنوان MAC غير صحيحة (مثال: F0:9F:C2:AA:BB:CC)', 'error');
      return;
    }

    setIsSavingManual(true);
    try {
      const apTitle = manualName.trim() || `${manualVendor} AP`;
      const combinedComment = manualComment.trim()
        ? `[${apTitle}] ${manualModel ? manualModel + ' - ' : ''}${manualComment.trim()}`
        : `${apTitle} ${manualModel ? '(' + manualModel + ')' : ''}`;

      const res = await updateAccessPointComment({
        macAddress: cleanMac,
        ipAddress: cleanIp,
        iface: manualInterface.trim(),
        comment: combinedComment
      });

      if (!isMountedRef.current) return;
      if (res.success) {
        if (manualBypass && (cleanMac || cleanIp)) {
          try {
            await addIpBinding({
              macAddress: cleanMac || undefined,
              address: cleanIp || undefined,
              type: 'bypassed',
              comment: `AP Bypass: ${apTitle}`
            });
          } catch {
            // non-fatal
          }
        }
        if (isMountedRef.current) {
          setIsManualModalOpen(false);
          setManualName('');
          setManualIp('');
          setManualMac('');
          setManualModel('');
          setManualComment('');
          setManualInterface('');
        }
      }
    } finally {
      if (isMountedRef.current) setIsSavingManual(false);
    }
  };

  // Helper function to get vendor badge styling
  const getVendorBadgeStyle = (vendor: string) => {
    const v = (vendor || '').toLowerCase();
    if (v.includes('ubiquiti')) {
      return {
        badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
        iconBg: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        brandName: 'Ubiquiti UniFi / airMAX',
        colorBorder: 'hover:border-blue-500/50'
      };
    }
    if (v.includes('tp-link')) {
      return {
        badgeBg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
        iconBg: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
        brandName: 'TP-Link Omada / Pharos',
        colorBorder: 'hover:border-teal-500/50'
      };
    }
    if (v.includes('mikrotik')) {
      return {
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        brandName: 'MikroTik RouterBOARD / cAP',
        colorBorder: 'hover:border-emerald-500/50'
      };
    }
    if (v.includes('cambium')) {
      return {
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        iconBg: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        brandName: 'Cambium ePMP / cnPilot',
        colorBorder: 'hover:border-amber-500/50'
      };
    }
    if (v.includes('ruijie') || v.includes('reyee')) {
      return {
        badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
        iconBg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        brandName: 'Ruijie Reyee Cloud AP',
        colorBorder: 'hover:border-purple-500/50'
      };
    }
    return {
      badgeBg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      iconBg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      brandName: vendor || 'Access Point',
      colorBorder: 'hover:border-indigo-500/50'
    };
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'neighbor':
        return { label: 'MNDP / CDP كاشف الجيران', bg: 'bg-blue-500/15 text-blue-300 border-blue-500/30' };
      case 'capsman':
        return { label: 'إدارة CAPsMAN المركزية', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
      case 'dhcp':
        return { label: 'حجز DHCP نشط', bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
      case 'wireless_card':
        return { label: 'كرت المايكروتك المدمج', bg: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
      default:
        return { label: 'تعريف يدوي / شبكي', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="space-y-4" id="section-access-points-main">
      {/* Top Banner / Explanation */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-md shrink-0">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-white">
                نقاط الوصول وأجهزة البث المتصلة بالراوتر (Access Points)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {accessPoints.length} جهاز متصل
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed max-w-3xl">
              كشف تلقائي وتجميع شامل لجميع أجهزة الأكسس بوينت (Ubiquiti, TP-Link, MikroTik, Cambium, Ruijie) مع جلب أسمائها الحقيقية، الموديل، عناوين IP، منافذ الاتصال، وإمكانية الدخول السريع لصفحات التحكم وفحص الاتصال.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs sm:text-sm font-bold transition-all shadow-sm active:scale-95"
            id="btn-add-manual-ap"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>تعريف أكسس بوينت +</span>
          </button>

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('zctrl:open-network-section', { detail: 'scanner' }));
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-slate-700 text-xs sm:text-sm font-bold transition-all shadow-sm active:scale-95 cursor-pointer"
            title="الانتقال إلى ماسح الترددات والتشويش واختيار أفضل قناة للبث"
          >
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>فحص الترددات والتشويش</span>
          </button>

          <button
            type="button"
            onClick={() => {
              fetchAntennasData();
              showToast('جاري إعادة فحص واكتشاف أجهزة الأكسس بوينت...', 'info');
            }}
            disabled={isLoadingAccessPoints || isLoadingAntennas}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
            id="btn-scan-aps"
          >
            <RefreshCw className={`w-4 h-4 ${(isLoadingAccessPoints || isLoadingAntennas) ? 'animate-spin' : ''}`} />
            <span>إعادة مسح الأجهزة</span>
          </button>
        </div>
      </div>

      {/* Brand Filter Buttons */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            type="button"
            onClick={() => setSelectedVendor('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedVendor === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-950/80 hover:bg-slate-800 text-slate-400 border border-slate-800'
            }`}
          >
            <span>جميع الماركات</span>
            <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px]">{vendorCounts.all}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedVendor('ubiquiti')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedVendor === 'ubiquiti'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-950/80 hover:bg-slate-800 text-blue-400 border border-blue-500/20'
            }`}
          >
            <span>Ubiquiti (يوبيكويتي)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-200 text-[10px]">{vendorCounts.ubiquiti}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedVendor('tplink')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedVendor === 'tplink'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30'
                : 'bg-slate-950/80 hover:bg-slate-800 text-teal-400 border border-teal-500/20'
            }`}
          >
            <span>TP-Link (تي بي لينك)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-200 text-[10px]">{vendorCounts.tplink}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedVendor('mikrotik')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedVendor === 'mikrotik'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'bg-slate-950/80 hover:bg-slate-800 text-emerald-400 border border-emerald-500/20'
            }`}
          >
            <span>MikroTik (أنتنات مايكروتك)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-200 text-[10px]">{vendorCounts.mikrotik}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedVendor('cambium')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedVendor === 'cambium'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-slate-950/80 hover:bg-slate-800 text-amber-400 border border-amber-500/20'
            }`}
          >
            <span>Cambium (كامبيوم)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-200 text-[10px]">{vendorCounts.cambium}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedVendor('ruijie')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              selectedVendor === 'ruijie'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-950/80 hover:bg-slate-800 text-purple-400 border border-purple-500/20'
            }`}
          >
            <span>Ruijie Reyee</span>
            <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-200 text-[10px]">{vendorCounts.ruijie}</span>
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                viewMode === 'grid' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              شبكة بطاقات (Cards)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                viewMode === 'table' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              جدول تفصيلي (Table)
            </button>
          </div>
        </div>
      </div>

      {/* AP Grid or Table View */}
      {filteredAPs.length === 0 ? (
        <div className="p-10 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
            <Radio className="w-8 h-8 opacity-60" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-base font-bold text-white">لم يتم العثور على أجهزة أكسس بوينت مطابقة</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              تأكد من توصيل الأكسس بوينت بأحد منافذ الراوتر (Ethernet/Bridge)، أو تفعيل بروتوكول الاكتشاف (MNDP / CDP / LLDP) في الأكسس بوينت، أو قم بإضافته يدوياً بالضغط على زر "تعريف أكسس بوينت".
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fetchAntennasData()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md"
            >
              إعادة فحص الشبكة
            </button>
            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all"
            >
              تعريف نقطة وصول يدوياً
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAPs.map((ap) => {
            const style = getVendorBadgeStyle(ap.vendor);
            const sourceBadge = getSourceBadge(ap.source);
            const pingState = pingResults[ap.id];

            return (
              <div
                key={ap.id}
                className={`p-5 rounded-2xl bg-slate-900/90 border border-slate-800 ${style.colorBorder} transition-all shadow-xl space-y-4 relative overflow-hidden group flex flex-col justify-between`}
              >
                {/* Header: Vendor Badge & Real Identity Name */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-11 h-11 rounded-xl ${style.iconBg} flex items-center justify-center shrink-0 shadow-md`}>
                        <Radio className="w-6 h-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm sm:text-base font-black text-white truncate" title={ap.name}>
                            {ap.name || 'Access Point'}
                          </h3>
                          <button
                            type="button"
                            onClick={() => handleOpenEditAp(ap)}
                            className="text-slate-500 hover:text-indigo-300 transition-colors p-1"
                            title="تعديل اسم أو ملاحظات نقطة الوصول"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border inline-block mt-0.5 ${style.badgeBg}`}>
                          {ap.vendor || style.brandName}
                        </span>
                      </div>
                    </div>

                    {/* Source / Online badge */}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${sourceBadge.bg}`}>
                        {sourceBadge.label}
                      </span>
                      {ap.disabled && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          معطل
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SSID Banner (if broadcasted) */}
                  {ap.ssid && (
                    <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] text-slate-400 block">اسم شبكة البث (SSID):</span>
                          <span className="text-xs font-black text-emerald-300 font-mono truncate block" dir="ltr">
                            {ap.ssid}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(ap.ssid!, 'اسم الشبكة SSID')}
                        className="text-slate-500 hover:text-white p-1"
                        title="نسخ اسم الشبكة"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Specifications & Connection Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* IP Address */}
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">عنوان IP (الإدارة):</span>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="font-mono font-bold text-white truncate">
                          {ap.ipAddress || 'غير محدد'}
                        </span>
                        {ap.ipAddress && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(ap.ipAddress!, 'عنوان IP')}
                              className="text-slate-500 hover:text-white p-0.5"
                              title="نسخ IP"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Connected Port */}
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60">
                      <span className="text-[10px] text-slate-400 block">المنفذ المتصل:</span>
                      <span className="font-mono font-bold text-indigo-300 truncate block mt-0.5">
                        {ap.interface || 'LAN'}
                      </span>
                    </div>

                    {/* Model / Board */}
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-slate-400 block">الموديل واللوحة:</span>
                      <span className="font-medium text-slate-200 truncate block mt-0.5" title={`${ap.model || ''} ${ap.board || ''}`}>
                        {ap.model || ap.board || ap.platform || 'غير محدد'}
                      </span>
                    </div>

                    {/* MAC Address */}
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 col-span-2 sm:col-span-1">
                      <span className="text-[10px] text-slate-400 block">عنوان MAC:</span>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="font-mono text-slate-300 truncate text-[11px]" title={ap.macAddress}>
                          {ap.macAddress || '--'}
                        </span>
                        {ap.macAddress && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(ap.macAddress!, 'عنوان MAC')}
                            className="text-slate-500 hover:text-white p-0.5 shrink-0"
                            title="نسخ MAC"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Comment / Location Description */}
                  {ap.comment && (
                    <div className="p-2 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-[11px] text-indigo-200">
                      <span className="text-slate-400 font-semibold">ملاحظات / الموقع: </span>
                      <span>{ap.comment}</span>
                    </div>
                  )}

                  {/* Live Ping Status Indicator */}
                  {pingState && (
                    <div className={`p-2 rounded-xl border text-xs flex items-center justify-between ${
                      pingState.status === 'loading'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                        : pingState.status === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <Activity className={`w-3.5 h-3.5 ${pingState.status === 'loading' ? 'animate-spin' : ''}`} />
                        <span>{pingState.message || 'جاري الفحص...'}</span>
                      </div>
                      {pingState.loss && (
                        <span className="font-mono font-bold text-[10px]">{pingState.loss}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Action Buttons */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-1">
                    {ap.ipAddress ? (
                      <a
                        href={`http://${ap.ipAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm"
                        title="فتح صفحة الدخول ولوحة تحكم الأكسس بوينت في تبويب جديد"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>لوحة التحكم (Web)</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenEditAp(ap)}
                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                      >
                        <span>تعيين عنوان IP</span>
                      </button>
                    )}

                    {ap.ipAddress && (
                      <button
                        type="button"
                        onClick={() => handlePingAp(ap)}
                        disabled={pingingApId === ap.id}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                        title="فحص سرعة الاستجابة والاتصال (Ping)"
                      >
                        <Zap className={`w-3.5 h-3.5 text-amber-400 ${pingingApId === ap.id ? 'animate-spin' : ''}`} />
                        <span>Ping</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEditAp(ap)}
                    className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
                    title="تعديل اسم أو ملاحظات الجهاز"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed Table View */
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 font-bold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="p-3.5">اسم نقطة الوصول (AP)</th>
                  <th className="p-3.5">الماركة والموديل</th>
                  <th className="p-3.5">اسم شبكة البث (SSID)</th>
                  <th className="p-3.5">عنوان IP</th>
                  <th className="p-3.5">المنفذ</th>
                  <th className="p-3.5">عنوان MAC</th>
                  <th className="p-3.5">مصدر الكشف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredAPs.map((ap) => {
                  const style = getVendorBadgeStyle(ap.vendor);
                  const sourceBadge = getSourceBadge(ap.source);

                  return (
                    <tr key={ap.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 font-bold text-white">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{ap.name || 'Access Point'}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${style.badgeBg}`}>
                          {ap.vendor} {ap.model ? `(${ap.model})` : ''}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-emerald-300 font-bold" dir="ltr">
                        {ap.ssid || '--'}
                      </td>
                      <td className="p-3.5 font-mono font-bold text-white">
                        {ap.ipAddress ? (
                          <div className="flex items-center gap-1.5">
                            <span>{ap.ipAddress}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(ap.ipAddress!, 'IP')}
                              className="text-slate-500 hover:text-white"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-500">--</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-indigo-300">
                        {ap.interface || 'LAN'}
                      </td>
                      <td className="p-3.5 font-mono text-slate-400 text-[11px]">
                        {ap.macAddress || '--'}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${sourceBadge.bg}`}>
                          {sourceBadge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit AP Modal */}
      {editingAp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">تعديل وتسمية نقطة الوصول</h3>
                  <span className="text-xs text-slate-400 font-mono">{editingAp.ipAddress || editingAp.macAddress}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingAp(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAp} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">اسم نقطة الوصول (Friendly Name):</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="مثال: NanoStation Loco M5 - Sector 1 أو صالة الاستقبال"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">الملاحظات والموقع (Comment):</label>
                <input
                  type="text"
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  placeholder="مثال: سطح البرج الرئيسي - توجيه شمال غرب"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-bold text-indigo-200 block text-xs">استثناء الأكسس بوينت من الهوتسبوت (Hotspot IP Binding Bypass)</span>
                  <span className="text-[11px] text-slate-400 block">
                    يسمح بفتح صفحة التحكم بالأكسس بوينت مباشرة دون أن يطلب المايكروتك تسجيل دخول كرت
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={editBypassHotspot}
                  onChange={(e) => setEditBypassHotspot(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800 shrink-0"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAp(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingAp}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isSavingAp && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>حفظ التعديلات في المايكروتك</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual AP Registration Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">تعريف وتسجيل نقطة وصول جديدة</h3>
                  <span className="text-xs text-slate-400">تسجيل أكسس بوينت يدوياً واستثنائه من الهوتسبوت</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManualModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualAp} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">اسم نقطة الوصول:</label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="مثال: UAP-AC-LR-North"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">ماركة الجهاز (Vendor):</label>
                  <select
                    value={manualVendor}
                    onChange={(e) => setManualVendor(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="Ubiquiti Networks">Ubiquiti (يوبيكويتي)</option>
                    <option value="TP-Link">TP-Link (تي بي لينك)</option>
                    <option value="MikroTik">MikroTik (مايكروتك)</option>
                    <option value="Cambium Networks">Cambium (كامبيوم)</option>
                    <option value="Ruijie / Reyee">Ruijie Reyee</option>
                    <option value="Other">ماركة أخرى</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">عنوان IP (الإدارة):</label>
                  <input
                    type="text"
                    value={manualIp}
                    onChange={(e) => setManualIp(e.target.value)}
                    placeholder="مثال: 192.168.88.20"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-medium focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">عنوان MAC:</label>
                  <input
                    type="text"
                    value={manualMac}
                    onChange={(e) => setManualMac(e.target.value)}
                    placeholder="مثال: F0:9F:C2:AA:BB:CC"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-medium focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">موديل الجهاز (اختياري):</label>
                  <input
                    type="text"
                    value={manualModel}
                    onChange={(e) => setManualModel(e.target.value)}
                    placeholder="مثال: LiteBeam 5AC / EAP225"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-bold text-slate-300 block">المنفذ المتصل به (اختياري):</label>
                  <input
                    type="text"
                    value={manualInterface}
                    onChange={(e) => setManualInterface(e.target.value)}
                    placeholder="مثال: ether2 أو bridge-hotspot"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono font-medium focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-300 block">ملاحظات / موقع الجهاز:</label>
                <input
                  type="text"
                  value={manualComment}
                  onChange={(e) => setManualComment(e.target.value)}
                  placeholder="مثال: نقطة توزيع الدور الأول"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-medium focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-bold text-indigo-200 block text-xs">استثناء من بوابة الهوتسبوت (Hotspot Bypass)</span>
                  <span className="text-[11px] text-slate-400 block">
                    إضافة عنوان IP/MAC إلى IP-Binding كـ Bypassed لفتح صفحة الأكسس بوينت بدون طلب كرت
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={manualBypass}
                  onChange={(e) => setManualBypass(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-950 border-slate-800 shrink-0"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                >
                  {isSavingManual && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>حفظ وإضافة نقطة الوصول</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
