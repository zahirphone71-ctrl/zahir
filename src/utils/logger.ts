import { safeStorage } from './safeStorage';

export interface LogEntry {
  id: string;
  timestamp: string;
  isoTime: string;
  level: 'error' | 'warn' | 'info';
  context: string;
  message: string;
  arabicSummary: string;
  suggestion?: string;
  stack?: string;
  metadata?: Record<string, any>;
}

const MAX_LOG_ENTRIES = 150;
const STORAGE_KEY = 'zctrl_system_error_logs';

class SilentLogger {
  private logs: LogEntry[] = [];
  private listeners: Array<(logs: LogEntry[]) => void> = [];
  private initialized = false;

  constructor() {
    this.hydrateFromStorage();
    this.setupGlobalHandlers();
  }

  private hydrateFromStorage() {
    if (this.initialized) return;
    try {
      const stored = safeStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.logs = parsed.slice(-MAX_LOG_ENTRIES);
        }
      }
    } catch {
      this.logs = [];
    }
    this.initialized = true;
  }

  private persist() {
    try {
      safeStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs.slice(-MAX_LOG_ENTRIES)));
    } catch (err) {
      console.warn('[ZCtrl Logger] Failed to persist log entries:', err);
    }
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn(this.logs);
      } catch (err) {
        console.warn('[ZCtrl Logger] Listener callback failed:', err);
      }
    });
  }

  private setupGlobalHandlers() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      // Prevent browser freeze from uncaught exceptions
      this.error(
        event.error || event.message,
        'Window:GlobalError',
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      );
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.error(
        event.reason,
        'Promise:UnhandledRejection',
        { type: 'unhandled_promise_rejection' }
      );
    });
  }

  public translateToFriendlyArabic(errOrMsg: any): { summary: string; suggestion: string } {
    const raw = String(errOrMsg?.message || errOrMsg || '').toLowerCase();

    if (raw.includes('econnrefused') || raw.includes('connection refused')) {
      return {
        summary: 'تعذر الاتصال بمنفذ المايكروتك (Connection Refused)',
        suggestion: 'تأكد من تفعيل خدمة API في الراوتر: IP > Services > api (منفذ 8728) وسمح لعنوان جهازك بالدخول.'
      };
    }
    if (raw.includes('etimedout') || raw.includes('timeout') || raw.includes('timed out')) {
      return {
        summary: 'تجاوز مهلة انتظار رد الراوتر (Connection Timeout)',
        suggestion: 'الراوتر بطيء الاستجابة أو أن هناك ضغط شبكة. تم تفعيل نظام إعادة المحاولة الهادئ تلقائياً دون إغلاق الجلسة.'
      };
    }
    if (raw.includes('socket hang up') || raw.includes('econnreset') || raw.includes('closed the connection')) {
      return {
        summary: 'تمت إعادة تهيئة مقبس الاتصال من الراوتر (Connection Reset)',
        suggestion: 'قام الراوتر بقطع المقبس مؤقتاً؛ يقوم النظام بإعادة الاتصال التلقائي الصامت فورياً.'
      };
    }
    if (raw.includes('unauthorized') || raw.includes('login failure') || raw.includes('cannot log in')) {
      return {
        summary: 'فشل المصادقة أو انتهاء صلاحية جلسة الراوتر',
        suggestion: 'تحقق من صحة اسم المستخدم وكلمة المرور وصلاحيات المجموعة (full/write) في المايكروتك.'
      };
    }
    if (raw.includes('already have user') || raw.includes('already exist') || raw.includes('duplicate')) {
      return {
        summary: 'العنصر أو المستخدم موجود مسبقاً في سجلات الراوتر',
        suggestion: 'تم تخطي العنصر أو تحديثه تلقائياً لضمان عدم تكرار البيانات أو حدوث تضارب.'
      };
    }
    if (raw.includes('out of memory') || raw.includes('heap')) {
      return {
        summary: 'استهلاك مرتفع للذاكرة المحلية',
        suggestion: 'تم تفعيل التمرير الافتراضي (Virtual Scrolling) وتفريغ الكاش لتحرير الرام فوراً.'
      };
    }

    return {
      summary: 'حدث استثناء أثناء تنفيذ العملية',
      suggestion: 'تم حماية الواجهة بنجاح من الانهيار، ويمكنك متابعة العمل بشكل طبيعي.'
    };
  }

  public error(err: any, context = 'App', metadata?: Record<string, any>) {
    const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown error');
    const stack = err instanceof Error ? err.stack : undefined;
    const { summary, suggestion } = this.translateToFriendlyArabic(err);

    const entry: LogEntry = {
      id: `err-${Date.now()}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : this.logs.length}`,
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      isoTime: new Date().toISOString(),
      level: 'error',
      context,
      message: rawMessage,
      arabicSummary: summary,
      suggestion,
      stack,
      metadata
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }

    this.persist();
    this.notify();

    // Still log to dev console for debugging in dev mode
    console.warn(`[ZCtrl:Shield] Intercepted in ${context}:`, rawMessage);
    return entry;
  }

  public warn(msg: string, context = 'App', metadata?: Record<string, any>) {
    const entry: LogEntry = {
      id: `warn-${Date.now()}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : this.logs.length}`,
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      isoTime: new Date().toISOString(),
      level: 'warn',
      context,
      message: msg,
      arabicSummary: msg,
      metadata
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }

    this.persist();
    this.notify();
    return entry;
  }

  public info(msg: string, context = 'App') {
    const entry: LogEntry = {
      id: `info-${Date.now()}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : this.logs.length}`,
      timestamp: new Date().toLocaleTimeString('ar-SA'),
      isoTime: new Date().toISOString(),
      level: 'info',
      context,
      message: msg,
      arabicSummary: msg
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }

    this.persist();
    this.notify();
    return entry;
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    safeStorage.removeItem(STORAGE_KEY);
    this.notify();
  }

  public subscribe(fn: (logs: LogEntry[]) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  public exportLogsJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        appName: 'Zahir Control Pro',
        totalEntries: this.logs.length,
        logs: this.logs
      },
      null,
      2
    );
  }
}

export const logger = new SilentLogger();
