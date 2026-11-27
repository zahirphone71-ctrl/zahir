// ============================================================
//  ZCtrl Auto-Ping & CPU Stabilizer Engine
//  - Tracks real-time Ping RTT (EWMA), Jitter, Packet Loss & CPU
//  - Dynamically regulates API concurrency, pacing delay & WS cadence
//  - Optional RouterOS QoS Fast-Lane (ICMP / DNS / TCP ACK Priority 1)
// ============================================================

import crypto from "crypto";

export type PingStabilizerMode = "auto" | "aggressive" | "balanced" | "off";
export type PingStabilizerState = "optimal" | "elevated" | "stabilizing" | "critical";

export interface PingStabilizerConfig {
  mode: PingStabilizerMode;
  targetPingMs: number;
  maxCpuThreshold: number;
  autoQosEnabled: boolean;
}

export interface PingStabilizerSample {
  timestamp: number;
  pingMs: number;
  ewmaPingMs: number;
  jitterMs: number;
  cpuLoad: number;
  packetLoss: number;
}

export interface PingStabilizerAction {
  id: string;
  timestamp: number;
  state: PingStabilizerState;
  message: string;
}

export interface RouterQosFastLaneStatus {
  active: boolean;
  mangleRulesCount: number;
  queueRulesCount: number;
  fastLanePackets: number;
  fastLaneBytes: number;
  prioritizeManagementApi: boolean;
  interfaceList?: string;
  maxLimit?: string;
  checkedAt: number | null;
}

export interface RouterQosRulePreview {
  id: string;
  table: "mangle" | "queue_tree";
  chain: string;
  action: string;
  target: string;
  description: string;
  command: string;
  params: string[];
}

export interface PingStabilizerSnapshot {
  mode: PingStabilizerMode;
  state: PingStabilizerState;
  targetPingMs: number;
  maxCpuThreshold: number;
  autoQosEnabled: boolean;
  currentPingMs: number;
  ewmaPingMs: number;
  minPingMs: number;
  maxPingMs: number;
  jitterMs: number;
  packetLossPercent: number;
  cpuLoad: number;
  cpuTemp: number;
  samplesCount: number;
  recommendedMaxConcurrent: number;
  recommendedPacingMs: number;
  recommendedWsIntervalMs: number;
  recommendedSyncIntervalSec: number;
  suppressHeavyTelemetry: boolean;
  qosFastLane: RouterQosFastLaneStatus;
  recentActions: PingStabilizerAction[];
  history: PingStabilizerSample[];
  updatedAt: number;
}

export const ZCTRL_QOS_COMMENT_TAG = "ZCTRL_AUTO_PING_QOS";
export const ZCTRL_QOS_PACKET_MARK = "zctrl_fast_ping";
export const ZCTRL_QOS_QUEUE_NAME = "ZCtrl-AutoPing-FastLane";

export class AutoPingStabilizer {
  private mode: PingStabilizerMode = "auto";
  private targetPingMs: number = 45;
  private maxCpuThreshold: number = 60;
  private autoQosEnabled: boolean = false;

  private state: PingStabilizerState = "optimal";
  private pendingState: PingStabilizerState | null = null;
  private pendingStateCount: number = 0;
  private currentPingMs: number = 0;
  private ewmaPingMs: number = 0;
  private minPingMs: number = 0;
  private maxPingMs: number = 0;
  private jitterMs: number = 0;
  private packetLossPercent: number = 0;
  private cpuLoad: number = 0;
  private cpuTemp: number = 0;
  private samplesCount: number = 0;
  private updatedAt: number = Date.now();

  private recommendedMaxConcurrent: number = 2;
  private recommendedPacingMs: number = 8;
  private recommendedWsIntervalMs: number = 7500;
  private recommendedSyncIntervalSec: number = 60;
  private suppressHeavyTelemetry: boolean = false;

  private history: PingStabilizerSample[] = [];
  private recentActions: PingStabilizerAction[] = [];
  private qosFastLane: RouterQosFastLaneStatus = {
    active: false,
    mangleRulesCount: 0,
    queueRulesCount: 0,
    fastLanePackets: 0,
    fastLaneBytes: 0,
    prioritizeManagementApi: true,
    checkedAt: null
  };

  constructor(initialConfig?: Partial<PingStabilizerConfig>) {
    if (initialConfig) {
      this.updateConfig(initialConfig);
    }
    this.recomputeControlParameters(false);
  }

