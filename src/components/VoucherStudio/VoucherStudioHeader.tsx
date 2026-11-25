import React from "react";
import { Zap, RefreshCw, CheckCircle2, AlertTriangle, Server, Database, Sparkles } from "lucide-react";
import { RouterPrecheckInfo } from "./types";

interface VoucherStudioHeaderProps {
  precheck: RouterPrecheckInfo | null;
  prechecking: boolean;
  onRefreshPrecheck: () => void;
  systemName?: string;
  onOpenCustomVoucherModal?: () => void;
}

const formatMemory = (mem: number | string | undefined | null): string => {
  if (mem === undefined || mem === null) return "غير معروف";
  const num = typeof mem === "number" ? mem : parseInt(String(mem), 10);
  if (isNaN(num)) return "غير معروف";
  if (num >= 1024 * 1024 * 1024) return `${(num / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (num >= 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  if (num >= 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${num} B`;
};

export const VoucherStudioHeader: React.FC<VoucherStudioHeaderProps> = ({
  precheck,
  prechecking,
  onRefreshPrecheck,
  systemName,
  onOpenCustomVoucherModal,
}) => {
  return (
    <div className="space-y-3 font-sans">
      {/* Main Header Card - Refined Single Elevation Architecture */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl text-slate-100 shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold flex items-center gap-2 text-white tracking-tight">
              <Zap className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>استوديو الكروت المحترف وتوليد وقوالب البطاقات</span>
            </h1>
            {systemName && (
              <span className="text-xs font-medium text-slate-400 border-r border-slate-700 pr-3 mr-1">
                {systemName}
              </span>
            )}
          </div>
          <p className="text-slate-400 text-xs mt-1.5 flex items-center gap-2">
            <span>توليد كميات ذكية بحجم حتى 10,000 كرت، قوالب وهوامش A4 متقدمة، فواصل القص والباركود، وطباعة إيصالات حرارية</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {onOpenCustomVoucherModal && (
            <button
              type="button"
              onClick={onOpenCustomVoucherModal}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-950" />
              <span>توليد كرت مخصص</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefreshPrecheck}
            disabled={prechecking}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shrink-0 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${prechecking ? "animate-spin text-indigo-400" : ""}`} />
            <span>تحديث موارد الراوتر</span>
          </button>
        </div>
      </div>

      {/* Precheck Info Bar - Zero-Pill Typographic Metadata with Tabular Figures */}
      {precheck && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs transition-colors ${
            precheck.routerConnected
              ? "bg-slate-900/90 border-slate-800 text-slate-300"
              : "bg-slate-900/60 border-slate-800 text-slate-400"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              {precheck.routerConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className={precheck.routerConnected ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"}>
                {precheck.routerConnected ? "الراوتر متصل بنجاح" : "وضع المعاينة المحلي (الراوتر غير متصل)"}
              </span>
            </div>

            {precheck.routerInfo && (
              <>
                <span className="text-slate-600 hidden sm:inline" aria-hidden="true">·</span>
                <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px] tabular-nums">
                  <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{precheck.routerInfo.boardName}</span>
                  <span className="text-slate-500">v{precheck.routerInfo.version}</span>
                </div>
                <span className="text-slate-600 hidden sm:inline" aria-hidden="true">·</span>
                <div className="text-slate-300 font-mono text-[11px] tabular-nums">
                  CPU: <span className="text-white font-bold">{precheck.routerInfo.cpuLoad}%</span>
                  <span className="mx-1 text-slate-600">/</span>
                  RAM المتاح: <span className="text-white font-bold">{formatMemory(precheck.routerInfo.freeMemory)}</span>
                </div>
              </>
            )}

            <span className="text-slate-600 hidden sm:inline" aria-hidden="true">·</span>
            <div className="flex items-center gap-1.5 text-slate-300 font-mono text-[11px] tabular-nums">
              <Database className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>الكروت في القاعدة: <strong className="text-white font-bold">{precheck.existingDbCount.toLocaleString()}</strong></span>
            </div>

            {precheck.routerConnected && precheck.existingRouterCount !== undefined && (
              <>
                <span className="text-slate-600 hidden sm:inline" aria-hidden="true">·</span>
                <div className="text-slate-400 font-mono text-[11px] tabular-nums">
                  نشطون بالراوتر: <strong className="text-slate-200">{precheck.existingRouterCount.toLocaleString()}</strong>
                </div>
              </>
            )}
          </div>
          {precheck.message && (
            <p className="text-[11px] text-slate-400 mt-1.5 font-normal leading-relaxed">{precheck.message}</p>
          )}
        </div>
      )}
    </div>
  );
};
