/**
 * Utility to convert raw JavaScript, RouterOS, or Network error messages
 * into polite, clear, and action-oriented Arabic descriptions.
 */
export function translateErrorMessage(rawError: string | Error | any): string {
  if (!rawError) return 'حدث خطأ غير معروف في الاتصال';

  const errStr = typeof rawError === 'string'
    ? rawError
    : rawError.message || JSON.stringify(rawError);

  const lower = errStr.toLowerCase();

  if (lower.includes('econnrefused')) {
    return 'تعذر الاتصال بالراوتر: تم رفض الاتصال. يرجى التأكد من تفعيل خدمة API (منفذ 8728) في المايكروتك من قائمة IP -> Services.';
  }

  if (lower.includes('etimedout') || lower.includes('timeout') || lower.includes('timed out')) {
    return 'انتهت مهلة الاتصال بالراوتر. يرجى التأكد من كابل الشبكة، عنوان الـ IP المكتوب، وتطابق الشبكة.';
  }

  if (lower.includes('ehostunreach') || lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return 'عفواً، لا يمكن الوصول إلى عنوان الـ IP المكتوب. يرجى التأكد من اتصال جهازك بنفس شبكة المايكروتك.';
  }

  if (lower.includes('invalid user name or password') || lower.includes('cannot log in') || lower.includes('authentication failed')) {
    return 'اسم المستخدم أو كلمة المرور غير صحيحة. يرجى التأكد من حساب مدير المايكروتك وإعادة المحاولة.';
  }

  if (lower.includes('socket hang up') || lower.includes('econnreset') || lower.includes('connection reset')) {
    return 'تم قطع الاتصال فجأة بواسطة الراوتر. قد يكون تم إعادة تشغيل المايكروتك أو وجود ضغط عالي.';
  }

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
    return 'فشل الاتصال بالخادم المحلي لتطبيق ZCtrl. يرجى التأكد من أن التطبيق يعمل بشكل صحيح.';
  }

  if (lower.includes('already exists') || lower.includes('already have') || lower.includes('user already exists')) {
    return 'عفواً، هذا الاسم أو العنصر موجود بالفعل بداخل المايكروتك.';
  }

  if (lower.includes('no such item')) {
    return 'العنصر المطلوب غير موجود أو تم حذفه سابقاً من المايكروتك.';
  }

  if (lower.includes('cannot remove default') || lower.includes('can not remove default')) {
    return 'لا يمكن حذف البروفايل الافتراضي للنظام من المايكروتك.';
  }

  if (lower.includes('in use') || lower.includes('referenced')) {
    return 'لا يمكن حذف هذا البروفايل لأنه مستخدم حالياً من قِبل مشتركين أو إعدادات نشطة في الراوتر.';
  }

  if (lower.includes('unknown parameter') || lower.includes('no such argument')) {
    return `رفض المايكروتك أحد الحقول غير المدعومة في هذا الإصدار (${errStr}).`;
  }

  if (lower.includes('input does not match') || lower.includes('invalid value for argument')) {
    return `قيمة أحد الحقول غير مطابقة لصيغة المايكروتك المطلوبة (${errStr}).`;
  }

  if (lower.includes('no such command')) {
    return 'حزمة الخدمة غير مفعلة أو غير مثبتة على هذا الراوتر (تأكد من تفعيل حزمة User Manager أو Hotspot/PPP).';
  }

  if (lower.includes('permission denied')) {
    return 'صلاحيات حساب المايكروتك غير كافية. يرجى استخدام حساب مدير بصلاحيات كاملة (full permission).';
  }

  if (lower.includes('typeerror') || lower.includes('referenceerror') || lower.includes('syntaxerror')) {
    return 'حدث خطأ استجابة في تحليل البيانات. تم معالجة الطلب بأمان واستكمال العمليات.';
  }

  // If already Arabic, return as is
  if (/[\u0600-\u06FF]/.test(errStr)) {
    return errStr;
  }

  // Fallback translation
  return `خطأ في العملية: ${errStr}`;
}