  updateConfig(partial: Partial<PingStabilizerConfig>): PingStabilizerSnapshot {
    const prevMode = this.mode;
    if (
      partial.mode &&
      (["auto", "aggressive", "balanced", "off"] as PingStabilizerMode[]).includes(partial.mode)
    ) {
      this.mode = partial.mode;
    }
    if (typeof partial.targetPingMs === "number" && Number.isFinite(partial.targetPingMs)) {
      this.targetPingMs = Math.max(15, Math.min(250, Math.round(partial.targetPingMs)));
    }
    if (typeof partial.maxCpuThreshold === "number" && Number.isFinite(partial.maxCpuThreshold)) {
      this.maxCpuThreshold = Math.max(35, Math.min(90, Math.round(partial.maxCpuThreshold)));
    }
    if (typeof partial.autoQosEnabled === "boolean") {
      this.autoQosEnabled = partial.autoQosEnabled;
    }

    this.recomputeControlParameters(true);

    if (prevMode !== this.mode) {
      const modeNames: Record<PingStabilizerMode, string> = {
        auto: "تلقائي ذكي",
        aggressive: "حماية قصوى للبينج",
        balanced: "متوازن",
        off: "إيقاف التنظيم التلقائي"
      };
      this.pushAction(`تم تغيير وضع منظم البينج إلى: ${modeNames[this.mode]}`);
    }

    this.updatedAt = Date.now();
    return this.getSnapshot();
  }

  recordSample(input: {
    pingMs?: number;
    cpuLoad?: number;
    cpuTemp?: number;
    packetLoss?: number;
  }): PingStabilizerSnapshot {
    const now = Date.now();

    if (typeof input.cpuLoad === "number" && Number.isFinite(input.cpuLoad)) {
      this.cpuLoad = Math.max(0, Math.min(100, Math.round(input.cpuLoad)));
    }
    if (typeof input.cpuTemp === "number" && Number.isFinite(input.cpuTemp)) {
      this.cpuTemp = Math.max(0, Math.min(130, Math.round(input.cpuTemp)));
    }
    if (typeof input.packetLoss === "number" && Number.isFinite(input.packetLoss)) {
      this.packetLossPercent = Math.max(0, Math.min(100, Math.round(input.packetLoss)));
    }

    if (typeof input.pingMs === "number" && Number.isFinite(input.pingMs) && input.pingMs > 0) {
      const clampedPing = Math.max(1, Math.min(5000, Math.round(input.pingMs)));
      if (this.samplesCount === 0) {
        this.currentPingMs = clampedPing;
        this.ewmaPingMs = clampedPing;
        this.minPingMs = clampedPing;
        this.maxPingMs = clampedPing;
        this.jitterMs = 0;
      } else {
        const delta = Math.abs(clampedPing - this.currentPingMs);
        // RFC 3550 smoothed jitter + EWMA RTT (alpha = 0.3 for responsive spike detection)
        this.jitterMs = Math.round(this.jitterMs + (delta - this.jitterMs) / 4);
        this.ewmaPingMs = Math.round(this.ewmaPingMs * 0.7 + clampedPing * 0.3);
        this.currentPingMs = clampedPing;
        this.minPingMs = Math.min(this.minPingMs, clampedPing);
        this.maxPingMs = Math.max(this.maxPingMs, clampedPing);
      }
      this.samplesCount += 1;

      this.history.push({
        timestamp: now,
        pingMs: this.currentPingMs,
        ewmaPingMs: this.ewmaPingMs,
        jitterMs: this.jitterMs,
        cpuLoad: this.cpuLoad,
        packetLoss: this.packetLossPercent
      });
      if (this.history.length > 24) {
        this.history.shift();
      }
    }

    this.recomputeControlParameters(true);
    this.updatedAt = now;
    return this.getSnapshot();
  }

  setQosFastLaneStatus(status: Partial<RouterQosFastLaneStatus>): void {
    this.qosFastLane = {
      ...this.qosFastLane,
      ...status,
      checkedAt: Date.now()
    };
    this.updatedAt = Date.now();
  }

  resetStats(): PingStabilizerSnapshot {
    this.state = "optimal";
    this.pendingState = null;
    this.pendingStateCount = 0;
    this.currentPingMs = 0;
    this.ewmaPingMs = 0;
    this.minPingMs = 0;
    this.maxPingMs = 0;
    this.jitterMs = 0;
    this.packetLossPercent = 0;
    this.samplesCount = 0;
    this.history = [];
    this.recomputeControlParameters(false);
    this.pushAction("تم تصفير إحصائيات البينج وإعادة معايرة المنظم التلقائي");
    this.updatedAt = Date.now();
    return this.getSnapshot();
  }

