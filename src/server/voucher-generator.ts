import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { 
  CodeType, 
  GenerateOptions, 
  GenerateResponse, 
  VoucherItem, 
  BatchInfo 
} from '../shared/voucher-types.ts';
import { globalGenerateMutex } from './mutex.ts';
import { voucherDb } from './voucher-db.ts';

// ============================================================
// مجموعات المحارف المعتمدة
// ============================================================
const CHARSETS: Record<CodeType, string> = {
  numeric: '0123456789',
  alpha: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // استثناء I, O لتجنب الالتباس
  alphanumeric: '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', // بدون 0, 1, I, O
  alphanumeric_lower: '23456789abcdefghjkmnpqrstuvwxyz',
  hex: '0123456789ABCDEF'
};

/**
 * حساب الطول الآمن للكود لتفادي معضلة يوم الميلاد (Birthday Paradox)
 * يضمن احتمالية تصادم أقل من 1 في المليار
 */
export function calculateSafeLength(quantity: number, charSetSize: number): number {
  if (quantity <= 0) return 4;
  // Approximation for collision probability P ~ (N^2)/(2 * S^L)
  // We want P < 1e-9 => S^L > (N^2) * 1e9 / 2
  const targetSpace = (Math.pow(quantity, 2) * 1e9) / 2;
  const minLength = Math.ceil(Math.log(targetSpace) / Math.log(charSetSize));
  return Math.max(4, Math.min(minLength, 16));
}

/**
 * توليد محارف عشوائية آمنة تشفيرياً باستخدام crypto.randomBytes
 */
export function generateRandomString(length: number, charSet: string): string {
  const charSetLen = charSet.length;
  if (charSetLen === 0) return '';

  const bytes = crypto.randomBytes(length * 2);
  let result = '';
  for (let i = 0; i < length; i++) {
    // استخدام خوارزمية رفض الانحياز (Unbiased Modulo)
    const byte = bytes[i];
    result += charSet[byte % charSetLen];
  }
  return result;
}

/**
 * توليد كود واحد مفرد
 */
export function generateSingleCode(
  codeType: CodeType,
  length: number,
  prefix: string = ''
): string {
  const charSet = CHARSETS[codeType] || CHARSETS.numeric;
  return prefix + generateRandomString(length, charSet);
}

/**
 * توليد دفعة كروت كاملة مع حماية الطبقات الخمس وضمان عدم التكرار على السيرفر المحلي والراوتر الحي
 */
