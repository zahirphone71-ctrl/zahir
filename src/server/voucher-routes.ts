import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { voucherDb } from './voucher-db.ts';
import { generateVouchersBatch, generateSingleCode, generateCustomVoucher } from './voucher-generator.ts';
import { syncBatchToRouter, getRouterPrecheck, removeVouchersFromRouter, parseRouterOSTimeLimit, parseRouterOSDataLimit } from './voucher-sync.ts';
import { LAYOUT_OPTIONS, type GenerateOptions, type VoucherItem, type BatchInfo } from '../shared/voucher-types.ts';
import { renderVouchersFullHtml } from '../client/voucher-render.ts';
import { telegramAlertService } from './telegram-service.ts';
import { recordAudit } from './rbac.ts';
import { appLogger } from './rotatingLogger.ts';

export function createVoucherRoutes(getClient: (req: Request) => any): Router {
  const router = Router();

  // ============================================================
  // توليد دفعة كروت
  // ============================================================
  router.post('/api/vouchers/generate', async (req: Request, res: Response) => {
    // تمديد مهلة الاتصال للدفعات الكبيرة (1000 - 10000 كرت) لمنع انقطاع الاتصال
    req.setTimeout(300000);
    res.setTimeout(300000);
    try {
      const options: GenerateOptions = req.body;
      if (!options || typeof options.quantity !== 'number' || options.quantity <= 0) {
        return res.status(400).json({ success: false, error: 'الكمية غير صالحة' });
      }

      const client = getClient(req);
      const genResult = await generateVouchersBatch(options, client);
      if (!genResult.success) {
        return res.status(500).json(genResult);
      }

      // التزامن التلقائي الفوري وحقن الكروت حقيقي على الراوتر (هوت سبوت، برودباند، أو يوزر منادجر) إذا كان متصلاً
      let syncResult = null;
      let syncWarning: string | null = null;
      const isClientConnected = Boolean(client && typeof client.isConnected === 'function' && client.isConnected());

      if (options.autoSync !== false) {
        if (isClientConnected) {
          try {
            syncResult = await syncBatchToRouter({
              batchId: genResult.batchId,
              profileOnRouter: options.profileName,
              serviceType: options.serviceType
            }, client);

            if (syncResult && syncResult.synced === 0 && syncResult.totalToSync > 0) {
              return res.status(500).json({
                success: false,
                error: `فشل الحقن على راوتر المايكروتك الحقيقي: ${syncResult.errors[0]?.error || 'تعذر إضافة الكروت للراوتر'}`
              });
            }
          } catch (syncErr: any) {
            return res.status(500).json({
              success: false,
              error: `فشل الاتصال وحقن الكروت بالراوتر الحقيقي: ${syncErr.message}`
            });
          }
        } else {
          syncWarning = 'تم حفظ الكروت بنجاح في المخزون المحلي ككروت معلقة، ولكن لم يتم حقنها بالراوتر نظراً لعدم اتصال المايكروتك حالياً. يمكنك إكمال حقنها بنقرة واحدة من إدارة الدفعات عند إعادة الاتصال.';
        }
      }

      // إرسال إشعار تيليجرام تلقائي بالدفعة الجديدة إذا كانت الخدمة مفعلة
      const config = telegramAlertService.getConfig();
      if (config.enabled && config.notifyOnVoucherBatch) {
        const syncMsg = syncResult ? `(تم حقن ${syncResult.synced} كرت بالراوتر)` : `(توليد محلي)`;
        const text = `تم توليد دفعة كروت جديدة بنجاح!
📦 <b>رقم الدفعة:</b> ${genResult.batchId}
🔢 <b>العدد:</b> ${options.quantity} كرت ${syncMsg}
🏷 <b>البروفايل:</b> ${options.profileName || 'Default'}
💰 <b>سعر الكرت:</b> ${options.price || 0}
💬 <b>البيان:</b> ${options.comment || (options as any).batchComment || 'لا يوجد'}`;
        telegramAlertService.sendAlert('توليد دفعة كروت جديدة 🎫', text, 'success', 0).catch(() => {});
      }

      recordAudit(req, 'VOUCHER_BATCH_GENERATE', 'vouchers', 'success', {
        resourceId: genResult.batchId,
        changes: {
          before: null,
          after: {
            quantity: options.quantity,
            profileName: options.profileName,
            synced: syncResult ? syncResult.synced : 0
          }
        }
      });

      res.json({
        ...genResult,
        synced: syncResult ? syncResult.synced : 0,
        syncResult,
        syncWarning,
        routerConnected: isClientConnected,
        vouchers: (genResult.vouchers || []).slice(0, 10000),
        vouchersPreview: (genResult.vouchers || []).slice(0, 20)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // توليد كرت مخصص (Custom Voucher)
  // ============================================================
  router.post('/api/vouchers/generate-custom', async (req: Request, res: Response) => {
    try {
      const {
        code,
        pin,
        profileName,
        price,
        timeLimit,
        dataLimit,
        serviceType,
        comment,
        authMode,
        autoSync
      } = req.body;

      if (!code || typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ success: false, error: 'اسم المستخدم / الكود المخصص مطلوب' });
      }

      const client = getClient(req);
      const isRouterConnected = Boolean(client && typeof client.isConnected === 'function' && client.isConnected());

      if (autoSync !== false && !isRouterConnected) {
        return res.status(400).json({
          success: false,
          error: 'الراوتر غير متصل. لا يمكن إتمام الحقن الحقيقي على المايكروتك.'
        });
      }

      const genResult = await generateCustomVoucher({
        code,
        pin,
        profileName,
        price: Number(price) || 0,
        timeLimit,
        dataLimit,
        serviceType,
        comment,
        authMode
      }, client);

      if (!genResult.success || !genResult.voucher) {
        return res.status(400).json({ success: false, error: genResult.error || 'فشل توليد الكرت المخصص' });
      }

      // إذا طُلب التزامن التلقائي مع راوتر المايكروتك (حقن حقيقي مع التراجع عن الحفظ المحلي إذا فشل الحقن)
      let synced = false;
      if (autoSync !== false && isRouterConnected) {
        try {
          const service = (serviceType || 'HOTSPOT').toUpperCase();
          const cleanCode = genResult.voucher.voucherCode;
          const cleanPin = genResult.voucher.voucherPin;
          const cleanProfile = genResult.voucher.profileName;
          const rosTimeLimit = parseRouterOSTimeLimit(timeLimit);
          const rosBytesLimit = parseRouterOSDataLimit(dataLimit);

          if (service === 'PPPOE') {
            const pppParams = [
              `=name=${cleanCode}`,
              `=profile=${cleanProfile}`,
              `=service=any`,
              `=comment=${comment || 'ZCtrl Custom Voucher'}`
            ];
            if (cleanPin) pppParams.push(`=password=${cleanPin}`);
            if (rosTimeLimit) pppParams.push(`=limit-uptime=${rosTimeLimit}`);
            if (rosBytesLimit > 0) pppParams.push(`=limit-bytes-total=${rosBytesLimit}`);
            await client.query('/ppp/secret/add', pppParams);
          } else if (service === 'USERMAN') {
            const isV6 = typeof client.isV6 === 'function' ? client.isV6() : false;
            const umPrefix = isV6 ? '/tool/user-manager' : '/user-manager';
            const userParam = isV6 ? `=username=${cleanCode}` : `=name=${cleanCode}`;
            const params = [
              userParam,
              `=comment=${comment || 'ZCtrl Custom Voucher'}`
            ];
            if (cleanPin) params.push(`=password=${cleanPin}`);
            if (isV6) {
              params.push(`=customer=admin`);
            } else {
              params.push(`=group=default`);
            }
            await client.query(`${umPrefix}/user/add`, params);
            if (cleanProfile && cleanProfile !== 'default') {
              try {
                if (isV6) {
                  await client.query(`${umPrefix}/user/create-and-activate-profile`, [
                    `=username=${cleanCode}`,
                    `=profile=${cleanProfile}`,
                    `=customer=admin`
                  ]);
                } else {
                  await client.query(`${umPrefix}/user-profile/add`, [
                    `=user=${cleanCode}`,
                    `=profile=${cleanProfile}`
                  ]);
                }
              } catch (profErr: any) {
                // Clean up user created without profile before aborting
                try {
                  const created = await client.querySafe(`${umPrefix}/user/print`, [
                    isV6 ? `?username=${cleanCode}` : `?name=${cleanCode}`
                  ]);
                  if (Array.isArray(created) && created[0]?.['.id']) {
                    await client.query(`${umPrefix}/user/remove`, [`=.id=${created[0]['.id']}`]);
                  }
                } catch (cleanupErr: any) {
                  appLogger.warn('VoucherRoutes', 'Cleanup created User Manager user failed', { code: cleanCode, error: cleanupErr?.message });
                }
                throw new Error(`فشل ربط البروفايل (${cleanProfile}) في اليوزر مانجر: ${profErr.message}`);
              }
            }
          } else {
            const addParams = [
              `=name=${cleanCode}`,
              `=profile=${cleanProfile}`,
              `=comment=${comment || 'ZCtrl Custom Voucher'}`
            ];
            if (cleanPin) addParams.push(`=password=${cleanPin}`);
            if (rosTimeLimit) addParams.push(`=limit-uptime=${rosTimeLimit}`);
            if (rosBytesLimit > 0) addParams.push(`=limit-bytes-total=${rosBytesLimit}`);
            await client.query('/ip/hotspot/user/add', addParams);
          }

          voucherDb.markVouchersSynced([cleanCode]);
          genResult.voucher.isSynced = true;
          synced = true;
        } catch (syncErr: any) {
          // Roll back orphan local batch so the admin can retry the same code cleanly
          if (genResult.batchId) {
            try {
              voucherDb.deleteBatch(genResult.batchId);
            } catch (rbErr: any) {
              appLogger.warn('VoucherRoutes', 'Rollback local batch failed after sync error', { batchId: genResult.batchId, error: rbErr?.message });
            }
          }
          return res.status(500).json({
            success: false,
            error: `فشل الحقن الحقيقي للكرت المخصص في راوتر المايكروتك: ${syncErr.message || 'خطأ غير معروف'}`
          });
        }
      } else if (autoSync !== false && !isRouterConnected) {
        if (genResult.batchId) {
          try {
            voucherDb.deleteBatch(genResult.batchId);
          } catch (rbErr: any) {
            appLogger.warn('VoucherRoutes', 'Rollback local batch failed when router disconnected', { batchId: genResult.batchId, error: rbErr?.message });
          }
        }
        return res.status(400).json({
          success: false,
          error: 'الراوتر غير متصل. لا يمكن إتمام الحقن الحقيقي على المايكروتك.'
        });
      }

      recordAudit(req, 'VOUCHER_CUSTOM_GENERATE', 'vouchers', 'success', {
        resourceId: genResult.voucher.voucherCode,
        changes: { before: null, after: { profileName: genResult.voucher.profileName, synced } }
      });

      res.json({
        success: true,
        voucher: genResult.voucher,
        batchId: genResult.batchId,
        synced,
        message: synced
          ? `تم توليد الحقن الحقيقي والمزامنة للكرت المخصص (${genResult.voucher.voucherCode}) بنجاح على المايكروتك`
          : `تم توليد الكرت المخصص (${genResult.voucher.voucherCode}) محلياً`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // توليد كود مفرد
  // ============================================================
  router.get('/api/vouchers/generate-single', (req: Request, res: Response) => {
    try {
      const codeType = (req.query.codeType as any) || 'numeric';
      const length = parseInt(req.query.length as string, 10) || 6;
      const prefix = (req.query.prefix as string) || '';
      const code = generateSingleCode(codeType, length, prefix);
      res.json({ success: true, code });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // إحصائيات لوحة التحكم
  // ============================================================
  router.get('/api/vouchers/dashboard', (_req: Request, res: Response) => {
    try {
      const stats = voucherDb.getDashboardStats();
      res.json({ success: true, data: stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // تقرير المبيعات والمحاسبة المالية الشاملة (POS / Financial Accounting)
  // ============================================================
  router.get('/api/vouchers/financial-report', (_req: Request, res: Response) => {
    try {
      const summary = voucherDb.getFinancialSummary();
      res.json({ success: true, data: summary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // فحص جاهزية الراوتر والموارد
  // ============================================================
  router.get('/api/vouchers/precheck', async (req: Request, res: Response) => {
    try {
      const client = getClient(req);
      const precheck = await getRouterPrecheck(client);
      res.json({ success: true, data: precheck });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // فحص واسترجاع الدفعات غير المكتملة القابلة للاستئناف (Resumable Batches)
  // ============================================================
  router.get('/api/vouchers/batches/resumable', (_req: Request, res: Response) => {
    try {
      const resumable = voucherDb.getResumableBatches();
      res.json({ success: true, data: resumable });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // استئناف حقن دفعة كروت مقطوعة دون أي تكرار
  // ============================================================
  router.post('/api/vouchers/batches/:batchId/resume', async (req: Request, res: Response) => {
    try {
      const batchId = req.params.batchId;
      const client = getClient(req);
      if (!client || !client.isConnected()) {
        return res.status(400).json({ success: false, error: 'الراوتر غير متصل حالياً لاستئناف الحقن' });
      }

      const batch = voucherDb.getBatch(batchId);
      const allBatchVouchers = voucherDb.getVouchersByBatch(batchId);
      if (allBatchVouchers.length === 0) {
        return res.status(404).json({ success: false, error: 'الدفعة المطلوبة غير موجودة' });
      }

      const unsynced = allBatchVouchers.filter(v => !v.isSynced);
      if (unsynced.length === 0) {
        return res.json({
          success: true,
          message: 'جميع كروت هذه الدفعة محقونة ومكتملة مسبقاً على الراوتر',
          alreadyCompleted: true,
          totalCards: allBatchVouchers.length,
          syncedCards: allBatchVouchers.length
        });
      }

      const result = await syncBatchToRouter({
        batchId,
        profileOnRouter: batch?.profileName || allBatchVouchers[0]?.profileName,
        serviceType: batch?.serviceType || allBatchVouchers[0]?.serviceType
      }, client);

      const updatedVouchers = voucherDb.getVouchersByBatch(batchId);
      const remainingUnsynced = updatedVouchers.filter(v => !v.isSynced).length;

      res.json({
        success: true,
        message: `تم استئناف وحقن ${result.synced} كرت بنجاح على المايكروتك`,
        result,
        remainingUnsynced,
        totalCards: allBatchVouchers.length,
        syncedCards: updatedVouchers.length - remainingUnsynced
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // جلب كافة الدفعات
  // ============================================================
  router.get('/api/vouchers/batches', (_req: Request, res: Response) => {
    try {
      const batches = voucherDb.getAllBatches();
      res.json({ success: true, data: batches });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // جلب كروت دفعة معينة
  // ============================================================
  router.get('/api/vouchers/batch/:batchId', (req: Request, res: Response) => {
    try {
      const batch = voucherDb.getBatch(req.params.batchId);
      const vouchers = voucherDb.getVouchersByBatch(req.params.batchId);
      res.json({
        success: true,
        batch,
        vouchers,
        total: vouchers.length
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // حذف دفعة كاملة
  // ============================================================
  router.delete('/api/vouchers/batch/:batchId', async (req: Request, res: Response) => {
    try {
      const batchId = req.params.batchId;
      const deleteFromRouter = req.query.fromRouter === 'true';
      let routerRemoval: { removed: number; failed: number; notFound: number } | null = null;
      let routerWarning: string | undefined;

      if (deleteFromRouter) {
        try {
          const client = getClient(req);
          if (client && typeof client.isConnected === 'function' && client.isConnected()) {
            const batch = voucherDb.getBatch(batchId);
            const vouchers = voucherDb.getVouchersByBatch(batchId);
            const serviceType = batch?.serviceType || vouchers[0]?.serviceType || 'HOTSPOT';
            const codes = vouchers.map(v => v.voucherCode);
            routerRemoval = await removeVouchersFromRouter(client, codes, serviceType);
            if (routerRemoval.failed > 0) {
              routerWarning = `تعذر حذف ${routerRemoval.failed} كرت من الراوتر`;
            }
          } else {
            routerWarning = 'الراوتر غير متصل؛ تم حذف الدفعة محلياً فقط';
          }
        } catch (remErr: any) {
          routerWarning = `تعذر حذف الكروت من الراوتر: ${remErr?.message || 'خطأ غير معروف'}`;
        }
      }

      const deletedCount = voucherDb.deleteBatch(batchId);
      recordAudit(req, 'VOUCHER_BATCH_DELETE', 'vouchers', 'success', {
        resourceId: batchId,
        changes: { before: { batchId, count: deletedCount, fromRouter: deleteFromRouter }, after: null }
      });
      res.json({
        success: true,
        message: routerWarning
          ? `تم حذف الدفعة و ${deletedCount} كرت محلياً (${routerWarning})`
          : `تم حذف الدفعة و ${deletedCount} كرت بنجاح`,
        deletedCount,
        routerRemoval,
        warning: routerWarning
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // خريطة الأسعار الخفيفة
  // ============================================================
  router.get('/api/vouchers/price-map', (_req: Request, res: Response) => {
    try {
      const map = voucherDb.getPriceMap();
      res.json({ success: true, data: map });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // جلب الكروت مصفوفة ومفروزة (Pagination)
  // ============================================================
  router.get('/api/vouchers/items', (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const batchId = req.query.batchId as string;
      const status = req.query.status as any;
      const search = req.query.search as string;

      const result = voucherDb.getPaginatedVouchers({ page, limit, batchId, status, search });
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // مزامنة دفعة مع الراوتر
  // ============================================================
  router.post('/api/vouchers/sync', async (req: Request, res: Response) => {
    try {
      const { batchId, voucherCodes, profileOnRouter, serviceType } = req.body;
      if (!batchId && (!Array.isArray(voucherCodes) || voucherCodes.length === 0)) {
        return res.status(400).json({ success: false, error: 'معرّف الدفعة (batchId) أو قائمة الكروت (voucherCodes) مطلوبة للمزامنة' });
      }

      const client = getClient(req);
      const result = await syncBatchToRouter({
        batchId,
        voucherCodes,
        profileOnRouter,
        serviceType
      }, client);

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // قائمة التخطيطات
  // ============================================================
  router.get('/api/vouchers/layouts', (_req: Request, res: Response) => {
    res.json({ success: true, data: LAYOUT_OPTIONS });
  });

  // ============================================================
  // صيانة وضغط قاعدة البيانات
  // ============================================================
  router.post('/api/vouchers/maintenance/vacuum', (_req: Request, res: Response) => {
    try {
      const vacuumRes = voucherDb.vacuum();
      res.json({ success: true, data: vacuumRes });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // إدارة القوالب والتصاميم الدائمة (Persistent Templates Store)
  // ============================================================
  router.get('/api/vouchers/templates', (_req: Request, res: Response) => {
    try {
      const templates = voucherDb.getAllTemplates();
      res.json({ success: true, templates });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/vouchers/templates', (req: Request, res: Response) => {
    try {
      const template = req.body;
      if (!template || !template.name) {
        return res.status(400).json({ success: false, message: 'بيانات القالب غير صالحة' });
      }
      if (!template.id) {
        template.id = `tmpl_${Date.now()}`;
      }
      if (!template.createdAt) {
        template.createdAt = new Date().toISOString();
      }
      const updated = voucherDb.saveTemplate(template);
      res.json({ success: true, message: 'تم حفظ القالب في الخادم بنجاح', templates: updated, template });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/api/vouchers/templates/:id', (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const updated = voucherDb.deleteTemplate(id);
      res.json({ success: true, message: 'تم حذف القالب بنجاح', templates: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // التصميم الحالي المحفوظ
  router.get('/api/vouchers/design/current', (_req: Request, res: Response) => {
    try {
      const design = voucherDb.getCurrentDesign();
      res.json({ success: true, design });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/api/vouchers/design/current', (req: Request, res: Response) => {
    try {
      const design = req.body;
      if (design && typeof design === 'object') {
        voucherDb.saveCurrentDesign(design);
      }
      res.json({ success: true, message: 'تم حفظ التصميم الحالي بنجاح' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // ============================================================
  // توليد صفحة HTML جاهزة للطباعة
  // ============================================================
  router.post('/api/vouchers/render-html', (req: Request, res: Response) => {
    try {
      const html = renderVouchersFullHtml(req.body);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err: any) {
      res.status(500).send(`<html><body><h2>خطأ أثناء معالجة القالب</h2><p>${err.message}</p></body></html>`);
    }
  });

  // ============================================================
  // مراجعة ومطابقة كروت الراوتر مع المخزون والدفعات
  // وتصنيف الكروت غير الموجودة في المخزون حسب تاريخ حقنها
  // ============================================================
  router.get('/api/vouchers/reconcile-router', async (req: Request, res: Response) => {
    try {
      const client = getClient(req);
      if (!client || !client.isConnected()) {
        return res.status(400).json({ success: false, error: 'راوتر المايكروتك غير متصل حالياً' });
      }

      const serviceType = ((req.query.serviceType as string) || 'HOTSPOT').toUpperCase();
      let routerUsers: any[] = [];

      if (serviceType === 'HOTSPOT') {
        const hsRes = await client.querySafe('/ip/hotspot/user/print', [
          '.proplist=.id,name,password,profile,comment,disabled,limit-uptime,limit-bytes-total,uptime,bytes-in,bytes-out'
        ]);
        if (Array.isArray(hsRes)) routerUsers = hsRes;
      } else if (serviceType === 'PPPOE') {
        const pppRes = await client.querySafe('/ppp/secret/print', [
          '.proplist=.id,name,password,profile,comment,disabled,limit-uptime,limit-bytes-total'
        ]);
        if (Array.isArray(pppRes)) routerUsers = pppRes;
      } else if (serviceType === 'USERMAN') {
        const isV6 = client.isV6 ? client.isV6() : false;
        const umPrefix = isV6 ? '/tool/user-manager' : '/user-manager';
        const umRes = await client.querySafe(`${umPrefix}/user/print`);
        if (Array.isArray(umRes)) {
          routerUsers = umRes.map((u: any) => ({
            ...u,
            name: u.username || u.name
          }));
        }
      }

      const unmappedRouterCards: any[] = [];
      let matchedCount = 0;

      const extractDateFromComment = (comment?: string): { dateStr: string } => {
        if (!comment) return { dateStr: 'غير محدد التاريخ' };
        
        // ZCtrl standard comment format: ZCtrl|BatchId|Price:XXX|2026-10-15T08:00:00.000Z
        const zctrlMatch = comment.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/i);
        if (zctrlMatch) {
          try {
            const d = new Date(zctrlMatch[1]);
            if (!isNaN(d.getTime())) {
              return { dateStr: d.toISOString().slice(0, 10) };
            }
          } catch (dateErr: any) {
            appLogger.warn('VoucherRoutes', 'Invalid ISO date in voucher comment', { error: dateErr?.message });
          }
        }

        const ymdMatch = comment.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
        if (ymdMatch) {
          return { dateStr: ymdMatch[1].replace(/[/.]/g, '-') };
        }

        const dmyMatch = comment.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/);
        if (dmyMatch) {
          return { dateStr: dmyMatch[1].replace(/[/.]/g, '-') };
        }

        return { dateStr: 'تعليق مخصص / بدون تاريخ صريح' };
      };

      for (const ru of routerUsers) {
        const cardName = String(ru.name || '').trim();
        if (!cardName) continue;

        if (voucherDb.codeExists(cardName)) {
          matchedCount++;
        } else {
          const dateInfo = extractDateFromComment(ru.comment);
          unmappedRouterCards.push({
            name: cardName,
            password: ru.password ?? '',
            profile: ru.profile || 'default',
            comment: ru.comment || '',
            disabled: ru.disabled === true || ru.disabled === 'true' || ru.disabled === 'yes',
            limitUptime: ru['limit-uptime'] || '',
            limitBytesTotal: ru['limit-bytes-total'] || 0,
            injectionDate: dateInfo.dateStr,
            serviceType
          });
        }
      }

      // Group unmapped router cards by injection date
      const groupedByDate: Record<string, { date: string; count: number; cards: any[] }> = {};
      for (const card of unmappedRouterCards) {
        const groupKey = card.injectionDate || 'غير محدد التاريخ';
        if (!groupedByDate[groupKey]) {
          groupedByDate[groupKey] = {
            date: groupKey,
            count: 0,
            cards: []
          };
        }
        groupedByDate[groupKey].count++;
        groupedByDate[groupKey].cards.push(card);
      }

      const dateGroups = Object.values(groupedByDate).sort((a, b) => {
        if (a.date === 'غير محدد التاريخ') return 1;
        if (b.date === 'غير محدد التاريخ') return -1;
        return b.date.localeCompare(a.date);
      });

      res.json({
        success: true,
        summary: {
          totalRouterUsers: routerUsers.length,
          matchedWithInventory: matchedCount,
          unmappedCount: unmappedRouterCards.length,
          serviceType
        },
        dateGroups,
        unmappedCards: unmappedRouterCards
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // استيراد كروت الراوتر غير المسجلة إلى المخزون كدفعات منظمة
  // ============================================================
  router.post('/api/vouchers/import-reconciled', async (req: Request, res: Response) => {
    try {
      const { cards, targetDate, batchComment, price, profileName } = req.body;
      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ success: false, error: 'لا توجد كروت للاستيراد' });
      }

      const now = new Date();
      const dateTag = targetDate && targetDate !== 'غير محدد التاريخ' ? targetDate : now.toISOString().slice(0, 10);
      const batchId = `IMP-${dateTag.replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const voucherItems: VoucherItem[] = cards.map((c: any, idx: number) => ({
        voucherId: `imp-${Date.now()}-${idx}-${crypto.randomBytes(4).toString('hex')}`,
        voucherCode: String(c.name || '').trim(),
        voucherPin: String(c.password ?? '').trim(),
        statusCd: c.disabled ? 'DISABLED' : 'ACTIVE',
        price: Number(price !== undefined ? price : c.price || 0),
        profileName: c.profile || profileName || 'default',
        timeLimit: c.limitUptime || '30d',
        dataLimit: c.limitBytesTotal ? `${Math.round(c.limitBytesTotal / 1024 / 1024)}MB` : undefined,
        createdAt: targetDate && targetDate !== 'غير محدد التاريخ' ? `${targetDate}T12:00:00.000Z` : now.toISOString(),
        batchId,
        serviceType: c.serviceType || 'HOTSPOT',
        isSynced: true // They are already injected on the router!
      }));

      const batchInfo: BatchInfo = {
        batchId,
        profileName: profileName || cards[0]?.profile || 'default',
        totalGenerated: voucherItems.length,
        totalSynced: voucherItems.length,
        createdAt: targetDate && targetDate !== 'غير محدد التاريخ' ? `${targetDate}T12:00:00.000Z` : now.toISOString(),
        comment: batchComment || `كروت مستوردة من الراوتر [تاريخ الحقن: ${dateTag}]`,
        serviceType: cards[0]?.serviceType || 'HOTSPOT',
        price: Number(price || 0),
        prefix: ''
      };

      const result = voucherDb.insertBatchTransaction(batchInfo, voucherItems);

      res.json({
        success: true,
        batchId,
        importedCount: result.inserted,
        skippedCount: result.skipped,
        message: `تم بنجاح استيراد ${result.inserted} كرت إلى إدارة المخزون والدفعات برقم الدفعة (${batchId})`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================================
  // تصدير واستيراد نسخة احتياطية كاملة لقاعدة بيانات الكروت والقوالب
  // ============================================================
  router.get('/api/vouchers/db/export', (req: Request, res: Response) => {
    try {
      const snapshot = voucherDb.exportSnapshot();
      const shouldDownload = req.query.download === '1' || req.query.download === 'true';
      if (shouldDownload) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        res.setHeader('Content-Disposition', `attachment; filename="zctrl-vouchers-backup-${stamp}.json"`);
      }
      res.json({
        success: true,
        snapshot
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'فشل تصدير قاعدة البيانات' });
    }
  });

  router.post('/api/vouchers/db/import', (req: Request, res: Response) => {
    try {
      const { snapshot, mode } = req.body || {};
      const payload = snapshot || req.body;
      const safeMode: 'merge' | 'replace' = mode === 'replace' ? 'replace' : 'merge';
      const result = voucherDb.importSnapshot(payload, safeMode);
      res.json({
        success: true,
        ...result,
        message:
          safeMode === 'replace'
            ? `تم استعادة النسخة الاحتياطية بنجاح (${result.importedBatches} دفعة و${result.importedVouchers} كرت)`
            : `تم دمج النسخة الاحتياطية بنجاح (${result.importedBatches} دفعة و${result.importedVouchers} كرت جديد)`
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || 'فشل استيراد النسخة الاحتياطية' });
    }
  });

  return router;
}