  shouldSuppressHeavyTelemetry(): boolean {
    return this.suppressHeavyTelemetry;
  }

  getRecommendedWsIntervalMs(): number {
    return this.recommendedWsIntervalMs;
  }

  getRecommendedThrottling(): { maxConcurrent: number; pacingMs: number } {
    return {
      maxConcurrent: this.recommendedMaxConcurrent,
      pacingMs: this.recommendedPacingMs
    };
  }

  getSnapshot(): PingStabilizerSnapshot {
    return {
      mode: this.mode,
      state: this.state,
      targetPingMs: this.targetPingMs,
      maxCpuThreshold: this.maxCpuThreshold,
      autoQosEnabled: this.autoQosEnabled,
      currentPingMs: this.currentPingMs,
      ewmaPingMs: this.ewmaPingMs,
      minPingMs: this.minPingMs,
      maxPingMs: this.maxPingMs,
      jitterMs: this.jitterMs,
      packetLossPercent: this.packetLossPercent,
      cpuLoad: this.cpuLoad,
      cpuTemp: this.cpuTemp,
      samplesCount: this.samplesCount,
      recommendedMaxConcurrent: this.recommendedMaxConcurrent,
      recommendedPacingMs: this.recommendedPacingMs,
      recommendedWsIntervalMs: this.recommendedWsIntervalMs,
      recommendedSyncIntervalSec: this.recommendedSyncIntervalSec,
      suppressHeavyTelemetry: this.suppressHeavyTelemetry,
      qosFastLane: { ...this.qosFastLane },
      recentActions: this.recentActions.slice(0, 12),
      history: this.history.slice(-20),
      updatedAt: this.updatedAt
    };
  }

