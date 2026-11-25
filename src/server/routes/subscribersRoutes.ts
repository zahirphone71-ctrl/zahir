import { Router, type Request, type Response } from "express";
import { translateErrorMessage } from "../../lib/errorTranslator.ts";
import { voucherDb } from "../voucher-db.ts";
import { recordAudit } from "../rbac.ts";
import {
  MikrotikAPI,
  invalidateCache,
  clearCachedUsermanResult,
  sanitizeInput,
  getUserManPrefix,
  cleanMikrotikTimeout,
  resolveHotspotProfileId,
  resolvePPPProfileId,
  resolveUsermanProfileId,
  fetchSafeCached,
  fetchComprehensiveUsermanData,
  normalizeHotspotProfile,
  normalizePPPProfile,
  normalizeUsermanProfile
} from "../runtimeContext.ts";
import {
  cleanDnsOrIpList,
  executeProfileMutation,
  getUsermanEndpoints,
  isProtectedDefaultProfileName,
  normalizeRateLimitString,
  parseRateToBpsString
} from "../routeros/profileSanitizer.ts";

const HOTSPOT_OPTIONAL_FALLBACK_KEYS = [
  "transparent-proxy",
  "insert-queue-before",
  "queue-type",
  "parent-queue",
  "open-status-page",
  "advertise",
  "advertise-url",
  "advertise-interval",
  "advertise-timeout",
  "incoming-filter",
  "outgoing-filter",
  "address-list",
  "status-autorefresh",
  "mac-cookie-timeout",
  "keepalive-timeout",
  "idle-timeout",
  "session-timeout",
  "address-pool",
  "on-logout",
  "on-login"
];

const PPP_OPTIONAL_FALLBACK_KEYS = [
  "remote-ipv6-prefix-pool",
  "use-ipv6",
  "use-mpls",
  "use-compression",
  "use-encryption",
  "bridge-horizon",
  "bridge",
  "queue-type",
  "parent-queue",
  "wins-server",
  "dns-server",
  "address-list",
  "session-timeout",
  "idle-timeout",
  "on-down",
  "on-up",
  "comment"
];

const USERMAN_LIM_OPTIONAL_KEYS = [
  "owner",
  "rate-limit-min-rx",
  "rate-limit-min-tx",
  "transfer-limit",
  "download-limit",
  "upload-limit",
  "uptime-limit",
  "rate-limit-rx",
  "rate-limit-tx"
];

const USERMAN_PROF_OPTIONAL_KEYS = [
  "owner",
  "comment",
  "starts-when",
  "starts-at",
  "override-shared-users",
  "name-for-users",
  "validity",
  "price"
];

const USERMAN_LINK_OPTIONAL_KEYS = ["weekdays", "from-time", "till-time"];

