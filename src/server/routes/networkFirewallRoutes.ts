import { Router, type Request, type Response } from "express";
import { translateErrorMessage } from "../../lib/errorTranslator.ts";
import { getDeviceNameFromCache, queueMacForLookup } from "../oui-lookup.ts";
import { ftpService } from "../ftp-service.ts";
import { sanitizeSafePath, validateSafeFileName } from "../security-shield.ts";
import { recordAudit } from "../rbac.ts";
import { appLogger } from "../rotatingLogger.ts";
import { randomSecureHex } from "../utils/routerNormalizers.ts";
import {
  MikrotikAPI,
  invalidateCache,
  sanitizeInput,
  resolveSimpleQueueId,
  lastWirelessScanCache,
  normalizeSimpleQueue,
  normalizeDhcpLease
} from "../runtimeContext.ts";
import {
  queryWirelessWithFallback,
  executeWirelessCommandWithFallback
} from "../routeros/wirelessHelper.ts";

export function createNetworkFirewallRoutes(): Router {
  const router = Router();

// ==========================================
// QUEUES & IP BINDINGS & DHCP
// ==========================================
router.post("/api/mikrotik/queues", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const name = sanitizeInput(req.body.name);
    const target = sanitizeInput(req.body.target);
    const maxLimit = sanitizeInput(req.body.maxLimit);
    const limitAt = sanitizeInput(req.body.limitAt);
    const priority = sanitizeInput(req.body.priority);
    const burstLimit = sanitizeInput(req.body.burstLimit);
    const burstThreshold = sanitizeInput(req.body.burstThreshold);
    const burstTime = sanitizeInput(req.body.burstTime);
    const parent = sanitizeInput(req.body.parent);
    const queue = sanitizeInput(req.body.queue);
    const comment = sanitizeInput(req.body.comment);
    const disabled = req.body.disabled;

    if (!name || !target) return res.status(400).json({ success: false, message: "الاسم والهدف مطلوبان" });

    const params = [
      `=name=${name}`,
      `=target=${target}`
    ];
    if (maxLimit) params.push(`=max-limit=${maxLimit}`);
    if (limitAt) params.push(`=limit-at=${limitAt}`);
    if (priority) params.push(`=priority=${priority}`);
    if (burstLimit) params.push(`=burst-limit=${burstLimit}`);
    if (burstThreshold) params.push(`=burst-threshold=${burstThreshold}`);
    if (burstTime) params.push(`=burst-time=${burstTime}`);
    if (parent && parent !== 'none') params.push(`=parent=${parent}`);
    if (queue && queue !== 'default') params.push(`=queue=${queue}`);
    if (comment) params.push(`=comment=${comment}`);
    if (disabled !== undefined) params.push(`=disabled=${disabled ? 'yes' : 'no'}`);

    await client.query('/queue/simple/add', params);
    invalidateCache("/queue");
    res.json({ success: true, message: `تم إنشاء محدد السرعة (${name}) بنجاح على الراوتر` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/queues/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const resolvedId = await resolveSimpleQueueId(client, rawId);
    if (!resolvedId || !resolvedId.startsWith('*')) {
      return res.status(404).json({ success: false, message: `تعذر العثور على قاعدة السرعة (${rawId}) في الراوتر` });
    }
    const {
      name, target, maxLimit, limitAt, priority, disabled,
      burstLimit, burstThreshold, burstTime, parent, queue, comment
    } = req.body;

    const params = [`=.id=${resolvedId}`];
    if (name) params.push(`=name=${sanitizeInput(name)}`);
    if (target) params.push(`=target=${sanitizeInput(target)}`);
    if (maxLimit !== undefined) {
      const ml = sanitizeInput(maxLimit);
      params.push(`=max-limit=${ml || '0/0'}`);
    }
    if (limitAt !== undefined) {
      const la = sanitizeInput(limitAt);
      params.push(`=limit-at=${la || '0/0'}`);
    }
    if (priority !== undefined) {
      const pr = sanitizeInput(priority);
      if (pr) params.push(`=priority=${pr}`);
    }
    if (burstLimit !== undefined) {
      const bl = sanitizeInput(burstLimit);
      params.push(`=burst-limit=${bl || '0/0'}`);
    }
    if (burstThreshold !== undefined) {
      const bt = sanitizeInput(burstThreshold);
      params.push(`=burst-threshold=${bt || '0/0'}`);
    }
    if (burstTime !== undefined) {
      const btm = sanitizeInput(burstTime);
      params.push(`=burst-time=${btm || '0s/0s'}`);
    }
    if (parent !== undefined) {
      const pa = sanitizeInput(parent);
      params.push(`=parent=${(pa && pa !== 'none') ? pa : 'none'}`);
    }
    if (queue !== undefined) {
      const qu = sanitizeInput(queue);
      if (qu) params.push(`=queue=${qu}`);
    }
    if (comment !== undefined) {
      params.push(`=comment=${sanitizeInput(comment)}`);
    }
    if (disabled !== undefined) params.push(`=disabled=${disabled ? 'yes' : 'no'}`);

    await client.query('/queue/simple/set', params);
    invalidateCache("/queue");
    res.json({ success: true, message: "تم تحديث محدد السرعة بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/queues/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const resolvedId = await resolveSimpleQueueId(client, rawId);
    if (!resolvedId || !resolvedId.startsWith('*')) {
      return res.status(404).json({ success: false, message: `تعذر العثور على قاعدة السرعة (${rawId}) في الراوتر` });
    }
    await client.query('/queue/simple/remove', [`=.id=${resolvedId}`]);
    invalidateCache("/queue");
    res.json({ success: true, message: "تم حذف قاعدة تحديد السرعة من الراوتر بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Bulk/Batch Delete Queues (single name->id map lookup + bounded parallel execution)
router.post("/api/mikrotik/queues/batch-delete", async (req: Request, res: Response) => {
  req.setTimeout(180000);
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المعرفات مطلوبة" });
    }
    const sanitizedIds = ids.map((id: any) => sanitizeInput(String(id))).filter(Boolean);
    const needsLookup = sanitizedIds.some((id) => !id.startsWith('*'));
    const nameToIdMap = new Map<string, string>();
    if (needsLookup) {
      const list = await client.querySafe('/queue/simple/print', ['=.proplist=.id,name'], { rapid: true });
      if (Array.isArray(list)) {
        for (const q of list) {
          if (q?.['.id'] && q?.name) {
            nameToIdMap.set(String(q.name).toLowerCase(), q['.id']);
          }
        }
      }
    }

    const resolvedIds = sanitizedIds
      .map((id) => (id.startsWith('*') ? id : nameToIdMap.get(id.toLowerCase()) || id))
      .filter((id) => id.startsWith('*'));

    let successCount = 0;
    for (let i = 0; i < resolvedIds.length; i += 3) {
      const chunk = resolvedIds.slice(i, i + 3);
      const results = await Promise.allSettled(
        chunk.map((resolvedId) => client.query('/queue/simple/remove', [`=.id=${resolvedId}`], { rapid: true }))
      );
      successCount += results.filter((r) => r.status === 'fulfilled').length;
    }
    invalidateCache("/queue");
    res.json({ success: true, message: `تم حذف ${successCount} قاعدة سرعة بنجاح`, count: successCount });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Bulk/Batch Toggle Queues (single name->id map lookup + bounded parallel execution)
router.post("/api/mikrotik/queues/batch-toggle", async (req: Request, res: Response) => {
  req.setTimeout(180000);
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const { ids, disabled } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المعرفات مطلوبة" });
    }
    const isDisabled = Boolean(disabled);
    const sanitizedIds = ids.map((id: any) => sanitizeInput(String(id))).filter(Boolean);
    const needsLookup = sanitizedIds.some((id) => !id.startsWith('*'));
    const nameToIdMap = new Map<string, string>();
    if (needsLookup) {
      const list = await client.querySafe('/queue/simple/print', ['=.proplist=.id,name'], { rapid: true });
      if (Array.isArray(list)) {
        for (const q of list) {
          if (q?.['.id'] && q?.name) {
            nameToIdMap.set(String(q.name).toLowerCase(), q['.id']);
          }
        }
      }
    }

    const resolvedIds = sanitizedIds
      .map((id) => (id.startsWith('*') ? id : nameToIdMap.get(id.toLowerCase()) || id))
      .filter((id) => id.startsWith('*'));

    let successCount = 0;
    for (let i = 0; i < resolvedIds.length; i += 3) {
      const chunk = resolvedIds.slice(i, i + 3);
      const results = await Promise.allSettled(
        chunk.map((resolvedId) =>
          client.query('/queue/simple/set', [`=.id=${resolvedId}`, `=disabled=${isDisabled ? 'yes' : 'no'}`], { rapid: true })
        )
      );
      successCount += results.filter((r) => r.status === 'fulfilled').length;
    }
    invalidateCache("/queue");
    res.json({
      success: true,
      message: `تم ${isDisabled ? 'تعطيل' : 'تفعيل'} ${successCount} قاعدة سرعة بنجاح`,
      count: successCount
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/ip-bindings", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const { macAddress, address, type, comment } = req.body;
    const params = [`=type=${sanitizeInput(type) || 'bypassed'}`];
    if (macAddress) params.push(`=mac-address=${sanitizeInput(macAddress)}`);
    if (address) params.push(`=address=${sanitizeInput(address)}`);
    if (comment) params.push(`=comment=${sanitizeInput(comment)}`);

    await client.query('/ip/hotspot/ip-binding/add', params);
    invalidateCache("/ip/hotspot/ip-binding");
    res.json({ success: true, message: "تم إضافة تثبيت الـ IP/MAC بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/ip-bindings/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const id = sanitizeInput(req.params.id);
    await client.query('/ip/hotspot/ip-binding/remove', [`=.id=${id}`]);
    invalidateCache("/ip/hotspot/ip-binding");
    res.json({ success: true, message: "تم الحذف بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Bulk/Batch Delete IP Bindings
router.post("/api/mikrotik/ip-bindings/batch-delete", async (req: Request, res: Response) => {
  req.setTimeout(180000);
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المعرفات مطلوبة" });
    }
    let successCount = 0;
    const sanitizedIds = ids.map((id: any) => sanitizeInput(String(id))).filter(Boolean);

    for (let i = 0; i < sanitizedIds.length; i += 30) {
      const chunk = sanitizedIds.slice(i, i + 30);
      for (const id of chunk) {
        try {
          await client.query('/ip/hotspot/ip-binding/remove', [`=.id=${id}`], { rapid: true });
          successCount++;
        } catch (rmErr: unknown) {
          appLogger.warn('networkFirewall', 'Batch delete IP binding item failed', {
            id,
            error: rmErr instanceof Error ? rmErr.message : String(rmErr)
          });
        }
      }
      if (i + 30 < sanitizedIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
    invalidateCache("/ip/hotspot/ip-binding");
    res.json({ success: true, message: `تم حذف ${successCount} عنصر من قائمة IP Binding بنجاح`, count: successCount });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/dhcp/leases", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const { address, macAddress, hostName, comment } = req.body;
    if (!address || !macAddress) {
      return res.status(400).json({ success: false, message: "عنوان IP وعنوان MAC مطلوبان" });
    }
    const params = [
      `=address=${sanitizeInput(address)}`,
      `=mac-address=${sanitizeInput(macAddress)}`
    ];
    if (hostName) params.push(`=host-name=${sanitizeInput(hostName)}`);
    if (comment) params.push(`=comment=${sanitizeInput(comment)}`);

    await client.query('/ip/dhcp-server/lease/add', params);
    invalidateCache("/ip/dhcp-server/lease");
    res.json({ success: true, message: "تم حجز وتثبيت العنوان بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/dhcp/leases/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const id = sanitizeInput(req.params.id);
    await client.query('/ip/dhcp-server/lease/remove', [`=.id=${id}`]);
    invalidateCache("/ip/dhcp-server/lease");
    res.json({ success: true, message: "تم حذف حجز العنوان بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Bulk/Batch Delete DHCP Leases
router.post("/api/mikrotik/dhcp/leases/batch-delete", async (req: Request, res: Response) => {
  req.setTimeout(180000);
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المعرفات مطلوبة" });
    }
    let successCount = 0;
    const sanitizedIds = ids.map((id: any) => sanitizeInput(String(id))).filter(Boolean);

    for (let i = 0; i < sanitizedIds.length; i += 30) {
      const chunk = sanitizedIds.slice(i, i + 30);
      for (const id of chunk) {
        try {
          await client.query('/ip/dhcp-server/lease/remove', [`=.id=${id}`], { rapid: true });
          successCount++;
        } catch (rmErr: unknown) {
          appLogger.warn('networkFirewall', 'Batch delete DHCP lease item failed', {
            id,
            error: rmErr instanceof Error ? rmErr.message : String(rmErr)
          });
        }
      }
      if (i + 30 < sanitizedIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
    invalidateCache("/ip/dhcp-server/lease");
    res.json({ success: true, message: `تم حذف ${successCount} حجز من سيرفر DHCP بنجاح`, count: successCount });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Convert Dynamic DHCP Leases to Static natively via /ip/dhcp-server/lease/make-static
router.post("/api/mikrotik/dhcp/leases/make-static", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : req.body?.id ? [req.body.id] : [];
    const sanitizedIds = rawIds.map((id: any) => sanitizeInput(String(id))).filter(Boolean);
    if (sanitizedIds.length === 0) {
      return res.status(400).json({ success: false, message: "معرفات الحجوزات مطلوبة" });
    }

    let successCount = 0;
    let lastError = '';
    for (const id of sanitizedIds) {
      try {
        await client.query('/ip/dhcp-server/lease/make-static', [`=.id=${id}`]);
        successCount++;
      } catch (e: any) {
        lastError = translateErrorMessage(e);
      }
    }

    invalidateCache("/ip/dhcp-server/lease");
    if (successCount === 0) {
      return res.status(500).json({ success: false, message: lastError || "تعذر تحويل الحجز إلى ثابت" });
    }
    res.json({
      success: true,
      count: successCount,
      total: sanitizedIds.length,
      message: sanitizedIds.length === 1
        ? "تم تحويل العنوان إلى حجز ثابت بنجاح"
        : `تم تحويل ${successCount} من أصل ${sanitizedIds.length} عنوان إلى حجز ثابت بنجاح`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULED TASKS (ROUTEROS /system/scheduler)
// ═══════════════════════════════════════════════════════════════════════════
router.get("/api/mikrotik/schedulers", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const raw = await client.querySafe('/system/scheduler/print');
    const schedulers = (Array.isArray(raw) ? raw : []).map((s: any) => ({
      id: s['.id'] || s.id,
      name: s.name || '',
      startDate: s['start-date'] || '',
      startTime: s['start-time'] || '',
      interval: s.interval || '0s',
      onEvent: s['on-event'] || '',
      disabled: s.disabled === 'true' || s.disabled === true || s.disabled === 'yes',
      runCount: parseInt(s['run-count'] || '0', 10),
      nextRun: s['next-run'] || '',
      owner: s.owner || '',
      policy: s.policy || '',
      comment: s.comment || ''
    }));
    res.json({ success: true, data: schedulers });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/schedulers", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const { name, startTime, startDate, interval, onEvent, disabled, comment, policy } = req.body;
    if (!name || !onEvent) {
      return res.status(400).json({ success: false, message: "اسم المهمة والأمر البرمجي (on-event) مطلوبان" });
    }
    const cleanName = sanitizeInput(name);
    const params = [
      `=name=${cleanName}`,
      `=on-event=${onEvent}`,
      `=start-time=${sanitizeInput(startTime) || 'startup'}`,
      `=interval=${sanitizeInput(interval) || '1d'}`,
      `=disabled=${disabled ? 'yes' : 'no'}`
    ];
    if (startDate) params.push(`=start-date=${sanitizeInput(startDate)}`);
    if (comment) params.push(`=comment=${sanitizeInput(comment)}`);
    if (policy) params.push(`=policy=${sanitizeInput(policy)}`);
    else params.push('=policy=read,write,policy,test,reboot');

    await client.query('/system/scheduler/add', params);
    invalidateCache('/system/scheduler');
    res.json({ success: true, message: `تمت إضافة المهمة المجدولة (${cleanName}) بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/schedulers/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const { name, startTime, startDate, interval, onEvent, disabled, comment, policy } = req.body;
    const params = [`=.id=${rawId}`];
    if (name) params.push(`=name=${sanitizeInput(name)}`);
    if (onEvent) params.push(`=on-event=${onEvent}`);
    if (startTime !== undefined) params.push(`=start-time=${sanitizeInput(startTime)}`);
    if (startDate !== undefined) params.push(`=start-date=${sanitizeInput(startDate)}`);
    if (interval !== undefined) params.push(`=interval=${sanitizeInput(interval)}`);
    if (disabled !== undefined) params.push(`=disabled=${disabled ? 'yes' : 'no'}`);
    if (comment !== undefined) params.push(`=comment=${sanitizeInput(comment)}`);
    if (policy) params.push(`=policy=${sanitizeInput(policy)}`);

    await client.query('/system/scheduler/set', params);
    invalidateCache('/system/scheduler');
    res.json({ success: true, message: "تم تحديث المهمة المجدولة بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/schedulers/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const id = sanitizeInput(req.params.id);
    await client.query('/system/scheduler/remove', [`=.id=${id}`]);
    invalidateCache('/system/scheduler');
    recordAudit(req, "delete_scheduler", "scheduler", "success", { resourceId: id });
    res.json({ success: true, message: "تم حذف المهمة المجدولة بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/schedulers/:id/run", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const id = sanitizeInput(req.params.id);
    const schedList = await client.querySafe('/system/scheduler/print');
    const target = (Array.isArray(schedList) ? schedList : []).find((s: any) => s['.id'] === id || s.id === id);
    if (!target) {
      return res.status(404).json({ success: false, message: "المهمة غير موجودة بالراوتر" });
    }
    const onEvent = target['on-event'];
    if (!onEvent || !onEvent.trim()) {
      return res.status(400).json({ success: false, message: "المهمة لا تحتوي على أمر تنفيذي" });
    }
    if (onEvent.trim().toLowerCase().includes('reboot')) {
      recordAudit(req, "run_scheduler_reboot", "scheduler", "success", { resourceId: target.name || id });
      await client.querySafe('/system/reboot');
      return res.json({ success: true, message: `جاري إعادة تشغيل الراوتر الآن بناءً على أمر (${target.name || id})...` });
    }
    const cleanScript = onEvent.trim();
    // Execute arbitrary RouterOS script reliably via temporary /system/script
    const tempScriptName = `zctrl_run_${Date.now()}_${randomSecureHex(3)}`;
    const addRes: any = await client.query('/system/script/add', [
      `=name=${tempScriptName}`,
      `=source=${cleanScript}`,
      `=policy=${target.policy || 'read,write,policy,test,reboot'}`
    ]);
    const scriptId = addRes?.[0]?.ret || addRes?.ret || tempScriptName;
    try {
      await client.query('/system/script/run', [`=number=${scriptId}`]);
    } finally {
      await client.querySafe('/system/script/remove', [`=.id=${scriptId}`]).catch(async () => {
        const list = await client.querySafe('/system/script/print').catch(() => []);
        const found = (Array.isArray(list) ? list : []).find((s: any) => s.name === tempScriptName);
        if (found?.['.id']) {
          await client.querySafe('/system/script/remove', [`=.id=${found['.id']}`]).catch((rmErr: unknown) => {
            appLogger.warn('networkFirewall', 'Failed to remove temporary scheduler script', {
              tempScriptName,
              error: rmErr instanceof Error ? rmErr.message : String(rmErr)
            });
          });
        }
      });
    }
    recordAudit(req, "run_scheduler", "scheduler", "success", { resourceId: target.name || id });
    res.json({ success: true, message: `تم تنفيذ أمر المهمة المجدولة (${target.name || id}) بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});


// ==========================================
// WIRELESS, ANTENNAS & HOTSPOT PORTAL API
// ==========================================

// 1. Get Wireless Interfaces & SSIDs
router.get("/api/mikrotik/wireless", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    const { data: rawInterfaces } = await queryWirelessWithFallback(
      client,
      '/print',
      undefined,
      ['/caps-man/interface/print']
    );

    // Also get registration table to count connected clients per interface (v6 wireless / v7.13+ wifi / v7.0-7.12 wifiwave2)
    const { data: regTable } = await queryWirelessWithFallback(
      client,
      '/registration-table/print'
    );

    const clientsCountMap: Record<string, number> = {};
    if (Array.isArray(regTable)) {
      regTable.forEach((r: any) => {
        const iface = r?.interface || 'unknown';
        clientsCountMap[iface] = (clientsCountMap[iface] || 0) + 1;
      });
    }

    const interfaces = (Array.isArray(rawInterfaces) ? rawInterfaces : []).map((w: any) => {
      const name = w?.name || 'wlan';
      return {
        id: w?.['.id'] || w?.id || name,
        name: name,
        ssid: w?.ssid || w?.['configuration.ssid'] || name,
        band: w?.band || w?.['configuration.band'] || '2ghz-b/g/n',
        frequency: w?.frequency || w?.['channel.frequency'] || 'auto',
        channelWidth: w?.['channel-width'] || w?.['channel.width'] || '20/40mhz',
        mode: w?.mode || 'ap-bridge',
        securityProfile: w?.['security-profile'] || w?.['security.profile'] || 'default',
        txPower: w?.['tx-power'] || w?.['tx-power-mode'] || 'default',
        hideSsid: w?.['hide-ssid'] === 'yes' || w?.['hide-ssid'] === 'true' || w?.['hide-ssid'] === true,
        disabled: w?.disabled === 'yes' || w?.disabled === 'true' || w?.disabled === true,
        running: w?.running === 'yes' || w?.running === 'true' || w?.running === true || w?.inactive !== 'true',
        macAddress: w?.['mac-address'] || '',
        radioName: w?.['radio-name'] || '',
        comment: w?.comment || '',
        clientsCount: clientsCountMap[name] || 0
      };
    });

    res.json({ success: true, data: interfaces });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 2. Update Wireless Interface Configuration
router.post("/api/mikrotik/wireless/update", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { id, name, ssid, frequency, band, channelWidth, mode, securityProfile, txPower, hideSsid, disabled, comment } = req.body;
    if (!id && !name) {
      return res.status(400).json({ success: false, message: "معرف الواجهة اللاسلكية مطلوب" });
    }

    const params: string[] = [];
    if (id) params.push(`=.id=${id}`);
    else if (name) params.push(`=numbers=${name}`);

    if (ssid !== undefined) params.push(`=ssid=${ssid}`);
    if (frequency !== undefined) params.push(`=frequency=${frequency}`);
    if (band !== undefined) params.push(`=band=${band}`);
    if (channelWidth !== undefined) params.push(`=channel-width=${channelWidth}`);
    if (mode !== undefined) params.push(`=mode=${mode}`);
    if (securityProfile !== undefined) params.push(`=security-profile=${securityProfile}`);
    if (txPower !== undefined && txPower !== 'default') params.push(`=tx-power=${txPower}`);
    if (hideSsid !== undefined) params.push(`=hide-ssid=${hideSsid ? 'yes' : 'no'}`);
    if (disabled !== undefined) params.push(`=disabled=${disabled ? 'yes' : 'no'}`);
    if (comment !== undefined) params.push(`=comment=${comment}`);

    // Standard wireless set, RouterOS v7.13+ wifi set, or v7.0-7.12 wifiwave2 set
    await executeWirelessCommandWithFallback(client, 'set', params);

    invalidateCache('/interface/wireless');
    invalidateCache('/interface/wifi');
    invalidateCache('/interface/wifiwave2');

    res.json({
      success: true,
      message: `تم تحديث إعدادات الشبكة اللاسلكية ${name || ssid || ''} بنجاح وأمان`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 2.1 Quick Toggle Wireless Interface State (Enable / Disable)
router.post("/api/mikrotik/wireless/toggle", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { id, name, disabled } = req.body;
    if (!id && !name) {
      return res.status(400).json({ success: false, message: "معرف الواجهة اللاسلكية مطلوب" });
    }
    const disabledVal = disabled ? 'yes' : 'no';
    const params: string[] = [];
    if (id) params.push(`=.id=${id}`);
    else if (name) params.push(`=numbers=${name}`);
    params.push(`=disabled=${disabledVal}`);

    await executeWirelessCommandWithFallback(client, 'set', params);

    invalidateCache('/interface/wireless');
    invalidateCache('/interface/wifi');
    invalidateCache('/interface/wifiwave2');

    res.json({
      success: true,
      message: disabled ? `تم تعطيل الواجهة اللاسلكية بنجاح` : `تم تفعيل وتشغيل الواجهة اللاسلكية بنجاح`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 2.2 Add Virtual AP (Slave SSID) on Master Interface
router.post("/api/mikrotik/wireless/add-vap", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { masterInterface, name, ssid, securityProfile, disabled, comment, hideSsid } = req.body;
    if (!masterInterface || !ssid) {
      return res.status(400).json({ success: false, message: "الواجهة الرئيسية واسم الشبكة (SSID) مطلوبان" });
    }

    const vapName = (name || `vap-${Date.now().toString().slice(-4)}`).trim();
    const params = [
      `=name=${vapName}`,
      `=master-interface=${masterInterface}`,
      `=ssid=${ssid.trim()}`,
      `=mode=ap-bridge`,
      `=disabled=${disabled ? 'yes' : 'no'}`
    ];
    if (securityProfile) params.push(`=security-profile=${securityProfile}`);
    if (comment) params.push(`=comment=${comment}`);
    if (hideSsid) params.push(`=hide-ssid=yes`);

    await executeWirelessCommandWithFallback(client, 'add', params);

    invalidateCache('/interface/wireless');
    invalidateCache('/interface/wifi');
    invalidateCache('/interface/wifiwave2');

    res.json({
      success: true,
      message: `تم إنشاء نقطة البث الافتراضية (${ssid}) بنجاح`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Hardware Cool-down Protection for Wireless RF chip and CPU

// 2.2b Wireless Frequency Scanner & Clean Channel Detection (/interface wireless scan)
// Strictly Real Hardware Scan — Zero Simulation / Zero Fake Data
router.post("/api/mikrotik/wireless/scan", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { iface, duration = 3, band = '2ghz' } = req.body;
    const scanDuration = Math.min(Math.max(Number(duration) || 3, 1), 10);

    // 1. Check or pick interface
    let targetIface = (iface || '').trim();

    const { data: wirelessList, driver: detectedWirelessDriver } = await queryWirelessWithFallback(
      client,
      '/print'
    );

    if (!Array.isArray(wirelessList) || wirelessList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "لا توجد واجهات لاسلكية (Wireless / WiFi Interfaces) مفعلة على جهاز المايكروتك المتصل للقيام بعملية المسح الفعلي. يمنع البرنامج أي مسح وهمي."
      });
    }

    if (!targetIface) {
      targetIface = wirelessList[0]?.name || 'wlan1';
    }

    // Check 10-second hardware cooldown to protect RF chip and CPU from heat
    const cooldownKey = `${client.getConfig()?.host || 'router'}:${targetIface}:${band}`;
    const recent = lastWirelessScanCache.get(cooldownKey);
    const now = Date.now();
    if (recent && (now - recent.timestamp < 10000)) {
      return res.json({
        ...recent.payload,
        isCooldownServed: true,
        cooldownRemainingSeconds: Math.ceil((10000 - (now - recent.timestamp)) / 1000),
        message: "تم تفعيل درع تبريد الراديو لحماية معالج الراوتر والشريحة من السخونة؛ تم إرجاع نتائج الفحص الأخيرة."
      });
    }

    let scanResults: any[] = [];
    let freqMonitorResults: any[] = [];

    // Real physical scan on hardware across v6 wireless, v7.13+ wifi, and v7.0-7.12 wifiwave2
    try {
      const preferredPrefix =
        detectedWirelessDriver === '/interface/wireless' ||
        detectedWirelessDriver === '/interface/wifi' ||
        detectedWirelessDriver === '/interface/wifiwave2'
          ? detectedWirelessDriver
          : null;
      const scanRes = await executeWirelessCommandWithFallback(
        client,
        'scan',
        [`=numbers=${targetIface}`, `=duration=${scanDuration}`],
        preferredPrefix
      );
      scanResults = Array.isArray(scanRes.result) ? scanRes.result : [];
    } catch (scanErr: any) {
      return res.status(500).json({
        success: false,
        message: `فشل تنفيذ أمر مسح الترددات الحقيقي على واجهة (${targetIface}): ${translateErrorMessage(scanErr)}`
      });
    }

    // Also check frequency-monitor if available on RouterOS (optional non-blocking)
    try {
      const fmRes = await executeWirelessCommandWithFallback(client, 'frequency-monitor', [
        `=numbers=${targetIface}`,
        `=duration=${scanDuration}`
      ]);
      freqMonitorResults = Array.isArray(fmRes.result) ? fmRes.result : [];
    } catch {
      freqMonitorResults = [];
    }

    // Strictly real networks only — zero fake/simulated networks!
    const rawNetworks = Array.isArray(scanResults) ? scanResults : [];

    const networks: any[] = rawNetworks.map((n: any, idx: number) => {
      const channelStr = String(n.channel || n.frequency || '2412');
      const freqMatch = channelStr.match(/(\d{4})/);
      const freq = freqMatch ? parseInt(freqMatch[1], 10) : 2412;
      const sigVal = parseInt(String(n.sig || n.signal || '-75').replace(/[^0-9-]/g, ''), 10) || -75;
      const nfVal = parseInt(String(n.nf || n['noise-floor'] || '-102').replace(/[^0-9-]/g, ''), 10) || -102;
      const snrVal = parseInt(String(n.snr || '25').replace(/[^0-9-]/g, ''), 10) || Math.max(sigVal - nfVal, 5);

      return {
        id: `net-${idx}-${n.address || idx}`,
        bssid: n.address || `02:00:00:00:00:${(idx + 1).toString(16).padStart(2, '0')}`,
        ssid: n.ssid || '(شبكة مخفية Hidden)',
        channel: channelStr,
        frequency: freq,
        signal: sigVal,
        noiseFloor: nfVal,
        snr: snrVal,
        radioName: n['radio-name'] || '',
        routeros: !!n['routeros-version'],
        privacy: n.privacy === 'yes' || n.privacy === true
      };
    });

    // 2. Build Spectrum Analysis for standard channels (2.4 GHz or 5 GHz)
    const targetBand = (band || '2ghz').toLowerCase();
    const channels24G = [
      { ch: 1, freq: 2412, nonOverlap: true },
      { ch: 2, freq: 2417, nonOverlap: false },
      { ch: 3, freq: 2422, nonOverlap: false },
      { ch: 4, freq: 2427, nonOverlap: false },
      { ch: 5, freq: 2432, nonOverlap: false },
      { ch: 6, freq: 2437, nonOverlap: true },
      { ch: 7, freq: 2442, nonOverlap: false },
      { ch: 8, freq: 2447, nonOverlap: false },
      { ch: 9, freq: 2452, nonOverlap: false },
      { ch: 10, freq: 2457, nonOverlap: false },
      { ch: 11, freq: 2462, nonOverlap: true },
      { ch: 12, freq: 2467, nonOverlap: false },
      { ch: 13, freq: 2472, nonOverlap: false }
    ];

    const channels5G = [
      { ch: 36, freq: 5180, nonOverlap: true, isDfs: false },
      { ch: 40, freq: 5200, nonOverlap: true, isDfs: false },
      { ch: 44, freq: 5220, nonOverlap: true, isDfs: false },
      { ch: 48, freq: 5240, nonOverlap: true, isDfs: false },
      { ch: 52, freq: 5260, nonOverlap: true, isDfs: true },
      { ch: 56, freq: 5280, nonOverlap: true, isDfs: true },
      { ch: 60, freq: 5300, nonOverlap: true, isDfs: true },
      { ch: 64, freq: 5320, nonOverlap: true, isDfs: true },
      { ch: 149, freq: 5745, nonOverlap: true, isDfs: false },
      { ch: 153, freq: 5765, nonOverlap: true, isDfs: false },
      { ch: 157, freq: 5785, nonOverlap: true, isDfs: false },
      { ch: 161, freq: 5805, nonOverlap: true, isDfs: false }
    ];

    const targetList = targetBand === '5ghz' ? channels5G : channels24G;

    // Calculate real interference score for each channel
    const channels = targetList.map((c) => {
      // Direct APs matching this exact channel (within 5MHz)
      const directAps = networks.filter((n) => Math.abs(n.frequency - c.freq) <= 5);
      // Overlapping adjacent APs (within 22MHz for 2.4GHz)
      const adjacentAps = targetBand === '2ghz'
        ? networks.filter((n) => Math.abs(n.frequency - c.freq) > 5 && Math.abs(n.frequency - c.freq) <= 22)
        : [];

      // Calculate weight based on signal strength
      let interferencePoints = 0;
      directAps.forEach((ap) => {
        const strengthWeight = Math.max(0, (100 + ap.signal) * 0.7);
        interferencePoints += strengthWeight;
      });

      adjacentAps.forEach((ap) => {
        const adjacentWeight = Math.max(0, (100 + ap.signal) * 0.45);
        interferencePoints += adjacentWeight;
      });

      // Factor in standard non-overlapping bonus for 1, 6, 11
      if (targetBand === '2ghz' && !c.nonOverlap) {
        interferencePoints += 15;
      }

      // Check real freqMonitorResults if available
      const monitorMatch = freqMonitorResults.find((f: any) => Math.abs(parseInt(f.frequency || '0', 10) - c.freq) <= 5);
      let usagePercent = monitorMatch ? parseInt(String(monitorMatch.use || '0').replace(/[^0-9]/g, ''), 10) : 0;
      if (!usagePercent) {
        usagePercent = Math.min(Math.round(interferencePoints * 0.9 + (directAps.length * 8)), 95);
      }

      const interferenceScore = Math.min(Math.max(Math.round(interferencePoints + (usagePercent * 0.3)), 5), 98);

      let rating: 'excellent' | 'good' | 'fair' | 'poor' = 'good';
      let recommendation = '';
      if (interferenceScore <= 25) {
        rating = 'excellent';
        recommendation = 'قناة ممتازة ونظيفة جداً — الخيار الأفضل للبث';
      } else if (interferenceScore <= 48) {
        rating = 'good';
        recommendation = 'قناة جيدة ومستقرة للبث مع تشويش طفيف';
      } else if (interferenceScore <= 72) {
        rating = 'fair';
        recommendation = 'قناة متوسطة — يوجد تداخل من شبكات مجاورة';
      } else {
        rating = 'poor';
        recommendation = 'قناة مزدحمة بتشويش وتداخل قوي — تجنب البث عليها';
      }

      // Calculate peak competing signal for this channel
      let peakSignal = -105;
      if (directAps.length > 0) {
        peakSignal = Math.max(...directAps.map((a: any) => a.signal));
      } else if (adjacentAps.length > 0) {
        peakSignal = Math.max(...adjacentAps.map((a: any) => a.signal - 15));
      }

      return {
        channelNumber: c.ch,
        frequency: c.freq,
        band: (c.freq > 3000 ? '5ghz' : '2ghz') as '2ghz' | '5ghz',
        interferenceScore,
        usagePercent,
        noiseFloor: monitorMatch?.nf ? parseInt(monitorMatch.nf, 10) : -102,
        peakSignal,
        apCount: directAps.length,
        adjacentApCount: adjacentAps.length,
        rating,
        isNonOverlapping: c.nonOverlap,
        isDfs: (c as any).isDfs || false,
        recommendation
      };
    });

    // 3. Find Best Recommended Channel
    let candidateChannels = channels;
    if (targetBand === '2ghz') {
      const nonOverlapCandidates = channels.filter((c) => c.isNonOverlapping);
      if (nonOverlapCandidates.length > 0) {
        candidateChannels = nonOverlapCandidates;
      }
    } else {
      const nonDfsCandidates = channels.filter((c) => !c.isDfs);
      if (nonDfsCandidates.length > 0) {
        candidateChannels = nonDfsCandidates;
      }
    }

    const sortedByInterference = [...candidateChannels].sort((a, b) => a.interferenceScore - b.interferenceScore);
    const best = sortedByInterference[0] || channels[0];

    const bestChannel = {
      channelNumber: best.channelNumber,
      frequency: best.frequency,
      score: best.interferenceScore,
      reason: targetBand === '2ghz'
        ? `قناة قياسية غير متداخلة (${best.channelNumber}) مع أقل نسبة تشويش (${best.interferenceScore}%) وأقل عدد شبكات متنافسة`
        : `قناة نظيفة ومستقرة بدون متطلبات DFS مع نسبة تداخل منخفضة (${best.interferenceScore}%)`
    };

    const responsePayload = {
      success: true,
      interfaceName: targetIface,
      band: targetBand,
      durationSeconds: scanDuration,
      timestamp: new Date().toISOString(),
      networksCount: networks.length,
      networks,
      channels,
      bestChannel
    };
    if (lastWirelessScanCache.size > 100) {
      const cutoff = Date.now() - 10 * 60 * 1000;
      for (const [k, v] of lastWirelessScanCache.entries()) {
        if (v.timestamp < cutoff) lastWirelessScanCache.delete(k);
      }
    }
    lastWirelessScanCache.set(cooldownKey, { timestamp: Date.now(), payload: responsePayload });
    res.json(responsePayload);
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 2.2c Apply Optimal Channel directly to Wireless Interface
router.post("/api/mikrotik/wireless/apply-channel", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { iface, frequency, channelWidth } = req.body;
    if (!iface || !frequency) {
      return res.status(400).json({ success: false, message: "الواجهة والتردد مطلوبان للتطبيق" });
    }

    // Resolve interface ID if possible
    let resolvedId = iface;
    try {
      const ifaces = await client.querySafe('/interface/wireless/print', [`?name=${iface}`]);
      if (Array.isArray(ifaces) && ifaces.length > 0 && ifaces[0]?.['.id']) {
        resolvedId = ifaces[0]['.id'];
      }
    } catch (lookupErr: unknown) {
      appLogger.warn('networkFirewall', 'Wireless interface ID lookup failed, using name fallback', {
        iface,
        error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr)
      });
    }

    const idParams = [
      `=.id=${resolvedId}`,
      `=frequency=${frequency}`
    ];
    if (channelWidth) {
      idParams.push(`=channel-width=${channelWidth}`);
    }

    const numParams = [
      `=numbers=${iface}`,
      `=frequency=${frequency}`
    ];
    if (channelWidth) {
      numParams.push(`=channel-width=${channelWidth}`);
    }

    try {
      await client.query('/interface/wireless/set', idParams);
    } catch {
      try {
        await client.query('/interface/wifi/set', idParams);
      } catch {
        try {
          await client.query('/interface/wireless/set', numParams);
        } catch {
          await client.query('/interface/wifi/set', numParams);
        }
      }
    }

    invalidateCache('/interface/wireless');
    invalidateCache('/interface/wifi');

    res.json({
      success: true,
      message: `تم تطبيق وضبط التردد ${frequency} MHz على الواجهة (${iface}) بنجاح!`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================================
// ZCTRL UNIVERSAL ANTI-SHARING & ANTI-TETHERING v4.0 API
// RouterOS 6.x / 7.x — HotSpot + PPP + User Manager
// Covers: credential sharing, tethering, proxy bypass
// ==========================================================

const CANONICAL_ANTI_SHARING_SCRIPT_V4 = `# ==========================================================
# ZCTRL UNIVERSAL ANTI-SHARING & ANTI-TETHERING v4.0
# RouterOS 6.x / 7.x — HotSpot + PPP + User Manager
# Covers: credential sharing, tethering, proxy bypass
# ==========================================================

:local ts [:pick [/system clock get date] 0 11]
:local backupName ("zctrl-antishare-v4-before-" . $ts)

:log info "ZCTRL: Anti-Sharing v4.0 starting"

# ----------------------------------------------------------
# 01. BACKUP (timestamped, never overwrite)
# ----------------------------------------------------------
:do {
    :if ([:len [/file find where name=$backupName]] > 0) do={
        /file remove [find where name=$backupName]
    }
    /system backup save name=$backupName
    /export hide-sensitive file=$backupName
    :log info ("ZCTRL: Backup saved as " . $backupName)
} on-error={
    :log warning "ZCTRL: Backup step warning, proceeding with rules"
}

# ----------------------------------------------------------
# 02. CREDENTIAL SHARING (Hotspot + PPP + User Manager)
# ----------------------------------------------------------

# 02a. HOTSPOT PROFILES (existing + future users inherit)
:local hpCount 0
:foreach p in=[/ip hotspot user profile find] do={
    /ip hotspot user profile set $p shared-users=1
    :set hpCount ($hpCount + 1)
}
:log info ("ZCTRL: Hotspot profiles updated = " . $hpCount)

# 02b. PPP PROFILES (existing + future users inherit)
:local ppCount 0
:foreach p in=[/ppp profile find] do={
    /ppp profile set $p only-one=yes
    :set ppCount ($ppCount + 1)
}
:log info ("ZCTRL: PPP profiles updated = " . $ppCount)

# 02c. ROS7 USER MANAGER — set on PROFILE (not user)
:do {
    :local umCount 0
    :foreach p in=[/user-manager profile find] do={
        /user-manager profile set $p shared-users=1
        :set umCount ($umCount + 1)
    }
    :log info ("ZCTRL: ROS7 UM profiles updated = " . $umCount)
} on-error={
    :log info "ZCTRL: ROS7 User Manager not available"
}

# 02d. ROS6 LEGACY USER MANAGER — set on PROFILE
:do {
    :local lmCount 0
    :foreach p in=[/tool user-manager profile find] do={
        /tool user-manager profile set $p shared-users=1
        :set lmCount ($lmCount + 1)
    }
    :log info ("ZCTRL: ROS6 UM profiles updated = " . $lmCount)
} on-error={
    :log info "ZCTRL: ROS6 User Manager not available"
}

# ----------------------------------------------------------
# 03. ANTI-TETHERING (Bluetooth / Wi-Fi Hotspot / USB)
# Forces TTL=1 on traffic leaving LAN toward clients
# ----------------------------------------------------------
:do {
    :local lanIf "LAN"
    :if ([:len [/interface find where name=$lanIf]] = 0) do={
        :if ([:len [/interface list find where name="LAN"]] > 0) do={
            :set lanIf "LAN"
        } else={
            :if ([:len [/interface bridge find]] > 0) do={
                :set lanIf [/interface bridge get [[:pick [/interface bridge find] 0]] name]
            } else={
                :if ([:len [/interface find where type="ether"]] > 0) do={
                    :set lanIf [/interface get [[:pick [/interface find where type="ether"] 0]] name]
                }
            }
        }
    }
    /ip firewall mangle remove [find where comment="ZCTRL Anti-Tethering: force TTL=1"]
    /ip firewall mangle add chain=postrouting out-interface=$lanIf \\
        action=change-ttl new-ttl=set:1 passthrough=no \\
        comment="ZCTRL Anti-Tethering: force TTL=1"
    :log info ("ZCTRL: TTL Mangle added for interface " . $lanIf)
} on-error={
    :log warning "ZCTRL: TTL Mangle creation failed"
}

# ----------------------------------------------------------
# 04. ANTI-PROXY (blocks common proxy ports)
# Drops TCP traffic to known proxy ports
# ----------------------------------------------------------
/ip firewall filter remove [find where comment="ZCTRL Anti-Proxy: common proxy ports (set 1)"]
/ip firewall filter remove [find where comment="ZCTRL Anti-Proxy: common proxy ports (set 2)"]

/ip firewall filter add chain=forward protocol=tcp \\
    dst-port=3128,54321,6515,6666,8000,8001,8008,808,8080,8081,8088 \\
    action=drop comment="ZCTRL Anti-Proxy: common proxy ports (set 1)"

/ip firewall filter add chain=forward protocol=tcp \\
    dst-port=8090,81,8118,8181,82,83,84,85,86,8888,8909,9000,9090 \\
    action=drop comment="ZCTRL Anti-Proxy: common proxy ports (set 2)"

:log info "ZCTRL: Proxy port filters added"

# ----------------------------------------------------------
# 05. VERIFICATION (count-based, fast)
# ----------------------------------------------------------
:local badHp [:len [/ip hotspot user profile find where shared-users>1]]
:local badPp [:len [/ppp profile find where only-one=no]]

:if ($badHp = 0 and $badPp = 0) do={
    :log info "ZCTRL: Anti-Sharing v4.0 verified OK"
} else={
    :log warning ("ZCTRL: leftover — Hotspot profiles >1: " . $badHp . " | PPP not only-one: " . $badPp)
}

:log info "ZCTRL: Anti-Sharing v4.0 finished"
`;

// Helper: auto-resolve LAN interface on router
async function resolveLanInterface(client: any, requested?: string): Promise<string> {
  if (requested && requested !== 'auto' && requested.trim()) {
    return requested.trim();
  }
  try {
    const ifaces = await client.querySafe('/interface/print', undefined, { timeoutSeconds: 3, rapid: true });
    if (Array.isArray(ifaces) && ifaces.length > 0) {
      // Check for exact name "LAN"
      const hasLan = ifaces.find((i: any) => i.name?.toUpperCase() === 'LAN');
      if (hasLan) return hasLan.name;

      // Check for bridge
      const bridge = ifaces.find((i: any) => i.type === 'bridge' || i.name?.toLowerCase().includes('bridge'));
      if (bridge) return bridge.name;

      // Check for interface list named LAN
      try {
        const lists = await client.querySafe('/interface/list/print', undefined, { timeoutSeconds: 2, rapid: true });
        if (Array.isArray(lists) && lists.some((l: any) => l.name?.toUpperCase() === 'LAN')) {
          return 'LAN';
        }
      } catch (listErr: unknown) {
        appLogger.warn('networkFirewall', 'Interface list lookup failed during LAN resolution', {
          error: listErr instanceof Error ? listErr.message : String(listErr)
        });
      }

      // Fallback to first non-WAN interface
      const nonWan = ifaces.find((i: any) => !i.name?.toLowerCase().includes('wan') && !i.name?.toLowerCase().includes('ether1'));
      if (nonWan) return nonWan.name;

      return ifaces[0].name || 'LAN';
    }
  } catch (ifaceErr: unknown) {
    appLogger.warn('networkFirewall', 'Failed resolving LAN interface, defaulting to LAN', {
      error: ifaceErr instanceof Error ? ifaceErr.message : String(ifaceErr)
    });
  }
  return 'LAN';
}

// GET Anti-Sharing Live Protection Status
router.get("/api/mikrotik/network/anti-sharing/status", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const [hsProfiles, pppProfiles, mangleRules, filterRules, ifaces] = await Promise.all([
      client.querySafe('/ip/hotspot/user/profile/print', undefined, { timeoutSeconds: 4, rapid: true }),
      client.querySafe('/ppp/profile/print', undefined, { timeoutSeconds: 4, rapid: true }),
      client.querySafe('/ip/firewall/mangle/print', undefined, { timeoutSeconds: 4, rapid: true }),
      client.querySafe('/ip/firewall/filter/print', undefined, { timeoutSeconds: 4, rapid: true }),
      client.querySafe('/interface/print', undefined, { timeoutSeconds: 4, rapid: true })
    ]);

    // Hotspot Evaluation
    const hsList = Array.isArray(hsProfiles) ? hsProfiles : [];
    const hsUnprotected = hsList.filter((p: any) => Number(p['shared-users']) > 1).length;
    const hsProtected = hsList.length - hsUnprotected;

    // PPP Evaluation
    const pppList = Array.isArray(pppProfiles) ? pppProfiles : [];
    const pppUnprotected = pppList.filter((p: any) => {
      const val = String(p['only-one'] || '').toLowerCase();
      return val === 'no' || val === 'false' || val === '0';
    }).length;
    const pppProtected = pppList.length - pppUnprotected;

    // User Manager (ROS7 or ROS6 check)
    let umTotal = 0;
    let umUnprotected = 0;
    let umVersion: 'v7' | 'v6' | 'none' = 'none';
    try {
      const ros7Um = await client.querySafe('/user-manager/profile/print', undefined, { timeoutSeconds: 2, rapid: true });
      if (Array.isArray(ros7Um) && ros7Um.length > 0) {
        umVersion = 'v7';
        umTotal = ros7Um.length;
        umUnprotected = ros7Um.filter((p: any) => Number(p['shared-users']) > 1).length;
      }
    } catch {
      try {
        const ros6Um = await client.querySafe('/tool/user-manager/profile/print', undefined, { timeoutSeconds: 2, rapid: true });
        if (Array.isArray(ros6Um) && ros6Um.length > 0) {
          umVersion = 'v6';
          umTotal = ros6Um.length;
          umUnprotected = ros6Um.filter((p: any) => Number(p['shared-users']) > 1).length;
        }
      } catch (v6Err: unknown) {
        appLogger.warn('networkFirewall', 'User Manager profile check unavailable', {
          error: v6Err instanceof Error ? v6Err.message : String(v6Err)
        });
      }
    }

    // Mangle TTL=1 rule
    const mList = Array.isArray(mangleRules) ? mangleRules : [];
    const ttlRule = mList.find((m: any) => {
      const comment = String(m.comment || '').toLowerCase();
      const action = String(m.action || '').toLowerCase();
      return (comment.includes('zctrl anti-tethering') || comment.includes('force ttl=1')) ||
             (action === 'change-ttl' && String(m['new-ttl'] || '').includes('1'));
    });

    const isTtlActive = !!ttlRule && !ttlRule.disabled;
    const ttlInterface = ttlRule?.['out-interface'] || ttlRule?.['out-interface-list'] || '';

    // Filter Anti-Proxy rules
    const fList = Array.isArray(filterRules) ? filterRules : [];
    const proxyRules = fList.filter((f: any) => {
      const c = String(f.comment || '').toLowerCase();
      return c.includes('zctrl anti-proxy') || (f.protocol === 'tcp' && String(f['dst-port'] || '').includes('3128'));
    });
    const isProxyActive = proxyRules.length > 0 && proxyRules.some((r: any) => !r.disabled);

    // Available Interfaces for LAN
    const allIfaces = Array.isArray(ifaces) ? ifaces : [];
    const availableInterfaces = allIfaces.map((i: any) => i.name).filter(Boolean);
    const defaultLan = await resolveLanInterface(client);

    const isFullyProtected =
      hsUnprotected === 0 &&
      pppUnprotected === 0 &&
      umUnprotected === 0 &&
      isTtlActive &&
      isProxyActive;

    res.json({
      success: true,
      status: {
        isFullyProtected,
        hotspot: {
          total: hsList.length,
          protected: hsProtected,
          unprotected: hsUnprotected,
          profiles: hsList.map((p: any) => ({
            id: p['.id'] || p.id,
            name: p.name,
            sharedUsers: Number(p['shared-users']) || 1
          }))
        },
        ppp: {
          total: pppList.length,
          protected: pppProtected,
          unprotected: pppUnprotected,
          profiles: pppList.map((p: any) => ({
            id: p['.id'] || p.id,
            name: p.name,
            onlyOne: p['only-one'] || 'yes'
          }))
        },
        userManager: {
          version: umVersion,
          total: umTotal,
          protected: umTotal - umUnprotected,
          unprotected: umUnprotected
        },
        antiTetheringMangle: {
          active: isTtlActive,
          interface: ttlInterface || defaultLan,
          ruleId: ttlRule?.['.id'] || null,
          disabled: !!ttlRule?.disabled
        },
        antiProxyFilters: {
          active: isProxyActive,
          rulesCount: proxyRules.length
        },
        availableInterfaces,
        defaultLanInterface: defaultLan,
        canonicalScript: CANONICAL_ANTI_SHARING_SCRIPT_V4
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(err) });
  }
});

// POST Execute Anti-Sharing & Anti-Tethering v4.0 on MikroTik
router.post("/api/mikrotik/network/anti-sharing", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { lanInterface: reqLan, createBackup = true } = req.body;
    const targetLan = await resolveLanInterface(client, reqLan);
    const logs: string[] = [];
    const pushLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString('ar-EG')}] ${msg}`);
    };

    pushLog("ZCTRL: بدء تنفيذ حزمة منع مشاركة وبث الإنترنت v4.0...");

    // ----------------------------------------------------
    // 01. BACKUP (Timestamped)
    // ----------------------------------------------------
    const dateStr = new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, '');
    const timeStr = new Date().toTimeString().slice(0, 5).replace(/:/g, '');
    const backupName = `zctrl-antishare-v4-before-${dateStr}-${timeStr}`;

    if (createBackup) {
      try {
        await client.querySafe('/system/backup/save', [`=name=${backupName}`], { timeoutSeconds: 6 });
        pushLog(`ZCTRL: تم أخذ نسخة احتياطية آمنة باسم (${backupName})`);
      } catch (bkErr) {
        pushLog(`ZCTRL: تنبيه - تم تجاوز أخذ النسخة الاحتياطية (${String(bkErr).slice(0, 60)})`);
      }
    }

    // ----------------------------------------------------
    // 02. CREDENTIAL SHARING (Hotspot + PPP + User Manager)
    // ----------------------------------------------------

    // 02a. Hotspot Profiles: shared-users = 1
    let hpCount = 0;
    try {
      const hsProfiles = await client.querySafe('/ip/hotspot/user/profile/print', undefined, { timeoutSeconds: 4 });
      if (Array.isArray(hsProfiles)) {
        for (const prof of hsProfiles) {
          const profId = prof['.id'] || prof.id;
          if (profId) {
            try {
              await client.query('/ip/hotspot/user/profile/set', [
                `=.id=${profId}`,
                `=shared-users=1`
              ]);
              hpCount++;
            } catch (setErr: unknown) {
              appLogger.warn('networkFirewall', 'Failed setting shared-users=1 on Hotspot profile', {
                profId,
                error: setErr instanceof Error ? setErr.message : String(setErr)
              });
            }
          }
        }
      }
      pushLog(`ZCTRL: تم تحديث بروفايلات الهوتسبوت ومنع المشاركة = ${hpCount} بروفايل`);
    } catch (e) {
      pushLog(`ZCTRL: تعذر فحص بروفايلات الهوتسبوت: ${String(e)}`);
    }

    // 02b. PPP Profiles: only-one = yes
    let ppCount = 0;
    try {
      const pppProfiles = await client.querySafe('/ppp/profile/print', undefined, { timeoutSeconds: 4 });
      if (Array.isArray(pppProfiles)) {
        for (const prof of pppProfiles) {
          const profId = prof['.id'] || prof.id;
          if (profId) {
            try {
              await client.query('/ppp/profile/set', [
                `=.id=${profId}`,
                `=only-one=yes`
              ]);
              ppCount++;
            } catch (setErr: unknown) {
              appLogger.warn('networkFirewall', 'Failed setting only-one=yes on PPP profile', {
                profId,
                error: setErr instanceof Error ? setErr.message : String(setErr)
              });
            }
          }
        }
      }
      pushLog(`ZCTRL: تم تحديث بروفايلات البرودباند PPP (only-one=yes) = ${ppCount} بروفايل`);
    } catch (e) {
      pushLog(`ZCTRL: تعذر فحص بروفايلات PPP: ${String(e)}`);
    }

    // 02c. User Manager ROS7 & ROS6
    let umCount = 0;
    try {
      const ros7Um = await client.querySafe('/user-manager/profile/print', undefined, { timeoutSeconds: 3 });
      if (Array.isArray(ros7Um) && ros7Um.length > 0) {
        for (const prof of ros7Um) {
          const profId = prof['.id'] || prof.id;
          if (profId) {
            try {
              await client.query('/user-manager/profile/set', [
                `=.id=${profId}`,
                `=shared-users=1`
              ]);
              umCount++;
            } catch (setErr: unknown) {
              appLogger.warn('networkFirewall', 'Failed setting shared-users=1 on UM v7 profile', {
                profId,
                error: setErr instanceof Error ? setErr.message : String(setErr)
              });
            }
          }
        }
        pushLog(`ZCTRL: تم تحديث بروفايلات User Manager v7 = ${umCount} بروفايل`);
      }
    } catch (v7Err: unknown) {
      appLogger.warn('networkFirewall', 'UM v7 profile print unavailable during anti-sharing', {
        error: v7Err instanceof Error ? v7Err.message : String(v7Err)
      });
    }

    if (umCount === 0) {
      try {
        const ros6Um = await client.querySafe('/tool/user-manager/profile/print', undefined, { timeoutSeconds: 3 });
        if (Array.isArray(ros6Um) && ros6Um.length > 0) {
          for (const prof of ros6Um) {
            const profId = prof['.id'] || prof.id;
            if (profId) {
              try {
                await client.query('/tool/user-manager/profile/set', [
                  `=.id=${profId}`,
                  `=shared-users=1`
                ]);
                umCount++;
              } catch (setErr: unknown) {
                appLogger.warn('networkFirewall', 'Failed setting shared-users=1 on UM v6 profile', {
                  profId,
                  error: setErr instanceof Error ? setErr.message : String(setErr)
                });
              }
            }
          }
          pushLog(`ZCTRL: تم تحديث بروفايلات User Manager v6 = ${umCount} بروفايل`);
        }
      } catch (v6Err: unknown) {
        appLogger.warn('networkFirewall', 'UM v6 profile print unavailable during anti-sharing', {
          error: v6Err instanceof Error ? v6Err.message : String(v6Err)
        });
      }
    }

    // ----------------------------------------------------
    // 03. ANTI-TETHERING (Forces TTL=1 on LAN traffic)
    // ----------------------------------------------------
    try {
      // Clean existing rules first to prevent duplicate accumulation
      const oldMangles = await client.querySafe('/ip/firewall/mangle/print', undefined, { timeoutSeconds: 4 });
      if (Array.isArray(oldMangles)) {
        for (const m of oldMangles) {
          const c = String(m.comment || '').toLowerCase();
          if (c.includes('zctrl anti-tethering') || c.includes('force ttl=1')) {
            try {
              await client.query('/ip/firewall/mangle/remove', [`=.id=${m['.id'] || m.id}`]);
            } catch (rmErr: unknown) {
              appLogger.warn('networkFirewall', 'Failed removing old anti-tethering mangle rule', {
                error: rmErr instanceof Error ? rmErr.message : String(rmErr)
              });
            }
          }
        }
      }

      // Add TTL=1 Mangle Rule on target LAN interface
      await client.query('/ip/firewall/mangle/add', [
        `=chain=postrouting`,
        `=out-interface=${targetLan}`,
        `=action=change-ttl`,
        `=new-ttl=set:1`,
        `=passthrough=no`,
        `=comment=ZCTRL Anti-Tethering: force TTL=1`
      ]);
      pushLog(`ZCTRL: تم إضافة قاعدة كسر بث الهوتسبوت (Mangle TTL=1) على واجهة (${targetLan}) بنجاح`);
    } catch (mErr) {
      // Fallback try with out-interface-list
      try {
        await client.query('/ip/firewall/mangle/add', [
          `=chain=postrouting`,
          `=action=change-ttl`,
          `=new-ttl=set:1`,
          `=passthrough=no`,
          `=comment=ZCTRL Anti-Tethering: force TTL=1`
        ]);
        pushLog(`ZCTRL: تم إضافة قاعدة Mangle TTL=1 بدون تحديد واجهة كبديل آمن`);
      } catch (err2) {
        pushLog(`ZCTRL: تعذر إضافة قاعدة Mangle TTL: ${String(err2)}`);
      }
    }

    // ----------------------------------------------------
    // 04. ANTI-PROXY (Block TCP Proxy Ports)
    // ----------------------------------------------------
    try {
      const oldFilters = await client.querySafe('/ip/firewall/filter/print', undefined, { timeoutSeconds: 4 });
      if (Array.isArray(oldFilters)) {
        for (const f of oldFilters) {
          const c = String(f.comment || '').toLowerCase();
          if (c.includes('zctrl anti-proxy')) {
            try {
              await client.query('/ip/firewall/filter/remove', [`=.id=${f['.id'] || f.id}`]);
            } catch (rmErr: unknown) {
              appLogger.warn('networkFirewall', 'Failed removing old anti-proxy filter rule', {
                error: rmErr instanceof Error ? rmErr.message : String(rmErr)
              });
            }
          }
        }
      }

      // Filter Set 1
      await client.query('/ip/firewall/filter/add', [
        `=chain=forward`,
        `=protocol=tcp`,
        `=dst-port=3128,54321,6515,6666,8000,8001,8008,808,8080,8081,8088`,
        `=action=drop`,
        `=comment=ZCTRL Anti-Proxy: common proxy ports (set 1)`
      ]);

      // Filter Set 2
      await client.query('/ip/firewall/filter/add', [
        `=chain=forward`,
        `=protocol=tcp`,
        `=dst-port=8090,81,8118,8181,82,83,84,85,86,8888,8909,9000,9090`,
        `=action=drop`,
        `=comment=ZCTRL Anti-Proxy: common proxy ports (set 2)`
      ]);

      pushLog("ZCTRL: تم حظر منافذ البروكسي المشبوهة (Anti-Proxy Filters) بنجاح لمنع تجاوز الشبكة");
    } catch (fErr) {
      pushLog(`ZCTRL: تنبيه في إضافة فلاتر البروكسي: ${String(fErr)}`);
    }

    // ----------------------------------------------------
    // 05. PERSIST SCRIPT IN ROUTEROS /system/script
    // ----------------------------------------------------
    try {
      const existingScripts = await client.querySafe('/system/script/print', ['?name=zctrl-anti-sharing-v4'], { timeoutSeconds: 3 });
      if (Array.isArray(existingScripts) && existingScripts.length > 0) {
        for (const s of existingScripts) {
          try {
            await client.query('/system/script/remove', [`=.id=${s['.id'] || s.id}`]);
          } catch (rmErr: unknown) {
            appLogger.warn('networkFirewall', 'Failed removing old zctrl-anti-sharing-v4 script', {
              error: rmErr instanceof Error ? rmErr.message : String(rmErr)
            });
          }
        }
      }

      // Add script
      const scriptWithLan = CANONICAL_ANTI_SHARING_SCRIPT_V4.replace(
        ':local lanIf "LAN"',
        `:local lanIf "${targetLan}"`
      );

      await client.query('/system/script/add', [
        `=name=zctrl-anti-sharing-v4`,
        `=source=${scriptWithLan}`,
        `=policy=read,write,policy,test`,
        `=comment=ZCTRL Universal Anti-Sharing & Anti-Tethering Engine v4.0`
      ]);
      pushLog("ZCTRL: تم حفظ وتثبيت السكربت المصدري في نظام المايكروتك باسم (zctrl-anti-sharing-v4)");
    } catch (sErr) {
      pushLog(`ZCTRL: ملاحظة - حفظ السكربت: ${String(sErr).slice(0, 60)}`);
    }

    // ----------------------------------------------------
    // 06. VERIFICATION
    // ----------------------------------------------------
    let leftoverHp = 0;
    let leftoverPp = 0;
    try {
      const vHs = await client.querySafe('/ip/hotspot/user/profile/print', undefined, { timeoutSeconds: 3 });
      if (Array.isArray(vHs)) {
        leftoverHp = vHs.filter((p: any) => Number(p['shared-users']) > 1).length;
      }
      const vPp = await client.querySafe('/ppp/profile/print', undefined, { timeoutSeconds: 3 });
      if (Array.isArray(vPp)) {
        leftoverPp = vPp.filter((p: any) => {
          const val = String(p['only-one'] || '').toLowerCase();
          return val === 'no' || val === 'false';
        }).length;
      }
    } catch (verErr: unknown) {
      appLogger.warn('networkFirewall', 'Anti-sharing verification check failed', {
        error: verErr instanceof Error ? verErr.message : String(verErr)
      });
    }

    const isVerified = leftoverHp === 0 && leftoverPp === 0;
    if (isVerified) {
      pushLog("ZCTRL: اكتمل الفحص والتحقق بنجاح تام (Anti-Sharing v4.0 verified OK) ✓");
    } else {
      pushLog(`ZCTRL: اكتملت العملية مع وجود بروفايلات غير مقيدة: هوتسبوت=${leftoverHp} | برودباند=${leftoverPp}`);
    }

    // Log to RouterOS
    try {
      await client.querySafe('/log/info', [
        `=message=ZCTRL: Anti-Sharing v4.0 applied successfully (HS:${hpCount}, PPP:${ppCount}, UM:${umCount}, LAN:${targetLan})`
      ]);
    } catch (logErr: unknown) {
      appLogger.warn('networkFirewall', 'Failed writing anti-sharing confirmation to RouterOS log', {
        error: logErr instanceof Error ? logErr.message : String(logErr)
      });
    }

    // Invalidate caches
    invalidateCache('/ip/hotspot/user/profile');
    invalidateCache('/ppp/profile');
    invalidateCache('/ip/firewall/mangle');
    invalidateCache('/ip/firewall/filter');

    recordAudit(req, "apply_anti_sharing", "firewall", "success", {
      resourceId: String(targetLan),
      changes: { before: null, after: { hotspotProfilesUpdated: hpCount, pppProfilesUpdated: ppCount, userManagerProfilesUpdated: umCount } }
    });

    res.json({
      success: true,
      message: "تم تنفيذ إجراءات منع مشاركة وبث الإنترنت على المايكروتك بنجاح تام!",
      data: {
        backupName,
        hotspotProfilesUpdated: hpCount,
        pppProfilesUpdated: ppCount,
        userManagerProfilesUpdated: umCount,
        targetLanInterface: targetLan,
        verification: {
          ok: isVerified,
          leftoverHotspot: leftoverHp,
          leftoverPpp: leftoverPp
        },
        logs
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(err) });
  }
});

// POST Revert Anti-Sharing (Remove TTL & Proxy Rules)
router.post("/api/mikrotik/network/anti-sharing/revert", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
    }

    let removedMangles = 0;
    let removedFilters = 0;

    // Remove Mangle rules
    const mangles = await client.querySafe('/ip/firewall/mangle/print', undefined, { timeoutSeconds: 4 });
    if (Array.isArray(mangles)) {
      for (const m of mangles) {
        const c = String(m.comment || '').toLowerCase();
        if (c.includes('zctrl anti-tethering') || c.includes('force ttl=1')) {
          try {
            await client.query('/ip/firewall/mangle/remove', [`=.id=${m['.id'] || m.id}`]);
            removedMangles++;
          } catch (rmErr: unknown) {
            appLogger.warn('networkFirewall', 'Failed removing mangle rule during anti-sharing revert', {
              error: rmErr instanceof Error ? rmErr.message : String(rmErr)
            });
          }
        }
      }
    }

    // Remove Filter rules
    const filters = await client.querySafe('/ip/firewall/filter/print', undefined, { timeoutSeconds: 4 });
    if (Array.isArray(filters)) {
      for (const f of filters) {
        const c = String(f.comment || '').toLowerCase();
        if (c.includes('zctrl anti-proxy')) {
          try {
            await client.query('/ip/firewall/filter/remove', [`=.id=${f['.id'] || f.id}`]);
            removedFilters++;
          } catch (rmErr: unknown) {
            appLogger.warn('networkFirewall', 'Failed removing filter rule during anti-sharing revert', {
              error: rmErr instanceof Error ? rmErr.message : String(rmErr)
            });
          }
        }
      }
    }

    invalidateCache('/ip/firewall/mangle');
    invalidateCache('/ip/firewall/filter');

    recordAudit(req, "revert_anti_sharing", "firewall", "success", {
      changes: { before: null, after: { removedMangles, removedFilters } }
    });

    res.json({
      success: true,
      message: `تم إلغاء تفعيل قواعد منع المشاركة وتطويق الترافيك (حذف ${removedMangles} قاعدة Mangle و ${removedFilters} قواعد Filter)`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(err) });
  }
});

// 2.3 Real-Time Network Ping & Latency Diagnostic Tool
router.post("/api/mikrotik/network/ping", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { address, count = 4 } = req.body;
    if (!address || typeof address !== 'string') {
      return res.status(400).json({ success: false, message: "عنوان IP أو الدومين مطلوب للفحص" });
    }
    const cleanAddress = address.trim();
    const cleanCount = Math.min(Math.max(Number(count) || 4, 1), 10);

    const pingResults = await client.querySafe('/ping', [
      `=address=${cleanAddress}`,
      `=count=${cleanCount}`
    ]);

    const packets = Array.isArray(pingResults) ? pingResults : [];
    let received = 0;
    let totalTime = 0;
    let minTime = 999999;
    let maxTime = 0;

    const details = packets.map((p: any, idx: number) => {
      const isSuccess = p.status === 'ok' || p.status === 'success' || (p.time !== undefined && !p.status?.includes('timeout'));
      const timeMs = parseFloat(String(p.time || p['round-trip-time'] || '0').replace(/[^0-9.]/g, '')) || 0;
      if (isSuccess && timeMs >= 0) {
        received++;
        totalTime += timeMs;
        if (timeMs < minTime) minTime = timeMs;
        if (timeMs > maxTime) maxTime = timeMs;
      }
      return {
        seq: idx + 1,
        host: p.host || cleanAddress,
        size: p.size || '56',
        ttl: p.ttl || '64',
        time: timeMs ? `${timeMs}ms` : (isSuccess ? '<1ms' : 'timeout'),
        status: isSuccess ? 'success' : (p.status || 'timeout')
      };
    });

    const sent = cleanCount;
    const packetLoss = sent > 0 ? Math.round(((sent - received) / sent) * 100) : 100;
    const avgTime = received > 0 ? Math.round((totalTime / received) * 10) / 10 : 0;

    res.json({
      success: true,
      data: {
        target: cleanAddress,
        sent,
        received,
        packetLoss,
        minTime: minTime === 999999 ? 0 : minTime,
        avgTime,
        maxTime,
        details
      }
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 2.4 Delete Router File/Folder safely
router.post("/api/mikrotik/files/delete", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    const { name, id } = req.body;
    if (!name && !id) {
      return res.status(400).json({ success: false, message: "اسم الملف أو معرفه مطلوب للحذف" });
    }
    const params: string[] = [];
    if (id) params.push(`=.id=${id}`);
    else if (name) params.push(`=numbers=${name}`);

    await client.querySafe('/file/remove', params);
    invalidateCache('/file');
    recordAudit(req, "delete_router_file", "router_files", "success", { resourceId: String(name || id) });

    res.json({
      success: true,
      message: `تم حذف الملف "${name || id}" من ذاكرة الراوتر بنجاح`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Helper to detect Access Point Vendor & Model
function detectApVendorAndModel(mac: string, identity: string, board: string, platform: string): { vendor: string; model: string; isLikelyAp: boolean } {
  const normMac = (mac || '').toUpperCase().replace(/[:-]/g, '');
  const text = `${identity || ''} ${board || ''} ${platform || ''}`.toLowerCase();
  
  if (
    normMac.startsWith('002722') || normMac.startsWith('0418D6') || normMac.startsWith('24A43C') ||
    normMac.startsWith('44D9E7') || normMac.startsWith('687251') || normMac.startsWith('7483C2') ||
    normMac.startsWith('788A20') || normMac.startsWith('802AA8') || normMac.startsWith('B4FBE4') ||
    normMac.startsWith('DC9FDB') || normMac.startsWith('F09FC2') || normMac.startsWith('AC8BA9') ||
    normMac.startsWith('E063DA') || normMac.startsWith('18E829') || normMac.startsWith('245A4C') ||
    normMac.startsWith('602232') || normMac.startsWith('70A741') || normMac.startsWith('807D3A') ||
    normMac.startsWith('D8B370') || normMac.startsWith('F492BF') ||
    text.includes('ubnt') || text.includes('unifi') || text.includes('nanostation') || 
    text.includes('loco') || text.includes('litebeam') || text.includes('rocket') || 
    text.includes('powerbeam') || text.includes('airgrid') || text.includes('airmax') ||
    text.includes('bullet') || text.includes('prism') || text.includes('gigabeam')
  ) {
    let model = board || platform || 'airMAX / UniFi Device';
    if (text.includes('litebeam')) model = 'Ubiquiti LiteBeam';
    else if (text.includes('nanostation') || text.includes('loco')) model = 'Ubiquiti NanoStation';
    else if (text.includes('rocket')) model = 'Ubiquiti Rocket';
    else if (text.includes('powerbeam')) model = 'Ubiquiti PowerBeam';
    else if (text.includes('unifi') || text.includes('uap')) model = 'Ubiquiti UniFi AP';
    return { vendor: 'Ubiquiti Networks', model, isLikelyAp: true };
  }

  if (
    normMac.startsWith('001478') || normMac.startsWith('0019E0') || normMac.startsWith('002127') ||
    normMac.startsWith('0023CD') || normMac.startsWith('002586') || normMac.startsWith('002719') ||
    normMac.startsWith('14CC20') || normMac.startsWith('18A6F7') || normMac.startsWith('30DE4B') ||
    normMac.startsWith('50C7BF') || normMac.startsWith('6032B1') || normMac.startsWith('704F57') ||
    normMac.startsWith('74EA3A') || normMac.startsWith('8416F9') || normMac.startsWith('98DAC4') ||
    normMac.startsWith('A0F3C1') || normMac.startsWith('B04E26') || normMac.startsWith('C025E9') ||
    normMac.startsWith('C46E1F') || normMac.startsWith('D807B6') || normMac.startsWith('E4C32A') ||
    normMac.startsWith('F4EC38') || normMac.startsWith('F81A67') || normMac.startsWith('54AF97') ||
    normMac.startsWith('7C8BCA') ||
    text.includes('tp-link') || text.includes('tplink') || text.includes('tl-wa') ||
    text.includes('eap') || text.includes('cpe210') || text.includes('cpe510') || 
    text.includes('cpe710') || text.includes('pharos') || text.includes('omada') || text.includes('deco')
  ) {
    let model = board || platform || 'TP-Link AP / CPE';
    if (text.includes('cpe210') || text.includes('cpe510')) model = 'TP-Link Pharos CPE';
    else if (text.includes('eap')) model = 'TP-Link Omada EAP';
    return { vendor: 'TP-Link', model, isLikelyAp: true };
  }

  if (
    normMac.startsWith('000C42') || normMac.startsWith('2CC81B') || normMac.startsWith('488F5A') ||
    normMac.startsWith('64D154') || normMac.startsWith('744D28') || normMac.startsWith('B869F4') ||
    normMac.startsWith('CC2DE0') || normMac.startsWith('D401C3') || normMac.startsWith('E48D8C') ||
    normMac.startsWith('18FD74') ||
    text.includes('mikrotik') || text.includes('routerboard') || text.includes('cap') ||
    text.includes('wap') || text.includes('groove') || text.includes('netmetal') ||
    text.includes('basebox') || text.includes('sxt') || text.includes('disc') ||
    text.includes('lhg') || text.includes('omnitik') || text.includes('mantbox') ||
    text.includes('hap') || text.includes('rb9') || text.includes('rb7')
  ) {
    let model = board || platform || 'MikroTik RouterBOARD';
    if (text.includes('cap')) model = 'MikroTik cAP';
    else if (text.includes('wap')) model = 'MikroTik wAP';
    else if (text.includes('groove')) model = 'MikroTik Groove';
    else if (text.includes('netmetal')) model = 'MikroTik NetMetal';
    else if (text.includes('sxt')) model = 'MikroTik SXT';
    else if (text.includes('disc')) model = 'MikroTik DISC';
    else if (text.includes('lhg')) model = 'MikroTik LHG';
    return { vendor: 'MikroTik', model, isLikelyAp: true };
  }

  if (text.includes('cambium') || text.includes('epmp') || text.includes('cnpilot') || text.includes('force')) {
    return { vendor: 'Cambium Networks', model: board || 'ePMP / cnPilot', isLikelyAp: true };
  }

  if (text.includes('ruijie') || text.includes('reyee') || text.includes('rap')) {
    return { vendor: 'Ruijie / Reyee', model: board || 'Reyee AP', isLikelyAp: true };
  }

  if (text.includes('tenda') || text.includes('nova')) {
    return { vendor: 'Tenda', model: board || 'Tenda Nova / AP', isLikelyAp: true };
  }

  if (text.includes('huawei') || text.includes('echolife')) {
    return { vendor: 'Huawei', model: board || 'Huawei AP / ONT', isLikelyAp: true };
  }

  if (text.includes('cisco') || text.includes('aironet') || text.includes('meraki')) {
    return { vendor: 'Cisco', model: board || 'Cisco Aironet / Meraki', isLikelyAp: true };
  }

  const isApKeyword = text.includes('ap') || text.includes('access') || text.includes('point') || 
                      text.includes('sector') || text.includes('antenna') || text.includes('wifi') || 
                      text.includes('wireless') || text.includes('wlan') || text.includes('repeater') || 
                      text.includes('extender') || text.includes('station');

  return { vendor: isApKeyword ? 'Access Point' : 'Network Device', model: board || platform || 'Wireless Node', isLikelyAp: isApKeyword };
}

// 3. Get Connected Antennas, Registration Table, Neighbors & Access Points
router.get("/api/mikrotik/network/antennas", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    let regTableRaw: any[] = [];
    let neighborsRaw: any[] = [];
    let remoteCapsRaw: any[] = [];
    let capsInterfacesRaw: any[] = [];
    let dhcpLeasesRaw: any[] = [];
    let ipBindingsRaw: any[] = [];
    let interfacesRaw: any[] = [];
    let wirelessInterfacesRaw: any[] = [];

    // Parallel queries to fetch all AP sources from MikroTik
    const results = await Promise.allSettled([
      client.querySafe('/interface/wireless/registration-table/print'),
      client.querySafe('/ip/neighbor/print'),
      client.querySafe('/caps-man/remote-cap/print'),
      client.querySafe('/caps-man/interface/print'),
      client.querySafe('/ip/dhcp-server/lease/print'),
      client.querySafe('/ip/hotspot/ip-binding/print'),
      client.querySafe('/interface/print'),
      client.querySafe('/interface/wireless/print')
    ]);

    if (results[0].status === 'fulfilled' && Array.isArray(results[0].value) && results[0].value.length > 0) {
      regTableRaw = results[0].value;
    } else {
      const fallbackReg = await queryWirelessWithFallback(client, '/registration-table/print');
      regTableRaw = fallbackReg.data;
    }

    if (results[1].status === 'fulfilled' && Array.isArray(results[1].value)) neighborsRaw = results[1].value;
    if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) remoteCapsRaw = results[2].value;
    if (results[3].status === 'fulfilled' && Array.isArray(results[3].value)) capsInterfacesRaw = results[3].value;
    if (results[4].status === 'fulfilled' && Array.isArray(results[4].value)) dhcpLeasesRaw = results[4].value;
    if (results[5].status === 'fulfilled' && Array.isArray(results[5].value)) ipBindingsRaw = results[5].value;
    if (results[6].status === 'fulfilled' && Array.isArray(results[6].value)) interfacesRaw = results[6].value;
    if (results[7].status === 'fulfilled' && Array.isArray(results[7].value) && results[7].value.length > 0) {
      wirelessInterfacesRaw = results[7].value;
    } else {
      const fallbackIfaces = await queryWirelessWithFallback(client, '/print');
      wirelessInterfacesRaw = fallbackIfaces.data;
    }

    const registrationTable = (Array.isArray(regTableRaw) ? regTableRaw : []).map((r: any, idx: number) => ({
      id: r?.['.id'] || r?.id || `reg-${idx}`,
      interface: r?.interface || 'wlan1',
      macAddress: r?.['mac-address'] || '',
      signalStrength: r?.['signal-strength'] || '-70dBm',
      signalStrengthCh0: r?.['signal-strength-ch0'] || '',
      signalStrengthCh1: r?.['signal-strength-ch1'] || '',
      signalToNoise: r?.['signal-to-noise'] || '',
      txRate: r?.['tx-rate'] || '',
      rxRate: r?.['rx-rate'] || '',
      uptime: r?.uptime || '',
      lastActivity: r?.['last-activity'] || '',
      ccq: r?.['tx-ccq'] || r?.['rx-ccq'] || r?.ccq || '',
      distance: r?.distance || '',
      comment: r?.comment || '',
      routerOs: r?.routeros === 'true' || r?.routeros === true || r?.routeros === 'yes'
    }));

    const neighbors = (Array.isArray(neighborsRaw) ? neighborsRaw : []).map((n: any, idx: number) => {
      const mac = n?.['mac-address'] || '';
      const identity = n?.identity || n?.['system-description'] || 'Antenna / AP';
      const platform = n?.platform || (n?.['board-name']?.includes('RB') ? 'MikroTik' : 'Access Point');
      const board = n?.['board-name'] || n?.['board'] || n?.platform || 'Wireless Device';
      const info = detectApVendorAndModel(mac, identity, board, platform);

      return {
        id: n?.['.id'] || n?.id || `nb-${idx}`,
        interface: n?.interface || '',
        address: n?.address || n?.['address4'] || n?.['ipv4-address'] || '',
        macAddress: mac,
        identity: identity,
        platform: info.vendor || platform,
        board: info.model || board,
        version: n?.version || '',
        uptime: n?.uptime || '',
        age: n?.age || ''
      };
    });

    const remoteCaps = (Array.isArray(remoteCapsRaw) ? remoteCapsRaw : []).map((c: any, idx: number) => ({
      id: c?.['.id'] || c?.id || `cap-${idx}`,
      name: c?.name || c?.identity || 'Remote CAP',
      address: c?.address || '',
      macAddress: c?.['base-mac'] || '',
      board: c?.['board'] || '',
      version: c?.version || '',
      state: c?.state || 'connected'
    }));

    // Synthesize All Detected Access Points (Unification Engine)
    const accessPointsMap = new Map<string, any>();

    // 1. Add from Neighbors (Ubiquiti, TP-Link, MikroTik APs, Cambium, etc.)
    neighbors.forEach((n, idx) => {
      const key = (n.macAddress || n.address || `nb-${idx}`).toLowerCase();
      const info = detectApVendorAndModel(n.macAddress, n.identity, n.board, n.platform);
      
      let apName = n.identity;
      if (!apName || apName === 'MikroTik' || apName === 'UBNT' || apName === 'Antenna / AP') {
        apName = `${info.vendor} - ${info.model} (${n.interface || 'LAN'})`;
      }

      accessPointsMap.set(key, {
        id: n.id,
        name: apName,
        vendor: info.vendor,
        model: info.model,
        ssid: undefined,
        ipAddress: n.address,
        macAddress: n.macAddress,
        interface: n.interface,
        source: 'neighbor',
        status: 'online',
        uptime: n.uptime,
        version: n.version,
        comment: n.board,
        webUrl: n.address ? `http://${n.address}` : undefined
      });
    });

    // 2. Add from CAPsMAN Remote CAPs
    remoteCaps.forEach((c, idx) => {
      const key = (c.macAddress || c.address || `cap-${idx}`).toLowerCase();
      const existing = accessPointsMap.get(key);
      const info = detectApVendorAndModel(c.macAddress, c.name, c.board, 'MikroTik');

      // Check if there is an SSID from capsInterfacesRaw
      const matchingCapInterface = (Array.isArray(capsInterfacesRaw) ? capsInterfacesRaw : []).find(
        (ci: any) => ci?.['radio-mac'] === c.macAddress || ci?.['name']?.includes(c.name)
      );
      const capSsid = matchingCapInterface?.['configuration.ssid'] || matchingCapInterface?.ssid;

      accessPointsMap.set(key, {
        id: c.id,
        name: c.name || existing?.name || `CAP - ${c.board}`,
        vendor: 'MikroTik',
        model: c.board || 'cAP / wAP Access Point',
        ssid: capSsid || existing?.ssid,
        ipAddress: c.address || existing?.ipAddress,
        macAddress: c.macAddress || existing?.macAddress,
        interface: existing?.interface || 'CAPsMAN',
        source: 'capsman',
        status: c.state === 'connected' ? 'online' : 'unknown',
        version: c.version || existing?.version,
        comment: `CAPsMAN Controller Mode (${c.state || 'active'})`,
        webUrl: c.address ? `http://${c.address}` : undefined
      });
    });

    // 3. Add from DHCP Leases (Detect APs that obtained IP via DHCP)
    (Array.isArray(dhcpLeasesRaw) ? dhcpLeasesRaw : []).forEach((l: any, idx: number) => {
      const mac = (l?.['mac-address'] || '').toLowerCase();
      const hostName = l?.['host-name'] || '';
      const comment = l?.comment || '';
      const address = l?.address || '';
      const info = detectApVendorAndModel(mac, hostName, comment, '');

      if (mac && (info.isLikelyAp || comment.toLowerCase().includes('ap') || hostName.toLowerCase().includes('ap'))) {
        const existing = accessPointsMap.get(mac);
        if (!existing) {
          accessPointsMap.set(mac, {
            id: l?.['.id'] || `dhcp-ap-${idx}`,
            name: hostName || comment || `${info.vendor} (${address})`,
            vendor: info.vendor,
            model: info.model,
            ipAddress: address,
            macAddress: mac.toUpperCase(),
            interface: l?.server || 'LAN',
            source: 'dhcp',
            status: l?.status === 'bound' ? 'online' : 'offline',
            uptime: l?.['expires-after'] ? `ينتهي بعد ${l['expires-after']}` : undefined,
            comment: comment || `DHCP Lease (${l?.server})`,
            webUrl: address ? `http://${address}` : undefined
          });
        } else {
          if (!existing.ipAddress && address) {
            existing.ipAddress = address;
            existing.webUrl = `http://${address}`;
          }
          if (comment && !existing.comment) existing.comment = comment;
        }
      }
    });

    // 4. Add from Local Wireless Interfaces (wlan1, wlan2, VAPs)
    (Array.isArray(wirelessInterfacesRaw) ? wirelessInterfacesRaw : []).forEach((w: any, idx: number) => {
      const name = w?.name || `wlan${idx + 1}`;
      const ssid = w?.ssid || name;
      const mac = (w?.['mac-address'] || '').toLowerCase();
      const key = mac || `local-wlan-${name}`;

      accessPointsMap.set(key, {
        id: w?.['.id'] || `local-wlan-${idx}`,
        name: `واجهة الراوتر المدمجة (${name})`,
        vendor: 'MikroTik (المدمجة)',
        model: w?.band || 'Router Wireless Card',
        ssid: ssid,
        ipAddress: undefined,
        macAddress: w?.['mac-address'] ? w['mac-address'].toUpperCase() : undefined,
        interface: name,
        source: 'wireless_card',
        status: w?.disabled === 'true' || w?.disabled === true || w?.disabled === 'yes' ? 'offline' : 'online',
        comment: w?.comment || `${w?.frequency || 'Auto'} MHz | ${w?.mode || 'ap-bridge'}`,
        clientsCount: undefined
      });
    });

    // 5. Match with IP Bindings (Check if bypassed)
    (Array.isArray(ipBindingsRaw) ? ipBindingsRaw : []).forEach((b: any) => {
      const mac = (b?.['mac-address'] || '').toLowerCase();
      if (mac && accessPointsMap.has(mac)) {
        const ap = accessPointsMap.get(mac);
        ap.isBypassed = b?.type === 'bypassed';
        if (b?.comment && !ap.comment) ap.comment = b.comment;
      }
    });

    const accessPoints = Array.from(accessPointsMap.values());

    res.json({
      success: true,
      data: {
        registrationTable,
        neighbors,
        remoteCaps,
        accessPoints
      }
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Dedicated Access Points List API
router.get("/api/mikrotik/network/access-points", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    const resRaw = await client.querySafe('/ip/neighbor/print');
    const neighborsRaw = Array.isArray(resRaw) ? resRaw : [];
    
    let remoteCapsRaw: any[] = [];
    try {
      remoteCapsRaw = await client.querySafe('/caps-man/remote-cap/print');
    } catch {
      remoteCapsRaw = [];
    }

    let dhcpLeasesRaw: any[] = [];
    try {
      dhcpLeasesRaw = await client.querySafe('/ip/dhcp-server/lease/print');
    } catch {
      dhcpLeasesRaw = [];
    }

    let wirelessRaw: any[] = [];
    try {
      wirelessRaw = await client.querySafe('/interface/wireless/print');
    } catch {
      wirelessRaw = [];
    }

    const accessPointsMap = new Map<string, any>();

    // 1. Neighbors
    neighborsRaw.forEach((n: any, idx: number) => {
      const mac = n?.['mac-address'] || '';
      const identity = n?.identity || n?.['system-description'] || 'Antenna / AP';
      const platform = n?.platform || '';
      const board = n?.['board-name'] || n?.['board'] || '';
      const info = detectApVendorAndModel(mac, identity, board, platform);

      let apName = identity;
      if (!apName || apName === 'MikroTik' || apName === 'UBNT' || apName === 'Antenna / AP') {
        apName = `${info.vendor} - ${info.model} (${n?.interface || 'LAN'})`;
      }

      const key = (mac || n?.address || `nb-${idx}`).toLowerCase();
      accessPointsMap.set(key, {
        id: n?.['.id'] || `nb-${idx}`,
        name: apName,
        vendor: info.vendor,
        model: info.model,
        ipAddress: n?.address || n?.['address4'] || n?.['ipv4-address'] || '',
        macAddress: mac,
        interface: n?.interface || '',
        source: 'neighbor',
        status: 'online',
        uptime: n?.uptime || '',
        version: n?.version || '',
        comment: board,
        webUrl: n?.address ? `http://${n.address}` : undefined
      });
    });

    // 2. CAPsMAN
    (Array.isArray(remoteCapsRaw) ? remoteCapsRaw : []).forEach((c: any, idx: number) => {
      const mac = c?.['base-mac'] || '';
      const key = (mac || c?.address || `cap-${idx}`).toLowerCase();
      const existing = accessPointsMap.get(key);
      const info = detectApVendorAndModel(mac, c?.name || c?.identity, c?.board, 'MikroTik');

      accessPointsMap.set(key, {
        id: c?.['.id'] || `cap-${idx}`,
        name: c?.name || c?.identity || existing?.name || `CAP - ${c?.board}`,
        vendor: 'MikroTik',
        model: c?.board || 'cAP / wAP Access Point',
        ipAddress: c?.address || existing?.ipAddress,
        macAddress: mac || existing?.macAddress,
        interface: existing?.interface || 'CAPsMAN',
        source: 'capsman',
        status: c?.state === 'connected' ? 'online' : 'unknown',
        version: c?.version || existing?.version,
        comment: `CAPsMAN Controller Mode (${c?.state || 'active'})`,
        webUrl: c?.address ? `http://${c.address}` : undefined
      });
    });

    // 3. Wireless interfaces
    (Array.isArray(wirelessRaw) ? wirelessRaw : []).forEach((w: any, idx: number) => {
      const name = w?.name || `wlan${idx + 1}`;
      const ssid = w?.ssid || name;
      const mac = (w?.['mac-address'] || '').toLowerCase();
      const key = mac || `local-wlan-${name}`;

      accessPointsMap.set(key, {
        id: w?.['.id'] || `local-wlan-${idx}`,
        name: `واجهة الراوتر المدمجة (${name})`,
        vendor: 'MikroTik (المدمجة)',
        model: w?.band || 'Router Wireless Card',
        ssid: ssid,
        macAddress: w?.['mac-address'] ? w['mac-address'].toUpperCase() : undefined,
        interface: name,
        source: 'wireless_card',
        status: w?.disabled === 'true' || w?.disabled === true || w?.disabled === 'yes' ? 'offline' : 'online',
        comment: w?.comment || `${w?.frequency || 'Auto'} MHz | ${w?.mode || 'ap-bridge'}`
      });
    });

    // 4. DHCP Leases for APs
    (Array.isArray(dhcpLeasesRaw) ? dhcpLeasesRaw : []).forEach((l: any, idx: number) => {
      const mac = (l?.['mac-address'] || '').toLowerCase();
      const hostName = l?.['host-name'] || '';
      const comment = l?.comment || '';
      const address = l?.address || '';
      const info = detectApVendorAndModel(mac, hostName, comment, '');

      if (mac && (info.isLikelyAp || comment.toLowerCase().includes('ap') || hostName.toLowerCase().includes('ap'))) {
        const existing = accessPointsMap.get(mac);
        if (!existing) {
          accessPointsMap.set(mac, {
            id: l?.['.id'] || `dhcp-ap-${idx}`,
            name: hostName || comment || `${info.vendor} (${address})`,
            vendor: info.vendor,
            model: info.model,
            ipAddress: address,
            macAddress: mac.toUpperCase(),
            interface: l?.server || 'LAN',
            source: 'dhcp',
            status: l?.status === 'bound' ? 'online' : 'offline',
            uptime: l?.['expires-after'] ? `ينتهي بعد ${l['expires-after']}` : undefined,
            comment: comment || `DHCP Lease (${l?.server})`,
            webUrl: address ? `http://${address}` : undefined
          });
        }
      }
    });

    res.json({ success: true, data: Array.from(accessPointsMap.values()) });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Update / Set AP Comment or Name
router.post("/api/mikrotik/network/access-points/set-comment", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
    }

    const { macAddress, ipAddress, iface, comment } = req.body;
    if (!comment) return res.status(400).json({ success: false, message: "الملاحظة/الاسم مطلوب" });

    // Try setting comment on IP Binding or Interface or DHCP Lease
    if (macAddress) {
      // 1. Try IP Binding
      const bindings = await client.querySafe('/ip/hotspot/ip-binding/print', [`?mac-address=${macAddress}`]);
      if (Array.isArray(bindings) && bindings.length > 0) {
        await client.querySafe('/ip/hotspot/ip-binding/set', [`=.id=${bindings[0]['.id']}`, `=comment=${sanitizeInput(comment)}`]);
      } else if (ipAddress) {
        // Add new IP binding with comment & bypass
        await client.querySafe('/ip/hotspot/ip-binding/add', [
          `=mac-address=${sanitizeInput(macAddress)}`,
          `=address=${sanitizeInput(ipAddress)}`,
          `=type=bypassed`,
          `=comment=${sanitizeInput(comment)}`
        ]);
      }
    }

    if (iface) {
      const ifaces = await client.querySafe('/interface/print', [`?name=${iface}`]);
      if (Array.isArray(ifaces) && ifaces.length > 0) {
        await client.querySafe('/interface/set', [`=.id=${ifaces[0]['.id']}`, `=comment=${sanitizeInput(comment)}`]);
      }
    }

    invalidateCache('/ip/neighbor');
    invalidateCache('/ip/hotspot/ip-binding');
    res.json({ success: true, message: "تم حفظ اسم وملاحظات نقطة الوصول (AP) بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 4. Kick / Disassociate Wireless Client or Antenna
router.post("/api/mikrotik/wireless/antennas/kick", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
    }

    const { id, macAddress } = req.body;
    if (!id && !macAddress) {
      return res.status(400).json({ success: false, message: "معرف أو ماك الأنتينة/العميل مطلوب" });
    }

    if (id) {
      try {
        await client.query('/interface/wireless/registration-table/remove', [`=.id=${id}`]);
      } catch {
        await client.query('/interface/wifi/registration-table/remove', [`=.id=${id}`]);
      }
    }

    res.json({ success: true, message: "تم فصل الجهاز / العميل من الأنتينة بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 5. Get Hotspot Server Profiles, Servers & Portal Files
router.get("/api/mikrotik/hotspot/server-profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    const [profilesRaw, serversRaw, filesRaw] = await Promise.all([
      client.querySafe('/ip/hotspot/profile/print'),
      client.querySafe('/ip/hotspot/print'),
      client.querySafe('/file/print')
    ]);

    const profiles = (Array.isArray(profilesRaw) ? profilesRaw : []).map((p: any) => {
      const loginByRaw = p?.['login-by'] || 'http-chap,cookie';
      const loginBy = typeof loginByRaw === 'string'
        ? loginByRaw.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
        : Array.isArray(loginByRaw) ? loginByRaw : ['http-chap', 'cookie'];

      return {
        id: p?.['.id'] || p?.id || p?.name,
        name: p?.name || 'hsprof1',
        hotspotAddress: p?.['hotspot-address'] || '',
        dnsName: p?.['dns-name'] || '',
        htmlDirectory: p?.['html-directory'] || 'hotspot',
        htmlDirectoryOverride: p?.['html-directory-override'] || '',
        loginBy,
        sslCertificate: p?.['ssl-certificate'] || 'none',
        https: p?.['ssl-certificate'] && p?.['ssl-certificate'] !== 'none',
        httpCookieLifetime: p?.['http-cookie-lifetime'] || '3d',
        trialUptimeLimit: p?.['trial-uptime-limit'] || '0s',
        trialUptimeReset: p?.['trial-uptime-reset'] || '1d',
        rateLimit: p?.['rate-limit'] || '',
        useRadius: p?.['use-radius'] === 'yes' || p?.['use-radius'] === 'true' || p?.['use-radius'] === true,
        smtpServer: p?.['smtp-server'] || '',
        splitUserDomain: p?.['split-user-domain'] === 'yes' || p?.['split-user-domain'] === 'true'
      };
    });

    const servers = (Array.isArray(serversRaw) ? serversRaw : []).map((s: any) => ({
      id: s?.['.id'] || s?.id || s?.name,
      name: s?.name || 'hotspot1',
      interface: s?.interface || 'bridge-hotspot',
      addressPool: s?.['address-pool'] || '',
      profile: s?.profile || 'default',
      disabled: s?.disabled === 'yes' || s?.disabled === 'true' || s?.disabled === true,
      ipAddress: s?.['ip-address'] || s?.['hotspot-address'] || ''
    }));

    const files = (Array.isArray(filesRaw) ? filesRaw : []).map((f: any, idx: number) => ({
      id: f?.['.id'] || f?.id || `file-${idx}`,
      name: f?.name || '',
      type: f?.type || 'file',
      size: parseInt(f?.size || '0', 10) || 0,
      creationTime: f?.['creation-time'] || '',
      isFolder: f?.type === 'directory' || !f?.name?.includes('.')
    }));

    res.json({
      success: true,
      data: {
        profiles,
        servers,
        files
      }
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 6. Update Hotspot Server Profile (Login Portal Config)
router.post("/api/mikrotik/hotspot/server-profiles/update", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
    }

    const {
      id,
      name,
      htmlDirectory,
      dnsName,
      hotspotAddress,
      loginBy,
      sslCertificate,
      httpCookieLifetime,
      trialUptimeLimit,
      trialUptimeReset,
      rateLimit,
      useRadius,
      splitUserDomain
    } = req.body;

    if (!id && !name) {
      return res.status(400).json({ success: false, message: "معرف بروفايل سيرفر الهوتسبوت مطلوب" });
    }

    const params: string[] = [];
    if (id) params.push(`=.id=${id}`);
    else if (name) params.push(`=numbers=${name}`);

    if (htmlDirectory !== undefined) params.push(`=html-directory=${htmlDirectory}`);
    if (dnsName !== undefined) params.push(`=dns-name=${dnsName}`);
    if (hotspotAddress !== undefined) params.push(`=hotspot-address=${hotspotAddress}`);

    if (loginBy !== undefined) {
      const loginByStr = Array.isArray(loginBy) ? loginBy.join(',') : loginBy;
      params.push(`=login-by=${loginByStr}`);
    }

    if (sslCertificate !== undefined) params.push(`=ssl-certificate=${sslCertificate || 'none'}`);
    if (httpCookieLifetime !== undefined) params.push(`=http-cookie-lifetime=${httpCookieLifetime}`);
    if (trialUptimeLimit !== undefined) params.push(`=trial-uptime-limit=${trialUptimeLimit}`);
    if (trialUptimeReset !== undefined) params.push(`=trial-uptime-reset=${trialUptimeReset}`);
    if (rateLimit !== undefined) params.push(`=rate-limit=${rateLimit}`);
    if (useRadius !== undefined) params.push(`=use-radius=${useRadius ? 'yes' : 'no'}`);
    if (splitUserDomain !== undefined) params.push(`=split-user-domain=${splitUserDomain ? 'yes' : 'no'}`);

    await client.querySafe('/ip/hotspot/profile/set', params);
    invalidateCache('/ip/hotspot/profile');

    res.json({
      success: true,
      message: `تم تحديث وضبط بروفايل بوابة الهوتسبوت ${name || ''} بنجاح وأمان`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 7. Create New Hotspot Server Profile
router.post("/api/mikrotik/hotspot/server-profiles/create", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
    }

    const {
      name,
      htmlDirectory,
      dnsName,
      hotspotAddress,
      loginBy,
      sslCertificate,
      httpCookieLifetime,
      trialUptimeLimit,
      trialUptimeReset
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: "اسم البروفايل مطلوب" });
    }

    const params: string[] = [`=name=${name}`];
    if (htmlDirectory) params.push(`=html-directory=${htmlDirectory}`);
    if (dnsName) params.push(`=dns-name=${dnsName}`);
    if (hotspotAddress) params.push(`=hotspot-address=${hotspotAddress}`);
    if (loginBy) {
      const loginByStr = Array.isArray(loginBy) ? loginBy.join(',') : loginBy;
      params.push(`=login-by=${loginByStr}`);
    }
    if (sslCertificate) params.push(`=ssl-certificate=${sslCertificate}`);
    if (httpCookieLifetime) params.push(`=http-cookie-lifetime=${httpCookieLifetime}`);
    if (trialUptimeLimit) params.push(`=trial-uptime-limit=${trialUptimeLimit}`);
    if (trialUptimeReset) params.push(`=trial-uptime-reset=${trialUptimeReset}`);

    await client.querySafe('/ip/hotspot/profile/add', params);
    invalidateCache('/ip/hotspot/profile');

    res.json({
      success: true,
      message: `تم إنشاء بروفايل البوابة ${name} بنجاح`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 8. Apply Login Page Folder / Template
router.post("/api/mikrotik/hotspot/login-page/apply-template", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
    }

    const { profileId, profileName, folderName, dnsName } = req.body;
    if (!profileId && !profileName) {
      return res.status(400).json({ success: false, message: "معرف أو اسم بروفايل الهوتسبوت مطلوب" });
    }
    const cleanFolder = (folderName || 'hotspot').trim();

    const params: string[] = [];
    if (profileId) params.push(`=.id=${profileId}`);
    else if (profileName) params.push(`=numbers=${profileName}`);

    params.push(`=html-directory=${cleanFolder}`);
    if (dnsName) params.push(`=dns-name=${dnsName}`);

    await client.querySafe('/ip/hotspot/profile/set', params);
    invalidateCache('/ip/hotspot/profile');

    res.json({
      success: true,
      message: `تم ضبط مجلد صفحة تسجيل الدخول إلى "${cleanFolder}" بنجاح`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 9. Deploy & Save Live Customized Hotspot Portal to MikroTik Router Storage & Profile
router.post("/api/mikrotik/hotspot/login-page/deploy", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    if (!client.isConnected()) {
      return res.status(503).json({
        success: false,
        reconnecting: true,
        message: "جاري إعادة الاتصال بالراوتر"
      });
    }

    const { profileId, profileName, folderName, dnsName, files, config } = req.body;
    const { safePath: cleanFolder, isSafe } = sanitizeSafePath(folderName || 'hotspot', 'hotspot');
    if (!isSafe) {
      return res.status(400).json({ success: false, message: 'اسم مجلد الهوتسبوت غير صالح أو يحتوي على مسار محظور' });
    }

    // 1. Update Hotspot Profile in MikroTik Router
    const profileParams: string[] = [];
    if (profileId) profileParams.push(`=.id=${profileId}`);
    else if (profileName) profileParams.push(`=numbers=${profileName}`);
    else profileParams.push(`=numbers=hsprof1`);

    profileParams.push(`=html-directory=${cleanFolder}`);
    if (dnsName) profileParams.push(`=dns-name=${dnsName}`);

    try {
      await client.querySafe('/ip/hotspot/profile/set', profileParams);
    } catch {
      // ignore if profile not found or profile was default
    }

    // Helper to safely write large file contents to MikroTik RouterOS
    const writeLargeFile = async (fileName: string, content: string) => {
      if (!validateSafeFileName(fileName)) {
        console.warn(`[Portal Deploy] Skipped file with unsafe name: ${fileName}`);
        return;
      }

      const fullFilePath = `${cleanFolder}/${fileName}`;
      
      // If content is small, write directly
      if (content.length <= 4000) {
        // Ensure file exists by printing to file
        try {
          await client.querySafe('/file/print', [`=file=${fullFilePath}`]);
        } catch (printErr: unknown) {
          appLogger.warn('networkFirewall', 'Pre-creating hotspot portal file slot failed', {
            fullFilePath,
            error: printErr instanceof Error ? printErr.message : String(printErr)
          });
        }
        
        // Write content
        await client.querySafe('/file/set', [
          `=numbers=${fullFilePath}`,
          `=contents=${content}`
        ]);
        return;
      }

      // Try FTP first for large files
      try {
        const conf = client.getConfig();
        const ftpConfig = {
          host: conf.host,
          port: conf.port === 8728 || conf.port === 8729 ? 21 : (conf.port || 21),
          username: conf.user,
          password: conf.password || ''
        };
        const ftpRes = await ftpService.writeFile(ftpConfig, fullFilePath, content);
        if (ftpRes.success) return;
      } catch (e) {
        console.error("FTP upload failed, falling back to direct write", e);
      }
      
      // Fallback: write truncated direct if FTP fails (no scripts)
      try {
         await client.querySafe('/file/print', [`=file=${fullFilePath}`]);
      } catch (printErr: unknown) {
        appLogger.warn('networkFirewall', 'Fallback hotspot portal file pre-creation failed', {
          fullFilePath,
          error: printErr instanceof Error ? printErr.message : String(printErr)
        });
      }
      await client.querySafe('/file/set', [
        `=numbers=${fullFilePath}`,
        `=contents=${content.substring(0, 4000)}`
      ]);
    };

    // 2. Real file writing / updating in RouterOS or Demo memory
    if (files && typeof files === 'object') {
      for (const [filename, content] of Object.entries(files)) {
        const contentStr = typeof content === 'string' ? content : '';
        await writeLargeFile(filename, contentStr);
      }
    }

    // Automatically save zctrl_config.json if config is provided
    if (config && typeof config === 'object') {
      await writeLargeFile('zctrl_config.json', JSON.stringify(config, null, 2));
    }

    invalidateCache('/ip/hotspot/profile');
    invalidateCache('/file');
    recordAudit(req, "deploy_hotspot_login_portal", "hotspot_portal", "success", { resourceId: cleanFolder });

    res.json({
      success: true,
      message: `تم تثبيت وحفظ صفحة وبوابة تسجيل الدخول بنجاح على المجلد "${cleanFolder}" في راوتر المايكروتك مع المزامنة والحفظ المباشر`
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 9b. Get Saved Custom Hotspot Portal Config from RouterOS
router.post("/api/mikrotik/hotspot/login-page/get-config", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    const { folderName } = req.body;
    const cleanFolder = (folderName || 'hotspot').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'hotspot';
    const filePath = `${cleanFolder}/zctrl_config.json`;

    const fileResult = await client.querySafe('/file/print', [`?name=${filePath}`]);
    if (fileResult && fileResult.length > 0) {
      const fileData = fileResult[0];
      const contents = fileData.contents || '';
      if (contents) {
        try {
          const configJson = JSON.parse(contents);
          return res.json({ success: true, config: configJson });
        } catch {
          // ignore parsing error
        }
      }
    }
    return res.json({ success: false, message: "لم يتم العثور على ملف إعدادات محفوظ على الراوتر لهذا المجلد." });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================
// FIREWALL QUICK HARDEN (Idempotent & Safe)
// Never blocks LAN/API/WinBox management access
// ==========================================
router.post("/api/mikrotik/firewall/quick-harden", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  }

  try {
    const existingRules = await client.querySafe('/ip/firewall/filter/print');
    const rulesList = Array.isArray(existingRules) ? existingRules : [];
    const existingComments = new Set(
      rulesList.map((r: any) => String(r?.comment || '').trim().toLowerCase())
    );

    const safeRules: Array<{ comment: string; params: string[] }> = [
      {
        comment: 'ZCtrl-QuickHarden: Accept Established & Related (Input)',
        params: [
          '=chain=input',
          '=connection-state=established,related',
          '=action=accept',
          '=comment=ZCtrl-QuickHarden: Accept Established & Related (Input)'
        ]
      },
      {
        comment: 'ZCtrl-QuickHarden: Drop Invalid Connections (Input)',
        params: [
          '=chain=input',
          '=connection-state=invalid',
          '=action=drop',
          '=comment=ZCtrl-QuickHarden: Drop Invalid Connections (Input)'
        ]
      },
      {
        comment: 'ZCtrl-QuickHarden: Accept Established & Related (Forward)',
        params: [
          '=chain=forward',
          '=connection-state=established,related',
          '=action=accept',
          '=comment=ZCtrl-QuickHarden: Accept Established & Related (Forward)'
        ]
      },
      {
        comment: 'ZCtrl-QuickHarden: Drop Invalid Packets (Forward)',
        params: [
          '=chain=forward',
          '=connection-state=invalid',
          '=action=drop',
          '=comment=ZCtrl-QuickHarden: Drop Invalid Packets (Forward)'
        ]
      }
    ];

    let addedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const rule of safeRules) {
      if (existingComments.has(rule.comment.toLowerCase())) {
        skippedCount++;
        continue;
      }
      try {
        await client.query('/ip/firewall/filter/add', rule.params, { priority: true });
        addedCount++;
      } catch (ruleErr: any) {
        errors.push(translateErrorMessage(ruleErr));
      }
    }

    invalidateCache('/ip/firewall');
    recordAudit(req, "firewall_quick_harden", "firewall", "success", {
      reason: `added=${addedCount}, skipped=${skippedCount}`
    });

    const msg =
      addedCount > 0
        ? `تم تطبيق الحماية السريعة بنجاح: إضافة ${addedCount} قواعد أمان جديدة${skippedCount > 0 ? ` (${skippedCount} كانت مفعّلة مسبقاً)` : ''}`
        : `قواعد الحماية السريعة مفعّلة بالكامل بالفعل (${skippedCount} قواعد موجودة مسبقاً)`;

    return res.json({
      success: true,
      addedCount,
      skippedCount,
      warnings: errors.length > 0 ? errors : undefined,
      message: msg
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});


  return router;
}
