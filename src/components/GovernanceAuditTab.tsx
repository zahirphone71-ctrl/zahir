import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Hash,
  Copy,
  Layers,
  Check
} from 'lucide-react';
import { AuditLogEvent, RevertJournalRecord } from '../types/governance';
import { secureFetch, safeParseJson } from '../lib/api';

export const GovernanceAuditTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEvent[]>([]);
  const [validChain, setValidChain] = useState<boolean>(true);
  const [brokenAtSequence, setBrokenAtSequence] = useState<number | undefined>();
  const [revertTimers, setRevertTimers] = useState<RevertJournalRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>('all');
  const [actionError, setActionError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const confirmAbortRef = useRef<AbortController | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isMountedRef.current) setLoading(true);
    try {
      const [logsRaw, timersRaw] = await Promise.all([
        secureFetch('/api/governance/audit-logs', { signal: controller.signal }),
        secureFetch('/api/governance/revert-timers', { signal: controller.signal })
      ]);

      const [logsParsed, timersParsed] = await Promise.all([
        logsRaw.ok ? safeParseJson(logsRaw) : Promise.resolve(null),
        timersRaw.ok ? safeParseJson(timersRaw) : Promise.resolve(null)
      ]);
      const logsRes = logsParsed || { success: false };
      const timersRes = timersParsed || { success: false };

      if (!isMountedRef.current) return;
      if (logsRes.success) {
        setLogs(logsRes.logs || []);
        setValidChain(logsRes.validChain ?? true);
        setBrokenAtSequence(logsRes.brokenAtSequence);
      }

      if (timersRes.success) {
        setRevertTimers(timersRes.pending || []);
      }
      setActionError(null);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && isMountedRef.current) {
        console.error('Failed to fetch governance data:', err);
      }
    } finally {
      inFlightRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchData();
    }, 15000);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
      abortControllerRef.current?.abort();
      confirmAbortRef.current?.abort();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [fetchData]);

  const handleConfirmRevert = async (changeId: string) => {
    confirmAbortRef.current?.abort();
    const controller = new AbortController();
    confirmAbortRef.current = controller;
    setConfirmingId(changeId);
    setActionError(null);
    try {
      const res = await secureFetch('/api/governance/revert-timers/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ changeId, actorId: 'admin_ui' })
      });
      const data = (await safeParseJson(res)) || { success: false };
      if (!isMountedRef.current || controller.signal.aborted) return;
      if (res.ok && data.success) {
        await fetchData();
      } else {
        setActionError(data.message || 'تعذر تأكيد التغيير الإداري');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && isMountedRef.current) {
        setActionError('حدث خطأ في الاتصال أثناء تأكيد التغيير');
      }
    } finally {
      if (isMountedRef.current) {
        setConfirmingId(null);
      }
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (!isMountedRef.current) return;
      setCopiedHash(text);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) setCopiedHash(null);
      }, 2000);
    } catch {
      // Clipboard fallback ignore
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterAction === 'all') return true;
    return log.action.toLowerCase().includes(filterAction.toLowerCase());
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Cryptographic Health Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-md">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            validChain ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
          }`}>
            {validChain ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">سلسلة التجزئة المشفرة (Hash Chain)</div>
            <div className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2 mt-0.5">
              <span>{validChain ? 'سليمة ومطابقة 100%' : `انحراف عند التسلسل #${brokenAtSequence}`}</span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">SHA-256</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">محمية من التعديل والحذف (Append-only)</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-md">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            revertTimers.length > 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
          }`}>
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">مؤقتات التراجع الآلي (Revert Timers)</div>
            <div className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2 mt-0.5">
              <span>{revertTimers.length} مؤقت نشط</span>
              {revertTimers.length > 0 && (
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">120 ثانية</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">حماية مسار الدخول والجدار الناري</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3.5 shadow-md">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">إجمالي الأحداث الموثقة (Audit Logs)</div>
            <div className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2 mt-0.5">
              <span>{logs.length} قيد تدقيق</span>
              <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">SEC-04</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">تنقيح تلقائي لكلمات المرور والأسرار</div>
          </div>
        </div>
      </div>

      {/* Active Revert Timers Warning Banner (if any) */}
      {revertTimers.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-4 text-amber-200 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-sm sm:text-base text-amber-300">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>تنبيه أمان: يوجد تغييرات بانتظار التأكيد الإداري قبل التراجع التلقائي (120 ثانية)</span>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="text-xs text-amber-400 hover:text-amber-200 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث</span>
            </button>
          </div>

          {actionError && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs rounded-xl px-3 py-2">
              {actionError}
            </div>
          )}

          <div className="divide-y divide-amber-500/20">
            {revertTimers.map((timer) => {
              const remainingSec = Math.max(0, Math.round((timer.deadlineAt - Date.now()) / 1000));
              return (
                <div key={timer.changeId} className="pt-2 pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                      <span>{timer.changeId}</span>
                      <span className="text-[10px] bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded">
                        المتبقي: {remainingSec} ثانية
                      </span>
                    </div>
                    <div className="text-[11px] text-amber-300/80 mt-0.5">
                      أوامر التراجع المعدة: {timer.revertCommands?.length || 0} أمر تلقائي
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleConfirmRevert(timer.changeId)}
                    disabled={confirmingId === timer.changeId}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start sm:self-auto shadow-md"
                  >
                    <Check className="w-4 h-4" />
                    <span>{confirmingId === timer.changeId ? 'جاري التأكيد...' : 'تأكيد التغيير الآن ومنع التراجع'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Audit Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
              <Hash className="w-4 h-4 text-blue-400" />
              <span>سجل التدقيق الرياضي غير القابل للتزوير (Cryptographic Audit Log)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              كل سجل مرتبط بالبصمة الرياضية للسجل السابق لمنع أي تلاعب تاريخي (RFC 8785)
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="all">جميع أنواع الإجراءات</option>
              <option value="revert">مؤقتات التراجع (Revert)</option>
              <option value="hotspot">الهوتسبوت (Hotspot)</option>
              <option value="profile">البروفايلات (Profile)</option>
              <option value="connect">الاتصال (Connect)</option>
            </select>

            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs sm:text-sm">
            لا توجد سجلات تدقيق مسجلة حالياً تطابق الفلتر.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-950/60 text-slate-400 font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">التوقيت (UTC)</th>
                  <th className="py-2.5 px-3">الفاعل (Actor)</th>
                  <th className="py-2.5 px-3">الإجراء (Action)</th>
                  <th className="py-2.5 px-3">الهدف (Resource)</th>
                  <th className="py-2.5 px-3">النتيجة</th>
                  <th className="py-2.5 px-3">بصمة السجل (SHA-256 Hash)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredLogs.map((log) => {
                  const dateStr = new Date(log.createdAt).toLocaleTimeString('ar-EG', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });

                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-400">
                        #{log.seq}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                        {dateStr}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-blue-300">
                        {log.actorId}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-white">
                        <span className="bg-slate-800/80 px-2 py-0.5 rounded text-[11px] font-mono border border-slate-700/60">
                          {log.action}
                        </span>
                        {log.reason && (
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">
                            {log.reason}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {log.resource}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            log.result === 'success'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : log.result === 'failure'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {log.result === 'success' && <CheckCircle2 className="w-3 h-3" />}
                          {log.result === 'failure' && <AlertTriangle className="w-3 h-3" />}
                          <span>{log.result === 'success' ? 'نجاح' : log.result === 'failure' ? 'فشل' : 'معلق'}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
                          <span className="truncate max-w-[120px] text-slate-300" title={log.hash}>
                            {log.hash.slice(0, 16)}...
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(log.hash)}
                            className="p-1 hover:text-white rounded cursor-pointer text-slate-500"
                            title="نسخ البصمة كاملة"
                          >
                            {copiedHash === log.hash ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