  private recomputeControlParameters(logTransition: boolean): void {
    const prevState = this.state;

    if (this.mode === "off") {
      this.state = "optimal";
      this.pendingState = null;
      this.pendingStateCount = 0;
      this.recommendedMaxConcurrent = 2;
      this.recommendedPacingMs = 8;
      this.recommendedWsIntervalMs = 7500;
      this.recommendedSyncIntervalSec = 60;
      this.suppressHeavyTelemetry = false;
      return;
    }

    const effectivePing = this.samplesCount > 0 ? Math.max(this.ewmaPingMs, Math.round(this.currentPingMs * 0.85)) : 0;
    const target = this.mode === "aggressive" ? Math.max(15, Math.round(this.targetPingMs * 0.75)) : this.targetPingMs;
    const cpuLimit = this.mode === "aggressive" ? Math.max(50, this.maxCpuThreshold - 5) : this.maxCpuThreshold;

    let candidateState: PingStabilizerState = "optimal";

    if (
      effectivePing >= target * 2.8 ||
      this.packetLossPercent >= 20 ||
      this.cpuLoad >= Math.min(92, cpuLimit + 25) ||
      this.cpuTemp >= 72
    ) {
      candidateState = "critical";
    } else if (
      effectivePing >= target * 1.65 ||
      this.jitterMs >= 35 ||
      this.packetLossPercent >= 10 ||
      this.cpuLoad >= Math.min(84, cpuLimit + 12) ||
      this.cpuTemp >= 64
    ) {
      candidateState = "stabilizing";
    } else if (
      effectivePing > target ||
      this.jitterMs >= 18 ||
      this.cpuLoad >= cpuLimit ||
      this.cpuTemp >= 58
    ) {
      candidateState = "elevated";
    }

    // Hysteresis: require 3 consecutive readings in the same candidate direction before changing state
    let nextState = this.state;
    if (candidateState === this.state) {
      this.pendingState = null;
      this.pendingStateCount = 0;
    } else if (this.pendingState === candidateState) {
      this.pendingStateCount += 1;
      if (this.pendingStateCount >= 3) {
        nextState = candidateState;
        this.pendingState = null;
        this.pendingStateCount = 0;
      }
    } else {
      this.pendingState = candidateState;
      this.pendingStateCount = 1;
    }

    this.state = nextState;

    if (this.mode === "aggressive") {
      switch (nextState) {
        case "critical":
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 150;
          this.recommendedWsIntervalMs = 25000;
          this.recommendedSyncIntervalSec = 240;
          this.suppressHeavyTelemetry = true;
          break;
        case "stabilizing":
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 95;
          this.recommendedWsIntervalMs = 16000;
          this.recommendedSyncIntervalSec = 180;
          this.suppressHeavyTelemetry = true;
          break;
        case "elevated":
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 45;
          this.recommendedWsIntervalMs = 10000;
          this.recommendedSyncIntervalSec = 120;
          this.suppressHeavyTelemetry = true;
          break;
        default:
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 15;
          this.recommendedWsIntervalMs = 7500;
          this.recommendedSyncIntervalSec = 90;
          this.suppressHeavyTelemetry = false;
          break;
      }
    } else if (this.mode === "balanced") {
      switch (nextState) {
        case "critical":
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 120;
          this.recommendedWsIntervalMs = 20000;
          this.recommendedSyncIntervalSec = 180;
          this.suppressHeavyTelemetry = true;
          break;
        case "stabilizing":
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 60;
          this.recommendedWsIntervalMs = 12000;
          this.recommendedSyncIntervalSec = 120;
          this.suppressHeavyTelemetry = true;
          break;
        case "elevated":
          this.recommendedMaxConcurrent = 2;
          this.recommendedPacingMs = 25;
          this.recommendedWsIntervalMs = 9500;
          this.recommendedSyncIntervalSec = 90;
          this.suppressHeavyTelemetry = false;
          break;
        default:
          this.recommendedMaxConcurrent = 2;
          this.recommendedPacingMs = 8;
          this.recommendedWsIntervalMs = 7500;
          this.recommendedSyncIntervalSec = 60;
          this.suppressHeavyTelemetry = false;
          break;
      }
    } else {
      // 'auto' — Smart Adaptive Auto-Stabilizer
      switch (nextState) {
        case "critical":
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 140;
          this.recommendedWsIntervalMs = 25000;
          this.recommendedSyncIntervalSec = 240;
          this.suppressHeavyTelemetry = true;
          break;
        case "stabilizing":
          this.recommendedMaxConcurrent = 1;
          this.recommendedPacingMs = 75;
          this.recommendedWsIntervalMs = 16000;
          this.recommendedSyncIntervalSec = 150;
          this.suppressHeavyTelemetry = true;
          break;
        case "elevated":
          this.recommendedMaxConcurrent = 2;
          this.recommendedPacingMs = 30;
          this.recommendedWsIntervalMs = 9500;
          this.recommendedSyncIntervalSec = 100;
          this.suppressHeavyTelemetry = false;
          break;
        default:
          this.recommendedMaxConcurrent = 2;
          this.recommendedPacingMs = 8;
          this.recommendedWsIntervalMs = 7500;
          this.recommendedSyncIntervalSec = 60;
          this.suppressHeavyTelemetry = false;
          break;
      }
    }

    if (logTransition && prevState !== nextState) {
      const intervalSec = Math.round(this.recommendedWsIntervalMs / 1000);
      if (nextState === "critical") {
        this.pushAction(
          `درع الحماية القصوى: البينج ${this.ewmaPingMs}ms / المعالج ${this.cpuLoad}% — تم خفض التزامن إلى 1 وإبطاء البث إلى ${intervalSec}ث وإيقاف القنوات الثقيلة تلقائياً`
        );
      } else if (nextState === "stabilizing") {
        this.pushAction(
          `ضبط البينج التلقائي: البينج ${this.ewmaPingMs}ms (تذبذب ${this.jitterMs}ms) — تم تفعيل التهدئة (${this.recommendedPacingMs}ms) وتوسيع الفاصل إلى ${intervalSec}ث`
        );
      } else if (nextState === "elevated") {
        this.pushAction(
          `رصد ارتفاع طفيف (Ping ${this.ewmaPingMs}ms / CPU ${this.cpuLoad}%) — تم تقليص التزامن تلقائياً للحفاظ على استقرار الشبكة`
        );
      } else {
        this.pushAction(
          `استقرار كامل: عاد البينج إلى ${this.ewmaPingMs}ms والمعالج ${this.cpuLoad}% — استئناف الوتيرة الهادئة (${intervalSec}ث)`
        );
      }
    }
  }

