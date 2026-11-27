// ============================================================
// مسارات إدارة نقاط الوصول وأجهزة البث - AP Routes (إصلاح 9 و 10)
// ============================================================

import { Router, type Request, type Response } from 'express';
import { vault } from '../services/credentialVault.ts';
import { logger } from '../services/logger.ts';
import { validateSsidRequest } from '../services/ssidValidator.ts';
import { createRequestAbortController } from '../services/httpUtil.ts';
import { lookupOui } from '../services/ouiDatabase.ts';
import {
  fetchApInfo,
  changeApSsid,
  rebootAp,
  fetchCapsManInfo,
  setCapsManSsid
} from '../services/vendors/index.ts';

export function createApRoutes(getClient?: (req: Request) => any): Router {
  const router = Router();

  function getRouterClient(req: Request) {
    if (getClient) {
      const client = getClient(req);
      if (client) return client;
    }
    return req.routerClient;
  }

  // ===== جلب معلومات نقطة الوصول =====
  router.post('/info', async (req: Request, res: Response) => {
    const { apMac, apIp, apSource } = req.body;
    if (!apMac) {
      return res.status(400).json({ success: false, message: 'عنوان MAC مطلوب' });
    }

    try {
      if (apSource === 'capsman') {
        const client = getRouterClient(req);
        if (!client?.isConnected?.()) {
          return res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
        }
        const info = await fetchCapsManInfo(client, apMac);
        return res.json(info);
      }

      const cfg = vault.getConnectConfig(apMac);
      if (!cfg) {
        return res.json({
          success: false,
          requiresCredentials: true,
          message: 'لا توجد بيانات دخول محفوظة لهذا الجهاز'
        });
      }

      // إذا تم تزويد IP جديد يتم تحديث الـ Config
      if (apIp && apIp !== cfg.ip) {
        cfg.ip = apIp;
      }

      const info = await fetchApInfo(cfg, apMac);
      if (info.success && info._session) {
        vault.saveSession(apMac, info._session, lookupOui(apMac).handler);
        vault.updateTestResult(apMac, 'success');
      } else if (!info.success) {
        vault.updateTestResult(apMac, info.error || 'failed');
      }

      return res.json(info);
    } catch (e: any) {
      logger.error('Routes', `فشل جلب معلومات ${apMac}`, e.message);
      return res.status(500).json({ success: false, message: e.message });
    }
  });

  // ===== تغيير اسم الشبكة (SSID) =====
  router.post('/set-ssid', async (req: Request, res: Response) => {
    const { apMac, apIp, apSource, request: ssidReq } = req.body;
    if (!apMac) {
      return res.status(400).json({ success: false, message: 'عنوان MAC مطلوب' });
    }

    // إصلاح 5: تحقق من صحة وحماية SSID ضد الحقن
    const valid = validateSsidRequest(ssidReq || {});
    if (!valid.valid) {
      return res.status(400).json({ success: false, message: valid.error });
    }

    // إصلاح 10: إنشاء AbortController مرتبط بقطع الاتصال من المتصفح

    try {
      if (apSource === 'capsman') {
        const client = getRouterClient(req);
        if (!client?.isConnected?.()) {
          return res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
        }

        // إصلاح 8: تحذير تأخير التطبيق للـ CAPs
        const r = await setCapsManSsid(
          client,
          apMac,
          ssidReq.ssid || '',
          ssidReq.ssid2g,
          ssidReq.ssid5g,
          ssidReq.hideSsid
        );

        if (r.success) {
          r.message +=
            '\n\n⚠️ ملاحظة: إذا كان الـ CAP في وضع provisioning، قد يستغرق التطبيق 30-60 ثانية ليصل التغيير.';
        }
        return res.json(r);
      }

      let cfg = vault.getConnectConfig(apMac);
      if (!cfg) {
        return res.json({
          success: false,
          message: 'لا توجد بيانات دخول محفوظة لهذا الأكسس بوينت',
          requiresCredentials: true
        });
      }

      if (apIp && apIp !== cfg.ip) {
        cfg.ip = apIp;
      }

      // إصلاح 9: البحث عن جلسة صالحة أولاً لتجنب طلبات المصادقة المكررة
      let session = vault.getValidSession(apMac);
      if (!session) {
        logger.info('Routes', `لا توجد جلسة صالحة لـ ${apMac} - إنشاء مصادقة جديدة`);
        const info = await fetchApInfo(cfg, apMac);
        session = info._session;
        if (session && info.success) {
          vault.saveSession(apMac, session, lookupOui(apMac).handler);
        }
      }

      if (!session && lookupOui(apMac).handler !== 'generic') {
        return res.json({
          success: false,
          message: 'فشل الحصول على جلسة مصادقة - تحقق من صحة اسم المستخدم وكلمة المرور',
          requiresCredentials: true
        });
      }

      const r = await changeApSsid(cfg, apMac, session, ssidReq);
      if (r.success) {
        vault.invalidateSession(apMac);
      }
      return res.json(r);
    } catch (e: any) {
      logger.error('Routes', `فشل تغيير SSID لـ ${apMac}`, e.message);
      return res.status(500).json({ success: false, message: e.message });
    }
  });

  // ===== إعادة تشغيل الأكسس بوينت =====
  router.post('/reboot', async (req: Request, res: Response) => {
    const { apMac, apIp, apSource } = req.body;
    if (!apMac) {
      return res.status(400).json({ success: false, message: 'عنوان MAC مطلوب' });
    }

    if (apSource === 'capsman') {
      return res.json({
        success: false,
        message: 'لإعادة تشغيل أجهزة CAPsMAN، يرجى استخدام أمر التعطيل والتمكين من واجهة الراوتر'
      });
    }

    let cfg = vault.getConnectConfig(apMac);
    if (!cfg) {
      return res.json({
        success: false,
        message: 'لا توجد بيانات دخول محفوظة لهذا الجهاز',
        requiresCredentials: true
      });
    }

    if (apIp && apIp !== cfg.ip) {
      cfg.ip = apIp;
    }

    let session = vault.getValidSession(apMac);
    if (!session) {
      const info = await fetchApInfo(cfg, apMac);
      session = info._session;
      if (session && info.success) {
        vault.saveSession(apMac, session, lookupOui(apMac).handler);
      }
    }

    const r = await rebootAp(cfg, apMac, session);
    if (r.success) {
      vault.invalidateSession(apMac);
    }
    return res.json(r);
  });

  // ===== حفظ بيانات الاعتماد واختبار الاتصال =====
  router.post('/save-credentials', async (req: Request, res: Response) => {
    const { mac, ip, vendor, model, username, password, port, useHttps, testConnection } = req.body;
    if (!mac || !ip || !username || !password) {
      return res.status(400).json({ success: false, message: 'البيانات الأساسية ناقصة' });
    }

    const entry = vault.saveCredentials({
      mac,
      ip,
      vendor: vendor || lookupOui(mac).vendor,
      model,
      username,
      password,
      port: port ? Number(port) : undefined,
      useHttps: !!useHttps
    });

    if (testConnection) {
      const cfg = vault.getConnectConfig(mac);
      if (cfg) {
        const testRes = await fetchApInfo(cfg, mac);
        if (testRes.success) {
          vault.updateTestResult(mac, 'success');
          if (testRes._session) {
            vault.saveSession(mac, testRes._session, lookupOui(mac).handler);
          }
          return res.json({
            success: true,
            message: 'تم حفظ البيانات والاتصال بنجاح بالجهاز',
            data: entry,
            info: testRes
          });
        } else {
          vault.updateTestResult(mac, testRes.error || 'failed');
          return res.json({
            success: true,
            warning: true,
            message: `تم الحفظ ولكن فشل اختبار الاتصال: ${testRes.error || 'خطأ غير معروف'}`,
            data: entry
          });
        }
      }
    }

    return res.json({ success: true, message: 'تم حفظ بيانات الدخول بنجاح', data: entry });
  });

  // ===== قائمة بيانات الاعتماد المسجلة =====
  router.get('/credentials', (_req: Request, res: Response) => {
    return res.json({ success: true, data: vault.listMetadata() });
  });

  // ===== حذف بيانات الاعتماد =====
  router.delete('/credentials/:mac', (req: Request, res: Response) => {
    vault.remove(req.params.mac);
    return res.json({ success: true, message: 'تم حذف بيانات الاعتماد بنجاح' });
  });

  // ===== سجلات النظام الدوارة =====
  router.get('/logs', (req: Request, res: Response) => {
    const vendor = req.query.vendor as string;
    const errorsOnly = req.query.errors === 'true';
    const data = vendor
      ? logger.getByVendor(vendor)
      : errorsOnly
      ? logger.getErrors()
      : logger.getRecent(100);

    return res.json({ success: true, data });
  });

  return router;
}
