// ============================================================
//  ZCtrl Structured Rotating File Logger
//  Writes INFO / WARN / ERROR entries with automatic secret
//  redaction and 2MB x 3 file rotation so logs never grow unbounded.
// ============================================================

import fs from 'fs';
import path from 'path';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_LOG_FILE_BYTES = 2 * 1024 * 1024; // 2 MB per file
const MAX_ROTATED_FILES = 3;
const MAX_MEMORY_ENTRIES = 150;

const SENSITIVE_KEY_PATTERN = /(password|passwd|secret|token|authorization|cookie|credential|apiKey|api_key|passphrase)/i;

/**
 * Recursively redact any credentials, tokens, or passwords before logging to disk or memory.
 */
export function redactSecrets(input: unknown, depth = 0): unknown {
  if (depth > 5 || input === null || input === undefined) return input;
  if (typeof input === 'string') {
    // Redact RouterOS =password=... words or Bearer tokens embedded in strings
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
  private logDir: string | null = null;
  private fileWriteDisabled = false;

  private resolveLogFilePath(): string | null {
    if (this.fileWriteDisabled) return null;
    try {
      const baseDir = this.logDir || process.env.ZCTRL_LOG_DIR || path.join(process.cwd(), 'logs');
      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }
      this.logDir = baseDir;
      return path.join(baseDir, 'zctrl.log');
    } catch {
      this.fileWriteDisabled = true;
      return null;
    }
  }

  private rotateIfNeeded(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const stat = fs.statSync(filePath);
      if (stat.size < MAX_LOG_FILE_BYTES) return;

      // Shift zctrl.log.2 -> zctrl.log.3, zctrl.log.1 -> zctrl.log.2, zctrl.log -> zctrl.log.1
      for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
        const src = `${filePath}.${i}`;
        const dst = `${filePath}.${i + 1}`;
        if (fs.existsSync(src)) {
          try {
            if (fs.existsSync(dst)) fs.unlinkSync(dst);
            fs.renameSync(src, dst);
          } catch {}
        }
      }
      const firstArchive = `${filePath}.1`;
      if (fs.existsSync(firstArchive)) {
        try { fs.unlinkSync(firstArchive); } catch {}
      }
      fs.renameSync(filePath, firstArchive);
    } catch {
      // Never throw on log rotation failure
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

    const filePath = this.resolveLogFilePath();
    if (filePath) {
      try {
        this.rotateIfNeeded(filePath);
        const line = `[${entry.timestamp}] [${entry.level}] [${entry.module}] ${entry.message}${
          entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
        }\n`;
        fs.appendFileSync(filePath, line, 'utf8');
      } catch {
        // Ignore disk write errors to guarantee zero disruption
      }
    }
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
  }
}

export const appLogger = new RotatingLogger();
