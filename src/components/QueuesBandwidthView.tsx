import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import { SimpleQueue } from '../types/mikrotik';
import {
  Gauge,
  Plus,
  Trash2,
  Edit2,
  X,
  FileDown,
  Search,
  CheckCircle2,
  Power,
  Activity,
  Layers,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatBytes, formatRateLimit, exportQueuesToCsv } from '../lib/formatters';
import { safeStorage } from '../utils/safeStorage';
import { PdfExportModal } from './PdfExportModal';
import { ConfirmModal } from './ConfirmModal';

const SPEED_PRESETS = [
  { label: '1M / 512k', max: '512k/1M', limitAt: '256k/512k', desc: 'تصفح أساسي 1 ميجا' },
  { label: '2M / 1M', max: '1M/2M', limitAt: '512k/1M', desc: 'سرعة اقتصادية 2 ميجا' },
  { label: '4M / 2M', max: '2M/4M', limitAt: '1M/2M', desc: 'باقة قياسية 4 ميجا' },
  { label: '10M / 2M', max: '2M/10M', limitAt: '1M/5M', desc: 'سرعة سريعة 10 ميجا' },
  { label: '20M / 5M', max: '5M/20M', limitAt: '2M/10M', desc: 'فائقة السرعة 20 ميجا' },
  { label: '50M / 10M', max: '10M/50M', limitAt: '5M/25M', desc: 'سرعة VIP للألعاب 50 ميجا' },
  { label: '100M / 20M', max: '20M/100M', limitAt: '10M/50M', desc: 'ألياف ضوئية 100 ميجا' }
];

type SortField = 'name' | 'target' | 'maxLimit' | 'priority' | 'bytes' | 'disabled';
type SortOrder = 'asc' | 'desc';

const parseQueueBytes = (q: SimpleQueue): { rx: number; tx: number; total: number } => {
  if (typeof q.bytesTotal === 'number' && !Number.isNaN(q.bytesTotal)) {
    return {
      rx: Number(q.bytesIn) || 0,
      tx: Number(q.bytesOut) || 0,
      total: q.bytesTotal
    };
  }
  const raw = String(q.bytes || '0');
  if (raw.includes('/')) {
    const [rxStr, txStr] = raw.split('/');
    const rx = Number(rxStr) || 0;
    const tx = Number(txStr) || 0;
    return { rx, tx, total: rx + tx };
  }
  const n = Number(raw) || 0;
  return { rx: n, tx: 0, total: n };
};

const parseRateUnitToBps = (token: string): number => {
  const m = String(token || '').trim().match(/^(\d+(?:\.\d+)?)([kKmMgG]?)$/);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'k') return num * 1000;
  if (unit === 'm') return num * 1000000;
  if (unit === 'g') return num * 1000000000;
  return num;
};

const parseMaxLimitBps = (rateLimit?: string): number => {
  if (!rateLimit) return 0;
  const parts = String(rateLimit).trim().split('/');
  if (parts.length === 2) return parseRateUnitToBps(parts[0]) + parseRateUnitToBps(parts[1]);
  return parseRateUnitToBps(parts[0]);
};

const compareIpOrText = (a?: string, b?: string): number => {
  const cleanA = String(a || '').split('/')[0].trim();
  const cleanB = String(b || '').split('/')[0].trim();
  const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ma = cleanA.match(ipRegex);
  const mb = cleanB.match(ipRegex);
  if (ma && mb) {
    for (let i = 1; i <= 4; i++) {
      const diff = Number(ma[i]) - Number(mb[i]);
      if (diff !== 0) return diff;
    }
    return String(a || '').localeCompare(String(b || ''));
  }
  return String(a || '').localeCompare(String(b || ''));
};

