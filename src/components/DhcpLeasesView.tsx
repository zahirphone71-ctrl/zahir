import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  Network,
  Plus,
  Trash2,
  Search,
  Lock,
  Unlock,
  Laptop,
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { DhcpLease } from '../types/mikrotik';
import { exportDhcpLeasesToCsv } from '../lib/formatters';
import { PdfExportModal } from './PdfExportModal';
import { ConfirmModal } from './ConfirmModal';

type SortField = 'address' | 'macAddress' | 'hostName' | 'isDynamic' | 'expiresAfter' | 'comment';
type SortOrder = 'asc' | 'desc';

const compareIpOrString = (a?: string, b?: string): number => {
  const sa = String(a || '').trim();
  const sb = String(b || '').trim();
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ma = sa.match(ipv4);
  const mb = sb.match(ipv4);
  if (ma && mb) {
    for (let i = 1; i <= 4; i++) {
      const diff = Number(ma[i]) - Number(mb[i]);
      if (diff !== 0) return diff;
    }
    return 0;
  }
  return sa.localeCompare(sb);
};

const parseDurationSec = (str?: string): number => {
  if (!str) return 0;
  const s = String(str).trim();
  let total = 0;
  const matches = s.matchAll(/(\d+)\s*(w|d|h|m|s)/gi);
  let matched = false;
  for (const m of matches) {
    matched = true;
    const val = Number(m[1]);
    const unit = m[2].toLowerCase();
    if (unit === 'w') total += val * 604800;
    else if (unit === 'd') total += val * 86400;
    else if (unit === 'h') total += val * 3600;
    else if (unit === 'm') total += val * 60;
    else total += val;
  }
  if (matched) return total;
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  return 0;
};

