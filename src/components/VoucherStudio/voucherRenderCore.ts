// voucher/voucherRenderCore.ts — المصدر الوحيد لرسم وعرض وحساب الكروت في المعاينة والطباعة والـ PDF والـ HTML

import type { VoucherDesignState, ThemePreset, VoucherLogo } from './types';
import { THEME_PRESETS, DECORATION_DEFS, THEME_ANIMATIONS } from './themePresets';
import { getDefaultCoords, CoordsMap } from './smartCoords';

export interface RenderContext {
  design: VoucherDesignState;
  preset: ThemePreset;
  fontScale: number;
  qrSize: number;
}

export const FONT_STACK_MAP: Record<string, string> = Object.freeze({
  Tajawal: "'Tajawal','Segoe UI',Tahoma,'Noto Sans Arabic',sans-serif",
  Cairo: "'Cairo','Segoe UI',Tahoma,'Noto Sans Arabic',sans-serif",
  Amiri: "'Amiri','Traditional Arabic','Geeza Pro',serif",
  Almarai: "'Almarai','Segoe UI',Tahoma,sans-serif",
  'JetBrains Mono': "'JetBrains Mono','Courier New',Consolas,monospace",
  monospace: "'Courier New',Consolas,monospace",
});

export function resolveFontStack(name?: string): string {
  if (!name) return FONT_STACK_MAP.Tajawal;
  return FONT_STACK_MAP[name] || FONT_STACK_MAP.Tajawal;
}

export function buildContext(design: VoucherDesignState, fontScale: number, qrSize?: number): RenderContext {
  const presetKey = design.theme || 'modern';
  const preset = THEME_PRESETS[presetKey] || THEME_PRESETS.modern;
  return {
    design,
    preset,
    fontScale: Math.max(0.15, fontScale),
    qrSize: qrSize ?? design.qrSize ?? 36,
  };
}

export function computeCoords(design: VoucherDesignState, preset: ThemePreset): CoordsMap {
  const def = getDefaultCoords();
  const pc = preset.coords;
  return {
    network: design.coords?.network ?? pc?.network ?? def.network,
    profile: design.coords?.profile ?? pc?.profile ?? def.profile,
    price: design.coords?.price ?? pc?.price ?? def.price,
    user: design.coords?.user ?? pc?.user ?? def.user,
    password: design.coords?.password ?? pc?.password ?? def.password,
    qr: design.coords?.qr ?? pc?.qr ?? def.qr,
    time: design.coords?.time ?? pc?.time ?? def.time,
    dataLimit: design.coords?.dataLimit ?? pc?.dataLimit ?? def.dataLimit,
  };
}

export function computeElementStyle(
  elKey: keyof VoucherDesignState['elements'],
  ctx: RenderContext
): Record<string, any> {
  const u = (ctx.design.elements as any)?.[elKey] || {};
  const p = (ctx.preset.elements as any)?.[elKey] || {};
  const s = ctx.fontScale;

  return {
    color: u.color || p.color || ctx.design.cardTextColor || ctx.preset.cardTextColor,
    fontSize: Math.max(4, Math.round((u.fontSize || p.fontSize || 12) * s)),
    fontWeight: u.fontWeight || p.fontWeight || 'bold',
    fontFamily: resolveFontStack(u.fontFamily || p.fontFamily || ctx.design.fontFamily),
    letterSpacing: `${((u.letterSpacing ?? p.letterSpacing ?? 0) * s).toFixed(2)}px`,
    rotation: u.rotation || 0,
    textShadow: (u.hasShadow ?? p.hasShadow)
      ? `0 2px 4px ${u.shadowColor || p.shadowColor || 'rgba(0,0,0,0.5)'}`
      : 'none',
    show: u.show !== false,
  };
}

export function computeBoxStyle(
  style: 'box' | 'underline' | 'pill' | 'none' | string,
  bg: string,
  border: string,
  s: number
): Record<string, string | number> {
  const pv = Math.max(1, Math.round(2 * s));
  const ph = Math.max(2, Math.round(6 * s));
  switch (style) {
    case 'underline':
      return {
        background: 'transparent',
        border: 'none',
        borderBottom: `2px solid ${border}`,
        borderRadius: 0,
        padding: `1px ${ph}px 2px`,
      };
    case 'pill':
      return {
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: '999px',
        padding: `${pv}px ${Math.max(4, Math.round(10 * s))}px`,
      };
    case 'none':
      return {
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        padding: '1px 2px',
      };
    default:
      return {
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: `${Math.max(1, Math.round(4 * s))}px`,
        padding: `${pv}px ${ph}px`,
      };
  }
}