  private pushAction(message: string): void {
    const entry: PingStabilizerAction = {
      id: `act_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      timestamp: Date.now(),
      state: this.state,
      message
    };
    this.recentActions.unshift(entry);
    if (this.recentActions.length > 15) {
      this.recentActions.length = 15;
    }
  }
}

// ============================================================
// RouterOS Live Ping Probe & QoS Fast-Lane (ICMP/DNS/ACK Priority 1)
// ============================================================

export interface RouterClientLike {
  isConnected(): boolean;
  query(endpoint: string, params?: string[], options?: any): Promise<any[]>;
  querySafe(endpoint: string, params?: string[], options?: any): Promise<any[]>;
  getLatency?(): number;
  getPingStabilizer?(): AutoPingStabilizer;
  updateHardwareMetrics?(cpuLoad?: number, temperature?: number, pingMs?: number): void;
  recordIcmpPingSample?(pingMs: number, packetLoss?: number): void;
}

function parseRouterOsPingTimeMs(raw: any): number | null {
  if (raw === undefined || raw === null) return null;
  const str = String(raw).trim().toLowerCase();
  if (!str) return null;
  // RouterOS formats: "14ms", "14ms210us", "850us", "00:00:00.015", "15"
  const msMatch = str.match(/(\d+(?:\.\d+)?)\s*ms/);
  if (msMatch) {
    return Math.max(1, Math.round(parseFloat(msMatch[1])));
  }
  const usMatch = str.match(/^(\d+(?:\.\d+)?)\s*us$/);
  if (usMatch) {
    return Math.max(1, Math.round(parseFloat(usMatch[1]) / 1000));
  }
  const colonMatch = str.match(/\d+:\d+:(\d+(?:\.\d+)?)/);
  if (colonMatch) {
    return Math.max(1, Math.round(parseFloat(colonMatch[1]) * 1000));
  }
  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  return Number.isFinite(num) && num > 0 ? Math.max(1, Math.round(num)) : null;
}

export async function runActivePingProbe(
  client: RouterClientLike,
  options?: { target?: string; count?: number }
): Promise<{
  target: string;
  avgPingMs: number;
  minPingMs: number;
  maxPingMs: number;
  jitterMs: number;
  packetLoss: number;
  samples: number[];
  source: "router_icmp" | "socket_rtt";
}> {
  const target = (options?.target || "1.1.1.1").trim();
  const count = Math.max(1, Math.min(5, options?.count ?? 3));

  const samples: number[] = [];
  let packetLoss = 0;
  let source: "router_icmp" | "socket_rtt" = "router_icmp";

  try {
    const pingRes = await client.query(
      "/ping",
      [`=address=${target}`, `=count=${count}`, "=interval=0.25"],
      { timeoutSeconds: 4, rapid: true, priority: true }
    );
    if (Array.isArray(pingRes) && pingRes.length > 0) {
      let sent = 0;
      let received = 0;
      for (const row of pingRes) {
        if (!row) continue;
        if (row.sent !== undefined) sent = Math.max(sent, parseInt(String(row.sent), 10) || 0);
        if (row.received !== undefined) received = Math.max(received, parseInt(String(row.received), 10) || 0);
        const ms = parseRouterOsPingTimeMs(row.time ?? row["avg-rtt"]);
        if (ms !== null) samples.push(ms);
      }
      if (sent > 0) {
        packetLoss = Math.max(0, Math.min(100, Math.round(((sent - received) / sent) * 100)));
      } else if (samples.length === 0) {
        packetLoss = 100;
      }
    }
  } catch {
    // Fallback to lightweight socket RTT probe if ICMP is blocked or router has no WAN
  }

  if (samples.length === 0) {
    source = "socket_rtt";
    packetLoss = 0;
    for (let i = 0; i < 2; i++) {
      const start = Date.now();
      await client.querySafe("/system/identity/print", undefined, { timeoutSeconds: 3, rapid: true });
      samples.push(Math.max(1, Date.now() - start));
    }
  }

  const minPingMs = Math.min(...samples);
  const maxPingMs = Math.max(...samples);
  const avgPingMs = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  let jitterSum = 0;
  for (let i = 1; i < samples.length; i++) {
    jitterSum += Math.abs(samples[i] - samples[i - 1]);
  }
  const jitterMs = samples.length > 1 ? Math.round(jitterSum / (samples.length - 1)) : 0;

  if (source === "router_icmp") {
    if (typeof client.recordIcmpPingSample === "function") {
      for (const s of samples) {
        client.recordIcmpPingSample(s, packetLoss);
      }
    } else if (typeof client.getPingStabilizer === "function") {
      const stab = client.getPingStabilizer();
      for (const s of samples) {
        stab.recordSample({ pingMs: s, packetLoss });
      }
    }
  }

  return {
    target,
    avgPingMs,
    minPingMs,
    maxPingMs,
    jitterMs,
    packetLoss,
    samples,
    source
  };
}

function sanitizeRouterOsListToken(value: string | undefined, fallback: string): string {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9._:/-]/g, "");
  return cleaned || fallback;
}

export function previewRouterPingFastLaneRules(options?: {
  prioritizeManagementApi?: boolean;
  interfaceList?: string;
  maxLimit?: string;
}): {
  interfaceList: string;
  maxLimit: string;
  rules: RouterQosRulePreview[];
} {
  const prioritizeMgmt = options?.prioritizeManagementApi !== false;
  const interfaceList = sanitizeRouterOsListToken(options?.interfaceList, "WAN");
  const maxLimit = sanitizeRouterOsListToken(options?.maxLimit, "10M");

  const rules: RouterQosRulePreview[] = [
    {
      id: "ICMP_PRE",
      table: "mangle",
      chain: "prerouting",
      action: "mark-packet",
      target: ZCTRL_QOS_PACKET_MARK,
      description: `وسم حزم ICMP الواردة عبر قائمة الواجهات (${interfaceList}) بأولوية البينج`,
      command: `/ip firewall mangle add chain=prerouting in-interface-list=${interfaceList} protocol=icmp action=mark-packet new-packet-mark=${ZCTRL_QOS_PACKET_MARK} passthrough=no comment="${ZCTRL_QOS_COMMENT_TAG}:ICMP_PRE"`,
      params: [
        `in-interface-list=${interfaceList}`,
        "protocol=icmp",
        "passthrough=no",
        `new-packet-mark=${ZCTRL_QOS_PACKET_MARK}`
      ]
    },
    {
      id: "DNS_UDP",
      table: "mangle",
      chain: "prerouting",
      action: "mark-packet",
      target: ZCTRL_QOS_PACKET_MARK,
      description: `وسم استعلامات DNS UDP/53 الواردة عبر (${interfaceList})`,
      command: `/ip firewall mangle add chain=prerouting in-interface-list=${interfaceList} protocol=udp dst-port=53 action=mark-packet new-packet-mark=${ZCTRL_QOS_PACKET_MARK} passthrough=no comment="${ZCTRL_QOS_COMMENT_TAG}:DNS_UDP"`,
      params: [
        `in-interface-list=${interfaceList}`,
        "protocol=udp",
        "dst-port=53",
        "passthrough=no",
        `new-packet-mark=${ZCTRL_QOS_PACKET_MARK}`
      ]
    }
  ];

  if (prioritizeMgmt) {
    rules.push({
      id: "MGMT_API",
      table: "mangle",
      chain: "prerouting",
      action: "mark-packet",
      target: ZCTRL_QOS_PACKET_MARK,
      description: `أولوية منافذ إدارة الراوتر (8728,8729,8291) عبر (${interfaceList})`,
      command: `/ip firewall mangle add chain=prerouting in-interface-list=${interfaceList} protocol=tcp dst-port=8728,8729,8291 action=mark-packet new-packet-mark=${ZCTRL_QOS_PACKET_MARK} passthrough=no comment="${ZCTRL_QOS_COMMENT_TAG}:MGMT_API"`,
      params: [
        `in-interface-list=${interfaceList}`,
        "protocol=tcp",
        "dst-port=8728,8729,8291",
        "passthrough=no",
        `new-packet-mark=${ZCTRL_QOS_PACKET_MARK}`
      ]
    });
  }

  rules.push({
    id: "QUEUE",
    table: "queue_tree",
    chain: "global",
    action: "priority=1",
    target: ZCTRL_QOS_QUEUE_NAME,
    description: `طابور أولوية (Priority 1) بسقف سرعة محدد (${maxLimit}) لمنع استنزاف الشبكة`,
    command: `/queue tree add name=${ZCTRL_QOS_QUEUE_NAME} parent=global packet-mark=${ZCTRL_QOS_PACKET_MARK} priority=1 max-limit=${maxLimit} queue=default comment="${ZCTRL_QOS_COMMENT_TAG}:QUEUE"`,
    params: [
      `name=${ZCTRL_QOS_QUEUE_NAME}`,
      "parent=global",
      `packet-mark=${ZCTRL_QOS_PACKET_MARK}`,
      "priority=1",
      `max-limit=${maxLimit}`
    ]
  });

  return { interfaceList, maxLimit, rules };
}

export async function getRouterPingFastLaneStatus(client: RouterClientLike): Promise<RouterQosFastLaneStatus> {
  if (!client || !client.isConnected()) {
    return {
      active: false,
      mangleRulesCount: 0,
      queueRulesCount: 0,
      fastLanePackets: 0,
      fastLaneBytes: 0,
      prioritizeManagementApi: true,
      interfaceList: "WAN",
      maxLimit: "10M",
      checkedAt: Date.now()
    };
  }

  const [mangles, queues] = await Promise.all([
    client
      .querySafe("/ip/firewall/mangle/print", [
        ".proplist=.id,comment,disabled,packets,bytes,dst-port,in-interface-list"
      ], { timeoutSeconds: 5, rapid: true })
      .catch(() => []),
    client
      .querySafe("/queue/tree/print", [
        ".proplist=.id,name,comment,disabled,packets,bytes,max-limit"
      ], { timeoutSeconds: 5, rapid: true })
      .catch(() => [])
  ]);

  const ourMangles = (Array.isArray(mangles) ? mangles : []).filter(
    (m: any) => String(m?.comment || "").includes(ZCTRL_QOS_COMMENT_TAG) && m?.disabled !== "true" && m?.disabled !== true
  );
  const ourQueues = (Array.isArray(queues) ? queues : []).filter(
    (q: any) =>
      (String(q?.comment || "").includes(ZCTRL_QOS_COMMENT_TAG) || q?.name === ZCTRL_QOS_QUEUE_NAME) &&
      q?.disabled !== "true" &&
      q?.disabled !== true
  );

  const fastLanePackets = ourQueues.reduce((sum: number, q: any) => sum + (parseInt(q?.packets || "0", 10) || 0), 0);
  const fastLaneBytes = ourQueues.reduce((sum: number, q: any) => sum + (parseInt(q?.bytes || "0", 10) || 0), 0);
  const hasMgmtRule = ourMangles.some((m: any) => String(m?.comment || "").includes("MGMT_API"));
  const activeInterfaceList = ourMangles[0]?.["in-interface-list"] || "WAN";
  const activeMaxLimit = ourQueues[0]?.["max-limit"] || "10M";

  const status: RouterQosFastLaneStatus = {
    active: ourMangles.length > 0 && ourQueues.length > 0,
    mangleRulesCount: ourMangles.length,
    queueRulesCount: ourQueues.length,
    fastLanePackets,
    fastLaneBytes,
    prioritizeManagementApi: hasMgmtRule || ourMangles.length === 0,
    interfaceList: activeInterfaceList,
    maxLimit: activeMaxLimit,
    checkedAt: Date.now()
  };

  if (typeof client.getPingStabilizer === "function") {
    client.getPingStabilizer().setQosFastLaneStatus(status);
  }

  return status;
}

export async function applyRouterPingFastLane(
  client: RouterClientLike,
  options?: { prioritizeManagementApi?: boolean; interfaceList?: string; maxLimit?: string }
): Promise<{ success: boolean; createdRules: number; status: RouterQosFastLaneStatus; message: string }> {
  if (!client || !client.isConnected()) {
    throw new Error("الراوتر غير متصل حالياً لتطبيق مسار أولوية البينج.");
  }

  const prioritizeMgmt = options?.prioritizeManagementApi !== false;
  const interfaceList = sanitizeRouterOsListToken(options?.interfaceList, "WAN");
  const maxLimit = sanitizeRouterOsListToken(options?.maxLimit, "10M");

  // Inspect existing rules first for 100% idempotency
  const [existingMangles, existingQueues] = await Promise.all([
    client.querySafe("/ip/firewall/mangle/print", [".proplist=.id,comment"], { timeoutSeconds: 5, rapid: true }).catch(() => []),
    client.querySafe("/queue/tree/print", [".proplist=.id,name,comment"], { timeoutSeconds: 5, rapid: true }).catch(() => [])
  ]);

  const existingComments = new Set(
    (Array.isArray(existingMangles) ? existingMangles : []).map((m: any) => String(m?.comment || ""))
  );

  // Scoped safe mangle rules: bound to interfaceList and EXCLUDING global TCP ACK or duplicate ICMP_POST
  const desiredMangleRules: Array<{ comment: string; params: string[] }> = [
    {
      comment: `${ZCTRL_QOS_COMMENT_TAG}:ICMP_PRE`,
      params: [
        "=chain=prerouting",
        `=in-interface-list=${interfaceList}`,
        "=protocol=icmp",
        "=action=mark-packet",
        `=new-packet-mark=${ZCTRL_QOS_PACKET_MARK}`,
        "=passthrough=no",
        `=comment=${ZCTRL_QOS_COMMENT_TAG}:ICMP_PRE`
      ]
    },
    {
      comment: `${ZCTRL_QOS_COMMENT_TAG}:DNS_UDP`,
      params: [
        "=chain=prerouting",
        `=in-interface-list=${interfaceList}`,
        "=protocol=udp",
        "=dst-port=53",
        "=action=mark-packet",
        `=new-packet-mark=${ZCTRL_QOS_PACKET_MARK}`,
        "=passthrough=no",
        `=comment=${ZCTRL_QOS_COMMENT_TAG}:DNS_UDP`
      ]
    }
  ];

  if (prioritizeMgmt) {
    desiredMangleRules.push({
      comment: `${ZCTRL_QOS_COMMENT_TAG}:MGMT_API`,
      params: [
        "=chain=prerouting",
        `=in-interface-list=${interfaceList}`,
        "=protocol=tcp",
        "=dst-port=8728,8729,8291",
        "=action=mark-packet",
        `=new-packet-mark=${ZCTRL_QOS_PACKET_MARK}`,
        "=passthrough=no",
        `=comment=${ZCTRL_QOS_COMMENT_TAG}:MGMT_API`
      ]
    });
  }

  let createdRules = 0;

  for (const rule of desiredMangleRules) {
    if (!existingComments.has(rule.comment)) {
      await client.query("/ip/firewall/mangle/add", rule.params, { priority: true, timeoutSeconds: 8 });
      createdRules++;
    }
  }

  const hasQueue = (Array.isArray(existingQueues) ? existingQueues : []).some(
    (q: any) => q?.name === ZCTRL_QOS_QUEUE_NAME || String(q?.comment || "").includes(ZCTRL_QOS_COMMENT_TAG)
  );

  if (!hasQueue) {
    await client.query(
      "/queue/tree/add",
      [
        `=name=${ZCTRL_QOS_QUEUE_NAME}`,
        "=parent=global",
        `=packet-mark=${ZCTRL_QOS_PACKET_MARK}`,
        "=priority=1",
        `=max-limit=${maxLimit}`,
        "=queue=default",
        `=comment=${ZCTRL_QOS_COMMENT_TAG}:QUEUE`
      ],
      { priority: true, timeoutSeconds: 8 }
    );
    createdRules++;
  }

  const status = await getRouterPingFastLaneStatus(client);
  return {
    success: true,
    createdRules,
    status,
    message:
      createdRules > 0
        ? `تم تفعيل مسار أولوية البينج على واجهة (${interfaceList}) بسقف (${maxLimit}) بنجاح (${createdRules} قواعد جديدة)`
        : "مسار أولوية البينج (QoS Fast-Lane) مُفعّل بالفعل على الراوتر"
  };
}

export async function removeRouterPingFastLane(
  client: RouterClientLike
): Promise<{ success: boolean; removedRules: number; status: RouterQosFastLaneStatus; message: string }> {
  if (!client || !client.isConnected()) {
    throw new Error("الراوتر غير متصل حالياً لإزالة قواعد أولوية البينج.");
  }

  const [existingMangles, existingQueues] = await Promise.all([
    client.querySafe("/ip/firewall/mangle/print", [".proplist=.id,comment"], { timeoutSeconds: 5, rapid: true }).catch(() => []),
    client.querySafe("/queue/tree/print", [".proplist=.id,name,comment"], { timeoutSeconds: 5, rapid: true }).catch(() => [])
  ]);

  let removedRules = 0;

  for (const q of Array.isArray(existingQueues) ? existingQueues : []) {
    if (q?.[".id"] && (q?.name === ZCTRL_QOS_QUEUE_NAME || String(q?.comment || "").includes(ZCTRL_QOS_COMMENT_TAG))) {
      await client.query("/queue/tree/remove", [`=.id=${q[".id"]}`], { priority: true, timeoutSeconds: 6 }).catch(() => {});
      removedRules++;
    }
  }

  for (const m of Array.isArray(existingMangles) ? existingMangles : []) {
    if (m?.[".id"] && String(m?.comment || "").includes(ZCTRL_QOS_COMMENT_TAG)) {
      await client.query("/ip/firewall/mangle/remove", [`=.id=${m[".id"]}`], { priority: true, timeoutSeconds: 6 }).catch(() => {});
      removedRules++;
    }
  }

  const status = await getRouterPingFastLaneStatus(client);
  return {
    success: true,
    removedRules,
    status,
    message:
      removedRules > 0
        ? `تمت إزالة قواعد أولوية البينج من الراوتر بأمان (${removedRules} قواعد)`
        : "لا توجد قواعد أولوية بينج مفعلة حالياً على الراوتر"
  };
}
