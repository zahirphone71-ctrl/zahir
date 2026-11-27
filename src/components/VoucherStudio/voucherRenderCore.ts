// voucher/voucherRenderCore.ts — المصدر الوحيد لرسم وعرض وحساب الكروت في المعاينة والطباعة والـ PDF والـ HTML

import type { VoucherDesignState, ThemePreset } from './types';
import { THEME_PRESETS, DECORATION_DEFS, THEME_ANIMATIONS } from './themePresets';
import { getDefaultCoords, CoordsMap } from './smartCoords';
import { getPaperSpec, type PaperSpec } from './gridCalculator';

export { getPaperSpec, type PaperSpec };

export interface RenderContext {
  design: VoucherDesignState;
  preset: ThemePreset;
  fontScale: number;
  qrSize: number;
}

export const FONT_STACK_MAP: Record<string, string> = Object.freeze({
  Tajawal: "'Tajawal','Segoe UI',Tahoma,'Noto Sans Arabic',Arial,sans-serif",
  Cairo: "'Cairo','Segoe UI',Tahoma,'Noto Sans Arabic',Arial,sans-serif",
  Amiri: "'Amiri','Traditional Arabic','Geeza Pro',Georgia,serif",
  Almarai: "'Almarai','Segoe UI',Tahoma,'Noto Sans Arabic',Arial,sans-serif",
  'JetBrains Mono': "'JetBrains Mono','Cascadia Code','Courier New',Consolas,monospace",
  monospace: "'Courier New',Consolas,monospace",
});

/**
 * 6pt (at 96dpi) = 8px for secondary metadata; 6.75pt–7.5pt (9–10px) for primary card credentials/title.
 */
export const MIN_SECONDARY_FONT_PX = 8; // 6pt equivalent at 96dpi
export const MIN_PRIMARY_FONT_PX = 10; // 7.5pt equivalent at 96dpi

/** Inline crisp vector SVGs to avoid emoji tofu/inconsistency in print & PDF */
export const CARD_ICON_SVGS = Object.freeze({
  profile:
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.15em;margin-left:2px;flex-shrink:0;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  time:
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.15em;margin-left:2px;flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  dataLimit:
    '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.15em;margin-left:2px;flex-shrink:0;"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
});

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export function sanitizeImageSrc(src?: string): string {
  if (!src || typeof src !== 'string') return '';
  const trimmed = src.trim();
  if (!trimmed) return '';
  // Disallow quotes, CSS breaking chars, newlines, or script protocols
  if (/[\r\n"'()\\]/.test(trimmed)) return '';
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^https?:\/\/[^\s<>"'`]+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^\/[A-Za-z0-9_.\-/]+$/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

export function sanitizeSvgMarkup(svg?: string): string {
  if (!svg || typeof svg !== 'string') return '';
  const trimmed = svg.trim();
  if (!trimmed.toLowerCase().includes('<svg')) return '';
  return trimmed
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

const UNITLESS_CSS_PROPS = new Set([
  'opacity',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'flex',
  'flexGrow',
  'flexShrink',
]);

export function styleObjToCss(style: Record<string, string | number | undefined>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const kebab = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      const valStr =
        typeof v === 'number' && v !== 0 && !UNITLESS_CSS_PROPS.has(k) ? `${v}px` : String(v);
      const safeVal = valStr.replace(/[<>]/g, '');
      return `${kebab}:${safeVal}`;
    })
    .join(';');
}

export function resolveFontStack(name?: string): string {
  if (!name) return FONT_STACK_MAP.Tajawal;
  if (FONT_STACK_MAP[name]) return FONT_STACK_MAP[name];
  // Allow already-resolved stacks returned by computeElementStyle
  if (name.includes(',') && name.includes("'")) return name;
  return FONT_STACK_MAP.Tajawal;
}

export function buildContext(design: VoucherDesignState, fontScale: number, qrSize?: number): RenderContext {
  const presetKey = design.theme || 'modern';
  const preset = THEME_PRESETS[presetKey] || THEME_PRESETS.modern;
  return {
    design,
    preset,
    fontScale: Math.max(0.25, fontScale),
    qrSize: qrSize ?? design.qrSize ?? preset.qrSize ?? 36,
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
    customText1: design.coords?.customText1 ?? pc?.customText1,
    customText2: design.coords?.customText2 ?? pc?.customText2,
    logo: design.coords?.logo ?? pc?.logo,
  };
}

export interface ComputedElementStyle {
  color: string;
  fontSize: number;
  fontWeight: string;
  fontFamily: string;
  letterSpacing: number;
  rotation: number;
  textShadow: string;
  show: boolean;
}

export function computeElementStyle(
  elKey: keyof VoucherDesignState['elements'],
  ctx: RenderContext
): ComputedElementStyle {
  const u = (ctx.design.elements as any)?.[elKey] || {};
  const p = (ctx.preset.elements as any)?.[elKey] || {};
  const s = ctx.fontScale;

  const isPrimary = elKey === 'user';
  const isImportant = elKey === 'network' || elKey === 'price' || elKey === 'password';
  const minFontPx = isPrimary ? MIN_PRIMARY_FONT_PX : isImportant ? 9 : MIN_SECONDARY_FONT_PX;

  return {
    color: u.color || p.color || ctx.design.cardTextColor || ctx.preset.cardTextColor,
    fontSize: Math.max(minFontPx, Math.round((u.fontSize || p.fontSize || 12) * s)),
    fontWeight: String(u.fontWeight || p.fontWeight || 'bold'),
    fontFamily: resolveFontStack(u.fontFamily || p.fontFamily || ctx.design.fontFamily),
    letterSpacing: Number(((u.letterSpacing ?? p.letterSpacing ?? 0) * s).toFixed(2)),
    rotation: Number(u.rotation || 0),
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

  // Respect explicit user bgColor customization when it diverges from theme preset bgColor
  const hasCustomBgColor = Boolean(
    design.bgColor &&
      preset.bgColor &&
      design.bgColor.trim().toLowerCase() !== preset.bgColor.trim().toLowerCase()
  );
  const background = hasCustomBgColor
    ? design.bgColor
    : preset.cardBgGradient || design.bgColor || preset.bgColor;

  return {
    background,
    color: design.cardTextColor || preset.cardTextColor,
    border,
    borderRadius: `${r}px`,
    boxShadow: preset.cardShadow || 'none',
    fontFamily: resolveFontStack(design.fontFamily || preset.fontFamily),
  };
}

export function computeQrSize(ctx: RenderContext): number {
  return Math.max(14, Math.round(ctx.qrSize * ctx.fontScale));
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
): Array<{ style: Record<string, any>; svg?: string }> {
  return (preset.decorations || [])
    .map((id) => DECORATION_DEFS[id]?.render(scale))
    .filter(Boolean) as Array<{ style: Record<string, any>; svg?: string }>;
}

export function renderLogos(
  design: VoucherDesignState,
  scale: number
): Array<{ id: string; src: string; style: Record<string, any> }> {
  if (!design.logos?.length) return [];
  return design.logos
    .filter((l) => l.visible !== false)
    .map((l) => {
      const safeSrc = sanitizeImageSrc(l.dataUrl);
      if (!safeSrc) return null;
      return {
        id: l.id,
        src: safeSrc,
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
      };
    })
    .filter(Boolean) as Array<{ id: string; src: string; style: Record<string, any> }>;
}

export function getAnimationForElement(
  preset: ThemePreset,
  elKey: string
): { animation: string; delay: string } | null {
  const anim = (THEME_ANIMATIONS as Record<string, any>)[preset.animation];
  return anim?.targets?.[elKey] || null;
}
