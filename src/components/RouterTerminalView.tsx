import React, { useState, useRef, useEffect } from 'react';
import { useMikroTik } from '../context/MikroTikContext';
import {
  Terminal,
  Play,
  Trash2,
  Copy,
  Check
} from 'lucide-react';

import { RouterGuard } from '../lib/routerGuard';
import { safeStorage } from '../utils/safeStorage';

interface TerminalEntry {
  id: string;
  cmd: string;
  output: string;
  time: string;
  isError?: boolean;
}

export const RouterTerminalView: React.FC = () => {
  const { router, isConnected, runCommand, showToast } = useMikroTik();
  const [command, setCommand] = useState('');
  const [history, setHistory] = useState<TerminalEntry[]>(() => [
    {
      id: 'init',
      cmd: 'system',
      output: `تم تهيئة سطر الأوامر التفاعلي (RouterOS Terminal). جاهز لتلقي الأوامر المباشرة من الراوتر (${router?.name || router?.host || 'MikroTik'}).`,
      time: new Date().toLocaleTimeString('ar-EG')
    }
  ]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState<number>(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleCopyOutput = async (entry: TerminalEntry) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(entry.output);
      } else {
        throw new Error('Clipboard unavailable');
      }
    } catch {
      const ta = document.createElement('textarea');
      ta.value = entry.output;
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
    setCopiedId(entry.id);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setCopiedId(null);
    }, 2000);
  };

  const handleExecute = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isExecuting) return;
    const cmdToRun = command.replace(/[\r\n]+/g, ' ').trim();
    if (!cmdToRun) return;
    if (!isConnected) {
      showToast('يجب الاتصال بالراوتر أولاً لتنفيذ الأوامر', 'warning');
      return;
    }

    const token = safeStorage.getItem('zcontrol_active_token') || '';
    const guard = await RouterGuard.canProceed(token, true);
    if (!guard.ok) {
      showToast(guard.reason || 'الراوتر تحت ضغط مرتفع — يتعذر تنفيذ الأمر الآن', 'error');
      return;
    }

    setCmdHistory((prev) => {
      const filtered = prev.filter((c) => c !== cmdToRun);
      const next = [...filtered, cmdToRun];
      return next.length > 50 ? next.slice(next.length - 50) : next;
    });
    setHistoryCursor(-1);

    setIsExecuting(true);
    try {
      const res = await runCommand(cmdToRun);
      if (!isMountedRef.current) return;
      setHistory((prev) => {
        const next: TerminalEntry[] = [
          ...prev,
          {
            id: `${Date.now()}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : prev.length}`,
            cmd: cmdToRun,
            output: res.output || (res.success ? 'تم التنفيذ بنجاح بدون مخرجات' : 'فشل تنفيذ الأمر'),
            time: new Date().toLocaleTimeString('ar-EG'),
            isError: !res.success
          }
        ];
        return next.length > 100 ? next.slice(next.length - 100) : next;
      });
      setCommand('');
    } catch (err: any) {
      if (isMountedRef.current) {
        showToast(`خطأ في تنفيذ الأمر: ${err?.message || 'غير معروف'}`, 'error');
      }
    } finally {
      if (isMountedRef.current) setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (cmdHistory.length === 0) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const nextCursor = historyCursor === -1 ? cmdHistory.length - 1 : Math.max(0, historyCursor - 1);
      setHistoryCursor(nextCursor);
      setCommand(cmdHistory[nextCursor]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyCursor === -1) return;
      const nextCursor = historyCursor + 1;
      if (nextCursor >= cmdHistory.length) {
        setHistoryCursor(-1);
        setCommand('');
      } else {
        setHistoryCursor(nextCursor);
        setCommand(cmdHistory[nextCursor]);
      }
    }
  };

  const quickCommands = [
    { label: 'مواصفات النظام (Resources)', cmd: '/system resource print' },
    { label: 'عرض مستخدمي الهوتسبوت', cmd: '/ip hotspot user print' },
    { label: 'فحص المنافذ (Interfaces)', cmd: '/interface print' },
    { label: 'فحص الاتصال Ping 8.8.8.8', cmd: '/ping 8.8.8.8 count=4' },
    { label: 'تفريغ كاش DNS', cmd: '/ip dns cache flush' },
    { label: 'عرض سجل الأحداث Log', cmd: '/log print' }
  ];

  const handleQuickCmd = (cmd: string) => {
    setCommand(cmd);
  };

  const routerIdentity = router?.name || router?.host || 'MikroTik';
  const routerVersionText = router?.version ? `RouterOS ${router.version}` : 'RouterOS CLI';
  const routerBanner = router?.boardName || router?.version
    ? `MikroTik ${router?.boardName || ''} ${router?.version ? `(RouterOS ${router.version})` : ''}`.trim()
    : 'MikroTik RouterOS CLI Terminal';

  return (
    <div className="space-y-6 flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2.5">
            <Terminal className="w-6 h-6 text-emerald-400" />
            <span>طرفية أوامر ZCtrl التفاعلية (RouterOS CLI Terminal)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            تنفيذ أي أمر من أوامر MikroTik RouterOS مباشرة مع الاستجابة الحية (استخدم الأسهم ↑↓ لاسترجاع الأوامر)
          </p>
        </div>

        <button
          type="button"
          onClick={() => setHistory([])}
          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Trash2 className="w-4 h-4 text-slate-400" />
          <span>مسح الشاشة (Clear)</span>
        </button>
      </div>

      {/* Quick Command Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-400 font-semibold">أوامر سريعة:</span>
        {quickCommands.map((qc, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleQuickCmd(qc.cmd)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-blue-300 font-mono transition-colors cursor-pointer"
            dir="ltr"
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Terminal Screen Container */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-2xl flex-1 min-h-[420px] flex flex-col font-mono text-xs overflow-hidden">
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-900 text-[11px] text-slate-500" dir="ltr">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
            <span className="text-slate-400 font-bold ml-2">admin@{routerIdentity} ~ Terminal</span>
          </div>
          <span>{routerVersionText}</span>
        </div>

        {/* Terminal Logs Output */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-slate-200 max-h-[500px]" dir="ltr">
          <div className="text-emerald-400 font-bold">
            {routerBanner}
          </div>

          {history.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center gap-2 text-blue-400 font-bold">
                <span className="text-emerald-400">[admin@{routerIdentity}] &gt;</span>
                <span className="break-all">{item.cmd}</span>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyOutput(item)}
                    className="text-slate-500 hover:text-slate-200 p-1 rounded cursor-pointer"
                    title="نسخ المخرجات"
                  >
                    {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <span className="text-[10px] text-slate-600 font-sans">{item.time}</span>
                </div>
              </div>
              <pre
                className={`p-3 rounded-xl border whitespace-pre-wrap leading-relaxed overflow-x-auto ${
                  item.isError
                    ? 'text-rose-300 bg-rose-950/30 border-rose-500/30'
                    : 'text-slate-300 bg-slate-900/40 border-slate-900/80'
                }`}
              >
                {item.output}
              </pre>
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>

        {/* Command Input Bar */}
        <form onSubmit={handleExecute} className="mt-4 pt-3 border-t border-slate-900 flex items-center gap-2" dir="ltr">
          <span className="text-emerald-400 font-bold">[admin@{routerIdentity}] &gt;</span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب الأمر هنا، مثلاً: /ip hotspot user print ..."
            className="flex-1 bg-transparent border-none text-slate-100 placeholder-slate-600 focus:outline-none font-mono text-xs"
            autoFocus
          />
          <button
            type="submit"
            disabled={isExecuting || !command.trim() || !isConnected}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40 cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>{isExecuting ? 'جاري التنفيذ...' : 'تنفيذ'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
