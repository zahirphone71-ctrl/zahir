// ============================================================
// TP-Link (Omada, Pharos CPE, Archer, WA) Handler
// ============================================================

import { httpRequest, parseJson, extractFromHtml, extractCookie } from '../httpUtil.ts';
import { logger } from '../logger.ts';
import type {
  VendorHandler,
  VendorResult,
  VendorConnectConfig,
  VendorSession,
  SsidChangeRequest,
  VendorWriteResult,
  ApClientInfo
} from './types.ts';

export const tplinkHandler: VendorHandler = {
  vendorName: 'TP-Link',
  vendorPatterns: ['tp-link', 'tplink', 'omada', 'pharos', 'cpe210', 'cpe510', 'cpe610', 'eap225', 'eap245', 'eap610'],
  macOuiPrefixes: [
    '000A3A', '14CC20', '18D6C7', '1C3BF3', '20DC2E', '30DE4B', '3C46D8', '446E2E',
    '503EAA', '50D4F7', '54AF97', '54E6FC', '60A44C', '60E327', '6C5AB0', '704F57',
    '7405A5', '74EA3A', '8416F9', '84D81B', '90F652', '984827', '98DA42', 'A0F3C1',
    'AC84C6', 'B0487A', 'B09575', 'B0BE76', 'C025E9', 'C46E1F', 'C83A35', 'D46E0E',
    'D807B6', 'D84732', 'E4C32A', 'EC086B', 'F4EC38', 'F4F26D'
  ],

  async fetchInfo(cfg: VendorConnectConfig): Promise<VendorResult> {
    const proto = cfg.useHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${cfg.ip}:${cfg.port}`;
    logger.info('TPLink', `جلب بيانات جهاز تي بي لينك من ${baseUrl}`);

    // Method 1: Pharos / CPE Web Interface
    try {
      const loginParams = new URLSearchParams({
        username: cfg.username,
        password: cfg.password
      });

      const loginRes = await httpRequest(`${baseUrl}/login.cgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: loginParams.toString(),
        timeoutMs: cfg.timeoutMs || 8000
      });

      const cookie = extractCookie(loginRes.headers['set-cookie']);

      // Status page
      const statusRes = await httpRequest(`${baseUrl}/status.cgi`, {
        headers: { 'Cookie': cookie },
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (statusRes.status === 200) {
        const json = parseJson(statusRes.body);
        if (json) {
          return {
            success: true,
            ssid: json.ssid || json.wireless_ssid || '',
            band: json.band || (json.frequency > 4000 ? '5GHz' : '2.4GHz'),
            channel: json.channel ? String(json.channel) : undefined,
            model: json.model || json.device_model || 'TP-Link AP',
            firmwareVersion: json.firmware || json.fw_ver,
            uptime: json.uptime,
            clientsCount: Array.isArray(json.stations) ? json.stations.length : undefined,
            _session: { cookie, expiresAt: Date.now() + 30 * 60 * 1000 }
          };
        }

        const ssidMatch = extractFromHtml(statusRes.body, /var\s+ssid\s*=\s*"([^"]+)"/i);
        if (ssidMatch) {
          return {
            success: true,
            ssid: ssidMatch,
            model: extractFromHtml(statusRes.body, /var\s+model\s*=\s*"([^"]+)"/i) || 'TP-Link CPE',
            _session: { cookie, expiresAt: Date.now() + 30 * 60 * 1000 }
          };
        }
      }
    } catch (e: any) {
      logger.debug('TPLink', `فشل مسار Pharos: ${e.message}`);
    }

    // Method 2: Omada Standalone EAP HTTP API
    try {
      const omadaLogin = await httpRequest(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cfg.username,
          password: cfg.password
        }),
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (omadaLogin.status === 200) {
        const data = parseJson(omadaLogin.body);
        const token = data?.result?.token || data?.token;
        const cookie = extractCookie(omadaLogin.headers['set-cookie']);

        const statusRes = await httpRequest(`${baseUrl}/api/status`, {
          headers: {
            'Cookie': cookie,
            'Token': token || ''
          },
          timeoutMs: cfg.timeoutMs || 8000
        });

        if (statusRes.status === 200) {
          const sData = parseJson(statusRes.body);
          const res = sData?.result || sData;
          return {
            success: true,
            ssid: res.ssid2g || res.ssid5g || res.ssid || '',
            ssid2g: res.ssid2g,
            ssid5g: res.ssid5g,
            isDualBand: !!(res.ssid2g && res.ssid5g),
            model: res.model || 'Omada EAP',
            firmwareVersion: res.firmwareVersion,
            clientsCount: res.clientNum || 0,
            uptime: res.uptime,
            _session: {
              cookie,
              token,
              expiresAt: Date.now() + 30 * 60 * 1000
            }
          };
        }
      }
    } catch (e: any) {
      logger.debug('TPLink', `فشل مسار Omada: ${e.message}`);
    }

    return {
      success: false,
      error: 'تعذر جلب بيانات الأكسس بوينت (TP-Link) - يرجى التحقق من بيانات الدخول'
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
    const newSsid = request.ssid || request.ssid2g || request.ssid5g || '';

    try {
      const params = new URLSearchParams({
        ssid: newSsid,
        hide_ssid: request.hideSsid ? '1' : '0',
        action: 'save'
      });

      const res = await httpRequest(`${baseUrl}/cgi-bin/setwireless.cgi`, {
        method: 'POST',
        headers: {
          'Cookie': cookie,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        timeoutMs: cfg.timeoutMs || 10000
      });

      if (res.status === 200 || res.status === 302) {
        return {
          success: true,
          message: `تم تحديث اسم شبكة TP-Link إلى "${newSsid}" بنجاح`
        };
      }
    } catch (e: any) {
      logger.error('TPLink', `فشل تغيير SSID: ${e.message}`);
    }

    return {
      success: false,
      message: 'فشل تغيير اسم شبكة TP-Link'
    };
  },

  async reboot(cfg: VendorConnectConfig, session: VendorSession | undefined): Promise<VendorWriteResult> {
    const proto = cfg.useHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${cfg.ip}:${cfg.port}`;
    const cookie = session?.cookie || '';

    try {
      const res = await httpRequest(`${baseUrl}/cgi-bin/reboot.cgi`, {
        method: 'POST',
        headers: { 'Cookie': cookie },
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (res.status === 200 || res.status === 302) {
        return {
          success: true,
          message: 'تم إرسال أمر إعادة تشغيل جهاز TP-Link بنجاح'
        };
      }
    } catch (e: any) {
      logger.error('TPLink', `فشل إعادة التشغيل: ${e.message}`);
    }

    return {
      success: false,
      message: 'تعذر إعادة تشغيل جهاز TP-Link'
    };
  }
};
