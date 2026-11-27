// ============================================================
// Generic Handler - إصلاح 4: محاولة POST لتغيير SSID
// ============================================================

import { httpRequest, parseJson, extractFromHtml, extractCookie, buildUrl } from '../httpUtil.ts';
import { logger } from '../logger.ts';
import type {
  VendorHandler,
  VendorResult,
  VendorConnectConfig,
  VendorSession,
  SsidChangeRequest,
  VendorWriteResult
} from './types.ts';

const PROBE_ENDPOINTS = [
  { path: '/api/system', type: 'json' },
  { path: '/api/device', type: 'json' },
  { path: '/api/wireless', type: 'json' },
  { path: '/api/status', type: 'json' },
  { path: '/cgi-bin/status.cgi', type: 'json' },
  { path: '/status.cgi', type: 'json' },
  { path: '/api/system/info', type: 'json' },
  { path: '/info.json', type: 'json' },
  { path: '/status.json', type: 'json' },
  { path: '/', type: 'html' }
];

const SSID_PATTERNS = [
  /ssid["'\s:=]+["']([^"'\s<]{1,32})["']/i,
  /"ssid"\s*:\s*"([^"]{1,32})"/i,
  /wireless[_\s-]*ssid["'\s:=]+["']([^"'\s<]{1,32})["']/i,
  /network[_\s-]*name["'\s:=]+["']([^"'\s<]{1,32})["']/i
];

function deepSsid(obj: any, d = 0): string {
  if (d > 5 || !obj || typeof obj !== 'object') return '';
  if (typeof obj.ssid === 'string' && obj.ssid.length >= 1 && obj.ssid.length <= 32) return obj.ssid;
  if (typeof obj.essid === 'string' && obj.essid.length >= 1 && obj.essid.length <= 32) return obj.essid;
  if (typeof obj.wifi_name === 'string' && obj.wifi_name.length >= 1 && obj.wifi_name.length <= 32) return obj.wifi_name;
  for (const v of Object.values(obj)) {
    if (typeof v === 'object' && v) {
      const f = deepSsid(v, d + 1);
      if (f) return f;
    }
    if (Array.isArray(v)) {
      for (const i of v) {
        if (typeof i === 'object' && i) {
          const f = deepSsid(i, d + 1);
          if (f) return f;
        }
      }
    }
  }
  return '';
}

export const genericHandler: VendorHandler = {
  vendorName: 'Generic',
  vendorPatterns: [],
  macOuiPrefixes: [],

  async fetchInfo(cfg: VendorConnectConfig): Promise<VendorResult> {
    const base = buildUrl(`${cfg.useHttps ? 'https' : 'http'}://${cfg.ip}:${cfg.port}`);
    const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
    const result: VendorResult = { success: false };

    for (const ep of PROBE_ENDPOINTS) {
      try {
        const res = await httpRequest(`${base.origin}${ep.path}`, {
          headers: {
            'Authorization': auth,
            'Accept': ep.type === 'json' ? 'application/json' : 'text/html'
          },
          timeoutMs: Math.min(cfg.timeoutMs || 8000, 3000),
          followRedirects: false
        });

        if (res.status === 401 || res.status === 403) {
          return { success: false, error: 'فشل المصادقة', requiresAuth: true };
        }
        if (res.status !== 200) continue;

        const cookie = extractCookie(res.headers['set-cookie']);

        if (ep.type === 'json') {
          const d = parseJson(res.body);
          if (d) {
            const s = deepSsid(d);
            if (s) {
              result.ssid = s;
              result._session = { cookie, expiresAt: Date.now() + 1800000 };
              result.success = true;
              break;
            }
          }
        }

        if (ep.type === 'html') {
          for (const p of SSID_PATTERNS) {
            const s = extractFromHtml(res.body, p);
            if (s && s.length >= 1 && s.length <= 32) {
              result.ssid = s;
              result._session = { cookie, expiresAt: Date.now() + 1800000 };
              result.success = true;
              break;
            }
          }
          if (result.success) {
            const m = res.body.match(/model["'\s:=]+["']([^"'\s<]+)["']/i);
            if (m) result.model = m[1];
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!result.success && !result.error) {
      result.error = 'لم يُعثر على SSID عبر الاستكشاف العام';
    }
    return result;
  },

  // إصلاح 4: محاولة POST عامة قبل الاستسلام
  async setSsid(
    cfg: VendorConnectConfig,
    session: VendorSession | undefined,
    req: SsidChangeRequest
  ): Promise<VendorWriteResult> {
    const base = buildUrl(`${cfg.useHttps ? 'https' : 'http'}://${cfg.ip}:${cfg.port}`);
    const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
    const cookie = session?.cookie || '';
    const ssid = req.ssid || req.ssid2g || req.ssid5g;
    if (!ssid) return { success: false, message: 'لا يوجد SSID محدد' };

    // محاولة 1: POST لـ /cgi-bin/setwireless.cgi
    try {
      const params = new URLSearchParams({
        ssid,
        hide_ssid: req.hideSsid ? '1' : '0'
      });
      const res = await httpRequest(`${base.origin}/cgi-bin/setwireless.cgi?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': auth,
          'Cookie': cookie,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeoutMs: cfg.timeoutMs
      });
      if (res.status === 200 || res.status === 302) {
        return { success: true, message: 'تم إرسال أمر تغيير SSID (CGI)' };
      }
    } catch (err: any) {
      logger.warn('GenericAP', 'فشل محاولة تغيير SSID عبر CGI', err?.message);
    }

    // محاولة 2: POST JSON عام
    try {
      const res = await httpRequest(`${base.origin}/api/wireless`, {
        method: 'POST',
        body: JSON.stringify({ operation: 'write', ssid, hide_ssid: req.hideSsid ? true : false }),
        headers: {
          'Authorization': auth,
          'Cookie': cookie,
          'Content-Type': 'application/json'
        },
        timeoutMs: cfg.timeoutMs
      });
      if (res.status === 200) {
        const d = parseJson(res.body);
        if (d?.success || d?.error_code === 0) {
          return { success: true, message: 'تم تغيير SSID (JSON API)' };
        }
      }
    } catch (err: any) {
      logger.warn('GenericAP', 'فشل محاولة تغيير SSID عبر JSON API', err?.message);
    }

    return { success: false, message: 'تعذر تغيير SSID تلقائياً - استخدم لوحة التحكم اليدوية للجهاز' };
  },

  async reboot(): Promise<VendorWriteResult> {
    return { success: false, message: 'إعادة التشغيل غير مدعومة تلقائياً - استخدم لوحة تحكم الجهاز' };
  }
};
