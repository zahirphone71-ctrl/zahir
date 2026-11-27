import { Request, Response } from 'express';
import { RouterOSExecutor } from '../routeros/RouterOSExecutor';
import { RouterGuard } from '../routeros/RouterGuard';
import { CliBuilder } from '../routeros/CliBuilder';
import { ErrorTranslator } from '../routeros/ErrorTranslator';
import { auditLog } from '../auditLog';
import { MikrotikAPI } from '../mikrotik-api';
import { securityConfig } from '../security-shield';
import { isProtectedDefaultProfileName } from '../routeros/profileSanitizer';
import { appLogger } from '../rotatingLogger';

export class RouterProfileController {
  private static async resolveClient(req: Request): Promise<any> {
    let client = req.routerClient;
    if (!client || (typeof client.isConnected === 'function' && !client.isConnected())) {
      if (req.app?.locals?.getRouterClient) {
        const resolved = req.app.locals.getRouterClient(req);
        if (resolved) client = resolved;
      }
    }
    if (!client) {
      client = securityConfig.strictTenantIsolation ? null : MikrotikAPI;
    }
    if (client && typeof client.isConnected === 'function' && !client.isConnected()) {
      if (typeof client.ensureConnected === 'function') {
        try {
          await client.ensureConnected();
        } catch (err: any) {
          appLogger.warn('RouterProfileController', 'resolveClient ensureConnected failed', { error: err?.message });
        }
      }
    }
    return client;
  }

  static async create(req: Request, res: Response) {
    const client = await RouterProfileController.resolveClient(req);
    if (!client) {
      return res.status(401).json({ success: false, code: 'SESSION_INVALID', sessionExpired: true, message: 'الجلسة غير صالحة أو منتهية' });
    }
    if (typeof client.isConnected === 'function' && !client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
    }

    const { serviceType, profileData } = req.body;
    if (!serviceType || !profileData || !profileData.name) {
      return res.status(400).json({ success: false, message: 'بيانات البروفايل ونوع الخدمة مطلوبة' });
    }

    const normalizedType = String(serviceType).toLowerCase();
    const executor = new RouterOSExecutor(client);
    try {
      const guard = await RouterGuard.canProceed(executor);
      if (!guard.ok) {
        return res.status(429).json({ success: false, message: guard.reason });
      }

      if (normalizedType === 'hotspot') {
        const payload = CliBuilder.buildHotspotProfilePayload(profileData);
        await executor.addHotspotProfile(payload);
      } else if (normalizedType === 'pppoe' || normalizedType === 'ppp') {
        const payload = CliBuilder.buildPppProfilePayload(profileData);
        await executor.addPppProfile(payload);
      } else if (normalizedType === 'userman' || normalizedType === 'user-manager') {
        const isV6 = client.isV6 ? client.isV6() : false;
        const { profile, limitation, link } = CliBuilder.buildUsermanPayloads(profileData, isV6);
        await executor.addUsermanProfileWithLimitation(profile, limitation, link);
      } else {
        return res.status(400).json({ success: false, message: 'نوع خدمة غير معروف' });
      }

      // Invalidate caches
      if (req.app?.locals?.invalidateCache) {
        req.app.locals.invalidateCache(`/ip/hotspot/user/profile`);
        req.app.locals.invalidateCache(`/ppp/profile`);
        req.app.locals.invalidateCache(`/user-manager`);
        req.app.locals.invalidateCache(`/tool/user-manager`);
      }

      await auditLog.insert({
        action: 'CREATE_PROFILE',
        serviceType: normalizedType,
        profileName: profileData.name,
        timestamp: new Date()
      });

      RouterGuard.recordSuccess();
      return res.json({ success: true, message: `تم إنشاء البروفايل (${profileData.name}) بنجاح على المايكروتك` });
    } catch (error: any) {
      RouterGuard.recordFailure();
      return res.status(500).json({ success: false, message: ErrorTranslator.translate(error) });
    }
  }

