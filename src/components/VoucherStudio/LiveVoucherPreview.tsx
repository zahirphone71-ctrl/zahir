import React, { useMemo } from "react";
import { Eye, Printer, Sparkles, CheckCircle2, LayoutGrid, Hash, ArrowLeftRight, Loader2 } from "lucide-react";
import { VoucherProfile, PrintLayoutOption, GenerateResponse, VoucherDesignState } from "./types";
import { VoucherCardPreview } from "./VoucherCardPreview";
import { DraggableVoucherCardCanvas } from "./DraggableVoucherCardCanvas";
import { buildAutoLoginQrUrl } from "./qrUtils";
import { GridResult } from "./gridCalculator";

interface LiveVoucherPreviewProps {
  design?: VoucherDesignState;
  setDesign?: React.Dispatch<React.SetStateAction<VoucherDesignState>>;
  networkName: string;
  currencySymbol: string;
  loginUrl: string;
  showPin: boolean;
  showQr: boolean;
  prefix: string;
  codeLength: string;
  layout: PrintLayoutOption;
  activeProfileObj?: VoucherProfile;
  lastResult: GenerateResponse | null;
  onOpenModal: () => void;
  onGenerate?: () => void;
  generating?: boolean;
  credentialType?: "username_password" | "username_only";
  cardBgColor?: string;
  cardTextColor?: string;
  fontFamily?: string;
  fontSize?: string;
  borderRadius?: number;
  customTimeLimit?: string;
  customDataLimit?: string;
  theme?: string;
  gridInfo?: GridResult | null;
  fontScale?: number;
  previewPosition?: "left" | "right";
  onTogglePreviewPosition?: () => void;
}

