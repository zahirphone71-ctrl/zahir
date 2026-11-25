import QRCode from 'qrcode';
import { VoucherItem } from './types';
import { buildAutoLoginQrUrl } from './qrUtils';
import { LRUCache } from '../../lib/lruCache';
import { processInChunks } from '../../lib/scheduler';

const QR_CACHE = new LRUCache<string, string>(500);

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

      const cacheKey = `${v.voucherCode}|${v.voucherPin || ''}|${loginUrl}|${authMode}|${qrSize}`;
      const cached = QR_CACHE.get(cacheKey);

      if (cached) {
        result.set(v.voucherCode, cached);
      } else {
        try {
          const url = buildAutoLoginQrUrl(loginUrl, v.voucherCode, v.voucherPin, authMode);
          const dataUrl = await QRCode.toDataURL(url, {
            width: qrSize,
            margin: 1,
            errorCorrectionLevel: 'L',
            color: { dark: '#000000', light: '#ffffff' },
          });
          QR_CACHE.set(cacheKey, dataUrl);
          result.set(v.voucherCode, dataUrl);
        } catch {
          result.set(v.voucherCode, generateFallbackImage(qrSize));
        }
      }
    },
    { budgetMs: 12, onProgress, signal }
  );

  return result;
}

function generateFallbackImage(size: number): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#94a3b8';
  ctx.font = `${Math.max(8, size / 6)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QR', size / 2, size / 2);
  const out = canvas.toDataURL('image/png');
  canvas.width = canvas.height = 1;
  return out;
}

export function clearQrCache(): void {
  QR_CACHE.clear();
}
