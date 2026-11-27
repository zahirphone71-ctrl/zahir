// ============================================================
// Unified Logger Facade delegating to appLogger (rotatingLogger.ts)
// ============================================================

import { appLogger, type StructuredLogEntry } from '../rotatingLogger.ts';

export { appLogger };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  mod: string;
  msg: string;
  data?: unknown;
}

function toLegacyEntry(entry: StructuredLogEntry): LogEntry {
  return {
    ts: entry.timestamp,
    level: entry.level.toLowerCase() as LogLevel,
    mod: entry.module,
    msg: entry.message,
    ...(entry.meta !== undefined ? { data: entry.meta } : {})
  };
}

class UnifiedLoggerFacade {
  private get enabled(): boolean {
    return process.env.AP_LOG !== 'off';
  }

  private normalizeMeta(data?: unknown): Record<string, unknown> | undefined {
    if (data === undefined || data === null) return undefined;
    if (typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return { value: data };
  }

  info(mod: string, msg: string, data?: unknown) {
    if (!this.enabled) return;
    appLogger.info(mod, msg, this.normalizeMeta(data));
  }

  warn(mod: string, msg: string, data?: unknown) {
    if (!this.enabled) return;
    appLogger.warn(mod, msg, this.normalizeMeta(data));
  }

  error(mod: string, msg: string, data?: unknown) {
    if (!this.enabled) return;
    appLogger.error(mod, msg, this.normalizeMeta(data));
  }

  debug(mod: string, msg: string, data?: unknown) {
    if (!this.enabled) return;
    appLogger.debug(mod, msg, this.normalizeMeta(data));
  }

  getRecent(count = 50): LogEntry[] {
    return appLogger.getRecent(count).map(toLegacyEntry).reverse();
  }

  getErrors(): LogEntry[] {
    return appLogger
      .getRecent(200)
      .filter((e) => e.level === 'ERROR')
      .map(toLegacyEntry)
      .reverse();
  }

  getByVendor(v: string): LogEntry[] {
    const q = v.toLowerCase();
    return appLogger
      .getRecent(200)
      .filter((e) => e.module.toLowerCase().includes(q))
      .map(toLegacyEntry)
      .reverse();
  }

  shutdown() {
    appLogger.shutdown();
  }
}

export const logger = new UnifiedLoggerFacade();