export function computeCardStyle(ctx: RenderContext): Record<string, string | number> {
  const { design, preset, fontScale } = ctx;
  const rBase = design.cardRadiusMm ?? preset.cardRadius;
  const r = rBase === 0 ? 0 : Math.max(1, Math.round(rBase * fontScale));
  const bw = Math.max(1, Math.round((preset.cardBorderWidth || 1) * fontScale));
  let border = 'none';
  if (preset.cardBorderStyle === 'double') {
    border = `${Math.max(2, bw * 3)}px double ${design.borderColor || preset.borderColor}`;
  } else if (preset.cardBorderStyle && preset.cardBorderStyle !== 'none') {
    border = `${bw}px ${preset.cardBorderStyle} ${design.borderColor || preset.borderColor}`;
  }
  return {
    background: preset.cardBgGradient || design.bgColor || preset.bgColor,
    color: design.cardTextColor || preset.cardTextColor,
    border,
    borderRadius: `${r}px`,
    boxShadow: preset.cardShadow || 'none',
    fontFamily: resolveFontStack(design.fontFamily || preset.fontFamily),
  };
}

export function computeQrSize(ctx: RenderContext): number {
  return Math.max(12, Math.round(ctx.qrSize * ctx.fontScale));
}

export function computePriceStyle(preset: ThemePreset, s: number): Record<string, string | number> {
  if (preset.priceStyle === 'badge') {
    return {
      background: preset.primaryColor,
      color: '#ffffff',
      padding: `${Math.max(1, Math.round(2 * s))}px ${Math.max(3, Math.round(8 * s))}px`,
      borderRadius: '999px',
      fontWeight: 800,
    };
  }
  if (preset.priceStyle === 'highlight') {
    return {
      background: 'rgba(255,255,255,0.1)',
      padding: `${Math.max(1, Math.round(1 * s))}px ${Math.max(2, Math.round(6 * s))}px`,
      borderRadius: '4px',
      border: `1px solid ${preset.primaryColor}`,
    };
  }
  if (preset.priceStyle === 'strikethrough') {
    return {
      textDecoration: 'line-through',
      textDecorationColor: preset.primaryColor,
      textDecorationThickness: `${Math.max(1, Math.round(2 * s))}px`,
    };
  }
  return {};
}

export function computeElementZIndex(elKey: string, design: VoucherDesignState, baseZ = 10): number {
  const defs: Record<string, number> = {
    card: 0,
    network: 5,
    profile: 5,
    price: 5,
    time: 5,
    dataLimit: 5,
    user: 20,
    password: 20,
    qr: 15,
  };
  return (design.elements as any)?.[elKey]?.zIndex ?? (defs[elKey] ?? 0) + baseZ;
}

export function renderDecorations(
  preset: ThemePreset,
  scale: number
): Array<{ style: React.CSSProperties; svg?: string }> {
  return (preset.decorations || [])
    .map((id) => DECORATION_DEFS[id]?.render(scale))
    .filter(Boolean) as Array<{ style: React.CSSProperties; svg?: string }>;
}

export function renderLogos(
  design: VoucherDesignState,
  scale: number
): Array<{ id: string; src: string; style: React.CSSProperties }> {
  if (!design.logos?.length) return [];
  return design.logos
    .filter((l) => l.visible !== false)
    .map((l) => ({
      id: l.id,
      src: l.dataUrl,
      style: {
        position: 'absolute',
        left: `${l.x}%`,
        top: `${l.y}%`,
        width: `${Math.max(8, Math.round(l.size * scale))}px`,
        height: 'auto',
        transform: `translate(-50%,-50%) rotate(${l.rotation || 0}deg)`,
        opacity: l.opacity ?? 1,
        zIndex: l.zIndex ?? 5,
        pointerEvents: 'none',
      },
    }));
}

export function getAnimationForElement(
  preset: ThemePreset,
  elKey: string
): { animation: string; delay: string } | null {
  const anim = (THEME_ANIMATIONS as Record<string, any>)[preset.animation];
  return anim?.targets?.[elKey] || null;
}
