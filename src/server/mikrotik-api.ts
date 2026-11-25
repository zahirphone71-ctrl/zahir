import net from "net";
import tls from "tls";
import crypto from "crypto";
import { AutoPingStabilizer } from "./ping-stabilizer.ts";

export interface ConnectionConfig {
  host: string;
  user: string;
  password?: string;
  port?: number;
  timeout?: number;
  useSsl?: boolean;
  strictTls?: boolean;
  tlsFingerprint?: string;
}

export function normalizeTlsFingerprint(fp: string): string {
  return String(fp || "").replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

export function verifyTlsFingerprint(expectedFingerprint: string, actualFingerprint: string): boolean {
  const expectedNorm = normalizeTlsFingerprint(expectedFingerprint);
  const actualNorm = normalizeTlsFingerprint(actualFingerprint);
  if (!expectedNorm || !actualNorm || expectedNorm.length !== actualNorm.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedNorm, "hex"), Buffer.from(actualNorm, "hex"));
  } catch {
    return false;
  }
}

export function encodeApiLength(len: number): Buffer {
  if (len < 0x80) {
    return Buffer.from([len]);
  } else if (len < 0x4000) {
    const val = len | 0x8000;
    return Buffer.from([(val >> 8) & 0xff, val & 0xff]);
  } else if (len < 0x200000) {
    const val = len | 0xc00000;
    return Buffer.from([(val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff]);
  } else if (len < 0x10000000) {
    const val = len | 0xe0000000;
    return Buffer.from([
      (val >> 24) & 0xff,
      (val >> 16) & 0xff,
      (val >> 8) & 0xff,
      val & 0xff
    ]);
  } else {
    return Buffer.from([
      0xf0,
      (len >> 24) & 0xff,
      (len >> 16) & 0xff,
      (len >> 8) & 0xff,
      len & 0xff
    ]);
  }
}

export function encodeApiWord(word: string): Buffer {
  const wordBuf = Buffer.from(word, "utf-8");
  const lenBuf = encodeApiLength(wordBuf.length);
  return Buffer.concat([lenBuf, wordBuf]);
}

export function encodeApiSentence(words: string[]): Buffer {
  const buffers: Buffer[] = words.map((w) => encodeApiWord(w));
  buffers.push(Buffer.from([0x00]));
  return Buffer.concat(buffers);
}

export function decodeApiSentences(rawBuffer: Buffer): { sentences: string[][]; remainder: Buffer } {
  let cursor = 0;
  let sentenceStartCursor = 0;
  const len = rawBuffer.length;
  const sentences: string[][] = [];
  let inProgress: string[] = [];

  while (cursor < len) {
    let offset = cursor;
    const b1 = rawBuffer[offset++];
    let wordLen = 0;

    if ((b1 & 0x80) === 0) {
      wordLen = b1;
    } else if ((b1 & 0xc0) === 0x80) {
      if (len - cursor < 2) break;
      wordLen = ((b1 & 0x3f) << 8) | rawBuffer[offset++];
    } else if ((b1 & 0xe0) === 0xc0) {
      if (len - cursor < 3) break;
      wordLen = ((b1 & 0x1f) << 16) | (rawBuffer[offset++] << 8) | rawBuffer[offset++];
    } else if ((b1 & 0xf0) === 0xe0) {
      if (len - cursor < 4) break;
      wordLen =
        (((b1 & 0x0f) * 0x1000000) +
          ((rawBuffer[offset++] << 16) | (rawBuffer[offset++] << 8) | rawBuffer[offset++])) >>>
        0;
    } else if ((b1 & 0xf8) === 0xf0) {
      if (len - cursor < 5) break;
      wordLen =
        ((rawBuffer[offset++] * 0x1000000) +
          ((rawBuffer[offset++] << 16) | (rawBuffer[offset++] << 8) | rawBuffer[offset++])) >>>
        0;
    } else {
      cursor++;
      if (inProgress.length === 0) sentenceStartCursor = cursor;
      continue;
    }

    if (wordLen === 0) {
      cursor = offset;
      sentenceStartCursor = cursor;
      if (inProgress.length > 0) {
        sentences.push(inProgress);
        inProgress = [];
      }
      continue;
    }

    if (wordLen > 32 * 1024 * 1024) {
      cursor++;
      if (inProgress.length === 0) sentenceStartCursor = cursor;
      continue;
    }

    if (len - offset < wordLen) {
      break;
    }

    inProgress.push(rawBuffer.toString("utf-8", offset, offset + wordLen));
    cursor = offset + wordLen;
  }

  const resumeAt = inProgress.length > 0 ? sentenceStartCursor : cursor;
  return {
    sentences,
    remainder: resumeAt >= len ? Buffer.alloc(0) : rawBuffer.subarray(resumeAt)
  };
}

export interface RouterInfo {
  name: string;
  host: string;
  version: string;
  majorVersion: number;
  boardName: string;
  uptime: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  hasInternet: boolean;
  gateway?: string;
  wanIp?: string;
  tlsFingerprint?: string;
  connectedAt: string;
}

export interface InternetStatus {
  hasInternet: boolean;
  pingMs: number;
  packetLoss: number;
  checkedAt: string;
  gateway?: string;
  wanIp?: string;
}

export interface ThrottlerStats {
  activeRequests: number;
  queuedRequests: number;
  maxConcurrent: number;
  totalExecuted: number;
  totalThrottled: number;
  isThrottled: boolean;
  averageWaitTimeMs: number;
}

interface QueuedCommandItem {
  id: string;
  fn: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  enqueuedAt: number;
  timeoutTimer?: NodeJS.Timeout;
}

interface PendingCommand {
  tag: string;
  sentences: string[][];
  resolve: (sentences: string[][]) => void;
  reject: (error: Error) => void;
  timeoutTimer: NodeJS.Timeout | null;
}

/**
 * محرك تنظيم وتوزيع الطلبات (Request Throttler) لخدمة MikroTik API
 * يحد العمليات المتزامنة إلى 3 طلبات كحد أقصى لمنع ارتفاع استهلاك الـ CPU وتشنج الراوتر
 * يقوم بجدولة الأوامر الفائضة في طابور تسلسلي منتظم ومعالجتها فور تحرر أي مسار
 */
export class MikroTikRequestThrottler {
  private activeCount: number = 0;
  private readonly maxConcurrent: number = 2;
  private currentCpuLoad: number = 0;
  private currentPingMs: number = 0;
  private currentJitterMs: number = 0;
  private overrideMaxConcurrent: number | null = null;
  private overridePacingMs: number | null = null;
  private queue: QueuedCommandItem[] = [];
  private totalExecuted: number = 0;
  private totalThrottled: number = 0;
  private totalWaitTimeMs: number = 0;
  private lastDispatchTime: number = 0;

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
  }

  updateCpuLoad(cpu: number): void {
    if (typeof cpu === "number" && !isNaN(cpu)) {
      this.currentCpuLoad = cpu;
    }
  }

  updateNetworkMetrics(
    pingMs?: number,
    jitterMs?: number,
    overrideMaxConcurrent?: number | null,
    overridePacingMs?: number | null
  ): void {
    if (typeof pingMs === "number" && Number.isFinite(pingMs) && pingMs >= 0) {
      this.currentPingMs = pingMs;
    }
    if (typeof jitterMs === "number" && Number.isFinite(jitterMs) && jitterMs >= 0) {
      this.currentJitterMs = jitterMs;
    }
    if (overrideMaxConcurrent !== undefined) {
      this.overrideMaxConcurrent =
        overrideMaxConcurrent === null ? null : Math.max(1, Math.min(this.maxConcurrent, overrideMaxConcurrent));
    }
    if (overridePacingMs !== undefined) {
      this.overridePacingMs = overridePacingMs === null ? null : Math.max(0, Math.min(500, overridePacingMs));
    }
  }

  getEffectivePacingMs(basePacingMs: number = 15): number {
    let pacing = basePacingMs;
    if (this.currentCpuLoad > 75 || this.currentPingMs > 140) {
      pacing = Math.max(pacing, 120);
    } else if (this.currentCpuLoad > 55 || this.currentPingMs > 70 || this.currentJitterMs > 25) {
      pacing = Math.max(pacing, 55);
    }
    if (this.overridePacingMs !== null) {
      pacing = Math.max(pacing, this.overridePacingMs);
    }
    return pacing;
  }

  private getEffectiveMaxConcurrent(): number {
    let limit = this.maxConcurrent;
    if (this.currentCpuLoad > 55 || this.currentPingMs > 70 || this.currentJitterMs > 25) {
      limit = 1;
    }
    if (this.overrideMaxConcurrent !== null) {
      limit = Math.min(limit, this.overrideMaxConcurrent);
    }
    return Math.max(1, limit);
  }

  getStats(): ThrottlerStats {
    const effectiveMax = this.getEffectiveMaxConcurrent();
    return {
      activeRequests: this.activeCount,
      queuedRequests: this.queue.length,
      maxConcurrent: effectiveMax,
      totalExecuted: this.totalExecuted,
      totalThrottled: this.totalThrottled,
      isThrottled: this.queue.length > 0 || this.activeCount >= effectiveMax,
      averageWaitTimeMs: this.totalExecuted > 0 ? Math.round(this.totalWaitTimeMs / this.totalExecuted) : 0
    };
  }

  async execute<T>(
    fn: () => Promise<T>,
    options?: { priority?: boolean; timeoutMs?: number; pacingDelayMs?: number }
  ): Promise<T> {
    const enqueuedAt = Date.now();
    const timeoutMs = options?.timeoutMs || 35000;
    const pacingDelayMs = this.getEffectivePacingMs(options?.pacingDelayMs ?? 15);
    const effectiveMax = this.getEffectiveMaxConcurrent();

    // إذا كانت هناك مسارات فارغة والطابور خالي، نفذ فوراً
    if (this.activeCount < effectiveMax && this.queue.length === 0) {
      return this.runWithSlot(fn, pacingDelayMs, enqueuedAt);
    }

    // تجاوز الحد الأقصى -> إدراج في طابور الانتظار التهدوي
    this.totalThrottled++;
    return new Promise<T>((resolve, reject) => {
      const id = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const timeoutTimer = setTimeout(() => {
        const idx = this.queue.findIndex((item) => item.id === id);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          reject(
            new Error(
              `تم إلغاء الأمر بعد الانتظار في طابور تنظيم الطلبات لأكثر من ${Math.round(timeoutMs / 1000)} ثانية لتفادي إجهاد معالج الراوتر.`
            )
          );
        }
      }, timeoutMs);

      const item: QueuedCommandItem = {
        id,
        fn,
        resolve: (val: any) => {
          clearTimeout(timeoutTimer);
          resolve(val);
        },
        reject: (err: any) => {
          clearTimeout(timeoutTimer);
          reject(err);
        },
        enqueuedAt,
        timeoutTimer
      };

      if (options?.priority) {
        this.queue.unshift(item);
      } else {
        this.queue.push(item);
      }
    });
  }

  private async runWithSlot<T>(fn: () => Promise<T>, pacingDelayMs: number, enqueuedAt: number): Promise<T> {
    this.activeCount++;
    const waitTime = Date.now() - enqueuedAt;
    this.totalWaitTimeMs += waitTime;

    // فاصل زمني مصغر (Pacing Delay) لتبريد الـ CPU وتفادي الذروات المفاجئة
    if (this.lastDispatchTime > 0 && pacingDelayMs > 0) {
      const elapsed = Date.now() - this.lastDispatchTime;
      if (elapsed < pacingDelayMs) {
        await new Promise((r) => setTimeout(r, pacingDelayMs - elapsed));
      }
    }
    this.lastDispatchTime = Date.now();

    try {
      const result = await fn();
      this.totalExecuted++;
      return result;
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.dispatchNext(pacingDelayMs);
    }
  }

  private dispatchNext(pacingDelayMs: number) {
    const effectiveMax = this.getEffectiveMaxConcurrent();
    if (this.activeCount < effectiveMax && this.queue.length > 0) {
      const nextItem = this.queue.shift();
      if (nextItem) {
        this.runWithSlot(nextItem.fn, pacingDelayMs, nextItem.enqueuedAt)
          .then(nextItem.resolve)
          .catch(nextItem.reject);
      }
    }
  }

  clearQueue() {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        if (item.timeoutTimer) clearTimeout(item.timeoutTimer);
        item.reject(new Error("تم تفريغ طابور الأوامر بسبب انقطاع الاتصال"));
      }
    }
  }
}

