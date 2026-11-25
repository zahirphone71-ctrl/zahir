// ============================================================
// Ubiquiti Networks (airMAX / UniFi / EdgeMAX) Handler
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

export const ubiquitiHandler: VendorHandler = {
  vendorName: 'Ubiquiti Networks',
  vendorPatterns: ['ubiquiti', 'unifi', 'airmax', 'nanostation', 'loco', 'rocket', 'powerbeam', 'litebeam', 'uap'],
  macOuiPrefixes: ['00156D', '002722', '0418D6', '18E829', '24A43C', '44D9E7', '687251', '70A741', '7483C2', '788A20', '802AA8', '94F665', 'A4C84E', 'AC8B03', 'B4FBE4', 'DC9FDB', 'E063DA', 'F09FC2', 'F492BF', 'FCECDA'],

  async fetchInfo(cfg: VendorConnectConfig): Promise<VendorResult> {
    const proto = cfg.useHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${cfg.ip}:${cfg.port}`;
    logger.info('Ubiquiti', `جلب بيانات جهاز يوبيكويتي من ${baseUrl}`);

    // Try airMAX airOS status.cgi
    try {
      const loginRes = await httpRequest(`${baseUrl}/login.cgi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          username: cfg.username,
          password: cfg.password
        }).toString(),
        timeoutMs: cfg.timeoutMs || 8000
      });

      const cookie = extractCookie(loginRes.headers['set-cookie']);
      const csrfToken = extractFromHtml(loginRes.body, /name="csrf_token"\s+value="([^"]+)"/i) || undefined;

      // Status query
      const statusRes = await httpRequest(`${baseUrl}/status.cgi`, {
        headers: {
          'Cookie': cookie,
          'Accept': 'application/json, text/javascript, */*'
        },
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (statusRes.status === 200) {
        const data = parseJson(statusRes.body);
        if (data && typeof data === 'object') {
          const wireless = data.wireless || {};
          const host = data.host || {};

          const clients: ApClientInfo[] = [];
          if (Array.isArray(data.sta)) {
            for (const s of data.sta) {
              clients.push({
                macAddress: s.mac || '',
                hostname: s.name || s.hostname || '',
                ipAddress: s.lastip || s.ip || '',
                signalStrength: s.signal ? `${s.signal} dBm` : undefined,
                signalQuality: s.ccq,
                txRate: s.tx,
                rxRate: s.rx,
                uptime: s.uptime ? `${Math.floor(s.uptime / 60)}m` : undefined
              });
            }
          }

          return {
            success: true,
            ssid: wireless.essid || wireless.ssid || '',
            band: wireless.frequency ? (wireless.frequency > 4000 ? '5GHz' : '2.4GHz') : undefined,
            channel: wireless.channel ? String(wireless.channel) : undefined,
            channelWidth: wireless.chanbw ? `${wireless.chanbw} MHz` : undefined,
            txPower: wireless.txpower ? `${wireless.txpower} dBm` : undefined,
            hideSsid: wireless.hide_essid === 1,
            securityType: wireless.security || 'WPA2-PSK',
            clients,
            clientsCount: clients.length || data.stations_count || 0,
            uptime: host.uptime ? `${Math.floor(host.uptime / 3600)}h ${Math.floor((host.uptime % 3600) / 60)}m` : undefined,
            cpuUsage: host.cpuload,
            memoryUsage: host.totalram && host.freeram ? Math.round(((host.totalram - host.freeram) / host.totalram) * 100) : undefined,
            firmwareVersion: host.fwversion || host.version,
            model: host.devmodel || host.hostname,
            _session: {
              cookie,
              csrfToken,
              expiresAt: Date.now() + 30 * 60 * 1000
            }
          };
        }
      }
    } catch (e: any) {
      logger.debug('Ubiquiti', `فشل مسار airOS الأساسي: ${e.message}`);
    }

    // Fallback: UniFi API endpoint
    try {
      const unifiLogin = await httpRequest(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cfg.username, password: cfg.password }),
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (unifiLogin.status === 200) {
        const cookie = extractCookie(unifiLogin.headers['set-cookie']);
        const devRes = await httpRequest(`${baseUrl}/api/s/default/stat/device`, {
          headers: { 'Cookie': cookie },
          timeoutMs: cfg.timeoutMs || 8000
        });

        if (devRes.status === 200) {
          const devData = parseJson(devRes.body);
          const dev = devData?.data?.[0];
          if (dev) {
            return {
              success: true,
              ssid: dev.vap_table?.[0]?.essid || dev.name || '',
              model: dev.model || 'UniFi AP',
              firmwareVersion: dev.version,
              uptime: dev.uptime ? `${Math.floor(dev.uptime / 3600)}h` : undefined,
              clientsCount: dev.num_sta || 0,
              _session: {
                cookie,
                expiresAt: Date.now() + 30 * 60 * 1000
              }
            };
          }
        }
      }
    } catch (e: any) {
      logger.debug('Ubiquiti', `فشل مسار UniFi: ${e.message}`);
    }

    return {
      success: false,
      error: 'تعذر جلب بيانات الأكسس بوينت (Ubiquiti) - يرجى التحقق من اسم المستخدم وكلمة المرور'
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
      // airOS set parameters
      const params = new URLSearchParams({
        'wireless.1.ssid': newSsid,
        'wireless.1.hide_ssid': request.hideSsid ? '1' : '0',
        'action': 'apply'
      });

      const res = await httpRequest(`${baseUrl}/set.cgi`, {
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
          message: `تم تحديث اسم الشبكة بنجاح إلى "${newSsid}" على جهاز Ubiquiti`
        };
      }
    } catch (e: any) {
      logger.error('Ubiquiti', `فشل تغيير SSID: ${e.message}`);
    }

    return {
      success: false,
      message: 'فشل تغيير اسم الشبكة على جهاز Ubiquiti'
    };
  },

  async reboot(cfg: VendorConnectConfig, session: VendorSession | undefined): Promise<VendorWriteResult> {
    const proto = cfg.useHttps ? 'https' : 'http';
    const baseUrl = `${proto}://${cfg.ip}:${cfg.port}`;
    const cookie = session?.cookie || '';

    try {
      const res = await httpRequest(`${baseUrl}/reboot.cgi`, {
        method: 'POST',
        headers: { 'Cookie': cookie },
        timeoutMs: cfg.timeoutMs || 8000
      });

      if (res.status === 200 || res.status === 302) {
        return {
          success: true,
          message: 'تم إرسال أمر إعادة تشغيل جهاز Ubiquiti بنجاح'
        };
      }
    } catch (e: any) {
      logger.error('Ubiquiti', `فشل إعادة التشغيل: ${e.message}`);
    }

    return {
      success: false,
      message: 'تعذر إرسال أمر إعادة التشغيل لجهاز Ubiquiti'
    };
  }
};
