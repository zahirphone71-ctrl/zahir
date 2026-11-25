import type { 
  SyncOptions, 
  SyncResult, 
  SyncError, 
  RouterPrecheckInfo, 
  VoucherItem 
} from '../shared/voucher-types.ts';
import { getRouterMutex } from './mutex.ts';
import { voucherDb } from './voucher-db.ts';

/**
 * تحويل الوقت إلى صيغة RouterOS المقبولة
 * مثال: "30 يوم" → "30d" | "24 ساعة" → "24h" | "12 ساعة" → "12h" | "30 دقيقة" → "30m"
 * وفي حال اختيار "مفتوح" أو "بلا حد" ترجع سلسلة فارغة لعدم وضع قيد
 */
export function parseRouterOSTimeLimit(timeStr?: string): string {
  if (!timeStr) return '';
  const normalized = timeStr.trim().toLowerCase();
  
  if (
    normalized === '0' ||
    normalized === '0s' ||
    normalized === 'none' ||
    normalized === 'unlimited' ||
    normalized === 'مفتوح' ||
    normalized === 'بلا حد' ||
    normalized === 'بدون حد' ||
    normalized === 'غير محدود' ||
    normalized === 'بدون وقت'
  ) {
    return '';
  }

  if (/^\d+[dhms]$/i.test(normalized)) return normalized.toLowerCase();

  // فحص الأشهر والأسابيع
  const monthMatch = normalized.match(/(\d+)\s*(شهر|أشهر|شهور|month|months)/i);
  if (monthMatch) {
    const days = parseInt(monthMatch[1], 10) * 30;
    return `${days}d`;
  }
  if (normalized.includes('شهرين')) return '60d';
  if (normalized.includes('شهر')) return '30d';

  const weekMatch = normalized.match(/(\d+)\s*(أسبوع|اسبوع|أسابيع|week|weeks|w)/i);
  if (weekMatch) {
    const days = parseInt(weekMatch[1], 10) * 7;
    return `${days}d`;
  }
  if (normalized.includes('أسبوع') || normalized.includes('اسبوع')) return '7d';

  const match = normalized.match(/(\d+)\s*(يوم|أيام|ايام|ساعة|ساعات|دقيقة|دقائق|ثانية|ثواني|day|days|hour|hours|min|mins|sec|secs|d|h|m|s)/i);
  if (match) {
    const num = match[1];
    const unit = match[2].toLowerCase();
    if (unit.startsWith('ي') || unit.startsWith('ا') || unit.startsWith('d')) return `${num}d`;
    if (unit.startsWith('س') || unit.startsWith('h')) return `${num}h`;
    if (unit.startsWith('د') || unit.startsWith('m')) return `${num}m`;
    if (unit.startsWith('ث') || unit.startsWith('s')) return `${num}s`;
  }

  const numMatch = normalized.match(/^(\d+)$/);
  if (numMatch) return `${numMatch[1]}d`;

  return '';
}

/**
 * تحويل حد البيانات إلى بايت
 * مثال: "5 GB" → 5368709120 | "500 MB" → 524288000
 * وفي حال اختيار "مفتوح" ترجع 0 لعدم وضع قيد
 */
export function parseRouterOSDataLimit(dataStr?: string): number {
  if (!dataStr) return 0;
  const normalized = dataStr.trim().toLowerCase();

  if (
    normalized === '0' ||
    normalized === 'none' ||
    normalized === 'unlimited' ||
    normalized === 'مفتوح' ||
    normalized === 'بلا حد' ||
    normalized === 'بدون حد' ||
    normalized === 'غير محدود'
  ) {
    return 0;
  }

  if (/^\d+$/.test(normalized)) return parseInt(normalized, 10);

  const match = normalized.match(/([\d.]+)\s*(gb|mb|kb|tb|g|m|k|t|جيجا|ميجا|كيلو|تيرا)/i);
  if (match) {
    const num = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = 
      unit.startsWith('t') || unit.includes('تيرا') ? 1099511627776 :
      unit.startsWith('g') || unit.includes('جيجا') ? 1073741824 :
      unit.startsWith('m') || unit.includes('ميجا') ? 1048576 :
      unit.startsWith('k') || unit.includes('كيلو') ? 1024 : 1;
    return Math.floor(num * multiplier);
  }

  return 0;
}