/**
 * محرك بروتوكول MikroTik RouterOS API الأصلي عالي الاعتمادية
 * متوافق بنسبة 100% مع جميع إصدارات RouterOS: v5, v6 القديم (MD5 Challenge), v6.43+ و v7 الحديث (v7.0 - v7.18+)
 * معالجة تامة لكافة حزم الاستجابة: !re, !done, !trap, !empty, !fatal بدون أي أخطاء Uncaught أو انهيارات
 */
export class MikrotikClient {
  private socket: net.Socket | null = null;
  private currentConfig: ConnectionConfig | null = null;
  private connectionPromise: Promise<boolean> | null = null;
  private routerVersion: string = "";
  private routerMajorVersion: number = 7;
  private routerIdentity: string = "MikroTik";
  private routerBoard: string = "";
  private isConnectedFlag: boolean = false;
  private throttler: MikroTikRequestThrottler = new MikroTikRequestThrottler(2);
  private pingStabilizer: AutoPingStabilizer = new AutoPingStabilizer();
  private lastErrorMessage: string = "";
  private buffer: Buffer = Buffer.alloc(0);
  private inProgressWords: string[] = [];
  private pendingRequests: Map<string, PendingCommand> = new Map();
  private tagCounter: number = 0;
  private keepaliveInterval: NodeJS.Timeout | null = null;
  private cachedInternetStatus: InternetStatus | null = null;
  private lastInternetCheck: number = 0;
  private lastQueryTime: number = 0;
  private currentCpuLoad: number = 0;
  private currentTemperature: number = 0;
  private isEcoModeActive: boolean = false;
  private lastSocketLatencyMs: number = 3;
  private peerTlsFingerprint: string | null = null;
  // In-flight read query deduplication map (prevents duplicate concurrent */print queries hitting MikroTik CPU)
  private inFlightReads: Map<string, Promise<any[]>> = new Map();
  // Exponential backoff reconnect state
  private reconnectFailures: number = 0;
  private nextReconnectAllowedAt: number = 0;
  private totalReconnectCount: number = 0;
  // Self-monitoring telemetry (rolling 60s request timestamps + dedup savings)
  private requestTimestamps: number[] = [];
  private rttSamples: number[] = [];
  private dedupedQueriesCount: number = 0;

  constructor() {
    // حماية داخلية لضمان عدم تسريب أي استثناءات غير ملتقطة
  }