  static async update(req: Request, res: Response) {
    const client = await RouterProfileController.resolveClient(req);
    if (!client) {
      return res.status(401).json({ success: false, code: 'SESSION_INVALID', sessionExpired: true, message: 'الجلسة غير صالحة أو منتهية' });
    }
    if (typeof client.isConnected === 'function' && !client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
    }

    const { serviceType, oldName, profileData } = req.body;
    if (!serviceType || !profileData || !profileData.name) {
      return res.status(400).json({ success: false, message: 'بيانات البروفايل ونوع الخدمة مطلوبة' });
    }

    const normalizedType = String(serviceType).toLowerCase();
    const targetOldName = oldName || profileData.name;
    const executor = new RouterOSExecutor(client);

    try {
      const guard = await RouterGuard.canProceed(executor);
      if (!guard.ok) {
        return res.status(429).json({ success: false, message: guard.reason });
      }

      if (normalizedType === 'hotspot') {
        const payload = CliBuilder.buildHotspotProfilePayload(profileData);
        await executor.updateHotspotProfile(targetOldName, payload);
      } else if (normalizedType === 'pppoe' || normalizedType === 'ppp') {
        const payload = CliBuilder.buildPppProfilePayload(profileData);
        await executor.updatePppProfile(targetOldName, payload);
      } else if (normalizedType === 'userman' || normalizedType === 'user-manager') {
        const isV6 = client.isV6 ? client.isV6() : false;
        const { profile, limitation, link } = CliBuilder.buildUsermanPayloads(profileData, isV6);
        await executor.updateUsermanProfile(targetOldName, profile, limitation, link);
      } else {
        return res.status(400).json({ success: false, message: 'نوع خدمة غير معروف' });
      }

      // Invalidate caches
      if (req.app?.locals?.invalidateCache) {
        req.app.locals.invalidateCache(`/ip/hotspot/user/profile`);
        req.app.locals.invalidateCache(`/ppp/profile`);
        req.app.locals.invalidateCache(`/user-manager`);
        req.app.locals.invalidateCache(`/tool/user-manager`);
      }

      await auditLog.insert({
        action: 'UPDATE_PROFILE',
        serviceType: normalizedType,
        profileName: profileData.name,
        timestamp: new Date()
      });

      RouterGuard.recordSuccess();
      return res.json({ success: true, message: `تم تعديل بروفايل (${profileData.name}) وتأكيده على المايكروتك بنجاح` });
    } catch (error: any) {
      RouterGuard.recordFailure();
      return res.status(500).json({ success: false, message: ErrorTranslator.translate(error) });
    }
  }

  static async delete(req: Request, res: Response) {
    const client = await RouterProfileController.resolveClient(req);
    if (!client) {
      return res.status(401).json({ success: false, code: 'SESSION_INVALID', sessionExpired: true, message: 'الجلسة غير صالحة أو منتهية' });
    }
    if (typeof client.isConnected === 'function' && !client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: 'جاري إعادة الاتصال بالراوتر' });
    }

    const { serviceType, profileName } = req.body;
    if (!serviceType || !profileName) {
      return res.status(400).json({ success: false, message: 'اسم البروفايل ونوع الخدمة مطلوبان' });
    }

    if (isProtectedDefaultProfileName(profileName)) {
      return res.status(400).json({ success: false, message: 'لا يمكن حذف البروفايل الافتراضي للنظام' });
    }

    const normalizedType = String(serviceType).toLowerCase();
    const executor = new RouterOSExecutor(client);
    try {
      const guard = await RouterGuard.canProceed(executor);
      if (!guard.ok) {
        return res.status(429).json({ success: false, message: guard.reason });
      }

      if (normalizedType === 'hotspot') {
        await executor.deleteHotspotProfile(profileName);
      } else if (normalizedType === 'pppoe' || normalizedType === 'ppp') {
        await executor.deletePppProfile(profileName);
      } else if (normalizedType === 'userman' || normalizedType === 'user-manager') {
        await executor.deleteUsermanProfile(profileName);
      } else {
        return res.status(400).json({ success: false, message: 'نوع خدمة غير معروف' });
      }

      // Invalidate caches
      if (req.app?.locals?.invalidateCache) {
        req.app.locals.invalidateCache(`/ip/hotspot/user/profile`);
        req.app.locals.invalidateCache(`/ppp/profile`);
        req.app.locals.invalidateCache(`/user-manager`);
        req.app.locals.invalidateCache(`/tool/user-manager`);
      }

      await auditLog.insert({
        action: 'DELETE_PROFILE',
        serviceType,
        profileName,
        timestamp: new Date()
      });

      RouterGuard.recordSuccess();
      return res.json({ success: true, message: `تم حذف البروفايل (${profileName}) من المايكروتك بنجاح` });
    } catch (error: any) {
      RouterGuard.recordFailure();
      return res.status(500).json({ success: false, message: ErrorTranslator.translate(error) });
    }
  }
}
