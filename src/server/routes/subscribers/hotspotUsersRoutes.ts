import { Router, type Request, type Response } from "express";
import { translateErrorMessage } from "../../../lib/errorTranslator.ts";
import { voucherDb } from "../../voucher-db.ts";
import { recordAudit } from "../../rbac.ts";
import { appLogger } from "../../rotatingLogger.ts";
import { randomSecureString } from "../../utils/routerNormalizers.ts";
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

export function registerHotspotUsersRoutes(router: Router): void {
// ==========================================
// HOTSPOT USERS CRUD
// ==========================================
// HOTSPOT USERS & PROFILES CRUD
// ==========================================
router.post("/api/mikrotik/hotspot/users", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (kickErr: unknown) {
      appLogger.warn('hotspotUsers', 'Failed to disconnect active session after user removal', {
        error: kickErr instanceof Error ? kickErr.message : String(kickErr)
      });
    }

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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
        } catch (batchErr: unknown) {
          appLogger.warn('hotspotUsers', 'Batch delete item failed', {
            id,
            error: batchErr instanceof Error ? batchErr.message : String(batchErr)
          });
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


router.put("/api/mikrotik/hotspot/users/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
      } catch (resetErr: unknown) {
        appLogger.warn('hotspotUsers', 'Failed to reset hotspot counters on update', {
          targetId,
          error: resetErr instanceof Error ? resetErr.message : String(resetErr)
        });
      }
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
      } catch (kickErr: unknown) {
        appLogger.warn('hotspotUsers', 'Failed to disconnect active hotspot session on update', {
          error: kickErr instanceof Error ? kickErr.message : String(kickErr)
        });
      }
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const rawId = sanitizeInput(req.body.id || '');
    const rawUser = sanitizeInput(req.body.user || '');
    const targetId = rawId;
    let removed = false;
    if (targetId && targetId.startsWith('*')) {
      try {
        await client.query('/ip/hotspot/active/remove', [`=.id=${targetId}`]);
        removed = true;
      } catch (rmErr: unknown) {
        appLogger.warn('hotspotUsers', 'Direct hotspot active remove failed, trying username lookup', {
          targetId,
          error: rmErr instanceof Error ? rmErr.message : String(rmErr)
        });
      }
    }
    const userToFind = rawUser || (rawId && !rawId.startsWith('*') ? rawId : '');
    if (!removed && userToFind) {
      const found = await client.querySafe('/ip/hotspot/active/print', [`?user=${userToFind}`]);
      if (Array.isArray(found) && found.length > 0) {
        for (const act of found) {
          try {
            await client.query('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
            removed = true;
          } catch (rmErr: unknown) {
            appLogger.warn('hotspotUsers', 'Failed removing matched active hotspot session', {
              user: userToFind,
              error: rmErr instanceof Error ? rmErr.message : String(rmErr)
            });
          }
        }
      }
    } else if (!removed && targetId) {
      try {
        await client.query('/ip/hotspot/active/remove', [`=.id=${targetId}`]);
        removed = true;
      } catch (rmErr: unknown) {
        appLogger.warn('hotspotUsers', 'Fallback hotspot active remove failed', {
          targetId,
          error: rmErr instanceof Error ? rmErr.message : String(rmErr)
        });
      }
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


// VOUCHER GENERATE (REAL MIKROTIK INJECTION - HIGH SPEED BATCHING & STRICT DUPLICATION PREVENTION)
router.post("/api/mikrotik/hotspot/cards/generate", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
        
        const code = randomSecureString(uLen, chars);
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
          uPass = randomSecureString(pLen, chars);
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
          } catch (priceErr: unknown) {
            appLogger.warn('hotspotUsers', 'Failed resolving profile price during voucher mirror', {
              profile: cleanProfile,
              error: priceErr instanceof Error ? priceErr.message : String(priceErr)
            });
          }
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
}
