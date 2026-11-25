import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  Activity,
  Search,
  UserX,
  RefreshCw,
  Wifi,
  FileDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
  FileSpreadsheet,
  Zap,
  ShieldCheck,
  Pause,
  Play,
  Radio,
  Network,
  Server
} from 'lucide-react';
import { formatBytes, exportActiveSessionsToCsv } from '../lib/formatters';
import { PdfExportModal } from './PdfExportModal';
import { ConfirmModal } from './ConfirmModal';
import { safeStorage } from '../utils/safeStorage';
import { RouterGuard } from '../lib/routerGuard';
import { processInChunks } from '../lib/scheduler';

export type SessionServiceType = 'all' | 'hotspot' | 'pppoe' | 'userman';
type SortField = 'user' | 'address' | 'macAddress' | 'uptime' | 'bytesIn' | 'bytesOut' | 'service';
type SortOrder = 'asc' | 'desc';

function parseMikrotikDurationSeconds(raw?: string): number {
  if (!raw) return 0;
  let total = 0;
  const weeks = raw.match(/(\d+)w/);
  const days = raw.match(/(\d+)d/);
  const hours = raw.match(/(\d+)h/);
  const mins = raw.match(/(\d+)m(?!s)/);
  const secs = raw.match(/(\d+)s/);
  if (weeks) total += Number(weeks[1]) * 604800;
  if (days) total += Number(days[1]) * 86400;
  if (hours) total += Number(hours[1]) * 3600;
  if (mins) total += Number(mins[1]) * 60;
  if (secs) total += Number(secs[1]);
  // Fallback for HH:MM:SS format
  if (total === 0 && raw.includes(':')) {
    const parts = raw.split(':').map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      total = parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  return total;
}

function compareIpOrString(a: string, b: string): number {
  const ipv4Re = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ma = ipv4Re.exec(a || '');
  const mb = ipv4Re.exec(b || '');
  if (ma && mb) {
    for (let i = 1; i <= 4; i++) {
      const diff = Number(ma[i]) - Number(mb[i]);
      if (diff !== 0) return diff;
    }
    return 0;
  }
  return (a || '').localeCompare(b || '');
}

export interface UnifiedActiveSession {
  id: string;
  user: string;
  address: string;
  macAddress: string;
  service: 'hotspot' | 'pppoe' | 'userman';
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  rxRateBps?: number;
  txRateBps?: number;
  loginBy?: string;
  idleTime?: string;
  hostName?: string;
  raw?: any;
}

export const ActiveSessionsView: React.FC = () => {
  const {
    activeUsers,
    pppActive,
    usermanActive,
    kickUser,
    disconnectPPPActive,
    disconnectUsermanActive,
    syncNow,
    showToast,
    isRealtimeWsConnected,
    realtimeSyncMode,
    setRealtimeSyncMode,
    realtimeFrequency,
    setRealtimeFrequency,
    activeRealtimeFrequencySec,
    isResourceSaving,
    triggerRealtimeSync
  } = useMikroTik();

  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<SessionServiceType>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('uptime');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Multi-Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(30);

  // Confirmation Modal
  const [confirmKickModal, setConfirmKickModal] = useState<{
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

  const isMountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // Ensure fresh live data on view entry without firing duplicate WS + HTTP requests
  useEffect(() => {
    if (isRealtimeWsConnected && typeof triggerRealtimeSync === 'function') {
      triggerRealtimeSync(true);
    } else {
      syncNow(true).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Combine Hotspot, PPPoE, and User Manager into a unified active session array
  const allUnifiedSessions = useMemo<UnifiedActiveSession[]>(() => {
    const list: UnifiedActiveSession[] = [];

    // 1. Hotspot Active Sessions
    if (Array.isArray(activeUsers)) {
      activeUsers.forEach((act) => {
        if (!act) return;
        const id = act.id || (act as any)['.id'] || `hs-${act.user}-${act.address}`;
        list.push({
          id,
          user: act.user || (act as any).name || 'مشترك هوتسبوت',
          address: act.address || '',
          macAddress: act.macAddress || '',
          service: 'hotspot',
          uptime: act.uptime || '0s',
          bytesIn: act.bytesIn || 0,
          bytesOut: act.bytesOut || 0,
          rxRateBps: act.rxRateBps,
          txRateBps: act.txRateBps,
          loginBy: act.loginBy || 'hotspot',
          idleTime: act.idleTime || '0s',
          raw: act
        });
      });
    }

    // 2. PPPoE Active Sessions
    if (Array.isArray(pppActive)) {
      pppActive.forEach((p) => {
        if (!p) return;
        const id = p.id || (p as any)['.id'] || `ppp-${p.name}-${p.address}`;
        list.push({
          id,
          user: p.name || 'مشترك PPPoE',
          address: p.address || '',
          macAddress: p.callerId || '',
          service: 'pppoe',
          uptime: p.uptime || '0s',
          bytesIn: p.bytesIn || 0,
          bytesOut: p.bytesOut || 0,
          loginBy: p.service || 'pppoe',
          idleTime: p.idleTime || '0s',
          raw: p
        });
      });
    }

    // 3. User Manager Active Sessions (O(1) Set deduplication across both hotspot & pppoe)
    if (Array.isArray(usermanActive)) {
      const seenActiveUsers = new Set(list.map((item) => item.user.toLowerCase()).filter(Boolean));
      usermanActive.forEach((um) => {
        if (!um) return;
        const uname = (um.user || '').toLowerCase();
        if (uname && seenActiveUsers.has(uname)) return;
        const id = um.id || (um as any)['.id'] || `um-${um.user}-${um.assignedIp || um.nasIp}`;
        list.push({
          id,
          user: um.user || 'مشترك يوزر مانجر',
          address: um.assignedIp || um.nasIp || '',
          macAddress: um.callerId || (um as any).macAddress || '',
          service: 'userman',
          uptime: um.uptime || '0s',
          bytesIn: um.bytesIn || 0,
          bytesOut: um.bytesOut || 0,
          loginBy: 'user-manager',
          raw: um
        });
      });
    }

    return list;
  }, [activeUsers, pppActive, usermanActive]);

  // O(1) lookup Set for multi-selection + prune stale IDs automatically
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  useEffect(() => {
    if (selectedIds.length === 0) return;
    const validIds = new Set(allUnifiedSessions.map((s) => s.id));
    setSelectedIds((prev) => {
      const pruned = prev.filter((id) => validIds.has(id));
      return pruned.length === prev.length ? prev : pruned;
    });
  }, [allUnifiedSessions, selectedIds.length]);

  // Overall counts for tabs
  const counts = useMemo(() => {
    let hotspot = 0;
    let pppoe = 0;
    let userman = 0;
    allUnifiedSessions.forEach((s) => {
      if (s.service === 'hotspot') hotspot++;
      else if (s.service === 'pppoe') pppoe++;
      else if (s.service === 'userman') userman++;
    });
    return {
      all: allUnifiedSessions.length,
      hotspot,
      pppoe,
      userman
    };
  }, [allUnifiedSessions]);

  // Live Metrics for currently filtered list
  const safeQ = (search || '').toLowerCase().trim();

  const filtered = useMemo(() => {
    return allUnifiedSessions.filter((s) => {
      if (serviceFilter !== 'all' && s.service !== serviceFilter) {
        return false;
      }
      if (!safeQ) return true;
      return (
        s.user.toLowerCase().includes(safeQ) ||
        s.address.toLowerCase().includes(safeQ) ||
        s.macAddress.toLowerCase().includes(safeQ) ||
        (s.loginBy || '').toLowerCase().includes(safeQ) ||
        s.service.toLowerCase().includes(safeQ)
      );
    });
  }, [allUnifiedSessions, serviceFilter, safeQ]);

  // Total summary metrics
  const metrics = useMemo(() => {
    const totalRx = filtered.reduce((acc, u) => acc + (u.bytesIn || 0), 0);
    const totalTx = filtered.reduce((acc, u) => acc + (u.bytesOut || 0), 0);
    return {
      count: filtered.length,
      totalRx,
      totalTx
    };
  }, [filtered]);

  // Sorting
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'user') {
        comparison = a.user.localeCompare(b.user);
      } else if (sortField === 'address') {
        comparison = compareIpOrString(a.address, b.address);
      } else if (sortField === 'macAddress') {
        comparison = a.macAddress.localeCompare(b.macAddress);
      } else if (sortField === 'service') {
        comparison = a.service.localeCompare(b.service);
      } else if (sortField === 'bytesIn') {
        comparison = (a.bytesIn || 0) - (b.bytesIn || 0);
      } else if (sortField === 'bytesOut') {
        comparison = (a.bytesOut || 0) - (b.bytesOut || 0);
      } else if (sortField === 'uptime') {
        comparison = parseMikrotikDurationSeconds(a.uptime) - parseMikrotikDurationSeconds(b.uptime);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filtered, sortField, sortOrder]);

  // Pagination
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginated = useMemo(() => {
    if (pageSize === 0) return sorted;
    const start = (validPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, validPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const allPaginatedSelected = useMemo(
    () => paginated.length > 0 && paginated.every((p) => selectedIdSet.has(p.id)),
    [paginated, selectedIdSet]
  );

  const handleSelectAll = () => {
    const pageIds = paginated.map((p) => p.id);
    if (allPaginatedSelected) {
      const pageSet = new Set(pageIds);
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (selectedIdSet.has(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await syncNow(true);
      triggerRealtimeSync(true);
      if (isMountedRef.current) {
        showToast('تم تحديث جدول المتصلين الفعلي بالكامل من الراوتر', 'info');
      }
    } catch {
      if (isMountedRef.current) {
        showToast('فشل تحديث البيانات من الراوتر', 'error');
      }
    } finally {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setIsRefreshing(false);
      }, 450);
    }
  };

  // Disconnect single session cleanly via MikroTikContext methods with skipSync support
  const disconnectSession = async (
    session: UnifiedActiveSession,
    skipSync = true
  ): Promise<{ success: boolean; message: string }> => {
    if (session.service === 'hotspot') {
      return await kickUser(session.id, session.user, skipSync);
    }
    if (session.service === 'pppoe') {
      return await disconnectPPPActive(session.id, session.user, skipSync);
    }
    return await disconnectUsermanActive(session.id, session.user, skipSync, session.raw?.nasIp);
  };

  const handleKickSingle = (session: UnifiedActiveSession) => {
    const serviceLabel = session.service === 'hotspot' ? 'الهوتسبوت' : session.service === 'pppoe' ? 'البرودباند PPPoE' : 'اليوزر مانجر';
    setConfirmKickModal({
      isOpen: true,
      title: 'فصل وطرد جلسة المستخدم',
      message: `هل أنت متأكد من رغبتك في قطع الاتصال وطرد المستخدم (${session.user}) من شبكة ${serviceLabel}؟`,
      onConfirm: async () => {
        const res = await disconnectSession(session, true);
        await syncNow(true);
        if (!isMountedRef.current) return;
        setConfirmKickModal((prev) => ({ ...prev, isOpen: false }));
        if (res.success) {
          showToast(res.message || `تم فصل جلسة (${session.user}) بنجاح`, 'success');
        } else {
          showToast(res.message || `تعذر فصل جلسة (${session.user})`, 'error');
        }
      }
    });
  };

  const handleKickSelected = async () => {
    if (selectedIds.length === 0) return;
    const token = safeStorage.getItem('zcontrol_active_token') || '';
    const guard = await RouterGuard.canProceed(token, true);
    if (!guard.ok) {
      showToast(guard.reason || 'الراوتر تحت ضغط مرتفع — يتعذر تنفيذ الإجراء الآن', 'error');
      return;
    }
    setConfirmKickModal({
      isOpen: true,
      title: 'طرد الجلسات المحددة',
      message: `هل أنت متأكد من رغبتك في فصل (${selectedIds.length}) مستخدم محدد الآن؟`,
      onConfirm: async () => {
        const toKick = allUnifiedSessions.filter((u) => selectedIdSet.has(u.id));
        const results = await processInChunks(toKick, (s) => disconnectSession(s, true), { budgetMs: 12 });
        const okCount = results.filter((r) => r.success).length;
        const failCount = results.length - okCount;
        await syncNow(true);
        if (!isMountedRef.current) return;
        setSelectedIds([]);
        setConfirmKickModal((prev) => ({ ...prev, isOpen: false }));
        if (failCount === 0) {
          showToast(`تم فصل (${okCount}) جلسة بنجاح`, 'success');
        } else if (okCount > 0) {
          showToast(`تم فصل ${okCount} جلسة وفشل فصل ${failCount} جلسة`, 'warning');
        } else {
          showToast(`فشل فصل الجلسات المحددة (${failCount})`, 'error');
        }
      }
    });
  };

  const handleKickAll = async () => {
    if (filtered.length === 0) return;
    const token = safeStorage.getItem('zcontrol_active_token') || '';
    const guard = await RouterGuard.canProceed(token, true);
    if (!guard.ok) {
      showToast(guard.reason || 'الراوتر تحت ضغط مرتفع — يتعذر تنفيذ الإجراء الآن', 'error');
      return;
    }
    setConfirmKickModal({
      isOpen: true,
      title: 'فصل وطرد جميع الجلسات النشطة',
      message: `تحذير: سيتم فصل جميع المستخدمين المعروضين حالياً (${filtered.length} جلسة) وإجبارهم على إعادة تسجيل الدخول! هل تريد المتابعة؟`,
      onConfirm: async () => {
        const snapshot = [...filtered];
        const results = await processInChunks(snapshot, (s) => disconnectSession(s, true), { budgetMs: 12 });
        const okCount = results.filter((r) => r.success).length;
        const failCount = results.length - okCount;
        await syncNow(true);
        if (!isMountedRef.current) return;
        setSelectedIds([]);
        setConfirmKickModal((prev) => ({ ...prev, isOpen: false }));
        if (failCount === 0) {
          showToast(`تم طرد جميع الجلسات (${okCount}) بنجاح`, 'success');
        } else if (okCount > 0) {
          showToast(`تم طرد ${okCount} جلسة وتعذر فصل ${failCount} جلسة`, 'warning');
        } else {
          showToast(`تعذر فصل الجلسات (${failCount})`, 'error');
        }
      }
    });
  };

  const handleCopyText = async (text: string, id: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (!isMountedRef.current) return;
      setCopiedId(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setCopiedId(null);
      }, 1800);
      showToast(`تم نسخ (${text}) إلى الحافظة`, 'info');
    } catch {
      showToast('تعذر النسخ إلى الحافظة — تحقق من صلاحيات المتصفح', 'error');
    }
  };

  const handleCopyIps = async () => {
    const validIps = (selectedIds.length > 0
      ? allUnifiedSessions.filter((u) => selectedIdSet.has(u.id)).map((u) => u.address)
      : sorted.map((u) => u.address)
    ).filter(Boolean);
    if (validIps.length === 0) {
      showToast('لا توجد عناوين IP صالحة للنسخ', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(validIps.join('\n'));
      showToast(`تم نسخ ${validIps.length} عنوان IP إلى الحافظة`, 'success');
    } catch {
      showToast('تعذر النسخ إلى الحافظة', 'error');
    }
  };

  const handleCopyMacs = async () => {
    const validMacs = (selectedIds.length > 0
      ? allUnifiedSessions.filter((u) => selectedIdSet.has(u.id)).map((u) => u.macAddress)
      : sorted.map((u) => u.macAddress)
    ).filter(Boolean);
    if (validMacs.length === 0) {
      showToast('لا توجد عناوين MAC صالحة للنسخ', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(validMacs.join('\n'));
      showToast(`تم نسخ ${validMacs.length} عنوان MAC إلى الحافظة`, 'success');
    } catch {
      showToast('تعذر النسخ إلى الحافظة', 'error');
    }
  };

  const handleExportCsv = () => {
    const dataToExport = selectedIds.length > 0
      ? allUnifiedSessions.filter((u) => selectedIdSet.has(u.id))
      : sorted;
    exportActiveSessionsToCsv(dataToExport);
    showToast(`تم تصدير ${dataToExport.length} جلسة كملف CSV بنجاح`, 'success');
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

  const getServiceBadge = (service: 'hotspot' | 'pppoe' | 'userman') => {
    switch (service) {
      case 'hotspot':
        return (
          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px] font-bold flex items-center gap-1 w-fit">
            <Wifi className="w-3 h-3 text-amber-400" />
            <span>هوتسبوت</span>
          </span>
        );
      case 'pppoe':
        return (
          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px] font-bold flex items-center gap-1 w-fit">
            <Radio className="w-3 h-3 text-purple-400" />
            <span>PPPoE</span>
          </span>
        );
      case 'userman':
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1 w-fit">
            <Server className="w-3 h-3 text-emerald-400" />
            <span>يوزر مانجر</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>جدول المتصلين الآن (الجلسات النشطة الحقيقية)</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-bold">
                  {counts.all} متصل
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                كشف مباشر وفوري لجميع المتصلين بالمايكروتك عبر الهوتسبوت، والبرودباند PPPoE، واليوزر مانجر بدون إخفاء
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير بيانات الجلسات إلى ملف إكسل CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>تصدير CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white text-xs font-semibold px-3 py-2 rounded-xl border border-rose-500/30 flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير تقرير الجلسات النشطة كملف PDF"
            >
              <FileDown className="w-4 h-4 text-rose-400" />
              <span>تصدير PDF</span>
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>تحديث فوري</span>
            </button>
          </div>
        </div>

        {/* Real-Time Auto-Synchronization & Variable-Frequency Control Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 pt-3.5 border-t border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              {realtimeSyncMode === 'paused' ? (
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              ) : isRealtimeWsConnected ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </>
              ) : (
                <>
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                </>
              )}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              {realtimeSyncMode === 'paused'
                ? 'المزامنة الحية متوقفة'
                : isRealtimeWsConnected
                ? 'مزامنة الجلسات الحية (WebSockets)'
                : 'استطلاع ذكي متكيف للجلسات'}
            </span>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800" dir="ltr">
              {activeRealtimeFrequencySec}s
            </span>
            {isResourceSaving && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>توفير الموارد نشط</span>
              </span>
            )}
          </div>

          {/* Variable Frequency Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency('auto');
              }}
              className={`px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                realtimeFrequency === 'auto' && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تحديث متكيف تلقائي (2 ثوانٍ للجلسات النشطة)"
            >
              <Zap className="w-3 h-3 inline-block ml-1 text-amber-400" />
              <span>تلقائي ذكي</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency(1);
              }}
              className={`px-2 py-1 rounded-lg transition-all font-mono font-medium cursor-pointer ${
                realtimeFrequency === 1 && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تحديث كل 1 ثانية"
            >
              1s
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency(2);
              }}
              className={`px-2 py-1 rounded-lg transition-all font-mono font-medium cursor-pointer ${
                realtimeFrequency === 2 && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تحديث كل 2 ثانية"
            >
              2s
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode('hybrid');
                setRealtimeFrequency(5);
              }}
              className={`px-2 py-1 rounded-lg transition-all font-mono font-medium cursor-pointer ${
                realtimeFrequency === 5 && realtimeSyncMode !== 'paused'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="تحديث كل 5 ثوانٍ"
            >
              5s
            </button>

            <button
              type="button"
              onClick={() => {
                setRealtimeSyncMode(realtimeSyncMode === 'paused' ? 'hybrid' : 'paused');
              }}
              className={`px-2 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                realtimeSyncMode === 'paused'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
              title={realtimeSyncMode === 'paused' ? 'استئناف المزامنة' : 'إيقاف مؤقت'}
            >
              {realtimeSyncMode === 'paused' ? (
                <span className="flex items-center gap-1">
                  <Play className="w-3 h-3 fill-current" />
                  <span>استئناف</span>
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Pause className="w-3 h-3" />
                  <span>إيقاف</span>
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Live Metrics Grid Across Services */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">إجمالي المتصلين</span>
              <span className="text-base font-bold text-emerald-400 font-mono">{counts.all}</span>
            </div>
            <Activity className="w-5 h-5 text-emerald-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">متصلي الهوتسبوت</span>
              <span className="text-base font-bold text-amber-400 font-mono">{counts.hotspot}</span>
            </div>
            <Wifi className="w-5 h-5 text-amber-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">متصلي PPPoE</span>
              <span className="text-base font-bold text-purple-400 font-mono">{counts.pppoe}</span>
            </div>
            <Radio className="w-5 h-5 text-purple-500/40" />
          </div>

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">متصلي يوزر مانجر</span>
              <span className="text-base font-bold text-cyan-400 font-mono">{counts.userman}</span>
            </div>
            <Server className="w-5 h-5 text-cyan-500/40" />
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">إجمالي الاستهلاك</span>
              <span className="text-xs font-bold text-slate-200 font-mono block">
                Rx: {formatBytes(metrics.totalRx)}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Tx: {formatBytes(metrics.totalTx)}
              </span>
            </div>
            <Network className="w-5 h-5 text-blue-500/40" />
          </div>
        </div>

        {/* Service Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={() => { setServiceFilter('all'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              serviceFilter === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>جميع المتصلين</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/10 text-[10px] font-mono">
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setServiceFilter('hotspot'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              serviceFilter === 'hotspot'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-amber-400" />
            <span>هوتسبوت Hotspot</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/10 text-[10px] font-mono">
              {counts.hotspot}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setServiceFilter('pppoe'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              serviceFilter === 'pppoe'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-purple-400" />
            <span>برودباند PPPoE</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/10 text-[10px] font-mono">
              {counts.pppoe}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setServiceFilter('userman'); setCurrentPage(1); }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
              serviceFilter === 'userman'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Server className="w-3.5 h-3.5 text-cyan-400" />
            <span>يوزر مانجر UserManager</span>
            <span className="px-1.5 py-0.2 rounded-md bg-white/10 text-[10px] font-mono">
              {counts.userman}
            </span>
          </button>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="بحث باسم المستخدم، IP، MAC..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          {selectedIds.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleCopyIps}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="نسخ عناوين IP المحددة"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الـ IP ({selectedIds.length})</span>
              </button>

              <button
                type="button"
                onClick={handleCopyMacs}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="نسخ عناوين MAC المحددة"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الـ MAC ({selectedIds.length})</span>
              </button>

              <button
                type="button"
                onClick={handleKickSelected}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shadow-rose-600/30"
              >
                <UserX className="w-3.5 h-3.5" />
                <span>فصل المحدد ({selectedIds.length})</span>
              </button>
            </>
          )}

          {filtered.length > 0 && selectedIds.length === 0 && (
            <button
              type="button"
              onClick={handleKickAll}
              className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <UserX className="w-3.5 h-3.5 text-rose-400" />
              <span>فصل وطرد الكل ({filtered.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Sessions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 font-semibold select-none">
              <tr>
                <th className="py-3 px-3 text-center w-10">
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
                    onClick={() => handleSort('user')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>اسم المستخدم (Subscriber)</span>
                    {renderSortIcon('user')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('service')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>نوع الخدمة</span>
                    {renderSortIcon('service')}
                  </button>
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
                    <span>عنوان MAC</span>
                    {renderSortIcon('macAddress')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('uptime')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>مدة الاتصال (Uptime)</span>
                    {renderSortIcon('uptime')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('bytesIn')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>التحميل (Rx)</span>
                    {renderSortIcon('bytesIn')}
                  </button>
                </th>

                <th className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('bytesOut')}
                    className="flex items-center gap-1.5 text-slate-300 hover:text-white cursor-pointer group"
                  >
                    <span>الرفع (Tx)</span>
                    {renderSortIcon('bytesOut')}
                  </button>
                </th>

                <th className="py-3 px-3 text-center">إجراء</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-500">
                    <Activity className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-500" />
                    <p className="font-bold text-sm text-slate-400">لا توجد جلسات نشطة مطابقة حالياً</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {counts.all === 0
                        ? 'لا يوجد أي مستخدم متصل بالراوتر حالياً في الهوتسبوت أو PPPoE أو اليوزر مانجر'
                        : 'جرب تغيير فلاتر الخدمة أو مسح شريط البحث لرؤية باقي المتصلين'}
                    </p>
                  </td>
                </tr>
              ) : (
                paginated.map((act) => {
                  const isSelected = selectedIdSet.has(act.id);

                  return (
                    <tr
                      key={act.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-600/10' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(act.id)}
                          className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* User */}
                      <td className="py-3.5 px-4 font-bold text-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                          <span className="font-mono text-xs sm:text-sm text-slate-100" dir="ltr">
                            {act.user}
                          </span>
                        </div>
                      </td>

                      {/* Service Type */}
                      <td className="py-3.5 px-4">
                        {getServiceBadge(act.service)}
                      </td>

                      {/* IP */}
                      <td className="py-3.5 px-4 font-mono text-blue-400 font-medium" dir="ltr">
                        {act.address ? (
                          <button
                            type="button"
                            onClick={() => handleCopyText(act.address, `${act.id}-ip`)}
                            className="hover:underline flex items-center gap-1 text-blue-400"
                            title="اضغط للنسخ"
                          >
                            <span>{act.address}</span>
                            {copiedId === `${act.id}-ip` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : null}
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* MAC */}
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]" dir="ltr">
                        {act.macAddress ? (
                          <button
                            type="button"
                            onClick={() => handleCopyText(act.macAddress, `${act.id}-mac`)}
                            className="hover:text-slate-200 flex items-center gap-1 font-mono"
                            title="اضغط للنسخ"
                          >
                            <span>{act.macAddress}</span>
                            {copiedId === `${act.id}-mac` ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : null}
                          </button>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Uptime */}
                      <td className="py-3.5 px-4 font-mono text-emerald-400 font-medium" dir="ltr">
                        {act.uptime || '0s'}
                      </td>

                      {/* Rx */}
                      <td className="py-3.5 px-4 font-mono text-slate-300" dir="ltr">
                        {formatBytes(act.bytesIn)}
                      </td>

                      {/* Tx */}
                      <td className="py-3.5 px-4 font-mono text-slate-300" dir="ltr">
                        {formatBytes(act.bytesOut)}
                      </td>

                      {/* Single Kick Action */}
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleKickSingle(act)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px] font-bold"
                          title={`فصل وطرد جلسة ${act.user}`}
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span className="hidden xl:inline">طرد</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Rows Per Page Bar */}
        {sorted.length > 0 && (
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
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-slate-200 font-medium focus:outline-none focus:border-blue-500"
                >
                  <option value={15}>15</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={0}>الكل</option>
                </select>
                <span>جلسة</span>
              </div>

              <span>
                إجمالي المعروض: <strong className="text-white font-mono">{filtered.length}</strong> جلسة متصلة
              </span>
            </div>

            {pageSize > 0 && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={validPage <= 1}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <span className="font-mono text-xs">
                  صفحة <strong className="text-white">{validPage}</strong> من <strong className="text-white">{totalPages}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={validPage >= totalPages}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 rounded-lg border border-slate-800 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* PDF Export Modal */}
      {isPdfModalOpen && (
        <PdfExportModal
          isOpen={isPdfModalOpen}
          onClose={() => setIsPdfModalOpen(false)}
          activeTab="active_sessions"
        />
      )}

      {/* Action Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmKickModal.isOpen}
        title={confirmKickModal.title}
        message={confirmKickModal.message}
        confirmText="تأكيد الفصل والطرد"
        cancelText="إلغاء"
        type="danger"
        onConfirm={confirmKickModal.onConfirm}
        onClose={() => setConfirmKickModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
