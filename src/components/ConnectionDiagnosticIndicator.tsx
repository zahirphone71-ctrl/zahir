import React, { useState, useEffect, useRef } from 'react';
import { useConnectionSession, useRouterTelemetry, useMikroTikActions } from '../context/MikroTikContext';
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw, X, Clock, Wifi, WifiOff } from 'lucide-react';

export interface DiagnosticLogEvent {
  id: string;
  timestamp: string;
  type: 'timeout' | 'packet_loss' | 'recovery' | 'connected';
  message: string;
}

export const ConnectionDiagnosticIndicator: React.FC = () => {
  const {
    routerIdentity,
    isConnected,
    isSilentReconnecting,
    reconnectAttempts
  } = useConnectionSession();
  const { isRealtimeWsConnected, lastSyncTime } = useRouterTelemetry();
  const { syncNow, showToast } = useMikroTikActions();

  const [hasHeartbeatTimeout, setHasHeartbeatTimeout] = useState<boolean>(false);
  const [packetLossCount, setPacketLossCount] = useState<number>(0);
  const lastPacketReceivedAtRef = useRef<number>(Date.now());
  const [logs, setLogs] = useState<DiagnosticLogEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const prevConnectedRef = useRef<boolean>(isConnected);
  const hasHeartbeatTimeoutRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Monitor connection & heartbeat timeouts (> 35 seconds without packet or sync update)
  useEffect(() => {
    if (!isConnected) {
      setHasHeartbeatTimeout(false);
      hasHeartbeatTimeoutRef.current = false;
      return;
    }

    if (isConnected && !prevConnectedRef.current) {
      // Connected newly
      const newEvt: DiagnosticLogEvent = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('ar-SA'),
        type: 'connected',
        message: `تم الاتصال بنجاح بالراوتر (${routerIdentity?.name || routerIdentity?.host || 'MikroTik'})`
      };
      setLogs(prev => [newEvt, ...prev.slice(0, 49)]);
      lastPacketReceivedAtRef.current = Date.now();
      setHasHeartbeatTimeout(false);
      hasHeartbeatTimeoutRef.current = false;
    }
    prevConnectedRef.current = isConnected;

    const checkInterval = setInterval(() => {
      if (!isConnected || (typeof document !== 'undefined' && document.hidden)) return;
      const now = Date.now();
      const lastSyncMs = lastSyncTime ? new Date(lastSyncTime).getTime() : lastPacketReceivedAtRef.current;
      const elapsedSincePacket = now - Math.max(lastPacketReceivedAtRef.current, lastSyncMs);

      // 50s threshold accommodates adaptive Auto-Ping Stabilizer slowdown (up to 25s) without false timeout alarms
      if (elapsedSincePacket > 50000) {
        if (!hasHeartbeatTimeoutRef.current) {
          hasHeartbeatTimeoutRef.current = true;
          setHasHeartbeatTimeout(true);
          setPacketLossCount(prev => prev + 1);
          const timeoutEvt: DiagnosticLogEvent = {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('ar-SA'),
            type: 'timeout',
            message: `تحذير: تجاوز مهلة نبضات الاتصال (Heartbeat Timeout) أو فقدان الحزم (>50 ثانية بدون رد من الراوتر)`
          };
          setLogs(prev => [timeoutEvt, ...prev.slice(0, 49)]);
        }
      } else {
        if (hasHeartbeatTimeoutRef.current) {
          hasHeartbeatTimeoutRef.current = false;
          setHasHeartbeatTimeout(false);
          const recoveryEvt: DiagnosticLogEvent = {
            id: `log-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('ar-SA'),
            type: 'recovery',
            message: `استقرار الاتصال: عودة استلام نبضات الحزم الحية من الراوتر بنجاح`
          };
          setLogs(prev => [recoveryEvt, ...prev.slice(0, 49)]);
        }
      }
    }, 8000);

    return () => clearInterval(checkInterval);
  }, [isConnected, lastSyncTime, routerIdentity?.name, routerIdentity?.host]);

  // Update last packet timestamp when lastSyncTime changes
  useEffect(() => {
    if (lastSyncTime) {
      lastPacketReceivedAtRef.current = Date.now();
      if (hasHeartbeatTimeoutRef.current) {
        hasHeartbeatTimeoutRef.current = false;
        setHasHeartbeatTimeout(false);
      }
    }
  }, [lastSyncTime]);

  const handleManualDiagnosticSync = async () => {
    setIsSyncing(true);
    try {
      await syncNow(true);
      if (!isMountedRef.current) return;
      lastPacketReceivedAtRef.current = Date.now();
      hasHeartbeatTimeoutRef.current = false;
      setHasHeartbeatTimeout(false);
      showToast('تمت إعادة المزامنة التشخيصية بنجاح واستئناف نبضات الاتصال', 'success');
    } catch {
      if (isMountedRef.current) {
        showToast('فشلت محاولة الاتصال التشخيصي', 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <>
      {/* Diagnostic Indicator Badge in Header / Tabs */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors shadow-sm ${
          isSilentReconnecting
            ? 'bg-amber-950/90 border-amber-500/70 text-amber-200'
            : hasHeartbeatTimeout
            ? 'bg-rose-950/80 border-rose-500/60 text-rose-200'
            : 'bg-emerald-950/55 border-emerald-500/40 text-emerald-200 hover:bg-emerald-900/60'
        }`}
        title="اضغط لعرض تشخيص الاتصال ونبضات الـ Heartbeat وحزم المايكروتك"
      >
        <span className="relative flex h-2 w-2">
          <span className={`relative inline-flex rounded-full h-2 w-2 ${
            isSilentReconnecting
              ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
              : hasHeartbeatTimeout
              ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
              : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
          }`}></span>
        </span>

        <div className="flex items-center gap-1.5">
          {isSilentReconnecting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 text-amber-300 animate-spin shrink-0" />
              <span className="hidden sm:inline font-bold">استعادة صامتة للاتصال ({reconnectAttempts})</span>
            </>
          ) : hasHeartbeatTimeout ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span className="hidden sm:inline font-bold">مهلة نبضات الاتصال (Timeout)</span>
              {packetLossCount > 0 && <span className="px-1.5 py-0.2 bg-rose-500/30 text-rose-200 rounded-full text-[10px]">{packetLossCount}</span>}
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">اتصال حي مستقر (Live)</span>
            </>
          )}
        </div>
      </button>

      {/* Detailed Connection Diagnostic Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-2xl border ${hasHeartbeatTimeout ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">تشخيص الاتصال ونبضات المايكروتك (Heartbeat & Packet Loss)</h3>
                  <p className="text-xs text-slate-400">مراقبة حية لجلسة الاتصال، زمن الاستجابة، وفقدان الحزم</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
              {/* Status Banner */}
              <div className={`p-4 rounded-2xl border flex items-center gap-3 ${
                hasHeartbeatTimeout
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              }`}>
                {hasHeartbeatTimeout ? (
                  <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                )}
                <div className="flex-1 text-sm">
                  <p className="font-bold">
                    {hasHeartbeatTimeout ? 'تحذير: تم رصد تأخر في نبضات الاتصال (Heartbeat Timeout)' : 'الاتصال حي ومستقر ويعمل بكفاءة'}
                  </p>
                  <p className="text-xs opacity-80 mt-0.5">
                    {hasHeartbeatTimeout
                      ? 'لم يتلق البرنامج ردًا أو حزم بيانات حية من الراوتر لفترة تجاوزت الحد الآمن (14 ثانية). قد يكون هناك ضغط على المعالج أو ضعف في الشبكة.'
                      : 'جميع قنوات البث المباشر وطلبات الـ API تتلقى البيانات بنجاح تام وبدون فقدان في الحزم.'}
                  </p>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                  <span className="text-xs text-slate-400">حالة الـ WebSocket</span>
                  <span className={`text-sm font-bold mt-2 ${isRealtimeWsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isRealtimeWsConnected ? 'متصل ومؤمن (Active)' : 'يعمل بالاستطلاع (Smart Polling)'}
                  </span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                  <span className="text-xs text-slate-400">مرات انقطاع النبضات (Timeouts)</span>
                  <span className="text-sm font-bold text-rose-400 mt-2">{packetLossCount} مرة</span>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between">
                  <span className="text-xs text-slate-400">آخر مزامنة ناجحة</span>
                  <span className="text-xs font-semibold text-slate-200 mt-2">
                    {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('ar-SA') : 'جارِ التحميل...'}
                  </span>
                </div>
              </div>

              {/* Diagnostic Event Log */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">سجل أحداث الاتصال ونبضات الـ Heartbeat</h4>
                  <span className="text-[11px] text-slate-500">أحدث 50 حدثاً</span>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-2 max-h-56 overflow-y-auto custom-scrollbar font-mono text-xs">
                  {logs.length === 0 ? (
                    <div className="text-center py-6 text-slate-500">لا توجد أحداث مسجلة حتى الآن. الاتصال مستقر.</div>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 ${
                          log.type === 'timeout'
                            ? 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                            : log.type === 'recovery' || log.type === 'connected'
                            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="text-[10px] text-slate-500 shrink-0 pt-0.5">{log.timestamp}</span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setLogs([])}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors"
              >
                مسح السجل
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition-colors"
                >
                  إغلاق
                </button>
                <button
                  type="button"
                  onClick={handleManualDiagnosticSync}
                  disabled={isSyncing}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>إعادة مزامنة فورية وفحص النبضات</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