/**
 * فحص حالة وموارد راوتر المايكروتك وقراءة البروفايلات الحقيقية والمستخدمين
 */
export async function getRouterPrecheck(client: any): Promise<RouterPrecheckInfo & { profiles?: string[] }> {
  const isConnected = Boolean(client && client.isConnected());
  const stats = voucherDb.getDashboardStats();

  if (!isConnected) {
    return {
      routerConnected: false,
      message: 'الراوتر غير متصل - يعمل النظام في وضع التوليد والطباعة المحلي دون مزامنة فورية',
      existingDbCount: stats.totalVouchers,
      existingRouterCount: stats.syncedVouchers,
      profiles: ['default']
    };
  }

  try {
    const resourceRes = await client.querySafe('/system/resource/print');
    const boardRes = await client.querySafe('/system/routerboard/print');
    const resObj = Array.isArray(resourceRes) && resourceRes[0] ? resourceRes[0] : {};
    const boardObj = Array.isArray(boardRes) && boardRes[0] ? boardRes[0] : {};

    const boardName = boardObj.model || resObj['board-name'] || 'MikroTik Router';
    const version = resObj.version || 'RouterOS';
    const cpuLoad = parseInt(resObj['cpu-load'] || '0', 10);
    const freeMemory = parseInt(resObj['free-memory'] || '0', 10);
    const totalMemory = parseInt(resObj['total-memory'] || '0', 10);
    const uptime = resObj.uptime || '';

    // قراءة البروفايلات الحقيقية من الراوتر دون إرهاق المعالج أو استدعاء آلاف المستخدمين
    let profiles: string[] = ['default'];
    try {
      const routerProfilesRes = await Promise.race([
        client.querySafe('/ip/hotspot/user/profile/print', ['.proplist=name']),
        new Promise(r => setTimeout(() => r([]), 1500))
      ]);
      if (Array.isArray(routerProfilesRes) && routerProfilesRes.length > 0) {
        profiles = routerProfilesRes.map((p: any) => p.name).filter(Boolean);
      }
    } catch {}
    
    const routerCount = stats.syncedVouchers > 0 ? stats.syncedVouchers : (stats.totalVouchers || 0);

    return {
      routerConnected: true,
      message: `الراوتر متصل بنجاح: ${boardName} (${version}) — المستخدمين بالراوتر: ${routerCount} — الذاكرة: ${Math.round(freeMemory / 1024 / 1024)}MB`,
      existingDbCount: stats.totalVouchers,
      existingRouterCount: routerCount,
      profiles,
      routerInfo: {
        boardName,
        version,
        cpuLoad,
        freeMemory,
        totalMemory,
        uptime
      }
    };
  } catch (err: any) {
    return {
      routerConnected: true,
      message: `الراوتر متصل ولكن تعذر قراءة بعض الموارد: ${err.message}`,
      existingDbCount: stats.totalVouchers,
      existingRouterCount: stats.syncedVouchers,
      profiles: ['default']
    };
  }
}

/**
 * مزامنة دفعة كروت حقيقياً مع راوتر المايكروتك وحقنها في الـ Hotspot أو User Manager أو PPPoE
 */
