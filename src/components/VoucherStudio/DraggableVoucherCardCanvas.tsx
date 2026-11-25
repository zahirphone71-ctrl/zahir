import React, { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { 
  Move, RotateCcw, QrCode, Eye, EyeOff, 
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Plus, Minus,
  Upload, Trash2, Printer, Sliders
} from "lucide-react";
import { VoucherDesignState, VoucherProfile } from "./types";
import { THEME_PRESETS } from "./themePresets";
import { buildAutoLoginQrUrl } from "./qrUtils";
import { DEFAULT_SMART_COORDS } from "./smartCoords";
import { VoucherCardPreview } from "./VoucherCardPreview";
import { GridResult } from "./gridCalculator";

interface DraggableVoucherCardCanvasProps {
  design: VoucherDesignState;
  setDesign: React.Dispatch<React.SetStateAction<VoucherDesignState>>;
  activeProfileObj?: VoucherProfile;
  sampleCode?: string;
  samplePin?: string;
  gridInfo?: GridResult | null;
  fontScale?: number;
}

export const DraggableVoucherCardCanvas: React.FC<DraggableVoucherCardCanvasProps> = ({
  design,
  setDesign,
  activeProfileObj,
  sampleCode = "884920",
  samplePin = "4920",
  gridInfo,
  fontScale
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [activeElement, setActiveElement] = useState<keyof VoucherDesignState["coords"] | null>("user");
  
  const [showActualSize, setShowActualSize] = useState(false);

  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const fontMap: Record<string, string> = {
    Tajawal: "'Tajawal', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif",
    Cairo: "'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif",
    Amiri: "'Amiri', serif",
    Almarai: "'Almarai', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif",
    "JetBrains Mono": "'JetBrains Mono', 'Courier New', monospace",
    monospace: "'Courier New', monospace",
    sans: "sans-serif"
  };

  const preset = THEME_PRESETS[design.theme] || THEME_PRESETS.modern;

  // Coords & Element configurations
  const coords = design.coords || DEFAULT_SMART_COORDS;

  const elements = design.elements || {
    network: { show: true, color: preset.elements.network.color, fontSize: 13, rotation: 0, hasShadow: false },
    user: { show: true, color: preset.elements.user.color, fontSize: 15, rotation: 0, hasShadow: false },
    password: { show: true, color: preset.elements.password.color, fontSize: 13, rotation: 0, hasShadow: false },
    price: { show: true, color: preset.elements.price.color, fontSize: 12, rotation: 0, hasShadow: false },
    time: { show: true, color: preset.elements.time.color, fontSize: 10, rotation: 0, hasShadow: false },
    profile: { show: true, color: preset.elements.profile.color, fontSize: 11, rotation: 0, hasShadow: false },
    dataLimit: { show: true, color: preset.elements.dataLimit.color, fontSize: 10, rotation: 0, hasShadow: false }
  };

  // Handle Dragging Start (Mouse or Touch)
  const handleDragStart = (
    elKey: keyof VoucherDesignState["coords"],
    e: React.MouseEvent | React.TouchEvent
  ) => {
    e.stopPropagation();
    setActiveElement(elKey);
    isDraggingRef.current = true;

    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    const currentCoords = design.coords || DEFAULT_SMART_COORDS;
    const currentX = (currentCoords[elKey]?.x ?? 50) / 100 * rect.width;
    const currentY = (currentCoords[elKey]?.y ?? 50) / 100 * rect.height;

    dragOffsetRef.current = {
      x: clientX - (rect.left + currentX),
      y: clientY - (rect.top + currentY)
    };
  };

  // Nudge coordinates with arrow buttons
  const nudgeActiveElement = (dx: number, dy: number) => {
    if (!activeElement) return;
    setDesign(prev => {
      const current = prev.coords?.[activeElement] || { x: 50, y: 50 };
      const newX = Math.max(1, Math.min(99, current.x + dx));
      const newY = Math.max(1, Math.min(99, current.y + dy));
      return {
        ...prev,
        coords: {
          ...prev.coords,
          [activeElement]: { x: newX, y: newY }
        }
      };
    });
  };

  // Drag Movement Listener with requestAnimationFrame for 60fps buttery smoothness & zero GC lag
  useEffect(() => {
    let animationFrameId: number | null = null;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingRef.current || !activeElement || !cardRef.current) return;
      if ("touches" in e && e.cancelable) {
        e.preventDefault();
      }
      const rect = cardRef.current.getBoundingClientRect();

      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      const posX = clientX - rect.left - dragOffsetRef.current.x;
      const posY = clientY - rect.top - dragOffsetRef.current.y;

      const pctX = Math.round(Math.max(2, Math.min(98, (posX / rect.width) * 100)));
      const pctY = Math.round(Math.max(2, Math.min(98, (posY / rect.height) * 100)));

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        setDesign(prev => {
          const current = prev.coords?.[activeElement];
          if (current && current.x === pctX && current.y === pctY) {
            return prev;
          }
          return {
            ...prev,
            coords: {
              ...prev.coords,
              [activeElement]: { x: pctX, y: pctY }
            }
          };
        });
      });
    };

    const handleEnd = () => {
      isDraggingRef.current = false;
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [activeElement, setDesign]);

  const resetCoordinates = () => {
    setDesign(prev => ({
      ...prev,
      coords: { ...DEFAULT_SMART_COORDS }
    }));
  };

  const toggleQrCode = () => {
    setDesign(prev => ({
      ...prev,
      showQr: !prev.showQr
    }));
  };

  // Card style based on design theme and preset
  const getCardStyle = (): React.CSSProperties => {
    const preset = THEME_PRESETS[design.theme] || THEME_PRESETS.modern;
    const bg = design.bgColor || preset.bgColor;
    const gradient = preset.cardBgGradient;

    let border = '';
    if (preset.cardBorderStyle === 'none') {
      border = 'none';
    } else if (preset.cardBorderStyle === 'double') {
      border = `${preset.cardBorderWidth * 3}px double ${design.borderColor || preset.borderColor}`;
    } else {
      border = `${preset.cardBorderWidth}px ${preset.cardBorderStyle} ${design.borderColor || preset.borderColor}`;
    }

    return {
      background: gradient || bg,
      border,
      boxShadow: preset.cardShadow,
      borderRadius: `${preset.cardRadius}px`,
      fontFamily: fontMap[design.fontFamily || preset.fontFamily] || "'Tajawal', sans-serif",
      backdropFilter: design.theme === 'glass' ? 'blur(10px)' : undefined,
    };
  };

  const getBoxStyles = (
    boxStyle: 'box' | 'underline' | 'pill' | 'none',
    bg: string,
    border: string
  ): React.CSSProperties => {
    switch (boxStyle) {
      case 'underline':
        return {
          background: 'transparent',
          border: 'none',
          borderBottom: `2px solid ${border}`,
          borderRadius: 0,
          padding: '1px 4px 2px',
        };
      case 'pill':
        return {
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '999px',
          padding: '2px 10px',
        };
      case 'none':
        return {
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          padding: '1px 2px',
        };
      case 'box':
      default:
        return {
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: '4px',
          padding: '2px 6px',
        };
    }
  };

  const getElementShadow = (hasShadow: boolean, shadowColor?: string): string => {
    if (!hasShadow) return 'none';
    return `0 2px 4px ${shadowColor || 'rgba(0,0,0,0.5)'}`;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result;
        if (typeof base64 === "string") {
          setDesign(prev => ({
            ...prev,
            bgImage: base64,
            showBgImage: true
          }));
        }
      };
      reader.onerror = () => {
        console.warn("Failed to read card background image");
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const widthMm = design.cardWidthMm || 85;
  const heightMm = design.cardHeightMm || 52;
  const aspectRatio = `${widthMm} / ${heightMm}`;

  const qrValue = buildAutoLoginQrUrl(design.loginUrl, sampleCode, samplePin, design.authMode);

  // Helper for active element title
  const activeElementLabels: Record<string, string> = {
    network: "🌐 اسم الشبكة",
    price: "💰 السعر والعملة",
    user: "👤 اسم المستخدم / الكود",
    password: "🔑 كلمة المرور / PIN",
    qr: "🏁 كود QR",
    time: "⏱️ وقت الصلاحية",
    profile: "🏷️ اسم الباقة",
    dataLimit: "📊 حجم البيانات"
  };

  const activeElementConfig = activeElement && activeElement !== "qr" ? (elements as any)[activeElement] : null;

  return (
    <div className="space-y-3">
      {/* Real Grid Info Banner */}
      {gridInfo && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-950/60 border border-emerald-500/30 p-2.5 rounded-xl text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-black flex items-center gap-1">
              <span>📐 التوزيع الفعلي على A4:</span>
            </span>
            <span className="bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded font-mono font-bold border border-emerald-700/50">
              {gridInfo.cols} × {gridInfo.rows} = {gridInfo.totalPerPage} كرت/صفحة
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-emerald-300/80">
            <span>كرت فعلي: <strong className="text-white font-mono">{gridInfo.actualCardWidthMm} × {gridInfo.actualCardHeightMm} مم</strong></span>
            <span>نسبة الخط: <strong className="text-emerald-200 font-mono">{Math.round((fontScale ?? gridInfo.fontScale) * 100)}%</strong></span>
            <span><strong className="text-emerald-200 font-mono">{gridInfo.totalPages}</strong> صفحة لـ <strong className="text-emerald-200 font-mono">{gridInfo.totalCards}</strong> كرت</span>
          </div>
        </div>
      )}

      {/* Interactive Drag & QR Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-indigo-950/70 border border-indigo-500/30 p-2.5 rounded-xl text-xs">
        <div className="flex items-center gap-2 text-indigo-200 font-bold">
          <Move className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>اسحب أي عنصر بالماوس لتعديل مكانه في الكرت</span>
          <span className="bg-indigo-900/80 text-amber-300 font-mono px-2 py-0.5 rounded text-[10px] border border-indigo-500/30">
            {widthMm}mm × {heightMm}mm
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Custom BG Image Uploader */}
          <label className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>خلفية للكرت</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>

          {design.bgImage && (
            <button
              type="button"
              onClick={() => setDesign(prev => ({ ...prev, bgImage: undefined, showBgImage: false }))}
              className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-950/40 rounded-lg border border-rose-900/40 cursor-pointer"
              title="إزالة صورة الخلفية"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Quick QR Toggle Button */}
          <button
            type="button"
            onClick={toggleQrCode}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              design.showQr
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            }`}
            title="إظهار / إخفاء كود QR على الكرت"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{design.showQr ? "كود QR (مفعّل)" : "كود QR (مخفي)"}</span>
            {design.showQr ? <Eye className="w-3 h-3 text-emerald-200" /> : <EyeOff className="w-3 h-3 text-slate-400" />}
          </button>

          {/* Actual Size Print Simulation Toggle */}
          <button
            type="button"
            onClick={() => setShowActualSize(prev => !prev)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all ${
              showActualSize
                ? "bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-md"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
            }`}
            title="معاينة شكل وحجم الكرت الحقيقي المتطابق تماماً مع الطباعة الفعلية"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{showActualSize ? "إغلاق المعاينة الفعلية" : "معاينة الحجم الفعلي"}</span>
          </button>

          {/* Reset coords */}
          <button
            type="button"
            onClick={resetCoordinates}
            className="text-[11px] text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 cursor-pointer transition-colors"
            title="إعادة ضبط المواقع الافتراضية"
          >
            <RotateCcw className="w-3 h-3 text-rose-400" />
            <span>ضبط المواقع</span>
          </button>
        </div>
      </div>

      {/* Actual Size Simulation Panel */}
      {showActualSize && (
        <div className="bg-slate-900 border border-emerald-500/40 p-3 rounded-xl shadow-lg space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>معاينة مطابقة 100% للكرت المطبوع (عامل الخط: {Math.round((fontScale ?? gridInfo?.fontScale ?? 1.0) * 100)}%):</span>
            </span>
            <button
              type="button"
              onClick={() => setShowActualSize(false)}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 bg-slate-800 rounded cursor-pointer"
            >
              إغلاق ✕
            </button>
          </div>
          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex justify-center items-center overflow-auto">
            <div
              style={{
                width: `${gridInfo?.actualCardWidthMm || widthMm}mm`,
                height: `${gridInfo?.actualCardHeightMm || heightMm}mm`,
                maxWidth: "100%",
                boxSizing: "border-box"
              }}
            >
              <VoucherCardPreview
                code={sampleCode}
                pin={samplePin}
                design={design}
                fontScale={fontScale ?? gridInfo?.fontScale ?? 1.0}
              />
            </div>
          </div>
        </div>
      )}

      {/* Direct Element Quick Selector Bar (Accessibility & Clear Target) */}
      <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[11px] font-bold text-slate-300 ml-2 flex items-center gap-1">
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          <span>تحديد العنصر للتحكم المباشر:</span>
        </span>
        {[
          { key: "network", label: "🌐 الشبكة" },
          { key: "user", label: "👤 كود المستخدم" },
          ...((design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass) ? [{ key: "password", label: design.authMode === "user_equals_pass" || design.sameUserPass ? "🔑 كلمة المرور (مطابقة)" : "🔑 كلمة المرور" }] : []),
          { key: "price", label: "💰 السعر" },
          { key: "profile", label: "🏷️ الباقة" },
          { key: "time", label: "⏱️ الصلاحية" },
          { key: "dataLimit", label: "📊 البيانات" },
          ...(design.showQr ? [{ key: "qr", label: "🏁 QR" }] : []),
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveElement(item.key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              activeElement === item.key
                ? "bg-amber-500 text-slate-950 font-black shadow-md ring-2 ring-amber-400"
                : "bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Interactive Canvas */}
      <div
        ref={cardRef}
        className="relative w-full min-h-[200px] rounded-2xl overflow-hidden select-none transition-all shadow-2xl border cursor-crosshair"
        style={{
          ...getCardStyle(),
          aspectRatio: aspectRatio,
        }}
      >
        {/* Render Background Image if uploaded or defined */}
        {design.bgImage && (
          <img
            src={design.bgImage}
            alt="Card Background"
            className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none z-0"
          />
        )}

        {/* Subtle grid background to assist drag alignment */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8881_1px,transparent_1px),linear-gradient(to_bottom,#8881_1px,transparent_1px)] bg-[size:16px_16px] opacity-25 pointer-events-none z-0" />

        {/* Decorative horizontal line */}
        {preset.showDecorativeLine && (
          <div
            style={{
              position: 'absolute',
              left: '5%',
              right: '5%',
              top: '28%',
              height: '0.5px',
              background: preset.decorativeLineColor || 'rgba(255,255,255,0.2)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Decorative corner accents */}
        {preset.showCornerAccents && (
          <>
            <div
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '12px',
                height: '12px',
                borderTop: `2px solid ${preset.cornerAccentColor || preset.borderColor}`,
                borderRight: `2px solid ${preset.cornerAccentColor || preset.borderColor}`,
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '4px',
                left: '4px',
                width: '12px',
                height: '12px',
                borderBottom: `2px solid ${preset.cornerAccentColor || preset.borderColor}`,
                borderLeft: `2px solid ${preset.cornerAccentColor || preset.borderColor}`,
                zIndex: 1,
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        {/* 1. Network Title */}
        {elements.network?.show !== false && design.showNetworkName !== false && (
          <div
            onMouseDown={(e) => handleDragStart("network", e)}
            onTouchStart={(e) => handleDragStart("network", e)}
            onClick={() => setActiveElement("network")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing px-2 py-0.5 rounded transition-shadow whitespace-nowrap ${
              activeElement === "network"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 bg-amber-400/10 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.network?.x ?? 26}%`,
              top: `${coords.network?.y ?? 15}%`,
              color: elements.network?.color || preset.elements.network.color,
              fontSize: `${elements.network?.fontSize || preset.elements.network.fontSize || 13}px`,
              fontFamily: fontMap[elements.network?.fontFamily || design.fontFamily || preset.fontFamily],
              fontWeight: (elements.network?.fontWeight || preset.elements.network.fontWeight || "bold") as any,
              letterSpacing: `${elements.network?.letterSpacing ?? preset.elements.network.letterSpacing ?? 0}px`,
              transform: `translate(-50%, -50%) rotate(${elements.network?.rotation || 0}deg)`,
              textShadow: getElementShadow(elements.network?.hasShadow ?? preset.elements.network.hasShadow, elements.network?.shadowColor ?? preset.elements.network.shadowColor)
            }}
          >
            {design.networkName || "شبكة الإنترنت"}
          </div>
        )}

        {/* 2. Price Tag */}
        {elements.price?.show !== false && (
          <div
            onMouseDown={(e) => handleDragStart("price", e)}
            onTouchStart={(e) => handleDragStart("price", e)}
            onClick={() => setActiveElement("price")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing px-2 py-0.5 rounded font-black transition-shadow whitespace-nowrap ${
              activeElement === "price"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 bg-amber-400/10 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.price?.x ?? 84}%`,
              top: `${coords.price?.y ?? 15}%`,
              color: elements.price?.color || preset.elements.price.color,
              fontSize: `${elements.price?.fontSize || preset.elements.price.fontSize || 12}px`,
              fontFamily: fontMap[elements.price?.fontFamily || design.fontFamily || preset.fontFamily],
              fontWeight: (elements.price?.fontWeight || preset.elements.price.fontWeight || "bold") as any,
              letterSpacing: `${elements.price?.letterSpacing ?? preset.elements.price.letterSpacing ?? 0}px`,
              transform: `translate(-50%, -50%) rotate(${elements.price?.rotation || 0}deg)`,
              textShadow: getElementShadow(elements.price?.hasShadow ?? preset.elements.price.hasShadow, elements.price?.shadowColor ?? preset.elements.price.shadowColor),
              ...(preset.priceStyle === 'badge' ? {
                background: preset.primaryColor,
                color: '#ffffff',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: '800' as any,
              } : {}),
              ...(preset.priceStyle === 'highlight' ? {
                background: 'rgba(255,255,255,0.1)',
                padding: '1px 6px',
                borderRadius: '4px',
                border: `1px solid ${preset.primaryColor}`,
              } : {}),
              ...(preset.priceStyle === 'strikethrough' ? {
                textDecoration: 'line-through',
                textDecorationColor: preset.primaryColor,
                textDecorationThickness: '2px',
              } : {}),
            }}
          >
            {activeProfileObj?.price !== undefined ? activeProfileObj.price : design.price !== undefined ? design.price : 500} {design.currencySymbol || "ريال"}
          </div>
        )}

        {/* 3. Username Code */}
        {elements.user?.show !== false && (
          <div
            onMouseDown={(e) => handleDragStart("user", e)}
            onTouchStart={(e) => handleDragStart("user", e)}
            onClick={() => setActiveElement("user")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing font-mono transition-shadow shadow-xs whitespace-nowrap ${
              activeElement === "user"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.user?.x ?? (design.showQr ? 38 : 50)}%`,
              top: `${coords.user?.y ?? (design.authMode === 'user_only' && !design.showQr ? 50 : 44)}%`,
              color: elements.user?.color || preset.elements.user.color,
              fontSize: `${elements.user?.fontSize || preset.elements.user.fontSize || 15}px`,
              fontFamily: fontMap[elements.user?.fontFamily || preset.elements.user.fontFamily || "JetBrains Mono"],
              fontWeight: (elements.user?.fontWeight || preset.elements.user.fontWeight || "extrabold") as any,
              letterSpacing: `${elements.user?.letterSpacing ?? preset.elements.user.letterSpacing ?? 0.5}px`,
              transform: `translate(-50%, -50%) rotate(${elements.user?.rotation || 0}deg)`,
              textShadow: getElementShadow(elements.user?.hasShadow ?? preset.elements.user.hasShadow, elements.user?.shadowColor ?? preset.elements.user.shadowColor),
              ...getBoxStyles(
                preset.userBoxStyle || 'box',
                preset.userBoxBg,
                preset.userBoxBorder
              ),
            }}
          >
            <span className="text-[9px] opacity-75 ml-1 font-sans font-normal">كود:</span>
            <span>{sampleCode}</span>
          </div>
        )}

        {/* 4. Password PIN */}
        {(design.authMode === "user_pass" || design.authMode === "user_equals_pass" || design.sameUserPass) && elements.password?.show !== false && !(((design.authMode === "user_equals_pass" || design.sameUserPass)) && design.hidePasswordIfEqual) && (
          <div
            onMouseDown={(e) => handleDragStart("password", e)}
            onTouchStart={(e) => handleDragStart("password", e)}
            onClick={() => setActiveElement("password")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing font-mono transition-shadow shadow-xs whitespace-nowrap ${
              activeElement === "password"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.password?.x ?? (design.showQr ? 38 : 50)}%`,
              top: `${coords.password?.y ?? 68}%`,
              color: elements.password?.color || preset.elements.password.color,
              fontSize: `${elements.password?.fontSize || preset.elements.password.fontSize || 13}px`,
              fontFamily: fontMap[elements.password?.fontFamily || preset.elements.password.fontFamily || "JetBrains Mono"],
              fontWeight: (elements.password?.fontWeight || preset.elements.password.fontWeight || "bold") as any,
              letterSpacing: `${elements.password?.letterSpacing ?? preset.elements.password.letterSpacing ?? 0.5}px`,
              transform: `translate(-50%, -50%) rotate(${elements.password?.rotation || 0}deg)`,
              textShadow: getElementShadow(elements.password?.hasShadow ?? preset.elements.password.hasShadow, elements.password?.shadowColor ?? preset.elements.password.shadowColor),
              ...getBoxStyles(
                preset.passBoxStyle || 'box',
                preset.passBoxBg,
                preset.passBoxBorder
              ),
            }}
          >
            <span className="text-[9px] opacity-75 ml-1 font-sans font-normal">كلمة المرور:</span>
            <span>{design.authMode === "user_equals_pass" || design.sameUserPass ? sampleCode : samplePin}</span>
          </div>
        )}

        {/* 5. QR Code */}
        {design.showQr && (
          <div
            onMouseDown={(e) => handleDragStart("qr", e)}
            onTouchStart={(e) => handleDragStart("qr", e)}
            onClick={() => setActiveElement("qr")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1.5 transition-shadow ${
              activeElement === "qr"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.qr?.x ?? 84}%`,
              top: `${coords.qr?.y ?? 54}%`,
              background: preset.qrBg || '#ffffff',
              borderRadius: `${preset.qrBorderRadius}px`,
              boxShadow: preset.qrShadow || '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <QRCodeSVG value={qrValue} size={design.qrSize || 46} />
          </div>
        )}

        {/* 6. Time Validity */}
        {elements.time?.show !== false && (
          <div
            onMouseDown={(e) => handleDragStart("time", e)}
            onTouchStart={(e) => handleDragStart("time", e)}
            onClick={() => setActiveElement("time")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing px-2 py-0.5 rounded font-bold transition-shadow whitespace-nowrap ${
              activeElement === "time"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 bg-amber-400/10 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.time?.x ?? 25}%`,
              top: `${coords.time?.y ?? 88}%`,
              color: elements.time?.color || preset.elements.time.color,
              fontSize: `${elements.time?.fontSize || preset.elements.time.fontSize || 10}px`,
              fontFamily: fontMap[elements.time?.fontFamily || design.fontFamily || preset.fontFamily],
              fontWeight: (elements.time?.fontWeight || preset.elements.time.fontWeight || "normal") as any,
              letterSpacing: `${elements.time?.letterSpacing ?? preset.elements.time.letterSpacing ?? 0}px`,
              transform: `translate(-50%, -50%) rotate(${elements.time?.rotation || 0}deg)`,
              textShadow: getElementShadow(elements.time?.hasShadow ?? preset.elements.time.hasShadow, elements.time?.shadowColor ?? preset.elements.time.shadowColor)
            }}
          >
            ⏱️ {design.timeLimit || activeProfileObj?.validity || "30 يوم"}
          </div>
        )}

        {/* 7. Profile Name */}
        {elements.profile?.show !== false && (
          <div
            onMouseDown={(e) => handleDragStart("profile", e)}
            onTouchStart={(e) => handleDragStart("profile", e)}
            onClick={() => setActiveElement("profile")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing px-2 py-0.5 rounded font-bold transition-shadow whitespace-nowrap ${
              activeElement === "profile"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 bg-amber-400/10 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.profile?.x ?? 50}%`,
              top: `${coords.profile?.y ?? 15}%`,
              color: elements.profile?.color || preset.elements.profile.color,
              fontSize: `${elements.profile?.fontSize || preset.elements.profile.fontSize || 11}px`,
              fontFamily: fontMap[elements.profile?.fontFamily || design.fontFamily || preset.fontFamily],
              fontWeight: (elements.profile?.fontWeight || preset.elements.profile.fontWeight || "bold") as any,
              letterSpacing: `${elements.profile?.letterSpacing ?? preset.elements.profile.letterSpacing ?? 0}px`,
              transform: `translate(-50%, -50%) rotate(${elements.profile?.rotation || 0}deg)`,
              textShadow: getElementShadow(elements.profile?.hasShadow ?? preset.elements.profile.hasShadow, elements.profile?.shadowColor ?? preset.elements.profile.shadowColor)
            }}
          >
            🏷️ {design.targetProfile || activeProfileObj?.profileName || "باقة VIP"}
          </div>
        )}

        {/* 8. Data Limit */}
        {elements.dataLimit?.show !== false && (
          <div
            onMouseDown={(e) => handleDragStart("dataLimit", e)}
            onTouchStart={(e) => handleDragStart("dataLimit", e)}
            onClick={() => setActiveElement("dataLimit")}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing px-2 py-0.5 rounded font-bold transition-shadow whitespace-nowrap ${
              activeElement === "dataLimit"
                ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 bg-amber-400/10 z-30"
                : "hover:ring-1 hover:ring-indigo-400/60 z-10"
            }`}
            style={{
              left: `${coords.dataLimit?.x ?? 72}%`,
              top: `${coords.dataLimit?.y ?? 88}%`,
              color: elements.dataLimit?.color || preset.elements.dataLimit.color,
              fontSize: `${elements.dataLimit?.fontSize || preset.elements.dataLimit.fontSize || 10}px`,
              fontFamily: fontMap[elements.dataLimit?.fontFamily || design.fontFamily || preset.fontFamily],
              fontWeight: (elements.dataLimit?.fontWeight || preset.elements.dataLimit.fontWeight || "bold") as any,
              letterSpacing: `${elements.dataLimit?.letterSpacing ?? preset.elements.dataLimit.letterSpacing ?? 0}px`,
              transform: `translate(-50%, -50%) rotate(${elements.dataLimit?.rotation || 0}deg)`,
              textShadow: getElementShadow(elements.dataLimit?.hasShadow ?? preset.elements.dataLimit.hasShadow, elements.dataLimit?.shadowColor ?? preset.elements.dataLimit.shadowColor)
            }}
          >
            📊 {design.dataLimit || "5 GB"}
          </div>
        )}
      </div>

      {/* Interactive Element Control Panel & Nudge Toolbar */}
      {activeElement && (
        <div className="bg-slate-950 p-3 rounded-xl border border-indigo-500/40 space-y-2.5 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>التحكم المباشر بالعنصر المحدد: {activeElementLabels[activeElement] || activeElement}</span>
            </span>

            {/* Position Nudge Arrows */}
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-400 ml-1 font-bold">تحريك دقيق:</span>
              <button
                type="button"
                onClick={() => nudgeActiveElement(-1, 0)}
                className="p-1 hover:bg-indigo-600 rounded text-white cursor-pointer"
                title="يسار"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => nudgeActiveElement(1, 0)}
                className="p-1 hover:bg-indigo-600 rounded text-white cursor-pointer"
                title="يمين"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => nudgeActiveElement(0, -1)}
                className="p-1 hover:bg-indigo-600 rounded text-white cursor-pointer"
                title="أعلى"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => nudgeActiveElement(0, 1)}
                className="p-1 hover:bg-indigo-600 rounded text-white cursor-pointer"
                title="أسفل"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {/* Direct Value Editor for text elements */}
            {activeElement === "network" && (
              <div className="col-span-1 sm:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-bold text-slate-400">تعديل اسم الشبكة مباشرة:</label>
                  <button
                    type="button"
                    onClick={() => {
                      const willShow = design.showNetworkName === false;
                      setDesign(prev => ({
                        ...prev,
                        showNetworkName: willShow,
                        elements: {
                          ...prev.elements,
                          network: {
                            ...prev.elements.network,
                            show: willShow
                          }
                        }
                      }));
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-1 cursor-pointer transition-all ${
                      design.showNetworkName !== false
                        ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700"
                        : "bg-rose-950/80 text-rose-300 border border-rose-700"
                    }`}
                  >
                    {design.showNetworkName !== false ? <Eye className="w-3 h-3 text-emerald-400" /> : <EyeOff className="w-3 h-3 text-rose-400" />}
                    <span>{design.showNetworkName !== false ? "الاسم معروض" : "الاسم مخفي من الطباعة"}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={design.networkName}
                  onChange={e => setDesign(prev => ({ ...prev, networkName: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-xs font-bold text-white outline-none focus:border-amber-400"
                  placeholder="اسم الشبكة المطبوع..."
                />
              </div>
            )}

            {activeElement === "time" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1">تعديل الصلاحية والوقت:</label>
                <input
                  type="text"
                  value={design.timeLimit || ""}
                  onChange={e => setDesign(prev => ({ ...prev, timeLimit: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-xs font-bold text-white outline-none focus:border-amber-400"
                  placeholder="مثال: 30 يوم ، 24 ساعة"
                />
              </div>
            )}

            {activeElement === "dataLimit" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1">تعديل سعة البيانات:</label>
                <input
                  type="text"
                  value={design.dataLimit || ""}
                  onChange={e => setDesign(prev => ({ ...prev, dataLimit: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-xs font-bold text-white outline-none focus:border-amber-400"
                  placeholder="مثال: 5 GB ، مفتوح"
                />
              </div>
            )}

            {activeElement === "price" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1">السعر والعملة:</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={design.price !== undefined ? design.price : 500}
                    onChange={e => setDesign(prev => ({ ...prev, price: parseInt(e.target.value, 10) || 0 }))}
                    className="w-1/2 bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-xs font-bold text-amber-300 outline-none"
                  />
                  <input
                    type="text"
                    value={design.currencySymbol || "ريال"}
                    onChange={e => setDesign(prev => ({ ...prev, currencySymbol: e.target.value }))}
                    className="w-1/2 bg-slate-900 border border-slate-700 p-1.5 rounded-lg text-xs font-bold text-slate-200 outline-none"
                  />
                </div>
              </div>
            )}

            {activeElement === "qr" && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 mb-1">حجم كود QR (تكبير / تصغير):</label>
                <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700 w-fit">
                  <button
                    type="button"
                    onClick={() => {
                      const newSize = Math.max(12, (design.qrSize || 46) - 4);
                      setDesign(prev => ({ ...prev, qrSize: newSize }));
                    }}
                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
                    title="تصغير كود QR"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="font-mono font-bold text-white px-3 text-xs">
                    {design.qrSize || 46}px
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const newSize = Math.min(150, (design.qrSize || 46) + 4);
                      setDesign(prev => ({ ...prev, qrSize: newSize }));
                    }}
                    className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
                    title="تكبير كود QR"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Font Color & Size */}
            {activeElementConfig && (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">اللون</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={activeElementConfig.color || "#ffffff"}
                      onChange={e => {
                        const val = e.target.value;
                        setDesign(prev => ({
                          ...prev,
                          elements: {
                            ...prev.elements,
                            [activeElement]: {
                              ...(prev.elements[activeElement as keyof typeof prev.elements] || {}),
                              color: val
                            }
                          }
                        }));
                      }}
                      className="w-7 h-7 rounded border border-slate-700 cursor-pointer p-0 shrink-0"
                    />
                    <input
                      type="text"
                      value={activeElementConfig.color || "#ffffff"}
                      onChange={e => {
                        const val = e.target.value;
                        setDesign(prev => ({
                          ...prev,
                          elements: {
                            ...prev.elements,
                            [activeElement]: {
                              ...(prev.elements[activeElement as keyof typeof prev.elements] || {}),
                              color: val
                            }
                          }
                        }));
                      }}
                      className="w-full bg-slate-900 border border-slate-800 p-1 rounded text-[10px] font-mono text-white text-center"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1">حجم الخط</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        const newSize = Math.max(8, (activeElementConfig.fontSize || 12) - 1);
                        setDesign(prev => ({
                          ...prev,
                          elements: {
                            ...prev.elements,
                            [activeElement]: {
                              ...(prev.elements[activeElement as keyof typeof prev.elements] || {}),
                              fontSize: newSize
                            }
                          }
                        }));
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-mono font-bold text-white px-2 text-xs">
                      {activeElementConfig.fontSize || 12}px
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const newSize = Math.min(72, (activeElementConfig.fontSize || 12) + 1);
                        setDesign(prev => ({
                          ...prev,
                          elements: {
                            ...prev.elements,
                            [activeElement]: {
                              ...(prev.elements[activeElement as keyof typeof prev.elements] || {}),
                              fontSize: newSize
                            }
                          }
                        }));
                      }}
                      className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Position Display */}
            <div className="flex items-center justify-end gap-3 text-[11px] font-mono text-slate-400 self-center">
              <span>X: <strong className="text-amber-400">{coords[activeElement]?.x}%</strong></span>
              <span>Y: <strong className="text-amber-400">{coords[activeElement]?.y}%</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

