import { Router, type Request, type Response } from "express";
import { translateErrorMessage } from "../../../lib/errorTranslator.ts";
import { voucherDb } from "../../voucher-db.ts";
import { recordAudit } from "../../rbac.ts";
import { appLogger } from "../../rotatingLogger.ts";
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
} from "../../runtimeContext.ts";
import {
  cleanDnsOrIpList,
  executeProfileMutation,
  getUsermanEndpoints,
  isProtectedDefaultProfileName,
  normalizeRateLimitString,
  parseRateToBpsString
} from "../../routeros/profileSanitizer.ts";
import {
  HOTSPOT_OPTIONAL_FALLBACK_KEYS,
  PPP_OPTIONAL_FALLBACK_KEYS,
  USERMAN_LIM_OPTIONAL_KEYS,
  USERMAN_PROF_OPTIONAL_KEYS,
  USERMAN_LINK_OPTIONAL_KEYS
} from "./sharedConstants.ts";

export function registerUsermanRoutes(router: Router): void {
// ==========================================
// USER MANAGER USERS & PROFILES CRUD
// ==========================================
router.post("/api/mikrotik/userman/users", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
      } catch (resetErr: unknown) {
        appLogger.warn('usermanRoutes', 'Failed resetting UserMan v6 user counters', {
          targetId,
          error: resetErr instanceof Error ? resetErr.message : String(resetErr)
        });
      }
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
        } catch (kickErr: unknown) {
          appLogger.warn('usermanRoutes', 'Failed disconnecting active session after UserMan update', {
            uName,
            error: kickErr instanceof Error ? kickErr.message : String(kickErr)
          });
        }
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (kickErr: unknown) {
      appLogger.warn('usermanRoutes', 'Failed disconnecting active sessions after UserMan user deletion', {
        error: kickErr instanceof Error ? kickErr.message : String(kickErr)
      });
    }

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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
        } catch (batchErr: unknown) {
          appLogger.warn('usermanRoutes', 'Batch delete UserMan item failed', {
            id,
            error: batchErr instanceof Error ? batchErr.message : String(batchErr)
          });
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
      } catch (rbErr: unknown) {
        appLogger.warn('usermanRoutes', 'Failed rolling back orphan UserMan profile', {
          profile: createdProfileName,
          error: rbErr instanceof Error ? rbErr.message : String(rbErr)
        });
      }
    }
    // Rollback newly created limitation if profile creation or linking failed
    if (createdLimId) {
      try {
        await client.querySafe(`${um.limitation}/remove`, [`=.id=${createdLimId}`]);
      } catch (rbErr: unknown) {
        appLogger.warn('usermanRoutes', 'Failed rolling back orphan UserMan limitation', {
          limitationId: createdLimId,
          error: rbErr instanceof Error ? rbErr.message : String(rbErr)
        });
      }
    }
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/userman/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (lookupErr: unknown) {
      appLogger.warn('usermanRoutes', 'Failed UserMan profile lookup before update', {
        rawId,
        error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr)
      });
    }

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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
          } catch (rmErr: unknown) {
            appLogger.warn('usermanRoutes', 'Failed removing UserMan profile-limitation link', {
              linkId: link['.id'],
              error: rmErr instanceof Error ? rmErr.message : String(rmErr)
            });
          }
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
      } catch (cleanupErr: unknown) {
        appLogger.warn('usermanRoutes', 'Failed cleaning up orphan UserMan limitation', {
          limName,
          error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)
        });
      }
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
      } catch (rmErr: unknown) {
        appLogger.warn('usermanRoutes', 'Direct UserMan session removal failed', {
          rawId,
          error: rmErr instanceof Error ? rmErr.message : String(rmErr)
        });
      }
    }

    if (rawUser) {
      try {
        const umSessions = await client.querySafe(`${sessionPath}/print`, [`?user=${rawUser}`]);
        if (Array.isArray(umSessions)) {
          for (const sess of umSessions) {
            try {
              await client.query(`${sessionPath}/remove`, [`=.id=${sess['.id'] || sess.id}`]);
              removed = true;
            } catch (sessErr: unknown) {
              appLogger.warn('usermanRoutes', 'Failed removing UserMan session by user', {
                rawUser,
                error: sessErr instanceof Error ? sessErr.message : String(sessErr)
              });
            }
          }
        }
      } catch (err: unknown) {
        appLogger.warn('usermanRoutes', 'Failed querying UserMan sessions for disconnect', {
          rawUser,
          error: err instanceof Error ? err.message : String(err)
        });
      }

      try {
        const hsAct = await client.querySafe('/ip/hotspot/active/print', [`?user=${rawUser}`]);
        if (Array.isArray(hsAct)) {
          for (const act of hsAct) {
            try {
              await client.query('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
              removed = true;
            } catch (actErr: unknown) {
              appLogger.warn('usermanRoutes', 'Failed removing bridged Hotspot active session', {
                rawUser,
                error: actErr instanceof Error ? actErr.message : String(actErr)
              });
            }
          }
        }
      } catch (err: unknown) {
        appLogger.warn('usermanRoutes', 'Failed querying bridged Hotspot sessions', {
          rawUser,
          error: err instanceof Error ? err.message : String(err)
        });
      }

      try {
        const pppAct = await client.querySafe('/ppp/active/print', [`?name=${rawUser}`]);
        if (Array.isArray(pppAct)) {
          for (const act of pppAct) {
            try {
              await client.query('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              removed = true;
            } catch (actErr: unknown) {
              appLogger.warn('usermanRoutes', 'Failed removing bridged PPP active session', {
                rawUser,
                error: actErr instanceof Error ? actErr.message : String(actErr)
              });
            }
          }
        }
      } catch (err: unknown) {
        appLogger.warn('usermanRoutes', 'Failed querying bridged PPP sessions', {
          rawUser,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    if (!removed && rawId.startsWith('*')) {
      // Fallback: rawId might be direct Hotspot or PPP active .id from RADIUS bridge
      try {
        await client.query('/ip/hotspot/active/remove', [`=.id=${rawId}`]);
        removed = true;
      } catch (err: unknown) {
        appLogger.warn('usermanRoutes', 'Fallback Hotspot active removal failed', {
          rawId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
      if (!removed) {
        try {
          await client.query('/ppp/active/remove', [`=.id=${rawId}`]);
          removed = true;
        } catch (err: unknown) {
          appLogger.warn('usermanRoutes', 'Fallback PPP active removal failed', {
            rawId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
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

}
