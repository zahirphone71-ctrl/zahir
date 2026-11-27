import QRCode from 'qrcode';
import { VoucherItem } from './types';
import { buildAutoLoginQrUrl } from './qrUtils';
import { LRUCache } from '../../lib/lruCache';
import { processInChunks } from '../../lib/scheduler';

const QR_CACHE = new LRUCache<string, string>(500);

/**
 * Generates crisp vector SVG QR codes (lightweight, print-sharp at any DPI, Node/Browser safe)
 */
export async function preGenerateQrCodes(
  vouchers: VoucherItem[],
  loginUrl: string,
  authMode: string,
  qrSize: number = 120,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  await processInChunks(
    vouchers,
    async (v) => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!v.voucherCode) return;

      const cacheKey = `svg|${v.voucherCode}|${v.voucherPin || ''}|${loginUrl}|${authMode}`;
      const cached = QR_CACHE.get(cacheKey);

      if (cached) {
        result.set(v.voucherCode, cached);
      } else {
        try {
          const url = buildAutoLoginQrUrl(loginUrl, v.voucherCode, v.voucherPin, authMode);
          const svg = await QRCode.toString(url, {
            type: 'svg',
            margin: 1,
            errorCorrectionLevel: 'M',
            color: { dark: '#000000', light: '#ffffff' },
          });
          QR_CACHE.set(cacheKey, svg);
          result.set(v.voucherCode, svg);
        } catch {
          result.set(v.voucherCode, generateFallbackSvg(qrSize));
        }
      }
    },
    { budgetMs: 12, onProgress, signal }
  );

  return result;
}

function generateFallbackSvg(size: number): string {
  const s = Math.max(16, Math.round(size || 36));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}"><rect width="100%" height="100%" fill="#ffffff"/><rect x="2" y="2" width="${s - 4}" height="${s - 4}" fill="none" stroke="#94a3b8" stroke-width="1"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="monospace" font-size="${Math.max(6, Math.round(s / 4))}">QR</text></svg>`;
}

export function clearQrCache(): void {
  QR_CACHE.clear();
}