export async function syncBatchToRouter(
  options: SyncOptions,
  client: any
): Promise<SyncResult> {
  const startTime = Date.now();
  const routerId = options.routerId || 'default-router';
  const mutex = getRouterMutex(routerId);
  const release = await mutex.acquire();

  try {
    let vouchers: VoucherItem[] = options.batchId ? voucherDb.getVouchersByBatch(options.batchId) : [];
    if (vouchers.length === 0 && Array.isArray(options.voucherCodes) && options.voucherCodes.length > 0) {
      const found: VoucherItem[] = [];
      for (const code of options.voucherCodes) {
        const v = voucherDb.getVoucherByCode(code);
        if (v) found.push(v);
      }
      vouchers = found;
    }
    if (vouchers.length === 0) {
      throw new Error(`لم يتم العثور على كروت للدفعة ${options.batchId || 'المحددة'}`);
    }

    if (!client || !client.isConnected()) {
      throw new Error('راوتر المايكروتك غير متصل حالياً');
    }

    let toSync = vouchers.filter(v => !v.isSynced);
    if (Array.isArray(options.voucherCodes) && options.voucherCodes.length > 0) {
      const codeSet = new Set(options.voucherCodes.map(c => c.toLowerCase()));
      toSync = toSync.filter(v => codeSet.has(v.voucherCode.toLowerCase()));
    }
    const syncedCodes: string[] = [];
    const errors: SyncError[] = [];
    let synced = 0;
    let failed = 0;
    let skipped = vouchers.length - toSync.length;

    const rawProfile = options.profileOnRouter || vouchers[0]?.profileName || 'default';
    const serviceType = (options.serviceType || vouchers[0]?.serviceType || 'HOTSPOT').toUpperCase();

    // التحقق من وجود البروفايل في الراوتر واختيار بروفايل بديل آمن لتجنب فشل الحقن
    let effectiveProfile = rawProfile;
    if (serviceType === 'HOTSPOT') {
      try {
        const hsProfiles = await client.querySafe('/ip/hotspot/user/profile/print', ['.proplist=name']);
        if (Array.isArray(hsProfiles) && hsProfiles.length > 0) {
          const profileNames = new Set(hsProfiles.map((p: any) => p.name));
          if (!profileNames.has(effectiveProfile)) {
            if (profileNames.has('default')) {
              effectiveProfile = 'default';
            } else {
              effectiveProfile = hsProfiles[0]?.name || 'default';
            }
          }
        }
      } catch {}
    } else if (serviceType === 'PPPOE') {
      try {
        const pppProfiles = await client.querySafe('/ppp/profile/print', ['.proplist=name']);
        if (Array.isArray(pppProfiles) && pppProfiles.length > 0) {
          const profileNames = new Set(pppProfiles.map((p: any) => p.name));
          if (!profileNames.has(effectiveProfile)) {
            if (profileNames.has('default')) {
              effectiveProfile = 'default';
            } else {
              effectiveProfile = pppProfiles[0]?.name || 'default';
            }
          }
        }
      } catch {}
    } else if (serviceType === 'USERMAN') {
      try {
        const isV6 = client.isV6 ? client.isV6() : false;
        const umPrefix = isV6 ? '/tool/user-manager' : '/user-manager';
        const umProfiles = await client.querySafe(`${umPrefix}/profile/print`, ['.proplist=name']);
        if (Array.isArray(umProfiles) && umProfiles.length > 0) {
          const profileNames = new Set(umProfiles.map((p: any) => p.name));
          if (!profileNames.has(effectiveProfile)) {
            if (profileNames.has('default')) {
              effectiveProfile = 'default';
            } else {
              effectiveProfile = umProfiles[0]?.name || 'default';
            }
          }
        }
      } catch {}
    }

    // إخطار السيرفر بحظر الاستعلامات الدورية المتزامنة على المقبس لحماية الراوتر من التشنج
    if (typeof client.setBatchSyncInProgress === 'function') {
      client.setBatchSyncInProgress(true);
    }

    // حقن الكروت بدفعات مصغرة مدروسة (25 كرت) لحماية معالج وذاكرة المايكروتك من التشنج والحرارة
    const BATCH_CHUNK = 25;
    for (let i = 0; i < toSync.length; i += BATCH_CHUNK) {
      const chunk = toSync.slice(i, i + BATCH_CHUNK);

      for (const item of chunk) {
        try {
          const timeParam = parseRouterOSTimeLimit(item.timeLimit);
          const bytesTotal = parseRouterOSDataLimit(item.dataLimit);
          const itemBatch = item.batchId ? voucherDb.getBatch(item.batchId) : undefined;
          const isNoPassword =
            item.voucherPin === '' ||
            itemBatch?.authMode === 'user_only' ||
            itemBatch?.authMode === 'username_only';
          const passwordVal = isNoPassword ? '' : (item.voucherPin || item.voucherCode);

          if (serviceType === 'HOTSPOT') {
            const params: string[] = [
              `=name=${item.voucherCode}`,
              `=profile=${effectiveProfile}`,
              `=comment=ZCtrl|${item.batchId}|Price:${item.price || 0}|${item.createdAt}`
            ];
            if (!isNoPassword && passwordVal) {
              params.push(`=password=${passwordVal}`);
            }

            if (timeParam) params.push(`=limit-uptime=${timeParam}`);
            if (bytesTotal > 0) params.push(`=limit-bytes-total=${bytesTotal}`);

            try {
              await client.query('/ip/hotspot/user/add', params, { rapid: true });
              synced++;
              syncedCodes.push(item.voucherCode);
            } catch (err: any) {
              const errMsg = (err?.message || '').toLowerCase();
              if (errMsg.includes('already have') || errMsg.includes('already exist') || errMsg.includes('duplicate')) {
                const existing = await client.querySafe('/ip/hotspot/user/print', [`?name=${item.voucherCode}`], { rapid: true });
                if (Array.isArray(existing) && existing[0]?.['.id']) {
                  const existingUser = existing[0];
                  // Strict Subscriber Preservation (Rules 11, 24, 28):
                  // Only treat as success if this exact voucher was already injected by THIS batch previously (safe resumption)
                  if (item.batchId && existingUser.comment && existingUser.comment.includes(item.batchId)) {
                    synced++;
                    syncedCodes.push(item.voucherCode);
                  } else {
                    failed++;
                    errors.push({
                      voucherCode: item.voucherCode,
                      error: 'المستخدم موجود مسبقاً على الراوتر، تم الحفاظ على حسابه دون تعديل',
                      retryCount: 0
                    });
                  }
                } else {
                  throw err;
                }
              } else {
                throw err;
              }
            }
          } else if (serviceType === 'USERMAN') {
            const isV6 = client.isV6 ? client.isV6() : false;
            const umPrefix = isV6 ? '/tool/user-manager' : '/user-manager';
            
            if (isV6) {
              const params: string[] = [
                `=username=${item.voucherCode}`,
                `=customer=admin`,
                `=comment=ZCtrl|${item.batchId}|Price:${item.price || 0}|${item.createdAt}`
              ];
              if (!isNoPassword && passwordVal) {
                params.push(`=password=${passwordVal}`);
              }
              let userAddedOrExisted = false;
              try {
                await client.query(`${umPrefix}/user/add`, params, { rapid: true });
                userAddedOrExisted = true;
                synced++;
                syncedCodes.push(item.voucherCode);
              } catch (uErr: any) {
                const msg = (uErr?.message || '').toLowerCase();
                if (msg.includes('already have') || msg.includes('already exist')) {
                  const existing = await client.querySafe(`${umPrefix}/user/print`, [`?username=${item.voucherCode}`], { rapid: true });
                  if (Array.isArray(existing) && existing[0]?.['.id']) {
                    const existingUser = existing[0];
                    if (item.batchId && existingUser.comment && existingUser.comment.includes(item.batchId)) {
                      userAddedOrExisted = true;
                      synced++;
                      syncedCodes.push(item.voucherCode);
                    } else {
                      failed++;
                      errors.push({
                        voucherCode: item.voucherCode,
                        error: 'المستخدم موجود مسبقاً في User Manager v6، تم الحفاظ على حسابه دون تعديل',
                        retryCount: 0
                      });
                    }
                  } else {
                    throw uErr;
                  }
                } else {
                  throw uErr;
                }
              }

              if (userAddedOrExisted && effectiveProfile && effectiveProfile !== 'default') {
                try {
                  await client.querySafe(`${umPrefix}/user/create-and-activate-profile`, [
                    `=username=${item.voucherCode}`,
                    `=profile=${effectiveProfile}`,
                    `=customer=admin`
                  ], { rapid: true });
                } catch {}
              }
            } else {
              // RouterOS v7 User Manager
              const params: string[] = [
                `=name=${item.voucherCode}`,
                `=comment=ZCtrl|${item.batchId}|Price:${item.price || 0}|${item.createdAt}`
              ];
              if (!isNoPassword && passwordVal) {
                params.push(`=password=${passwordVal}`);
              }
              let userAddedOrExistedV7 = false;
              try {
                await client.query(`${umPrefix}/user/add`, params, { rapid: true });
                userAddedOrExistedV7 = true;
                synced++;
                syncedCodes.push(item.voucherCode);
              } catch (uErr: any) {
                const msg = (uErr?.message || '').toLowerCase();
                if (msg.includes('already have') || msg.includes('already exist')) {
                  const existing = await client.querySafe(`${umPrefix}/user/print`, [`?name=${item.voucherCode}`], { rapid: true });
                  if (Array.isArray(existing) && existing[0]?.['.id']) {
                    const existingUser = existing[0];
                    if (item.batchId && existingUser.comment && existingUser.comment.includes(item.batchId)) {
                      userAddedOrExistedV7 = true;
                      synced++;
                      syncedCodes.push(item.voucherCode);
                    } else {
                      failed++;
                      errors.push({
                        voucherCode: item.voucherCode,
                        error: 'المستخدم موجود مسبقاً في User Manager v7، تم الحفاظ على حسابه دون تعديل',
                        retryCount: 0
                      });
                    }
                  } else {
                    throw uErr;
                  }
                } else {
                  throw uErr;
                }
              }

              // Bind profile to user in RouterOS v7
              if (userAddedOrExistedV7 && effectiveProfile && effectiveProfile !== 'default') {
                try {
                  await client.querySafe(`${umPrefix}/user-profile/add`, [
                    `=user=${item.voucherCode}`,
                    `=profile=${effectiveProfile}`
                  ], { rapid: true });
                } catch {
                  // If user-profile/add is already assigned or alternative syntax
                  try {
                    await client.querySafe(`${umPrefix}/user/set`, [
                      `?name=${item.voucherCode}`,
                      `=group=${effectiveProfile}`
                    ], { rapid: true });
                  } catch {}
                }
              }
            }
          } else {
            // PPPoE Secrets
            const params: string[] = [
              `=name=${item.voucherCode}`,
              `=profile=${effectiveProfile}`,
              `=service=pppoe`,
              `=comment=ZCtrl|${item.batchId}|Price:${item.price || 0}|${item.createdAt}`
            ];
            if (!isNoPassword && passwordVal) {
              params.push(`=password=${passwordVal}`);
            }
            if (bytesTotal > 0) params.push(`=limit-bytes-total=${bytesTotal}`);
            if (timeParam) params.push(`=limit-uptime=${timeParam}`);
            
            try {
              await client.query('/ppp/secret/add', params, { rapid: true });
              synced++;
              syncedCodes.push(item.voucherCode);
            } catch (err: any) {
              const errMsg = (err?.message || '').toLowerCase();
              if (errMsg.includes('already have') || errMsg.includes('already exist')) {
                const existing = await client.querySafe('/ppp/secret/print', [`?name=${item.voucherCode}`], { rapid: true });
                if (Array.isArray(existing) && existing[0]?.['.id']) {
                  const existingUser = existing[0];
                  if (item.batchId && existingUser.comment && existingUser.comment.includes(item.batchId)) {
                    synced++;
                    syncedCodes.push(item.voucherCode);
                  } else {
                    failed++;
                    errors.push({
                      voucherCode: item.voucherCode,
                      error: 'المشترك موجود مسبقاً في PPPoE، تم الحفاظ على حسابه دون تعديل',
                      retryCount: 0
                    });
                  }
                } else {
                  throw err;
                }
              } else {
                throw err;
              }
            }
          }
        } catch (err: any) {
          failed++;
          errors.push({
            voucherCode: item.voucherCode,
            error: err.message || 'فشل الحقن في الراوتر',
            retryCount: 1
          });
        }
      }

      // تهدئة المعالج وحفظ استقرار راوتر المايكروتك وتفريغ ذاكرته ومنع التشنج
      if (i + BATCH_CHUNK < toSync.length) {
        const metrics = typeof client.getHardwareMetrics === 'function' ? client.getHardwareMetrics() : null;
        const isHighStress = metrics && (metrics.cpuLoad > 60 || metrics.isThermalStressed);
        const cooldownMs = isHighStress ? 250 : 80;
        await new Promise(resolve => setTimeout(resolve, cooldownMs));
      }
    }

    // التحقق التأكيدي النهائي من وجود الكروت فعلياً على المايكروتك الحقيقي
    if (syncedCodes.length > 0) {
      try {
        const sampleCode = syncedCodes[0];
        if (serviceType === 'HOTSPOT') {
          const sampleCheck = await client.querySafe('/ip/hotspot/user/print', ['.proplist=.id,name', `?name=${sampleCode}`], { rapid: true });
          if (!Array.isArray(sampleCheck) || sampleCheck.length === 0) {
            throw new Error(`فشل التحقق: لم يتم العثور على الكروت المحقونة على راوتر المايكروتك`);
          }
        } else if (serviceType === 'USERMAN') {
          const isV6 = client.isV6 ? client.isV6() : false;
          const umPrefix = isV6 ? '/tool/user-manager' : '/user-manager';
          const sampleCheck = await client.querySafe(`${umPrefix}/user/print`, [
            isV6 ? '.proplist=.id,username' : '.proplist=.id,name',
            isV6 ? `?username=${sampleCode}` : `?name=${sampleCode}`
          ], { rapid: true });
          if (!Array.isArray(sampleCheck) || sampleCheck.length === 0) {
            throw new Error(`فشل التحقق: لم يتم العثور على الكروت المحقونة في يوزر مانجر المايكروتك`);
          }
        } else if (serviceType === 'PPPOE') {
          const sampleCheck = await client.querySafe('/ppp/secret/print', ['.proplist=.id,name', `?name=${sampleCode}`], { rapid: true });
          if (!Array.isArray(sampleCheck) || sampleCheck.length === 0) {
            throw new Error(`فشل التحقق: لم يتم العثور على اشتراكات PPPoE على المايكروتك`);
          }
        }
      } catch (vErr: any) {
        if (vErr.message?.includes('فشل التحقق')) {
          throw vErr;
        }
      }
    }

    if (syncedCodes.length > 0) {
      voucherDb.markVouchersSynced(syncedCodes);
    }

    const durationMs = Date.now() - startTime;

    return {
      totalToSync: toSync.length,
      synced,
      failed,
      skipped,
      durationMs,
      errors
    };

  } finally {
    if (typeof client.setBatchSyncInProgress === 'function') {
      client.setBatchSyncInProgress(false);
    }
    release();
  }
}

