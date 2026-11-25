// ============================================================
// Ruijie Networks & Reyee (eWeb) Handler
// ============================================================

import { httpRequest, parseJson, extractCookie } from '../httpUtil.ts';
import { logger } from '../logger.ts';
import type {
  VendorHandler,
  VendorResult,
  VendorConnectConfig,
  VendorSession,
  SsidChangeRequest,
  VendorWriteResult
} from './types.ts';

export const ruijieHandler: VendorHandler = {
  vendorName: 'Ruijie Networks',
  vendorPatterns: ['ruijie', 'reyee', 'eweb', 'rg-rap', 'rg-est', 'rg-ap'],
  macOuiPrefixes: [
    '00D0F8', '047502', '14144B', '18828C', '286ED4', '300D43', '407A80',
    '44783E', '58696C', '605B85', '7408F6', '78D38D', '84248D', '883FC1',
    '942C97', '9C52F8', 'B48C9D', 'C81FE7', 'D4619D', 'DC0856', 'F01898'
  ],

  async fetchInfo(cfg: VendorConnectConfig): Promise<VendorResult> {
    const proto = cfg.useHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${cfg.ip}:${cfg.port}`;
    logger.info('Ruijie', `جلب بيانات جهاز رويجي/ريي من ${baseUrl}`);

    try {
      // Reyee eWeb JSON Login
      const loginRes = await httpRequest(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: cfg.username,
          password: cfg.password
        }),
        timeoutMs: cfg.timeoutMs || 8000
      });

      const cookie = extractCookie(loginRes.headers['set-cookie']);
      const loginData = parseJson(loginRes.body);
      const token = loginData?.data?.token || loginData?.token;

      // Wireless status
      const wifiRes = await httpRequest(`${baseUrl}/api/network/wifi`, {
        headers: {
          'Cookie': cookie,
          'Authorization': token ? `Bearer ${token}` : ''
        },
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (wifiRes.status === 200) {
        const wifiData = parseJson(wifiRes.body);
        const data = wifiData?.data || wifiData;
        return {
          success: true,
          ssid: data?.ssid || data?.wifiName || '',
          ssid2g: data?.ssid_2g,
          ssid5g: data?.ssid_5g,
          isDualBand: !!(data?.ssid_2g && data?.ssid_5g),
          model: data?.model || 'Ruijie Reyee AP',
          firmwareVersion: data?.version,
          clientsCount: data?.clientsCount,
          _session: {
            cookie,
            token,
            expiresAt: Date.now() + 30 * 60 * 1000
          }
        };
      }
    } catch (e: any) {
      logger.debug('Ruijie', `فشل مسار eWeb: ${e.message}`);
    }

    return {
      success: false,
      error: 'تعذر جلب بيانات الأكسس بوينت (Ruijie) - تحقق من بيانات الدخول'
    };
  },

  async setSsid(
    cfg: VendorConnectConfig,
    session: VendorSession | undefined,
    request: SsidChangeRequest
  ): Promise<VendorWriteResult> {
    const proto = cfg.useHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${cfg.ip}:${cfg.port}`;
    const cookie = session?.cookie || '';
    const token = session?.token || '';
    const newSsid = request.ssid || request.ssid2g || request.ssid5g || '';

    try {
      const res = await httpRequest(`${baseUrl}/api/network/wifi`, {
        method: 'POST',
        headers: {
          'Cookie': cookie,
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ssid: newSsid,
          hide_ssid: request.hideSsid ? 1 : 0
        }),
        timeoutMs: cfg.timeoutMs || 10000
      });

      if (res.status === 200) {
        return {
          success: true,
          message: `تم تحديث اسم شبكة Ruijie إلى "${newSsid}" بنجاح`
        };
      }
    } catch (e: any) {
      logger.error('Ruijie', `فشل تغيير SSID: ${e.message}`);
    }

    return {
      success: false,
      message: 'فشل تغيير اسم شبكة Ruijie'
    };
  },

  async reboot(cfg: VendorConnectConfig, session: VendorSession | undefined): Promise<VendorWriteResult> {
    const proto = cfg.useHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${cfg.ip}:${cfg.port}`;
    const cookie = session?.cookie || '';
    const token = session?.token || '';

    try {
      const res = await httpRequest(`${baseUrl}/api/system/reboot`, {
        method: 'POST',
        headers: {
          'Cookie': cookie,
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        },
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (res.status === 200) {
        return {
          success: true,
          message: 'تم إرسال أمر إعادة تشغيل جهاز Ruijie بنجاح'
        };
      }
    } catch (e: any) {
      logger.error('Ruijie', `فشل إعادة التشغيل: ${e.message}`);
    }

    return {
      success: false,
      message: 'تعذر إعادة تشغيل جهاز Ruijie'
    };
  }
};
