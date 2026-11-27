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

export function registerBatchSubscribersRoutes(router: Router): void {
// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED BULK / BATCH ACTIONS FOR SUBSCRIBERS (HOTSPOT, PPPoE, USER MANAGER)
// High-performance atomic execution with chunked micro-yields to eliminate CPU locks
// ═══════════════════════════════════════════════════════════════════════════
router.post("/api/mikrotik/subscribers/batch-action", async (req: Request, res: Response) => {
  req.setTimeout(300000); // 5 minutes timeout for massive batch ops
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    return res.status(503).json({ success: false, reconnecting: true, message: "جاري إعادة الاتصال بالراوتر" });
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
            } catch (err: unknown) {
              appLogger.warn('batchSubscribers', 'Direct hotspot user remove failed, trying fallback', {
                mikrotikId,
                error: err instanceof Error ? err.message : String(err)
              });
            }
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
              } catch (err: unknown) {
                appLogger.warn('batchSubscribers', 'Fallback hotspot user remove failed', {
                  rawId,
                  error: err instanceof Error ? err.message : String(err)
                });
              }
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
          } catch (kickErr: unknown) {
            appLogger.warn('batchSubscribers', 'Failed disconnecting active hotspot session after batch delete', {
              rawId,
              error: kickErr instanceof Error ? kickErr.message : String(kickErr)
            });
          }
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
            } catch (resetErr: unknown) {
              appLogger.warn('batchSubscribers', 'Failed resetting hotspot counters on profile change', {
                mikrotikId,
                error: resetErr instanceof Error ? resetErr.message : String(resetErr)
              });
            }
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
            } catch (resetErr: unknown) {
              appLogger.warn('batchSubscribers', 'Failed resetting hotspot counters on renew', {
                mikrotikId,
                error: resetErr instanceof Error ? resetErr.message : String(resetErr)
              });
            }
            try {
              const activeList = await client.querySafe('/ip/hotspot/active/print', ['=.proplist=.id,user', `?user=${username}`], { rapid: true });
              if (Array.isArray(activeList) && activeList.length > 0) {
                for (const act of activeList) {
                  await client.querySafe('/ip/hotspot/active/remove', [`=.id=${act['.id'] || act.id}`]);
                  kickedAnyActive = true;
                }
              }
            } catch (kickErr: unknown) {
              appLogger.warn('batchSubscribers', 'Failed disconnecting hotspot session on renew', {
                username,
                error: kickErr instanceof Error ? kickErr.message : String(kickErr)
              });
            }
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
            } catch (kickErr: unknown) {
              appLogger.warn('batchSubscribers', 'Failed disconnecting hotspot session on toggle_status', {
                username,
                error: kickErr instanceof Error ? kickErr.message : String(kickErr)
              });
            }
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
            } catch (kickErr: unknown) {
              appLogger.warn('batchSubscribers', 'Failed disconnecting hotspot session on batch edit', {
                username,
                error: kickErr instanceof Error ? kickErr.message : String(kickErr)
              });
            }
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
            } catch (err: unknown) {
              appLogger.warn('batchSubscribers', 'Direct PPP secret remove failed, trying fallback', {
                mikrotikId,
                error: err instanceof Error ? err.message : String(err)
              });
            }
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
              } catch (err: unknown) {
                appLogger.warn('batchSubscribers', 'Fallback PPP secret remove failed', {
                  rawId,
                  error: err instanceof Error ? err.message : String(err)
                });
              }
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
          } catch (kickErr: unknown) {
            appLogger.warn('batchSubscribers', 'Failed disconnecting PPP active session after batch delete', {
              rawId,
              error: kickErr instanceof Error ? kickErr.message : String(kickErr)
            });
          }
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
          } catch (kickErr: unknown) {
            appLogger.warn('batchSubscribers', 'Failed disconnecting PPP sessions on change_profile', {
              error: kickErr instanceof Error ? kickErr.message : String(kickErr)
            });
          }
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
        } catch (kickErr: unknown) {
          appLogger.warn('batchSubscribers', 'Failed disconnecting PPP sessions on renew', {
            error: kickErr instanceof Error ? kickErr.message : String(kickErr)
          });
        }
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
            } catch (kickErr: unknown) {
              appLogger.warn('batchSubscribers', 'Failed disconnecting PPP session on batch edit', {
                username,
                error: kickErr instanceof Error ? kickErr.message : String(kickErr)
              });
            }
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
        } catch (err: unknown) {
          appLogger.warn('batchSubscribers', 'Failed kicking Hotspot active sessions for UserMan batch', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
        try {
          const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name'], { rapid: true });
          if (Array.isArray(pppAct)) {
            for (const act of pppAct) {
              if (nameSet.has(String(act.name || '').toLowerCase())) {
                await client.querySafe('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`]);
              }
            }
          }
        } catch (err: unknown) {
          appLogger.warn('batchSubscribers', 'Failed kicking PPP active sessions for UserMan batch', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
        try {
          const umSessions = await client.querySafe(`${umPrefix}/${isV6 ? 'active' : 'session'}/print`, ['=.proplist=.id,user,username'], { rapid: true });
          if (Array.isArray(umSessions)) {
            for (const sess of umSessions) {
              if (nameSet.has(String(sess.user || sess.username || '').toLowerCase())) {
                await client.querySafe(`${umPrefix}/${isV6 ? 'active' : 'session'}/remove`, [`=.id=${sess['.id'] || sess.id}`]);
              }
            }
          }
        } catch (err: unknown) {
          appLogger.warn('batchSubscribers', 'Failed kicking UserMan sessions for batch', {
            error: err instanceof Error ? err.message : String(err)
          });
        }
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
            } catch (err: unknown) {
              appLogger.warn('batchSubscribers', 'Direct UserMan user remove failed, trying fallback', {
                mikrotikId,
                error: err instanceof Error ? err.message : String(err)
              });
            }
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
              } catch (err: unknown) {
                appLogger.warn('batchSubscribers', 'Fallback UserMan user remove failed', {
                  rawId,
                  error: err instanceof Error ? err.message : String(err)
                });
              }
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
              } catch (resetErr: unknown) {
                appLogger.warn('batchSubscribers', 'Failed resetting UserMan v6 counters on renew', {
                  mikrotikId,
                  error: resetErr instanceof Error ? resetErr.message : String(resetErr)
                });
              }
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
        } catch (err: unknown) {
          appLogger.warn('batchSubscribers', 'Failed batch disconnecting Hotspot active sessions for UserMan', {
            error: err instanceof Error ? err.message : String(err)
          });
        }

        try {
          const pppAct = await client.querySafe('/ppp/active/print', ['=.proplist=.id,name'], { rapid: true });
          if (Array.isArray(pppAct)) {
            const matchingPpp = pppAct.filter((act: any) => targetNames.has(String(act.name || '').toLowerCase()));
            const resPpp = await runConcurrentBatch(matchingPpp, 4, async (act: any) => {
              await client.query('/ppp/active/remove', [`=.id=${act['.id'] || act.id}`], { rapid: true });
            });
            successCount += resPpp.sCount;
          }
        } catch (err: unknown) {
          appLogger.warn('batchSubscribers', 'Failed batch disconnecting PPP active sessions for UserMan', {
            error: err instanceof Error ? err.message : String(err)
          });
        }

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
        } catch (err: unknown) {
          appLogger.warn('batchSubscribers', 'Failed batch disconnecting UserMan active sessions', {
            error: err instanceof Error ? err.message : String(err)
          });
        }

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

}