  getPerformanceTelemetry() {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts <= 60000);
    const avgRttMs =
      this.rttSamples.length > 0
        ? Math.round(this.rttSamples.reduce((a, b) => a + b, 0) / this.rttSamples.length)
        : this.lastSocketLatencyMs;
    const maxRttMs = this.rttSamples.length > 0 ? Math.max(...this.rttSamples) : this.lastSocketLatencyMs;
    const throttler = this.throttler.getStats();
    return {
      requestsPerMinute: this.requestTimestamps.length,
      dedupedQueriesSaved: this.dedupedQueriesCount,
      inFlightReadCount: this.inFlightReads.size,
      avgRttMs,
      maxRttMs,
      lastRttMs: this.lastSocketLatencyMs,
      reconnectFailures: this.reconnectFailures,
      totalReconnectCount: this.totalReconnectCount,
      throttler,
      isConnected: this.isConnected(),
      cpuLoad: this.currentCpuLoad
    };
  }

  getThrottlerStats(): ThrottlerStats {
    return this.throttler.getStats();
  }

  getThrottler(): MikroTikRequestThrottler {
    return this.throttler;
  }

  getPingStabilizer(): AutoPingStabilizer {
    return this.pingStabilizer;
  }

  syncStabilizerToThrottler(): void {
    const snap = this.pingStabilizer.getSnapshot();
    const rec = this.pingStabilizer.getRecommendedThrottling();
    this.throttler.updateNetworkMetrics(
      snap.ewmaPingMs || this.lastSocketLatencyMs,
      snap.jitterMs,
      rec.maxConcurrent,
      rec.pacingMs
    );
  }

  getLatency(): number {
    const ewma = this.pingStabilizer.getSnapshot().ewmaPingMs;
    return ewma > 0 ? ewma : this.lastSocketLatencyMs;
  }

  updateHardwareMetrics(cpuLoad?: number, temperature?: number, pingMs?: number) {
    if (typeof cpuLoad === "number" && !isNaN(cpuLoad)) {
      this.currentCpuLoad = cpuLoad;
      this.throttler.updateCpuLoad(cpuLoad);
    }
    if (typeof temperature === "number" && !isNaN(temperature)) {
      this.currentTemperature = temperature;
    }
    this.pingStabilizer.recordSample({
      cpuLoad: typeof cpuLoad === "number" && !isNaN(cpuLoad) ? cpuLoad : undefined,
      cpuTemp: typeof temperature === "number" && !isNaN(temperature) ? temperature : undefined,
      pingMs: typeof pingMs === "number" && !isNaN(pingMs) && pingMs > 0 ? pingMs : undefined
    });
    this.syncStabilizerToThrottler();
  }

  setEcoMode(enabled: boolean) {
    this.isEcoModeActive = enabled;
    if (enabled && this.pingStabilizer.getSnapshot().mode === "off") {
      this.pingStabilizer.updateConfig({ mode: "auto" });
    }
    this.syncStabilizerToThrottler();
  }

  isThermalStressed(): boolean {
    const stabState = this.pingStabilizer.getSnapshot().state;
    return (
      this.isEcoModeActive ||
      this.currentCpuLoad > 55 ||
      this.currentTemperature > 58 ||
      stabState === "stabilizing" ||
      stabState === "critical"
    );
  }

  getHardwareMetrics() {
    const stab = this.pingStabilizer.getSnapshot();
    return {
      cpuLoad: this.currentCpuLoad,
      temperature: this.currentTemperature,
      pingMs: this.getLatency(),
      jitterMs: stab.jitterMs,
      stabilizerState: stab.state,
      isThermalStressed: this.isThermalStressed(),
      isEcoMode: this.isEcoModeActive
    };
  }

  private isBatchSyncInProgress: boolean = false;

  setBatchSyncInProgress(active: boolean) {
    this.isBatchSyncInProgress = active;
  }

  private cachedResource: any = null;

  isBatchSyncActive(): boolean {
    return this.isBatchSyncInProgress;
  }

  getRouterVersion(): string {
    return this.routerVersion;
  }

  getRouterIdentity(): string {
    return this.routerIdentity || "MikroTik";
  }

  getRouterBoard(): string {
    return this.routerBoard || "RouterBOARD";
  }

  getCachedResource(): any {
    return this.cachedResource;
  }

  getMajorVersion(): number {
    return this.routerMajorVersion;
  }

  isV6(): boolean {
    return this.routerMajorVersion === 6;
  }

  getLastError(): string {
    return this.lastErrorMessage;
  }

  isConnected(): boolean {
    return this.isConnectedFlag && !!this.socket && !this.socket.destroyed;
  }

  getConfig(): ConnectionConfig | null {
    return this.currentConfig;
  }

  getPeerTlsFingerprint(): string | null {
    return this.peerTlsFingerprint;
  }

  /**
   * ترميز الطول وفق بروتوكول MikroTik API
   */
  private encodeLength(len: number): Buffer {
    return encodeApiLength(len);
  }

  /**
   * ترميز الكلمة
   */
  private encodeWord(word: string): Buffer {
    return encodeApiWord(word);
  }

  /**
   * ترميز جملة كاملة من الكلمات مع علامة نهاية الجملة 0x00
   */
  private encodeSentence(words: string[]): Buffer {
    return encodeApiSentence(words);
  }

  /**
   * فك تشفير وتجميع الجمل الواردة من المايكروتك من مجرى البايتات
   */
  private parseIncomingData() {
    // حماية ذاكرة الوصول العشوائي RAM ضد المخازن التالفة أو الضخمة
    if (this.buffer.length > 32 * 1024 * 1024) {
      console.warn("MikrotikClient: Buffer exceeded 32MB safety limit, resetting buffer to protect RAM.");
      this.buffer = Buffer.alloc(0);
      this.inProgressWords = [];
      return;
    }

    const buf = this.buffer;
    const len = buf.length;
    let cursor = 0;

    while (cursor < len) {
      let offset = cursor;
      const b1 = buf[offset++];
      let wordLen = 0;

      if ((b1 & 0x80) === 0) {
        wordLen = b1;
      } else if ((b1 & 0xc0) === 0x80) {
        if (len - cursor < 2) break;
        const b2 = buf[offset++];
        wordLen = ((b1 & 0x3f) << 8) | b2;
      } else if ((b1 & 0xe0) === 0xc0) {
        if (len - cursor < 3) break;
        const b2 = buf[offset++];
        const b3 = buf[offset++];
        wordLen = ((b1 & 0x1f) << 16) | (b2 << 8) | b3;
      } else if ((b1 & 0xf0) === 0xe0) {
        if (len - cursor < 4) break;
        const b2 = buf[offset++];
        const b3 = buf[offset++];
        const b4 = buf[offset++];
        wordLen = (((b1 & 0x0f) * 0x1000000) + ((b2 << 16) | (b3 << 8) | b4)) >>> 0;
      } else if ((b1 & 0xf8) === 0xf0) {
        if (len - cursor < 5) break;
        const b2 = buf[offset++];
        const b3 = buf[offset++];
        const b4 = buf[offset++];
        const b5 = buf[offset++];
        wordLen = ((b2 * 0x1000000) + ((b3 << 16) | (b4 << 8) | b5)) >>> 0;
      } else {
        // بايت غير متوقع - تجاهله للحفاظ على الاستقرار
        cursor++;
        continue;
      }

      if (wordLen === 0) {
        // نهاية جملة
        cursor = offset;
        if (this.inProgressWords.length > 0) {
          const words = this.inProgressWords;
          this.inProgressWords = [];
          const sentenceType = words[0];

          // فحص هل الجملة تحمل وسماً .tag لتوجيه الرد للمسار الخاص به بدقة
          let sentenceTag: string | null = null;
          for (let i = 1; i < words.length; i++) {
            const w = words[i];
            if (w.startsWith(".tag=")) {
              sentenceTag = w.substring(5);
              break;
            } else if (w.startsWith("=.tag=")) {
              sentenceTag = w.substring(6);
              break;
            }
          }

          let targetPending: PendingCommand | null = null;
          if (sentenceTag && this.pendingRequests.has(sentenceTag)) {
            targetPending = this.pendingRequests.get(sentenceTag)!;
          } else if (this.pendingRequests.size === 1) {
            // أثناء المصافحة الأولى /login أو في الردود غير الموسومة
            targetPending = this.pendingRequests.values().next().value || null;
          } else if (!sentenceTag && this.pendingRequests.size > 0) {
            // معالجة الردود بدون وسم (legacy / un-tagged) بأولوية الوصول FIFO
            targetPending = this.pendingRequests.values().next().value || null;
          }

          if (targetPending) {
            targetPending.sentences.push(words);

            if (sentenceType === "!done" || sentenceType === "!fatal" || sentenceType === "!halt") {
              if (targetPending.timeoutTimer) {
                clearTimeout(targetPending.timeoutTimer);
                targetPending.timeoutTimer = null;
              }
              if (targetPending.tag) {
                this.pendingRequests.delete(targetPending.tag);
              }

              if (sentenceType === "!fatal" || sentenceType === "!halt") {
                targetPending.reject(new Error("أغلق الراوتر جلسة الاتصال (!fatal)"));
              } else {
                targetPending.resolve(targetPending.sentences);
              }
            }
          }
        }
        continue;
      }

      if (wordLen > 32 * 1024 * 1024) {
        cursor++;
        continue;
      }

      if (len - offset < wordLen) {
        // البيانات لم تكتمل بعد في المخزن المؤقت
        break;
      }

      const word = buf.toString("utf-8", offset, offset + wordLen);
      this.inProgressWords.push(word);
      cursor = offset + wordLen;
    }

    // اقتطاع البايتات المقروءة دفعة واحدة أو تحرير المخزن فورا عند خلوه
    if (cursor >= len) {
      this.buffer = Buffer.alloc(0);
    } else if (cursor > 0) {
      this.buffer = buf.subarray(cursor);
    }
  }

  /**
   * إرسال جملة أمر وانتظار الرد بشكل آمن مع مهلة زمنية ودعم تعدد المسارات عبر الوسم (.tag)
   * مع حصر العمليات المتزامنة إلى 3 طلبات كحد أقصى لمنع إجهاد معالج الراوتر
   */
  private sendSentenceAsync(words: string[], timeoutSeconds = 12): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnectedFlag) {
        return reject(new Error("غير متصل بالراوتر حالياً"));
      }

      // حماية المقبس مع دعم استيعاب عالٍ لتعدد الاستعلامات المتزامنة (حتى 100 استعلام)
      if (this.pendingRequests.size >= 100) {
        return reject(new Error("تجاوز عدد الطلبات المتزامنة الحد الأقصى (100 طلباً)"));
      }

      const tag = `cmd_${++this.tagCounter}`;
      const taggedWords = [...words, `.tag=${tag}`];

      const timeoutTimer = setTimeout(() => {
        const pending = this.pendingRequests.get(tag);
        if (pending) {
          this.pendingRequests.delete(tag);
          reject(new Error(`انتهت مهلة الانتظار (${timeoutSeconds} ثوانٍ) للرد من المايكروتك`));
        }
      }, timeoutSeconds * 1000);

      this.pendingRequests.set(tag, {
        tag,
        sentences: [],
        resolve,
        reject,
        timeoutTimer
      });

      try {
        const payload = this.encodeSentence(taggedWords);
        this.socket.write(payload, (err) => {
          if (err) {
            clearTimeout(timeoutTimer);
            this.pendingRequests.delete(tag);
            reject(err);
          }
        });
      } catch (err: any) {
        clearTimeout(timeoutTimer);
        this.pendingRequests.delete(tag);
        reject(err);
      }
    });
  }

  /**
   * تحويل جمل الرد إلى كائنات JSON منظمة
   */
  private parseResponseSentences(sentences: string[][]): any[] {
    const results: any[] = [];
    let trapMessage = "";

    for (const sentence of sentences) {
      if (!sentence || sentence.length === 0) continue;
      const type = sentence[0];

      // تجاهل حزم المزامنة الفارغة !empty في RouterOS v7 بأمان تام
      if (type === "!empty") {
        continue;
      }

      if (type === "!trap") {
        for (let i = 1; i < sentence.length; i++) {
          const w = sentence[i];
          if (w.startsWith("=message=")) {
            trapMessage = w.substring(9);
          }
        }
        if (!trapMessage) {
          trapMessage = "أمر غير مسموح أو خطأ في إعدادات المايكروتك";
        }
        continue;
      }

      if (type === "!fatal") {
        this.isConnectedFlag = false;
        throw new Error("أغلق الراوتر جلسة الاتصال (!fatal)");
      }

      if (type === "!halt") {
        this.isConnectedFlag = false;
        throw new Error("تم إلغاء الأمر (!halt)");
      }

      if (type === "!re" || type === "!done") {
        const item: Record<string, string> = {};
        for (let i = 1; i < sentence.length; i++) {
          const w = sentence[i];
          if (w.startsWith(".tag=") || w.startsWith("=.tag=")) continue; // استبعاد الوسم الداخلي من النتائج
          if (w.startsWith("=")) {
            const eqIdx = w.indexOf("=", 1);
            if (eqIdx !== -1) {
              const k = w.substring(1, eqIdx);
              const v = w.substring(eqIdx + 1);
              item[k] = v;
            }
          }
        }
        if (Object.keys(item).length > 0) {
          results.push(item);
        }
      }
    }

    if (trapMessage && results.length === 0) {
      throw new Error(trapMessage);
    }

    return results;
  }

  /**
   * الاتصال بالراوتر والمصادقة الحقيقية (تدعم RouterOS v5, v6, v6.43+, v7)
   */
  async connect(
    configOrHost: ConnectionConfig | string,
    user?: string,
    password?: string,
    port = 8728,
    useSsl = false,
    options?: { strictTls?: boolean; tlsFingerprint?: string }
  ): Promise<boolean> {
    await this.disconnect();

    if (typeof configOrHost === "string") {
      this.currentConfig = {
        host: configOrHost.trim(),
        user: (user || "admin").trim(),
        password: password || "",
        port: Number(port) || (useSsl ? 8729 : 8728),
        useSsl: !!useSsl,
        strictTls: !!options?.strictTls,
        tlsFingerprint: options?.tlsFingerprint?.trim() || undefined,
        timeout: 10
      };
    } else {
      this.currentConfig = {
        host: configOrHost.host.trim(),
        user: configOrHost.user.trim(),
        password: configOrHost.password || "",
        port: Number(configOrHost.port) || (configOrHost.useSsl ? 8729 : 8728),
        useSsl: !!configOrHost.useSsl,
        strictTls: !!configOrHost.strictTls,
        tlsFingerprint: configOrHost.tlsFingerprint?.trim() || undefined,
        timeout: configOrHost.timeout || 10
      };
    }

    this.reconnectFailures = 0;
    this.nextReconnectAllowedAt = 0;
    const connected = await this.ensureConnected({ bypassBackoff: true });
    if (!connected) {
      throw new Error(
        this.lastErrorMessage ||
          "فشل الاتصال بالراوتر. يرجى التحقق من الشبكة وعنوان IP وبيانات المدير (Admin) الصحيحة."
      );
    }
    return true;
  }

  /**
   * ضمان إنشاء اتصال وحيد ومستقر دون حدوث تكرار (Mutex)
   */
  async ensureConnected(options?: { bypassBackoff?: boolean }): Promise<boolean> {
    if (this.isConnected()) {
      return true;
    }

    if (!this.currentConfig) {
      this.lastErrorMessage = "لم يتم تحديد بيانات الاتصال بالراوتر";
      return false;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Exponential backoff guard: avoid slamming unreachable router TCP socket on rapid retries
    if (!options?.bypassBackoff && this.nextReconnectAllowedAt > Date.now()) {
      const waitSec = Math.max(1, Math.ceil((this.nextReconnectAllowedAt - Date.now()) / 1000));
      this.lastErrorMessage = `جاري انتظار التهدئة قبل إعادة المحاولة (${waitSec} ثانية)...`;
      return false;
    }

    this.connectionPromise = (async () => {
      try {
        await this.performSocketConnect();
        this.lastErrorMessage = "";
        this.reconnectFailures = 0;
        this.nextReconnectAllowedAt = 0;
        this.totalReconnectCount++;
        this.startKeepalive();
        return true;
      } catch (err: any) {
        this.isConnectedFlag = false;
        this.cleanupSocket();
        this.reconnectFailures = Math.min(this.reconnectFailures + 1, 6);
        const backoffMs = Math.min(30000, 1000 * Math.pow(2, this.reconnectFailures - 1));
        this.nextReconnectAllowedAt = Date.now() + backoffMs;
        this.lastErrorMessage = err?.message || "فشل الاتصال بسيرفر المايكروتك";
        return false;
      } finally {
        this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * إنشاء المقبس والمصادقة المزدوجة (RouterOS v6.43+/v7 و legacy v6/v5)
   */
  private performSocketConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cleanupSocket();

      const host = this.currentConfig!.host;
      const useSsl = !!this.currentConfig!.useSsl;
      const strictTls = !!this.currentConfig!.strictTls;
      const expectedFingerprint = this.currentConfig!.tlsFingerprint;
      const port = this.currentConfig!.port || (useSsl ? 8729 : 8728);
      const user = this.currentConfig!.user;
      const password = this.currentConfig!.password || "";
      const timeoutMs = (this.currentConfig!.timeout || 5) * 1000;
      this.peerTlsFingerprint = null;

      let socket: net.Socket;
      if (useSsl) {
        socket = tls.connect({
          host,
          port,
          rejectUnauthorized: strictTls,
          timeout: timeoutMs
        }) as unknown as net.Socket;
      } else {
        socket = new net.Socket();
        socket.setTimeout(timeoutMs);
      }

      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      this.inProgressWords = [];

      let isHandshakeComplete = false;

      const connectTimer = setTimeout(() => {
        if (!isHandshakeComplete) {
          socket.destroy();
          reject(new Error(`تعذر الوصول إلى الراوتر على ${host}:${port} (انتهت مهلة الانتظار ${timeoutMs / 1000} ثوانٍ)`));
        }
      }, timeoutMs);

      socket.on("timeout", () => {
        if (!isHandshakeComplete) {
          clearTimeout(connectTimer);
          socket.destroy();
          reject(new Error(`انتهت مهلة الاستجابة من الراوتر (${host}:${port}). تحقق من كابل الشبكة وتفعيل خدمة API (منفذ ${port}).`));
        }
      });

      // حماية تامة ضد انهيارات Node / Electron وتنظيف الطلبات المعلقة
      socket.on("error", (err: any) => {
        this.isConnectedFlag = false;
        this.lastErrorMessage = err?.message || "انقطع الاتصال بالمقبس";
        for (const [_, pending] of this.pendingRequests.entries()) {
          if (pending.timeoutTimer) clearTimeout(pending.timeoutTimer);
          pending.reject(err);
        }
        this.pendingRequests.clear();
        if (!isHandshakeComplete) {
          clearTimeout(connectTimer);
          reject(err);
        }
      });

      socket.on("close", () => {
        this.isConnectedFlag = false;
        for (const [_, pending] of this.pendingRequests.entries()) {
          if (pending.timeoutTimer) clearTimeout(pending.timeoutTimer);
          pending.reject(new Error("أُغلق مقبس المايكروتك"));
        }
        this.pendingRequests.clear();
      });

      socket.on("data", (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.parseIncomingData();
      });

      const onConnect = async () => {
        if (useSsl) {
          try {
            const tlsSocket = socket as unknown as tls.TLSSocket;
            const peerCert = typeof tlsSocket.getPeerCertificate === "function" ? tlsSocket.getPeerCertificate() : null;
            const actualFingerprint = peerCert?.fingerprint256 ? String(peerCert.fingerprint256) : "";
            this.peerTlsFingerprint = actualFingerprint || null;

            if (expectedFingerprint && !verifyTlsFingerprint(expectedFingerprint, actualFingerprint)) {
              clearTimeout(connectTimer);
              socket.destroy();
              return reject(
                new Error(
                  `تم رفض اتصال API-SSL: بصمة شهادة TLS (${actualFingerprint || "غير متوفرة"}) لا تطابق البصمة المثبتة.`
                )
              );
            }
          } catch (certErr: any) {
            if (expectedFingerprint) {
              clearTimeout(connectTimer);
              socket.destroy();
              return reject(new Error(`تعذر التحقق من بصمة شهادة TLS: ${certErr?.message || "خطأ غير معروف"}`));
            }
          }
        }

        this.isConnectedFlag = true;

        try {
          // 1. محاولة المصادقة المباشرة (RouterOS v6.43+ و RouterOS v7)
          const loginWords = ["/login", `=name=${user}`, `=password=${password}`];
          const responseSentences = await this.sendSentenceAsync(loginWords, 8);

          let loginSucceeded = false;
          let challengeHex = "";

          for (const s of responseSentences) {
            if (s[0] === "!done") {
              // فحص إذا أرجع الراوتر تحدي MD5 (RouterOS الإصدارات القديمة)
              for (let i = 1; i < s.length; i++) {
                if (s[i].startsWith("=ret=")) {
                  challengeHex = s[i].substring(5);
                }
              }
              if (!challengeHex) {
                loginSucceeded = true;
              }
            } else if (s[0] === "!trap") {
              let msg = "بيانات الدخول غير صحيحة";
              for (let i = 1; i < s.length; i++) {
                if (s[i].startsWith("=message=")) msg = s[i].substring(9);
              }
              clearTimeout(connectTimer);
              socket.destroy();
              return reject(new Error(`فشل التحقق من بيانات الدخول: ${msg}`));
            }
          }

          // 2. إذا تطلب الراوتر المصادقة بتحدي MD5 (Legacy v5 / v6 < 6.43)
          if (!loginSucceeded && challengeHex) {
            const challengeBuf = Buffer.from(challengeHex, "hex");
            const passBuf = Buffer.from(password, "utf-8");
            const hash = crypto
              .createHash("md5")
              .update(Buffer.concat([Buffer.from([0]), passBuf, challengeBuf]))
              .digest("hex");

            const responseWords = ["/login", `=name=${user}`, `=response=00${hash}`];
            const challengeRes = await this.sendSentenceAsync(responseWords, 8);

            for (const s of challengeRes) {
              if (s[0] === "!done") {
                loginSucceeded = true;
              } else if (s[0] === "!trap") {
                let msg = "اسم المستخدم أو كلمة المرور غير صحيحة";
                for (let i = 1; i < s.length; i++) {
                  if (s[i].startsWith("=message=")) msg = s[i].substring(9);
                }
                clearTimeout(connectTimer);
                socket.destroy();
                return reject(new Error(`فشل التحقق من بيانات الدخول: ${msg}`));
              }
            }
          }

          if (!loginSucceeded) {
            clearTimeout(connectTimer);
            socket.destroy();
            return reject(new Error("فشل التحقق من صلاحيات المدير (Admin) على المايكروتك"));
          }

          // Verify user group has admin/full permissions
          try {
            const userCheck = await this.querySafe("/user/print", [`?name=${user}`]);
            if (userCheck && userCheck.length > 0) {
              const group = String(userCheck[0].group || "");
              if (group !== "admin" && group !== "full") {
                clearTimeout(connectTimer);
                socket.destroy();
                return reject(new Error("الحساب لا يمتلك صلاحيات المدير الكاملة (admin / full). يرجى استخدام حساب مدير كامل."));
              }
            }
          } catch (e) {
            // Best effort check - if print is forbidden, we can proceed
          }

          isHandshakeComplete = true;
          clearTimeout(connectTimer);
          try { socket.setTimeout(0); } catch {}

          // 3. جلب معلومات الراوتر الأساسية وتحديد الإصدار تلقائياً دفعة واحدة وبسرعة
          try {
            const [res, idRes, boardRes] = await Promise.all([
              this.querySafe("/system/resource/print", undefined, { timeoutSeconds: 3, rapid: true }),
              this.querySafe("/system/identity/print", undefined, { timeoutSeconds: 3, rapid: true }),
              this.querySafe("/system/routerboard/print", undefined, { timeoutSeconds: 3, rapid: true })
            ]);
            if (res[0]) {
              this.cachedResource = res[0];
              this.routerVersion = String(res[0].version || "");
              const major = parseInt(this.routerVersion.split(".")[0], 10);
              this.routerMajorVersion = !isNaN(major) ? major : 7;
              this.currentCpuLoad = parseInt(res[0]['cpu-load'] || "0", 10);
            }
            if (idRes[0]?.name) {
              this.routerIdentity = idRes[0].name;
            }
            if (boardRes[0]?.['board-name']) {
              this.routerBoard = boardRes[0]['board-name'];
            }
          } catch {
            this.routerMajorVersion = 7;
          }

          resolve();
        } catch (err: any) {
          clearTimeout(connectTimer);
          socket.destroy();
          reject(err);
        }
      };

      if (useSsl) {
        socket.on("secureConnect", onConnect);
      } else {
        socket.connect(port, host, onConnect);
      }
    });
  }

  private keepaliveFailures: number = 0;

  private startKeepalive() {
    this.stopKeepalive();
    this.keepaliveFailures = 0;
    this.keepaliveInterval = setInterval(async () => {
      if (this.isConnected()) {
        // تجنب إرسال استعلام Keepalive إذا كان هناك نشاط فعلي حديث على المقبس لتقليل الضغط على المعالج
        if (this.lastQueryTime > 0 && Date.now() - this.lastQueryTime < 45000) {
          return;
        }
        try {
          // Send a fast query as heartbeat to verify and keep connection alive
          await this.querySafe("/system/identity/print", undefined, { timeoutSeconds: 5, rapid: true });
          this.keepaliveFailures = 0;
        } catch (err: any) {
          this.keepaliveFailures += 1;
          // Only clean socket if socket is truly destroyed or after 3 consecutive failed heartbeats
          if (this.socket?.destroyed || this.keepaliveFailures >= 3) {
            this.disconnect(false); // Preserve currentConfig for automatic reconnection
          }
        }
      } else {
        this.stopKeepalive();
      }
    }, 60000);
    if (this.keepaliveInterval.unref) this.keepaliveInterval.unref();
  }

  private stopKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }
  }

  /**
   * تنظيف المقبس المؤقت ورفض كافة الطلبات المعلقة بأمان
   */
  private cleanupSocket() {
    this.stopKeepalive();
    for (const [_, pending] of this.pendingRequests.entries()) {
      if (pending.timeoutTimer) clearTimeout(pending.timeoutTimer);
      pending.reject(new Error("انقطع الاتصال بمقبس المايكروتك"));
    }
    this.pendingRequests.clear();
    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch {}
      this.socket = null;
    }
    this.buffer = Buffer.alloc(0);
  }

  /**
   * قطع الاتصال وتنظيف الموارد وطابور التهدئة بالكامل
   */
  async disconnect(clearConfig: boolean = true): Promise<void> {
    this.stopKeepalive();
    this.isConnectedFlag = false;
    this.connectionPromise = null;
    this.throttler.clearQueue();
    this.cleanupSocket();
    if (clearConfig) {
      this.currentConfig = null;
    }
    this.routerVersion = "";
    this.routerMajorVersion = 7;
    this.lastErrorMessage = "";
    this.lastQueryTime = 0;
    this.currentCpuLoad = 0;
    this.currentTemperature = 0;
    this.isEcoModeActive = false;
  }

  /**
   * التدمير الكامل لمورد الاتصال البرمجي وإغلاق كافة المقابس والـ Streams والطلبات المعلقة
   * التزاماً بالمبدأ الحاكم الأساسي: "كل شيء يُنشأ يجب أن يُدمَّر"
   */
  async dispose(): Promise<void> {
    await this.disconnect(true);
    this.buffer = Buffer.alloc(0);
    this.inProgressWords = [];
    this.pendingRequests.clear();
    this.throttler.clearQueue();
  }

  /**
   * تنفيذ الأوامر والاستعلامات عبر محرك تنظيم وتوزيع الطلبات (Request Throttler)
   * يحد العمليات المتزامنة إلى 3 طلبات كحد أقصى لمنع ارتفاع استهلاك الـ CPU وتشنج الراوتر
   * يقوم بجدولة الأوامر الفائضة في طابور تسلسلي منتظم ومعالجتها فور تحرر أي مسار
   */
  async query(
    endpoint: string,
    params?: string[],
    options?: { timeoutSeconds?: number; rapid?: boolean; priority?: boolean }
  ): Promise<any[]> {
    const timeoutSec = options?.timeoutSeconds || 10;
    const isMutation = endpoint.includes('/add') || endpoint.includes('/set') || endpoint.includes('/remove') || endpoint.includes('/enable') || endpoint.includes('/disable') || endpoint.includes('/reset');
    const isPriority = options?.priority !== undefined ? options.priority : isMutation;
    const isDeduplicatableRead = !isMutation && endpoint.endsWith('/print');

    // In-flight deduplication: if an identical read query is already running on this router, share its Promise
    const dedupKey = isDeduplicatableRead
      ? `${endpoint}|${Array.isArray(params) ? params.join('\u0001') : ''}`
      : null;

    if (dedupKey) {
      const existing = this.inFlightReads.get(dedupKey);
      if (existing) {
        this.dedupedQueriesCount++;
        return existing;
      }
    }

    const executePromise = this.throttler.execute(
      async (): Promise<any[]> => {
        if (!this.isConnected()) {
          const reconnected = await this.ensureConnected();
          if (!reconnected) {
            throw new Error(
              this.lastErrorMessage || "فشل الاتصال بالراوتر. يرجى التحقق من الشبكة وبيانات الدخول."
            );
          }
        }

        // درع الحماية الذكية لمعالج وذاكرة وبـينج المايكروتك:
        // يضبط الفاصل الزمني تلقائياً حسب ضغط المعالج وتذبذب البينج لمنع ارتفاع CPU أو Ping Spikes
        const stabPacing = this.pingStabilizer.getRecommendedThrottling().pacingMs;
        if (this.lastQueryTime > 0) {
          const elapsed = Date.now() - this.lastQueryTime;
          let targetPacing = Math.max(18, stabPacing);
          if (this.isThermalStressed() || (this.currentCpuLoad && this.currentCpuLoad > 55)) {
            targetPacing = Math.max(targetPacing, 65);
          } else if (options?.rapid || isMutation) {
            targetPacing = Math.min(targetPacing, 15);
          }
          if (elapsed < targetPacing) {
            await new Promise((resolve) => setTimeout(resolve, targetPacing - elapsed));
          }
        }

        const words = [endpoint];
        if (params && Array.isArray(params)) {
          for (const p of params) {
            if (p) {
              const str = String(p).trim();
              // Only strip leading '=' if someone passed '=.proplist=' or '=.tag=' (API control words)
              // Attributes like '=.id=' MUST retain the leading '=' for RouterOS to accept the argument
              let normalized = str;
              if (str.startsWith("=.proplist=") || str.startsWith("=.tag=")) {
                normalized = str.substring(1);
              } else if (!str.startsWith("=") && !str.startsWith("?") && !str.startsWith(".")) {
                normalized = `=${str}`;
              }
              words.push(normalized);
            }
          }
        }

        // Only lightweight single-row endpoints reflect true socket RTT (bulk /print queries must not distort Ping!)
        const isLightweightPingEndpoint =
          endpoint === "/system/resource/print" ||
          endpoint === "/system/identity/print" ||
          endpoint === "/system/clock/print" ||
          endpoint === "/system/routerboard/print";

        const qStart = Date.now();
        this.requestTimestamps.push(qStart);
        if (this.requestTimestamps.length > 600) {
          this.requestTimestamps = this.requestTimestamps.slice(-300);
        }
        try {
          const sentences = await this.sendSentenceAsync(words, timeoutSec);
          this.lastQueryTime = Date.now();
          const durationMs = Math.max(1, this.lastQueryTime - qStart);
          this.rttSamples.push(durationMs);
          if (this.rttSamples.length > 40) this.rttSamples.shift();
          if (isLightweightPingEndpoint) {
            this.lastSocketLatencyMs = durationMs;
            this.pingStabilizer.recordSample({ pingMs: durationMs });
            this.syncStabilizerToThrottler();
          }
          return this.parseResponseSentences(sentences);
        } catch (error: any) {
          this.lastQueryTime = Date.now();
          const message = (error?.message || "").toLowerCase();
          const isNetworkIssue = ["socket", "closed", "timeout", "not connected", "econnrefused", "reset", "مهلة"].some(
            (term) => message.includes(term)
          );

          if (isNetworkIssue) {
            this.isConnectedFlag = false;
            this.cleanupSocket();
            const reconnected = await this.ensureConnected();
            if (reconnected) {
              const retryStart = Date.now();
              const retrySentences = await this.sendSentenceAsync(words, timeoutSec);
              this.lastQueryTime = Date.now();
              const retryDur = Math.max(1, this.lastQueryTime - retryStart);
              this.rttSamples.push(retryDur);
              if (this.rttSamples.length > 40) this.rttSamples.shift();
              if (isLightweightPingEndpoint) {
                this.lastSocketLatencyMs = retryDur;
                this.pingStabilizer.recordSample({ pingMs: retryDur });
                this.syncStabilizerToThrottler();
              }
              return this.parseResponseSentences(retrySentences);
            }
          }

          throw error;
        }
      },
      {
        priority: isPriority,
        timeoutMs: (timeoutSec + 20) * 1000,
        pacingDelayMs: this.isThermalStressed()
          ? Math.max(60, this.pingStabilizer.getRecommendedThrottling().pacingMs)
          : options?.rapid || isMutation
          ? 12
          : Math.max(18, this.pingStabilizer.getRecommendedThrottling().pacingMs)
      }
    );

    if (dedupKey) {
      this.inFlightReads.set(dedupKey, executePromise);
      executePromise.finally(() => {
        if (this.inFlightReads.get(dedupKey) === executePromise) {
          this.inFlightReads.delete(dedupKey);
        }
      });
    }

    return executePromise;
  }

  /**
   * تنفيذ الاستعلام مع إرجاع مصفوفة خالية بدلاً من إلقاء استثناء مع محاولة بديلة تلقائية بدون معاملات مقيدة
   */
  async querySafe(endpoint: string, params?: string[], options?: { timeoutSeconds?: number; rapid?: boolean }): Promise<any[]> {
    try {
      const res = await this.query(endpoint, params, options);
      return Array.isArray(res) ? res : [];
    } catch {
      // إذا فشل الاستعلام بسبب معاملات مقيدة (مثل .proplist غير متطابق مع إصدار RouterOS الحالي)، نحاول فوراً بدون معاملات
      // تحذير: لا نقوم بإزالة فلاتر البحث والاستعلام (التي تبدأ بـ ?) لأن ذلك سيعيد جميع سجلات الراوتر كلياً بدلاً من السجل المطلوب
      if (params && params.length > 0) {
        const hasQueryFilter = params.some((p) => String(p).startsWith('?'));
        if (!hasQueryFilter) {
          try {
            const fallbackRes = await this.query(endpoint, undefined, options);
            return Array.isArray(fallbackRes) ? fallbackRes : [];
          } catch {
            return [];
          }
        }
      }
      return [];
    }
  }

  /**
   * نظام دمج الاستعلامات (Request Batching / Composite Request)
   * يتيح تنفيذ عدة استعلامات صغيرة (مثل حالة الواجهات، الـ CPU، الذاكرة، Identity) في دفعة واحدة منسقة
   * لتقليل زمن الاستجابة والضغط على معالج الراوتر وتجنب فتح وإغلاق المقابس المتكرر.
   */
  async batchQuery(queries: Array<{ endpoint: string; params?: string[] }>): Promise<Array<{ endpoint: string; success: boolean; data: any[] }>> {
    if (!Array.isArray(queries) || queries.length === 0) return [];

    const results: Array<{ endpoint: string; success: boolean; data: any[] }> = [];

    for (const q of queries) {
      if (!q || !q.endpoint) continue;
      try {
        const data = await this.query(q.endpoint, q.params, { rapid: true });
        results.push({
          endpoint: q.endpoint,
          success: true,
          data: Array.isArray(data) ? data : []
        });
      } catch {
        results.push({
          endpoint: q.endpoint,
          success: false,
          data: []
        });
      }
    }

    return results;
  }

  /**
   * فحص حالة الإنترنت الحقيقية في الراوتر وتتبع الاتصال مع تخزين مؤقت لحماية معالج الراوتر
   */
  async checkInternetConnectivity(options?: { force?: boolean; skipIcmpPing?: boolean }): Promise<InternetStatus> {
    const now = Date.now();
    const nowIso = new Date().toISOString();
    if (!this.isConnected()) {
      return {
        hasInternet: false,
        pingMs: 0,
        packetLoss: 100,
        checkedAt: nowIso
      };
    }

    const stressed = this.isThermalStressed() || this.pingStabilizer.shouldSuppressHeavyTelemetry();
    const cacheTtlMs = stressed ? 120000 : 60000;

    // Return cached result within TTL (60s normal, 120s under stress) to protect CPU & Ping
    if (!options?.force && this.cachedInternetStatus && now - this.lastInternetCheck < cacheTtlMs) {
      return this.cachedInternetStatus;
    }

    try {
      // 1. فحص مسار الإنترنت الافتراضي (Default Gateway Route)
      const routes = await this.querySafe("/ip/route/print", [
        "?dst-address=0.0.0.0/0",
        "?active=true",
        ".proplist=gateway"
      ]);
      const defaultRoute = routes[0];
      const gateway = defaultRoute?.gateway || "";

      // 2. فحص عنوان الـ WAN IP الفعلي
      const addresses = await this.querySafe("/ip/address/print", [
        "?disabled=false",
        ".proplist=address"
      ]);
      const wanAddr = addresses.find(
        (a) =>
          !a.address?.startsWith("192.168.") &&
          !a.address?.startsWith("10.") &&
          !a.address?.startsWith("172.16.") &&
          !a.address?.startsWith("127.")
      );
      const wanIp = wanAddr?.address || addresses[0]?.address || "";

      // 3. اختبار البينج الحي للإنترنت (نتخطاه أثناء الإجهاد الحراري أو عند طلب Skip لحماية البينج والمعالج)
      let pingSuccess = Boolean(gateway);
      let avgPing = this.getLatency();
      let loss = gateway ? 0 : 100;

      if (!options?.skipIcmpPing && !stressed) {
        try {
          const pingRes = await this.query(
            "/ping",
            ["=address=8.8.8.8", "=count=1", "=interval=0.5"],
            { timeoutSeconds: 2, rapid: true }
          );
          if (Array.isArray(pingRes) && pingRes.length > 0) {
            const validReplies = pingRes.filter((p) => p.status === "ok" || p.time || Number(p.received) > 0);
            if (validReplies.length > 0) {
              pingSuccess = true;
              loss = 0;
              const times = validReplies
                .map((p) => {
                  const tStr = p.time || p["avg-rtt"] || "20ms";
                  return parseInt(tStr.replace(/[^0-9]/g, ""), 10) || 20;
                })
                .filter((n) => !isNaN(n));
              avgPing = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : avgPing;
            }
          }
        } catch {
          // إذا كان أمر البينج غير متاح، نعتمد على وجود مسار افتراضي نشط
          pingSuccess = !!gateway;
          loss = gateway ? 0 : 100;
        }
      }

      const result: InternetStatus = {
        hasInternet: pingSuccess,
        pingMs: avgPing,
        packetLoss: loss,
        gateway,
        wanIp,
        checkedAt: nowIso
      };

      this.cachedInternetStatus = result;
      this.lastInternetCheck = now;
      return result;
    } catch {
      const fallback: InternetStatus = {
        hasInternet: false,
        pingMs: 0,
        packetLoss: 100,
        checkedAt: nowIso
      };
      return fallback;
    }
  }

  /**
   * تشخيص الاتصال المباشر وفحص جميع منافذ وخدمات الإدارة في الراوتر تلقائياً
   */
  async diagnoseHostAndPort(
    host: string,
    port: number = 8728
  ): Promise<{
    reachable: boolean;
    apiPortOpen: boolean;
    sslPortOpen: boolean;
    winboxOpen: boolean;
    webOpen: boolean;
    sshOpen: boolean;
    recommendedPort: number;
    recommendedService: string;
    useSsl: boolean;
    latencyMs: number;
    diagnosticMessage: string;
    portsSummary: Array<{
      port: number;
      name: string;
      open: boolean;
      latency: number;
      isApi: boolean;
      description: string;
    }>;
  }> {
    const probe = (targetPort: number, timeoutMs = 1500): Promise<{ port: number; open: boolean; latency: number }> => {
      return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);

        const done = (open: boolean) => {
          socket.removeAllListeners();
          socket.destroy();
          resolve({ port: targetPort, open, latency: Date.now() - start });
        };

        socket.on("connect", () => done(true));
        socket.on("error", () => done(false));
        socket.on("timeout", () => done(false));
        socket.connect(targetPort, host);
      });
    };

    // فحص متزامن وسريع لجميع منافذ الإدارة الشهيرة في مايكروتك
    const probeTargets = [
      { port: 8728, name: "API (RouterOS API)", isApi: true, desc: "منفذ الاتصال القياسي لبرامج الإدارة و ZCtrl" },
      { port: 8729, name: "API-SSL (Secure)", isApi: true, desc: "منفذ الاتصال المشفر لبرامج الإدارة" },
      { port: 8291, name: "WinBox", isApi: false, desc: "منفذ برنامج WinBox الرسمي من MikroTik" },
      { port: 80, name: "WebFig (HTTP)", isApi: false, desc: "واجهة متصفح الويب غير المشفرة" },
      { port: 443, name: "WebFig (HTTPS)", isApi: false, desc: "واجهة متصفح الويب المشفرة" },
      { port: 22, name: "SSH Terminal", isApi: false, desc: "منفذ سطر الأوامر والطرفية الآمنة" }
    ];

    // إضافة المنفذ المخصص إذا كان مختلفاً عن المنافذ الافتراضية
    if (port && !probeTargets.some(p => p.port === port)) {
      probeTargets.unshift({
        port,
        name: `Custom Port (${port})`,
        isApi: true,
        desc: "المنفذ المخصص المدخل في الإعدادات"
      });
    }

    const probeResults = await Promise.all(
      probeTargets.map(target => probe(target.port, 1600))
    );

    const resultMap = new Map<number, { open: boolean; latency: number }>();
    probeResults.forEach(r => resultMap.set(r.port, { open: r.open, latency: r.latency }));

    const portsSummary = probeTargets.map(t => {
      const res = resultMap.get(t.port) || { open: false, latency: 0 };
      return {
        port: t.port,
        name: t.name,
        open: res.open,
        latency: res.latency,
        isApi: t.isApi,
        description: t.desc
      };
    });

    const isTargetOpen = resultMap.get(port)?.open || false;
    const is8728Open = resultMap.get(8728)?.open || false;
    const is8729Open = resultMap.get(8729)?.open || false;
    const isWinboxOpen = resultMap.get(8291)?.open || false;
    const isWebOpen = resultMap.get(80)?.open || false;
    const isHttpsOpen = resultMap.get(443)?.open || false;
    const isSshOpen = resultMap.get(22)?.open || false;

    const isReachable = portsSummary.some(p => p.open);

    // تحديد المنفذ الموصى به لتسجيل الدخول
    let recommendedPort = port;
    let recommendedService = "API";
    let useSsl = false;
    let message = "";

    if (isTargetOpen && (port === 8728 || port === 8729 || port > 1024)) {
      recommendedPort = port;
      useSsl = port === 8729;
      recommendedService = port === 8729 ? "API-SSL" : "API";
      message = `منفذ الـ API (${port}) مفتوح ومستجيب بنجاح زمن الاستجابة ${resultMap.get(port)?.latency}ms. جاهز للاتصال فوراً.`;
    } else if (is8728Open) {
      recommendedPort = 8728;
      useSsl = false;
      recommendedService = "API";
      message = `منفذ الـ API القياسي (8728) مفتوح ويستجيب بنجاح (${resultMap.get(8728)?.latency}ms). موصى به لتسجيل الدخول.`;
    } else if (is8729Open) {
      recommendedPort = 8729;
      useSsl = true;
      recommendedService = "API-SSL";
      message = `منفذ API-SSL المشفر (8729) مفتوح ويستجيب بنجاح (${resultMap.get(8729)?.latency}ms). يمكنك تسجيل الدخول مع تفعيل خيار SSL.`;
    } else if (isWinboxOpen || isWebOpen || isHttpsOpen || isSshOpen) {
      const openServices: string[] = [];
      if (isWinboxOpen) openServices.push("WinBox 8291");
      if (isWebOpen) openServices.push("Web 80");
      if (isHttpsOpen) openServices.push("HTTPS 443");
      if (isSshOpen) openServices.push("SSH 22");

      message = `الراوتر متاح ويستجيب على (${openServices.join("، ")})، لكن خدمة الـ API مغلقة حالياً. يرجى تفعيلها من داخل الراوتر عبر: IP -> Services -> api (Port: 8728) للتمكن من الاتصال.`;
      recommendedPort = 8728;
    } else {
      message = `تعذر الوصول إلى عنوان IP (${host}). تأكد من توصيل الكابل ومطابقة عنوان الشبكة والـ Subnet مع جهازك، أو تحقق من تفعيل منفذ الإدارة.`;
    }

    const effectiveLatency = portsSummary.find(p => p.open)?.latency || 0;

    return {
      reachable: isReachable,
      apiPortOpen: is8728Open || (port === 8728 && isTargetOpen),
      sslPortOpen: is8729Open || (port === 8729 && isTargetOpen),
      winboxOpen: isWinboxOpen,
      webOpen: isWebOpen,
      sshOpen: isSshOpen,
      recommendedPort,
      recommendedService,
      useSsl,
      latencyMs: effectiveLatency,
      diagnosticMessage: message,
      portsSummary
    };
  }
}

export const createMikrotikClient = () => new MikrotikClient();
export const MikrotikAPI = new MikrotikClient();