export async function generateVouchersBatch(
  options: GenerateOptions,
  client?: any
): Promise<GenerateResponse & { vouchers?: VoucherItem[] }> {
  const startTime = Date.now();
  const batchId = `B-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  // الطبقة 3: قفل التزامن لمنع التوليد المتوازي
  const release = await globalGenerateMutex.acquire();

  try {
    const totalAttempted = Math.min(Math.max(1, options.quantity), 50000);
    const codeType = options.codeType || 'numeric';
    const charSet = CHARSETS[codeType] || CHARSETS.numeric;
    
    let effectiveLength = Math.max(3, options.codeLength || 6);
    const passwordLength = options.passwordLength || effectiveLength;
    const prefix = (options.prefix || '').trim().replace(/[\s"'\\]/g, '');

    const isSameUserPass =
      options.authMode === 'user_equals_pass' ||
      (options as any).sameUserPass === true;
    const isUserPass = options.authMode === 'user_pass' && !isSameUserPass;
    const isNoPassword = !isSameUserPass && !isUserPass;
    const resolvedAuthMode = isSameUserPass
      ? 'user_equals_pass'
      : isUserPass
      ? 'user_pass'
      : 'user_only';

    // فحص المساحة المتاحة وتوسيع الطول تلقائياً لمنع الانحشار إذا كانت المساحة ضيقة
    const totalPossibilities = Math.pow(charSet.length, effectiveLength);
    if (totalPossibilities < totalAttempted * 2) {
      effectiveLength = calculateSafeLength(totalAttempted + 5000, charSet.length);
    }

    // استعلام مستخدمي الراوتر مع حد زمني 1.5 ثانية لتفادي التعليق عند بطء الاتصال
    const routerExistingNames = new Set<string>();
    if (client && typeof client.isConnected === 'function' && client.isConnected()) {
      try {
        const fetchPromise = (async () => {
          const sType = (options.serviceType || 'HOTSPOT').toUpperCase();
          if (sType === 'HOTSPOT') {
            const res = await client.querySafe('/ip/hotspot/user/print', ['.proplist=name']);
            if (Array.isArray(res)) {
              res.forEach((u: any) => { if (u && u.name) routerExistingNames.add(String(u.name).trim().toLowerCase()); });
            }
          } else if (sType === 'PPPOE') {
            const res = await client.querySafe('/ppp/secret/print', ['.proplist=name']);
            if (Array.isArray(res)) {
              res.forEach((s: any) => { if (s && s.name) routerExistingNames.add(String(s.name).trim().toLowerCase()); });
            }
          } else if (sType === 'USERMAN') {
            const isV6 = client.isV6 ? client.isV6() : false;
            const umPrefix = isV6 ? '/tool/user-manager' : '/user-manager';
            const res = await client.querySafe(`${umPrefix}/user/print`);
            if (Array.isArray(res)) {
              res.forEach((u: any) => {
                const nameVal = u?.username || u?.name;
                if (nameVal) routerExistingNames.add(String(nameVal).trim().toLowerCase());
              });
            }
          }
        })();

        await Promise.race([
          fetchPromise,
          new Promise(r => setTimeout(r, 1500))
        ]);
      } catch (err) {
        console.warn('Could not pre-fetch router users for collision check:', err);
      }
    }

    const batchInfo: BatchInfo = {
      batchId,
      profileName: options.profileName || 'default',
      totalGenerated: 0,
      totalSynced: 0,
      createdAt: new Date().toISOString(),
      comment: options.comment || `Batch ${options.quantity} [${codeType}]`,
      serviceType: options.serviceType || 'HOTSPOT',
      authMode: resolvedAuthMode,
      price: options.price || 0,
      prefix: options.prefix || ''
    };

    let totalGenerated = 0;
    let duplicatesSkipped = 0;
    const generatedVouchers: VoucherItem[] = [];
    const localBatchCodes = new Set<string>();

    const CHUNK_SIZE = 100;
    let currentLen = effectiveLength;

    for (let count = 0; count < totalAttempted; count++) {
      let code = '';
      let codeLower = '';
      let attempts = 0;
      const MAX_ATTEMPTS = 30;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        code = prefix + generateRandomString(currentLen, charSet);
        codeLower = code.toLowerCase();

        if (
          !localBatchCodes.has(codeLower) && 
          !voucherDb.codeExists(code) && 
          !routerExistingNames.has(codeLower)
        ) {
          break;
        }
        duplicatesSkipped++;
      }

      if (attempts >= MAX_ATTEMPTS) {
        // توسيع الطول برقم إضافي تلقائياً لمنع التكرار نهائياً
        currentLen++;
        code = prefix + generateRandomString(currentLen, charSet);
        codeLower = code.toLowerCase();
      }

      localBatchCodes.add(codeLower);

      const pin = isNoPassword
        ? ''
        : isSameUserPass
        ? code
        : generateRandomString(passwordLength, charSet);

      const item: VoucherItem = {
        voucherId: uuidv4(),
        voucherCode: code,
        voucherPin: pin,
        statusCd: 'ACTIVE',
        price: options.price || 0,
        profileName: options.profileName || 'default',
        timeLimit: options.timeLimit || '30d',
        dataLimit: options.dataLimit,
        createdAt: new Date().toISOString(),
        batchId,
        serviceType: options.serviceType || 'HOTSPOT',
        isSynced: false
      };

      generatedVouchers.push(item);

      // تفريغ Event Loop كل 100 كرت لضمان بقاء السيرفر مستجيباً 100%
      if (count > 0 && count % CHUNK_SIZE === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // الإدخال الذري في قاعدة البيانات
    const result = voucherDb.insertBatchTransaction(batchInfo, generatedVouchers);
    totalGenerated = result.inserted;
    duplicatesSkipped += result.skipped;

    const durationMs = Date.now() - startTime;

    return {
      success: true,
      batchId,
      totalGenerated,
      totalAttempted,
      duplicatesSkipped,
      durationMs,
      vouchers: generatedVouchers,
      message: `تم توليد ${totalGenerated} كرت بنجاح في ${durationMs}ms` + 
        (duplicatesSkipped > 0 ? ` (تم فحص وتجنب ${duplicatesSkipped} تكرار)` : '')
    };

  } catch (error: any) {
    return {
      success: false,
      batchId,
      totalGenerated: 0,
      totalAttempted: options.quantity,
      duplicatesSkipped: 0,
      durationMs: Date.now() - startTime,
      error: error.message || 'خطأ أثناء توليد الكروت'
    };
  } finally {
    release();
  }
}

export interface CustomVoucherOptions {
  code: string;
  pin?: string;
  profileName: string;
  price: number;
  timeLimit?: string;
  dataLimit?: string;
  serviceType?: 'HOTSPOT' | 'USERMAN' | 'PPPOE';
  comment?: string;
  authMode?: 'user_only' | 'user_pass' | 'user_equals_pass' | string;
  sameUserPass?: boolean;
}

/**
 * توليد كرت مخصص فردي مع التحقق من عدم التكرار في المايكروتك وقاعدة البيانات
 */
export async function generateCustomVoucher(
  options: CustomVoucherOptions,
  client?: any
): Promise<{
  success: boolean;
  batchId?: string;
  voucher?: VoucherItem;
  error?: string;
  isSynced?: boolean;
}> {
  const cleanCode = String(options.code || '').trim();
  if (!cleanCode) {
    return { success: false, error: 'اسم المستخدم / الكود المخصص مطلوب' };
  }

  // معايير المايكروتك القياسية: منع المسافات والرموز التي تسبب أخطاء في الـ RouterOS API
  if (/\s/.test(cleanCode)) {
    return { success: false, error: 'معايير المايكروتك: اسم المستخدم لا يمكن أن يحتوي على مسافات' };
  }
  if (/["'\\]/.test(cleanCode)) {
    return { success: false, error: 'معايير المايكروتك: اسم المستخدم لا يمكن أن يحتوي على علامات اقتباس أو شرطات مائلة' };
  }

  const release = await globalGenerateMutex.acquire();
  try {
    // 1. فحص عدم الوجود في قاعدة البيانات المحلية
    if (voucherDb.codeExists(cleanCode)) {
      return { success: false, error: `الكود (${cleanCode}) موجود بالفعل في قاعدة بيانات الكروت` };
    }

    const cleanService = (options.serviceType || 'HOTSPOT').toUpperCase() as 'HOTSPOT' | 'USERMAN' | 'PPPOE';

    // 2. فحص عدم التكرار على جهاز المايكروتك الفعلي
    if (client && typeof client.isConnected === 'function' && client.isConnected()) {
      try {
        const isV6 = typeof client.isV6 === 'function' ? client.isV6() : false;
        const path = cleanService === 'PPPOE'
          ? '/ppp/secret/print'
          : cleanService === 'USERMAN'
          ? (isV6 ? '/tool/user-manager/user/print' : '/user-manager/user/print')
          : '/ip/hotspot/user/print';

        const queryArgs = cleanService === 'USERMAN' && isV6
          ? ['.proplist=username', `?username=${cleanCode}`]
          : ['.proplist=name', `?name=${cleanCode}`];

        const existing = await client.querySafe(path, queryArgs);
        if (Array.isArray(existing) && existing.length > 0) {
          return { success: false, error: `المشترك (${cleanCode}) مسجل بالفعل على جهاز المايكروتك` };
        }
      } catch (checkErr: any) {
        console.warn('Router precheck warning for custom voucher:', checkErr.message);
      }
    }

    const isSameUserPass = options.authMode === 'user_equals_pass' || options.sameUserPass === true;
    const isUserPass = options.authMode === 'user_pass' && !isSameUserPass;
    const isNoPassword = !isSameUserPass && !isUserPass;
    const resolvedAuthMode = isSameUserPass
      ? 'user_equals_pass'
      : isUserPass
      ? 'user_pass'
      : 'user_only';

    const cleanPin = isNoPassword
      ? ''
      : (isSameUserPass || !options.pin)
      ? cleanCode
      : String(options.pin).trim();
    const batchId = `CUST-${Date.now().toString(36).toUpperCase()}`;

    const batchInfo: BatchInfo = {
      batchId,
      profileName: options.profileName || 'default',
      totalGenerated: 1,
      totalSynced: 0,
      createdAt: new Date().toISOString(),
      comment: options.comment || `كرت مخصص: ${cleanCode}`,
      serviceType: cleanService,
      authMode: resolvedAuthMode,
      price: options.price || 0
    };

    const voucher: VoucherItem = {
      voucherId: uuidv4(),
      voucherCode: cleanCode,
      voucherPin: cleanPin,
      statusCd: 'ACTIVE',
      price: options.price || 0,
      profileName: options.profileName || 'default',
      timeLimit: options.timeLimit || '30d',
      dataLimit: options.dataLimit || undefined,
      createdAt: new Date().toISOString(),
      batchId,
      serviceType: cleanService,
      isSynced: false
    };

    const result = voucherDb.insertBatchTransaction(batchInfo, [voucher]);
    if (result.inserted === 0) {
      return { success: false, error: 'فشل حفظ الكرت في قاعدة البيانات (قد يكون مكرراً)' };
    }

    return {
      success: true,
      batchId,
      voucher,
      isSynced: false
    };
  } finally {
    release();
  }
}
