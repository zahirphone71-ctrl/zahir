export class ErrorTranslator {
  static translate(error: any): string {
    const msg = String(error?.message || error || '').toLowerCase();

    if (msg.includes('already have') || msg.includes('already exists') || msg.includes('duplicate')) {
      return 'البروفايل موجود مسبقاً بنفس الاسم في المايكروتك';
    }
    if (msg.includes('no such item') || msg.includes('not found') || msg.includes('item with such id')) {
      return 'البروفايل غير موجود أو تم حذفه سابقاً من المايكروتك';
    }
    if (msg.includes('invalid') || msg.includes('value of')) {
      return 'قيمة غير صالحة في أحد الحقول — يرجى التحقق من صيغ السرعات والمهلات';
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return 'انتهت مهلة استجابة المايكروتك — تحقق من اتصال الشبكة بالراوتر';
    }
    if (msg.includes('permission') || msg.includes('denied') || msg.includes('unauthorized')) {
      return 'حساب المايكروتك لا يملك صلاحيات تعديل البروفايلات (مطلوب write policy)';
    }
    if (msg.includes('connect') || msg.includes('econnrefused') || msg.includes('ehostunreach')) {
      return 'فشل الاتصال بالمايكروتك — تحقق من جودة العنوان والمنفذ المباشر';
    }
    if (msg.includes('cannot remove') || msg.includes('in use') || msg.includes('referenced')) {
      return 'لا يمكن حذف البروفايل — هناك مستخدمون مرنبطون به حالياً بالشبكة';
    }
    if (msg.includes('cpu') || msg.includes('overload') || msg.includes('busy')) {
      return 'معالج الراوتر تحت ضغط عالٍ — تم تأجيل العملية لحماية الخدمة';
    }

    return `خطأ المايكروتك: ${error?.message || 'تعذر معالجة الطلب'}`;
  }
}
