import type { Request, Response } from 'express';
import { MikrotikAPI, type MikrotikClient } from '../mikrotik-api.ts';
import { generateSetupScript, type SetupConfig } from '../mikrotikSetupScript.ts';
import { appLogger } from '../rotatingLogger.ts';
import { sanitizeRouterOsIdentifier } from '../utils/routerNormalizers.ts';

export interface SetupCheckDetail {
  name: string;
  category: string;
  status: 'ok' | 'missing' | 'warning';
  message: string;
}

export const setupRouterApi = async (req: Request, res: Response) => {
  const client: MikrotikClient = (req as any).routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(503).json({
      success: false,
      reconnecting: true,
      message: "جاري إعادة الاتصال بالراوتر"
    });
  }

  const { type } = req.params; // check, apply, update
  const config: Partial<SetupConfig> = req.body || {};
  const lanBridge = sanitizeRouterOsIdentifier(config.lanBridge, 'bridge1');

  if (type === 'apply' || type === 'update') {
    const scriptName = `zctrl_setup_${Date.now()}`;
    try {
      const scriptBody = generateSetupScript(config);

      // Add temporary setup script, execute, and auto-remove
      await client.query('/system/script/add', [
        `=name=${scriptName}`,
        `=source=${scriptBody}`,
        `=comment=ZCtrl Temporary Setup Automation`
      ]);
      await client.query('/system/script/run', [`=number=${scriptName}`]);

      return res.json({ 
        success: true, 
        message: type === 'apply' 
          ? "تمت تهيئة وتجهيز الراوتر بالكامل بنجاح بكافة الإعدادات والبروفايلات والهوتسبوت" 
          : "تم تطبيق وتحديث كافة الإعدادات على الراوتر بنجاح" 
      });
    } catch (e: any) {
      return res.status(500).json({ 
        success: false, 
        message: `حدث خطأ أثناء تطبيق الإعدادات على الراوتر: ${e.message || String(e)}` 
      });
    } finally {
      // Always safely remove the temporary setup script from the router
      try {
        const found = await client.querySafe('/system/script/print', [`?name=${scriptName}`]);
        if (Array.isArray(found) && found.length > 0 && found[0]?.['.id']) {
          await client.query('/system/script/remove', [`=.id=${found[0]['.id']}`]);
        }
      } catch (cleanupErr) {
        appLogger.warn('setup', 'Failed to remove temporary router setup script', {
          scriptName,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        });
      }
    }
  } else if (type === 'check') {
    try {
      const details: SetupCheckDetail[] = [];

      // 1. Check LAN Bridge
      const bridges = await client.querySafe('/interface/bridge/print', [`?name=${lanBridge}`]);
      if (bridges && bridges.length > 0) {
        details.push({ 
          name: `بريدج الشبكة المحلية (${lanBridge})`, 
          category: 'الشبكة والواجهات',
          status: 'ok', 
          message: `البريدج موجود ونشط` 
        });
      } else {
        details.push({ 
          name: `بريدج الشبكة المحلية (${lanBridge})`, 
          category: 'الشبكة والواجهات',
          status: 'missing', 
          message: `البريدج غير موجود ويجب إنشاؤه لضم منافذ الخروج` 
        });
      }

      // 2. Check IP Address on LAN Bridge
      const addresses = await client.querySafe('/ip/address/print', [`?interface=${lanBridge}`]);
      if (addresses && addresses.length > 0) {
        const addrStr = addresses[0].address || '';
        details.push({ 
          name: 'عنوان بوابة المشتركين (IP Gateway)', 
          category: 'عناوين IP',
          status: 'ok', 
          message: `عنوان IP المضبوط على البريدج: ${addrStr}` 
        });
      } else {
        details.push({ 
          name: 'عنوان بوابة المشتركين (IP Gateway)', 
          category: 'عناوين IP',
          status: 'missing', 
          message: 'لا يوجد عنوان IP مخصص للبريدج (المقترح 10.0.0.1/22)' 
        });
      }

      // 3. Check IP Pool
      const pools = await client.querySafe('/ip/pool/print', [`?name=dhcp_pool0`]);
      if (pools && pools.length > 0) {
        details.push({ 
          name: 'حوض توزيع الآيبيهات (IP Pool)', 
          category: 'توزيع IP (DHCP)',
          status: 'ok', 
          message: `الحوض dhcp_pool0 موجود بنطاق ${pools[0].ranges || '10.0.0.2-10.0.3.254'}` 
        });
      } else {
        details.push({ 
          name: 'حوض توزيع الآيبيهات (IP Pool)', 
          category: 'توزيع IP (DHCP)',
          status: 'missing', 
          message: 'الحوض dhcp_pool0 غير موجود ويحتاجه سيرفر الـ DHCP' 
        });
      }

      // 4. Check DHCP Server
      const dhcpServers = await client.querySafe('/ip/dhcp-server/print', [`?interface=${lanBridge}`]);
      if (dhcpServers && dhcpServers.length > 0) {
        details.push({ 
          name: 'سيرفر الـ DHCP للمشتركين', 
          category: 'توزيع IP (DHCP)',
          status: 'ok', 
          message: `سيرفر الـ DHCP يعمل على ${lanBridge}` 
        });
      } else {
        details.push({ 
          name: 'سيرفر الـ DHCP للمشتركين', 
          category: 'توزيع IP (DHCP)',
          status: 'missing', 
          message: `سيرفر الـ DHCP غير معد على ${lanBridge}` 
        });
      }

      // 5. Check Hotspot Profile & Server
      const hsProfiles = await client.querySafe('/ip/hotspot/profile/print', [`?name=HOTSPOT SERVER`]);
      if (hsProfiles && hsProfiles.length > 0) {
        details.push({ 
          name: 'بروفايل سيرفر الهوتسبوت (Profile)', 
          category: 'سيرفر الهوتسبوت',
          status: 'ok', 
          message: `بروفايل HOTSPOT SERVER موجود ومعد بالراديوس` 
        });
      } else {
        details.push({ 
          name: 'بروفايل سيرفر الهوتسبوت (Profile)', 
          category: 'سيرفر الهوتسبوت',
          status: 'missing', 
          message: 'بروفايل HOTSPOT SERVER غير مضاف' 
        });
      }

      const hsServers = await client.querySafe('/ip/hotspot/print', [`?interface=${lanBridge}`]);
      if (hsServers && hsServers.length > 0) {
        details.push({ 
          name: 'خدمة الهوتسبوت (Hotspot Server)', 
          category: 'سيرفر الهوتسبوت',
          status: 'ok', 
          message: `الهوتسبوت نشط على ${lanBridge}` 
        });
      } else {
        details.push({ 
          name: 'خدمة الهوتسبوت (Hotspot Server)', 
          category: 'سيرفر الهوتسبوت',
          status: 'missing', 
          message: `لا يوجد سيرفر هوتسبوت يعمل على ${lanBridge}` 
        });
      }

      // 6. Check Radius Server
      const radiusList = await client.querySafe('/radius/print', [`?address=127.0.0.1`]);
      if (radiusList && radiusList.length > 0) {
        details.push({ 
          name: 'عميل الراديوس المحلي (Radius 127.0.0.1)', 
          category: 'الراديوس واليوزر منجر',
          status: 'ok', 
          message: 'الراديوس مضاف ومرتبط بخدمة الهوتسبوت' 
        });
      } else {
        details.push({ 
          name: 'عميل الراديوس المحلي (Radius 127.0.0.1)', 
          category: 'الراديوس واليوزر منجر',
          status: 'missing', 
          message: 'الراديوس غير مفعل أو غير مربوط بعنوان 127.0.0.1' 
        });
      }

      // 7. Check User Manager Router
      const umPrefix = client.isV6() ? "/tool/user-manager" : "/user-manager";
      const umRouters = await client.querySafe(`${umPrefix}/router/print`, [`?address=127.0.0.1`]);
      if (umRouters && umRouters.length > 0) {
        details.push({ 
          name: 'راوتر اليوزر منجر (User-Manager Router)', 
          category: 'الراديوس واليوزر منجر',
          status: 'ok', 
          message: 'اليوزر منجر مربوط بالراديوس المحلي بنجاح' 
        });
      } else {
        details.push({ 
          name: 'راوتر اليوزر منجر (User-Manager Router)', 
          category: 'الراديوس واليوزر منجر',
          status: 'missing', 
          message: 'اليوزر منجر يحتاج إضافة راوتر محلي 127.0.0.1' 
        });
      }

      // 8. Check NAT Masquerade
      const natRules = await client.querySafe('/ip/firewall/nat/print', [`?action=masquerade`]);
      if (natRules && natRules.length > 0) {
        details.push({ 
          name: 'قاعدة مشاركة الإنترنت (NAT Masquerade)', 
          category: 'الجدار الناري والتوجيه',
          status: 'ok', 
          message: 'قاعدة الـ NAT لتمرير الإنترنت للمشتركين موجودة' 
        });
      } else {
        details.push({ 
          name: 'قاعدة مشاركة الإنترنت (NAT Masquerade)', 
          category: 'الجدار الناري والتوجيه',
          status: 'missing', 
          message: 'لا توجد قاعدة Masquerade، لن يتمكن المشتركون من تصفح الإنترنت' 
        });
      }

      // 9. Check Default Route
      const routes = await client.querySafe('/ip/route/print', [`?dst-address=0.0.0.0/0`]);
      if (routes && routes.length > 0) {
        details.push({ 
          name: 'المسار الافتراضي للإنترنت (Default Gateway)', 
          category: 'الجدار الناري والتوجيه',
          status: 'ok', 
          message: `المسار موجود عبر البوابة: ${routes[0].gateway || 'مضبوطة'}` 
        });
      } else {
        details.push({ 
          name: 'المسار الافتراضي للإنترنت (Default Gateway)', 
          category: 'الجدار الناري والتوجيه',
          status: 'missing', 
          message: 'لا يوجد مسار افتراضي (0.0.0.0/0) لخروج الترافيك للإنترنت' 
        });
      }

      const totalItems = details.length;
      const okItems = details.filter(d => d.status === 'ok').length;
      const missingItems = totalItems - okItems;

      return res.json({ 
        success: true, 
        message: missingItems === 0 
          ? `الراوتر مجهز بنسبة 100% (${okItems}/${totalItems} متطلبات مكتملة)` 
          : `تم فحص الراوتر: ${okItems} مكتمل و ${missingItems} متطلبات بحاجة للتطبيق`, 
        summary: { total: totalItems, ok: okItems, missing: missingItems },
        details 
      });
    } catch (e: any) {
      return res.status(500).json({ 
        success: false, 
        message: `حدث خطأ أثناء فحص الراوتر: ${e.message || String(e)}` 
      });
    }
  } else {
    return res.status(400).json({ success: false, message: "نوع العملية غير مدعوم" });
  }
};
