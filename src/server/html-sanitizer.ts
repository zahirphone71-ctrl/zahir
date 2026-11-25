// ============================================================
//  تعقيم HTML وحماية XSS مع الحفاظ على متغيرات المايكروتك
//  + فحص صياغة خاص بصفحات الهوتسبوت
// ============================================================

export function sanitizeHotspotHtml(input: string): { sanitized: string; warnings: string[] } {
  const warnings: string[] = [];
  let result = input;

  // ----- حماية متغيرات المايكروتك -----
  const protectedVars: string[] = [];
  result = result.replace(/\$\(([^)]+)\)/g, (match) => {
    protectedVars.push(match);
    return `__MTVP_${protectedVars.length - 1}__`;
  });

  // ----- إزالة javascript: من الروابط -----
  result = result.replace(
    /\b(?:href|src|action|formaction|data|poster)\s*=\s*["']?\s*javascript\s*:/gi,
    (match) => {
      warnings.push(`تمت إزالة بروتوكول خطر: ${match.substring(0, 50)}`);
      return match.replace(/javascript\s*:/gi, '#removed:');
    }
  );

  // ----- إزالة on* عدا onsubmit -----
  result = result.replace(
    /\b(on\w+)\s*=\s*["']([^"']*?)["']/gi,
    (match, eventName, value) => {
      if (eventName.toLowerCase() === 'onsubmit') return match;
      warnings.push(`تمت إزالة معالج: ${eventName}`);
      return '';
    }
  );

  // ----- إزالة بروتوكولات خطرة -----
  const dangerousProtos = ['data:text/html', 'vbscript:', 'blob:'];
  for (const proto of dangerousProtos) {
    const escaped = proto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    if (regex.test(result)) {
      result = result.replace(regex, '#removed:');
      warnings.push(`تمت إزالة بروتوكول: ${proto}`);
    }
  }

  // ----- إزالة iframe الخارجية -----
  result = result.replace(
    /<iframe\s+[^>]*src\s*=\s*["']https?:\/\/[^"']+["'][^>]*\/?\s*>/gi,
    () => {
      warnings.push('تمت إزالة iframe خارجي');
      return '';
    }
  );

  // ----- إزالة تعليقات IE الشرطية -----
  result = result.replace(/<!--\s*\[if\s[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, () => {
    warnings.push('تمت إزالة تعليق شرطي IE');
    return '';
  });

  // ----- إزالة أحرف التحكم -----
  result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // ----- استعادة متغيرات المايكروتك -----
  protectedVars.forEach((original, idx) => {
    result = result.replace(`__MTVP_${idx}__`, original);
  });

  return { sanitized: result, warnings };
}

export function quickSecurityCheck(html: string): { isSafe: boolean; issues: string[]; severity: 'critical' | 'high' | 'medium' | 'low' } {
  const issues: string[] = [];
  let severity: 'critical' | 'high' | 'medium' | 'low' = 'low';

  if (/\bhref\s*=\s*["']javascript:/i.test(html)) {
    issues.push('javascript: في رابط — خطر XSS');
    severity = 'critical';
  }
  if (/<script[^>]*src\s*=\s*["']https?:\/\//i.test(html)) {
    issues.push('سكربت خارجي محمّل');
    severity = 'high';
  }
  if (/<iframe[^>]+src\s*=\s*["']https?:\/\//i.test(html)) {
    issues.push('iframe خارجي — Clickjacking');
    severity = 'high';
  }
  if (/\bdocument\.(cookie|domain|write)/i.test(html)) {
    issues.push('document.cookie — سرقة الجلسة');
    severity = 'critical';
  }
  if (/\bXMLHttpRequest\b|\bfetch\s*\(/i.test(html)) {
    issues.push('طلب HTTP من الصفحة');
    severity = 'medium';
  }
  if (/eval\s*\(/i.test(html)) {
    issues.push('eval() — تنفيذ عشوائي');
    severity = 'critical';
  }
  if (/\bWebSocket\b/i.test(html)) {
    issues.push('WebSocket — اتصال خارجي');
    severity = 'high';
  }

  return { isSafe: issues.length === 0, issues, severity };
}

// ============================================================
//  فحص صياغة خاص بصفحات الهوتسبوت
// ============================================================

export interface ValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  fixSuggestion?: string;
}

export function validateHotspotFile(html: string, fileName: string): {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  // ----- فحوصات خاصة بـ login.html -----
  if (fileName === 'login.html' || fileName === 'login.htm') {
    // وجود النموذج
    if (!/<form[^>]*>/i.test(html)) {
      errors.push({
        code: 'NO_FORM',
        message: 'login.html لا يحتوي على وسم <form>',
        severity: 'error',
        fixSuggestion: 'أضف نموذجاً مع الإجراء الصحيح',
      });
    }
    // وجود حقل اسم المستخدم
    if (!/<input[^>]*name\s*=\s*["']username["'][^>]*>/i.test(html)) {
      errors.push({
        code: 'NO_USERNAME_FIELD',
        message: 'لا يوجد حقل اسم مستخدم (name="username")',
        severity: 'error',
        fixSuggestion: 'أضف <input name="username" type="text">',
      });
    }
    // وجود حقل كلمة المرور
    if (!/<input[^>]*name\s*=\s*["']password["'][^>]*>/i.test(html)) {
      errors.push({
        code: 'NO_PASSWORD_FIELD',
        message: 'لا يوجد حقل كلمة مرور (name="password")',
        severity: 'error',
        fixSuggestion: 'أضف <input name="password" type="password">',
      });
    }
    // وجود حقل dst
    if (!/<input[^>]*name\s*=\s*["']dst["'][^>]*>/i.test(html) && !/\$\(link-login\)/i.test(html)) {
      warnings.push({
        code: 'NO_DST_FIELD',
        message: 'قد لا يعمل التوجيه بدون حقل dst أو متغير $(link-login)',
        severity: 'warning',
        fixSuggestion: 'أضف <input name="dst" value="$(link-orig)">',
      });
    }
    // فحص متغيرات العرض
    if (!/\$\(error\)/i.test(html)) {
      info.push({
        code: 'NO_ERROR_VAR',
        message: 'لا يوجد متغير لعرض الأخطاء $(error)',
        severity: 'info',
        fixSuggestion: 'أضف: <span>$(error)</span>',
      });
    }
    // فحص meta viewport
    if (!/<meta[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(html)) {
      warnings.push({
        code: 'NO_VIEWPORT',
        message: 'يفتقر إلى meta viewport — قد لا يظهر بشكل جيد على الهواتف',
        severity: 'warning',
        fixSuggestion: 'أضف <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      });
    }
  }

  // ----- فحوصات خاصة بـ status.html -----
  if (fileName === 'status.html' || fileName === 'status.htm') {
    if (!/\$\(link-logout\)/i.test(html)) {
      warnings.push({
        code: 'NO_LOGOUT_LINK',
        message: 'status.html لا يحتوي على رابط تسجيل الخروج $(link-logout)',
        severity: 'warning',
        fixSuggestion: 'أضف <a href="$(link-logout)">تسجيل الخروج</a>',
      });
    }
  }

  // ----- فحوصات خاصة بـ logout.html -----
  if (fileName === 'logout.html' || fileName === 'logout.htm') {
    if (!/<a[^>]*href\s*=\s*["']\$\(link-login-only\)["'][^>]*>/i.test(html)) {
      warnings.push({
        code: 'NO_RETURN_LINK',
        message: 'logout.html لا يحتوي على رابط العودة لتسجيل الدخول',
        severity: 'warning',
        fixSuggestion: 'أضف: <a href="$(link-login-only)">العودة لتسجيل الدخول</a>',
      });
    }
  }

  // ----- فحوصات خاصة بـ error.html -----
  if (fileName === 'error.html' || fileName === 'error.htm') {
    if (!/<a[^>]*href\s*=\s*["']\$\(link-login-only\)["'][^>]*>/i.test(html)) {
      warnings.push({
        code: 'NO_RETURN_LINK_ERROR',
        message: 'error.html لا يحتوي على رابط العودة لتسجيل الدخول',
        severity: 'warning',
        fixSuggestion: 'أضف: <a href="$(link-login-only)">العودة لتسجيل الدخول</a>',
      });
    }
  }

  // ----- فحوصات خاصة بـ redirect.html -----
  if (fileName === 'redirect.html') {
    if (!/\$\(link-redirect\)/i.test(html) && !/\$\(link-orig\)/i.test(html)) {
      warnings.push({
        code: 'NO_REDIRECT_TARGET',
        message: 'redirect.html لا يحتوي على رابط التوجيه',
        severity: 'warning',
      });
    }
  }

  // ----- فحوصات عامة -----
  if (html.charCodeAt(0) === 0xfeff) {
    errors.push({
      code: 'HAS_BOM',
      message: 'الملف يبدأ بـ BOM — سيظهر كحروف غريبة على الراوتر',
      severity: 'error',
      fixSuggestion: 'أعد حفظ الملف بترميز UTF-8 بدون BOM',
    });
  }

  const firstChar = html.charCodeAt(0);
  if (firstChar !== 0x3c && firstChar !== 0xef && firstChar !== 0xfeff && firstChar !== 0x0a && firstChar !== 0x0d && firstChar !== 0x20 && firstChar !== 0x09) {
    warnings.push({
      code: 'UNEXPECTED_FIRST_CHAR',
      message: `الحرف الأول غير متوقع (${firstChar}) — يُتوقع '<'`,
      severity: 'warning',
    });
  }

  if (!/<\/html>/i.test(html)) {
    warnings.push({
      code: 'MISSING_CLOSING_HTML',
      message: 'لا يوجد وسم </html> إغلاق',
      severity: 'warning',
    });
  }

  return { isValid: errors.length === 0, errors, warnings, info };
}