export const DhcpLeasesView: React.FC = () => {
  const { dhcpLeases, addDhcpLease, makeStaticDhcpLeases, deleteDhcpLease, batchDeleteDhcpLeases, syncNow, showToast } = useMikroTik();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'dynamic' | 'static'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [makingStaticId, setMakingStaticId] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('address');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);

  // Delete / Action Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: async () => {}
  });

  // Form State
  const [address, setAddress] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [hostName, setHostName] = useState('');
  const [comment, setComment] = useState('');

  // Metrics
  const metrics = useMemo(() => {
    const list = Array.isArray(dhcpLeases) ? dhcpLeases : [];
    const dynamicCount = list.filter(l => l?.isDynamic).length;
    const staticCount = list.filter(l => !l?.isDynamic).length;
    return {
      total: list.length,
      dynamic: dynamicCount,
      static: staticCount
    };
  }, [dhcpLeases]);

  const safeSearch = (searchTerm || '').toLowerCase().trim();

  // Filter
  const filteredLeases = useMemo(() => {
    if (!Array.isArray(dhcpLeases)) return [];
    return dhcpLeases.filter((l) => {
      if (!l) return false;
      const matchesSearch = !safeSearch || (
        String(l.address || '').toLowerCase().includes(safeSearch) ||
        String(l.macAddress || '').toLowerCase().includes(safeSearch) ||
        String(l.hostName || '').toLowerCase().includes(safeSearch) ||
        String(l.comment || '').toLowerCase().includes(safeSearch)
      );

      const matchesType =
        filterType === 'all' ||
        (filterType === 'dynamic' && l.isDynamic) ||
        (filterType === 'static' && !l.isDynamic);

      return matchesSearch && matchesType;
    });
  }, [dhcpLeases, safeSearch, filterType]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Prune stale selections when dhcpLeases refreshes
  useEffect(() => {
    const validIds = new Set((dhcpLeases || []).map((l) => l.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [dhcpLeases]);

  // Sort
  const sortedLeases = useMemo(() => {
    return [...filteredLeases].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'address') {
        comparison = compareIpOrString(a.address, b.address);
      } else if (sortField === 'macAddress') {
        comparison = String(a.macAddress || '').localeCompare(String(b.macAddress || ''));
      } else if (sortField === 'hostName') {
        comparison = String(a.hostName || '').localeCompare(String(b.hostName || ''));
      } else if (sortField === 'isDynamic') {
        comparison = (a.isDynamic ? 1 : 0) - (b.isDynamic ? 1 : 0);
      } else if (sortField === 'expiresAfter') {
        comparison = parseDurationSec(a.expiresAfter) - parseDurationSec(b.expiresAfter);
      } else if (sortField === 'comment') {
        comparison = String(a.comment || '').localeCompare(String(b.comment || ''));
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredLeases, sortField, sortOrder]);

  // Pagination
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sortedLeases.length / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedLeases = useMemo(() => {
    if (pageSize === 0) return sortedLeases;
    const start = (validPage - 1) * pageSize;
    return sortedLeases.slice(start, start + pageSize);
  }, [sortedLeases, validPage, pageSize]);

  const allPaginatedSelected = paginatedLeases.length > 0 && paginatedLeases.every((l) => selectedIdSet.has(l.id));

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncNow(true);
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setIsRefreshing(false);
      }, 450);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleSelectAll = () => {
    const pageIds = paginatedLeases.map((l) => l.id);
    if (allPaginatedSelected) {
      const pageSet = new Set(pageIds);
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const handleMakeStaticSingle = async (lease: DhcpLease) => {
    setMakingStaticId(lease.id);
    try {
      await makeStaticDhcpLeases([lease.id]);
    } finally {
      if (isMountedRef.current) setMakingStaticId(null);
    }
  };

  const handleMakeStaticSelected = async () => {
    if (selectedIds.length === 0) return;
    const dynamicIds = dhcpLeases
      .filter((l) => selectedIdSet.has(l.id) && l.isDynamic)
      .map((l) => l.id);
    if (dynamicIds.length === 0) {
      showToast('جميع العناصر المحددة هي بالفعل عناوين ثابتة', 'info');
      return;
    }

    const res = await makeStaticDhcpLeases(dynamicIds);
    if (isMountedRef.current && res.success) {
      setSelectedIds([]);
    }
  };

  const handleDeleteSingle = (id: string, addr: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'حذف عنوان DHCP',
      message: `هل أنت متأكد من رغبتك في حذف حجز العنوان (${addr})؟`,
      onConfirm: async () => {
        const res = await deleteDhcpLease(id);
        if (isMountedRef.current && res.success) {
          setSelectedIds(prev => prev.filter(i => i !== id));
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: 'حذف العناوين المحددة',
      message: `هل تريد إزالة (${selectedIds.length}) عنوان محدد من سيرفر DHCP؟`,
      onConfirm: async () => {
        try {
          const res = await batchDeleteDhcpLeases(selectedIds);
          if (isMountedRef.current && res.success) {
            setSelectedIds([]);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
          }
        } catch {
          showToast('تعذر حذف بعض العناوين المحددة', 'error');
        }
      }
    });
  };

  const handleExportCsv = () => {
    const list = selectedIds.length > 0
      ? dhcpLeases.filter(l => selectedIdSet.has(l.id))
      : sortedLeases;
    if (list.length === 0) {
      showToast('لا توجد عناوين لتصديرها', 'info');
      return;
    }
    exportDhcpLeasesToCsv(list);
    showToast(`تم تصدير ${list.length} عنوان كملف CSV بنجاح`, 'success');
  };

  const handleCopyIps = async () => {
    const list = (selectedIds.length > 0
      ? dhcpLeases.filter(l => selectedIdSet.has(l.id)).map(l => l.address)
      : sortedLeases.map(l => l.address)
    ).filter(Boolean);
    if (list.length === 0) {
      showToast('لا توجد عناوين IP لنسخها', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(list.join('\n'));
      showToast(`تم نسخ ${list.length} عنوان IP إلى الحافظة`, 'success');
    } catch {
      showToast('تعذر النسخ إلى الحافظة', 'error');
    }
  };

  const handleCopyMacs = async () => {
    const list = (selectedIds.length > 0
      ? dhcpLeases.filter(l => selectedIdSet.has(l.id)).map(l => l.macAddress)
      : sortedLeases.map(l => l.macAddress)
    ).filter(Boolean);
    if (list.length === 0) {
      showToast('لا توجد عناوين MAC لنسخها', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(list.join('\n'));
      showToast(`تم نسخ ${list.length} عنوان MAC إلى الحافظة`, 'success');
    } catch {
      showToast('تعذر النسخ إلى الحافظة', 'error');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIp = address.trim();
    const cleanMac = macAddress.trim().toUpperCase();
    if (!cleanIp || !cleanMac) {
      showToast('عنوان IP وعنوان MAC مطلوبان', 'error');
      return;
    }
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
      showToast('صيغة عنوان IP غير صحيحة (مثال: 192.168.88.100)', 'error');
      return;
    }
    if (!/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(cleanMac)) {
      showToast('صيغة عنوان MAC غير صحيحة (مثال: 00:11:22:33:44:55)', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await addDhcpLease({
        address: cleanIp,
        macAddress: cleanMac,
        hostName: hostName.trim() || 'Custom-Device',
        comment: comment.trim() || 'Static Lease via ZCtrl'
      });

      if (isMountedRef.current && res.success) {
        setAddress('');
        setMacAddress('');
        setHostName('');
        setComment('');
        setIsAddModalOpen(false);
      }
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 opacity-60 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Header & Quick Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>سيرفر DHCP وعناوين الأجهزة (DHCP Leases)</span>
                <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
                  {dhcpLeases.length} عنوان
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                مراقبة جميع الأجهزة المتصلة بالراوتر، وتثبيت وحجز عناوين IP للأجهزة والسيرفرات
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="تحديث قائمة DHCP Leases من الراوتر"
            >
              <RefreshCw className={`w-4 h-4 text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير جدول DHCP كملف CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>تصدير CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold px-3.5 py-2 rounded-xl border border-rose-500/30 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير جدول عناوين الـ DHCP كملف PDF"
            >
              <FileDown className="w-4 h-4 text-rose-400" />
              <span>تصدير PDF</span>
            </button>

            <button
              type="button"
              id="open-add-lease-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>حجز IP ثابت جديد</span>
            </button>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">إجمالي العناوين</span>
              <span className="text-base font-bold text-slate-200 font-mono">{metrics.total}</span>
            </div>
            <Network className="w-5 h-5 text-slate-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">حجز ثابت (Static)</span>
              <span className="text-base font-bold text-emerald-400 font-mono">{metrics.static}</span>
            </div>
            <Lock className="w-5 h-5 text-emerald-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">ديناميكي (Dynamic)</span>
              <span className="text-base font-bold text-amber-400 font-mono">{metrics.dynamic}</span>
            </div>
            <Unlock className="w-5 h-5 text-amber-500/40" />
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute right-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالآيبي (IP)، الماك أدرس (MAC)، أو اسم الجهاز (Host Name)..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-9 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute left-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleMakeStaticSelected}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="تثبيت العناوين المحددة كـ Static"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>تثبيت المحدد ({selectedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف ({selectedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyIps}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-xl border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ IP</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyMacs}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-xl border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>نسخ MAC</span>
                </button>
              </>
            )}

            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setFilterType('all');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  filterType === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل ({metrics.total})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType('static');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  filterType === 'static' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                ثابت ({metrics.static})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType('dynamic');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  filterType === 'dynamic' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-amber-400'
                }`}
              >
                ديناميكي ({metrics.dynamic})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Leases Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto overflow-y-auto max-h-[520px] custom-scrollbar">
          <table className="w-full text-right text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold sticky top-0 z-10 select-none">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allPaginatedSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                  />
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('address')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>عنوان IP</span>
                    {renderSortIcon('address')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('macAddress')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>عنوان MAC Address</span>
                    {renderSortIcon('macAddress')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('hostName')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>اسم الجهاز (Host Name)</span>
                    {renderSortIcon('hostName')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('isDynamic')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>نوع الحجز</span>
                    {renderSortIcon('isDynamic')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('expiresAfter')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>الوقت المتبقي</span>
                    {renderSortIcon('expiresAfter')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('comment')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>الملاحظات</span>
                    {renderSortIcon('comment')}
                  </button>
                </th>

                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {paginatedLeases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-500">
                    <Network className="w-10 h-10 mx-auto mb-2 opacity-30 text-cyan-500" />
                    <p className="font-medium text-sm">لا توجد سجلات DHCP مطابقة للبحث</p>
                    <p className="text-xs text-slate-500 mt-1">تأكد من عمل سيرفر DHCP أو قم بإضافة حجز ثابت</p>
                  </td>
                </tr>
              ) : (
                paginatedLeases.map((lease) => {
                  const isSelected = selectedIdSet.has(lease.id);

                  return (
                    <tr
                      key={lease.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(lease.id)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-blue-400" dir="ltr">
                        {lease.address}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-200" dir="ltr">
                        {lease.macAddress}
                      </td>

                      <td className="py-3 px-4 text-slate-100 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Laptop className="w-3.5 h-3.5 text-slate-400" />
                          <span>{lease.hostName || 'جهاز بدون اسم'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {lease.isDynamic ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Unlock className="w-3 h-3" />
                            <span>ديناميكي (Dynamic)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Lock className="w-3 h-3" />
                            <span>حجز ثابت (Static)</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400 text-[11px]" dir="ltr">
                        {lease.expiresAfter || '—'}
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        <span className="text-[11px]">{lease.comment || '—'}</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {lease.isDynamic && (
                            <button
                              type="button"
                              onClick={() => handleMakeStaticSingle(lease)}
                              disabled={makingStaticId === lease.id}
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                              title="تحويل إلى حجز ثابت (Make Static)"
                            >
                              {makingStaticId === lease.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Lock className="w-3 h-3" />
                              )}
                              <span>تثبيت</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteSingle(lease.id, lease.address)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="حذف الحجز"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {sortedLeases.length > 0 && (
          <div className="bg-slate-950/80 px-4 py-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-400 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span>عرض</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none"
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>الكل</option>
                </select>
                <span>عنوان</span>
              </div>

              <span>
                (إجمالي: <strong className="text-slate-200 font-mono">{sortedLeases.length}</strong> عنوان)
              </span>
            </div>

            {pageSize > 0 && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={validPage <= 1}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  title="الصفحة السابقة"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="font-mono text-slate-300">
                  صفحة {validPage} من {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={validPage >= totalPages}
                  className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                  title="الصفحة التالية"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in-50" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-slate-100">حجز عنوان IP ثابت في DHCP</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdd} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  عنوان الآيبي المطلوب حجزه (IP Address) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="192.168.88.100"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  عنوان الماك أدرس للجهاز (MAC Address) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="00:11:22:33:44:55"
                  value={macAddress}
                  onChange={(e) => setMacAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 uppercase text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  اسم الجهاز (Host Name)
                </label>
                <input
                  type="text"
                  placeholder="Office-Printer أو Server-1"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  الملاحظات
                </label>
                <input
                  type="text"
                  placeholder="حجز طابعة الشبكة أو كاميرا المدخل"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>حفظ وتثبيت العنوان</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="تأكيد التنفيذ"
        cancelText="إلغاء"
        type="danger"
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* Formatted PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="dhcp"
        filteredItems={sortedLeases}
      />
    </div>
  );
};