export const QueuesBandwidthView: React.FC = () => {
  const { simpleQueues, addQueue, updateQueue, deleteQueue, batchDeleteQueues, batchToggleQueues, showToast, refreshQueues, isConnected } = useMikroTik();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBatchOperating, setIsBatchOperating] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isConnected) {
      refreshQueues().catch(() => {});
    }
  }, [isConnected, refreshQueues]);

  const handleManualRefresh = async () => {
    if (isRefreshing || !isConnected) return;
    setIsRefreshing(true);
    try {
      await refreshQueues();
    } finally {
      if (isMountedRef.current) setIsRefreshing(false);
    }
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<SimpleQueue | null>(null);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Multi-Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = safeStorage.getItem('set_app_paging');
    if (saved && saved !== 'all') {
      const num = parseInt(saved, 10);
      return isNaN(num) ? 30 : num;
    }
    return 30;
  });

  // Form State
  const [formName, setFormName] = useState('queue_client');
  const [formTarget, setFormTarget] = useState('192.168.88.100/32');
  const [formMaxLimit, setFormMaxLimit] = useState('2M/10M');
  const [formLimitAt, setFormLimitAt] = useState('512k/2M');
  const [formPriority, setFormPriority] = useState('8/8');
  const [formDisabled, setFormDisabled] = useState(false);
  const [formBurstLimit, setFormBurstLimit] = useState('');
  const [formBurstThreshold, setFormBurstThreshold] = useState('');
  const [formBurstTime, setFormBurstTime] = useState('');
  const [formParent, setFormParent] = useState('none');
  const [formQueue, setFormQueue] = useState('default-small/default-small');
  const [formComment, setFormComment] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);

  const openAddModal = () => {
    setEditingQueue(null);
    const randSuffix = new Uint32Array(1);
    crypto.getRandomValues(randSuffix);
    setFormName(`queue_${100 + (randSuffix[0] % 900)}`);
    setFormTarget('192.168.88.50/32');
    setFormMaxLimit('2M/10M');
    setFormLimitAt('512k/2M');
    setFormPriority('8/8');
    setFormDisabled(false);
    setFormBurstLimit('');
    setFormBurstThreshold('');
    setFormBurstTime('');
    setFormParent('none');
    setFormQueue('default-small/default-small');
    setFormComment('');
    setShowAdvanced(false);
    setIsModalOpen(true);
  };

  const openEditModal = (q: SimpleQueue) => {
    setEditingQueue(q);
    setFormName(q.name || '');
    setFormTarget(q.target || '');
    setFormMaxLimit(q.maxLimit && q.maxLimit !== '0/0' ? q.maxLimit : '');
    setFormLimitAt(q.limitAt && q.limitAt !== '0/0' ? q.limitAt : '');
    setFormPriority(q.priority || '8/8');
    setFormDisabled(Boolean(q.disabled));
    setFormBurstLimit(q.burstLimit && q.burstLimit !== '0/0' ? q.burstLimit : '');
    setFormBurstThreshold(q.burstThreshold && q.burstThreshold !== '0/0' ? q.burstThreshold : '');
    setFormBurstTime(q.burstTime && q.burstTime !== '0s/0s' ? q.burstTime : '');
    setFormParent(q.parent || 'none');
    setFormQueue(q.queue || 'default-small/default-small');
    setFormComment(q.comment || '');
    setShowAdvanced(Boolean(
      (q.burstLimit && q.burstLimit !== '0/0') ||
      (q.parent && q.parent !== 'none') ||
      q.comment
    ));
    setIsModalOpen(true);
  };

  const handleApplyPreset = (preset: typeof SPEED_PRESETS[0]) => {
    setFormMaxLimit(preset.max);
    setFormLimitAt(preset.limitAt);
  };

  // Form Validation
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formName.trim();
    const cleanTarget = formTarget.trim();
    const cleanMax = (formMaxLimit.trim() || '0/0');

    if (!cleanName || !cleanTarget) {
      showToast('يرجى ملء اسم القاعدة وعنوان الهدف', 'error');
      return;
    }

    // Validate IPv4/CIDR or interface name (non-empty without whitespace)
    const isIpv4OrCidr = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)(\/([0-9]|[12]\d|3[0-2]))?$/.test(cleanTarget);
    const isInterfaceOrPool = /^[a-zA-Z0-9_.,-]+$/.test(cleanTarget);
    if (!isIpv4OrCidr && !isInterfaceOrPool) {
      showToast('تنسيق الهدف (Target) غير صالح. أدخل IP مثل 192.168.88.50/32 أو اسم منفذ.', 'error');
      return;
    }

    if (cleanMax !== '0/0' && !/^\d+(\.\d+)?[kKmMgG]?\/\d+(\.\d+)?[kKmMgG]?$/.test(cleanMax)) {
      showToast('صيغة السرعة القصوى (Max Limit) غير صحيحة. مثال: 2M/10M أو 512k/1M', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Partial<SimpleQueue> = {
        name: cleanName,
        target: cleanTarget,
        maxLimit: cleanMax,
        limitAt: formLimitAt.trim(),
        priority: formPriority.trim() || '8/8',
        disabled: formDisabled,
        burstLimit: formBurstLimit.trim(),
        burstThreshold: formBurstThreshold.trim(),
        burstTime: formBurstTime.trim(),
        parent: formParent.trim() || 'none',
        queue: formQueue.trim() || 'default-small/default-small',
        comment: formComment.trim()
      };
      if (editingQueue) {
        const res = await updateQueue(editingQueue.id, payload);
        if (isMountedRef.current && res.success) {
          setIsModalOpen(false);
        }
      } else {
        const res = await addQueue(payload);
        if (isMountedRef.current && res.success) {
          setIsModalOpen(false);
        }
      }
    } finally {
      if (isMountedRef.current) setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deletingId) return;
    setDeletingId(deleteTarget.id);
    try {
      const res = await deleteQueue(deleteTarget.id);
      if (isMountedRef.current && res.success) {
        setSelectedIds(prev => prev.filter(i => i !== deleteTarget.id));
      }
    } finally {
      if (isMountedRef.current) {
        setDeletingId(null);
        setDeleteTarget(null);
      }
    }
  };

  const handleConfirmBatchDelete = async () => {
    if (selectedIds.length === 0 || isBatchOperating) return;
    setIsBatchOperating(true);
    try {
      const res = await batchDeleteQueues(selectedIds);
      if (isMountedRef.current && res.success) {
        setSelectedIds([]);
        setBatchDeleteConfirm(false);
      }
    } catch {
      showToast('تعذر حذف بعض القواعد المحددة', 'error');
    } finally {
      if (isMountedRef.current) setIsBatchOperating(false);
    }
  };

  const handleBatchToggleStatus = async (disable: boolean) => {
    if (selectedIds.length === 0 || isBatchOperating) return;
    setIsBatchOperating(true);
    try {
      await batchToggleQueues(selectedIds, disable);
    } catch {
      showToast('تعذر تعديل حالة القواعد المحددة', 'error');
    } finally {
      if (isMountedRef.current) setIsBatchOperating(false);
    }
  };

  const handleToggleDisabled = async (q: SimpleQueue) => {
    if (togglingId) return;
    setTogglingId(q.id);
    try {
      await updateQueue(q.id, { disabled: !q.disabled });
    } finally {
      if (isMountedRef.current) setTogglingId(null);
    }
  };

  // Filtered Queues List
  const filteredQueues = useMemo(() => {
    if (!Array.isArray(simpleQueues)) return [];
    return simpleQueues.filter((q) => {
      const qName = String(q.name || '').toLowerCase();
      const qTarget = String(q.target || '').toLowerCase();
      const qLimit = String(q.maxLimit || '').toLowerCase();
      const search = searchQuery.toLowerCase().trim();

      const matchesSearch = !search || qName.includes(search) || qTarget.includes(search) || qLimit.includes(search);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' && !q.disabled) ||
        (statusFilter === 'disabled' && Boolean(q.disabled));

      return matchesSearch && matchesStatus;
    });
  }, [simpleQueues, searchQuery, statusFilter]);

  // Prune stale selections when queues refresh
  useEffect(() => {
    if (!Array.isArray(simpleQueues)) return;
    const validIds = new Set(simpleQueues.map(q => q.id));
    setSelectedIds(prev => {
      const next = prev.filter(id => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [simpleQueues]);

  // Reset pagination when search/status filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Sorted Queues List
  const sortedQueues = useMemo(() => {
    return [...filteredQueues].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = String(a.name || '').localeCompare(String(b.name || ''));
      } else if (sortField === 'target') {
        comparison = compareIpOrText(a.target, b.target);
      } else if (sortField === 'maxLimit') {
        comparison = parseMaxLimitBps(a.maxLimit) - parseMaxLimitBps(b.maxLimit);
      } else if (sortField === 'priority') {
        const pa = parseInt(String(a.priority || '8').split('/')[0], 10) || 8;
        const pb = parseInt(String(b.priority || '8').split('/')[0], 10) || 8;
        comparison = pa - pb;
      } else if (sortField === 'bytes') {
        comparison = parseQueueBytes(a).total - parseQueueBytes(b).total;
      } else if (sortField === 'disabled') {
        comparison = (a.disabled ? 1 : 0) - (b.disabled ? 1 : 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredQueues, sortField, sortOrder]);

  // Statistics
  const stats = useMemo(() => {
    const list = Array.isArray(simpleQueues) ? simpleQueues : [];
    const total = list.length;
    const enabled = list.filter((q) => !q.disabled).length;
    const disabled = total - enabled;
    const totalBytes = list.reduce((acc, q) => acc + parseQueueBytes(q).total, 0);
    return { total, enabled, disabled, totalBytes };
  }, [simpleQueues]);

  // Pagination
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sortedQueues.length / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedQueues = useMemo(() => {
    if (pageSize === 0) return sortedQueues;
    const start = (validPage - 1) * pageSize;
    return sortedQueues.slice(start, start + pageSize);
  }, [sortedQueues, validPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const allOnPageSelected = paginatedQueues.length > 0 && paginatedQueues.every(q => selectedIdSet.has(q.id));

  const handleSelectAll = () => {
    const pageIds = new Set(paginatedQueues.map(q => q.id));
    if (allOnPageSelected) {
      setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => (selectedIdSet.has(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const handleExportCsv = () => {
    const list = selectedIds.length > 0
      ? simpleQueues.filter(q => selectedIdSet.has(q.id))
      : sortedQueues;
    exportQueuesToCsv(list);
    showToast(`تم تصدير ${list.length} قاعدة كملف CSV بنجاح`, 'success');
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
    <div className="space-y-4 animate-in fade-in duration-200" dir="rtl">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>قواعد تحديد السرعات وجودة الخدمة (Simple Queues & QoS)</span>
                <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
                  {stats.total} قاعدة
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                التحكم الدقيق في سقف السرعة (Upload / Download) لكل IP أو شبكة فرعية لضمان عدالة توزيع الإنترنت ومنع استنزاف الباندويث
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing || !isConnected}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
              title="جلب القواعد والاستهلاك الفعلي من الراوتر"
            >
              <RefreshCw className={`w-4 h-4 text-blue-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير القواعد إلى ملف CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>تصدير CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold px-3.5 py-2 rounded-xl border border-rose-500/30 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير قواعد وتحديدات السرعات كملف PDF"
            >
              <FileDown className="w-4 h-4 text-rose-400" />
              <span>تصدير PDF</span>
            </button>

            <button
              type="button"
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قاعدة سرعة</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">إجمالي القواعد</span>
              <span className="text-base font-bold text-white font-mono">{stats.total}</span>
            </div>
            <Gauge className="w-5 h-5 text-slate-500/40" />
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">القواعد النشطة</span>
              <span className="text-base font-bold text-emerald-400 font-mono">{stats.enabled}</span>
            </div>
            <Power className="w-5 h-5 text-emerald-500/40" />
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">القواعد المعطلة</span>
              <span className="text-base font-bold text-amber-400 font-mono">{stats.disabled}</span>
            </div>
            <Power className="w-5 h-5 text-amber-500/40" />
          </div>

          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">البيانات الممررة</span>
              <span className="text-base font-bold text-blue-400 font-mono" dir="ltr">{formatBytes(stats.totalBytes)}</span>
            </div>
            <Activity className="w-5 h-5 text-blue-500/40" />
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث باسم القاعدة أو الـ IP أو السرعة القصوى..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pr-10 pl-9 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
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
                  onClick={() => handleBatchToggleStatus(false)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>تفعيل ({selectedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchToggleStatus(true)}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>تعطيل ({selectedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBatchDeleteConfirm(true)}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف ({selectedIds.length})</span>
                </button>
              </>
            )}

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                الكل ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('enabled')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === 'enabled' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                نشطة ({stats.enabled})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('disabled')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  statusFilter === 'disabled' ? 'bg-amber-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                معطلة ({stats.disabled})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Queues Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[520px] custom-scrollbar">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-bold sticky top-0 z-10 select-none">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                  />
                </th>

                <th className="py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('disabled')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>الحالة</span>
                    {renderSortIcon('disabled')}
                  </button>
                </th>

                <th className="py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>اسم القاعدة (Name)</span>
                    {renderSortIcon('name')}
                  </button>
                </th>

                <th className="py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('target')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>الهدف (Target IP)</span>
                    {renderSortIcon('target')}
                  </button>
                </th>

                <th className="py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('maxLimit')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>السرعة القصوى (رفع/تنزيل)</span>
                    {renderSortIcon('maxLimit')}
                  </button>
                </th>

                <th className="py-3.5 px-4">السرعة المضمونة</th>

                <th className="py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('priority')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>الأولوية</span>
                    {renderSortIcon('priority')}
                  </button>
                </th>

                <th className="py-3.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('bytes')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>البيانات الممررة</span>
                    {renderSortIcon('bytes')}
                  </button>
                </th>

                <th className="py-3.5 px-3 text-center">الإجراءات</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {paginatedQueues.length > 0 ? (
                paginatedQueues.map((q) => {
                  const isItemDisabled = Boolean(q.disabled);
                  const isSelected = selectedIdSet.has(q.id);

                  return (
                    <tr
                      key={q.id || `queue-${q.name}`}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
                      } ${isItemDisabled ? 'opacity-60 bg-slate-950/40' : ''}`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(q.id)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleDisabled(q)}
                          disabled={togglingId === q.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                            !isItemDisabled
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
                          }`}
                          title={isItemDisabled ? 'اضغط لتفعيل القاعدة' : 'اضغط لتعطيل القاعدة'}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isItemDisabled ? 'معطلة' : 'نشطة'}</span>
                        </button>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-100 font-mono" dir="ltr">
                        {q.name || '-'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-blue-400 font-bold" dir="ltr">
                        {q.target || '-'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-emerald-400 font-bold">
                        {formatRateLimit(q.maxLimit)}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {formatRateLimit(q.limitAt)}
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 font-bold">
                          {q.priority || '8/8'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-slate-300" dir="ltr">
                        {(() => {
                          const parsed = parseQueueBytes(q);
                          return (
                            <div title={`Upload: ${formatBytes(parsed.rx)} | Download: ${formatBytes(parsed.tx)}`}>
                              <span className="font-bold text-slate-200">{formatBytes(parsed.total)}</span>
                              {parsed.total > 0 && (
                                <span className="block text-[10px] text-slate-500">
                                  ↑{formatBytes(parsed.rx)} / ↓{formatBytes(parsed.tx)}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(q)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-blue-600/30 text-slate-300 hover:text-blue-300 border border-slate-700 transition-all cursor-pointer"
                            title="تعديل القاعدة"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(q.id, q.name)}
                            disabled={deletingId === q.id}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition-all cursor-pointer disabled:opacity-40"
                            title="حذف القاعدة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Gauge className="w-8 h-8 text-slate-600 opacity-40" />
                      <span className="font-medium text-sm">{searchQuery ? 'لا توجد نتائج مطابقة لبحثك' : 'لا توجد قواعد سرعة (Queues) مضافة حالياً في المايكروتك'}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {sortedQueues.length > 0 && (
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
                <span>قاعدة</span>
              </div>

              <span>
                (إجمالي: <strong className="text-slate-200 font-mono">{sortedQueues.length}</strong>)
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

      {/* Add / Edit Queue Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4 animate-in fade-in" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Gauge className="w-4 h-4" />
                </span>
                <span>{editingQueue ? 'تعديل قاعدة السرعة (Simple Queue)' : 'إضافة قاعدة تحديد سرعة جديدة (Simple Queue)'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-bold mb-1 block">اسم القاعدة (Queue Name) *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="مثال: client_user1 أو vip_users"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold mb-1 block">الهدف (Target IP or Range) *</label>
                <input
                  type="text"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  required
                  placeholder="مثال: 192.168.88.50/32 أو شبكة كاملة 192.168.88.0/24"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                  dir="ltr"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  يمكنك إدخال IP جهاز فردي مع /32 أو عنوان شبكة فرعية كاملة مع /24 لتوزيع السرعة عليها.
                </span>
              </div>

              {/* Speed Presets Grid */}
              <div className="space-y-1.5">
                <label className="text-slate-300 font-bold block flex items-center justify-between">
                  <span>سرعات جاهزة سريعة (Speed Presets):</span>
                  <span className="text-[10px] text-blue-400 font-normal">اضغط للتطبيق التلقائي</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {SPEED_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-2 py-1.5 rounded-xl bg-slate-950 hover:bg-blue-600/20 text-slate-300 hover:text-blue-300 border border-slate-800 hover:border-blue-500/40 text-[10px] font-bold transition-all text-center cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-bold mb-1 block">السرعة القصوى (Max Limit) *</label>
                  <input
                    type="text"
                    value={formMaxLimit}
                    onChange={(e) => setFormMaxLimit(e.target.value)}
                    placeholder="2M/10M"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">رفع/تنزيل (Upload/Download)</span>
                </div>

                <div>
                  <label className="text-slate-300 font-bold mb-1 block">السرعة المضمونة (Limit At)</label>
                  <input
                    type="text"
                    value={formLimitAt}
                    onChange={(e) => setFormLimitAt(e.target.value)}
                    placeholder="512k/2M أو فارغ للإزالة"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                    dir="ltr"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">الحد الأدنى المضمون (اختياري)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-bold mb-1 block">الأولوية (Priority: 1-8)</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-blue-500 focus:outline-none"
                  >
                    <option value="1/1">1/1 (الأولوية القصوى - Realtime)</option>
                    <option value="2/2">2/2 (أولوية مرتفعة جداً)</option>
                    <option value="4/4">4/4 (أولوية متوسطة)</option>
                    <option value="8/8">8/8 (أولوية عادية - الافتراضي)</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-slate-300 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formDisabled}
                      onChange={(e) => setFormDisabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-700"
                    />
                    <span>تعطيل هذه القاعدة مؤقتاً</span>
                  </label>
                </div>
              </div>

              {/* Advanced WinBox Queue Fields Toggle */}
              <div className="border-t border-slate-800/80 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(prev => !prev)}
                  className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1.5 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{showAdvanced ? 'إخفاء إعدادات WinBox المتقدمة (Burst / Parent / Queue Type)' : 'إظهار إعدادات WinBox المتقدمة (Burst / Parent / Queue Type)'}</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Burst Limit</label>
                        <input
                          type="text"
                          value={formBurstLimit}
                          onChange={(e) => setFormBurstLimit(e.target.value)}
                          placeholder="4M/15M"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Burst Threshold</label>
                        <input
                          type="text"
                          value={formBurstThreshold}
                          onChange={(e) => setFormBurstThreshold(e.target.value)}
                          placeholder="1M/5M"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Burst Time</label>
                        <input
                          type="text"
                          value={formBurstTime}
                          onChange={(e) => setFormBurstTime(e.target.value)}
                          placeholder="10s/10s"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Parent Queue</label>
                        <input
                          type="text"
                          value={formParent}
                          onChange={(e) => setFormParent(e.target.value)}
                          placeholder="none"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Queue Type (Upload/Download)</label>
                        <input
                          type="text"
                          value={formQueue}
                          onChange={(e) => setFormQueue(e.target.value)}
                          placeholder="default-small/default-small"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-blue-500 focus:outline-none"
                          dir="ltr"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">ملاحظة (Comment)</label>
                      <input
                        type="text"
                        value={formComment}
                        onChange={(e) => setFormComment(e.target.value)}
                        placeholder="وصف اختياري للقاعدة..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>{editingQueue ? 'حفظ التعديلات' : 'إضافة القاعدة'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formatted Queues PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="queues"
        customTitle="تقرير قواعد تحديد السرعات (Simple Queues)"
        filteredItems={sortedQueues}
      />

      {/* Delete Single Queue Confirm Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="تأكيد حذف قاعدة السرعة"
        message={`هل أنت متأكد من رغبتك في حذف قاعدة تحديد السرعة (${deleteTarget?.name}) نهائياً من سيرفر المايكروتك؟`}
        confirmText="تأكيد الحذف من الراوتر"
        cancelText="إلغاء"
        type="danger"
        isLoading={!!deletingId}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Batch Delete Confirm Modal */}
      <ConfirmModal
        isOpen={batchDeleteConfirm}
        title="حذف القواعد المحددة"
        message={`هل أنت متأكد من رغبتك في حذف (${selectedIds.length}) قاعدة سرعة محددة نهائياً من المايكروتك؟`}
        confirmText="تأكيد حذف المحدد"
        cancelText="إلغاء"
        type="danger"
        onConfirm={handleConfirmBatchDelete}
        onClose={() => setBatchDeleteConfirm(false)}
      />
    </div>
  );
};
