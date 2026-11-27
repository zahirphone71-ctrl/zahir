// ============================================================
//  ZCtrl Unified Structured Rotating Logger (Async Buffered)
//  Writes INFO / WARN / ERROR / DEBUG entries asynchronously in
//  debounced batches with automatic secret redaction and 2MB x 3
//  file rotation so logs never block the Node event loop.
// ============================================================

import fs from 'fs';
import path from 'path';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_LOG_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per file
const MAX_ROTATED_FILES = 3;
const MAX_MEMORY_ENTRIES = 200;
const MAX_PENDING_DISK_LINES = 1000;
const FLUSH_DEBOUNCE_MS = 1000;

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|cookie|credential|apiKey|api_key|passphrase)/i;

/**
 * Recursively redact any credentials, tokens, or passwords before logging to disk or memory.
 */
export function redactSecrets(input: unknown, depth = 0): unknown {
  if (depth > 5 || input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input
      .replace(/(=password=)[^\s,"']+/gi, '$1[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]')
      .replace(/("password"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2');
  }
  if (Array.isArray(input)) {
    return input.slice(0, 40).map((item) => redactSecrets(item, depth + 1));
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSecrets(v, depth + 1);
      }
    }
    return out;
  }
  return input;
}

class RotatingLogger {
  private recentEntries: StructuredLogEntry[] = [];
  private pendingLines: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private logDir: string | null = null;
  private fileWriteDisabled = false;
  private reportedDiskWarning = false;

  private resolveBaseDir(): string | null {
    if (this.fileWriteDisabled) return null;
    if (this.logDir) return this.logDir;
    const baseDir =
      process.env.ZCTRL_LOG_DIR ||
      (process.env.ZCTRL_DATA_DIR
        ? path.join(process.env.ZCTRL_DATA_DIR, 'logs')
        : path.join(process.cwd(), 'logs'));
    this.logDir = baseDir;
    return baseDir;
  }

  private async rotateIfNeededAsync(filePath: string): Promise<void> {
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size < MAX_LOG_FILE_BYTES) return;

      for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
        const src = `${filePath}.${i}`;
        const dst = `${filePath}.${i + 1}`;
        try {
          await fs.promises.access(src);
          try {
            await fs.promises.unlink(dst);
          } catch {
            // Destination archive may not exist yet
          }
          await fs.promises.rename(src, dst);
        } catch {
          // Source archive does not exist yet
        }
      }
      const firstArchive = `${filePath}.1`;
      try {
        await fs.promises.unlink(firstArchive);
      } catch {
        // First archive may not exist yet
      }
      await fs.promises.rename(filePath, firstArchive);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT' && !this.reportedDiskWarning) {
        this.reportedDiskWarning = true;
        console.warn('[RotatingLogger] Log rotation skipped:', (err as Error)?.message || err);
      }
    }
  }

  private rotateIfNeededSync(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.size < MAX_LOG_FILE_BYTES) return;

      for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
        const src = `${filePath}.${i}`;
        const dst = `${filePath}.${i + 1}`;
        if (fs.existsSync(src)) {
          try {
            if (fs.existsSync(dst)) fs.unlinkSync(dst);
            fs.renameSync(src, dst);
          } catch (err) {
            console.warn('[RotatingLogger] Sync rotation shift failed:', (err as Error)?.message || err);
          }
        }
      }
      const firstArchive = `${filePath}.1`;
      try {
        if (fs.existsSync(firstArchive)) fs.unlinkSync(firstArchive);
        fs.renameSync(filePath, firstArchive);
      } catch (err) {
        console.warn('[RotatingLogger] Sync rotation archive failed:', (err as Error)?.message || err);
      }
    } catch (err) {
      if (!this.reportedDiskWarning) {
        this.reportedDiskWarning = true;
        console.warn('[RotatingLogger] Sync rotation error:', (err as Error)?.message || err);
      }
    }
  }

  private scheduleFlush(): void {
    if (this.fileWriteDisabled || this.flushTimer || this.pendingLines.length === 0) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushAsync();
    }, FLUSH_DEBOUNCE_MS);
    if (this.flushTimer.unref) this.flushTimer.unref();
  }

  public async flushAsync(): Promise<void> {
    if (this.isFlushing || this.pendingLines.length === 0 || this.fileWriteDisabled) return;
    const baseDir = this.resolveBaseDir();
    if (!baseDir) return;

    this.isFlushing = true;
    const batch = this.pendingLines.splice(0, this.pendingLines.length);
    const filePath = path.join(baseDir, 'zctrl.log');

    try {
      await fs.promises.mkdir(baseDir, { recursive: true });
      await this.rotateIfNeededAsync(filePath);
      await fs.promises.appendFile(filePath, batch.join(''), 'utf8');
    } catch (err) {
      if (!this.reportedDiskWarning) {
        this.reportedDiskWarning = true;
        console.warn('[RotatingLogger] Async file write disabled after error:', (err as Error)?.message || err);
      }
      this.fileWriteDisabled = true;
    } finally {
      this.isFlushing = false;
      if (this.pendingLines.length > 0 && !this.fileWriteDisabled) {
        this.scheduleFlush();
      }
    }
  }

  public shutdown(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pendingLines.length === 0 || this.fileWriteDisabled) return;
    const baseDir = this.resolveBaseDir();
    if (!baseDir) return;
    const batch = this.pendingLines.splice(0, this.pendingLines.length);
    const filePath = path.join(baseDir, 'zctrl.log');
    try {
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.rotateIfNeededSync(filePath);
      fs.appendFileSync(filePath, batch.join(''), 'utf8');
    } catch (err) {
      console.warn('[RotatingLogger] Final shutdown flush warning:', (err as Error)?.message || err);
    }
  }

  public log(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
    const sanitizedMessage = String(redactSecrets(message));
    const sanitizedMeta = meta ? (redactSecrets(meta) as Record<string, unknown>) : undefined;
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message: sanitizedMessage,
      ...(sanitizedMeta ? { meta: sanitizedMeta } : {})
    };

    this.recentEntries.unshift(entry);
    if (this.recentEntries.length > MAX_MEMORY_ENTRIES) {
      this.recentEntries.length = MAX_MEMORY_ENTRIES;
    }

    if (!this.fileWriteDisabled) {
      const line = `[${entry.timestamp}] [${entry.level}] [${entry.module}] ${entry.message}${
        entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
      }\n`;
      this.pendingLines.push(line);
      if (this.pendingLines.length > MAX_PENDING_DISK_LINES) {
        this.pendingLines = this.pendingLines.slice(-MAX_PENDING_DISK_LINES);
      }
      this.scheduleFlush();
    }
  }

  public debug(module: string, message: string, meta?: Record<string, unknown>): void {
    this.log('DEBUG', module, message, meta);
  }

  public info(module: string, message: string, meta?: Record<string, unknown>): void {
    this.log('INFO', module, message, meta);
  }

  public warn(module: string, message: string, meta?: Record<string, unknown>): void {
    this.log('WARN', module, message, meta);
  }

  public error(module: string, message: string, meta?: Record<string, unknown>): void {
    this.log('ERROR', module, message, meta);
  }

  public getRecent(limit = 60): StructuredLogEntry[] {
    return this.recentEntries.slice(0, Math.min(MAX_MEMORY_ENTRIES, Math.max(1, limit)));
  }

  public clearMemory(): void {
    this.recentEntries = [];
    this.pendingLines = [];
  }
}

export const appLogger = new RotatingLogger();

process.on('SIGTERM', () => appLogger.shutdown());
process.on('SIGINT', () => appLogger.shutdown());
process.on('beforeExit', () => appLogger.shutdown());