export const LiveVoucherPreview: React.FC<LiveVoucherPreviewProps> = ({
  design,
  setDesign,
  networkName,
  currencySymbol,
  loginUrl,
  showPin,
  showQr,
  prefix,
  codeLength,
  layout,
  activeProfileObj,
  lastResult,
  onOpenModal,
  onGenerate,
  generating = false,
  credentialType = "username_password",
  cardBgColor = "#ffffff",
  cardTextColor = "#0f172a",
  fontFamily = "Tajawal",
  fontSize = "md",
  borderRadius = 12,
  customTimeLimit,
  customDataLimit,
  theme,
  gridInfo,
  fontScale,
  previewPosition,
  onTogglePreviewPosition
}) => {
  const sampleCode = useMemo(() => {
    const len = Math.max(3, Math.min(16, parseInt(codeLength, 10) || 6));
    const placeholders = "X".repeat(len);
    return `${prefix ? prefix.trim() : ""}${placeholders}`;
  }, [prefix, codeLength]);

  const samplePin = useMemo(() => {
    if (design?.authMode === "user_equals_pass" || design?.sameUserPass) {
      return sampleCode;
    }
    if (!showPin) return undefined;
    return "XXXX";
  }, [showPin, design?.authMode, design?.sameUserPass, sampleCode]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm flex flex-col justify-between font-sans">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-400 shrink-0" />
            <div>
              <h2 className="text-sm font-bold text-white">المعاينة الجانبية المباشرة</h2>
              <p className="text-[11px] text-slate-400">تعديل لحظي بالسحب والإفلات وتنسيق العناصر</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onTogglePreviewPosition && (
              <button
                type="button"
                onClick={onTogglePreviewPosition}
                title={previewPosition === "right" ? "نقل المعاينة للجانب الأيسر" : "نقل المعاينة للجانب الأيمن"}
                className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-medium border border-slate-700 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-3 h-3 text-indigo-400" />
                <span>{previewPosition === "right" ? "نقل لليسار" : "نقل لليمين"}</span>
              </button>
            )}
            <span className="text-[11px] font-medium text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/60">
              معاينة حية
            </span>
          </div>
        </div>

        {/* DRAGGABLE CANVAS OR STATIC CARD PREVIEW */}
        {design && setDesign ? (
          <DraggableVoucherCardCanvas
            design={design}
            setDesign={setDesign}
            activeProfileObj={activeProfileObj}
            sampleCode={sampleCode}
            samplePin={samplePin}
            gridInfo={gridInfo}
            fontScale={fontScale}
          />
        ) : (
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col items-center justify-center space-y-3">
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>نموذج كرت مطابق تماماً للمظهر المطبوع</span>
            </div>

            <div className="w-full max-w-[320px]">
              <VoucherCardPreview
                code={sampleCode}
                pin={samplePin}
                price={activeProfileObj?.price || 500}
                networkName={networkName || "شبكة زاهر"}
                currency={currencySymbol || "ريال"}
                timeLimit={customTimeLimit || activeProfileObj?.validity || "30 يوم"}
                dataLimit={customDataLimit || activeProfileObj?.dataLimit || "5 GB"}
                isDense={false}
                credentialType={credentialType}
                cardBgColor={cardBgColor}
                cardTextColor={cardTextColor}
                fontFamily={fontFamily}
                fontSize={fontSize}
                borderRadius={borderRadius}
                showQr={showQr}
                loginUrl={loginUrl}
                theme={theme}
                fontScale={fontScale}
              />
            </div>
          </div>
        )}

        {/* QR login link preview */}
        {showQr && (
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 max-w-full overflow-hidden">
            <span className="text-amber-400 font-bold shrink-0">رابط الـ QR المباشر:</span>
            <span className="truncate text-slate-400 font-mono" title={buildAutoLoginQrUrl(loginUrl, sampleCode, samplePin, credentialType === "username_only" ? "user_only" : "user_pass")}>
              {buildAutoLoginQrUrl(loginUrl, sampleCode, samplePin, credentialType === "username_only" ? "user_only" : "user_pass")}
            </span>
          </div>
        )}

        {/* Layout Summary */}
        <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-between font-bold text-slate-200 border-b border-slate-800 pb-1.5">
            <span className="flex items-center gap-1.5">
              <LayoutGrid className="w-4 h-4 text-indigo-400" />
              <span>تخطيط الورق المختار:</span>
            </span>
            <span className="text-slate-100 font-mono text-[11px] tabular-nums">{layout.label}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
            <div>
              العدد بالصفحة: <strong className="text-white">{layout.cols * (layout.rows || 7)}</strong>
            </div>
            <div>
              الشبكة: <strong className="text-white">{layout.cols} × {layout.rows || 7}</strong>
            </div>
            <div>
              المقاس: <strong className="text-amber-300">{design?.cardWidthMm || 85}×{design?.cardHeightMm || 52} مم</strong>
            </div>
          </div>
        </div>

        {/* Last generated batch badge */}
        {lastResult && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>الدفعة المولدة جاهزة للطباعة</span>
              </span>
              <span className="font-mono text-xs text-emerald-400 font-bold tabular-nums">
                {lastResult.totalGenerated} كرت
              </span>
            </div>
            <p className="text-[11px] text-slate-400">انقر على زر المعاينة والطباعة لتصدير أو طباعة هذه الدفعة</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-2 space-y-2">
        {onGenerate && (
          <button
            type="button"
            disabled={generating}
            onClick={onGenerate}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99] border border-indigo-400/30"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Hash className="w-4 h-4 text-white" />
            )}
            <span>{generating ? "جاري توليد الكروت محلياً..." : "توليد الكروت وتجهيز المعاينة والطباعة"}</span>
          </button>
        )}

        <p className="text-[10px] text-slate-400 text-center font-sans px-1">
          💡 يتم توليد الكروت محلياً أولاً لمراجعتها؛ وتتم عملية الحقن بالمايكروتك من النافذة المنبثقة.
        </p>

        <button
          type="button"
          onClick={onOpenModal}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-700"
          title={lastResult ? "معاينة وطباعة الدفعة الحقيقية المولدة" : "معاينة شكل القالب والورقة باستخدام عينات تجريبية"}
        >
          <Printer className="w-4 h-4 text-indigo-400" />
          <span>
            {lastResult 
              ? `معاينة وطباعة وحقن الكروت (${lastResult.totalGenerated} كرت)`
              : "معاينة شكل ورقة الطباعة (عينات تجريبية A4)"}
          </span>
        </button>
      </div>
    </div>
  );
};
