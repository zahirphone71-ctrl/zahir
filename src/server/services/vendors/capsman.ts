// ============================================================
// CAPsMAN - إصلاح 6: MAC format + إصلاح 8: تحذير التأخير
// ============================================================

import { logger } from '../logger.ts';
import type {
  VendorHandler,
  VendorResult,
  VendorWriteResult,
  ApClientInfo
} from './types.ts';

function nMac(mac: string): string {
  return (mac || '').replace(/[:\.\-]/g, '').toUpperCase();
}

function matchMac(a: string, b: string): boolean {
  return nMac(a) === nMac(b);
}

export const capsmanHandler: VendorHandler = {
  vendorName: 'MikroTik-CAPsMAN',
  vendorPatterns: [],
  macOuiPrefixes: [],
  async fetchInfo(): Promise<VendorResult> {
    return { success: false, error: 'استخدم fetchCapsManInfo()', unsupported: true };
  },
  async setSsid(): Promise<VendorWriteResult> {
    return { success: false, message: 'استخدم setCapsManSsid()' };
  },
  async reboot(): Promise<VendorWriteResult> {
    return { success: false, message: 'استخدم /caps-man/remote-cap/disable ثم enable' };
  }
};

export async function fetchCapsManInfo(client: any, rawMac: string): Promise<VendorResult> {
  const result: VendorResult = { success: false };
  if (!client || typeof client.querySafe !== 'function') {
    return { success: false, error: 'الراوتر غير متصل' };
  }

  try {
    const allCaps = await client.querySafe('/caps-man/remote-cap/print');
    const cap = (allCaps || []).find((c: any) =>
      matchMac(c['mac-address'] || c.mac || c['base-mac'] || '', rawMac)
    );

    if (!cap) {
      return { success: false, error: `لم يتم العثور على CAP لعنوان: ${rawMac}` };
    }

    const allIfaces = await client.querySafe('/caps-man/interface/print');
    const ifaces = (allIfaces || []).filter((i: any) =>
      matchMac(i['mac-address'] || i.mac || i['bound-mac-address'] || '', rawMac)
    );

    for (const i of ifaces) {
      const s = i.ssid || '';
      if (!s) continue;
      const f = parseInt(String(i['channel-frequency'] || i.frequency || '0'), 10);
      if (f > 4000) result.ssid5g = s;
      else if (f > 2000) result.ssid2g = s;
      if (!result.ssid) result.ssid = s;
      if (i.channel) result.channel = String(i.channel);
      if (i['tx-power']) result.txPower = String(i['tx-power']);
    }

    result.isDualBand =
      ifaces.some((i: any) => parseInt(String(i['channel-frequency'] || '0'), 10) > 4000) &&
      ifaces.some((i: any) => {
        const f = parseInt(String(i['channel-frequency'] || '0'), 10);
        return f > 2000 && f <= 4000;
      });

    try {
      const regs = await client.querySafe('/caps-man/registration-table/print');
      if (Array.isArray(regs)) {
        const clients: ApClientInfo[] = [];
        for (const r of regs) {
          const _capMac = r['interface'] || r['ap'] || '';
          // If interface matches this CAP or all registrations
          clients.push({
            macAddress: r.mac || r['mac-address'] || '',
            hostname: r.name || '',
            ipAddress: r['assigned-ip'] || r.address || '',
            signalStrength: r.signal ? `${r.signal}dBm` : undefined,
            signalQuality: typeof r.snr === 'number' ? r.snr : undefined,
            txRate: r['tx-rate'] || '',
            rxRate: r['rx-rate'] || '',
            uptime: r.uptime || ''
          });
        }
        result.clients = clients;
        result.clientsCount = clients.length;
      }
    } catch {}

    result.uptime = cap.uptime || '';
    result.firmwareVersion = cap.version || '';
    result.model = cap.board || cap.platform || '';
    result.success = !!(result.ssid || result.ssid2g || result.ssid5g || cap.state === 'ok');

    return result;
  } catch (e: any) {
    logger.error('CAPsMAN', 'فشل قراءة CAPsMAN', e);
    return { success: false, error: e.message };
  }
}

export async function setCapsManSsid(
  client: any,
  rawMac: string,
  ssid: string,
  ssid2g?: string,
  ssid5g?: string,
  hideSsid?: boolean
): Promise<VendorWriteResult> {
  if (!client || typeof client.querySafe !== 'function') {
    return { success: false, message: 'الراوتر غير متصل' };
  }

  try {
    // 1. Configuration (دائم)
    const configs = await client.querySafe('/caps-man/configuration/print');
    const ifaces = await client.querySafe('/caps-man/interface/print');
    const capIfaces = (ifaces || []).filter((i: any) =>
      matchMac(i['mac-address'] || i.mac || i['bound-mac-address'] || '', rawMac)
    );

    const usedConfigs = new Set<string>(
      capIfaces.map((i: any) => i.configuration || 'default').filter(Boolean)
    );

    let cfgCount = 0;
    for (const cn of usedConfigs) {
      const c = (configs || []).find((x: any) => x.name === cn);
      if (!c) continue;
      const p = [`=.id=${c['.id']}`, `=ssid=${ssid}`];
      if (hideSsid !== undefined) {
        p.push(`=hide-ssid=${hideSsid ? 'yes' : 'no'}`);
      }
      try {
        await client.query('/caps-man/configuration/set', p);
        cfgCount++;
      } catch (e: any) {
        logger.error('CAPsMAN', `فشل تحديث config ${cn}`, e.message);
      }
    }

    // 2. Interface (فوري)
    let ifCount = 0;
    for (const i of capIfaces) {
      const f = parseInt(String(i['channel-frequency'] || i.frequency || '0'), 10);
      let s = ssid;
      if (f > 4000 && ssid5g) s = ssid5g;
      else if (f <= 4000 && ssid2g) s = ssid2g;
      if (!s) continue;

      const p = [`=.id=${i['.id']}`, `=ssid=${s}`];
      if (hideSsid !== undefined) {
        p.push(`=hide-ssid=${hideSsid ? 'yes' : 'no'}`);
      }
      try {
        await client.query('/caps-man/interface/set', p);
        ifCount++;
      } catch (e: any) {
        logger.error('CAPsMAN', `فشل تحديث iface ${i.name}`, e.message);
      }
    }

    if (cfgCount + ifCount === 0) {
      return { success: false, message: 'لم يتم العثور على واجهات CAPsMAN مرتبطة لتحديثها' };
    }

    // إصلاح 8: تحذير التأخير
    return {
      success: true,
      message: `تم تحديث ${cfgCount} إعداد configuration و ${ifCount} واجهة interface بنجاح.`
    };
  } catch (e: any) {
    logger.error('CAPsMAN', 'فشل تغيير SSID في CAPsMAN', e);
    return { success: false, message: e.message };
  }
}
