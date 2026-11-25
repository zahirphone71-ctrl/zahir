// ============================================================
// تحقق من صحة SSID - إصلاح 5
// يمنع: الأحرف الخطرة، الحقن، الطول الزائد، المسافات
// ============================================================

export interface SsidValidationResult {
  valid: boolean;
  error: string | null;
}

export function validateSsid(ssid: string, fieldName: string = 'SSID'): SsidValidationResult {
  if (!ssid || typeof ssid !== 'string') {
    return { valid: false, error: `${fieldName} مطلوب ولا يمكن أن يكون فارغاً` };
  }

  const trimmed = ssid.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `${fieldName} لا يمكن أن يكون مسافات فقط` };
  }

  if (trimmed.length > 32) {
    return { valid: false, error: `${fieldName} طويل جداً (${trimmed.length}/32 حرف). حد 802.11 هو 32 حرفاً UTF-8` };
  }

  // لا يبدأ أو ينتهي بمسافة
  if (ssid !== trimmed) {
    return { valid: false, error: `${fieldName} لا يبدأ أو ينتهي بمسافة` };
  }

  // أحرف ممنوعة تماماً (قد تسبب مشاكل في واجهات CGI القديمة أو حقن أوامر)
  // ; | & ` $ ( ) < > { } [ ] \ ' " = + ! # ^ ~ @
  const dangerous = /[;"|&`$()<>\{\}\[\]\\'=+!#^~@]/;
  if (dangerous.test(ssid)) {
    const matched = ssid.match(dangerous)?.[0] || '';
    return {
      valid: false,
      error: `${fieldName} يحتوي على أحرف غير مسموحة: ${matched}. الأحرف المسموحة: أرقام، حروف إنجليزية، عربية، مسافة، - _ .`
    };
  }

  // تحكم إضافي: لا يُسمح بـ NUL أو أحرف التحكم
  if (/[\x00-\x1F\x7F]/.test(ssid)) {
    return { valid: false, error: `${fieldName} يحتوي على أحرف تحكم غير مسموحة` };
  }

  return { valid: true, error: null };
}

/** تحقق من عدة حقول SSID دفعة واحدة */
export function validateSsidRequest(req: { ssid?: string; ssid2g?: string; ssid5g?: string }): SsidValidationResult {
  if (req.ssid) {
    const r = validateSsid(req.ssid, 'SSID');
    if (!r.valid) return r;
  }
  if (req.ssid2g) {
    const r = validateSsid(req.ssid2g, 'SSID 2.4GHz');
    if (!r.valid) return r;
  }
  if (req.ssid5g) {
    const r = validateSsid(req.ssid5g, 'SSID 5GHz');
    if (!r.valid) return r;
  }
  if (!req.ssid && !req.ssid2g && !req.ssid5g) {
    return { valid: false, error: 'يجب تحديد SSID واحد على الأقل' };
  }
  return { valid: true, error: null };
}
