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

export function registerHotspotProfilesRoutes(router: Router): void {
// HOTSPOT PROFILES CRUD
router.post("/api/mikrotik/hotspot/profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (metaErr: any) {
      appLogger.warn("HotspotProfiles", "Failed saving profile metadata on create", { profile: sName, error: metaErr?.message });
    }

    recordAudit(req, "create_hotspot_profile", "hotspot_profiles", "success", { resourceId: sName });
    res.json({ success: true, message: `تم إضافة بروفايل الهوتسبوت (${sName}) بنجاح وحفظه مباشرة على المايكروتك`, profile: createdProfile });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/hotspot/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (lookupErr: any) {
      appLogger.warn("HotspotProfiles", "Profile lookup warning before update", { error: lookupErr?.message });
    }

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
    } catch (metaErr: any) {
      appLogger.warn("HotspotProfiles", "Failed saving profile metadata on update", { profile: newProfileName, error: metaErr?.message });
    }

    invalidateCache("/ip/hotspot");
    recordAudit(req, "update_hotspot_profile", "hotspot_profiles", "success", { resourceId: newProfileName });
    res.json({ success: true, message: `تم تحديث بروفايل الهوتسبوت (${newProfileName}) وتطبيقه مباشرة على المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/hotspot/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (metaErr: any) {
      appLogger.warn("HotspotProfiles", "Failed deleting profile metadata", { profile: displayName, error: metaErr?.message });
    }
    invalidateCache("/ip/hotspot");
    recordAudit(req, "delete_hotspot_profile", "hotspot_profiles", "success", { resourceId: displayName });
    res.json({ success: true, message: `تم حذف بروفايل الهوتسبوت (${displayName}) من المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

}
