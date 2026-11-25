import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  FileText,
  Search,
  RefreshCw,
  Copy,
  Terminal,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Download,
  Trash2,
  X,
  ShieldCheck,
  History
} from 'lucide-react';
import { PdfExportModal } from './PdfExportModal';
import { exportLogsToCsv } from '../lib/formatters';
import { GovernanceAuditTab } from './GovernanceAuditTab';

export const SystemLogsView: React.FC = () => {
  const { systemLogs, syncNow, backgroundSyncEngine, showToast } = useMikroTik();
  const [subTab, setSubTab] = useState<'router_logs' | 'audit_chain'>('router_logs');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [copied, setCopied] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [clearedLocally, setClearedLocally] = useState(false);
  const isMountedRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revokeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      if (revokeTimerRef.current) clearTimeout(revokeTimerRef.current);
    };
  }, []);

  // Auto-refresh interval using Background Synchronization Engine (CPU-safe 12s cadence, pauses when tab hidden)
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (backgroundSyncEngine?.syncNow) {
        backgroundSyncEngine.syncNow();
      } else {
        syncNow();
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [isAutoRefresh, backgroundSyncEngine, syncNow]);

  const activeLogs = clearedLocally ? [] : systemLogs;

  const safeSearch = (searchTerm || '').toLowerCase().trim();
  const safeTopic = (selectedTopic || 'all').toLowerCase();

  // Metrics by severity
  const severityCounts = useMemo(() => {
    const list = Array.isArray(activeLogs) ? activeLogs : [];
    return {
      all: list.length,
      info: list.filter(l => l?.severity === 'info' || !l?.severity).length,
      warning: list.filter(l => l?.severity === 'warning').length,
      critical: list.filter(l => l?.severity === 'critical').length
    };
  }, [activeLogs]);

  // Topic list with counts
  const topicCounts = useMemo(() => {
    const list = Array.isArray(activeLogs) ? activeLogs : [];
    const counts: Record<string, number> = { all: list.length };
    for (const log of list) {
      const top = String(log?.topics || 'system').toLowerCase();
      counts[top] = (counts[top] || 0) + 1;
    }
    return counts;
  }, [activeLogs]);

  const filteredLogs = useMemo(() => {
    if (!Array.isArray(activeLogs)) return [];
    return activeLogs.filter((log) => {
      if (!log) return false;
      const matchesSearch = !safeSearch || (
        String(log.message || '').toLowerCase().includes(safeSearch) ||
        String(log.topics || '').toLowerCase().includes(safeSearch) ||
        String(log.time || '').includes(safeSearch)
      );

      const matchesTopic = safeTopic === 'all' || String(log.topics || '').toLowerCase().includes(safeTopic);
      const matchesSeverity = selectedSeverity === 'all' || log.severity === selectedSeverity;

      return matchesSearch && matchesTopic && matchesSeverity;
    });
  }, [activeLogs, safeSearch, safeTopic, selectedSeverity]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedLogs = useMemo(() => {
    const start = (validPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, validPage, pageSize]);

  const handleCopyLogs = async () => {
    if (filteredLogs.length === 0) {
      showToast('لا توجد سجلات مطابقة للنسخ', 'warning');
      return;
    }
    const text = filteredLogs.map((l) => `[${l.time}] [${l.topics}] (${l.severity}): ${l.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      if (!isMountedRef.current) return;
      setCopied(true);
      showToast('تم نسخ سجل الأحداث إلى الحافظة بنجاح', 'success');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setCopied(false);
      }, 2000);
    } catch {
      showToast('تعذر النسخ إلى الحافظة — تحقق من صلاحيات المتصفح', 'error');
    }
  };

  const handleExportCsv = () => {
    exportLogsToCsv(filteredLogs);
    showToast(`تم تصدير ${filteredLogs.length} حدث كملف CSV بنجاح`, 'success');
  };

  const handleDownloadTxt = () => {
    const text = filteredLogs.map((l) => `[${l.time}] [${l.topics}] (${l.severity}): ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mikrotik_logs_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revokeTimerRef.current) clearTimeout(revokeTimerRef.current);
    revokeTimerRef.current = setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('تم تحميل ملف السجل كملف نصي بنجاح', 'success');
  };

  const handleClearLocal = () => {
    setClearedLocally(true);
    showToast('تم مسح السجل من الشاشة المحلية مؤقتاً', 'info');
  };

  const handleRestoreLogs = () => {
    setClearedLocally(false);
    syncNow();
    showToast('تمت استعادة السجل وتحديثه من الراوتر', 'success');
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab Navigation (RouterOS Logs vs Cryptographic Audit Hash Chain) */}
      <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl w-fit">
        <button
          type="button"
          onClick={() => setSubTab('router_logs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            subTab === 'router_logs'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <History className="w-4 h-4" />
          <span>سجلات أحداث الراوتر (RouterOS Logs)</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('audit_chain')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            subTab === 'audit_chain'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>سجل التدقيق المشفر الحاكم ومؤقتات التراجع (ZCtrl Governance)</span>
        </button>
      </div>

      {subTab === 'audit_chain' ? (
        <GovernanceAuditTab />
      ) : (
        <>
          {/* Header & Controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-700 to-slate-800 flex items-center justify-center text-white shadow-md border border-slate-700">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>سجل الأحداث والأنشطة (System Logs)</span>
                <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono font-bold">
                  {filteredLogs.length} حدث
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                متابعة حية لعمليات تسجيل دخول المشتركين، انتهاء صلاحية الكروت، رسائل الجدار الناري، وأخطاء النظام
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Live Stream Auto Refresh Toggle */}
            <button
              type="button"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className={`text-xs font-semibold px-3 py-2 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                isAutoRefresh
                  ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="تحديث السجل تلقائياً كل 4 ثوانٍ"
            >
              <span className={`w-2 h-2 rounded-full ${isAutoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>{isAutoRefresh ? 'بث حي متصل' : 'تفعيل البث الحي'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLogs}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              title="نسخ السجلات للحافظة"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>{copied ? 'تم النسخ ✓' : 'نسخ'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير كملف CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTxt}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تنزيل كملف نصي .txt"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>ملف TXT</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPdfModalOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
              title="تصدير سجل الأحداث كملف PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-rose-400" />
              <span>PDF</span>
            </button>

            {clearedLocally ? (
              <button
                type="button"
                onClick={handleRestoreLogs}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-all cursor-pointer"
              >
                استعادة السجل
              </button>
            ) : (
              <button
                type="button"
                onClick={handleClearLocal}
                className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs font-semibold p-2 rounded-xl transition-all cursor-pointer"
                title="تفريغ الشاشة مؤقتاً"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => (backgroundSyncEngine?.syncNow ? backgroundSyncEngine.syncNow() : syncNow())}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute right-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="بحث في رسائل السجل، الكلمات المفتاحية، أو الوقت..."
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

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Topic Filter */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-500 px-2">التصنيف:</span>
              {['all', 'hotspot', 'ppp', 'system', 'firewall', 'dhcp', 'wireless'].map((t) => {
                const count = t === 'all'
                  ? topicCounts.all || 0
                  : Object.entries(topicCounts).reduce((acc, [k, v]) => (k !== 'all' && k.includes(t) ? acc + v : acc), 0);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setSelectedTopic(t);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-xs flex items-center gap-1 ${
                      selectedTopic === t ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{t === 'all' ? 'الكل' : t}</span>
                    <span className="text-[10px] font-mono opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Severity Filter */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-500 px-2">الخطورة:</span>
              {[
                { id: 'all', label: 'الكل', count: severityCounts.all },
                { id: 'info', label: 'عادي', count: severityCounts.info },
                { id: 'warning', label: 'تنبيه', count: severityCounts.warning },
                { id: 'critical', label: 'حرج', count: severityCounts.critical }
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedSeverity(s.id);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer text-xs flex items-center gap-1 ${
                    selectedSeverity === s.id
                      ? s.id === 'critical'
                        ? 'bg-rose-600 text-white font-bold'
                        : s.id === 'warning'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'bg-indigo-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{s.label}</span>
                  <span className="text-[10px] font-mono opacity-80">({s.count})</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Log Feed Display */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-xl font-mono text-xs">
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>RouterOS Live Event Feed</span>
            {isAutoRefresh && (
              <span className="text-[10px] text-emerald-400 font-sans font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                تحديث حي مستمر
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-sans">مرتب حسب الأحدث أولاً</span>
        </div>

        <div className="divide-y divide-slate-900 max-h-[580px] overflow-y-auto custom-scrollbar">
          {paginatedLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-sans">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
              <p className="font-medium text-sm">لا توجد أحداث مسجلة تطابق معايير التصفية الحالية</p>
              <p className="text-xs text-slate-500 mt-1">قم بتعديل البحث أو اضغط تحديث لجلب أحدث السجلات</p>
            </div>
          ) : (
            paginatedLogs.map((log, idx) => {
              const isWarning = log.severity === 'warning';
              const isCritical = log.severity === 'critical';

              return (
                <div
                  key={log.id || `${log.time}-${idx}`}
                  className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-900/60 transition-colors"
                >
                  <span className="text-slate-500 font-mono shrink-0 select-none text-[11px] pt-0.5">
                    {log.time}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 border ${
                      isCritical
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : isWarning
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    }`}
                  >
                    {log.topics}
                  </span>

                  <span
                    className={`break-all leading-relaxed flex-1 ${
                      isCritical
                        ? 'text-rose-200 font-semibold'
                        : isWarning
                        ? 'text-amber-200'
                        : 'text-slate-300'
                    }`}
                    dir="ltr"
                  >
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {filteredLogs.length > 0 && (
          <div className="bg-slate-900/90 px-4 py-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-400 text-xs">
            <div className="flex items-center gap-2">
              <span>عرض</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span>من أصل {filteredLogs.length} حدث</span>
            </div>

            <div className="flex items-center gap-2">
              <span>
                صفحة <strong className="text-slate-200 font-mono">{validPage}</strong> من <strong className="text-slate-200 font-mono">{totalPages}</strong>
              </span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={validPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  title="الصفحة السابقة"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={validPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  title="الصفحة التالية"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Formatted System Logs PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        activeTab="logs"
        filteredItems={filteredLogs}
      />
      </>
      )}
    </div>
  );
};
