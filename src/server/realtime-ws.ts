import { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { isAllowedOrigin } from "./security-shield.ts";
import { runActivePingProbe } from "./ping-stabilizer.ts";
import { appLogger } from "./rotatingLogger.ts";
import { normalizeDhcpLeaseRow, normalizeSimpleQueueRow } from "./utils/routerNormalizers.ts";

export interface RealtimeTelemetry {
  type: string;
  timestamp: number;
  [key: string]: any;
}

interface WebSocketClientMeta {
  ws: WebSocket;
  token: string;
  channels: Set<string>;
  activeTab: string;
  intervalMs: number;
  isAlive: boolean;
  isHidden: boolean;
  isIdle: boolean;
  lastMessageTime: number;
  lastOutboundTime: number;
  lastImmediatePushAt: number;
}

interface RateTracker {
  lastBytesIn: number;
  lastBytesOut: number;
  lastTime: number;
  rxBps: number;
  txBps: number;
}

export class RealtimeSyncServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocketClientMeta>();
  private tickerTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isTickRunning = false;
  private isDestroyed = false;
  private getClient: (token?: string) => any;
  private onActivity?: (token?: string) => void;

  // Rate tracking maps for bps calculations
  private interfaceRates = new Map<string, RateTracker>();
  private activeUserRates = new Map<string, RateTracker>();

  // Router hardware & ping stabilizer metrics cache
  private latestCpuLoad = 0;
  private latestPingMs = 0;
  private latestStabilizerIntervalMs = 7500;
  private isThermalThrottling = false;
  private baseIntervalMs = 8000;
  private tickCounter = 0;

  // Staggered telemetry timestamps to prevent router CPU spikes
  private lastQueuesFetch = 0;
  private lastLeasesFetch = 0;
  private lastLogsFetch = 0;
  private lastHealthFetch = 0;
  private lastIcmpProbeAt = 0;
  private isIcmpProbeInFlight = false;
  private cachedCpuTemp: number | undefined = undefined;
  private cachedBoardTemp: number | undefined = undefined;

  constructor(getClient: (token?: string) => any, onActivity?: (token?: string) => void) {
    this.getClient = getClient;
    this.onActivity = onActivity;
  }

  private extractSessionCookieToken(cookieHeader: string | undefined): string {
    if (!cookieHeader || typeof cookieHeader !== "string") return "";
    for (const part of cookieHeader.split(";")) {
      const idx = part.indexOf("=");
      if (idx <= 0) continue;
      if (part.slice(0, idx).trim() === "zctrl_rt") {
        const rawVal = part.slice(idx + 1).trim();
        try {
          return decodeURIComponent(rawVal);
        } catch {
          return rawVal;
        }
      }
    }
    return "";
  }

  public attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: "/api/ws/realtime" });

    this.wss.on("connection", (ws: WebSocket, req) => {
      const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
      if (origin) {
        let sameHost = false;
        try {
          const parsedOrigin = new URL(origin);
          const reqHost = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
          sameHost = Boolean(reqHost && parsedOrigin.host.toLowerCase() === reqHost);
        } catch {
          sameHost = false;
        }
        if (!sameHost && !isAllowedOrigin(origin)) {
          try {
            ws.close(1008, "Origin not allowed");
          } catch (closeErr) {
            appLogger.warn("realtime-ws", "Failed to close rejected WebSocket origin cleanly", {
              error: closeErr instanceof Error ? closeErr.message : String(closeErr)
            });
          }
          return;
        }
      }

      // Authenticate strictly via HttpOnly session cookie or subsequent auth/subscribe message (never URL ?token=)
      const token = this.extractSessionCookieToken(typeof req.headers.cookie === "string" ? req.headers.cookie : undefined);
      if (token) {
        this.onActivity?.(token);
      }

      const clientMeta: WebSocketClientMeta = {
        ws,
        token,
        channels: new Set(["traffic", "sessions", "system"]),
        activeTab: "dashboard",
        intervalMs: 8000,
        isAlive: true,
        isHidden: false,
        isIdle: false,
        lastMessageTime: Date.now(),
        lastOutboundTime: 0,
        lastImmediatePushAt: 0
      };

      this.clients.add(clientMeta);

      // Send initial welcome & ack (wait for client's subscribe message or first scheduled tick — avoids duplicate burst)
      this.sendSafe(ws, {
        type: "connected",
        timestamp: Date.now(),
        message: "مرحباً بك في خادم المزامنة الحية لـ ZCtrl Real-Time Engine",
        baseIntervalMs: this.baseIntervalMs,
        channels: Array.from(clientMeta.channels)
      });

      // Ensure background ticker is running if clients exist
      this.ensureTicker();

      ws.on("pong", () => {
        clientMeta.isAlive = true;
        if (clientMeta.token) this.onActivity?.(clientMeta.token);
      });

      ws.on("message", (raw) => {
        clientMeta.lastMessageTime = Date.now();
        if (clientMeta.token) this.onActivity?.(clientMeta.token);
        try {
          const msg = JSON.parse(raw.toString());
          this.handleClientMessage(clientMeta, msg);
        } catch {
          // ignore malformed payloads
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientMeta);
        this.checkTickerState();
      });

      ws.on("error", (err) => {
        console.warn("[Realtime WS Client Error]", err.message);
        this.clients.delete(clientMeta);
        this.checkTickerState();
      });
    });

    // Setup ping/pong heartbeat every 25 seconds
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          try {
            client.ws.terminate();
          } catch (termErr) {
            appLogger.warn("realtime-ws", "Failed to terminate unresponsive WebSocket client", {
              error: termErr instanceof Error ? termErr.message : String(termErr)
            });
          }
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        try {
          client.ws.ping();
        } catch {
          this.clients.delete(client);
        }
      }
      this.checkTickerState();
    }, 25000);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();

    console.log("[Realtime Engine] WebSocket server attached successfully on /api/ws/realtime");
  }

  private handleClientMessage(client: WebSocketClientMeta, msg: any): void {
    if (!msg || typeof msg !== "object") return;

    if (typeof msg.token === "string" && msg.token.trim()) {
      client.token = msg.token.trim();
      this.onActivity?.(client.token);
    }

    switch (msg.type) {
      case "auth": {
        this.sendSafe(client.ws, {
          type: "auth_ack",
          authenticated: Boolean(client.token),
          timestamp: Date.now()
        });
        if (client.token) {
          this.triggerImmediatePush(client).catch((err) => {
            appLogger.warn("realtime-ws", "Immediate push after WS auth failed", {
              error: err instanceof Error ? err.message : String(err)
            });
          });
        }
        break;
      }

      case "subscribe": {
        client.channels.clear();
        client.channels.add("system");
        if (Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            if (typeof ch === "string") client.channels.add(ch);
          }
        }
        if (typeof msg.tab === "string") {
          client.activeTab = msg.tab;
        }
        if (typeof msg.intervalMs === "number" && msg.intervalMs >= 2000) {
          client.intervalMs = Math.min(60000, msg.intervalMs);
        }
        client.isHidden = false;
        client.isIdle = false;

        this.sendSafe(client.ws, {
          type: "subscribed",
          channels: Array.from(client.channels),
          tab: client.activeTab,
          intervalMs: client.intervalMs
        });

        this.triggerImmediatePush(client).catch((err) => {
          appLogger.warn("realtime-ws", "Immediate push after subscribe failed", {
            error: err instanceof Error ? err.message : String(err)
          });
        });
        this.ensureTicker();
        break;
      }

      case "unsubscribe": {
        if (Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            client.channels.delete(ch);
          }
        }
        this.sendSafe(client.ws, {
          type: "unsubscribed",
          channels: Array.from(client.channels)
        });
        break;
      }

      case "tab_change": {
        const prevTab = client.activeTab;
        if (typeof msg.tab === "string") {
          client.activeTab = msg.tab;
          // Smart channel isolation: clear previous channels and only subscribe to what active tab needs
          client.channels.clear();
          client.channels.add("system");

          if (msg.tab === "traffic") {
            client.channels.add("traffic");
          } else if (msg.tab === "active_sessions" || msg.tab === "ppp") {
            client.channels.add("sessions");
          } else if (msg.tab === "queues") {
            client.channels.add("queues");
          } else if (msg.tab === "dhcp") {
            client.channels.add("leases");
          } else if (msg.tab === "logs") {
            client.channels.add("logs");
          } else if (msg.tab === "dashboard") {
            client.channels.add("sessions");
            client.channels.add("traffic");
          }
        }
        if (typeof msg.isHidden === "boolean") client.isHidden = msg.isHidden;
        if (typeof msg.isIdle === "boolean") client.isIdle = msg.isIdle;

        // Avoid redundant immediate burst if same tab re-sent
        if (prevTab !== client.activeTab) {
          this.triggerImmediatePush(client).catch(() => {});
        }
        break;
      }

      case "client_state": {
        const wasHidden = client.isHidden;
        if (typeof msg.isHidden === "boolean") client.isHidden = msg.isHidden;
        if (typeof msg.isIdle === "boolean") client.isIdle = msg.isIdle;

        // If returned from hidden to active, trigger gentle cooled-down refresh
        if (wasHidden && !client.isHidden && !client.isIdle) {
          this.triggerImmediatePush(client).catch(() => {});
        }
        break;
      }

      case "set_interval":
      case "update_interval": {
        if (typeof msg.intervalMs === "number" && msg.intervalMs >= 2000) {
          client.intervalMs = Math.min(60000, msg.intervalMs);
        }
        break;
      }

      case "sync_now": {
        this.triggerBroadcast(true).catch(() => {});
        break;
      }

      case "ping": {
        this.sendSafe(client.ws, { type: "pong", timestamp: Date.now() });
        break;
      }
    }
  }

  private getAdaptiveInterval(): number {
    if (this.clients.size === 0) return 60000;

    const clientList = Array.from(this.clients);
    const allHidden = clientList.every((c) => c.isHidden);
    if (allHidden) return 35000;

    const allIdle = clientList.every((c) => c.isIdle || c.isHidden);
    if (allIdle) return 28000;

    // Respect client's requested floor interval as well as Auto-Ping Stabilizer & CPU load
    const minClientInterval = Math.max(
      6000,
      Math.min(...clientList.filter((c) => !c.isHidden).map((c) => c.intervalMs || this.baseIntervalMs))
    );

    let adaptive = Math.max(minClientInterval, this.latestStabilizerIntervalMs);

    if (this.latestCpuLoad > 85) adaptive = Math.max(adaptive, 22000);
    else if (this.latestCpuLoad > 70) adaptive = Math.max(adaptive, 15000);
    else if (this.latestCpuLoad > 55) adaptive = Math.max(adaptive, 10000);

    return Math.min(40000, adaptive);
  }

  private scheduleNextTick(forcedDelayMs?: number): void {
    if (this.tickerTimer) {
      clearTimeout(this.tickerTimer);
      this.tickerTimer = null;
    }
    if (this.isDestroyed || this.clients.size === 0) {
      return;
    }
    const delay = forcedDelayMs !== undefined ? forcedDelayMs : this.getAdaptiveInterval();
    this.tickerTimer = setTimeout(async () => {
      try {
        await this.executeTick();
      } finally {
        if (!this.isDestroyed && this.clients.size > 0) {
          this.scheduleNextTick();
        } else {
          this.tickerTimer = null;
        }
      }
    }, delay);
    if (this.tickerTimer.unref) this.tickerTimer.unref();
  }

  private ensureTicker(): void {
    if (this.isDestroyed || this.clients.size === 0 || this.tickerTimer) return;
    // Wait 2.5s before first background tick so initial login sync never collides with WS burst
    this.scheduleNextTick(2500);
  }

  private checkTickerState(): void {
    if (this.clients.size === 0) {
      if (this.tickerTimer) {
        clearTimeout(this.tickerTimer);
        this.tickerTimer = null;
      }
    }
  }

  private async executeTick(): Promise<void> {
    if (this.isTickRunning || this.clients.size === 0) return;

    // Check if at least one client is active (not hidden)
    const activeClients = Array.from(this.clients).filter((c) => !c.isHidden);
    if (activeClients.length === 0) {
      return;
    }

    this.isTickRunning = true;
    try {
      await this.triggerBroadcast(false);
    } finally {
      this.isTickRunning = false;
    }
  }

  private async triggerImmediatePush(client: WebSocketClientMeta): Promise<void> {
    const now = Date.now();
    // Per-client 3s cooldown prevents rapid tab switches or reconnects from slamming RouterOS
    if (now - client.lastImmediatePushAt < 3000) {
      return;
    }
    const routerClient = this.getClient(client.token);
    if (!routerClient || typeof routerClient.isConnected !== "function" || !routerClient.isConnected()) {
      return;
    }

    client.lastImmediatePushAt = now;

    // Under Ping/CPU stress, immediate push ONLY fetches lightweight system telemetry
    const suppressHeavy =
      (typeof routerClient.getPingStabilizer === "function" &&
        routerClient.getPingStabilizer().shouldSuppressHeavyTelemetry()) ||
      this.latestCpuLoad > 70;

    const needsSystem = client.channels.has("system") || client.channels.has("all");
    const needsTraffic = !suppressHeavy && (client.channels.has("traffic") || client.channels.has("all"));
    const needsSessions = !suppressHeavy && (client.channels.has("sessions") || client.channels.has("all"));
    const needsQueues = !suppressHeavy && client.activeTab === "queues" && client.channels.has("queues");
    const needsLeases = !suppressHeavy && client.activeTab === "dhcp" && client.channels.has("leases");
    const needsLogs =
      !suppressHeavy &&
      !client.isHidden &&
      !client.isIdle &&
      client.activeTab === "logs" &&
      client.channels.has("logs") &&
      now - this.lastLogsFetch >= 60000;

    // Execute sequentially (or at most 2) to respect RouterOS CPU & Ping budget
    const payloads: RealtimeTelemetry[] = [];
    if (needsSystem) {
      const sys = await this.fetchSystemTelemetry(routerClient);
      if (sys) payloads.push(sys);
    }
    if (needsTraffic) {
      const tr = await this.fetchTrafficTelemetry(routerClient);
      if (tr) payloads.push(tr);
    }
    if (needsSessions) {
      const sess = await this.fetchSessionsTelemetry(routerClient);
      if (sess) payloads.push(sess);
    }
    if (needsQueues) {
      const q = await this.fetchQueuesTelemetry(routerClient);
      if (q) payloads.push(q);
    }
    if (needsLeases) {
      const l = await this.fetchLeasesTelemetry(routerClient);
      if (l) payloads.push(l);
    }
    if (needsLogs) {
      this.lastLogsFetch = Date.now();
      const lg = await this.fetchLogsTelemetry(routerClient);
      if (lg) payloads.push(lg);
    }

    client.lastOutboundTime = Date.now();
    for (const p of payloads) {
      this.sendSafe(client.ws, p);
    }
  }

  private async triggerBroadcast(force: boolean = false): Promise<void> {
    // Resolve representative router client preferentially using connected clients' tokens
    let routerClient: any = null;
    for (const c of this.clients) {
      if (c.token) {
        const candidate = this.getClient(c.token);
        if (candidate && typeof candidate.isConnected === "function" && candidate.isConnected()) {
          routerClient = candidate;
          break;
        }
      }
    }
    if (!routerClient) {
      routerClient = this.getClient();
    }
    if (!routerClient || typeof routerClient.isConnected !== "function" || !routerClient.isConnected()) {
      return;
    }

    // Determine aggregate channel requirements
    let needTraffic = false;
    let needSessions = false;
    let needSystem = false;
    let needQueues = false;
    let needLeases = false;
    let needLogs = false;

    for (const c of this.clients) {
      if (c.isHidden && !force) continue;
      if (c.channels.has("traffic") || c.channels.has("all")) needTraffic = true;
      if (c.channels.has("sessions") || c.channels.has("all")) needSessions = true;
      if (c.channels.has("system") || c.channels.has("all")) needSystem = true;
      if (c.channels.has("queues") || c.channels.has("all")) needQueues = true;
      if (c.channels.has("leases") || c.channels.has("all")) needLeases = true;
      // Never pull /log/print in background unless a visible active client is viewing the logs tab
      if (!c.isHidden && !c.isIdle && c.activeTab === "logs" && (c.channels.has("logs") || c.channels.has("all"))) {
        needLogs = true;
      }
    }

    // Thermal check: If router CPU is high, throttle interval
    if (this.latestCpuLoad > 75 && !this.isThermalThrottling) {
      this.isThermalThrottling = true;
      this.broadcast({
        type: "thermal_protection",
        timestamp: Date.now(),
        active: true,
        cpuLoad: this.latestCpuLoad,
        message: "درع التبريد الذكي: تم تخفيف تردد الاستطلاع مؤقتاً لتبريد معالج المايكروتك"
      });
    } else if (this.latestCpuLoad < 60 && this.isThermalThrottling) {
      this.isThermalThrottling = false;
      this.broadcast({
        type: "thermal_protection",
        timestamp: Date.now(),
        active: false,
        cpuLoad: this.latestCpuLoad,
        message: "عادت حرارة ومعالج الراوتر للوضع الطبيعي - تم استئناف التردد الأقصى"
      });
    }

    const now = Date.now();
    this.tickCounter = (this.tickCounter + 1) % 1000000;

    // Check Auto-Ping Stabilizer & CPU thermal state
    const stabilizer = typeof routerClient.getPingStabilizer === "function" ? routerClient.getPingStabilizer() : null;
    const suppressHeavy = (stabilizer ? stabilizer.shouldSuppressHeavyTelemetry() : false) && !force;
    const isCriticalStress = (this.latestCpuLoad > 75 || suppressHeavy) && !force;

    // Stagger heavy queries: Do not pull queues, leases, or logs on every single tick
    const shouldFetchQueues = needQueues && !suppressHeavy && (force || now - this.lastQueuesFetch > 35000);
    const shouldFetchLeases = needLeases && !suppressHeavy && (force || now - this.lastLeasesFetch > 40000);
    const shouldFetchLogs = needLogs && !suppressHeavy && (force || now - this.lastLogsFetch > 60000);

    // Always pull lightweight system telemetry first so CPU & Ping stabilizer stay accurate
    if (needSystem) {
      const sysPayload = await this.fetchSystemTelemetry(routerClient);
      if (sysPayload) {
        this.broadcastChannelData(sysPayload);
      }
    }

    // Re-evaluate stress after fresh CPU & Ping sample
    const freshSuppress = (stabilizer ? stabilizer.shouldSuppressHeavyTelemetry() : false) && !force;
    const freshCritical = (this.latestCpuLoad > 75 || freshSuppress) && !force;

    // Under elevated/stabilizing load, alternate traffic and sessions across ticks so RouterOS breathes
    const runTrafficThisTick = needTraffic && (!freshCritical || this.tickCounter % 2 === 0);
    const runSessionsThisTick = needSessions && (!freshCritical || this.tickCounter % 2 === 1);

    // Execute telemetry queries strictly sequentially with 100ms breathing gap to guarantee zero Ping/CPU spikes
    const sequentialSteps: Array<() => Promise<RealtimeTelemetry | null>> = [];
    if (runTrafficThisTick) sequentialSteps.push(() => this.fetchTrafficTelemetry(routerClient));
    if (runSessionsThisTick) sequentialSteps.push(() => this.fetchSessionsTelemetry(routerClient));

    if (shouldFetchQueues && !freshCritical) {
      this.lastQueuesFetch = now;
      sequentialSteps.push(() => this.fetchQueuesTelemetry(routerClient));
    }
    if (shouldFetchLeases && !freshCritical) {
      this.lastLeasesFetch = now;
      sequentialSteps.push(() => this.fetchLeasesTelemetry(routerClient));
    }
    if (shouldFetchLogs && !freshCritical) {
      this.lastLogsFetch = now;
      sequentialSteps.push(() => this.fetchLogsTelemetry(routerClient));
    }

    for (let i = 0; i < sequentialSteps.length; i++) {
      if (this.isDestroyed) break;
      try {
        const value = await sequentialSteps[i]();
        if (value) {
          this.broadcastChannelData(value);
        }
      } catch {
        // Ignore transient single-query failure without interrupting other channels
      }
      if (i < sequentialSteps.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Periodic real ICMP Ping probe (2 packets every 45s) decoupled from API RTT
    const hasActiveViewers = Array.from(this.clients).some((c) => !c.isHidden && !c.isIdle);
    const stabilizerEnabled = !stabilizer || stabilizer.getSnapshot().mode !== "off";
    if (
      hasActiveViewers &&
      stabilizerEnabled &&
      !this.isIcmpProbeInFlight &&
      this.latestCpuLoad <= 75 &&
      (force || now - this.lastIcmpProbeAt >= 45000)
    ) {
      this.isIcmpProbeInFlight = true;
      this.lastIcmpProbeAt = Date.now();
      try {
        const probe = await runActivePingProbe(routerClient, { target: "1.1.1.1", count: 2 });
        if (probe.source === "router_icmp" && stabilizer) {
          const updatedSnap = stabilizer.getSnapshot();
          this.latestStabilizerIntervalMs = stabilizer.getRecommendedWsIntervalMs();
          this.latestPingMs = probe.avgPingMs;
          this.broadcastStabilizerUpdate(updatedSnap);
        }
      } catch {
        // Ignore transient ICMP probe errors
      } finally {
        this.isIcmpProbeInFlight = false;
      }
    }
  }

  private broadcastChannelData(payload: RealtimeTelemetry): void {
    const channelName =
      payload.type === "traffic:update" ? "traffic" :
      payload.type === "sessions:update" ? "sessions" :
      payload.type === "system:update" ? "system" :
      payload.type === "queues:update" ? "queues" :
      payload.type === "leases:update" ? "leases" :
      payload.type === "logs:update" ? "logs" : "all";

    const now = Date.now();
    for (const client of this.clients) {
      if (client.token) {
        this.onActivity?.(client.token);
      }
      if (client.channels.has(channelName) || client.channels.has("all")) {
        // If client is hidden, throttle outbound broadcasts to at most once every 10 seconds
        if (client.isHidden && now - client.lastOutboundTime < 10000) {
          continue;
        }
        client.lastOutboundTime = now;
        this.sendSafe(client.ws, payload);
      }
    }
  }

  // A. Traffic Telemetry Engine
  private async fetchTrafficTelemetry(client: any): Promise<RealtimeTelemetry | null> {
    try {
      const raw = await client.querySafe("/interface/print", [
        ".proplist=.id,name,type,running,disabled,rx-byte,tx-byte,comment"
      ], { rapid: true });

      const interfaces = Array.isArray(raw) ? raw.map((i) => this.normalizeInterface(i)).filter(Boolean) : [];

      return {
        type: "traffic:update",
        timestamp: Date.now(),
        interfaces
      };
    } catch {
      return null;
    }
  }

  // B. Active Sessions Telemetry Engine (sequential paced reads to protect router CPU)
  private async fetchSessionsTelemetry(client: any): Promise<RealtimeTelemetry | null> {
    try {
      const activeHsRaw = await client.querySafe("/ip/hotspot/active/print", [
        ".proplist=.id,user,address,mac-address,uptime,bytes-in,bytes-out,login-by,comment"
      ], { rapid: true });
      await new Promise((r) => setTimeout(r, 60));
      const activePppRaw = await client.querySafe("/ppp/active/print", [
        ".proplist=.id,name,service,caller-id,address,uptime,encoding"
      ], { rapid: true });

      const activeHotspotUsers = Array.isArray(activeHsRaw)
        ? activeHsRaw.map((u) => this.normalizeActiveHotspotUser(u)).filter(Boolean)
        : [];

      const pppActive = Array.isArray(activePppRaw)
        ? activePppRaw.map((p) => ({
            id: p?.['.id'] || p?.name || `ppp-${Date.now()}`,
            name: p?.name || '',
            service: p?.service || 'pppoe',
            callerId: p?.['caller-id'] || '',
            address: p?.address || '',
            uptime: p?.uptime || '0s',
            encoding: p?.encoding || ''
          }))
        : [];

      return {
        type: "sessions:update",
        timestamp: Date.now(),
        activeHotspotUsers,
        pppActive,
        count: {
          hotspot: activeHotspotUsers.length,
          ppp: pppActive.length,
          total: activeHotspotUsers.length + pppActive.length
        }
      };
    } catch {
      return null;
    }
  }

  // C. System Hardware & Health Telemetry Engine
  private async fetchSystemTelemetry(client: any): Promise<RealtimeTelemetry | null> {
    try {
      const now = Date.now();
      const shouldPollHealth = now - this.lastHealthFetch > 35000;

      const resourceRaw = await client.querySafe(
        "/system/resource/print",
        [".proplist=cpu-load,free-memory,total-memory,uptime"],
        { rapid: true }
      );

      let healthRaw: any[] | null = null;
      if (shouldPollHealth) {
        this.lastHealthFetch = now;
        healthRaw = await client.querySafe("/system/health/print", undefined, { rapid: true }).catch(() => []);
      }

      const r = Array.isArray(resourceRaw) && resourceRaw.length > 0 ? resourceRaw[0] : null;
      const cpuLoad = parseInt(r?.["cpu-load"] || "0", 10);
      this.latestCpuLoad = cpuLoad;

      if (Array.isArray(healthRaw)) {
        let cpuTemp: number | undefined;
        let boardTemp: number | undefined;
        for (const item of healthRaw) {
          if (!item) continue;
          const n = String(item.name || "").toLowerCase();
          const val = item.value !== undefined ? item.value : (item["cpu-temperature"] || item["temperature"]);
          if (n.includes("cpu") && val !== undefined) {
            cpuTemp = parseInt(String(val).replace(/[^0-9]/g, ""), 10);
          } else if (n.includes("board") && val !== undefined) {
            boardTemp = parseInt(String(val).replace(/[^0-9]/g, ""), 10);
          }
        }
        this.cachedCpuTemp = cpuTemp;
        this.cachedBoardTemp = boardTemp;
      }

      const pingMs = typeof client.getLatency === "function" ? client.getLatency() : 0;
      this.latestPingMs = pingMs;

      // Feed live CPU & temperature metrics directly into MikrotikClient throttler & AutoPingStabilizer!
      if (typeof client.updateHardwareMetrics === "function") {
        client.updateHardwareMetrics(cpuLoad, this.cachedCpuTemp);
      }

      let stabilizerSnapshot: any = undefined;
      if (typeof client.getPingStabilizer === "function") {
        const stab = client.getPingStabilizer();
        stabilizerSnapshot = stab.getSnapshot();
        this.latestStabilizerIntervalMs = stab.getRecommendedWsIntervalMs();
      }

      return {
        type: "system:update",
        timestamp: Date.now(),
        system: {
          cpuLoad,
          freeMemory: parseInt(r?.["free-memory"] || "0", 10),
          totalMemory: parseInt(r?.["total-memory"] || "0", 10),
          uptime: r?.uptime || "0s",
          cpuTemperature: this.cachedCpuTemp,
          boardTemperature: this.cachedBoardTemp,
          pingMs
        },
        pingStabilizer: stabilizerSnapshot
      };
    } catch {
      return null;
    }
  }

  // D. Queues Telemetry Engine
  private async fetchQueuesTelemetry(client: any): Promise<RealtimeTelemetry | null> {
    try {
      const raw = await client.querySafe("/queue/simple/print", [
        ".proplist=.id,name,target,max-limit,limit-at,priority,bytes,rate,packet-rate,queued-bytes,queued-packets,total-bytes,total-rate,disabled,dynamic,comment"
      ], { rapid: true });

      const queues = Array.isArray(raw)
        ? raw.map(normalizeSimpleQueueRow).filter(Boolean)
        : [];

      return {
        type: "queues:update",
        timestamp: Date.now(),
        queues
      };
    } catch {
      return null;
    }
  }

  // E. DHCP Leases Telemetry Engine
  private async fetchLeasesTelemetry(client: any): Promise<RealtimeTelemetry | null> {
    try {
      const raw = await client.querySafe("/ip/dhcp-server/lease/print", [
        ".proplist=.id,address,mac-address,server,active-address,active-mac-address,active-server,host-name,status,expires-after,last-seen,comment,dynamic,disabled"
      ], { rapid: true });

      const leases = Array.isArray(raw)
        ? raw.map(normalizeDhcpLeaseRow).filter(Boolean)
        : [];

      return {
        type: "leases:update",
        timestamp: Date.now(),
        leases
      };
    } catch {
      return null;
    }
  }

  // F. System Logs Telemetry Engine
  private async fetchLogsTelemetry(client: any): Promise<RealtimeTelemetry | null> {
    try {
      const raw = await client.querySafe("/log/print", [
        ".proplist=.id,time,topics,message"
      ], { rapid: true });
      const logs = (Array.isArray(raw) ? raw : []).slice(-35).reverse();

      return {
        type: "logs:update",
        timestamp: Date.now(),
        logs
      };
    } catch {
      return null;
    }
  }

  private normalizeInterface(i: any) {
    if (!i) return null;
    const name = i.name || "";
    const rxBytes = parseInt(i["rx-byte"] || i.rxBytes || "0", 10) || 0;
    const txBytes = parseInt(i["tx-byte"] || i.txBytes || "0", 10) || 0;
    const now = Date.now();

    let rxBps = 0;
    let txBps = 0;

    const prev = this.interfaceRates.get(name);
    if (prev && prev.lastTime > 0) {
      const elapsedSec = (now - prev.lastTime) / 1000;
      if (elapsedSec > 0.4 && elapsedSec < 60) {
        const deltaRx = rxBytes - prev.lastBytesIn;
        const deltaTx = txBytes - prev.lastBytesOut;
        if (deltaRx >= 0) rxBps = Math.round((deltaRx * 8) / elapsedSec);
        if (deltaTx >= 0) txBps = Math.round((deltaTx * 8) / elapsedSec);
      } else if (elapsedSec <= 0.4) {
        rxBps = prev.rxBps;
        txBps = prev.txBps;
      }
    }

    const finalRx = rxBps > 0 ? rxBps : (prev?.rxBps && now - prev.lastTime < 10000 ? prev.rxBps : 0);
    const finalTx = txBps > 0 ? txBps : (prev?.txBps && now - prev.lastTime < 10000 ? prev.txBps : 0);

    if (this.interfaceRates.size > 200) {
      const cutoff = now - 60000;
      for (const [k, v] of this.interfaceRates) {
        if (v.lastTime < cutoff) this.interfaceRates.delete(k);
      }
    }

    this.interfaceRates.set(name, {
      lastBytesIn: rxBytes,
      lastBytesOut: txBytes,
      lastTime: now,
      rxBps: finalRx,
      txBps: finalTx
    });

    return {
      id: i[".id"] || i.id || name,
      name,
      type: i.type || "ether",
      running: i.running === "true" || i.running === true,
      disabled: i.disabled === "true" || i.disabled === true,
      rxBytes,
      txBytes,
      rxBps: finalRx,
      txBps: finalTx,
      comment: i.comment || ""
    };
  }

  private normalizeActiveHotspotUser(u: any) {
    if (!u) return null;
    const id = u[".id"] || u.id || `act-${Date.now()}`;
    const user = u.user || u.name || "";
    const address = u.address || "";
    const macAddress = u["mac-address"] || u.macAddress || "";
    const bytesIn = parseInt(u["bytes-in"] || u.bytesIn || "0", 10) || 0;
    const bytesOut = parseInt(u["bytes-out"] || u.bytesOut || "0", 10) || 0;
    const now = Date.now();

    const key = `${user}__${address || macAddress || id}`;
    let rxRateBps = 0;
    let txRateBps = 0;

    const prev = this.activeUserRates.get(key);
    if (prev && prev.lastTime > 0) {
      const elapsedSec = (now - prev.lastTime) / 1000;
      if (elapsedSec > 0.4 && elapsedSec < 60) {
        const deltaOut = bytesOut - prev.lastBytesOut;
        const deltaIn = bytesIn - prev.lastBytesIn;
        if (deltaOut >= 0) rxRateBps = Math.round((deltaOut * 8) / elapsedSec);
        if (deltaIn >= 0) txRateBps = Math.round((deltaIn * 8) / elapsedSec);
      } else if (elapsedSec <= 0.4) {
        rxRateBps = prev.rxBps;
        txRateBps = prev.txBps;
      }
    }

    const finalRx = rxRateBps > 0 ? rxRateBps : (prev?.rxBps && now - prev.lastTime < 10000 ? prev.rxBps : 0);
    const finalTx = txRateBps > 0 ? txRateBps : (prev?.txBps && now - prev.lastTime < 10000 ? prev.txBps : 0);

    if (this.activeUserRates.size > 1500) {
      const cutoff = now - 60000;
      for (const [k, v] of this.activeUserRates) {
        if (v.lastTime < cutoff) this.activeUserRates.delete(k);
      }
    }

    this.activeUserRates.set(key, {
      lastBytesIn: bytesIn,
      lastBytesOut: bytesOut,
      lastTime: now,
      rxBps: finalRx,
      txBps: finalTx
    });

    return {
      id,
      server: u.server || "all",
      user,
      address,
      macAddress,
      loginBy: u["login-by"] || u.loginBy || "",
      uptime: u.uptime || "0s",
      bytesIn,
      bytesOut,
      idleTime: u["idle-time"] || u.idleTime || "0s",
      rxRateBps: finalRx,
      txRateBps: finalTx,
      totalRateBps: finalRx + finalTx
    };
  }

  private sendSafe(ws: WebSocket, payload: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        appLogger.warn("realtime-ws", "Failed to send WebSocket message", {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  private broadcast(payload: any): void {
    for (const client of this.clients) {
      this.sendSafe(client.ws, payload);
    }
  }

  public broadcastStabilizerUpdate(snapshot: any): void {
    if (snapshot && typeof snapshot.recommendedWsIntervalMs === "number") {
      this.latestStabilizerIntervalMs = snapshot.recommendedWsIntervalMs;
    }
    this.broadcast({
      type: "ping_stabilizer:update",
      timestamp: Date.now(),
      pingStabilizer: snapshot
    });
  }

  public getStatus() {
    return {
      connectedClientsCount: this.clients.size,
      isThermalThrottling: this.isThermalThrottling,
      latestCpuLoad: this.latestCpuLoad,
      latestPingMs: this.latestPingMs,
      adaptiveIntervalMs: this.getAdaptiveInterval(),
      activeChannels: Array.from(new Set(Array.from(this.clients).flatMap((c) => Array.from(c.channels)))),
      isTickerActive: this.tickerTimer !== null
    };
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.tickerTimer) {
      clearTimeout(this.tickerTimer);
      this.tickerTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.interfaceRates.clear();
    this.activeUserRates.clear();
    if (this.wss) {
      for (const client of this.clients) {
        try {
          client.ws.close();
        } catch (err) {
          appLogger.warn("realtime-ws", "WebSocket close warning on server destroy", {
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
    }
  }
}
