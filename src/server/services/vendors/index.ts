// ============================================================
// Router - إصلاح 3: استبعاد CAPsMAN تماماً من HTTP handlers
// إصلاح 12: لا يثق بمدخل المستخدم - OUI فقط
// ============================================================

import type { VendorHandler, VendorConnectConfig, VendorResult, SsidChangeRequest, VendorWriteResult } from './types.ts';
import { lookupOui, isMikroTikMac } from '../ouiDatabase.ts';
import { logger } from '../logger.ts';
import { ubiquitiHandler } from './ubiquiti.ts';
import { tplinkHandler } from './tplink.ts';
import { ruijieHandler } from './ruijie.ts';
import { genericHandler } from './genericHandler.ts';
import { capsmanHandler, fetchCapsManInfo, setCapsManSsid } from './capsman.ts';

const handlerMap: Record<string, VendorHandler> = {
  ubiquiti: ubiquitiHandler,
  tplink: tplinkHandler,
  ruijie: ruijieHandler,
  generic: genericHandler
};

/**
 * استنتاج Handler من MAC OUI فقط - إصلاح 12
 * لا يأخذ vendorFromUser أبداً - يُتجاهل تماماً
 * MikroTik MAC يذهب دائماً لـ generic (إصلاح 3)
 */
export function resolveHandler(mac: string): VendorHandler {
  // إصلاح 3: إذا كان MAC خاص بـ MikroTik → generic دائماً
  // لأن أنتنة MikroTik المُدارة عبر CAPsMAN لا تُدار عبر HTTP
  if (isMikroTikMac(mac)) {
    logger.debug('Router', `MAC ${mac} هو MikroTik → generic handler (لأن CAPsMAN يُدار من الراوتر)`);
    return genericHandler;
  }

  const oui = lookupOui(mac);
  const handler = handlerMap[oui.handler];
  if (handler) {
    logger.debug('Router', `MAC ${mac} → ${oui.vendor} → ${handler.vendorName}`);
    return handler;
  }

  logger.info('Router', `MAC ${mac} غير معروف → generic fallback`);
  return genericHandler;
}

/** جلب معلومات AP - يُستخدم فقط للأنتنات غير CAPsMAN */
export async function fetchApInfo(cfg: VendorConnectConfig, mac: string): Promise<VendorResult> {
  const handler = resolveHandler(mac);
  const oui = lookupOui(mac);
  logger.info('Router', `fetchInfo ${cfg.ip} (${oui.vendor})`);
  try {
    return await handler.fetchInfo(cfg);
  } catch (e: any) {
    logger.error('Router', `فشل fetchInfo ${cfg.ip}`, e.message);
    return { success: false, error: e.message };
  }
}

/** تغيير SSID */
export async function changeApSsid(
  cfg: VendorConnectConfig,
  mac: string,
  session: any,
  request: SsidChangeRequest
): Promise<VendorWriteResult> {
  const handler = resolveHandler(mac);
  if (handler === genericHandler) {
    // إصلاح 4: محاولة POST عامة قبل الاستسلام
    return genericHandler.setSsid(cfg, session, request);
  }
  return handler.setSsid(cfg, session, request);
}

/** إعادة تشغيل */
export async function rebootAp(
  cfg: VendorConnectConfig,
  mac: string,
  session: any
): Promise<VendorWriteResult> {
  const handler = resolveHandler(mac);
  return handler.reboot(cfg, session);
}

export {
  ubiquitiHandler,
  tplinkHandler,
  ruijieHandler,
  genericHandler,
  capsmanHandler,
  fetchCapsManInfo,
  setCapsManSsid
};
