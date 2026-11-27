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

export function registerPppRoutes(router: Router): void {
// ==========================================
// PPP / PPPoE SECRETS & PROFILES CRUD
// ==========================================
router.post("/api/mikrotik/ppp/secrets", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
      } catch (kickErr: unknown) {
        appLogger.warn('pppRoutes', 'Failed to disconnect PPP active session on secret update', {
          error: kickErr instanceof Error ? kickErr.message : String(kickErr)
        });
      }
    }

    invalidateCache("/ppp");
    res.json({ success: true, message: "تم تحديث بيانات حساب PPPoE وتأكيدها على المايكروتك بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/ppp/secrets/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
      } catch (kickErr: unknown) {
        appLogger.warn('pppRoutes', 'Failed to disconnect PPP active session on secret delete', {
          secret: foundSecretName,
          error: kickErr instanceof Error ? kickErr.message : String(kickErr)
        });
      }
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
        } catch (batchErr: unknown) {
          appLogger.warn('pppRoutes', 'Batch delete PPP secret item failed', {
            id,
            error: batchErr instanceof Error ? batchErr.message : String(batchErr)
          });
        }
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
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (metaErr: unknown) {
      appLogger.warn('pppRoutes', 'Failed saving PPP profile metadata mirror', {
        profile: sName,
        error: metaErr instanceof Error ? metaErr.message : String(metaErr)
      });
    }

    recordAudit(req, "create_ppp_profile", "ppp_profiles", "success", { resourceId: sName });
    res.json({ success: true, message: `تم إنشاء بروفايل PPPoE (${sName}) بنجاح مباشرة على المايكروتك`, profile: createdProfile });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.put("/api/mikrotik/ppp/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (lookupErr: unknown) {
      appLogger.warn('pppRoutes', 'Failed PPP profile lookup before update', {
        rawId,
        error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr)
      });
    }

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
    } catch (metaErr: unknown) {
      appLogger.warn('pppRoutes', 'Failed updating PPP profile metadata mirror', {
        profile: newProfileName,
        error: metaErr instanceof Error ? metaErr.message : String(metaErr)
      });
    }

    invalidateCache("/ppp");
    recordAudit(req, "update_ppp_profile", "ppp_profiles", "success", { resourceId: newProfileName });
    res.json({ success: true, message: `تم تحديث بروفايل PPPoE (${newProfileName}) وتطبيقه مباشرة على المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.delete("/api/mikrotik/ppp/profiles/:id", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
    } catch (metaErr: unknown) {
      appLogger.warn('pppRoutes', 'Failed deleting PPP profile metadata mirror', {
        profile: displayName,
        error: metaErr instanceof Error ? metaErr.message : String(metaErr)
      });
    }
    invalidateCache("/ppp");
    recordAudit(req, "delete_ppp_profile", "ppp_profiles", "success", { resourceId: displayName });
    res.json({ success: true, message: `تم حذف بروفايل PPPoE (${displayName}) من المايكروتك بنجاح` });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/ppp/active/disconnect", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
  try {
    const rawId = sanitizeInput(req.body.id || '');
    const rawName = sanitizeInput(req.body.name || req.body.user || '');
    let removed = false;

    if (rawId && rawId.startsWith('*')) {
      try {
        await client.query('/ppp/active/remove', [`=.id=${rawId}`]);
        removed = true;
      } catch (rmErr: unknown) {
        appLogger.warn('pppRoutes', 'Direct PPP active remove failed, trying name lookup', {
          rawId,
          error: rmErr instanceof Error ? rmErr.message : String(rmErr)
        });
      }
    }

    const nameToFind = rawName || (rawId && !rawId.startsWith('*') ? rawId : '');
    if (!removed && nameToFind) {
      const found = await client.querySafe('/ppp/active/print', [`?name=${nameToFind}`]);
      if (Array.isArray(found) && found.length > 0) {
        for (const act of found) {
          try {
            await client.query('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
            removed = true;
          } catch (rmErr: unknown) {
            appLogger.warn('pppRoutes', 'Failed removing matched PPP active session', {
              name: nameToFind,
              error: rmErr instanceof Error ? rmErr.message : String(rmErr)
            });
          }
        }
      }
    } else if (!removed && rawId) {
      try {
        await client.query('/ppp/active/remove', [`=.id=${rawId}`]);
        removed = true;
      } catch (rmErr: unknown) {
        appLogger.warn('pppRoutes', 'Fallback PPP active remove failed', {
          rawId,
          error: rmErr instanceof Error ? rmErr.message : String(rmErr)
        });
      }
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

}
