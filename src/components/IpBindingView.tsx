import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  BookmarkCheck,
  Plus,
  Trash2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tv,
  Camera,
  Laptop,
  CheckCircle2,
  X,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  RefreshCw
} from 'lucide-react';
import { exportIpBindingsToCsv } from '../lib/formatters';
import { ConfirmModal } from './ConfirmModal';
import { PdfExportModal } from './PdfExportModal';

type SortField = 'type' | 'macAddress' | 'address' | 'server' | 'comment';
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

export const IpBindingView: React.FC = () => {
  const { ipBindings, addIpBinding, deleteIpBinding, batchDeleteIpBindings, isConnected, showToast, syncNow } = useMikroTik();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isMountedRef = useRef(true);
  const hasAutoFetchedRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Auto-fetch IP bindings once when connected and empty (prevents infinite polling loop)
  useEffect(() => {
    if (!isConnected) {
      hasAutoFetchedRef.current = false;
      return;
    }
    if (!hasAutoFetchedRef.current && (!ipBindings || ipBindings.length === 0)) {
      hasAutoFetchedRef.current = true;
      syncNow();
    }
  }, [isConnected, ipBindings, syncNow]);

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

  // Sorting
  const [sortField, setSortField] = useState<SortField>('macAddress');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Multi-selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Confirmation Modal
  const [deleteModal, setDeleteModal] = useState<{
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
  const [macAddress, setMacAddress] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<'bypassed' | 'regular' | 'blocked'>('bypassed');
  const [comment, setComment] = useState('');
  const [devicePreset, setDevicePreset] = useState('custom');

  // Metrics
  const metrics = useMemo(() => {
    const list = Array.isArray(ipBindings) ? ipBindings : [];
    const bypassed = list.filter(b => b?.type === 'bypassed').length;
    const blocked = list.filter(b => b?.type === 'blocked').length;
    const regular = list.filter(b => b?.type === 'regular' || !b?.type).length;
    return { total: list.length, bypassed, blocked, regular };
  }, [ipBindings]);

  const safeSearch = (searchTerm || '').toLowerCase().trim();

  // Filter
  const filteredBindings = useMemo(() => {
    if (!Array.isArray(ipBindings)) return [];
    return ipBindings.filter((b) => {
      if (!b) return false;
      const matchesSearch = !safeSearch || (
        String(b.macAddress || '').toLowerCase().includes(safeSearch) ||
        String(b.address || '').toLowerCase().includes(safeSearch) ||
        String(b.comment || '').toLowerCase().includes(safeSearch)
      );

      const matchesType = filterType === 'all' || b.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [ipBindings, safeSearch, filterType]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Prune stale selections if bindings list changes
  useEffect(() => {
    const validIds = new Set((ipBindings || []).map((b) => b.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [ipBindings]);

  // Sort
  const sortedBindings = useMemo(() => {
    return [...filteredBindings].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'macAddress') {
        comparison = String(a.macAddress || '').localeCompare(String(b.macAddress || ''));
      } else if (sortField === 'address') {
        comparison = compareIpOrString(a.address, b.address);
      } else if (sortField === 'type') {
        comparison = String(a.type || '').localeCompare(String(b.type || ''));
      } else if (sortField === 'server') {
        comparison = String(a.server || '').localeCompare(String(b.server || ''));
      } else if (sortField === 'comment') {
        comparison = String(a.comment || '').localeCompare(String(b.comment || ''));
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredBindings, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const allFilteredSelected = sortedBindings.length > 0 && sortedBindings.every((b) => selectedIdSet.has(b.id));

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(sortedBindings.map((b) => b.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...sortedBindings.map((b) => b.id)])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const handleApplyPreset = (preset: string) => {
    setDevicePreset(preset);
    if (preset === 'smart_tv') {
      setComment('شاشة ذكية / Smart TV (استثناء دائم من صفحة الدخول)');
      setType('bypassed');
    } else if (preset === 'camera') {
      setComment('كاميرا مراقبة IP Camera (استثناء وتثبيت)');
      setType('bypassed');
    } else if (preset === 'staff') {
      setComment('جهاز الإدارة والموظفين (Bypass)');
      setType('bypassed');
    } else if (preset === 'blocked') {
      setComment('جهاز محظور من الشبكة (Blocked MAC)');
      setType('blocked');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMac = macAddress.trim().toUpperCase();
    const cleanIp = address.trim();
    if (!cleanMac) {
      showToast('عنوان الماك أدرس (MAC) مطلوب', 'error');
      return;
    }
    if (!/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/.test(cleanMac)) {
      showToast('صيغة عنوان MAC غير صحيحة (مثال: AA:BB:CC:DD:EE:FF)', 'error');
      return;
    }
    if (cleanIp && !/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIp)) {
      showToast('صيغة عنوان IP غير صحيحة (مثال: 192.168.88.50)', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const res = await addIpBinding({
        macAddress: cleanMac,
        address: cleanIp || undefined,
        type,
        comment: comment.trim() || 'Added via ZCtrl',
        server: 'all'
      });

      if (isMountedRef.current && res.success) {
        setMacAddress('');
        setAddress('');
        setComment('');
        setIsAddModalOpen(false);
      }
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  };

  const handleDeleteSingle = (id: string, mac: string) => {
    setDeleteModal({
      isOpen: true,
      title: 'حذف جهاز من IP Binding',
      message: `هل أنت متأكد من رغبتك في إزالة الجهاز ذو الماك (${mac}) من قائمة الاستثناء/الحظر؟`,
      onConfirm: async () => {
        const res = await deleteIpBinding(id);
        if (isMountedRef.current && res.success) {
          setSelectedIds(prev => prev.filter(i => i !== id));
          setDeleteModal(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setDeleteModal({
      isOpen: true,
      title: 'حذف الأجهزة المحددة',
      message: `هل تريد إزالة (${selectedIds.length}) جهاز محدد من قائمة IP Binding نهائياً؟`,
      onConfirm: async () => {
        try {
          const res = await batchDeleteIpBindings(selectedIds);
          if (isMountedRef.current && res.success) {
            setSelectedIds([]);
            setDeleteModal(prev => ({ ...prev, isOpen: false }));
          }
        } catch {
          showToast('تعذر حذف بعض الأجهزة المحددة', 'error');
        }
      }
    });
  };

  const handleExportCsv = () => {
    const list = selectedIds.length > 0
      ? ipBindings.filter(b => selectedIdSet.has(b.id))
      : sortedBindings;
    if (list.length === 0) {
      showToast('لا توجد أجهزة لتصديرها', 'info');
      return;
    }
    exportIpBindingsToCsv(list);
    showToast(`تم تصدير ${list.length} جهاز كملف CSV بنجاح`, 'success');
  };

  const handleCopySelectedMacs = async () => {
    const list = (selectedIds.length > 0
      ? ipBindings.filter(b => selectedIdSet.has(b.id)).map(b => b.macAddress)
      : sortedBindings.map(b => b.macAddress)
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

  const handleCopySingleMac = async (mac: string) => {
    if (!mac) return;
    try {
      await navigator.clipboard.writeText(mac);
      showToast(`تم نسخ MAC: ${mac}`, 'info');
    } catch {
      showToast('تعذر النسخ إلى الحافظة', 'error');
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
      {/* Header & Explanation Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <BookmarkCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>الأجهزة المستثناة والمحظورة (IP Binding)</span>
                <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
                  {ipBindings.length} جهاز
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                استثناء الشاشات الذكية، كاميرات المراقبة، وأجهزة الإدارة من صفحة تسجيل الدخول، أو حظر أجهزة معينة نهائياً
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير بيانات الأجهزة إلى ملف CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>تصدير CSV</span>
            </button>

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="تحديث قائمة الأجهزة والعناوين المربوطة من الراوتر"
            >
              <RefreshCw className={`w-4 h-4 text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              id="open-add-binding-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة جهاز جديد</span>
            </button>
          </div>
        </div>

        {/* Quick Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">إجمالي المسجلين</span>
              <span className="text-base font-bold text-slate-200 font-mono">{metrics.total}</span>
            </div>
            <BookmarkCheck className="w-5 h-5 text-slate-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">مستثنى (Bypass)</span>
              <span className="text-base font-bold text-emerald-400 font-mono">{metrics.bypassed}</span>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">محظور (Blocked)</span>
              <span className="text-base font-bold text-rose-400 font-mono">{metrics.blocked}</span>
            </div>
            <ShieldAlert className="w-5 h-5 text-rose-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">عادي (Regular)</span>
              <span className="text-base font-bold text-blue-400 font-mono">{metrics.regular}</span>
            </div>
            <CheckCircle2 className="w-5 h-5 text-blue-500/40" />
          </div>
        </div>

        {/* Quick Filter Bar */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute right-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="بحث بالماك أدرس، الآيبي، أو الملاحظة..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-9 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute left-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف المحدد ({selectedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopySelectedMacs}
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
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  filterType === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل ({metrics.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('bypassed')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  filterType === 'bypassed'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                مستثنى ({metrics.bypassed})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('blocked')}
                className={`px-3 py-1.5 rounded-lg transition-colors font-medium cursor-pointer ${
                  filterType === 'blocked'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                محظور ({metrics.blocked})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table of IP Bindings */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto overflow-y-auto max-h-[520px] custom-scrollbar">
          <table className="w-full text-right text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold sticky top-0 z-10 select-none">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                  />
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('type')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>نوع الاستثناء</span>
                    {renderSortIcon('type')}
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
                    onClick={() => handleSort('address')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>عنوان IP المخصص</span>
                    {renderSortIcon('address')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('server')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>السيرفر</span>
                    {renderSortIcon('server')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('comment')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>الملاحظات والوصف</span>
                    {renderSortIcon('comment')}
                  </button>
                </th>

                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {sortedBindings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-500">
                    <BookmarkCheck className="w-10 h-10 mx-auto mb-2 opacity-30 text-amber-500" />
                    <p className="font-medium text-sm">لا توجد أجهزة مطابقة للبحث حالياً</p>
                    <p className="text-xs text-slate-500 mt-1">أضف أجهزة ذكية أو كاميرات لاستثنائها من تسجيل الدخول</p>
                  </td>
                </tr>
              ) : (
                sortedBindings.map((binding) => {
                  const isBypassed = binding.type === 'bypassed';
                  const isBlocked = binding.type === 'blocked';
                  const isSelected = selectedIdSet.has(binding.id);

                  return (
                    <tr
                      key={binding.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(binding.id)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            isBypassed
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : isBlocked
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                          }`}
                        >
                          {isBypassed && <ShieldCheck className="w-3.5 h-3.5" />}
                          {isBlocked && <ShieldAlert className="w-3.5 h-3.5" />}
                          {!isBypassed && !isBlocked && <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span>{isBypassed ? 'مستثنى (Bypass)' : isBlocked ? 'محظور (Blocked)' : 'عادي (Regular)'}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-slate-100" dir="ltr">
                        {binding.macAddress}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-300" dir="ltr">
                        {binding.address || <span className="text-slate-500 font-sans text-[11px]">تلقائي (DHCP)</span>}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-400">
                        {binding.server || 'all'}
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        <span className="font-medium text-xs">{binding.comment || '—'}</span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {binding.macAddress && (
                            <button
                              type="button"
                              onClick={() => handleCopySingleMac(binding.macAddress)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                              title="نسخ MAC"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteSingle(binding.id, binding.macAddress)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="حذف الجهاز"
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
      </div>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in-50" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-slate-100">إضافة جهاز في IP Binding</h3>
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
              {/* Device Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">قوالب أجهزة سريعة:</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('smart_tv')}
                    className={`p-2 rounded-xl border text-center transition-all text-xs flex flex-col items-center gap-1 cursor-pointer ${
                      devicePreset === 'smart_tv'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Tv className="w-4 h-4" />
                    <span>شاشة ذكية</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('camera')}
                    className={`p-2 rounded-xl border text-center transition-all text-xs flex flex-col items-center gap-1 cursor-pointer ${
                      devicePreset === 'camera'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                    <span>كاميرا مراقبة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('staff')}
                    className={`p-2 rounded-xl border text-center transition-all text-xs flex flex-col items-center gap-1 cursor-pointer ${
                      devicePreset === 'staff'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Laptop className="w-4 h-4" />
                    <span>جهاز إدارة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyPreset('blocked')}
                    className={`p-2 rounded-xl border text-center transition-all text-xs flex flex-col items-center gap-1 cursor-pointer ${
                      devicePreset === 'blocked'
                        ? 'bg-rose-600/20 border-rose-500 text-rose-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>حظر الجهاز</span>
                  </button>
                </div>
              </div>

              {/* MAC Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  عنوان الماك أدرس (MAC Address) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="AA:BB:CC:DD:EE:FF"
                  value={macAddress}
                  onChange={(e) => setMacAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 uppercase text-left"
                  dir="ltr"
                />
              </div>

              {/* IP Address */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  عنوان IP مخصص (اختياري)
                </label>
                <input
                  type="text"
                  placeholder="192.168.88.50"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-blue-500 text-left"
                  dir="ltr"
                />
              </div>

              {/* Action Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  نوع الاستثناء (Type)
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-blue-500"
                >
                  <option value="bypassed">مستثنى (Bypassed) - اتصال مباشر بدون صفحة دخول</option>
                  <option value="blocked">محظور (Blocked) - منع الجهاز تماماً من الاتصال</option>
                  <option value="regular">عادي (Regular) - يمر عبر صفحة الدخول كالمعتاد</option>
                </select>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ملاحظات أو اسم الجهاز
                </label>
                <input
                  type="text"
                  placeholder="مثال: شاشة الاستقبال LG Smart TV"
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
                  <span>حفظ وإضافة الجهاز</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        title={deleteModal.title}
        message={deleteModal.message}
        confirmText="تأكيد الحذف"
        cancelText="إلغاء"
        type="danger"
        onConfirm={deleteModal.onConfirm}
        onClose={() => setDeleteModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="ip_binding"
        filteredItems={sortedBindings}
      />
    </div>
  );
};