export function createSubscribersRoutes(): Router {
  const router = Router();

// ==========================================
// HOTSPOT USERS CRUD
// ==========================================
// HOTSPOT USERS & PROFILES CRUD
// ==========================================
router.post("/api/mikrotik/hotspot/users", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const name = sanitizeInput(req.body.name);
    const password = sanitizeInput(req.body.password);
    const profile = sanitizeInput(req.body.profile);
    const comment = sanitizeInput(req.body.comment);
    const limitUptime = sanitizeInput(req.body.limitUptime);
    const limitBytesTotal = Number(req.body.limitBytesTotal) || 0;
    const email = sanitizeInput(req.body.email);
    const macAddress = sanitizeInput(req.body.macAddress);

    if (!name) {
      return res.status(400).json({ success: false, message: "اسم المستخدم مطلوب وغير صالح" });
    }

    const params = [
      `=name=${name}`,
      `=profile=${profile || "default"}`
    ];
    if (password) params.push(`=password=${password}`);
    if (comment) params.push(`=comment=${comment}`);
    if (limitUptime) params.push(`=limit-uptime=${limitUptime}`);
    if (limitBytesTotal > 0) params.push(`=limit-bytes-total=${limitBytesTotal}`);
    if (email) params.push(`=email=${email}`);
    if (macAddress) params.push(`=mac-address=${macAddress}`);
    if (req.body.disabled !== undefined) {
      params.push(`=disabled=${req.body.disabled === true || req.body.disabled === 'yes' ? 'yes' : 'no'}`);
    }

    await client.query('/ip/hotspot/user/add', params);
    invalidateCache("/ip/hotspot");
    res.json({ success: true, message: `تم إضافة المستخدم ${name} بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/hotspot/users/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    let targetId = rawId;
    let found: any = null;
    if (!targetId.startsWith('*')) {
      found = await client.querySafe('/ip/hotspot/user/print', [`?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        targetId = found[0]['.id'];
      }
    }
    try {
      await client.query('/ip/hotspot/user/remove', [`=.id=${targetId}`]);
    } catch (err: any) {
      found = await client.querySafe('/ip/hotspot/user/print', [`?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        await client.query('/ip/hotspot/user/remove', [`=.id=${found[0]['.id']}`]);
      } else {
        throw err;
      }
    }

    // فصل أي جلسة اتصال نشطة فوراً للمستخدم المحذوف لضمان خروجه من الشبكة
    try {
      const uName = (Array.isArray(found) && found[0]?.name) ? found[0].name : rawId;
      const activeList = await client.querySafe('/ip/hotspot/active/print', [`?user=${uName}`]);
      if (Array.isArray(activeList)) {
        for (const act of activeList) {
          await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
        }
      }
      invalidateCache("/ip/hotspot/active");
    } catch {}

    invalidateCache("/ip/hotspot");
    res.json({ success: true, message: "تم حذف المشترك وفصل أي جلسة نشطة له من المايكروتك بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Bulk/Batch Delete Hotspot Users with cooperative yielding to prevent CPU spikes
router.post("/api/mikrotik/hotspot/users/batch-delete", async (req: Request, res: Response) => {
  req.setTimeout(180000);
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل" });
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المعرفات مطلوبة" });
    }

    let successCount = 0;
    const sanitizedIds = ids.map(id => sanitizeInput(id)).filter(Boolean);
    const hsUsers = await client.querySafe('/ip/hotspot/user/print', ['=.proplist=.id,name'], { rapid: true });
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();
    if (Array.isArray(hsUsers)) {
      for (const u of hsUsers) {
        if (u['.id']) byId.set(u['.id'], u);
        if (u.name) byName.set(String(u.name).toLowerCase(), u);
      }
    }

    // Process in gentle batches of 30 with rapid micro-queries
    for (let i = 0; i < sanitizedIds.length; i += 30) {
      const chunk = sanitizedIds.slice(i, i + 30);
      for (const id of chunk) {
        try {
          const resolved = byId.get(id) || byName.get(id.toLowerCase());
          const targetId = resolved?.['.id'] || id;
          await client.query('/ip/hotspot/user/remove', [`=.id=${targetId}`], { rapid: true });
          successCount++;
          const uName = resolved?.name || (!id.startsWith('*') ? id : '');
          if (uName) {
            const acts = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user', `?user=${uName}`], { rapid: true });
            if (Array.isArray(acts)) {
              for (const act of acts) {
                await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          }
        } catch {
          // Continue with remaining
        }
      }
      if (i + 30 < sanitizedIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2));
      }
    }

    invalidateCache("/ip/hotspot");
    invalidateCache("/ip/hotspot/active");
    res.json({ success: true, message: `تم حذف ${successCount} مستخدم بنجاح`, count: successCount });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED BULK / BATCH ACTIONS FOR SUBSCRIBERS (HOTSPOT, PPPoE, USER MANAGER)
// High-performance atomic execution with chunked micro-yields to eliminate CPU locks
// ═══════════════════════════════════════════════════════════════════════════
router.post("/api/mikrotik/subscribers/batch-action", async (req: Request, res: Response) => {
  req.setTimeout(300000); // 5 minutes timeout for massive batch ops
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  }

  try {
    const { system, action, ids } = req.body;
    const payload = req.body.payload || req.body.value || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المشتركين مطلوبة" });
    }

    const sanitizedIds: string[] = ids.map((id: any) => sanitizeInput(String(id))).filter(Boolean);
    if (sanitizedIds.length === 0) {
      return res.status(400).json({ success: false, message: "لم يتم تحديد أي معرف صالح" });
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Helper for concurrent chunked processing (capped at 4 concurrent requests with pacing yields to protect router CPU and memory)
    const runConcurrentBatch = async <T>(
      items: T[],
      concurrency: number,
      fn: (item: T) => Promise<any>
    ) => {
      const isStressed = client.isThermalStressed ? client.isThermalStressed() : false;
      const safeConcurrency = isStressed ? 2 : Math.min(Math.max(1, concurrency || 4), 4);
      let sCount = 0;
      let fCount = 0;
      for (let i = 0; i < items.length; i += safeConcurrency) {
        const chunk = items.slice(i, i + safeConcurrency);
        const results = await Promise.allSettled(chunk.map(item => fn(item)));
        for (const res of results) {
          if (res.status === 'fulfilled') {
            sCount++;
          } else {
            fCount++;
            if (res.reason?.message) {
              errors.push(res.reason.message);
            }
          }
        }
        if (i + safeConcurrency < items.length) {
          const pauseMs = isStressed ? 40 : 20;
          await new Promise(resolve => setTimeout(resolve, pauseMs));
        }
      }
      return { sCount, fCount };
    };

    if (system === 'hotspot') {
      const userById = new Map<string, any>();
      const userByName = new Map<string, any>();

      const hsUsers = await client.querySafe('/ip/hotspot/user/print', ['=.proplist=.id,name,comment,disabled,profile'], { rapid: true });
      const userList = Array.isArray(hsUsers) ? hsUsers : [];
      for (const u of userList) {
        if (u['.id']) userById.set(u['.id'], u);
        if (u.id) userById.set(u.id, u);
        if (u.name) userByName.set(String(u.name).toLowerCase(), u);
      }

      const resolveUser = (rawId: string) => {
        return userById.get(rawId) || userByName.get(rawId.toLowerCase()) || { '.id': rawId, name: rawId };
      };

      if (action === 'delete') {
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUser(rawId);
          const mikrotikId = u?.['.id'] || (rawId.startsWith('*') ? rawId : null);
          let removed = false;
          if (mikrotikId) {
            try {
              await client.query('/ip/hotspot/user/remove', [`=.id=${mikrotikId}`], { rapid: true });
              removed = true;
            } catch {}
          }
          if (!removed) {
            const found = await client.querySafe('/ip/hotspot/user/print', ['=.proplist=.id,name', `?name=${u?.name || rawId}`]);
            if (Array.isArray(found) && found[0]?.['.id']) {
              await client.query('/ip/hotspot/user/remove', [`=.id=${found[0]['.id']}`], { rapid: true });
              removed = true;
            } else if (rawId.startsWith('*')) {
              try {
                await client.query('/ip/hotspot/user/remove', [`=.id=${rawId}`], { rapid: true });
                removed = true;
              } catch {}
            }
          }
          if (!removed) {
            throw new Error(`تعذر العثور على المشترك (${u?.name || rawId}) أو حذفه من الراوتر`);
          }
          // Immediately disconnect active sessions for deleted user
          try {
            const uName = u?.name || rawId;
            const acts = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user', `?user=${uName}`], { rapid: true });
            if (Array.isArray(acts)) {
              for (const act of acts) {
                await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          } catch {}
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ip/hotspot");
        invalidateCache("/ip/hotspot/active");
      } else if (action === 'change_profile') {
        const newProfile = sanitizeInput(payload?.profile || '');
        const resetLimits = Boolean(payload?.resetLimits);
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const params = [`=.id=${mikrotikId}`, `=profile=${newProfile}`];
          if (resetLimits) {
            params.push('=limit-uptime=', '=limit-bytes-total=');
          }
          await client.query('/ip/hotspot/user/set', params, { rapid: true });
          if (resetLimits) {
            try {
              await client.query('/ip/hotspot/user/reset-counters', [`=.id=${mikrotikId}`], { rapid: true });
            } catch {}
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ip/hotspot");
      } else if (action === 'renew') {
        const { resetUptime, resetBytes, enableAccount } = payload || {};
        const shouldResetCounters = resetUptime !== false || resetBytes !== false;
        let kickedAnyActive = false;
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const username = u.name || rawId;
          // Preserve card/account limits (do NOT blank limit-uptime or limit-bytes-total on renew!)
          const params = [`=.id=${mikrotikId}`, `=comment=تم تجديد الاشتراك وتصفير العداد`];
          if (enableAccount !== false) params.push('=disabled=no');
          await client.query('/ip/hotspot/user/set', params, { rapid: true });
          if (shouldResetCounters) {
            try {
              await client.query('/ip/hotspot/user/reset-counters', [`=.id=${mikrotikId}`], { rapid: true });
            } catch {}
            try {
              const activeList = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user', `?user=${username}`], { rapid: true });
              if (Array.isArray(activeList) && activeList.length > 0) {
                for (const act of activeList) {
                  await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
                  kickedAnyActive = true;
                }
              }
            } catch {}
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ip/hotspot");
        if (kickedAnyActive) invalidateCache("/ip/hotspot/active");
      } else if (action === 'toggle_status') {
        const enable = Boolean(payload?.enable);
        const kickActive = Boolean(payload?.kickActive);
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const username = u.name || rawId;
          await client.query('/ip/hotspot/user/set', [`=.id=${mikrotikId}`, `=disabled=${enable ? 'no' : 'yes'}`], { rapid: true });
          if (!enable && kickActive) {
            try {
              const activeList = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user', `?user=${username}`], { rapid: true });
              if (Array.isArray(activeList)) {
                for (const act of activeList) {
                  await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
                }
              }
            } catch {}
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ip/hotspot");
        if (kickActive) invalidateCache("/ip/hotspot/active");
      } else if (action === 'disconnect') {
        const activeList = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user'], { rapid: true });
        const targetNames = new Set<string>();
        for (const rawId of sanitizedIds) {
          const u = resolveUser(rawId);
          if (u.name) targetNames.add(String(u.name).toLowerCase());
          targetNames.add(rawId.toLowerCase());
        }

        if (Array.isArray(activeList)) {
          const matchingActive = activeList.filter((act: any) => targetNames.has(String(act.user || '').toLowerCase()));
          const resBatch = await runConcurrentBatch(matchingActive, 4, async (act: any) => {
            await client.query('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`], { rapid: true });
          });
          successCount = resBatch.sCount;
          failCount = resBatch.fCount;
        }
        invalidateCache("/ip/hotspot/active");
      } else if (action === 'edit') {
        const { profile, limitUptime, limitBytesTotal, comment, disabled } = payload || {};
        let kickedAnyActive = false;
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const username = u.name || rawId;
          const params = [`=.id=${mikrotikId}`];
          if (profile !== undefined && profile !== '') params.push(`=profile=${sanitizeInput(profile)}`);
          if (comment !== undefined) params.push(`=comment=${sanitizeInput(comment)}`);
          if (disabled !== undefined) params.push(`=disabled=${disabled ? 'yes' : 'no'}`);
          if (limitUptime !== undefined) {
            const val = sanitizeInput(limitUptime);
            params.push(val ? `=limit-uptime=${val}` : `=limit-uptime=`);
          }
          if (limitBytesTotal !== undefined) {
            const num = Number(limitBytesTotal);
            params.push(num > 0 ? `=limit-bytes-total=${num}` : `=limit-bytes-total=`);
          }
          await client.query('/ip/hotspot/user/set', params, { rapid: true });
          if (disabled === true) {
            try {
              const activeList = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user', `?user=${username}`], { rapid: true });
              if (Array.isArray(activeList)) {
                for (const act of activeList) {
                  await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
                  kickedAnyActive = true;
                }
              }
            } catch {}
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ip/hotspot");
        if (kickedAnyActive) invalidateCache("/ip/hotspot/active");
      }
    } else if (system === 'pppoe') {
      const secretById = new Map<string, any>();
      const secretByName = new Map<string, any>();

      const pppSecrets = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name,comment,disabled,profile,service'], { rapid: true });
      const secretList = Array.isArray(pppSecrets) ? pppSecrets : [];
      for (const s of secretList) {
        if (s['.id']) secretById.set(s['.id'], s);
        if (s.id) secretById.set(s.id, s);
        if (s.name) secretByName.set(String(s.name).toLowerCase(), s);
      }

      const resolveSecret = (rawId: string) => {
        return secretById.get(rawId) || secretByName.get(rawId.toLowerCase()) || { '.id': rawId, name: rawId };
      };

      const buildTargetSecretNames = () => {
        const names = new Set<string>();
        for (const rawId of sanitizedIds) {
          const s = resolveSecret(rawId);
          if (s.name) names.add(String(s.name).toLowerCase());
          names.add(rawId.toLowerCase());
        }
        return names;
      };

      if (action === 'delete') {
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const s = resolveSecret(rawId);
          const mikrotikId = s?.['.id'] || (rawId.startsWith('*') ? rawId : null);
          let removed = false;
          if (mikrotikId) {
            try {
              await client.query('/ppp/secret/remove', [`=.id=${mikrotikId}`], { rapid: true });
              removed = true;
            } catch {}
          }
          if (!removed) {
            const found = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name', `?name=${s?.name || rawId}`]);
            if (Array.isArray(found) && found[0]?.['.id']) {
              await client.query('/ppp/secret/remove', [`=.id=${found[0]['.id']}`], { rapid: true });
              removed = true;
            } else if (rawId.startsWith('*')) {
              try {
                await client.query('/ppp/secret/remove', [`=.id=${rawId}`], { rapid: true });
                removed = true;
              } catch {}
            }
          }
          if (!removed) {
            throw new Error(`تعذر العثور على حساب البرودباند (${s?.name || rawId}) أو حذفه من الراوتر`);
          }
          // Immediately disconnect active PPP session
          try {
            const sName = s?.name || rawId;
            const acts = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name', `?name=${sName}`], { rapid: true });
            if (Array.isArray(acts)) {
              for (const act of acts) {
                await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          } catch {}
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ppp");
        invalidateCache("/ppp/active");
      } else if (action === 'change_profile') {
        const newProfile = sanitizeInput(payload?.profile || '');
        const resetLimits = Boolean(payload?.resetLimits);
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const s = resolveSecret(rawId);
          const mikrotikId = s['.id'] || rawId;
          await client.query('/ppp/secret/set', [`=.id=${mikrotikId}`, `=profile=${newProfile}`], { rapid: true });
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        if (resetLimits) {
          try {
            const targetNames = buildTargetSecretNames();
            const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name'], { rapid: true });
            if (Array.isArray(pppAct)) {
              const matching = pppAct.filter((act: any) => targetNames.has(String(act.name || '').toLowerCase()));
              for (const act of matching) {
                await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
              if (matching.length > 0) invalidateCache("/ppp/active");
            }
          } catch {}
        }
        invalidateCache("/ppp");
      } else if (action === 'renew') {
        const { enableAccount } = payload || {};
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const s = resolveSecret(rawId);
          const mikrotikId = s['.id'] || rawId;
          const params = [`=.id=${mikrotikId}`, `=comment=تم تجديد الاشتراك وتصفير العداد`];
          if (enableAccount !== false) params.push('=disabled=no');
          await client.query('/ppp/secret/set', params, { rapid: true });
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        try {
          const targetNames = buildTargetSecretNames();
          const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name'], { rapid: true });
          if (Array.isArray(pppAct)) {
            const matching = pppAct.filter((act: any) => targetNames.has(String(act.name || '').toLowerCase()));
            for (const act of matching) {
              await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
            }
            if (matching.length > 0) invalidateCache("/ppp/active");
          }
        } catch {}
        invalidateCache("/ppp");
      } else if (action === 'toggle_status') {
        const enable = Boolean(payload?.enable);
        const kickActive = Boolean(payload?.kickActive);
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const s = resolveSecret(rawId);
          const mikrotikId = s['.id'] || rawId;
          const username = s.name || rawId;
          await client.query('/ppp/secret/set', [`=.id=${mikrotikId}`, `=disabled=${enable ? 'no' : 'yes'}`], { rapid: true });
          if (!enable && kickActive) {
            const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name', `?name=${username}`], { rapid: true });
            if (Array.isArray(pppAct)) {
              for (const act of pppAct) {
                await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ppp");
        if (kickActive) invalidateCache("/ppp/active");
      } else if (action === 'disconnect') {
        const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name'], { rapid: true });
        const targetNames = buildTargetSecretNames();
        if (Array.isArray(pppAct)) {
          const matchingActive = pppAct.filter((act: any) => targetNames.has(String(act.name || '').toLowerCase()));
          const resBatch = await runConcurrentBatch(matchingActive, 4, async (act: any) => {
            await client.query('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`], { rapid: true });
          });
          successCount = resBatch.sCount;
          failCount = resBatch.fCount;
        }
        invalidateCache("/ppp/active");
      } else if (action === 'edit') {
        const { profile, service, localAddress, remoteAddress, comment, disabled } = payload || {};
        let kickedAnyActive = false;
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const s = resolveSecret(rawId);
          const mikrotikId = s['.id'] || rawId;
          const username = s.name || rawId;
          const params = [`=.id=${mikrotikId}`];
          if (profile) params.push(`=profile=${sanitizeInput(profile)}`);
          if (service) params.push(`=service=${sanitizeInput(service)}`);
          if (comment !== undefined) params.push(`=comment=${sanitizeInput(comment)}`);
          if (disabled !== undefined) params.push(`=disabled=${disabled ? 'yes' : 'no'}`);
          if (localAddress !== undefined) params.push(`=local-address=${sanitizeInput(localAddress)}`);
          if (remoteAddress !== undefined) params.push(`=remote-address=${sanitizeInput(remoteAddress)}`);
          await client.query('/ppp/secret/set', params, { rapid: true });
          if (disabled === true) {
            try {
              const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name', `?name=${username}`], { rapid: true });
              if (Array.isArray(pppAct)) {
                for (const act of pppAct) {
                  await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
                  kickedAnyActive = true;
                }
              }
            } catch {}
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("/ppp");
        if (kickedAnyActive) invalidateCache("/ppp/active");
      }
    } else if (system === 'userman') {
      const umPrefix = getUserManPrefix(client);
      const isV6 = client.isV6 ? client.isV6() : false;
      const userById = new Map<string, any>();
      const userByName = new Map<string, any>();

      const umUsers = await client.querySafe(`${umPrefix}/user/print`, ['=.proplist=.id,name,username,comment,disabled,customer'], { rapid: true });
      const userList = Array.isArray(umUsers) ? umUsers : [];
      for (const u of userList) {
        if (u['.id']) userById.set(u['.id'], u);
        if (u.id) userById.set(u.id, u);
        const nameVal = u.username || u.name;
        if (nameVal) userByName.set(String(nameVal).toLowerCase(), u);
      }

      const resolveUmUser = (rawId: string) => {
        return userById.get(rawId) || userByName.get(rawId.toLowerCase()) || { '.id': rawId, name: rawId, username: rawId };
      };

      const kickUsermanActiveByNames = async (names: string[]) => {
        const nameSet = new Set(names.filter(Boolean).map((n) => n.toLowerCase()));
        if (nameSet.size === 0) return;
        try {
          const hsAct = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user'], { rapid: true });
          if (Array.isArray(hsAct)) {
            for (const act of hsAct) {
              if (nameSet.has(String(act.user || '').toLowerCase())) {
                await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          }
        } catch {}
        try {
          const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name'], { rapid: true });
          if (Array.isArray(pppAct)) {
            for (const act of pppAct) {
              if (nameSet.has(String(act.name || '').toLowerCase())) {
                await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          }
        } catch {}
        try {
          const umSessions = await client.querySafe(`${umPrefix}/${isV6 ? 'active' : 'session'}/print`, ['=.proplist=.id,user,username'], { rapid: true });
          if (Array.isArray(umSessions)) {
            for (const sess of umSessions) {
              if (nameSet.has(String(sess.user || sess.username || '').toLowerCase())) {
                await client.querySafe(`${umPrefix}/${isV6 ? 'active' : 'session'}/remove`, [`=.id=${sess['.id'] || sess.id}`]);
              }
            }
          }
        } catch {}
      };

      if (action === 'delete') {
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUmUser(rawId);
          const mikrotikId = u?.['.id'] || (rawId.startsWith('*') ? rawId : null);
          let removed = false;
          if (mikrotikId) {
            try {
              await client.query(`${umPrefix}/user/remove`, [`=.id=${mikrotikId}`], { rapid: true });
              removed = true;
            } catch {}
          }
          if (!removed) {
            const uName = u?.name || u?.username || rawId;
            const found = await client.querySafe(`${umPrefix}/user/print`, isV6 ? ['=.proplist=.id,username', `?username=${uName}`] : ['=.proplist=.id,name', `?name=${uName}`]);
            if (Array.isArray(found) && found[0]?.['.id']) {
              await client.query(`${umPrefix}/user/remove`, [`=.id=${found[0]['.id']}`], { rapid: true });
              removed = true;
            } else if (rawId.startsWith('*')) {
              try {
                await client.query(`${umPrefix}/user/remove`, [`=.id=${rawId}`], { rapid: true });
                removed = true;
              } catch {}
            }
          }
          if (!removed) {
            throw new Error(`تعذر العثور على مشترك اليوزر مانجر (${u?.name || u?.username || rawId}) أو حذفه`);
          }
          await kickUsermanActiveByNames([u?.name, u?.username, rawId]);
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("user-manager");
        invalidateCache("/ip/hotspot/active");
        invalidateCache("/ppp/active");
        clearCachedUsermanResult();
      } else if (action === 'change_profile') {
        const newProfile = sanitizeInput(payload?.profile || '');
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUmUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const username = u.name || u.username || rawId;
          if (isV6) {
            await client.query(`${umPrefix}/user/create-and-activate-profile`, [
              `=username=${username}`,
              `=profile=${newProfile}`,
              `=customer=${u.customer || 'admin'}`
            ], { rapid: true });
          } else {
            try {
              await client.query(`${umPrefix}/user-profile/add`, [`=user=${username}`, `=profile=${newProfile}`], { rapid: true });
            } catch {
              await client.query(`${umPrefix}/user/set`, [`=.id=${mikrotikId}`, `=group=${newProfile}`], { rapid: true });
            }
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("user-manager");
        clearCachedUsermanResult();
      } else if (action === 'renew') {
        const { resetUptime, resetBytes, enableAccount } = payload || {};
        const shouldReset = resetUptime !== false || resetBytes !== false;
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUmUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const username = u.name || u.username || rawId;
          const params = [`=.id=${mikrotikId}`, `=comment=تم تجديد الاشتراك وتصفير العداد`];
          if (enableAccount !== false) params.push('=disabled=no');
          await client.query(`${umPrefix}/user/set`, params, { rapid: true });
          if (shouldReset) {
            if (isV6) {
              try {
                await client.query(`${umPrefix}/user/reset-counters`, [`=.id=${mikrotikId}`], { rapid: true });
              } catch {}
            }
            await kickUsermanActiveByNames([username]);
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("user-manager");
        invalidateCache("/ip/hotspot/active");
        invalidateCache("/ppp/active");
        clearCachedUsermanResult();
      } else if (action === 'toggle_status') {
        const enable = Boolean(payload?.enable);
        const kickActive = Boolean(payload?.kickActive);
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUmUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const username = u.name || u.username || rawId;
          await client.query(`${umPrefix}/user/set`, [`=.id=${mikrotikId}`, `=disabled=${enable ? 'no' : 'yes'}`], { rapid: true });
          if (!enable && kickActive) {
            await kickUsermanActiveByNames([username]);
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("user-manager");
        if (kickActive) {
          invalidateCache("/ip/hotspot/active");
          invalidateCache("/ppp/active");
        }
        clearCachedUsermanResult();
      } else if (action === 'disconnect') {
        const targetNames = new Set<string>();
        for (const rawId of sanitizedIds) {
          const u = resolveUmUser(rawId);
          if (u.name) targetNames.add(String(u.name).toLowerCase());
          if (u.username) targetNames.add(String(u.username).toLowerCase());
          targetNames.add(rawId.toLowerCase());
        }

        try {
          const hsAct = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user'], { rapid: true });
          if (Array.isArray(hsAct)) {
            const matchingHs = hsAct.filter((act: any) => targetNames.has(String(act.user || '').toLowerCase()));
            const resHs = await runConcurrentBatch(matchingHs, 4, async (act: any) => {
              await client.query('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`], { rapid: true });
            });
            successCount += resHs.sCount;
          }
        } catch {}

        try {
          const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name'], { rapid: true });
          if (Array.isArray(pppAct)) {
            const matchingPpp = pppAct.filter((act: any) => targetNames.has(String(act.name || '').toLowerCase()));
            const resPpp = await runConcurrentBatch(matchingPpp, 4, async (act: any) => {
              await client.query('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`], { rapid: true });
            });
            successCount += resPpp.sCount;
          }
        } catch {}

        try {
          const sessionPath = `${umPrefix}/${isV6 ? 'active' : 'session'}`;
          const umSessions = await client.querySafe(`${sessionPath}/print`, ['=.proplist=.id,user,username'], { rapid: true });
          if (Array.isArray(umSessions)) {
            const matchingUm = umSessions.filter((sess: any) => targetNames.has(String(sess.user || sess.username || '').toLowerCase()));
            const resUm = await runConcurrentBatch(matchingUm, 4, async (sess: any) => {
              await client.query(`${sessionPath}/remove`, [`=.id=${sess['.id'] || sess.id}`], { rapid: true });
            });
            successCount += resUm.sCount;
          }
        } catch {}

        invalidateCache("user-manager");
        invalidateCache("/ip/hotspot/active");
        invalidateCache("/ppp/active");
        clearCachedUsermanResult();
      } else if (action === 'edit') {
        const { profile, comment, disabled } = payload || {};
        const resBatch = await runConcurrentBatch(sanitizedIds, 4, async (rawId) => {
          const u = resolveUmUser(rawId);
          const mikrotikId = u['.id'] || rawId;
          const username = u.name || u.username || rawId;
          const params = [`=.id=${mikrotikId}`];
          if (comment !== undefined) params.push(`=comment=${sanitizeInput(comment)}`);
          if (disabled !== undefined) params.push(`=disabled=${disabled ? 'yes' : 'no'}`);
          if (params.length > 1) {
            await client.query(`${umPrefix}/user/set`, params, { rapid: true });
          }
          if (profile) {
            const cleanProf = sanitizeInput(profile);
            if (isV6) {
              await client.query(`${umPrefix}/user/create-and-activate-profile`, [
                `=username=${username}`,
                `=profile=${cleanProf}`,
                `=customer=${u.customer || 'admin'}`
              ], { rapid: true });
            } else {
              try {
                await client.query(`${umPrefix}/user-profile/add`, [`=user=${username}`, `=profile=${cleanProf}`], { rapid: true });
              } catch {
                await client.query(`${umPrefix}/user/set`, [`=.id=${mikrotikId}`, `=group=${cleanProf}`], { rapid: true });
              }
            }
          }
          if (disabled === true) {
            await kickUsermanActiveByNames([username]);
          }
        });
        successCount = resBatch.sCount;
        failCount = resBatch.fCount;
        invalidateCache("user-manager");
        if (disabled === true) {
          invalidateCache("/ip/hotspot/active");
          invalidateCache("/ppp/active");
        }
        clearCachedUsermanResult();
      }
    }

    if (action === 'disconnect') {
      if (successCount === 0) {
        return res.json({
          success: true,
          message: "لا توجد جلسات نشطة حالياً في الراوتر لهؤلاء المشتركين لفصلها",
          count: 0,
          total: sanitizedIds.length
        });
      }
      return res.json({
        success: true,
        message: `تم فصل (${successCount}) جلسة نشطة حقيقية وتأكيد خروجها من الراوتر بنجاح`,
        count: successCount,
        total: sanitizedIds.length
      });
    }

    if (successCount === 0) {
      return res.status(400).json({
        success: false,
        message: errors.length > 0 ? `فشل الإجراء على المايكروتك: ${errors[0]}` : "تعذر تنفيذ الإجراء على المايكروتك، يرجى التحقق من اتصال الراوتر وصلاحياته",
        count: 0,
        failed: failCount
      });
    }

    if (failCount > 0) {
      recordAudit(req, `batch_${sanitizeInput(action)}`, `subscribers_${sanitizeInput(system)}`, "success", {
        reason: `تم لـ ${successCount} وفشل ${failCount}`
      });
      return res.json({
        success: true,
        message: `تم تنفيذ الإجراء بنجاح وتأكيده على المايكروتك لـ (${successCount}) مشترك، وفشل (${failCount})`,
        count: successCount,
        failed: failCount,
        total: sanitizedIds.length
      });
    }

    recordAudit(req, `batch_${sanitizeInput(action)}`, `subscribers_${sanitizeInput(system)}`, "success", {
      resourceId: `${successCount} items`
    });
    return res.json({
      success: true,
      message: `تم تنفيذ الإجراء وتأكيده حقيقياً على المايكروتك بنجاح لجميع المشتركين المحددين (${successCount})`,
      count: successCount,
      failed: 0,
      total: sanitizedIds.length
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/hotspot/users/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    let targetId = rawId;
    let existingName = rawId.startsWith('*') ? '' : rawId;
    if (!targetId.startsWith('*')) {
      const found = await client.querySafe('/ip/hotspot/user/print', ['=.proplist=.id,name', `?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        targetId = found[0]['.id'];
        existingName = found[0].name || existingName;
      }
    } else {
      const found = await client.querySafe('/ip/hotspot/user/print', ['=.proplist=.id,name', `?.id=${targetId}`]);
      if (Array.isArray(found) && found[0]?.name) {
        existingName = found[0].name;
      }
    }
    const { name, password, profile, comment, limitUptime, limitBytesTotal, disabled, email, macAddress, resetCounters } = req.body;
    const params = [`=.id=${targetId}`];
    if (name !== undefined) params.push(`=name=${sanitizeInput(name)}`);
    if (password !== undefined) params.push(`=password=${sanitizeInput(password)}`);
    if (profile !== undefined) params.push(`=profile=${sanitizeInput(profile)}`);
    if (comment !== undefined) params.push(`=comment=${sanitizeInput(comment)}`);
    if (limitUptime !== undefined) {
      const val = sanitizeInput(limitUptime);
      params.push(val ? `=limit-uptime=${val}` : `=limit-uptime=`);
    }
    if (limitBytesTotal !== undefined) {
      const num = Number(limitBytesTotal);
      params.push(num > 0 ? `=limit-bytes-total=${num}` : `=limit-bytes-total=`);
    }
    if (disabled !== undefined) params.push(`=disabled=${disabled === true || disabled === 'yes' ? 'yes' : 'no'}`);
    if (email !== undefined) params.push(`=email=${sanitizeInput(email)}`);
    if (macAddress !== undefined) params.push(`=mac-address=${sanitizeInput(macAddress)}`);

    await client.query('/ip/hotspot/user/set', params);

    if (resetCounters) {
      try {
        await client.query('/ip/hotspot/user/reset-counters', [`=.id=${targetId}`]);
      } catch {}
    }

    // إذا تم تعطيل المشترك أو تصفير عداده، نقوم فوراً بطرد أي جلسة نشطة له من الشبكة
    if (disabled === true || disabled === 'yes' || resetCounters) {
      try {
        const namesToKick = Array.from(new Set([existingName, name ? sanitizeInput(name) : ''].filter(Boolean)));
        for (const uName of namesToKick) {
          const activeList = await client.querySafe('/ip/hotspot/active/print', [`?user=${uName}`]);
          if (Array.isArray(activeList)) {
            for (const act of activeList) {
              await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
            }
          }
        }
        invalidateCache("/ip/hotspot/active");
      } catch {}
    }

    invalidateCache("/ip/hotspot");
    res.json({ success: true, message: "تم تحديث بيانات المشترك وتأكيدها على المايكروتك بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ACTIVE HOTSPOT DISCONNECT
router.post("/api/mikrotik/hotspot/active/disconnect", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.body.id || '');
    const rawUser = sanitizeInput(req.body.user || '');
    const targetId = rawId;
    let removed = false;
    if (targetId && targetId.startsWith('*')) {
      try {
        await client.query('/ip/hotspot/active/remove', [`=.id=${targetId}`]);
        removed = true;
      } catch {}
    }
    const userToFind = rawUser || (rawId && !rawId.startsWith('*') ? rawId : '');
    if (!removed && userToFind) {
      const found = await client.querySafe('/ip/hotspot/active/print', [`?user=${userToFind}`]);
      if (Array.isArray(found) && found.length > 0) {
        for (const act of found) {
          try {
            await client.query('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
            removed = true;
          } catch {}
        }
      }
    } else if (!removed && targetId) {
      try {
        await client.query('/ip/hotspot/active/remove', [`=.id=${targetId}`]);
        removed = true;
      } catch {}
    }
    if (!removed) {
      return res.status(404).json({ success: false, message: "الجلسة غير موجودة أو تم فصلها مسبقاً" });
    }
    invalidateCache("/ip/hotspot/active");
    invalidateCache("/ip/hotspot/user");
    res.json({ success: true, message: "تم فصل الجلسة وتأكيد خروجها من الراوتر بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// HOTSPOT PROFILES CRUD
router.post("/api/mikrotik/hotspot/profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const bodyData = req.body.profileData || req.body || {};
    const {
      name, sharedUsers, rateLimit, macCookieTimeout, keepaliveTimeout, sessionTimeout, addressPool,
      idleTimeout, statusAutorefresh, openStatusPage, transparentProxy, parentQueue, queueType,
      insertQueueBefore, advertise, advertiseUrl, advertiseInterval, advertiseTimeout,
      onLoginScript, onLogoutScript, incomingFilter, outgoingFilter, addressList,
      price, validity, validityDays, dataQuotaMb, startsAt
    } = bodyData;
    const sName = sanitizeInput(name);
    if (!sName) return res.status(400).json({ success: false, message: "اسم البروفايل مطلوب" });

    const su = Math.max(1, parseInt(String(sharedUsers), 10) || 1);
    const params = [`=name=${sName}`, `=shared-users=${su}`];

    const rl = normalizeRateLimitString(sanitizeInput(rateLimit));
    if (rl) params.push(`=rate-limit=${rl}`);

    const cleanMac = cleanMikrotikTimeout(macCookieTimeout);
    if (cleanMac) params.push(`=mac-cookie-timeout=${cleanMac}`);

    const cleanKeep = cleanMikrotikTimeout(keepaliveTimeout);
    if (cleanKeep) params.push(`=keepalive-timeout=${cleanKeep}`);

    const cleanSess = cleanMikrotikTimeout(sessionTimeout);
    if (cleanSess) params.push(`=session-timeout=${cleanSess}`);

    const cleanIdle = cleanMikrotikTimeout(idleTimeout);
    if (cleanIdle) params.push(`=idle-timeout=${cleanIdle}`);

    const cleanAuto = cleanMikrotikTimeout(statusAutorefresh);
    if (cleanAuto) params.push(`=status-autorefresh=${cleanAuto}`);

    if (addressPool && addressPool !== 'none' && addressPool !== 'unchanged' && addressPool !== 'preserve') {
      const ap = sanitizeInput(addressPool);
      if (ap) params.push(`=address-pool=${ap}`);
    }

    if (openStatusPage && openStatusPage !== 'default') {
      const osp = sanitizeInput(openStatusPage);
      if (osp === 'always' || osp === 'http-login') params.push(`=open-status-page=${osp}`);
    }
    if (transparentProxy !== undefined && client.isV6 && client.isV6()) {
      params.push(`=transparent-proxy=${transparentProxy ? 'yes' : 'no'}`);
    }
    if (parentQueue && parentQueue !== 'none' && parentQueue !== 'default') {
      const pq = sanitizeInput(parentQueue);
      if (pq) params.push(`=parent-queue=${pq}`);
    }
    if (queueType && queueType !== 'default' && queueType !== 'none') {
      const qt = sanitizeInput(queueType);
      if (qt) params.push(`=queue-type=${qt}`);
    }
    // Only send insert-queue-before when explicitly customized (default 'first' breaks routers with no queues!)
    if (insertQueueBefore && insertQueueBefore !== 'none' && insertQueueBefore !== 'default' && insertQueueBefore !== 'first') {
      const iqb = sanitizeInput(insertQueueBefore);
      if (iqb) params.push(`=insert-queue-before=${iqb}`);
    }

    if (advertise === true || advertise === 'yes') {
      params.push(`=advertise=yes`);
      if (advertiseUrl) params.push(`=advertise-url=${sanitizeInput(advertiseUrl)}`);
      const cleanAdvInt = cleanMikrotikTimeout(advertiseInterval);
      if (cleanAdvInt) params.push(`=advertise-interval=${cleanAdvInt}`);
      const cleanAdvTo = cleanMikrotikTimeout(advertiseTimeout);
      if (cleanAdvTo) params.push(`=advertise-timeout=${cleanAdvTo}`);
    }

    let userScript = onLoginScript || "";
    userScript = userScript
      .replace(/^# ZCtrl\|Price:[^\n]*\n?/gm, '')
      .replace(/:local userVal "\$user";\s*:local validityVal "[^"]+";[^\n]*/g, '')
      .replace(/:if\s*\(?\[\/system scheduler find name=\$userVal\][^\n]*/g, '')
      .trim();

    const priceVal = price !== undefined ? (Number(price) || 0) : 0;
    const quotaVal = dataQuotaMb !== undefined ? (Number(dataQuotaMb) || 0) : 0;
    let validityStr = (validity || (validityDays ? `${validityDays}d` : '')).trim();
    if (validityStr === '0' || validityStr === '0s' || validityStr.toLowerCase() === 'unlimited') validityStr = '';

    const effStartsAt = startsAt === 'at-creation' ? 'at-creation' : 'first-login';
    const metaHeader = `# ZCtrl|Price:${priceVal}|Validity:${validityStr || 'unlimited'}|DataQuotaMb:${quotaVal}|StartsAt:${effStartsAt}|SharedUsers:${su}`;
    const finalOnLogin = userScript ? `${metaHeader}\n${userScript}`.trim() : metaHeader;
    // IMPORTANT: /ip/hotspot/user/profile has NO 'comment' attribute in RouterOS v6/v7!
    // Store metadata safely inside 'on-login' (parsed automatically by normalizeHotspotProfile).
    if (finalOnLogin) params.push(`=on-login=${finalOnLogin}`);

    if (onLogoutScript && onLogoutScript.trim()) params.push(`=on-logout=${onLogoutScript.trim()}`);
    if (incomingFilter && incomingFilter !== 'none' && incomingFilter.trim() !== '') params.push(`=incoming-filter=${sanitizeInput(incomingFilter)}`);
    if (outgoingFilter && outgoingFilter !== 'none' && outgoingFilter.trim() !== '') params.push(`=outgoing-filter=${sanitizeInput(outgoingFilter)}`);
    if (addressList && addressList !== 'none' && addressList.trim() !== '') params.push(`=address-list=${sanitizeInput(addressList)}`);

    const { result: addRes } = await executeProfileMutation(
      client,
      '/ip/hotspot/user/profile/add',
      params,
      HOTSPOT_OPTIONAL_FALLBACK_KEYS
    );

    invalidateCache("/ip/hotspot");
    let createdId = addRes?.[0]?.ret || addRes?.[0]?.['.id'] || '';
    if (!createdId) {
      const lookup = await client.querySafe('/ip/hotspot/user/profile/print', [`?name=${sName}`], { timeoutSeconds: 3, rapid: true });
      if (Array.isArray(lookup) && lookup[0]?.['.id']) {
        createdId = lookup[0]['.id'];
      }
    }

    const createdProfile = {
      id: createdId || sName,
      name: sName,
      sharedUsers: su,
      rateLimit: rl,
      addressPool: addressPool && addressPool !== 'none' ? sanitizeInput(addressPool) : '',
      price: priceVal,
      validity: validityStr,
      startsAt: effStartsAt,
      dataQuotaMb: quotaVal,
      idleTimeout: cleanIdle || '',
      sessionTimeout: cleanSess || '',
      keepaliveTimeout: cleanKeep || '',
      macCookieTimeout: cleanMac || '',
      statusAutorefresh: cleanAuto || '',
      queueType: queueType || 'default'
    };
    const routerHost = client.getConfig ? client.getConfig()?.host : undefined;
    try {
      const daysMatch = validityStr.match(/(\d+)\s*d/i);
      voucherDb.saveProfileMetadata(
        "hotspot",
        sName,
        {
          price: priceVal,
          validity: validityStr,
          validityDays: daysMatch ? parseInt(daysMatch[1], 10) : 0,
          dataQuotaMb: quotaVal,
          startsAt: effStartsAt,
          sharedUsers: su
        },
        routerHost
      );
    } catch {}

    recordAudit(req, "create_hotspot_profile", "hotspot_profiles", "success", { resourceId: sName });
    res.json({ success: true, message: `تم إضافة بروفايل الهوتسبوت (${sName}) بنجاح وحفظه مباشرة على المايكروتك`, profile: createdProfile });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/hotspot/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const bodyData = req.body.profileData || req.body || {};

    const {
      name, sharedUsers, rateLimit, macCookieTimeout, keepaliveTimeout, sessionTimeout, addressPool,
      idleTimeout, statusAutorefresh, openStatusPage, transparentProxy, parentQueue, queueType,
      insertQueueBefore, advertise, advertiseUrl, advertiseInterval, advertiseTimeout,
      onLoginScript, onLogoutScript, incomingFilter, outgoingFilter, addressList,
      price, validity, validityDays, dataQuotaMb, startsAt,
      changeAddressPool, oldName, id: bodyId
    } = bodyData;

    let resolvedId = (bodyId && String(bodyId).startsWith('*')) ? String(bodyId).trim() : '';
    let oldProfileName = sanitizeInput(oldName || "");
    let existingRawProfile: any = null;

    // Single lookup to obtain *.id, existing profile name, and existing metadata
    try {
      const allProfs = await client.querySafe('/ip/hotspot/user/profile/print', undefined, { timeoutSeconds: 5, rapid: true });
      if (Array.isArray(allProfs)) {
        const candidates = [resolvedId, rawId, oldName, name].filter(Boolean).map((v: any) => String(v).trim());
        const found = allProfs.find((p: any) =>
          candidates.some(c =>
            p['.id'] === c ||
            p.id === c ||
            p.name === c ||
            (p.name && p.name.toLowerCase() === c.toLowerCase())
          )
        );
        if (found) {
          existingRawProfile = found;
          oldProfileName = found.name || oldProfileName;
          if (found['.id']) {
            resolvedId = found['.id'];
          }
        }
      }
    } catch {}

    // If profile really doesn't exist yet on router, gracefully auto-create it!
    if (!resolvedId || !resolvedId.startsWith('*')) {
      const targetName = name ? sanitizeInput(name) : (oldProfileName || rawId);
      if (!targetName) {
        return res.status(404).json({ success: false, message: "تعذر العثور على البروفايل المطلوب تعديله" });
      }
      const su = Math.max(1, parseInt(String(sharedUsers), 10) || 1);
      const addParams = [`=name=${targetName}`, `=shared-users=${su}`];
      const rl = normalizeRateLimitString(sanitizeInput(rateLimit));
      if (rl) addParams.push(`=rate-limit=${rl}`);
      const priceVal = price !== undefined ? (Number(price) || 0) : 0;
      const quotaVal = dataQuotaMb !== undefined ? (Number(dataQuotaMb) || 0) : 0;
      let validityStr = (validity || (validityDays ? `${validityDays}d` : '')).trim();
      const effStartsAt = startsAt === 'at-creation' ? 'at-creation' : 'first-login';
      const metaHeader = `# ZCtrl|Price:${priceVal}|Validity:${validityStr || 'unlimited'}|DataQuotaMb:${quotaVal}|StartsAt:${effStartsAt}|SharedUsers:${su}`;
      addParams.push(`=on-login=${metaHeader}`);
      await executeProfileMutation(client, '/ip/hotspot/user/profile/add', addParams, HOTSPOT_OPTIONAL_FALLBACK_KEYS);
      invalidateCache("/ip/hotspot");
      return res.json({ success: true, message: `تم إنشاء وحفظ بروفايل الهوتسبوت (${targetName}) بنجاح على المايكروتك` });
    }

    const newProfileName = name ? sanitizeInput(name) : (oldProfileName || rawId);
    const params: string[] = [`=.id=${resolvedId}`];

    if (name && newProfileName && newProfileName !== oldProfileName) {
      params.push(`=name=${newProfileName}`);
    }
    const su = sharedUsers !== undefined ? Math.max(1, parseInt(String(sharedUsers), 10) || 1) : undefined;
    if (su !== undefined) {
      params.push(`=shared-users=${su}`);
    }
    if (rateLimit !== undefined) {
      const rl = normalizeRateLimitString(sanitizeInput(rateLimit));
      params.push(rl ? `=rate-limit=${rl}` : `=rate-limit=`);
    }
    if (macCookieTimeout !== undefined) {
      const t = cleanMikrotikTimeout(macCookieTimeout);
      if (t) params.push(`=mac-cookie-timeout=${t}`);
    }
    if (keepaliveTimeout !== undefined) {
      const t = cleanMikrotikTimeout(keepaliveTimeout);
      params.push(t ? `=keepalive-timeout=${t}` : `=keepalive-timeout=none`);
    }
    if (sessionTimeout !== undefined) {
      const t = cleanMikrotikTimeout(sessionTimeout);
      params.push(t ? `=session-timeout=${t}` : `=session-timeout=none`);
    }
    if (idleTimeout !== undefined) {
      const t = cleanMikrotikTimeout(idleTimeout);
      params.push(t ? `=idle-timeout=${t}` : `=idle-timeout=none`);
    }
    if (statusAutorefresh !== undefined) {
      const t = cleanMikrotikTimeout(statusAutorefresh);
      if (t) params.push(`=status-autorefresh=${t}`);
    }
    // Strict IP Pool Protection: Never change pool automatically unless manually modified!
    if (changeAddressPool === true) {
      const ap = sanitizeInput(addressPool);
      params.push((ap && ap !== 'none' && ap !== 'unchanged') ? `=address-pool=${ap}` : `=address-pool=none`);
    } else if (addressPool !== undefined && addressPool !== null && addressPool !== '' && addressPool !== 'none' && addressPool !== 'unchanged' && addressPool !== 'preserve') {
      const ap = sanitizeInput(addressPool);
      if (ap && ap !== (existingRawProfile?.['address-pool'] || '')) {
        params.push(`=address-pool=${ap}`);
      }
    }
    if (openStatusPage && openStatusPage !== 'default') {
      const osp = sanitizeInput(openStatusPage);
      if (osp === 'always' || osp === 'http-login') params.push(`=open-status-page=${osp}`);
    }
    if (transparentProxy !== undefined && client.isV6 && client.isV6()) {
      params.push(`=transparent-proxy=${transparentProxy ? 'yes' : 'no'}`);
    }
    if (parentQueue !== undefined) {
      const pq = sanitizeInput(parentQueue);
      if (pq && pq !== 'none' && pq !== 'default') {
        params.push(`=parent-queue=${pq}`);
      } else if (existingRawProfile?.['parent-queue'] && existingRawProfile['parent-queue'] !== 'none') {
        params.push(`=parent-queue=none`);
      }
    }
    if (queueType !== undefined) {
      const qt = sanitizeInput(queueType);
      if (qt && qt !== 'none' && qt !== 'default') {
        params.push(`=queue-type=${qt}`);
      } else if (existingRawProfile?.['queue-type'] && existingRawProfile['queue-type'] !== 'default') {
        params.push(`=queue-type=default`);
      }
    }
    if (insertQueueBefore !== undefined && insertQueueBefore !== 'none' && insertQueueBefore !== 'default' && insertQueueBefore !== 'first' && String(insertQueueBefore).trim() !== '') {
      params.push(`=insert-queue-before=${sanitizeInput(insertQueueBefore)}`);
    }
    if (advertise !== undefined) {
      if (advertise === true || advertise === 'yes') {
        params.push(`=advertise=yes`);
        if (advertiseUrl !== undefined) params.push(`=advertise-url=${sanitizeInput(advertiseUrl)}`);
        const cleanAdvInt = cleanMikrotikTimeout(advertiseInterval);
        if (cleanAdvInt) params.push(`=advertise-interval=${cleanAdvInt}`);
        const cleanAdvTo = cleanMikrotikTimeout(advertiseTimeout);
        if (cleanAdvTo) params.push(`=advertise-timeout=${cleanAdvTo}`);
      } else if (existingRawProfile?.advertise === 'yes' || existingRawProfile?.advertise === true) {
        params.push(`=advertise=no`);
      }
    }

    const existingNorm = existingRawProfile ? normalizeHotspotProfile(existingRawProfile) : null;

    let userScript = onLoginScript !== undefined ? onLoginScript : (existingNorm?.onLoginScript || "");
    userScript = userScript
      .replace(/^# ZCtrl\|Price:[^\n]*\n?/gm, '')
      .replace(/:local userVal "\$user";\s*:local validityVal "[^"]+";[^\n]*/g, '')
      .replace(/:if\s*\(?\[\/system scheduler find name=\$userVal\][^\n]*/g, '')
      .trim();

    const priceVal = price !== undefined ? (Number(price) || 0) : (existingNorm?.price ?? 0);
    const quotaVal = dataQuotaMb !== undefined ? (Number(dataQuotaMb) || 0) : (existingNorm?.dataQuotaMb ?? 0);
    let validityStr = validity !== undefined
      ? String(validity || '').trim()
      : validityDays !== undefined
      ? (Number(validityDays) > 0 ? `${validityDays}d` : '')
      : (existingNorm?.validity || '');
    if (validityStr === '0' || validityStr === '0s' || validityStr.toLowerCase() === 'unlimited') validityStr = '';

    const effStartsAt = startsAt !== undefined
      ? (startsAt === 'at-creation' ? 'at-creation' : 'first-login')
      : (existingNorm?.startsAt || 'first-login');
    const effectiveSu = su !== undefined ? su : (existingNorm?.sharedUsers ?? 1);
    const metaHeader = `# ZCtrl|Price:${priceVal}|Validity:${validityStr || 'unlimited'}|DataQuotaMb:${quotaVal}|StartsAt:${effStartsAt}|SharedUsers:${effectiveSu}`;
    const finalOnLogin = userScript ? `${metaHeader}\n${userScript}`.trim() : metaHeader;
    params.push(`=on-login=${finalOnLogin}`);

    if (onLogoutScript !== undefined) params.push(`=on-logout=${onLogoutScript.trim()}`);
    if (incomingFilter !== undefined) {
      const f = sanitizeInput(incomingFilter);
      if (f && f !== 'none') params.push(`=incoming-filter=${f}`);
      else if (existingRawProfile?.['incoming-filter']) params.push(`=incoming-filter=`);
    }
    if (outgoingFilter !== undefined) {
      const f = sanitizeInput(outgoingFilter);
      if (f && f !== 'none') params.push(`=outgoing-filter=${f}`);
      else if (existingRawProfile?.['outgoing-filter']) params.push(`=outgoing-filter=`);
    }
    if (addressList !== undefined) {
      const al = sanitizeInput(addressList);
      if (al && al !== 'none') params.push(`=address-list=${al}`);
      else if (existingRawProfile?.['address-list']) params.push(`=address-list=`);
    }

    await executeProfileMutation(client, '/ip/hotspot/user/profile/set', params, HOTSPOT_OPTIONAL_FALLBACK_KEYS);

    // Propagate profile name update to users & kick active sessions using bounded concurrency
    try {
      if (oldProfileName && newProfileName && oldProfileName !== newProfileName) {
        const usersToRename = await client.querySafe('/ip/hotspot/user/print', [`?profile=${oldProfileName}`, '=.proplist=.id'], { rapid: true });
        if (Array.isArray(usersToRename) && usersToRename.length > 0) {
          for (let i = 0; i < usersToRename.length; i += 3) {
            const chunk = usersToRename.slice(i, i + 3);
            await Promise.allSettled(
              chunk.map((u: any) =>
                u['.id']
                  ? client.query('/ip/hotspot/user/set', [`=.id=${u['.id']}`, `=profile=${newProfileName}`], { rapid: true })
                  : Promise.resolve()
              )
            );
          }
        }
      }

      const targetProfile = newProfileName || oldProfileName;
      if (targetProfile) {
        const activeSessions = await client.querySafe('/ip/hotspot/active/print', [`?profile=${targetProfile}`, '=.proplist=.id'], { rapid: true });
        if (Array.isArray(activeSessions) && activeSessions.length > 0) {
          for (let i = 0; i < activeSessions.length; i += 3) {
            const chunk = activeSessions.slice(i, i + 3);
            await Promise.allSettled(
              chunk.map((act: any) =>
                act['.id']
                  ? client.query('/ip/hotspot/active/remove', [`=.id=${act['.id']}`], { rapid: true })
                  : Promise.resolve()
              )
            );
          }
        }
      }
    } catch (propagationErr) {
      console.error("Non-blocking profile propagation error:", propagationErr);
    }

    const routerHost = client.getConfig ? client.getConfig()?.host : undefined;
    try {
      const daysMatch = validityStr.match(/(\d+)\s*d/i);
      if (oldProfileName && newProfileName && oldProfileName !== newProfileName) {
        voucherDb.deleteProfileMetadata("hotspot", oldProfileName, routerHost);
      }
      voucherDb.saveProfileMetadata(
        "hotspot",
        newProfileName,
        {
          price: priceVal,
          validity: validityStr,
          validityDays: daysMatch ? parseInt(daysMatch[1], 10) : 0,
          dataQuotaMb: quotaVal,
          startsAt: effStartsAt,
          sharedUsers: effectiveSu
        },
        routerHost
      );
    } catch {}

    invalidateCache("/ip/hotspot");
    recordAudit(req, "update_hotspot_profile", "hotspot_profiles", "success", { resourceId: newProfileName });
    res.json({ success: true, message: `تم تحديث بروفايل الهوتسبوت (${newProfileName}) وتطبيقه مباشرة على المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/hotspot/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const bodyName = sanitizeInput(req.body?.profileName || "");
    const bodyId = sanitizeInput(req.body?.id || "");
    const lookupKey = bodyId || rawId || bodyName;

    if (isProtectedDefaultProfileName(rawId) || isProtectedDefaultProfileName(bodyName)) {
      return res.status(400).json({ success: false, message: "لا يمكن حذف البروفايل الافتراضي (default)" });
    }

    const allProfs = await client.querySafe('/ip/hotspot/user/profile/print', undefined, { timeoutSeconds: 5, rapid: true });
    const candidates = [bodyId, rawId, bodyName].filter(Boolean);
    const found = Array.isArray(allProfs)
      ? allProfs.find((p: any) =>
          candidates.some(c =>
            p['.id'] === c ||
            p.id === c ||
            p.name === c ||
            (p.name && p.name.toLowerCase() === c.toLowerCase())
          )
        )
      : null;

    if (found && isProtectedDefaultProfileName(found.name)) {
      return res.status(400).json({ success: false, message: "لا يمكن حذف البروفايل الافتراضي (default)" });
    }

    const resolvedId = found?.['.id'] || (await resolveHotspotProfileId(client, lookupKey));
    const displayName = found?.name || bodyName || rawId;
    if (!resolvedId || !resolvedId.startsWith('*')) {
      return res.status(404).json({ success: false, message: `تعذر العثور على البروفايل (${displayName}) في الراوتر` });
    }
    await client.query('/ip/hotspot/user/profile/remove', [`=.id=${resolvedId}`], { priority: true });
    try {
      const routerHost = client.getConfig ? client.getConfig()?.host : undefined;
      voucherDb.deleteProfileMetadata("hotspot", displayName, routerHost);
    } catch {}
    invalidateCache("/ip/hotspot");
    recordAudit(req, "delete_hotspot_profile", "hotspot_profiles", "success", { resourceId: displayName });
    res.json({ success: true, message: `تم حذف بروفايل الهوتسبوت (${displayName}) من المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================
// PPP / PPPoE SECRETS & PROFILES CRUD
// ==========================================
router.post("/api/mikrotik/ppp/secrets", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const name = sanitizeInput(req.body.name);
    const password = sanitizeInput(req.body.password);
    const profile = sanitizeInput(req.body.profile);
    const service = sanitizeInput(req.body.service);
    const comment = sanitizeInput(req.body.comment);
    const localAddress = sanitizeInput(req.body.localAddress);
    const remoteAddress = sanitizeInput(req.body.remoteAddress);

    if (!name) return res.status(400).json({ success: false, message: "اسم المستخدم مطلوب" });

    const params = [
      `=name=${name}`,
      `=password=${password}`,
      `=profile=${profile || "default"}`,
      `=service=${service || "any"}`
    ];
    if (comment) params.push(`=comment=${comment}`);
    if (localAddress) params.push(`=local-address=${localAddress}`);
    if (remoteAddress) params.push(`=remote-address=${remoteAddress}`);
    if (req.body.disabled !== undefined) {
      params.push(`=disabled=${req.body.disabled === true || req.body.disabled === 'yes' ? 'yes' : 'no'}`);
    }

    await client.query('/ppp/secret/add', params);
    invalidateCache("/ppp");
    res.json({ success: true, message: `تم إضافة حساب PPPoE للمشترك ${name} بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/ppp/secrets/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    let targetId = rawId;
    let existingName = rawId.startsWith('*') ? '' : rawId;
    if (!targetId.startsWith('*')) {
      const found = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name', `?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        targetId = found[0]['.id'];
        existingName = found[0].name || existingName;
      }
    } else {
      const found = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name', `?.id=${targetId}`]);
      if (Array.isArray(found) && found[0]?.name) {
        existingName = found[0].name;
      }
    }
    const { name, password, profile, service, comment, disabled, localAddress, remoteAddress } = req.body;
    const params = [`=.id=${targetId}`];
    if (name) params.push(`=name=${sanitizeInput(name)}`);
    if (password !== undefined) params.push(`=password=${sanitizeInput(password)}`);
    if (profile) params.push(`=profile=${sanitizeInput(profile)}`);
    if (service) params.push(`=service=${sanitizeInput(service)}`);
    if (comment !== undefined) params.push(`=comment=${sanitizeInput(comment)}`);
    if (disabled !== undefined) params.push(`=disabled=${disabled === true || disabled === 'yes' ? 'yes' : 'no'}`);
    if (localAddress !== undefined) params.push(`=local-address=${sanitizeInput(localAddress)}`);
    if (remoteAddress !== undefined) params.push(`=remote-address=${sanitizeInput(remoteAddress)}`);

    await client.query('/ppp/secret/set', params);

    // إذا تم تعطيل حساب PPPoE نقوم فوراً بقطع الاتصال النشط له
    if (disabled === true || disabled === 'yes') {
      try {
        const namesToKick = Array.from(new Set([existingName, name ? sanitizeInput(name) : ''].filter(Boolean)));
        for (const secretName of namesToKick) {
          const activeList = await client.querySafe('/ppp/active/print', [`?name=${secretName}`]);
          if (Array.isArray(activeList)) {
            for (const act of activeList) {
              await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
            }
          }
        }
        invalidateCache("/ppp/active");
      } catch {}
    }

    invalidateCache("/ppp");
    res.json({ success: true, message: "تم تحديث بيانات حساب PPPoE وتأكيدها على المايكروتك بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/ppp/secrets/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    let targetId = rawId;
    let foundSecretName = rawId.startsWith('*') ? '' : rawId;
    if (!targetId.startsWith('*')) {
      const found = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name', `?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        targetId = found[0]['.id'];
        if (found[0].name) foundSecretName = found[0].name;
      }
    } else {
      const found = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name', `?.id=${targetId}`]);
      if (Array.isArray(found) && found[0]?.name) {
        foundSecretName = found[0].name;
      }
    }
    try {
      await client.query('/ppp/secret/remove', [`=.id=${targetId}`]);
    } catch (err: any) {
      const found = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name', `?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        if (found[0].name) foundSecretName = found[0].name;
        await client.query('/ppp/secret/remove', [`=.id=${found[0]['.id']}`]);
      } else {
        throw err;
      }
    }

    // فصل أي جلسة PPP نشطة للمستخدم المحذوف فوراً
    if (foundSecretName) {
      try {
        const activeList = await client.querySafe('/ppp/active/print', [`?name=${foundSecretName}`]);
        if (Array.isArray(activeList)) {
          for (const act of activeList) {
            await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
          }
        }
        invalidateCache("/ppp/active");
      } catch {}
    }

    invalidateCache("/ppp");
    res.json({ success: true, message: "تم حذف حساب PPPoE وفصل أي اتصال نشط له بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Bulk/Batch Delete PPPoE Secrets
router.post("/api/mikrotik/ppp/secrets/batch-delete", async (req: Request, res: Response) => {
  req.setTimeout(180000);
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المعرفات مطلوبة" });
    }

    let successCount = 0;
    const sanitizedIds = ids.map((id: any) => sanitizeInput(String(id))).filter(Boolean);
    const pppSecrets = await client.querySafe('/ppp/secret/print', ['=.proplist=.id,name'], { rapid: true });
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();
    if (Array.isArray(pppSecrets)) {
      for (const s of pppSecrets) {
        if (s['.id']) byId.set(s['.id'], s);
        if (s.name) byName.set(String(s.name).toLowerCase(), s);
      }
    }

    for (let i = 0; i < sanitizedIds.length; i += 30) {
      const chunk = sanitizedIds.slice(i, i + 30);
      for (const id of chunk) {
        try {
          const resolved = byId.get(id) || byName.get(id.toLowerCase());
          const targetId = resolved?.['.id'] || id;
          await client.query('/ppp/secret/remove', [`=.id=${targetId}`], { rapid: true });
          successCount++;
          const sName = resolved?.name || (!id.startsWith('*') ? id : '');
          if (sName) {
            const acts = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name', `?name=${sName}`], { rapid: true });
            if (Array.isArray(acts)) {
              for (const act of acts) {
                await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          }
        } catch {}
      }
      if (i + 30 < sanitizedIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }

    invalidateCache("/ppp");
    invalidateCache("/ppp/active");
    res.json({ success: true, message: `تم حذف ${successCount} حساب PPPoE بنجاح`, count: successCount });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/ppp/profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const bodyData = req.body.profileData || req.body || {};
    const {
      name, localAddress, remoteAddress, remoteIpv6PrefixPool, rateLimit, onlyOne, dnsServer, winsServer,
      useEncryption, useCompression, useIpv6, useMpls, sessionTimeout, idleTimeout,
      parentQueue, queueType, onUpScript, onDownScript, addressList, bridge, bridgeHorizon,
      price, validity, validityDays, dataQuotaMb, startsAt, sharedUsers
    } = bodyData;
    const sName = sanitizeInput(name);
    if (!sName) return res.status(400).json({ success: false, message: "اسم البروفايل مطلوب" });

    const su = Math.max(1, parseInt(String(sharedUsers), 10) || (onlyOne === 'no' ? 2 : 1));
    const effOnlyOne = (onlyOne && onlyOne !== 'default') ? sanitizeInput(onlyOne) : (su > 1 ? 'no' : 'yes');

    const params = [`=name=${sName}`];
    if (localAddress && localAddress !== 'none' && localAddress.trim() !== '') params.push(`=local-address=${sanitizeInput(localAddress)}`);
    if (remoteAddress && remoteAddress !== 'none' && remoteAddress.trim() !== '') params.push(`=remote-address=${sanitizeInput(remoteAddress)}`);
    if (remoteIpv6PrefixPool && remoteIpv6PrefixPool !== 'none' && remoteIpv6PrefixPool.trim() !== '') params.push(`=remote-ipv6-prefix-pool=${sanitizeInput(remoteIpv6PrefixPool)}`);
    const rl = normalizeRateLimitString(sanitizeInput(rateLimit));
    if (rl) params.push(`=rate-limit=${rl}`);
    params.push(`=only-one=${effOnlyOne}`);

    const cleanDns = cleanDnsOrIpList(dnsServer);
    if (cleanDns) params.push(`=dns-server=${cleanDns}`);
    const cleanWins = cleanDnsOrIpList(winsServer);
    if (cleanWins) params.push(`=wins-server=${cleanWins}`);

    if (useEncryption && useEncryption !== 'default') params.push(`=use-encryption=${sanitizeInput(useEncryption)}`);
    if (useCompression && useCompression !== 'default') params.push(`=use-compression=${sanitizeInput(useCompression)}`);
    if (useIpv6 && useIpv6 !== 'default') params.push(`=use-ipv6=${sanitizeInput(useIpv6)}`);
    if (useMpls && useMpls !== 'default') params.push(`=use-mpls=${sanitizeInput(useMpls)}`);

    const cleanSess = cleanMikrotikTimeout(sessionTimeout);
    if (cleanSess) params.push(`=session-timeout=${cleanSess}`);

    const cleanIdle = cleanMikrotikTimeout(idleTimeout);
    if (cleanIdle) params.push(`=idle-timeout=${cleanIdle}`);

    if (parentQueue && parentQueue !== 'none' && parentQueue !== 'default') params.push(`=parent-queue=${sanitizeInput(parentQueue)}`);
    if (queueType && queueType !== 'default' && queueType !== 'none') params.push(`=queue-type=${sanitizeInput(queueType)}`);

    let userScript = onUpScript || "";
    userScript = userScript
      .replace(/^# ZCtrl\|Price:[^\n]*\n?/gm, '')
      .replace(/:local userVal "\$user";\s*:local validityVal "[^"]+";[^\n]*/g, '')
      .replace(/:if\s*\(?\[\/system scheduler find name=\$userVal\][^\n]*/g, '')
      .trim();

    const priceVal = price !== undefined ? (Number(price) || 0) : 0;
    const quotaVal = dataQuotaMb !== undefined ? (Number(dataQuotaMb) || 0) : 0;
    let validityStr = (validity || (validityDays ? `${validityDays}d` : '')).trim();
    if (validityStr === '0' || validityStr === '0s' || validityStr.toLowerCase() === 'unlimited') validityStr = '';

    const effStartsAt = startsAt === 'at-creation' ? 'at-creation' : 'first-login';
    const metaHeader = `# ZCtrl|Price:${priceVal}|Validity:${validityStr || 'unlimited'}|DataQuotaMb:${quotaVal}|StartsAt:${effStartsAt}|SharedUsers:${su}`;
    const finalOnUp = userScript ? `${metaHeader}\n${userScript}`.trim() : metaHeader;
    if (finalOnUp) params.push(`=on-up=${finalOnUp}`);
    params.push(`=comment=${metaHeader}`);

    if (onDownScript && onDownScript.trim()) params.push(`=on-down=${onDownScript.trim()}`);
    if (addressList && addressList !== 'none' && addressList.trim() !== '') params.push(`=address-list=${sanitizeInput(addressList)}`);
    if (bridge && bridge !== 'none' && bridge !== 'default' && bridge.trim() !== '') {
      params.push(`=bridge=${sanitizeInput(bridge)}`);
      if (bridgeHorizon && bridgeHorizon !== 'none' && String(bridgeHorizon).trim() !== '') {
        params.push(`=bridge-horizon=${sanitizeInput(bridgeHorizon)}`);
      }
    }

    const { result: addRes } = await executeProfileMutation(
      client,
      '/ppp/profile/add',
      params,
      PPP_OPTIONAL_FALLBACK_KEYS
    );

    invalidateCache("/ppp");
    let createdId = addRes?.[0]?.ret || addRes?.[0]?.['.id'] || '';
    if (!createdId) {
      const lookup = await client.querySafe('/ppp/profile/print', [`?name=${sName}`], { timeoutSeconds: 3, rapid: true });
      if (Array.isArray(lookup) && lookup[0]?.['.id']) createdId = lookup[0]['.id'];
    }

    const createdProfile = {
      id: createdId || sName,
      name: sName,
      localAddress: localAddress && localAddress !== 'none' ? sanitizeInput(localAddress) : '',
      remoteAddress: remoteAddress && remoteAddress !== 'none' ? sanitizeInput(remoteAddress) : '',
      rateLimit: rl,
      onlyOne: effOnlyOne,
      sharedUsers: su,
      startsAt: effStartsAt,
      price: priceVal,
      validity: validityStr,
      dataQuotaMb: quotaVal,
      dnsServer: cleanDns,
      useEncryption: useEncryption || 'default'
    };
    const routerHost = client.getConfig ? client.getConfig()?.host : undefined;
    try {
      const daysMatch = validityStr.match(/(\d+)\s*d/i);
      voucherDb.saveProfileMetadata(
        "ppp",
        sName,
        {
          price: priceVal,
          validity: validityStr,
          validityDays: daysMatch ? parseInt(daysMatch[1], 10) : 0,
          dataQuotaMb: quotaVal,
          startsAt: effStartsAt,
          sharedUsers: su
        },
        routerHost
      );
    } catch {}

    recordAudit(req, "create_ppp_profile", "ppp_profiles", "success", { resourceId: sName });
    res.json({ success: true, message: `تم إنشاء بروفايل PPPoE (${sName}) بنجاح مباشرة على المايكروتك`, profile: createdProfile });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/ppp/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const bodyData = req.body.profileData || req.body || {};

    const {
      name, localAddress, remoteAddress, remoteIpv6PrefixPool, changeRemoteAddress, rateLimit, onlyOne, dnsServer, winsServer,
      useEncryption, useCompression, useIpv6, useMpls, sessionTimeout, idleTimeout,
      parentQueue, queueType, onUpScript, onDownScript, addressList, bridge, bridgeHorizon,
      price, validity, validityDays, dataQuotaMb, startsAt, sharedUsers,
      oldName, id: bodyId
    } = bodyData;

    let resolvedId = (bodyId && String(bodyId).startsWith('*')) ? String(bodyId).trim() : '';
    let oldProfileName = sanitizeInput(oldName || "");
    let existingRawProfile: any = null;

    // Single lookup to get *.id, existing profile name, and existing metadata
    try {
      const profs = await client.querySafe('/ppp/profile/print', undefined, { timeoutSeconds: 5, rapid: true });
      if (Array.isArray(profs)) {
        const candidates = [resolvedId, rawId, oldName, name].filter(Boolean).map((v: any) => String(v).trim());
        const found = profs.find((p: any) =>
          candidates.some(c =>
            p['.id'] === c ||
            p.id === c ||
            p.name === c ||
            (p.name && p.name.toLowerCase() === c.toLowerCase())
          )
        );
        if (found) {
          existingRawProfile = found;
          oldProfileName = found.name || oldProfileName;
          if (found['.id']) {
            resolvedId = found['.id'];
          }
        }
      }
    } catch {}

    if (!resolvedId || !resolvedId.startsWith('*')) {
      return res.status(404).json({ success: false, message: `تعذر العثور على بروفايل PPPoE (${oldProfileName || rawId}) في الراوتر` });
    }

    const newProfileName = name ? sanitizeInput(name) : (oldProfileName || rawId);
    const params: string[] = [`=.id=${resolvedId}`];

    if (name && newProfileName && newProfileName !== oldProfileName) {
      params.push(`=name=${newProfileName}`);
    }
    if (localAddress !== undefined) {
      const la = sanitizeInput(localAddress);
      if (la && la !== 'none') params.push(`=local-address=${la}`);
      else if (existingRawProfile?.['local-address']) params.push(`=local-address=`);
    }

    // Strict IP Pool Protection: Never change remote address automatically unless manually modified!
    if (changeRemoteAddress === true) {
      const ra = sanitizeInput(remoteAddress);
      if (ra && ra !== 'none' && ra !== 'unchanged') params.push(`=remote-address=${ra}`);
      else if (existingRawProfile?.['remote-address']) params.push(`=remote-address=`);
    } else if (remoteAddress !== undefined && remoteAddress !== null && remoteAddress !== '' && remoteAddress !== 'none' && remoteAddress !== 'unchanged' && remoteAddress !== 'preserve') {
      const ra = sanitizeInput(remoteAddress);
      if (ra && ra !== (existingRawProfile?.['remote-address'] || '')) {
        params.push(`=remote-address=${ra}`);
      }
    }

    if (remoteIpv6PrefixPool !== undefined && remoteIpv6PrefixPool !== 'none') {
      const p6 = sanitizeInput(remoteIpv6PrefixPool);
      if (p6) params.push(`=remote-ipv6-prefix-pool=${p6}`);
    }

    if (rateLimit !== undefined) {
      const rl = normalizeRateLimitString(sanitizeInput(rateLimit));
      params.push(rl ? `=rate-limit=${rl}` : `=rate-limit=`);
    }

    const su = sharedUsers !== undefined ? Math.max(1, parseInt(String(sharedUsers), 10) || 1) : undefined;
    const effOnlyOne = onlyOne !== undefined ? onlyOne : (su !== undefined ? (su > 1 ? 'no' : 'yes') : undefined);
    if (effOnlyOne !== undefined) params.push(`=only-one=${sanitizeInput(effOnlyOne)}`);

    if (dnsServer !== undefined) {
      const ds = cleanDnsOrIpList(dnsServer);
      if (ds) params.push(`=dns-server=${ds}`);
      else if (existingRawProfile?.['dns-server']) params.push(`=dns-server=`);
    }
    if (winsServer !== undefined) {
      const ws = cleanDnsOrIpList(winsServer);
      if (ws) params.push(`=wins-server=${ws}`);
      else if (existingRawProfile?.['wins-server']) params.push(`=wins-server=`);
    }
    if (useEncryption !== undefined && useEncryption !== 'default') params.push(`=use-encryption=${sanitizeInput(useEncryption)}`);
    if (useCompression !== undefined && useCompression !== 'default') params.push(`=use-compression=${sanitizeInput(useCompression)}`);
    if (useIpv6 !== undefined && useIpv6 !== 'default') params.push(`=use-ipv6=${sanitizeInput(useIpv6)}`);
    if (useMpls !== undefined && useMpls !== 'default') params.push(`=use-mpls=${sanitizeInput(useMpls)}`);

    if (sessionTimeout !== undefined) {
      const t = cleanMikrotikTimeout(sessionTimeout);
      if (t) params.push(`=session-timeout=${t}`);
      else if (existingRawProfile?.['session-timeout'] && existingRawProfile['session-timeout'] !== '0s') params.push(`=session-timeout=0s`);
    }
    if (idleTimeout !== undefined) {
      const t = cleanMikrotikTimeout(idleTimeout);
      if (t) params.push(`=idle-timeout=${t}`);
      else if (existingRawProfile?.['idle-timeout'] && existingRawProfile['idle-timeout'] !== '0s') params.push(`=idle-timeout=0s`);
    }
    if (parentQueue !== undefined) {
      const pq = sanitizeInput(parentQueue);
      if (pq && pq !== 'none' && pq !== 'default') params.push(`=parent-queue=${pq}`);
      else if (existingRawProfile?.['parent-queue'] && existingRawProfile['parent-queue'] !== 'none') params.push(`=parent-queue=none`);
    }
    if (queueType !== undefined) {
      const qt = sanitizeInput(queueType);
      if (qt && qt !== 'none' && qt !== 'default') params.push(`=queue-type=${qt}`);
      else if (existingRawProfile?.['queue-type'] && existingRawProfile['queue-type'] !== 'default') params.push(`=queue-type=default`);
    }

    const existingNorm = existingRawProfile ? normalizePPPProfile(existingRawProfile) : null;

    let userScript = onUpScript !== undefined ? onUpScript : (existingNorm?.onUpScript || "");
    userScript = userScript
      .replace(/^# ZCtrl\|Price:[^\n]*\n?/gm, '')
      .replace(/:local userVal "\$user";\s*:local validityVal "[^"]+";[^\n]*/g, '')
      .replace(/:if\s*\(?\[\/system scheduler find name=\$userVal\][^\n]*/g, '')
      .trim();

    const priceVal = price !== undefined ? (Number(price) || 0) : (existingNorm?.price ?? 0);
    const quotaVal = dataQuotaMb !== undefined ? (Number(dataQuotaMb) || 0) : (existingNorm?.dataQuotaMb ?? 0);
    let validityStr = validity !== undefined
      ? String(validity || '').trim()
      : validityDays !== undefined
      ? (Number(validityDays) > 0 ? `${validityDays}d` : '')
      : (existingNorm?.validity || '');
    if (validityStr === '0' || validityStr === '0s' || validityStr.toLowerCase() === 'unlimited') validityStr = '';

    const effStartsAt = startsAt !== undefined
      ? (startsAt === 'at-creation' ? 'at-creation' : 'first-login')
      : (existingNorm?.startsAt || 'first-login');
    const effectiveSu = su !== undefined ? su : (existingNorm?.sharedUsers ?? (effOnlyOne === 'no' ? 2 : 1));
    const metaHeader = `# ZCtrl|Price:${priceVal}|Validity:${validityStr || 'unlimited'}|DataQuotaMb:${quotaVal}|StartsAt:${effStartsAt}|SharedUsers:${effectiveSu}`;
    const finalOnUp = userScript ? `${metaHeader}\n${userScript}`.trim() : metaHeader;
    params.push(`=on-up=${finalOnUp}`);
    params.push(`=comment=${metaHeader}`);

    if (onDownScript !== undefined) params.push(`=on-down=${onDownScript.trim()}`);
    if (addressList !== undefined) {
      const al = sanitizeInput(addressList);
      if (al && al !== 'none') params.push(`=address-list=${al}`);
      else if (existingRawProfile?.['address-list']) params.push(`=address-list=`);
    }
    if (bridge !== undefined) {
      const br = sanitizeInput(bridge);
      if (br && br !== 'none' && br !== 'default') {
        params.push(`=bridge=${br}`);
        if (bridgeHorizon !== undefined) {
          const bh = sanitizeInput(bridgeHorizon);
          if (bh && bh !== 'none') params.push(`=bridge-horizon=${bh}`);
        }
      } else if (existingRawProfile?.bridge && existingRawProfile.bridge !== 'none') {
        params.push(`=bridge=none`);
      }
    }

    await executeProfileMutation(client, '/ppp/profile/set', params, PPP_OPTIONAL_FALLBACK_KEYS);

    // Propagate profile name update to secrets & kick active sessions using bounded concurrency
    try {
      if (oldProfileName && newProfileName && oldProfileName !== newProfileName) {
        const secretsToRename = await client.querySafe('/ppp/secret/print', [`?profile=${oldProfileName}`, '=.proplist=.id'], { rapid: true });
        if (Array.isArray(secretsToRename) && secretsToRename.length > 0) {
          for (let i = 0; i < secretsToRename.length; i += 3) {
            const chunk = secretsToRename.slice(i, i + 3);
            await Promise.allSettled(
              chunk.map((s: any) =>
                s['.id']
                  ? client.query('/ppp/secret/set', [`=.id=${s['.id']}`, `=profile=${newProfileName}`], { rapid: true })
                  : Promise.resolve()
              )
            );
          }
        }
      }

      const targetProfile = newProfileName || oldProfileName;
      if (targetProfile) {
        const activeSessions = await client.querySafe('/ppp/active/print', [`?profile=${targetProfile}`, '=.proplist=.id'], { rapid: true });
        if (Array.isArray(activeSessions) && activeSessions.length > 0) {
          for (let i = 0; i < activeSessions.length; i += 3) {
            const chunk = activeSessions.slice(i, i + 3);
            await Promise.allSettled(
              chunk.map((act: any) =>
                act['.id']
                  ? client.query('/ppp/active/remove', [`=.id=${act['.id']}`], { rapid: true })
                  : Promise.resolve()
              )
            );
          }
        }
      }
    } catch (err) {
      console.error("Non-blocking PPP profile propagation error:", err);
    }

    const routerHost = client.getConfig ? client.getConfig()?.host : undefined;
    try {
      const daysMatch = validityStr.match(/(\d+)\s*d/i);
      if (oldProfileName && newProfileName && oldProfileName !== newProfileName) {
        voucherDb.deleteProfileMetadata("ppp", oldProfileName, routerHost);
      }
      voucherDb.saveProfileMetadata(
        "ppp",
        newProfileName,
        {
          price: priceVal,
          validity: validityStr,
          validityDays: daysMatch ? parseInt(daysMatch[1], 10) : 0,
          dataQuotaMb: quotaVal,
          startsAt: effStartsAt,
          sharedUsers: effectiveSu
        },
        routerHost
      );
    } catch {}

    invalidateCache("/ppp");
    recordAudit(req, "update_ppp_profile", "ppp_profiles", "success", { resourceId: newProfileName });
    res.json({ success: true, message: `تم تحديث بروفايل PPPoE (${newProfileName}) وتطبيقه مباشرة على المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/ppp/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const bodyName = sanitizeInput(req.body?.profileName || "");
    const bodyId = sanitizeInput(req.body?.id || "");
    const lookupKey = bodyId || rawId || bodyName;

    if (isProtectedDefaultProfileName(rawId) || isProtectedDefaultProfileName(bodyName)) {
      return res.status(400).json({ success: false, message: `لا يمكن حذف البروفايل الافتراضي (${bodyName || rawId})` });
    }

    const profs = await client.querySafe('/ppp/profile/print', undefined, { timeoutSeconds: 5, rapid: true });
    const candidates = [bodyId, rawId, bodyName].filter(Boolean);
    const found = Array.isArray(profs)
      ? profs.find((p: any) =>
          candidates.some(c =>
            p['.id'] === c ||
            p.id === c ||
            p.name === c ||
            (p.name && p.name.toLowerCase() === c.toLowerCase())
          )
        )
      : null;

    if (found && isProtectedDefaultProfileName(found.name)) {
      return res.status(400).json({ success: false, message: `لا يمكن حذف البروفايل الافتراضي (${found.name})` });
    }

    const resolvedId = found?.['.id'] || (await resolvePPPProfileId(client, lookupKey));
    const displayName = found?.name || bodyName || rawId;
    if (!resolvedId || !resolvedId.startsWith('*')) {
      return res.status(404).json({ success: false, message: `تعذر العثور على بروفايل PPPoE (${displayName}) في الراوتر` });
    }
    await client.query('/ppp/profile/remove', [`=.id=${resolvedId}`], { priority: true });
    try {
      const routerHost = client.getConfig ? client.getConfig()?.host : undefined;
      voucherDb.deleteProfileMetadata("ppp", displayName, routerHost);
    } catch {}
    invalidateCache("/ppp");
    recordAudit(req, "delete_ppp_profile", "ppp_profiles", "success", { resourceId: displayName });
    res.json({ success: true, message: `تم حذف بروفايل PPPoE (${displayName}) من المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/ppp/active/disconnect", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.body.id || '');
    const rawName = sanitizeInput(req.body.name || req.body.user || '');
    let removed = false;

    if (rawId && rawId.startsWith('*')) {
      try {
        await client.query('/ppp/active/remove', [`=.id=${rawId}`]);
        removed = true;
      } catch {}
    }

    const nameToFind = rawName || (rawId && !rawId.startsWith('*') ? rawId : '');
    if (!removed && nameToFind) {
      const found = await client.querySafe('/ppp/active/print', [`?name=${nameToFind}`]);
      if (Array.isArray(found) && found.length > 0) {
        for (const act of found) {
          try {
            await client.query('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
            removed = true;
          } catch {}
        }
      }
    } else if (!removed && rawId) {
      try {
        await client.query('/ppp/active/remove', [`=.id=${rawId}`]);
        removed = true;
      } catch {}
    }

    if (!removed) {
      return res.status(404).json({ success: false, message: "جلسة PPPoE غير موجودة أو تم فصلها مسبقاً" });
    }

    invalidateCache("/ppp");
    invalidateCache("/ppp/active");
    res.json({ success: true, message: "تم فصل جلسة PPPoE بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================
// USER MANAGER USERS & PROFILES CRUD
// ==========================================
router.post("/api/mikrotik/userman/users", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const name = sanitizeInput(req.body.name);
    const password = sanitizeInput(req.body.password);
    const customer = sanitizeInput(req.body.customer) || "admin";
    const profile = sanitizeInput(req.body.profile || '');
    const comment = sanitizeInput(req.body.comment);

    if (!name) return res.status(400).json({ success: false, message: "اسم المستخدم مطلوب" });

    const umPrefix = getUserManPrefix(client);
    const isV6 = client.isV6 ? client.isV6() : false;
    const userParam = isV6 ? `=username=${name}` : `=name=${name}`;
    const params = [
      userParam,
      `=password=${password}`
    ];
    if (isV6) {
      params.push(`=customer=${customer || "admin"}`);
    } else {
      params.push(`=group=${profile || "default"}`);
    }
    if (comment) params.push(`=comment=${comment}`);
    if (req.body.disabled !== undefined) {
      params.push(`=disabled=${req.body.disabled === true || req.body.disabled === 'yes' ? 'yes' : 'no'}`);
    }

    const umPath = `${umPrefix}/user/add`;
    await client.query(umPath, params);

    if (profile && profile !== 'default') {
      if (isV6) {
        await client.querySafe(`${umPrefix}/user/create-and-activate-profile`, [
          `=username=${name}`,
          `=profile=${profile}`,
          `=customer=${customer || "admin"}`
        ]);
      } else {
        await client.querySafe(`${umPrefix}/user-profile/add`, [
          `=user=${name}`,
          `=profile=${profile}`
        ]);
      }
    }

    invalidateCache("user-manager");
    clearCachedUsermanResult();
    res.json({ success: true, message: `تم إضافة مستخدم اليوزر مانجر ${name} بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/userman/users/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const umPrefix = getUserManPrefix(client);
    const isV6 = client.isV6 ? client.isV6() : false;
    let targetId = rawId;
    let existingName = rawId.startsWith('*') ? '' : rawId;
    let existingCustomer = 'admin';

    const lookupQuery = !targetId.startsWith('*')
      ? (isV6 ? [`?username=${rawId}`] : [`?name=${rawId}`])
      : [`?.id=${targetId}`];
    const found = await client.querySafe(`${umPrefix}/user/print`, lookupQuery);
    if (Array.isArray(found) && found[0]) {
      if (found[0]['.id']) targetId = found[0]['.id'];
      existingName = found[0].username || found[0].name || existingName;
      existingCustomer = found[0].customer || existingCustomer;
    }

    const { name, password, profile, customer, comment, disabled, resetCounters } = req.body;
    const cleanName = name !== undefined ? sanitizeInput(name) : undefined;
    const cleanCustomer = customer !== undefined ? sanitizeInput(customer) : existingCustomer;
    const params = [`=.id=${targetId}`];
    if (cleanName) params.push(isV6 ? `=username=${cleanName}` : `=name=${cleanName}`);
    if (password !== undefined) params.push(`=password=${sanitizeInput(password)}`);
    if (isV6 && customer !== undefined && cleanCustomer) params.push(`=customer=${cleanCustomer}`);
    if (comment !== undefined) params.push(`=comment=${sanitizeInput(comment)}`);
    if (disabled !== undefined) params.push(`=disabled=${disabled === true || disabled === 'yes' ? 'yes' : 'no'}`);
    if (!isV6 && profile) params.push(`=group=${sanitizeInput(profile)}`);

    if (params.length > 1) {
      await client.query(`${umPrefix}/user/set`, params);
    }

    const effectiveUsername = cleanName || existingName || rawId;
    if (profile) {
      const cleanProfile = sanitizeInput(profile);
      if (isV6) {
        await client.querySafe(`${umPrefix}/user/create-and-activate-profile`, [
          `=username=${effectiveUsername}`,
          `=profile=${cleanProfile}`,
          `=customer=${cleanCustomer || "admin"}`
        ]);
      } else {
        await client.querySafe(`${umPrefix}/user-profile/add`, [
          `=user=${effectiveUsername}`,
          `=profile=${cleanProfile}`
        ]);
      }
    }

    if (resetCounters && isV6) {
      try {
        await client.query(`${umPrefix}/user/reset-counters`, [`=.id=${targetId}`]);
      } catch {}
    }

    if (disabled === true || disabled === 'yes' || resetCounters) {
      const namesToKick = Array.from(new Set([existingName, effectiveUsername].filter(Boolean)));
      for (const uName of namesToKick) {
        try {
          const hsAct = await client.querySafe('/ip/hotspot/active/print', [`?user=${uName}`]);
          if (Array.isArray(hsAct)) {
            for (const act of hsAct) await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
          }
          const pppAct = await client.querySafe('/ppp/active/print', [`?name=${uName}`]);
          if (Array.isArray(pppAct)) {
            for (const act of pppAct) await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
          }
          const sessionPath = `${umPrefix}/${isV6 ? 'active' : 'session'}`;
          const umSessions = await client.querySafe(`${sessionPath}/print`, [`?user=${uName}`]);
          if (Array.isArray(umSessions)) {
            for (const sess of umSessions) await client.querySafe(`${sessionPath}/remove`, [`=.id=${sess['.id'] || sess.id}`]);
          }
        } catch {}
      }
      invalidateCache("/ip/hotspot/active");
      invalidateCache("/ppp/active");
    }

    invalidateCache("user-manager");
    clearCachedUsermanResult();
    res.json({ success: true, message: "تم تحديث مشترك اليوزر مانجر وتأكيده على المايكروتك بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/userman/users/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const umPrefix = getUserManPrefix(client);
    const isV6 = client.isV6 ? client.isV6() : false;
    let targetId = rawId;
    let found: any = null;
    if (!targetId.startsWith('*')) {
      found = await client.querySafe(`${umPrefix}/user/print`, isV6 ? [`?username=${rawId}`] : [`?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        targetId = found[0]['.id'];
      }
    } else {
      found = await client.querySafe(`${umPrefix}/user/print`, [`?.id=${targetId}`]);
    }
    const umPath = `${umPrefix}/user/remove`;
    try {
      await client.query(umPath, [`=.id=${targetId}`]);
    } catch (err: any) {
      found = await client.querySafe(`${umPrefix}/user/print`, isV6 ? [`?username=${rawId}`] : [`?name=${rawId}`]);
      if (Array.isArray(found) && found[0]?.['.id']) {
        await client.query(umPath, [`=.id=${found[0]['.id']}`]);
      } else {
        throw err;
      }
    }

    // فصل أي جلسة نشطة فوراً للمستخدم المحذوف (Hotspot / PPP / UserMan)
    try {
      const uName = (Array.isArray(found) && (found[0]?.username || found[0]?.name)) ? (found[0].username || found[0].name) : (!rawId.startsWith('*') ? rawId : '');
      if (uName) {
        const sessionPath = `${umPrefix}/${isV6 ? 'active' : 'session'}`;
        const activeList = await client.querySafe(`${sessionPath}/print`, [`?user=${uName}`]);
        if (Array.isArray(activeList)) {
          for (const act of activeList) {
            await client.querySafe(`${sessionPath}/remove`, [`=.id=${act['.id'] || act.id}`]);
          }
        }
        const hsAct = await client.querySafe('/ip/hotspot/active/print', [`?user=${uName}`]);
        if (Array.isArray(hsAct)) {
          for (const act of hsAct) await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
        }
        const pppAct = await client.querySafe('/ppp/active/print', [`?name=${uName}`]);
        if (Array.isArray(pppAct)) {
          for (const act of pppAct) await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
        }
      }
    } catch {}

    invalidateCache("user-manager");
    invalidateCache("/ip/hotspot/active");
    invalidateCache("/ppp/active");
    clearCachedUsermanResult();
    res.json({ success: true, message: "تم حذف المشترك من اليوزر مانجر وفصل أي اتصال نشط له بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Bulk/Batch Delete User Manager Users
router.post("/api/mikrotik/userman/users/batch-delete", async (req: Request, res: Response) => {
  req.setTimeout(180000);
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "قائمة المعرفات مطلوبة" });
    }

    let successCount = 0;
    const sanitizedIds = ids.map(id => sanitizeInput(id)).filter(Boolean);
    const umPrefix = getUserManPrefix(client);
    const umPath = `${umPrefix}/user/remove`;
    const isV6 = client.isV6 ? client.isV6() : false;
    const umUsers = await client.querySafe(`${umPrefix}/user/print`, ['=.proplist=.id,name,username'], { rapid: true });
    const byId = new Map<string, any>();
    const byName = new Map<string, any>();
    if (Array.isArray(umUsers)) {
      for (const u of umUsers) {
        if (u['.id']) byId.set(u['.id'], u);
        const uName = u.username || u.name;
        if (uName) byName.set(String(uName).toLowerCase(), u);
      }
    }

    for (let i = 0; i < sanitizedIds.length; i += 30) {
      const chunk = sanitizedIds.slice(i, i + 30);
      for (const id of chunk) {
        try {
          const resolved = byId.get(id) || byName.get(id.toLowerCase());
          const targetId = resolved?.['.id'] || id;
          await client.query(umPath, [`=.id=${targetId}`], { rapid: true });
          successCount++;
          const uName = resolved?.username || resolved?.name || (!id.startsWith('*') ? id : '');
          if (uName) {
            const sessionPath = `${umPrefix}/${isV6 ? 'active' : 'session'}`;
            const acts = await client.querySafe(`${sessionPath}/print`, [`?user=${uName}`], { rapid: true });
            if (Array.isArray(acts)) {
              for (const act of acts) await client.querySafe(`${sessionPath}/remove`, [`=.id=${act['.id'] || act.id}`]);
            }
            const hsAct = await client.querySafe('/ip/hotspot/active/print', [`?user=${uName}`], { rapid: true });
            if (Array.isArray(hsAct)) {
              for (const act of hsAct) await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
            }
            const pppAct = await client.querySafe('/ppp/active/print', [`?name=${uName}`], { rapid: true });
            if (Array.isArray(pppAct)) {
              for (const act of pppAct) await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
            }
          }
        } catch {
          // Continue
        }
      }
      if (i + 30 < sanitizedIds.length) {
        await new Promise(resolve => setTimeout(resolve, 2));
      }
    }

    invalidateCache("user-manager");
    invalidateCache("/ip/hotspot/active");
    invalidateCache("/ppp/active");
    clearCachedUsermanResult();
    res.json({ success: true, message: `تم حذف ${successCount} مشترك من اليوزر مانجر بنجاح`, count: successCount });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/userman/profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  let createdProfileName: string | null = null;
  let createdLimId: string | null = null;
  const isV6 = client.isV6 ? client.isV6() : false;
  const um = getUsermanEndpoints(isV6);
  try {
    const bodyData = req.body.profileData || req.body || {};
    const {
      name, nameForUsers, validity, price, owner, startsAt, overrideSharedUsers,
      limitationName, rateLimit, rateLimitMin, transferLimitMb, downloadLimitMb,
      uploadLimitMb, uptimeLimit, fromTime, tillTime, weekdays
    } = bodyData;
    const sName = sanitizeInput(name);
    if (!sName) return res.status(400).json({ success: false, message: "اسم البروفايل مطلوب" });

    const su = Math.max(1, parseInt(String(overrideSharedUsers), 10) || 1);
    const priceVal = price !== undefined ? (Number(price) || 0) : 0;
    const limName = sanitizeInput(limitationName) || `Lim-${sName}`;

    // 1. Create or update User Manager Limitation in RouterOS (exact v6 vs v7 path + numeric bps rates)
    const limBaseParams: string[] = [];
    if (isV6 && owner) limBaseParams.push(`=owner=${sanitizeInput(owner)}`);
    if (rateLimit !== undefined && String(rateLimit).trim() !== '') {
      const baseRate = normalizeRateLimitString(rateLimit).split(/\s+/)[0] || '';
      const parts = baseRate.split('/');
      const rxBps = parseRateToBpsString(parts[0]);
      const txBps = parseRateToBpsString(parts[1] ?? parts[0]);
      if (rxBps && rxBps !== '0') limBaseParams.push(`=rate-limit-rx=${rxBps}`);
      if (txBps && txBps !== '0') limBaseParams.push(`=rate-limit-tx=${txBps}`);
    }
    if (rateLimitMin !== undefined && String(rateLimitMin).trim() !== '') {
      const baseMinRate = normalizeRateLimitString(rateLimitMin).split(/\s+/)[0] || '';
      const parts = baseMinRate.split('/');
      const minRxBps = parseRateToBpsString(parts[0]);
      const minTxBps = parseRateToBpsString(parts[1] ?? parts[0]);
      if (minRxBps && minRxBps !== '0') limBaseParams.push(`=rate-limit-min-rx=${minRxBps}`);
      if (minTxBps && minTxBps !== '0') limBaseParams.push(`=rate-limit-min-tx=${minTxBps}`);
    }
    const tMb = parseInt(String(transferLimitMb), 10);
    if (!isNaN(tMb) && tMb > 0) limBaseParams.push(`=transfer-limit=${tMb * 1024 * 1024}`);
    const dMb = parseInt(String(downloadLimitMb), 10);
    if (!isNaN(dMb) && dMb > 0) limBaseParams.push(`=download-limit=${dMb * 1024 * 1024}`);
    const uMb = parseInt(String(uploadLimitMb), 10);
    if (!isNaN(uMb) && uMb > 0) limBaseParams.push(`=upload-limit=${uMb * 1024 * 1024}`);
    const cleanUp = cleanMikrotikTimeout(uptimeLimit);
    if (cleanUp) limBaseParams.push(`=uptime-limit=${cleanUp}`);

    const existingLim = await client.querySafe(`${um.limitation}/print`, [`?name=${limName}`], { rapid: true });
    if (Array.isArray(existingLim) && existingLim.length > 0 && existingLim[0]['.id']) {
      if (limBaseParams.length > 0) {
        await executeProfileMutation(
          client,
          `${um.limitation}/set`,
          [`=.id=${existingLim[0]['.id']}`, ...limBaseParams],
          USERMAN_LIM_OPTIONAL_KEYS
        );
      }
    } else {
      const { result: limAddRes } = await executeProfileMutation(
        client,
        `${um.limitation}/add`,
        [`=name=${limName}`, ...limBaseParams],
        USERMAN_LIM_OPTIONAL_KEYS
      );
      createdLimId = limAddRes?.[0]?.ret || limAddRes?.[0]?.['.id'] || null;
    }

    // 2. Create User Manager Profile (strictly RouterOS v6 vs v7 compliant)
    const profParams = [`=name=${sName}`];
    if (nameForUsers && String(nameForUsers).trim()) {
      profParams.push(`=name-for-users=${sanitizeInput(nameForUsers)}`);
    }
    const cleanValidity = sanitizeInput(validity);
    if (cleanValidity && cleanValidity !== '0s' && cleanValidity !== '0' && cleanValidity.toLowerCase() !== 'none') {
      profParams.push(`=validity=${cleanValidity}`);
    }
    if (price !== undefined) profParams.push(`=price=${priceVal}`);

    if (isV6) {
      if (owner) profParams.push(`=owner=${sanitizeInput(owner)}`);
      const rosStartsAt = (startsAt === 'at-creation' || startsAt === 'now') ? 'create-and-activate' : 'logon';
      profParams.push(`=starts-at=${rosStartsAt}`);
      profParams.push(`=override-shared-users=${su}`);
    } else {
      // RouterOS v7: NO 'owner' and NO 'comment'; uses 'starts-when' & 'override-shared-users'
      const v7StartsWhen = (startsAt === 'at-creation' || startsAt === 'now') ? 'assigned' : 'first-auth';
      profParams.push(`=starts-when=${v7StartsWhen}`);
      if (su > 0) profParams.push(`=override-shared-users=${su}`);
    }

    const { result: addRes } = await executeProfileMutation(
      client,
      `${um.profile}/add`,
      profParams,
      USERMAN_PROF_OPTIONAL_KEYS
    );
    createdProfileName = sName;

    // 3. Link profile with limitation via profile-limitation
    const plParams = [
      `=profile=${sName}`,
      `=limitation=${limName}`
    ];
    if (fromTime && String(fromTime).trim()) plParams.push(`=from-time=${sanitizeInput(fromTime)}`);
    if (tillTime && String(tillTime).trim()) plParams.push(`=till-time=${sanitizeInput(tillTime)}`);
    if (weekdays && String(weekdays).trim()) plParams.push(`=weekdays=${sanitizeInput(weekdays)}`);
    await executeProfileMutation(
      client,
      `${um.profileLimitation}/add`,
      plParams,
      USERMAN_LINK_OPTIONAL_KEYS
    );

    invalidateCache("user-manager");
    clearCachedUsermanResult();
    const createdId = addRes?.[0]?.ret || addRes?.[0]?.['.id'] || sName;
    const createdProfile = {
      id: createdId,
      name: sName,
      nameForUsers: nameForUsers || sName,
      owner: owner || 'admin',
      price: priceVal,
      validity: cleanValidity || '',
      startsAt: startsAt || 'first-auth',
      overrideSharedUsers: su,
      rateLimit: rateLimit || '',
      rateLimitMin: rateLimitMin || '',
      limitationName: limName
    };
    recordAudit(req, "create_userman_profile", "userman_profiles", "success", { resourceId: sName });
    res.json({ success: true, message: `تم إضافة بروفايل وتحديد سرعات اليوزر مانجر (${sName}) مباشرة على المايكروتك بنجاح`, profile: createdProfile });
  } catch (e: any) {
    // Rollback orphan profile if linking step failed
    if (createdProfileName) {
      try {
        const orphan = await client.querySafe(`${um.profile}/print`, [`?name=${createdProfileName}`]);
        if (Array.isArray(orphan) && orphan[0]?.['.id']) {
          await client.querySafe(`${um.profile}/remove`, [`=.id=${orphan[0]['.id']}`]);
        }
      } catch {}
    }
    // Rollback newly created limitation if profile creation or linking failed
    if (createdLimId) {
      try {
        await client.querySafe(`${um.limitation}/remove`, [`=.id=${createdLimId}`]);
      } catch {}
    }
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/userman/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const bodyData = req.body.profileData || req.body || {};

    const {
      name, nameForUsers, validity, price, owner, startsAt, overrideSharedUsers,
      limitationName, rateLimit, rateLimitMin, transferLimitMb, downloadLimitMb,
      uploadLimitMb, uptimeLimit, fromTime, tillTime, weekdays,
      oldName, id: bodyId
    } = bodyData;

    const isV6 = client.isV6 ? client.isV6() : false;
    const um = getUsermanEndpoints(isV6);

    let resolvedId = (bodyId && String(bodyId).startsWith('*')) ? String(bodyId).trim() : '';
    let oldProfileName = sanitizeInput(oldName || "");
    let existingRawProfile: any = null;

    // Single lookup to get *.id, existing profile name, and existing metadata
    try {
      const profs = await client.querySafe(`${um.profile}/print`, undefined, { timeoutSeconds: 5, rapid: true });
      if (Array.isArray(profs)) {
        const candidates = [resolvedId, rawId, oldName, name].filter(Boolean).map((v: any) => String(v).trim());
        const found = profs.find((p: any) =>
          candidates.some(c =>
            p['.id'] === c ||
            p.id === c ||
            p.name === c ||
            (p.name && p.name.toLowerCase() === c.toLowerCase())
          )
        );
        if (found) {
          existingRawProfile = found;
          oldProfileName = found.name || oldProfileName;
          if (found['.id']) {
            resolvedId = found['.id'];
          }
        }
      }
    } catch {}

    if (!resolvedId || !resolvedId.startsWith('*')) {
      return res.status(404).json({ success: false, message: `تعذر العثور على بروفايل اليوزر مانجر (${oldProfileName || rawId}) في الراوتر` });
    }

    const newProfileName = name ? sanitizeInput(name) : (oldProfileName || rawId);
    const params: string[] = [`=.id=${resolvedId}`];

    if (name && newProfileName && newProfileName !== oldProfileName) params.push(`=name=${newProfileName}`);
    if (nameForUsers !== undefined) params.push(`=name-for-users=${sanitizeInput(nameForUsers)}`);
    if (validity !== undefined) {
      const cleanVal = sanitizeInput(validity);
      params.push((cleanVal && cleanVal !== '0s' && cleanVal !== '0' && cleanVal !== 'none') ? `=validity=${cleanVal}` : `=validity=unlimited`);
    }
    if (price !== undefined) params.push(`=price=${Number(price) || 0}`);

    const su = overrideSharedUsers !== undefined ? Math.max(1, parseInt(String(overrideSharedUsers), 10) || 1) : undefined;
    if (isV6) {
      if (owner !== undefined && owner !== 'none' && owner.trim() !== '') params.push(`=owner=${sanitizeInput(owner)}`);
      if (startsAt) {
        const rosStartsAt = (startsAt === 'at-creation' || startsAt === 'now') ? 'create-and-activate' : 'logon';
        params.push(`=starts-at=${rosStartsAt}`);
      }
      if (su !== undefined) params.push(`=override-shared-users=${su}`);
    } else {
      if (startsAt) {
        const v7StartsWhen = (startsAt === 'at-creation' || startsAt === 'now') ? 'assigned' : 'first-auth';
        params.push(`=starts-when=${v7StartsWhen}`);
      }
      if (su !== undefined) params.push(`=override-shared-users=${su}`);
    }

    await executeProfileMutation(client, `${um.profile}/set`, params, USERMAN_PROF_OPTIONAL_KEYS);

    // Update or create Limitation + update existing profile-limitation link & schedule
    const targetProfile = newProfileName || oldProfileName || rawId;
    const existingLinks = await client.querySafe(`${um.profileLimitation}/print`, [`?profile=${targetProfile}`], { rapid: true });
    const existingLinkedLimName = Array.isArray(existingLinks) && existingLinks[0]?.limitation
      ? String(existingLinks[0].limitation)
      : '';
    const limName = sanitizeInput(limitationName) || existingLinkedLimName || `Lim-${targetProfile}`;

    const limFields: string[] = [];
    if (isV6 && owner && owner !== 'none') limFields.push(`=owner=${sanitizeInput(owner)}`);
    if (rateLimit !== undefined) {
      const baseRate = normalizeRateLimitString(rateLimit).split(/\s+/)[0] || '';
      const parts = baseRate.split('/');
      limFields.push(`=rate-limit-rx=${parseRateToBpsString(parts[0]) || '0'}`);
      limFields.push(`=rate-limit-tx=${parseRateToBpsString(parts[1] ?? parts[0]) || '0'}`);
    }
    if (rateLimitMin !== undefined) {
      const baseMinRate = normalizeRateLimitString(rateLimitMin).split(/\s+/)[0] || '';
      const parts = baseMinRate.split('/');
      limFields.push(`=rate-limit-min-rx=${parseRateToBpsString(parts[0]) || '0'}`);
      limFields.push(`=rate-limit-min-tx=${parseRateToBpsString(parts[1] ?? parts[0]) || '0'}`);
    }
    if (transferLimitMb !== undefined) {
      const tMb = parseInt(String(transferLimitMb), 10);
      limFields.push(`=transfer-limit=${(!isNaN(tMb) && tMb > 0) ? tMb * 1024 * 1024 : 0}`);
    }
    if (downloadLimitMb !== undefined) {
      const dMb = parseInt(String(downloadLimitMb), 10);
      limFields.push(`=download-limit=${(!isNaN(dMb) && dMb > 0) ? dMb * 1024 * 1024 : 0}`);
    }
    if (uploadLimitMb !== undefined) {
      const uMb = parseInt(String(uploadLimitMb), 10);
      limFields.push(`=upload-limit=${(!isNaN(uMb) && uMb > 0) ? uMb * 1024 * 1024 : 0}`);
    }
    if (uptimeLimit !== undefined) {
      const cleanUp = cleanMikrotikTimeout(uptimeLimit);
      limFields.push(`=uptime-limit=${cleanUp || '0s'}`);
    }

    if (limFields.length > 0) {
      const existingLim = await client.querySafe(`${um.limitation}/print`, [`?name=${limName}`], { rapid: true });
      if (Array.isArray(existingLim) && existingLim.length > 0 && existingLim[0]['.id']) {
        await executeProfileMutation(
          client,
          `${um.limitation}/set`,
          [`=.id=${existingLim[0]['.id']}`, ...limFields],
          USERMAN_LIM_OPTIONAL_KEYS
        );
      } else {
        await executeProfileMutation(
          client,
          `${um.limitation}/add`,
          [`=name=${limName}`, ...limFields],
          USERMAN_LIM_OPTIONAL_KEYS
        );
      }
    }

    // Update existing profile-limitation link schedule/limitation or create link if missing
    if (Array.isArray(existingLinks) && existingLinks.length > 0 && existingLinks[0]['.id']) {
      const linkUpdateParams = [`=.id=${existingLinks[0]['.id']}`, `=limitation=${limName}`];
      if (fromTime) linkUpdateParams.push(`=from-time=${sanitizeInput(fromTime)}`);
      if (tillTime) linkUpdateParams.push(`=till-time=${sanitizeInput(tillTime)}`);
      if (weekdays) linkUpdateParams.push(`=weekdays=${sanitizeInput(weekdays)}`);
      await executeProfileMutation(client, `${um.profileLimitation}/set`, linkUpdateParams, USERMAN_LINK_OPTIONAL_KEYS);
    } else {
      const plParams = [`=profile=${targetProfile}`, `=limitation=${limName}`];
      if (fromTime) plParams.push(`=from-time=${sanitizeInput(fromTime)}`);
      if (tillTime) plParams.push(`=till-time=${sanitizeInput(tillTime)}`);
      if (weekdays) plParams.push(`=weekdays=${sanitizeInput(weekdays)}`);
      await executeProfileMutation(client, `${um.profileLimitation}/add`, plParams, USERMAN_LINK_OPTIONAL_KEYS);
    }

    invalidateCache("user-manager");
    clearCachedUsermanResult();
    recordAudit(req, "update_userman_profile", "userman_profiles", "success", { resourceId: newProfileName });
    res.json({ success: true, message: `تم تحديث بروفايل اليوزر مانجر (${newProfileName}) بنجاح وحفظ الإعدادات مباشرة على المايكروتك` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/userman/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.params.id);
    const bodyName = sanitizeInput(req.body?.profileName || "");
    const bodyId = sanitizeInput(req.body?.id || "");

    if (isProtectedDefaultProfileName(rawId) || isProtectedDefaultProfileName(bodyName)) {
      return res.status(400).json({ success: false, message: "لا يمكن حذف البروفايل الافتراضي (default)" });
    }
    const isV6 = client.isV6 ? client.isV6() : false;
    const um = getUsermanEndpoints(isV6);
    const profs = await client.querySafe(`${um.profile}/print`, undefined, { rapid: true });
    const candidates = [bodyId, rawId, bodyName].filter(Boolean);
    const found = Array.isArray(profs)
      ? profs.find((p: any) =>
          candidates.some(c =>
            p['.id'] === c ||
            p.id === c ||
            p.name === c ||
            (p.name && p.name.toLowerCase() === c.toLowerCase())
          )
        )
      : null;

    if (!found || !found['.id']) {
      return res.status(404).json({ success: false, message: `تعذر العثور على بروفايل اليوزر مانجر (${bodyName || rawId}) في الراوتر` });
    }
    const profileName = found.name || bodyName || rawId;
    if (isProtectedDefaultProfileName(profileName)) {
      return res.status(400).json({ success: false, message: "لا يمكن حذف البروفايل الافتراضي (default)" });
    }

    // 1. Remove associated profile-limitation links & track linked limitations
    const linkedLimNames = new Set<string>([`Lim-${profileName}`]);
    const links = await client.querySafe(`${um.profileLimitation}/print`, [`?profile=${profileName}`], { rapid: true });
    if (Array.isArray(links)) {
      for (const link of links) {
        if (link.limitation) linkedLimNames.add(String(link.limitation));
        if (link['.id']) {
          try {
            await client.query(`${um.profileLimitation}/remove`, [`=.id=${link['.id']}`], { priority: true });
          } catch {}
        }
      }
    }

    // 2. Remove profile itself
    await client.query(`${um.profile}/remove`, [`=.id=${found['.id']}`], { priority: true });

    // 3. Clean up orphaned limitations that are no longer referenced by any other profile
    for (const limName of linkedLimNames) {
      try {
        const otherLinks = await client.querySafe(`${um.profileLimitation}/print`, [`?limitation=${limName}`], { rapid: true });
        if (!Array.isArray(otherLinks) || otherLinks.length === 0) {
          const foundLim = await client.querySafe(`${um.limitation}/print`, [`?name=${limName}`], { rapid: true });
          if (Array.isArray(foundLim) && foundLim[0]?.['.id']) {
            await client.query(`${um.limitation}/remove`, [`=.id=${foundLim[0]['.id']}`], { priority: true });
          }
        }
      } catch {}
    }

    invalidateCache("user-manager");
    clearCachedUsermanResult();
    recordAudit(req, "delete_userman_profile", "userman_profiles", "success", { resourceId: profileName });
    res.json({ success: true, message: `تم حذف بروفايل اليوزر مانجر (${profileName}) وقيوده بنجاح من المايكروتك` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/userman/active/disconnect", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawId = sanitizeInput(req.body.id || '');
    const rawUser = sanitizeInput(req.body.user || req.body.name || '');
    const umPrefix = getUserManPrefix(client);
    const isV6 = client.isV6 ? client.isV6() : false;
    const sessionPath = `${umPrefix}/${isV6 ? 'active' : 'session'}`;
    let removed = false;

    const isSyntheticBridge = rawId.startsWith('hs-') || rawId.startsWith('ppp-');
    if (rawId && !isSyntheticBridge) {
      try {
        await client.query(`${sessionPath}/remove`, [`=.id=${rawId}`]);
        removed = true;
      } catch {}
    }

    if (rawUser) {
      try {
        const umSessions = await client.querySafe(`${sessionPath}/print`, [`?user=${rawUser}`]);
        if (Array.isArray(umSessions)) {
          for (const sess of umSessions) {
            try {
              await client.query(`${sessionPath}/remove`, [`=.id=${sess['.id'] || sess.id}`]);
              removed = true;
            } catch {}
          }
        }
      } catch {}

      try {
        const hsAct = await client.querySafe('/ip/hotspot/active/print', [`?user=${rawUser}`]);
        if (Array.isArray(hsAct)) {
          for (const act of hsAct) {
            try {
              await client.query('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
              removed = true;
            } catch {}
          }
        }
      } catch {}

      try {
        const pppAct = await client.querySafe('/ppp/active/print', [`?name=${rawUser}`]);
        if (Array.isArray(pppAct)) {
          for (const act of pppAct) {
            try {
              await client.query('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              removed = true;
            } catch {}
          }
        }
      } catch {}
    }

    if (!removed && rawId.startsWith('*')) {
      // Fallback: rawId might be direct Hotspot or PPP active .id from RADIUS bridge
      try {
        await client.query('/ip/hotspot/active/remove', [`=.id=${rawId}`]);
        removed = true;
      } catch {}
      if (!removed) {
        try {
          await client.query('/ppp/active/remove', [`=.id=${rawId}`]);
          removed = true;
        } catch {}
      }
    }

    if (!removed) {
      return res.status(404).json({ success: false, message: "جلسة اليوزر مانجر غير موجودة أو تم فصلها مسبقاً" });
    }

    invalidateCache("user-manager");
    invalidateCache("/ip/hotspot/active");
    invalidateCache("/ppp/active");
    clearCachedUsermanResult();
    res.json({ success: true, message: "تم فصل جلسة المشترك بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// VOUCHER GENERATE (REAL MIKROTIK INJECTION - HIGH SPEED BATCHING & STRICT DUPLICATION PREVENTION)
router.post("/api/mikrotik/hotspot/cards/generate", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const {
      systemType,
      serviceType,
      server,
      profile,
      count,
      length,
      userLength,
      passwordLength,
      prefix,
      type,
      sameUserPass,
      charType,
      limitUptime,
      limitBytesTotal,
      comment,
      price: bodyPrice
    } = req.body;

    const rawSys = String(systemType || serviceType || "hotspot").trim().toLowerCase();
    const targetSystem = (rawSys === "ppp" || rawSys === "pppoe")
      ? "ppp"
      : (rawSys === "userman" || rawSys === "user-manager")
      ? "userman"
      : "hotspot";
    const batchId = "ZC-" + Date.now().toString(36).toUpperCase();
    
    let chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // default mixed
    if (charType === "numbers") {
      chars = "0123456789";
    } else if (charType === "letters") {
      chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    } else if (charType === "lowercase") {
      chars = "23456789abcdefghijkmnpqrstuvwxyz";
    }

    const totalCount = Math.min(Math.max(1, Number(count) || 1), 5000);
    const uLen = Math.min(Math.max(3, Number(userLength || length) || 6), 16);
    const pLen = Math.min(Math.max(3, Number(passwordLength || userLength || length) || 6), 16);
    const cleanPrefix = sanitizeInput(prefix);
    const cleanProfile = sanitizeInput(profile) || "default";
    const cleanComment = sanitizeInput(comment);
    const cleanServer = sanitizeInput(server);

    const isSameUserPass = sameUserPass === true || type === "user_equals_pass";
    const isNoPassword = (type === "user_only" || type === "username_only" || !type) && !isSameUserPass;

    // FETCH EXISTING USERNAMES FROM THE PHYSICAL ROUTER TO AUDIT AGAINST
    const existingNamesOnRouter = new Set<string>();
    try {
      if (targetSystem === "ppp") {
        const routerSecrets = await client.querySafe('/ppp/secret/print', ['=.proplist=name']);
        if (Array.isArray(routerSecrets)) {
          routerSecrets.forEach((s: any) => {
            if (s && s.name) existingNamesOnRouter.add(String(s.name).trim());
          });
        }
      } else if (targetSystem === "userman") {
        const umPrefix = getUserManPrefix(client);
        const routerUmUsers = await client.querySafe(`${umPrefix}/user/print`, ['=.proplist=name,username']);
        if (Array.isArray(routerUmUsers)) {
          routerUmUsers.forEach((u: any) => {
            const nameVal = u?.username || u?.name;
            if (nameVal) existingNamesOnRouter.add(String(nameVal).trim());
          });
        }
      } else {
        // Hotspot default
        const routerHotspotUsers = await client.querySafe('/ip/hotspot/user/print', ['=.proplist=name']);
        if (Array.isArray(routerHotspotUsers)) {
          routerHotspotUsers.forEach((u: any) => {
            if (u && u.name) existingNamesOnRouter.add(String(u.name).trim());
          });
        }
      }
    } catch (err) {
      console.error("Zero-Collision Guard: Error fetching existing names from router:", err);
    }

    const generatedNamesInCurrentBatch = new Set<string>();
    const successfulUsers: any[] = [];
    let attempts = 0;
    const maxAttempts = totalCount * 10; // Prevent freeze if scope is too tight

    // GENERATE TRULY UNIQUE NON-COLLIDING CODES IN GENTLE PACED CHUNKS TO PROTECT ROUTER CPU
    const isStressedNow = client.isThermalStressed ? client.isThermalStressed() : false;
    const chunkSize = isStressedNow ? 5 : 10;

    while (successfulUsers.length < totalCount && attempts < maxAttempts) {
      const remaining = totalCount - successfulUsers.length;
      const currentChunkSize = Math.min(chunkSize, remaining);
      const chunkTasks: Array<() => Promise<void>> = [];

      while (chunkTasks.length < currentChunkSize && attempts < maxAttempts) {
        attempts++;
        
        let code = "";
        for (let j = 0; j < uLen; j++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const finalCode = cleanPrefix + code;
        const uName = finalCode;

        // Deduplicate against BOTH router DB and current batch names
        if (existingNamesOnRouter.has(uName) || generatedNamesInCurrentBatch.has(uName)) {
          continue;
        }

        let uPass = "";
        if (isSameUserPass) {
          uPass = uName;
        } else if (!isNoPassword) {
          uPass = "";
          for (let j = 0; j < pLen; j++) {
            uPass += chars.charAt(Math.floor(Math.random() * chars.length));
          }
        }

        generatedNamesInCurrentBatch.add(uName);
        const batchCommentStr = cleanComment ? `${cleanComment} [${batchId}]` : batchId;

        chunkTasks.push(async () => {
          try {
            if (targetSystem === "ppp") {
              const params = [
                `=name=${uName}`,
                `=profile=${cleanProfile}`,
                `=service=any`,
                `=comment=${batchCommentStr}`
              ];
              if (uPass) params.push(`=password=${uPass}`);
              await client.query('/ppp/secret/add', params);
            } else if (targetSystem === "userman") {
              const isV6 = client.isV6();
              const umPrefix = getUserManPrefix(client);
              const userParam = isV6 ? `=username=${uName}` : `=name=${uName}`;
              const params = [
                userParam,
                `=comment=${batchCommentStr}`
              ];
              if (uPass) params.push(`=password=${uPass}`);
              if (isV6) {
                params.push(`=customer=admin`);
              } else {
                params.push(`=group=default`); // V7 assigns users to groups, 'default' is the standard group
              }
              // 1. Create the User Manager User
              await client.query(`${umPrefix}/user/add`, params);
              
              // 2. Assign the Profile to the User (CRITICAL for limits/validity to apply)
              if (cleanProfile && cleanProfile !== 'default') {
                try {
                  if (isV6) {
                    await client.query(`${umPrefix}/user/create-and-activate-profile`, [
                      `=username=${uName}`,
                      `=profile=${cleanProfile}`,
                      `=customer=admin`
                    ]);
                  } else {
                    await client.query(`${umPrefix}/user-profile/add`, [
                      `=user=${uName}`,
                      `=profile=${cleanProfile}`
                    ]);
                  }
                } catch (profErr) {
                  console.error(`Zero-Collision Guard: Failed to attach profile ${cleanProfile} to userman user ${uName}`, profErr);
                }
              }
            } else {
              // Hotspot default
              const params = [
                `=name=${uName}`,
                `=profile=${cleanProfile}`,
                `=comment=${batchCommentStr}`
              ];
              if (uPass) params.push(`=password=${uPass}`);
              if (limitUptime) params.push(`=limit-uptime=${sanitizeInput(limitUptime)}`);
              if (limitBytesTotal) params.push(`=limit-bytes-total=${Number(limitBytesTotal) || 0}`);
              if (cleanServer && cleanServer !== "all") params.push(`=server=${cleanServer}`);
              await client.query('/ip/hotspot/user/add', params);
            }

            // DUAL-VERIFICATION: Only include in successful print database if successfully added to RouterOS
            successfulUsers.push({
              id: `gen-${uName}`,
              name: uName,
              password: uPass,
              profile: cleanProfile,
              limitUptime: limitUptime || "",
              limitBytesTotal: limitBytesTotal || 0,
              comment: batchId,
              createdAt: new Date().toISOString()
            });
          } catch (err) {
            console.error(`Zero-Collision Guard: Failed to inject voucher code ${uName}:`, err);
            // If failed, remove from generatedNames so it can potentially be retried or freed
            generatedNamesInCurrentBatch.delete(uName);
          }
        });
      }

      if (chunkTasks.length > 0) {
        const isStressed = client.isThermalStressed ? client.isThermalStressed() : false;
        // Paced sequential execution: 20ms yield between each voucher insertion keeps CPU smooth
        for (const task of chunkTasks) {
          await task();
          await new Promise(resolve => setTimeout(resolve, isStressed ? 35 : 20));
        }
        // Inter-chunk cooldown to allow RouterOS networking queues and timers to process
        if (successfulUsers.length < totalCount) {
          const chunkCoolDown = isStressed ? 120 : 40;
          await new Promise(resolve => setTimeout(resolve, chunkCoolDown));
        }
      }
    }

    if (targetSystem === "ppp") {
      invalidateCache("/ppp");
    } else if (targetSystem === "userman") {
      invalidateCache("user-manager");
    } else {
      invalidateCache("/ip/hotspot");
    }

    // Mirror successfully injected users into local voucherDb for VoucherStudio printing & tracking
    if (successfulUsers.length > 0) {
      try {
        let resolvedCardPrice = bodyPrice !== undefined ? (Number(bodyPrice) || 0) : 0;
        if (bodyPrice === undefined && cleanProfile && cleanProfile !== 'default') {
          try {
            if (targetSystem === 'ppp') {
              const pRes = await client.querySafe('/ppp/profile/print', [`?name=${cleanProfile}`], { rapid: true });
              if (Array.isArray(pRes) && pRes[0]) resolvedCardPrice = normalizePPPProfile(pRes[0]).price || 0;
            } else if (targetSystem === 'userman') {
              const umPrefix = getUserManPrefix(client);
              const pRes = await client.querySafe(`${umPrefix}/profile/print`, [`?name=${cleanProfile}`], { rapid: true });
              if (Array.isArray(pRes) && pRes[0]) resolvedCardPrice = normalizeUsermanProfile(pRes[0]).price || 0;
            } else {
              const pRes = await client.querySafe('/ip/hotspot/user/profile/print', [`?name=${cleanProfile}`], { rapid: true });
              if (Array.isArray(pRes) && pRes[0]) resolvedCardPrice = normalizeHotspotProfile(pRes[0]).price || 0;
            }
          } catch {}
        }

        voucherDb.insertBatchTransaction({
          batchId,
          profileName: cleanProfile,
          totalGenerated: successfulUsers.length,
          totalSynced: successfulUsers.length,
          createdAt: new Date().toISOString(),
          comment: cleanComment || `Hotspot Cards [${batchId}]`,
          serviceType: targetSystem === 'ppp' ? 'PPPOE' : targetSystem === 'userman' ? 'USERMAN' : 'HOTSPOT',
          authMode: isNoPassword ? 'user_only' : isSameUserPass ? 'user_equals_pass' : 'user_pass',
          price: resolvedCardPrice
        }, successfulUsers.map(u => ({
          voucherId: u.id || `v-${u.name}`,
          voucherCode: u.name,
          voucherPin: u.password ?? '',
          statusCd: 'ACTIVE',
          price: resolvedCardPrice,
          profileName: cleanProfile,
          timeLimit: limitUptime || undefined,
          dataLimit: limitBytesTotal ? `${Math.round(limitBytesTotal / 1024 / 1024)} MB` : undefined,
          createdAt: u.createdAt || new Date().toISOString(),
          batchId,
          serviceType: targetSystem === 'ppp' ? 'PPPOE' : targetSystem === 'userman' ? 'USERMAN' : 'HOTSPOT',
          isSynced: true
        })));
      } catch (dbErr) {
        console.warn("Zero-Collision Guard: Could not mirror generated cards to voucherDb:", dbErr);
      }
    }

    const duplicatesPrevented = attempts - successfulUsers.length;
    recordAudit(req, "generate_router_cards", "vouchers", "success", {
      resourceId: batchId,
      changes: { before: null, after: { count: successfulUsers.length, profile: cleanProfile, system: targetSystem } }
    });

    res.json({
      success: true,
      message: `تم توليد وحقن ${successfulUsers.length} كرت بنجاح حقيقياً في سيرفر المايكروتك بنظام صفر تكرار`,
      batchId,
      users: successfulUsers,
      duplicatesPrevented,
      auditedRouterCount: existingNamesOnRouter.size
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});


  return router;
}