/**
 * إزالة كروت من الراوتر لجميع الأنظمة (HOTSPOT / PPPOE / USERMAN)
 */
export async function removeVouchersFromRouter(
  client: any,
  voucherCodes: string[],
  serviceType: string = 'HOTSPOT'
): Promise<{ removed: number; failed: number; notFound: number }> {
  if (!client || typeof client.isConnected !== 'function' || !client.isConnected()) {
    throw new Error('الراوتر غير متصل');
  }

  const normalizedCodes = Array.from(
    new Set(voucherCodes.map((c) => String(c || '').trim()).filter(Boolean))
  );
  if (normalizedCodes.length === 0) {
    return { removed: 0, failed: 0, notFound: 0 };
  }

  const sType = String(serviceType || 'HOTSPOT').toUpperCase();
  const isV6 = typeof client.isV6 === 'function' ? client.isV6() : false;
  const umPrefix = isV6 ? '/tool/user-manager' : '/user-manager';

  const basePath =
    sType === 'PPPOE'
      ? '/ppp/secret'
      : sType === 'USERMAN'
      ? `${umPrefix}/user`
      : '/ip/hotspot/user';

  const proplist =
    sType === 'USERMAN'
      ? (isV6 ? '.proplist=.id,username,name' : '.proplist=.id,name,username')
      : '.proplist=.id,name';

  let removed = 0;
  let failed = 0;
  let notFound = 0;

  // Bulk fetch once to map voucher code -> RouterOS .id in O(N) instead of N sequential queries
  const idByCodeLower = new Map<string, string>();
  try {
    const existingList = await client.querySafe(`${basePath}/print`, [proplist], { rapid: true });
    if (Array.isArray(existingList)) {
      for (const item of existingList) {
        const idVal = item?.['.id'] || item?.id;
        const codeVal = item?.username || item?.name;
        if (idVal && codeVal) {
          idByCodeLower.set(String(codeVal).trim().toLowerCase(), String(idVal));
        }
      }
    }
  } catch {
    // Fall back to per-code lookup below if bulk print failed
  }

  for (let i = 0; i < normalizedCodes.length; i += 20) {
    const chunk = normalizedCodes.slice(i, i + 20);
    for (const code of chunk) {
      try {
        let targetId = idByCodeLower.get(code.toLowerCase());
        if (!targetId) {
          const queryField = sType === 'USERMAN' && isV6 ? `?username=${code}` : `?name=${code}`;
          const res = await client.querySafe(`${basePath}/print`, [queryField]);
          if (Array.isArray(res) && res.length > 0 && (res[0]['.id'] || res[0].id)) {
            targetId = String(res[0]['.id'] || res[0].id);
          }
        }

        if (targetId) {
          await client.querySafe(`${basePath}/remove`, [`=.id=${targetId}`]);
          removed++;
        } else {
          notFound++;
          removed++;
        }
      } catch {
        failed++;
      }
    }
    if (i + 20 < normalizedCodes.length) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return { removed, failed, notFound };
}
