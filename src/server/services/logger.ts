// ============================================================
// نظام تسجيل إنتاجي - ملفات دورانية (إصلاح 6)
// ============================================================

import fs from 'fs';
import path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  mod: string;
  msg: string;
  data?: any;
}

const LOG_DIR = process.env.ZCTRL_LOG_DIR || (process.env.ZCTRL_DATA_DIR ? path.join(process.env.ZCTRL_DATA_DIR, 'logs') : path.join(process.cwd(), 'logs'));
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB لكل ملف
const MAX_FILES = 5;
const MAX_MEMORY = 300;

const MAX_PENDING_DISK = 1000;

class Logger {
  private buffer: LogEntry[] = [];
  private pendingDiskBuffer: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.AP_LOG !== 'off';
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
    } catch {}
  }

  private write(level: LogLevel, mod: string, msg: string, data?: any) {
    if (!this.enabled) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      mod,
      msg,
      data: data ?? undefined
    };

    this.buffer.push(entry);
    if (this.buffer.length > MAX_MEMORY) {
      this.buffer = this.buffer.slice(-MAX_MEMORY);
    }

    this.pendingDiskBuffer.push(entry);
    if (this.pendingDiskBuffer.length > MAX_PENDING_DISK) {
      this.pendingDiskBuffer = this.pendingDiskBuffer.slice(-MAX_PENDING_DISK);
    }

    const prefix = `[${entry.ts}] [${level.toUpperCase()}] [${mod}]`;
    if (level === 'error') console.error(prefix, msg, data ?? '');
    else if (level === 'warn') console.warn(prefix, msg);
    else if (level === 'debug' && process.env.NODE_ENV !== 'production') console.log(prefix, msg, data ?? '');
    else if (level === 'info') console.log(prefix, msg);

    // كتابة مؤجلة (debounced) - مرة كل 2 ثانية كحد أقصى بدون حجب Event Loop
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flushToFileAsync();
      }, 2000);
      if (this.flushTimer.unref) this.flushTimer.unref();
    }
  }

  info(mod: string, msg: string, data?: any) {
    this.write('info', mod, msg, data);
  }

  warn(mod: string, msg: string, data?: any) {
    this.write('warn', mod, msg, data);
  }

  error(mod: string, msg: string, data?: any) {
    this.write('error', mod, msg, data);
  }

  debug(mod: string, msg: string, data?: any) {
    this.write('debug', mod, msg, data);
  }

  private async flushToFileAsync() {
    if (this.isFlushing || this.pendingDiskBuffer.length === 0) return;
    this.isFlushing = true;
    const entries = this.pendingDiskBuffer;
    this.pendingDiskBuffer = [];
    try {
      await fs.promises.mkdir(LOG_DIR, { recursive: true });
      const logFile = path.join(LOG_DIR, 'ap-manager.log');
      try {
        const stat = await fs.promises.stat(logFile);
        if (stat.size > MAX_FILE_SIZE) {
          this.rotateLogs();
        }
      } catch {}
      const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await fs.promises.appendFile(logFile, lines, 'utf8');
    } catch {
      // تجاهل أخطاء الكتابة غير الحرجة مع منع تراكمها في الذاكرة
    } finally {
      this.isFlushing = false;
      if (this.pendingDiskBuffer.length > 0 && !this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushTimer = null;
          void this.flushToFileAsync();
        }, 2000);
        if (this.flushTimer.unref) this.flushTimer.unref();
      }
    }
  }

  private flushToFileSync() {
    if (this.pendingDiskBuffer.length === 0) return;
    const entries = this.pendingDiskBuffer;
    this.pendingDiskBuffer = [];
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
      const logFile = path.join(LOG_DIR, 'ap-manager.log');
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > MAX_FILE_SIZE) {
        this.rotateLogs();
      }
      const line = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
      fs.appendFileSync(logFile, line, 'utf8');
    } catch {
      // لا نرمي خطأ إذا فشلت كتابة السجل
    }
  }

  private rotateLogs() {
    try {
      for (let i = MAX_FILES - 1; i >= 1; i--) {
        const older = path.join(LOG_DIR, `ap-manager.${i}.log`);
        const newer = path.join(LOG_DIR, `ap-manager.${i - 1}.log`);
        if (fs.existsSync(newer)) {
          if (fs.existsSync(older)) fs.unlinkSync(older);
          fs.renameSync(newer, older);
        }
      }
      const main = path.join(LOG_DIR, 'ap-manager.log');
      if (fs.existsSync(main)) {
        const firstBackup = path.join(LOG_DIR, 'ap-manager.1.log');
        if (fs.existsSync(firstBackup)) fs.unlinkSync(firstBackup);
        fs.renameSync(main, firstBackup);
      }
    } catch {}
  }

  getRecent(count: number = 50): LogEntry[] {
    return this.buffer.slice(-count);
  }

  getErrors(): LogEntry[] {
    return this.buffer.filter((e) => e.level === 'error');
  }

  getByVendor(v: string): LogEntry[] {
    return this.buffer.filter((e) => e.mod.toLowerCase().includes(v.toLowerCase()));
  }

  /** تنظيف عند إغلاق العملية */
  shutdown() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushToFileSync();
  }
}

export const logger = new Logger();

// كتابة السجلات المعلقة قبل إغلاق العملية
process.on('SIGTERM', () => logger.shutdown());
process.on('SIGINT', () => logger.shutdown());
