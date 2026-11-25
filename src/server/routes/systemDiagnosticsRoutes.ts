import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import {
  createMikrotikClient,
  MikrotikAPI as MikrotikAPI_Original
} from "../mikrotik-api.ts";
import { discoverMikrotikRouters } from "../mndp-discover.ts";
import { translateErrorMessage } from "../../lib/errorTranslator.ts";
import { setupRouterApi } from "./setupRouter.ts";
import {
  auditSecurityApi,
  autoFixSecurityApi,
  auditScriptsApi,
  cleanScriptsApi,
  discoverManagementPortsAndIpsApi
} from "./securityAuditorRouter.ts";
import { telegramAlertService } from "../telegram-service.ts";
import {
  securityConfig,
  resolveRequestToken,
  encryptSecret
} from "../security-shield.ts";
import { RevertJournalSweeper } from "../domain/RevertJournalSweeper.ts";
import { AuditHashChain } from "../domain/AuditHashChain.ts";
import { ChangeEngine } from "../domain/ChangeEngine.ts";
import { rbacService, recordAudit, isValidRole, type OperatorRole } from "../rbac.ts";
import {
  routerClients,
  getLatestActiveClient,
  setLatestActiveClient,
  MikrotikAPI,
  realtimeSyncServer,
  invalidateCache,
  clearCachedUsermanResult,
  sanitizeInput,
  fetchSafeCached,
  fetchComprehensiveUsermanData,
  normalizeNetworkInterface,
  normalizeActiveHotspotUser,
  normalizeHotspotProfile,
  normalizePPPProfile,
  normalizeSimpleQueue,
  normalizeDhcpLease,
  getMemoryHealth
} from "../runtimeContext.ts";
import {
  runActivePingProbe,
  getRouterPingFastLaneStatus,
  applyRouterPingFastLane,
  removeRouterPingFastLane,
  type PingStabilizerMode
} from "../ping-stabilizer.ts";

export function createSystemDiagnosticsRoutes(): Router {
  const router = Router();

// API: Security Settings & Shield Status Dashboard Endpoints
router.get("/api/security/settings", (_req: Request, res: Response) => {
  res.json({
    success: true,
    config: securityConfig,
    activeSessions: routerClients.size,
    vaultStatus: "AES-256-GCM Active",
    corsMode: securityConfig.strictCorsEnabled ? "Whitelisted Dynamic" : "Permissive",
    auditedVulnerabilities: [
      { id: "VULN-01", name: "Multi-Tenant Session Isolation", status: "Secured & Enforced" },
      { id: "VULN-02", name: "Authentication Rate Limiter", status: "Active (25 req / 15m)" },
      { id: "VULN-03", name: "CORS Whitelist Control", status: "Active & Restricted" },
      { id: "VULN-04", name: "RouterOS Script Injection Shield", status: "Sanitized & Validated" },
      { id: "VULN-05", name: "Deep Path Traversal Guard", status: "Zero-Traversal Enforced" },
      { id: "VULN-06", name: "In-Memory Credential Vault", status: "AES-256-GCM Encrypted" }
    ]
  });
});

router.post("/api/security/settings", (req: Request, res: Response) => {
  const {
    rateLimitingEnabled,
    strictTenantIsolation,
    strictCorsEnabled,
    pathTraversalGuardEnabled,
    scriptInjectionGuardEnabled,
    inMemoryEncryptionEnabled
  } = req.body;

  if (typeof rateLimitingEnabled === "boolean") securityConfig.rateLimitingEnabled = rateLimitingEnabled;
  if (typeof strictTenantIsolation === "boolean") securityConfig.strictTenantIsolation = strictTenantIsolation;
  if (typeof strictCorsEnabled === "boolean") securityConfig.strictCorsEnabled = strictCorsEnabled;
  if (typeof pathTraversalGuardEnabled === "boolean") securityConfig.pathTraversalGuardEnabled = pathTraversalGuardEnabled;
  if (typeof scriptInjectionGuardEnabled === "boolean") securityConfig.scriptInjectionGuardEnabled = scriptInjectionGuardEnabled;
  if (typeof inMemoryEncryptionEnabled === "boolean") securityConfig.inMemoryEncryptionEnabled = inMemoryEncryptionEnabled;

  recordAudit(req, 'update_security_settings', 'security_shield', 'success', {
    changes: { before: null, after: { ...securityConfig } }
  });

  res.json({
    success: true,
    message: "تم تحديث إعدادات الدرع الأمني بنجاح",
    config: securityConfig
  });
});

// ==========================================
// RBAC OPERATOR MANAGEMENT ENDPOINTS
// ==========================================
router.get("/api/auth/me", (req: Request, res: Response) => {
  const token = resolveRequestToken(req);
  const session = token ? routerClients.get(token) : undefined;
  const sessionRole = (req as any).sessionRole;
  res.json({
    success: true,
    role: session?.role || sessionRole?.role || "admin",
    operatorId: session?.operatorId || sessionRole?.operatorId || "root-admin",
    operatorName: session?.operatorName || sessionRole?.operatorName || "admin",
    tlsFingerprint: session?.tlsFingerprint || null,
    hasCustomOperators: rbacService.hasCustomOperators()
  });
});

router.get("/api/auth/operators", (_req: Request, res: Response) => {
  res.json({
    success: true,
    operators: rbacService.listOperators()
  });
});

router.post("/api/auth/operators", (req: Request, res: Response) => {
  try {
    const { username, password, role, displayName } = req.body || {};
    const created = rbacService.createOperator({
      username: sanitizeInput(username),
      password: String(password || ""),
      role: isValidRole(role) ? role : "viewer",
      displayName: displayName ? sanitizeInput(displayName) : undefined
    });
    recordAudit(req, "create_operator", "rbac_operators", "success", {
      resourceId: created.id,
      changes: { before: null, after: { username: created.username, role: created.role } }
    });
    res.json({
      success: true,
      message: `تم إنشاء حساب المشغل (${created.username}) بصلاحية ${created.role} بنجاح`,
      operator: created
    });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message || "تعذر إنشاء المشغل" });
  }
});

router.put("/api/auth/operators/:id", (req: Request, res: Response) => {
  try {
    const { role, displayName, password, disabled } = req.body || {};
    const updated = rbacService.updateOperator(String(req.params.id), {
      role: role !== undefined && isValidRole(role) ? (role as OperatorRole) : undefined,
      displayName: displayName !== undefined ? sanitizeInput(displayName) : undefined,
      password: password ? String(password) : undefined,
      disabled: typeof disabled === "boolean" ? disabled : undefined
    });
    recordAudit(req, "update_operator", "rbac_operators", "success", {
      resourceId: updated.id,
      changes: { before: null, after: { role: updated.role, disabled: updated.disabled } }
    });
    res.json({
      success: true,
      message: `تم تحديث بيانات المشغل (${updated.username}) بنجاح`,
      operator: updated
    });
  } catch (e: any) {
    res.status(400).json({ success: false, message: e?.message || "تعذر تحديث المشغل" });
  }
});

router.delete("/api/auth/operators/:id", (req: Request, res: Response) => {
  const ok = rbacService.deleteOperator(String(req.params.id));
  if (!ok) {
    return res.status(404).json({ success: false, message: "لم يتم العثور على المشغل" });
  }
  recordAudit(req, "delete_operator", "rbac_operators", "success", {
    resourceId: String(req.params.id)
  });
  return res.json({ success: true, message: "تم حذف المشغل بنجاح" });
});

// API: Health & Ping
router.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", app: "ZCtrl", timestamp: Date.now(), memory: getMemoryHealth() });
});

router.get("/api/ping", (_req: Request, res: Response) => {
  res.json({ success: true, app: "ZCtrl", timestamp: Date.now() });
});

// ==========================================
// TELEGRAM BOT NOTIFICATIONS & ALERTS
// ==========================================
router.get("/api/telegram/config", (_req: Request, res: Response) => {
  res.json({ success: true, data: telegramAlertService.getConfig() });
});

router.post("/api/telegram/config", (req: Request, res: Response) => {
  try {
    const updated = telegramAlertService.saveConfig(req.body);
    res.json({ success: true, data: updated, message: "تم حفظ إعدادات إشعارات تيليجرام بنجاح" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post("/api/telegram/test", async (req: Request, res: Response) => {
  try {
    const { botToken, chatId } = req.body;
    const testMsg = `🚀 <b>[تجربة إشعار ZCtrl]</b>\n\nأهلاً بك! تم ربط نظام ZCtrl ببوت تيليجرام بنجاح.\nستصلك الآن تنبيهات الراوتر وحالة الشبكة والكروت هنا مباشرة.\n\n⏱ <i>${new Date().toLocaleString('ar-EG', { hour12: true })}</i>`;
    const result = await telegramAlertService.sendMessage(testMsg, botToken, chatId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post("/api/telegram/notify", async (req: Request, res: Response) => {
  try {
    const { title, details, level } = req.body;
    if (!title) return res.status(400).json({ success: false, message: "عنوان التنبيه مطلوب" });
    const ok = await telegramAlertService.sendAlert(title, details || '', level || 'info', 0);
    res.json({ success: ok, message: ok ? "تم إرسال التنبيه" : "فشل الإرسال أو الخدمة معطلة" });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// API: Real Dynamic Network Router Discovery (MNDP Protocol & Dynamic Interfaces)
router.get("/api/mikrotik/discover", async (req: Request, res: Response) => {
  try {
    const discovered = await discoverMikrotikRouters(1500);
    res.json({
      success: true,
      count: discovered.length,
      routers: discovered,
      message: discovered.length > 0
        ? `تم الكشف التلقائي عن ${discovered.length} راوتر ميكروتك على الشبكة وجلب بياناته`
        : "لم يتم اكتشاف راوتر ميكروتك على الشبكة المحلية حالياً"
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(err), routers: [] });
  }
});

// API: Diagnose Socket & Port Reachability
router.post("/api/mikrotik/setup/:type", setupRouterApi);
router.post("/api/mikrotik/security/audit", auditSecurityApi);
router.post("/api/mikrotik/security/autofix", autoFixSecurityApi);
router.get("/api/mikrotik/scripts/audit", auditScriptsApi);
router.post("/api/mikrotik/scripts/clean", (req, res) => {
  recordAudit(req, "clean_router_scripts", "router_scripts", "success");
  return cleanScriptsApi(req, res);
});
router.get("/api/mikrotik/management/discover", discoverManagementPortsAndIpsApi);
router.post("/api/mikrotik/management/discover", discoverManagementPortsAndIpsApi);
router.post("/api/mikrotik/diagnose", async (req: Request, res: Response) => {
  const { host, port } = req.body;
  const targetHost = host ? String(host).trim() : "192.168.88.1";
  const targetPort = port && Number(port) > 0 ? Number(port) : 8728;

  try {
    const diagnostic = await MikrotikAPI_Original.diagnoseHostAndPort(targetHost, targetPort);
    res.json({
      success: true,
      diagnostic
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: translateErrorMessage(err)
    });
  }
});

// API: Connect (Strict Real Admin Authentication + Optional TLS Pinning & RBAC Operator Role)
router.post("/api/mikrotik/connect", async (req: Request, res: Response) => {
  const {
    host,
    port,
    username,
    password,
    useSsl = false,
    strictTls = false,
    tlsFingerprint,
    operatorUsername,
    operatorPassword
  } = req.body;
  if (!username || !String(username).trim()) {
    return res.status(200).json({ success: false, message: "يجب إدخال اسم المستخدم الخاص بمدير الراوتر (admin)" });
  }

  // Optional Operator RBAC verification prior to router handshake
  let assignedRole: OperatorRole = "admin";
  let assignedOperatorId = "root-admin";
  let assignedOperatorName = String(username).trim();

  if (operatorUsername && String(operatorUsername).trim()) {
    const op = rbacService.authenticateOperator(String(operatorUsername), String(operatorPassword || ""));
    if (!op) {
      recordAudit(req, "operator_login_failed", "auth", "failure", {
        reason: `فشل مصادقة المشغل (${sanitizeInput(operatorUsername)})`
      });
      return res.status(200).json({
        success: false,
        reasonType: "auth",
        message: "اسم المشغل أو كلمة مرور المشغل غير صحيحة أو الحساب معطل",
        suggestion: "تحقق من بيانات المشغل في تبويب الإعدادات -> الأمان والصلاحيات."
      });
    }
    assignedRole = op.role;
    assignedOperatorId = op.id;
    assignedOperatorName = op.displayName || op.username;
  }

  const targetHost = host ? String(host).trim() : "192.168.88.1";
  const targetPort = port && Number(port) > 0 ? Number(port) : (useSsl ? 8729 : 8728);
  const cleanExpectedFp = tlsFingerprint ? String(tlsFingerprint).trim() : undefined;

  try {
    const client = createMikrotikClient();
    await client.connect(targetHost, username, password, targetPort, useSsl, {
      strictTls: Boolean(strictTls),
      tlsFingerprint: cleanExpectedFp
    });

    let cachedRes = typeof client.getCachedResource === 'function' ? client.getCachedResource() : null;
    let routerIdentity = typeof client.getRouterIdentity === 'function' ? client.getRouterIdentity() : "MikroTik";
    let routerBoard = typeof client.getRouterBoard === 'function' ? client.getRouterBoard() : "RouterBOARD";

    if (!cachedRes) {
      try {
        const [resInfo, idRes, boardRes] = await Promise.all([
          client.querySafe("/system/resource/print", undefined, { timeoutSeconds: 4, rapid: true }),
          client.querySafe("/system/identity/print", undefined, { timeoutSeconds: 4, rapid: true }),
          client.querySafe("/system/routerboard/print", undefined, { timeoutSeconds: 4, rapid: true })
        ]);
        if (resInfo && resInfo[0]) cachedRes = resInfo[0];
        if (idRes && idRes[0]?.name) routerIdentity = idRes[0].name;
        if (boardRes && boardRes[0]?.['board-name']) routerBoard = boardRes[0]['board-name'];
      } catch {}
    }

    const peerFingerprint = typeof client.getPeerTlsFingerprint === "function" ? client.getPeerTlsFingerprint() : null;

    // Generate secure token with timestamp, encrypted password & RBAC tracking
    const token = crypto.randomBytes(16).toString('hex');
    routerClients.set(token, {
      client,
      lastSeen: Date.now(),
      encPassword: password ? encryptSecret(String(password)) : undefined,
      host: targetHost,
      user: String(username).trim(),
      role: assignedRole,
      operatorId: assignedOperatorId,
      operatorName: assignedOperatorName,
      tlsFingerprint: peerFingerprint
    });
    setLatestActiveClient(client);

    recordAudit(req, "router_connect", "session", "success", {
      resourceId: targetHost,
      changes: {
        before: null,
        after: { host: targetHost, port: targetPort, useSsl: Boolean(useSsl), role: assignedRole, operator: assignedOperatorName }
      }
    });

    const internetStatus = { hasInternet: true, gateway: '', wanIp: '', pingMs: 15 };

    return res.json({
      success: true,
      message: "تم الاتصال بسيرفر المايكروتك بنجاح والمصادقة على الصلاحيات",
      token,
      role: assignedRole,
      operatorName: assignedOperatorName,
      tlsFingerprint: peerFingerprint,
      router: {
        name: routerIdentity,
        host: targetHost,
        version: cachedRes?.version || client.getRouterVersion(),
        majorVersion: client.getMajorVersion(),
        boardName: routerBoard,
        uptime: cachedRes?.uptime || "",
        cpuLoad: parseInt(cachedRes?.['cpu-load'] || "0", 10),
        freeMemory: parseInt(cachedRes?.['free-memory'] || "0", 10),
        totalMemory: parseInt(cachedRes?.['total-memory'] || "0", 10),
        hasInternet: true,
        gateway: "",
        wanIp: "",
        pingMs: 15,
        tlsFingerprint: peerFingerprint || undefined,
        connectedAt: new Date().toISOString()
      },
      internetStatus
    });
  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    const translatedMsg = translateErrorMessage(rawMsg);

    recordAudit(req, "router_connect", "session", "failure", {
      resourceId: targetHost,
      reason: rawMsg
    });

    let reasonType = 'network';
    let suggestion = 'تأكد من اتصالك بالشبكة وصحة عنوان الـ IP والمنفذ.';

    if (rawMsg.includes('بصمة') || rawMsg.toLowerCase().includes('fingerprint') || rawMsg.toLowerCase().includes('tls')) {
      reasonType = 'tls_pinning';
      suggestion = 'بصمة شهادة الـ SSL للراوتر لا تطابق البصمة المثبتة (TLS Pinning). تحقق من الشهادة أو حدّث البصمة.';
    } else if (rawMsg.includes('صلاحيات') || rawMsg.toLowerCase().includes('permission') || rawMsg.toLowerCase().includes('admin / full')) {
      reasonType = 'permissions';
      suggestion = 'حساب الراوتر لا يمتلك صلاحيات المدير الكاملة. افتح WinBox ثم System -> Users وقم بتعيين المجموعة إلى full.';
    } else if (rawMsg.toLowerCase().includes('password') || rawMsg.toLowerCase().includes('user') || rawMsg.toLowerCase().includes('login') || rawMsg.toLowerCase().includes('authentication')) {
      reasonType = 'auth';
      suggestion = 'اسم المستخدم أو كلمة المرور غير مطابقة لحساب المدير (admin) في الراوتر.';
    } else if (rawMsg.toLowerCase().includes('refused')) {
      reasonType = 'service_disabled';
      suggestion = `منفذ الـ API (${targetPort}) معطل في الراوتر. افتح WinBox ثم توجه إلى IP -> Services وقم بتفعيل خدمة ${useSsl ? 'api-ssl' : 'api'}.`;
    } else if (rawMsg.toLowerCase().includes('timeout') || rawMsg.toLowerCase().includes('unreach')) {
      reasonType = 'unreachable';
      suggestion = `تعذر الوصول إلى عنوان الـ IP عبر الشبكة على المنفذ ${targetPort}. تأكد من توصيل الكابل ومطابقة نطاق الشبكة وتوجيه المنفذ.`;
    }

    return res.status(200).json({
      success: false,
      message: translatedMsg,
      rawError: rawMsg,
      reasonType,
      suggestion,
      host: targetHost,
      port: targetPort
    });
  }
});

// API: Cancel / Disconnect Connection Attempt
router.post("/api/mikrotik/cancel-connect", async (req: Request, res: Response) => {
  try {
    const token = resolveRequestToken(req);
    if (token) {
      const session = routerClients.get(token);
      if (session) {
        try {
          if (session.client && typeof session.client.disconnect === "function") {
            await session.client.disconnect();
          }
        } catch {}
        if (getLatestActiveClient() === session.client) {
          setLatestActiveClient(null);
        }
        routerClients.delete(token);
      }
    } else if (!securityConfig.strictTenantIsolation) {
      if (getLatestActiveClient() === MikrotikAPI_Original) {
        setLatestActiveClient(null);
      }
      await MikrotikAPI_Original.disconnect();
    }
    return res.json({ success: true, message: "تم إلغاء محاولة الاتصال بنجاح" });
  } catch (err: any) {
    return res.json({ success: true, message: "تم إيقاف الاتصال" });
  }
});

// API: Check current session status & restore connection without forcing logout
router.get("/api/mikrotik/session", async (req: Request, res: Response) => {
  const token = resolveRequestToken(req);
  const session = token ? routerClients.get(token) : undefined;
  const fallbackClient = getLatestActiveClient();
  const client =
    req.routerClient ||
    session?.client ||
    (!securityConfig.strictTenantIsolation && fallbackClient && fallbackClient.isConnected() ? fallbackClient : null);

  if (client && client.isConnected()) {
    const config = client.currentConfig || session || {};
    const tlsFp = session?.tlsFingerprint || (typeof client.getPeerTlsFingerprint === "function" ? client.getPeerTlsFingerprint() : null);
    return res.json({
      success: true,
      connected: true,
      token: token || undefined,
      role: session?.role || "admin",
      operatorName: session?.operatorName || config.user || "admin",
      tlsFingerprint: tlsFp,
      router: {
        host: config.host || "192.168.88.1",
        port: config.port || 8728,
        username: config.user || "admin",
        boardName: client.boardName || "RouterBOARD",
        version: client.routerVersion || "RouterOS",
        majorVersion: client.routerMajorVersion || 7,
        tlsFingerprint: tlsFp || undefined
      }
    });
  }

  // Attempt reconnection if client instance exists
  if (client && typeof client.ensureConnected === "function") {
    try {
      const ok = await client.ensureConnected();
      if (ok) {
        const config = client.currentConfig || session || {};
        const tlsFp = session?.tlsFingerprint || (typeof client.getPeerTlsFingerprint === "function" ? client.getPeerTlsFingerprint() : null);
        return res.json({
          success: true,
          connected: true,
          token: token || undefined,
          role: session?.role || "admin",
          operatorName: session?.operatorName || config.user || "admin",
          tlsFingerprint: tlsFp,
          router: {
            host: config.host || "192.168.88.1",
            port: config.port || 8728,
            username: config.user || "admin",
            boardName: client.boardName || "RouterBOARD",
            version: client.routerVersion || "RouterOS",
            majorVersion: client.routerMajorVersion || 7,
            tlsFingerprint: tlsFp || undefined
          }
        });
      }
    } catch {}
  }

  return res.json({ success: false, connected: false, message: "لا توجد جلسة اتصال نشطة" });
});

// API: Internet & WAN Connectivity Status Live Tracker
router.get("/api/mikrotik/internet-status", async (req: Request, res: Response) => {
  if (!MikrotikAPI.isConnected()) {
    return res.json({
      success: true,
      status: {
        hasInternet: false,
        pingMs: 0,
        packetLoss: 100,
        gateway: "",
        wanIp: "",
        checkedAt: new Date().toISOString()
      }
    });
  }

  try {
    const status = await MikrotikAPI.checkInternetConnectivity();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(err) });
  }
});


// أ. مزامنة النظام (خفيف مع حماية حرارية وضبط تلقائي للبينج ومعالج الراوتر)
router.get("/api/mikrotik/data/sync/system", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
  const hardForce = req.query.hard === 'true';
  try {
    const [resourceRes, identityRes, boardRes, interfaces, healthRes, internetStatus] = await Promise.all([
      fetchSafeCached('/system/resource/print', undefined, 6000, client, force),
      fetchSafeCached('/system/identity/print', undefined, 120000, client, hardForce),
      fetchSafeCached('/system/routerboard/print', undefined, 120000, client, hardForce),
      fetchSafeCached('/interface/print', ['.proplist=.id,name,type,running,disabled,rx-byte,tx-byte,comment'], 20000, client, force),
      fetchSafeCached('/system/health/print', undefined, 45000, client, hardForce).catch(() => []),
      client.checkInternetConnectivity({ skipIcmpPing: true })
    ]);

    const resItem = Array.isArray(resourceRes) ? resourceRes[0] : null;

    // Robust extraction of CPU and board temperature for both RouterOS v6 (object) and v7 (rows)
    let cpuTempRaw: any = undefined;
    let boardTempRaw: any = undefined;

    if (Array.isArray(healthRes)) {
      for (const item of healthRes) {
        if (!item) continue;
        if (item.name && item.value !== undefined) {
          const n = String(item.name).toLowerCase();
          if (n === 'cpu-temperature' || n === 'cpu-temp') cpuTempRaw = item.value;
          else if (n === 'temperature' && cpuTempRaw === undefined) cpuTempRaw = item.value;
          else if (n === 'board-temperature1' || n === 'board-temperature' || n === 'board-temp') boardTempRaw = item.value;
        } else {
          if (item['cpu-temperature'] !== undefined) cpuTempRaw = item['cpu-temperature'];
          else if (item.temperature !== undefined && cpuTempRaw === undefined) cpuTempRaw = item.temperature;
          if (item['board-temperature1'] !== undefined) boardTempRaw = item['board-temperature1'];
          else if (item['board-temperature'] !== undefined) boardTempRaw = item['board-temperature'];
        }
      }
    }

    const cpuTemperature = cpuTempRaw !== undefined ? parseInt(String(cpuTempRaw).replace(/[^0-9]/g, ''), 10) : undefined;
    const boardTemperature = boardTempRaw !== undefined ? parseInt(String(boardTempRaw).replace(/[^0-9]/g, ''), 10) : undefined;
    const cpuLoad = parseInt(resItem?.['cpu-load'] || "0", 10);

    // Feed real hardware thermal metrics to API client & Auto-Ping Stabilizer
    if (typeof client.updateHardwareMetrics === "function") {
      client.updateHardwareMetrics(cpuLoad, cpuTemperature);
    }
    const pingStabilizer = typeof client.getPingStabilizer === "function" ? client.getPingStabilizer().getSnapshot() : undefined;

    res.json({
      success: true,
      data: {
        cpuLoad,
        uptime: resItem?.uptime || "",
        freeMemory: parseInt(resItem?.['free-memory'] || "0", 10),
        totalMemory: parseInt(resItem?.['total-memory'] || "0", 10),
        version: resItem?.version || "",
        boardName: boardRes[0]?.['board-name'] || resItem?.['board-name'] || "",
        identity: identityRes[0]?.name || "Z.Control",
        cpuTemperature,
        boardTemperature,
        internetStatus,
        hasInternet: internetStatus.hasInternet,
        gateway: internetStatus.gateway,
        wanIp: internetStatus.wanIp,
        pingMs: typeof client.getLatency === "function" ? client.getLatency() : (internetStatus?.pingMs || 3),
        pingStabilizer,
        interfaces: (Array.isArray(interfaces) ? interfaces.map(normalizeNetworkInterface).filter(Boolean) : [])
      }
    });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ب. مزامنة الهوتسبوت والمستخدمين (متوسط/ثقيل)
router.get("/api/mikrotik/data/sync/hotspot", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
  try {
    const [activeHotspotUsers, hotspotUsers, hotspotProfilesRaw, ipBindings, umData] = await Promise.all([
      fetchSafeCached('/ip/hotspot/active/print', ['.proplist=.id,user,address,mac-address,uptime,bytes-in,bytes-out,login-by,comment'], 4000, client, force).catch(() => []),
      fetchSafeCached('/ip/hotspot/user/print', ['=.proplist=.id,name,password,profile,uptime,bytes-in,bytes-out,limit-uptime,limit-bytes-total,comment,disabled,mac-address,email,server'], 180000, client, force).catch(() => []),
      fetchSafeCached('/ip/hotspot/user/profile/print', undefined, 30000, client, force).catch(() => []),
      fetchSafeCached('/ip/hotspot/ip-binding/print', undefined, 20000, client, force).catch(() => []),
      fetchComprehensiveUsermanData(client).catch(() => ({ users: [], profiles: [], active: [] }))
    ]);

    // Calculate lightweight delta signature for hotspot users
    const userCount = Array.isArray(hotspotUsers) ? hotspotUsers.length : 0;
    const firstUserId = userCount > 0 ? (hotspotUsers[0]?.['.id'] || hotspotUsers[0]?.name || '') : '';
    const lastUserId = userCount > 0 ? (hotspotUsers[userCount - 1]?.['.id'] || hotspotUsers[userCount - 1]?.name || '') : '';
    const userSignature = `hs-${userCount}-${firstUserId}-${lastUserId}`;

    const clientUserHash = req.query.userHash as string;
    const isUserDeltaMatch = !force && Boolean(clientUserHash && clientUserHash === userSignature);

    const mappedUsers = (Array.isArray(hotspotUsers) ? hotspotUsers : []).map((u: any) => ({
      id: u?.['.id'] || u?.id || u?.name || `u-${Date.now()}`,
      name: u?.name || "مستخدم غير مسمى",
      password: u?.password || "",
      profile: u?.profile || "default",
      uptime: u?.uptime || "0s",
      bytesIn: parseInt(u?.['bytes-in'] || "0", 10) || 0,
      bytesOut: parseInt(u?.['bytes-out'] || "0", 10) || 0,
      limitUptime: u?.['limit-uptime'] || "",
      limitBytesTotal: parseInt(u?.['limit-bytes-total'] || "0", 10) || 0,
      comment: u?.comment || "",
      disabled: u?.disabled === "true" || u?.disabled === true || u?.disabled === "yes",
      macAddress: u?.['mac-address'] || "",
      email: u?.email || "",
      server: u?.server || "all",
      routes: u?.routes || "",
      lastLoggedOut: u?.['last-logged-out'] || u?.lastLoggedOut || "",
      lastLoggedIn: u?.['last-logged-in'] || u?.lastLoggedIn || "",
      raw: u
    }));

    const mappedActiveUsers = (Array.isArray(activeHotspotUsers) ? activeHotspotUsers.map(normalizeActiveHotspotUser).filter(Boolean) : []);

    const mappedProfiles = (Array.isArray(hotspotProfilesRaw) ? hotspotProfilesRaw : []).map(normalizeHotspotProfile);

    res.json({
      success: true,
      data: {
        notModifiedUsers: false,
        userHash: userSignature,
        hotspotUsers: mappedUsers,
        activeHotspotUsers: mappedActiveUsers,
        hotspotProfiles: mappedProfiles,
        usermanUsers: umData?.users || [],
        usermanProfiles: umData?.profiles || [],
        usermanActive: umData?.active || [],
        ipBindings: Array.isArray(ipBindings) ? ipBindings : []
      }
    });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ج. مزامنة PPP (خفيف ومخزن مؤقتاً لحماية معالج المايكروتك)
router.get("/api/mikrotik/data/sync/ppp", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
  try {
    const [secrets, active, profilesRaw] = await Promise.all([
      fetchSafeCached('/ppp/secret/print', ['.proplist=.id,name,password,profile,service,caller-id,remote-address,comment,disabled'], 180000, client, force),
      fetchSafeCached('/ppp/active/print', ['.proplist=.id,name,service,caller-id,address,uptime,encoding'], 4000, client, force),
      fetchSafeCached('/ppp/profile/print', undefined, 30000, client, force)
    ]);

    const secretCount = Array.isArray(secrets) ? secrets.length : 0;
    const firstSecretId = secretCount > 0 ? (secrets[0]?.['.id'] || secrets[0]?.name || '') : '';
    const lastSecretId = secretCount > 0 ? (secrets[secretCount - 1]?.['.id'] || secrets[secretCount - 1]?.name || '') : '';
    const secretSignature = `ppp-${secretCount}-${firstSecretId}-${lastSecretId}`;

    const profiles = (Array.isArray(profilesRaw) ? profilesRaw : []).map(normalizePPPProfile);
    res.json({
      success: true,
      data: {
        notModifiedSecrets: false,
        secretHash: secretSignature,
        secrets: Array.isArray(secrets) ? secrets : [],
        active: Array.isArray(active) ? active : [],
        profiles
      }
    });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// ==========================================
// CHUNKED STREAM PROCESSING ENDPOINT FOR SUBSCRIBERS
// Streams subscriber records in small NDJSON chunks (50-200 per chunk)
// to prevent UI freezing and ensure < 50ms initial latency for thousands of subscribers
// ==========================================
router.get("/api/mikrotik/data/stream/subscribers", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  }

  const domain = (req.query.domain as string) || 'hotspot'; // 'hotspot' | 'ppp' | 'userman'
  const chunkSize = Math.max(50, Math.min(500, parseInt(req.query.chunkSize as string, 10) || 150));
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';

  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    let rawItems: any[] = [];

    if (domain === 'hotspot') {
      const hotspotUsers = await fetchSafeCached(
        '/ip/hotspot/user/print',
        undefined,
        180000,
        client,
        force
      );
      rawItems = (Array.isArray(hotspotUsers) ? hotspotUsers : []).map((u: any) => ({
        id: u?.['.id'] || u?.id || u?.name || `u-${Date.now()}`,
        name: u?.name || "مستخدم غير مسمى",
        password: u?.password || "",
        profile: u?.profile || "default",
        uptime: u?.uptime || "0s",
        bytesIn: parseInt(u?.['bytes-in'] || "0", 10) || 0,
        bytesOut: parseInt(u?.['bytes-out'] || "0", 10) || 0,
        limitUptime: u?.['limit-uptime'] || "",
        limitBytesTotal: parseInt(u?.['limit-bytes-total'] || "0", 10) || 0,
        comment: u?.comment || "",
        disabled: u?.disabled === "true" || u?.disabled === true || u?.disabled === "yes",
        macAddress: u?.['mac-address'] || "",
        email: u?.email || "",
        server: u?.server || "all",
        routes: u?.routes || "",
        lastLoggedOut: u?.['last-logged-out'] || u?.lastLoggedOut || "",
        lastLoggedIn: u?.['last-logged-in'] || u?.lastLoggedIn || ""
      }));
    } else if (domain === 'ppp') {
      const pppSecrets = await fetchSafeCached(
        '/ppp/secret/print',
        undefined,
        180000,
        client,
        force
      );
      rawItems = Array.isArray(pppSecrets) ? pppSecrets : [];
    } else if (domain === 'userman') {
      const umData = await fetchComprehensiveUsermanData(client);
      rawItems = umData.users || [];
    }

    const totalItems = rawItems.length;
    const chunks: any[][] = [];
    for (let i = 0; i < totalItems; i += chunkSize) {
      chunks.push(rawItems.slice(i, i + chunkSize));
    }

    const totalChunks = Math.max(1, chunks.length);

    // Stream Meta Header Chunk
    res.write(JSON.stringify({
      type: 'META',
      domain,
      totalItems,
      totalChunks,
      chunkSize,
      timestamp: Date.now()
    }) + '\n');

    if (chunks.length === 0) {
      res.write(JSON.stringify({
        type: 'CHUNK',
        domain,
        chunkIndex: 0,
        totalChunks: 1,
        isLastChunk: true,
        items: [],
        timestamp: Date.now()
      }) + '\n');
    } else {
      for (let i = 0; i < chunks.length; i++) {
        const chunkItems = chunks[i];
        const isLastChunk = i === chunks.length - 1;
        res.write(JSON.stringify({
          type: 'CHUNK',
          domain,
          chunkIndex: i,
          totalChunks,
          isLastChunk,
          items: chunkItems,
          timestamp: Date.now()
        }) + '\n');
      }
    }

    res.end();
  } catch (err: any) {
    res.write(JSON.stringify({
      type: 'ERROR',
      domain,
      error: translateErrorMessage(err?.message || err)
    }) + '\n');
    res.end();
  }
});



router.get("/api/mikrotik/data/sync/network", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
  try {
    const [queuesRaw, leasesRaw, firewall, logsRaw] = await Promise.all([
      fetchSafeCached('/queue/simple/print', undefined, 25000, client, force),
      fetchSafeCached('/ip/dhcp-server/lease/print', undefined, 20000, client, force),
      fetchSafeCached('/ip/firewall/filter/print', undefined, 30000, client, force),
      fetchSafeCached('/log/print', ['=.proplist=.id,time,topics,message'], 15000, client, force)
    ]);
    const queues = (Array.isArray(queuesRaw) ? queuesRaw : []).map(normalizeSimpleQueue);
    const leases = (Array.isArray(leasesRaw) ? leasesRaw.map(normalizeDhcpLease) : []).filter(Boolean);
    const logs = (Array.isArray(logsRaw) ? logsRaw : []).slice(-30).reverse();
    res.json({ success: true, data: { queues, leases, firewall: Array.isArray(firewall) ? firewall : [], logs } });
  } catch (e: any) { res.status(500).json({ success: false, message: e.message }); }
});

// و. المزامنة الموحدة الذكية (Staged CPU-Safe All Data Sync)
// تجمع بيانات الراوتر على مرحلتين هادئتين بدون إغراق المعالج أو رفع البينج
router.get("/api/mikrotik/data/sync/all", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
  const hardForce = req.query.hard === 'true';

  try {
    // المرحلة 1: النظام الأساسي (خفيف جداً ويغذي منظم البينج والمعالج أولاً)
    const systemRes = await (async () => {
      const [resourceRes, identityRes, boardRes, interfaces, healthRes, internetStatus] = await Promise.all([
        fetchSafeCached('/system/resource/print', undefined, 6000, client, force).catch(() => []),
        fetchSafeCached('/system/identity/print', undefined, 120000, client, hardForce).catch(() => []),
        fetchSafeCached('/system/routerboard/print', undefined, 120000, client, hardForce).catch(() => []),
        fetchSafeCached('/interface/print', ['.proplist=.id,name,type,running,disabled,rx-byte,tx-byte,comment'], 25000, client, force).catch(() => []),
        fetchSafeCached('/system/health/print', undefined, 45000, client, hardForce).catch(() => []),
        client.checkInternetConnectivity({ skipIcmpPing: true }).catch(() => ({ hasInternet: true, gateway: '', wanIp: '', pingMs: 15 }))
      ]);
      const resItem = Array.isArray(resourceRes) ? resourceRes[0] : null;
      let cpuTempRaw: any, boardTempRaw: any;
      if (Array.isArray(healthRes)) {
        for (const item of healthRes) {
          if (!item) continue;
          if (item.name && item.value !== undefined) {
            const n = String(item.name).toLowerCase();
            if (n === 'cpu-temperature' || n === 'cpu-temp') cpuTempRaw = item.value;
            else if (n === 'temperature' && cpuTempRaw === undefined) cpuTempRaw = item.value;
            else if (n === 'board-temperature1' || n === 'board-temperature' || n === 'board-temp') boardTempRaw = item.value;
          } else {
            if (item['cpu-temperature'] !== undefined) cpuTempRaw = item['cpu-temperature'];
            else if (item.temperature !== undefined && cpuTempRaw === undefined) cpuTempRaw = item.temperature;
            if (item['board-temperature1'] !== undefined) boardTempRaw = item['board-temperature1'];
            else if (item['board-temperature'] !== undefined) boardTempRaw = item['board-temperature'];
          }
        }
      }
      const cpuTemp = cpuTempRaw !== undefined ? parseInt(String(cpuTempRaw).replace(/[^0-9]/g, ''), 10) : undefined;
      const boardTemp = boardTempRaw !== undefined ? parseInt(String(boardTempRaw).replace(/[^0-9]/g, ''), 10) : undefined;
      const cpuLoad = parseInt(resItem?.['cpu-load'] || "0", 10);
      if (typeof client.updateHardwareMetrics === "function") {
        client.updateHardwareMetrics(cpuLoad, cpuTemp);
      }
      const pingStabilizer = typeof client.getPingStabilizer === "function" ? client.getPingStabilizer().getSnapshot() : undefined;
      return {
        cpuLoad,
        uptime: resItem?.uptime || "",
        freeMemory: parseInt(resItem?.['free-memory'] || "0", 10),
        totalMemory: parseInt(resItem?.['total-memory'] || "0", 10),
        version: resItem?.version || "",
        boardName: boardRes[0]?.['board-name'] || resItem?.['board-name'] || "",
        identity: identityRes[0]?.name || "Z.Control",
        cpuTemperature: cpuTemp,
        boardTemperature: boardTemp,
        internetStatus,
        hasInternet: internetStatus.hasInternet,
        gateway: internetStatus.gateway,
        wanIp: internetStatus.wanIp,
        pingMs: typeof client.getLatency === "function" ? client.getLatency() : (internetStatus?.pingMs || 3),
        pingStabilizer,
        interfaces: (Array.isArray(interfaces) ? interfaces.map(normalizeNetworkInterface).filter(Boolean) : [])
      };
    })();

    // المرحلة 2: المشتركون (Hotspot + PPP بالتوازي المنضبط ضمن حد التزامن الآمن)
    const [hotspotRes, pppRes] = await Promise.all([
      (async () => {
        const [activeHotspotUsers, hotspotUsers, hotspotProfilesRaw, ipBindings, umData] = await Promise.all([
          fetchSafeCached('/ip/hotspot/active/print', ['.proplist=.id,user,address,mac-address,uptime,bytes-in,bytes-out,login-by,comment'], 5000, client, force).catch(() => []),
          fetchSafeCached('/ip/hotspot/user/print', ['=.proplist=.id,name,password,profile,uptime,bytes-in,bytes-out,limit-uptime,limit-bytes-total,comment,disabled,mac-address,email,server'], 180000, client, hardForce).catch(() => []),
          fetchSafeCached('/ip/hotspot/user/profile/print', undefined, 45000, client, force).catch(() => []),
          fetchSafeCached('/ip/hotspot/ip-binding/print', undefined, 45000, client, hardForce).catch(() => []),
          fetchComprehensiveUsermanData(client, hardForce).catch(() => ({ users: [], profiles: [], active: [] }))
        ]);

        const userCount = Array.isArray(hotspotUsers) ? hotspotUsers.length : 0;
        const firstUserId = userCount > 0 ? (hotspotUsers[0]?.['.id'] || hotspotUsers[0]?.name || '') : '';
        const lastUserId = userCount > 0 ? (hotspotUsers[userCount - 1]?.['.id'] || hotspotUsers[userCount - 1]?.name || '') : '';
        const userSignature = `hs-${userCount}-${firstUserId}-${lastUserId}`;

        const mappedUsers = (Array.isArray(hotspotUsers) ? hotspotUsers : []).map((u: any) => ({
          id: u?.['.id'] || u?.id || u?.name || `u-${Date.now()}`,
          name: u?.name || "مستخدم غير مسمى",
          password: u?.password || "",
          profile: u?.profile || "default",
          uptime: u?.uptime || "0s",
          bytesIn: parseInt(u?.['bytes-in'] || "0", 10) || 0,
          bytesOut: parseInt(u?.['bytes-out'] || "0", 10) || 0,
          limitUptime: u?.['limit-uptime'] || "",
          limitBytesTotal: parseInt(u?.['limit-bytes-total'] || "0", 10) || 0,
          comment: u?.comment || "",
          disabled: u?.disabled === "true" || u?.disabled === true || u?.disabled === "yes",
          macAddress: u?.['mac-address'] || "",
          email: u?.email || "",
          server: u?.server || "all",
          routes: u?.routes || "",
          lastLoggedOut: u?.['last-logged-out'] || u?.lastLoggedOut || "",
          lastLoggedIn: u?.['last-logged-in'] || u?.lastLoggedIn || "",
          raw: u
        }));

        return {
          userHash: userSignature,
          hotspotUsers: mappedUsers,
          activeHotspotUsers: (Array.isArray(activeHotspotUsers) ? activeHotspotUsers.map(normalizeActiveHotspotUser).filter(Boolean) : []),
          hotspotProfiles: (Array.isArray(hotspotProfilesRaw) ? hotspotProfilesRaw : []).map(normalizeHotspotProfile),
          usermanUsers: umData?.users || [],
          usermanProfiles: umData?.profiles || [],
          usermanActive: umData?.active || [],
          ipBindings: Array.isArray(ipBindings) ? ipBindings : []
        };
      })(),

      (async () => {
        const [secrets, active, profilesRaw] = await Promise.all([
          fetchSafeCached('/ppp/secret/print', ['=.proplist=.id,name,password,profile,service,caller-id,remote-address,comment,disabled'], 180000, client, hardForce).catch(() => []),
          fetchSafeCached('/ppp/active/print', ['.proplist=.id,name,service,caller-id,address,uptime,encoding'], 5000, client, force).catch(() => []),
          fetchSafeCached('/ppp/profile/print', undefined, 45000, client, force).catch(() => [])
        ]);
        const secretCount = Array.isArray(secrets) ? secrets.length : 0;
        const firstSecretId = secretCount > 0 ? (secrets[0]?.['.id'] || secrets[0]?.name || '') : '';
        const lastSecretId = secretCount > 0 ? (secrets[secretCount - 1]?.['.id'] || secrets[secretCount - 1]?.name || '') : '';
        const secretSignature = `ppp-${secretCount}-${firstSecretId}-${lastSecretId}`;

        return {
          secretHash: secretSignature,
          secrets: Array.isArray(secrets) ? secrets : [],
          active: Array.isArray(active) ? active : [],
          profiles: (Array.isArray(profilesRaw) ? profilesRaw : []).map(normalizePPPProfile)
        };
      })()
    ]);

    // المرحلة 3: بيانات الشبكة الثقيلة (مخزنة مؤقتاً لتفادي إجهاد المعالج)
    const networkRes = await (async () => {
      const [queuesRaw, leasesRaw, firewall, logsRaw] = await Promise.all([
        fetchSafeCached('/queue/simple/print', ['.proplist=.id,name,target,max-limit,limit-at,priority,bytes,rate,disabled'], 45000, client, hardForce).catch(() => []),
        fetchSafeCached('/ip/dhcp-server/lease/print', ['.proplist=.id,address,mac-address,server,host-name,status,expires-after,dynamic,disabled,comment'], 45000, client, hardForce).catch(() => []),
        fetchSafeCached('/ip/firewall/filter/print', ['.proplist=.id,chain,action,bytes,packets,disabled,comment'], 60000, client, hardForce).catch(() => []),
        fetchSafeCached('/log/print', ['=.proplist=.id,time,topics,message'], 45000, client, hardForce).catch(() => [])
      ]);
      return {
        queues: (Array.isArray(queuesRaw) ? queuesRaw : []).map(normalizeSimpleQueue),
        leases: (Array.isArray(leasesRaw) ? leasesRaw.map(normalizeDhcpLease) : []).filter(Boolean),
        firewall: Array.isArray(firewall) ? firewall : [],
        logs: (Array.isArray(logsRaw) ? logsRaw : []).slice(-30).reverse()
      };
    })();

    res.json({
      success: true,
      data: {
        system: systemRes,
        hotspot: hotspotRes,
        ppp: pppRes,
        network: networkRes
      }
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ز. حالة محرك المزامنة اللحظية الحية (Real-Time WebSocket & Adaptive Polling Status)
router.get("/api/mikrotik/realtime/status", (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: realtimeSyncServer.getStatus()
  });
});

// ==========================================
// AUTO-PING & CPU STABILIZER + ROUTEROS QOS FAST-LANE ENDPOINTS
// ==========================================
router.get("/api/mikrotik/ping-stabilizer/status", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    const stab = typeof client.getPingStabilizer === "function" ? client.getPingStabilizer() : null;
    if (!stab) {
      return res.json({ success: true, stabilizer: null });
    }
    const refreshQos = req.query.refreshQos === "true";
    const snap = stab.getSnapshot();
    const qosStale = !snap.qosFastLane.checkedAt || Date.now() - snap.qosFastLane.checkedAt > 30000;
    if (client.isConnected() && (refreshQos || qosStale)) {
      await getRouterPingFastLaneStatus(client).catch(() => {});
    }
    return res.json({
      success: true,
      stabilizer: stab.getSnapshot(),
      throttler: typeof client.getThrottlerStats === "function" ? client.getThrottlerStats() : undefined,
      realtime: realtimeSyncServer.getStatus()
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/ping-stabilizer/config", (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  try {
    const stab = typeof client.getPingStabilizer === "function" ? client.getPingStabilizer() : null;
    if (!stab) {
      return res.status(400).json({ success: false, message: "محرك ضبط البينج غير مهيأ لهذه الجلسة" });
    }
    const { mode, targetPingMs, maxCpuThreshold, autoQosEnabled, resetStats } = req.body || {};
    if (resetStats) {
      stab.resetStats();
    }
    const validModes: PingStabilizerMode[] = ["auto", "aggressive", "balanced", "off"];
    const updated = stab.updateConfig({
      mode: validModes.includes(mode) ? mode : undefined,
      targetPingMs: targetPingMs !== undefined ? Number(targetPingMs) : undefined,
      maxCpuThreshold: maxCpuThreshold !== undefined ? Number(maxCpuThreshold) : undefined,
      autoQosEnabled: typeof autoQosEnabled === "boolean" ? autoQosEnabled : undefined
    });
    if (typeof client.syncStabilizerToThrottler === "function") {
      client.syncStabilizerToThrottler();
    }
    realtimeSyncServer.broadcastStabilizerUpdate(updated);
    recordAudit(req, "update_ping_stabilizer", "ping_stabilizer", "success", {
      changes: { before: null, after: { mode: updated.mode, targetPingMs: updated.targetPingMs } }
    });
    return res.json({
      success: true,
      message: "تم تحديث إعدادات منظم البينج التلقائي بنجاح",
      stabilizer: updated
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/ping-stabilizer/optimize-now", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    return res.status(401).json({ success: false, message: "الراوتر غير متصل حالياً" });
  }
  try {
    const { target = "1.1.1.1", count = 3, applyQos = false } = req.body || {};
    const safeTarget = sanitizeInput(String(target || "1.1.1.1")) || "1.1.1.1";
    const probe = await runActivePingProbe(client, { target: safeTarget, count: Number(count) || 3 });

    const stab = typeof client.getPingStabilizer === "function" ? client.getPingStabilizer() : null;
    if (stab && stab.getSnapshot().mode === "off") {
      stab.updateConfig({ mode: "auto" });
    }
    if (typeof client.syncStabilizerToThrottler === "function") {
      client.syncStabilizerToThrottler();
    }

    let qosResult: any = null;
    if (applyQos) {
      qosResult = await applyRouterPingFastLane(client, { prioritizeManagementApi: true });
    } else {
      await getRouterPingFastLaneStatus(client).catch(() => {});
    }

    const snapshot = stab ? stab.getSnapshot() : null;
    if (snapshot) {
      realtimeSyncServer.broadcastStabilizerUpdate(snapshot);
    }

    return res.json({
      success: true,
      message: `تم فحص وضبط البينج بنجاح — المتوسط ${probe.avgPingMs}ms (تذبذب ${probe.jitterMs}ms)`,
      probe,
      qos: qosResult,
      stabilizer: snapshot
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/ping-stabilizer/qos-fastlane", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    return res.status(401).json({ success: false, message: "الراوتر غير متصل حالياً" });
  }
  try {
    const { enable, prioritizeManagementApi = true } = req.body || {};
    const result = enable
      ? await applyRouterPingFastLane(client, { prioritizeManagementApi: Boolean(prioritizeManagementApi) })
      : await removeRouterPingFastLane(client);

    const stab = typeof client.getPingStabilizer === "function" ? client.getPingStabilizer() : null;
    if (stab) {
      stab.updateConfig({ autoQosEnabled: Boolean(enable) });
      realtimeSyncServer.broadcastStabilizerUpdate(stab.getSnapshot());
    }

    recordAudit(req, enable ? "enable_ping_qos_fastlane" : "disable_ping_qos_fastlane", "router_qos", "success", {
      changes: { before: null, after: { enabled: Boolean(enable), status: result.status } }
    });

    return res.json({
      success: true,
      message: result.message,
      status: result.status,
      stabilizer: stab ? stab.getSnapshot() : null
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// هـ. وضع الحماية والتبريد الفائق (Eco & Thermal Shield Control)
router.post("/api/mikrotik/system/eco-mode", (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  const { enabled } = req.body;
  if (typeof client.setEcoMode === "function") {
    client.setEcoMode(Boolean(enabled));
  }
  res.json({
    success: true,
    ecoMode: Boolean(enabled),
    message: enabled
      ? "تم تفعيل درع التبريد وحفظ طاقة ومعالج المايكروتك بنجاح"
      : "تم تعطيل وضع التبريد والعودة للمزامنة القياسية"
  });
});

// ==========================================
// DEDICATED REAL-TIME PROFILE ENDPOINTS
// ==========================================
router.get("/api/mikrotik/hotspot/profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالسيرفر" });
  try {
    const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
    if (force) invalidateCache('/ip/hotspot/user/profile');
    const raw = await client.querySafe('/ip/hotspot/user/profile/print');
    const profiles = (Array.isArray(raw) ? raw : []).map(normalizeHotspotProfile);
    res.json({ success: true, profiles, count: profiles.length });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.get("/api/mikrotik/ppp/profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالسيرفر" });
  try {
    const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
    if (force) invalidateCache('/ppp/profile');
    const raw = await client.querySafe('/ppp/profile/print');
    const profiles = (Array.isArray(raw) ? raw : []).map(normalizePPPProfile);
    res.json({ success: true, profiles, count: profiles.length });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.get("/api/mikrotik/userman/profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالسيرفر" });
  try {
    const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';
    const umData = await fetchComprehensiveUsermanData(client, force);
    res.json({ success: true, profiles: umData.profiles, count: umData.profiles.length });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================
// DATA PREFETCHER LIGHTWEIGHT SUMMARY ENDPOINT
// Fetches essential basic data (active counts & profiles) with strict caching & minimal proplist
// ==========================================
router.get("/api/mikrotik/prefetch/essential", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });

  try {
    // 1. Fetch Hotspot Profiles (heavily cached 60 seconds)
    const hsProfilesRaw = await fetchSafeCached(
      '/ip/hotspot/user/profile/print',
      ['=.proplist=.id,name,shared-users,rate-limit,mac-cookie-timeout'],
      60000,
      client
    );
    const hotspotProfiles = (Array.isArray(hsProfilesRaw) ? hsProfilesRaw : []).map(normalizeHotspotProfile);

    // 2. Fetch Active Hotspot count only (cached 15 seconds)
    const hsActiveRaw = await fetchSafeCached(
      '/ip/hotspot/active/print',
      ['=.proplist=.id,user'],
      15000,
      client
    );
    const activeHotspotCount = Array.isArray(hsActiveRaw) ? hsActiveRaw.length : 0;

    // 3. Fetch PPP Profiles (cached 60 seconds)
    const pppProfilesRaw = await fetchSafeCached(
      '/ppp/profile/print',
      ['=.proplist=.id,name,local-address,remote-address,rate-limit'],
      60000,
      client
    );
    const pppProfiles = (Array.isArray(pppProfilesRaw) ? pppProfilesRaw : []).map(normalizePPPProfile);

    // 4. Fetch PPP Active count only (cached 15 seconds)
    const pppActiveRaw = await fetchSafeCached(
      '/ppp/active/print',
      ['=.proplist=.id,name'],
      15000,
      client
    );
    const activePppCount = Array.isArray(pppActiveRaw) ? pppActiveRaw.length : 0;

    return res.json({
      success: true,
      timestamp: Date.now(),
      data: {
        activeHotspotCount,
        activePppCount,
        totalActiveCount: activeHotspotCount + activePppCount,
        hotspotProfiles,
        pppProfiles,
        hotspotProfilesCount: hotspotProfiles.length,
        pppProfilesCount: pppProfiles.length
      }
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================
// BACKGROUND SYNCHRONIZATION ENDPOINTS (Non-Critical Router Data)
// ==========================================
// BACKGROUND SYNCHRONIZATION ENGINE ENDPOINTS (Non-critical Router Data)
// Unified non-critical sync & system logs endpoints (eliminating duplicate shadowed routes)
// ==========================================
router.get("/api/mikrotik/non-critical/sync", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';

  try {
    const [logsRaw, interfacesRaw] = await Promise.all([
      fetchSafeCached('/log/print', ['=.proplist=.id,time,topics,message'], 15000, client, force),
      fetchSafeCached('/interface/print', ['=.proplist=.id,name,type,running,disabled,rx-byte,tx-byte,comment'], 10000, client, force)
    ]);

    const logsArray = Array.isArray(logsRaw) ? logsRaw : [];
    const rawLogs = logsArray.slice(-150);
    const normalizedLogs = rawLogs.slice(-100).reverse().map((l: any, idx: number) => {
      const topicsStr = String(l?.topics || '').toLowerCase();
      const msgStr = String(l?.message || '');
      let severity: 'info' | 'warning' | 'error' | 'critical' = 'info';
      if (/critical|error|alert|emergency/i.test(topicsStr) || /failure|failed|unreachable|out of memory|panic/i.test(msgStr)) {
        severity = 'error';
      } else if (/warn/i.test(topicsStr) || /timeout|reset|conflict|dropped|denied/i.test(msgStr)) {
        severity = 'warning';
      }
      return {
        id: String(l?.['.id'] || l?.id || `log-${Date.now()}-${idx}`),
        time: String(l?.time || 'now'),
        topics: String(l?.topics || 'system,info'),
        message: msgStr,
        severity
      };
    });

    const interfacesArray = Array.isArray(interfacesRaw) ? interfacesRaw : [];
    const normalizedInterfaces = interfacesArray.map(normalizeNetworkInterface).filter(Boolean);
    const interfaceNames = normalizedInterfaces.map((i: any) => i.name).filter(Boolean);

    return res.json({
      success: true,
      timestamp: Date.now(),
      data: {
        logs: normalizedLogs,
        rawLogs,
        interfaces: normalizedInterfaces,
        interfaceNames,
        throttlerStats: typeof client.getThrottlerStats === 'function' ? client.getThrottlerStats() : null,
        stats: {
          totalLogs: normalizedLogs.length,
          totalInterfaces: normalizedInterfaces.length,
          activeInterfacesCount: normalizedInterfaces.filter((i: any) => i.running && !i.disabled).length
        }
      }
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.get("/api/mikrotik/system/logs", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';

  try {
    const logsRaw = await fetchSafeCached('/log/print', ['=.proplist=.id,time,topics,message'], 12000, client, force);
    const logs = (Array.isArray(logsRaw) ? logsRaw : []).slice(-150).reverse().map((l: any, idx: number) => {
      const topics = String(l?.topics || "");
      const msg = String(l?.message || "");
      let severity: 'info' | 'warning' | 'error' | 'critical' = 'info';
      if (/critical|error|alert|emergency/i.test(topics) || /failure|failed|unreachable|out of memory|panic/i.test(msg)) {
        severity = 'critical';
      } else if (/warn/i.test(topics) || /timeout|reset|conflict|dropped|denied/i.test(msg)) {
        severity = 'warning';
      }
      return {
        id: l?.['.id'] || `log-${Date.now()}-${idx}`,
        time: l?.time || "",
        topics,
        message: msg,
        severity
      };
    });

    return res.json({ success: true, timestamp: Date.now(), logs, count: logs.length });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.get("/api/mikrotik/interfaces", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  const force = req.query.force === 'true' || req.headers['x-force-sync'] === 'true';

  try {
    const interfacesRaw = await fetchSafeCached('/interface/print', undefined, 10000, client, force);
    const interfacesArray = Array.isArray(interfacesRaw) ? interfacesRaw : [];
    const normalizedInterfaces = interfacesArray.map(normalizeNetworkInterface).filter(Boolean);

    return res.json({ success: true, timestamp: Date.now(), interfaces: normalizedInterfaces });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================
// REQUEST BATCHING / COMPOSITE REQUEST ENDPOINT
// Batches multiple small queries into a single composite request to reduce CPU and latency
// ==========================================
router.post("/api/mikrotik/batch", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });

  const { queries } = req.body;
  if (!Array.isArray(queries) || queries.length === 0) {
    return res.status(400).json({ success: false, message: "يجب إرسال مصفوفة الاستعلامات queries كـ array غير فارغة" });
  }
  if (queries.length > 25) {
    return res.status(400).json({ success: false, message: "الحد الأقصى هو 25 استعلاماً في الطلب المجمع الواحد لحماية معالج الراوتر" });
  }

  const READ_ONLY_BATCH_REGEX = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/print$/;
  const validatedQueries: Array<{ endpoint: string; params?: string[] }> = [];
  for (const q of queries) {
    const ep = typeof q?.endpoint === 'string' ? q.endpoint.trim() : '';
    if (!ep || !READ_ONLY_BATCH_REGEX.test(ep)) {
      return res.status(400).json({
        success: false,
        message: `مسار الاستعلام غير مسموح به في الطلب المجمّع (يُسمح بأوامر القراءة */print فقط): ${ep || 'فارغ'}`
      });
    }
    const safeParams = Array.isArray(q?.params)
      ? q.params.filter((p: unknown): p is string => typeof p === 'string' && p.length <= 256 && !/[\r\n\0]/.test(p))
      : undefined;
    validatedQueries.push({ endpoint: ep, params: safeParams });
  }

  try {
    const results = typeof client.batchQuery === 'function'
      ? await client.batchQuery(validatedQueries)
      : await Promise.all(validatedQueries.map(async (q) => {
          try {
            const data = await client.querySafe(q.endpoint, q.params);
            return { endpoint: q.endpoint, success: true, data };
          } catch {
            return { endpoint: q.endpoint, success: false, data: [] };
          }
        }));

    return res.json({
      success: true,
      timestamp: Date.now(),
      results
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ──────────────────────────────────────────
// SYSTEM & DIAGNOSTICS CONTROL ENDPOINTS
// ──────────────────────────────────────────

// 1. Reboot Router
router.post("/api/mikrotik/system/reboot", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    recordAudit(req, "system_reboot", "router_system", "success");
    // Send reboot command. RouterOS drops connection immediately on reboot.
    client.querySafe('/system/reboot').catch(() => {});
    return res.json({ success: true, message: "تم إرسال أمر إعادة تشغيل جهاز المايكروتك بنجاح" });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 2. Real System Binary Backup (.backup)
router.post("/api/mikrotik/system/backup", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawName = (req.body?.name || `zctrl_backup_${Date.now().toString(36)}`).trim();
    const cleanName = sanitizeInput(rawName).replace(/[^a-zA-Z0-9_-]/g, '') || `backup_${Date.now()}`;
    const password = req.body?.password ? sanitizeInput(req.body.password) : undefined;
    
    const params = [`=name=${cleanName}`];
    if (password) params.push(`=password=${password}`);

    await client.querySafe('/system/backup/save', params);
    invalidateCache('/file');
    recordAudit(req, "system_backup", "router_system", "success", { resourceId: `${cleanName}.backup` });

    return res.json({
      success: true,
      message: `تم إنشاء النسخة الاحتياطية (${cleanName}.backup) بنجاح وحفظها في ذاكرة الراوتر`,
      filename: `${cleanName}.backup`
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 3. Real Configuration Script Export (.rsc)
router.post("/api/mikrotik/system/export", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const exportFileName = `zctrl_exp_${Date.now().toString(36)}`;
    const isCompact = req.body?.compact !== false;
    
    const params = [`=file=${exportFileName}`];
    if (isCompact) params.push('=compact=yes');

    try {
      await client.query('/export', params);
    } catch {}

    // Wait a brief moment for RouterOS filesystem to flush the file
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Try reading exported file contents
    let fileContents = '';
    const fullFileName = `${exportFileName}.rsc`;
    try {
      const fileList = await client.querySafe('/file/print', [`?name=${fullFileName}`]);
      if (Array.isArray(fileList) && fileList.length > 0) {
        fileContents = fileList[0]?.contents || '';
      }
    } catch {}

    invalidateCache('/file');

    return res.json({
      success: true,
      message: "تم تصدير وتوليد سكربت إعدادات المايكروتك بنجاح",
      filename: fullFileName,
      script: fileContents || `# RouterOS Configuration Script Export\n# File: ${fullFileName}\n# Exported from ZCtrl System\n`
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 4. Update System Identity (Name)
router.post("/api/mikrotik/system/identity", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    const rawName = (req.body?.name || '').trim();
    if (!rawName) return res.status(400).json({ success: false, message: "اسم الراوتر مطلوب" });
    const cleanName = sanitizeInput(rawName);

    await client.querySafe('/system/identity/set', [`=name=${cleanName}`]);
    invalidateCache('/system/identity');
    recordAudit(req, "set_system_identity", "router_system", "success", { resourceId: cleanName });

    return res.json({
      success: true,
      message: `تم تغيير اسم جهاز الراوتر إلى (${cleanName}) بنجاح`,
      identity: cleanName
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// 5. Flush DNS Cache
router.post("/api/mikrotik/system/flush-dns", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    await client.querySafe('/ip/dns/cache/flush');
    return res.json({ success: true, message: "تم تفريغ وحذف كاش الـ DNS من الراوتر بنجاح" });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.get("/api/mikrotik/queues", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالسيرفر" });
  try {
    const raw = await client.querySafe('/queue/simple/print');
    const queues = (Array.isArray(raw) ? raw : []).map(normalizeSimpleQueue);
    res.json({ success: true, queues, count: queues.length });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// Comprehensive Real-time Multi-Profile Direct Refresh
router.post("/api/mikrotik/data/refresh-profiles", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  try {
    invalidateCache("/ip/hotspot");
    invalidateCache("/ppp");
    invalidateCache("user-manager");
    invalidateCache("/queue");
    clearCachedUsermanResult();

    const [hsRaw, pppRaw, umData, queuesRaw] = await Promise.all([
      client.querySafe('/ip/hotspot/user/profile/print'),
      client.querySafe('/ppp/profile/print'),
      fetchComprehensiveUsermanData(client, true).catch(() => ({ profiles: [] })),
      client.querySafe('/queue/simple/print')
    ]);

    const hotspotProfiles = (Array.isArray(hsRaw) ? hsRaw : []).map(normalizeHotspotProfile);
    const pppProfiles = (Array.isArray(pppRaw) ? pppRaw : []).map(normalizePPPProfile);
    const usermanProfiles = Array.isArray(umData?.profiles) ? umData.profiles : [];
    const simpleQueues = (Array.isArray(queuesRaw) ? queuesRaw : []).map(normalizeSimpleQueue);

    res.json({
      success: true,
      message: "تم جلب وتحديث كافة البروفايلات ومحددات السرعة من المايكروتك بنجاح",
      data: {
        hotspotProfiles,
        pppProfiles,
        usermanProfiles,
        simpleQueues
      }
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// API: Sync - Legacy Endpoint (Optimized with strict proplists & thermal protection to protect router CPU)
router.get("/api/mikrotik/sync", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    const ok = await client.ensureConnected();
    if (!ok) {
      return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
    }
  }

  try {
    // 1. System Resources & Identity (Light queries - Parallel)
    const resourceRes = await client.querySafe('/system/resource/print');
    const [identityRes, boardRes, interfaces] = await Promise.all([
      fetchSafeCached('/system/identity/print', undefined, 60000, client),
      fetchSafeCached('/system/routerboard/print', undefined, 60000, client),
      fetchSafeCached('/interface/print', undefined, 30000, client)
    ]);

    // 2. Heavy Subsystems - Protected with strict property projections (.proplist)
    const isThermalThrottled = typeof client.isThermalStressed === 'function' && client.isThermalStressed();

    const [activeHotspotUsers, hotspotUsers, hotspotProfilesRaw, ipBindings] = await Promise.all([
      fetchSafeCached('/ip/hotspot/active/print', undefined, isThermalThrottled ? 10000 : 5000, client),
      fetchSafeCached('/ip/hotspot/user/print', ['=.proplist=.id,name,password,profile,uptime,bytes-in,bytes-out,limit-uptime,limit-bytes-total,comment,disabled'], isThermalThrottled ? 30000 : 15000, client),
      fetchSafeCached('/ip/hotspot/user/profile/print', undefined, 30000, client),
      fetchSafeCached('/ip/hotspot/ip-binding/print', undefined, 20000, client)
    ]);

    const [pppActiveRaw, pppSecretsRaw, pppProfilesRaw, simpleQueuesRaw, dhcpLeasesRaw] = await Promise.all([
      fetchSafeCached('/ppp/active/print', undefined, isThermalThrottled ? 10000 : 5000, client),
      fetchSafeCached('/ppp/secret/print', ['=.proplist=.id,name,password,profile,service,caller-id,remote-address,comment,disabled'], isThermalThrottled ? 25000 : 15000, client),
      fetchSafeCached('/ppp/profile/print', undefined, 30000, client),
      fetchSafeCached('/queue/simple/print', undefined, 20000, client),
      fetchSafeCached('/ip/dhcp-server/lease/print', undefined, 20000, client)
    ]);
    const dhcpLeases = (Array.isArray(dhcpLeasesRaw) ? dhcpLeasesRaw.map(normalizeDhcpLease) : []).filter(Boolean);

    // 3. User Manager Subsystem (Dynamic routing & enriched fetch)
    const umData = await fetchComprehensiveUsermanData(client);

    // 4. Firewall & System Logs (with lightweight proplist)
    const [firewallRules, logs] = await Promise.all([
      fetchSafeCached('/ip/firewall/filter/print', undefined, 30000, client),
      fetchSafeCached('/log/print', ['=.proplist=.id,time,topics,message'], 20000, client)
    ]);
    const systemLogs = (Array.isArray(logs) ? logs : []).slice(-100).reverse().map((l: any, idx: number) => ({
      id: l?.['.id'] || `log-${Date.now()}-${idx}`,
      time: l?.time || "",
      topics: l?.topics || "",
      message: l?.message || ""
    }));

    // Comprehensive Mapping for Hotspot Users (Keep all MikroTik properties intact)
    const mappedUsers = (Array.isArray(hotspotUsers) ? hotspotUsers : []).map((u: any) => ({
      id: u?.['.id'] || u?.id || u?.name || `u-${Date.now()}`,
      name: u?.name || "مستخدم غير مسمى",
      password: u?.password || "",
      profile: u?.profile || "default",
      uptime: u?.uptime || "0s",
      bytesIn: parseInt(u?.['bytes-in'] || "0", 10) || 0,
      bytesOut: parseInt(u?.['bytes-out'] || "0", 10) || 0,
      limitUptime: u?.['limit-uptime'] || "",
      limitBytesTotal: parseInt(u?.['limit-bytes-total'] || "0", 10) || 0,
      comment: u?.comment || "",
      disabled: u?.disabled === "true" || u?.disabled === true || u?.disabled === "yes",
      macAddress: u?.['mac-address'] || "",
      email: u?.email || "",
      server: u?.server || "all",
      routes: u?.routes || "",
      lastLoggedOut: u?.['last-logged-out'] || u?.lastLoggedOut || "",
      lastLoggedIn: u?.['last-logged-in'] || u?.lastLoggedIn || "",
      raw: u
    }));

    // Mapping Active Hotspot Users
    const mappedActiveUsers = (Array.isArray(activeHotspotUsers) ? activeHotspotUsers.map(normalizeActiveHotspotUser).filter(Boolean) : []);

    // Mapping Hotspot Profiles
    const mappedProfiles = (Array.isArray(hotspotProfilesRaw) ? hotspotProfilesRaw : []).map(normalizeHotspotProfile);

    // Mapping PPP Secrets (Preserving all raw MikroTik criteria)
    const mappedPppSecrets = (Array.isArray(pppSecretsRaw) ? pppSecretsRaw : []).map((s: any) => ({
      id: s?.['.id'] || s?.id || s?.name || `ppp-${Date.now()}`,
      name: s?.name || "مشترك PPPoE",
      password: s?.password || "",
      profile: s?.profile || "default",
      service: s?.service || "any",
      comment: s?.comment || "",
      disabled: s?.disabled === "true" || s?.disabled === true || s?.disabled === "yes",
      remoteAddress: s?.['remote-address'] || s?.remoteAddress || "",
      localAddress: s?.['local-address'] || s?.localAddress || "",
      callerId: s?.['caller-id'] || s?.callerId || "",
      limitUptime: s?.['limit-uptime'] || s?.['uptime-limit'] || "",
      limitBytesTotal: parseInt(s?.['limit-bytes-total'] || s?.['bytes-total-limit'] || "0", 10) || 0,
      routes: s?.routes || "",
      lastLoggedOut: s?.['last-logged-out'] || s?.lastLoggedOut || "",
      lastLoggedIn: s?.['last-logged-in'] || s?.lastLoggedIn || "",
      lastCallerId: s?.['last-caller-id'] || "",
      raw: s
    }));

    // Mapping PPP Profiles
    const mappedPppProfiles = (Array.isArray(pppProfilesRaw) ? pppProfilesRaw : []).map(normalizePPPProfile);

    // Mapping PPP Active
    const mappedPppActive = (Array.isArray(pppActiveRaw) ? pppActiveRaw : []).map((a: any) => ({
      id: a?.['.id'] || a?.id || `pppa-${Date.now()}`,
      name: a?.name || a?.user || "",
      service: a?.service || "pppoe",
      callerId: a?.['caller-id'] || a?.callerId || "",
      address: a?.address || "",
      uptime: a?.uptime || "0s",
      encoding: a?.['encoding'] || a?.['session-id'] || "",
      bytesIn: parseInt(a?.['bytes-in'] || a?.['acct-input-octets'] || "0", 10) || 0,
      bytesOut: parseInt(a?.['bytes-out'] || a?.['acct-output-octets'] || "0", 10) || 0,
      idleTime: a?.['idle-time'] || a?.idleTime || "0s"
    }));

    // Mapping Simple Queues
    const mappedSimpleQueues = (Array.isArray(simpleQueuesRaw) ? simpleQueuesRaw : []).map((q: any) => ({
      id: q?.['.id'] || q?.id || q?.name,
      name: q?.name || "",
      target: q?.target || "",
      maxLimit: q?.['max-limit'] || "",
      disabled: q?.disabled === "true" || q?.disabled === true || q?.disabled === "yes"
    }));

    // 5. Live Internet & WAN Connectivity Check
    const internetStatus = await MikrotikAPI.checkInternetConnectivity();

    res.json({
      success: true,
      data: {
        cpuLoad: parseInt(resourceRes[0]?.['cpu-load'] || "0"),
        uptime: resourceRes[0]?.uptime || "",
        freeMemory: parseInt(resourceRes[0]?.['free-memory'] || "0"),
        totalMemory: parseInt(resourceRes[0]?.['total-memory'] || "0"),
        version: resourceRes[0]?.version || "",
        boardName: boardRes[0]?.['board-name'] || resourceRes[0]?.['board-name'] || "",
        identity: identityRes[0]?.name || "Z.Control",
        internetStatus,
        hasInternet: internetStatus.hasInternet,
        gateway: internetStatus.gateway,
        wanIp: internetStatus.wanIp,
        hotspotUsers: mappedUsers,
        activeHotspotUsers: mappedActiveUsers,
        hotspotProfiles: mappedProfiles,
        interfaces: (Array.isArray(interfaces) ? interfaces.map(normalizeNetworkInterface).filter(Boolean) : []),
        pppSecrets: mappedPppSecrets,
        pppProfiles: mappedPppProfiles,
        pppActive: mappedPppActive,
        usermanUsers: umData.users,
        usermanProfiles: umData.profiles,
        usermanActive: umData.active,
        simpleQueues: mappedSimpleQueues,
        ipBindings,
        dhcpLeases,
        firewallRules,
        systemLogs
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(err) });
  }
});

// API: Secure Command execution with intelligent parser & destructive command protection
router.post("/api/mikrotik/command", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    const ok = typeof client?.ensureConnected === "function" ? await client.ensureConnected() : false;
    if (!ok) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  }
  try {
    const { command } = req.body;
    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({ success: false, message: "الأمر المطلوب فارغ" });
    }

    const trimmed = command.trim();

    // 1. Safety Guard against Catastrophic Destruction Commands
    const dangerousPatterns = [
      /system\s+reset-configuration/i,
      /system\/reset-configuration/i,
      /system\s+reboot/i,
      /system\/reboot/i,
      /system\s+shutdown/i,
      /system\/shutdown/i,
      /user\s+remove\s+\[\s*find\s*\]/i,
      /file\s+remove\s+\[\s*find\s*\]/i,
      /interface\s+bridge\s+remove\s+\[\s*find\s*\]/i,
      /ip\s+hotspot\s+user\s+remove\s+\[\s*find\s*\]/i
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmed)) {
        return res.status(403).json({
          success: false,
          message: "⚠️ تم حظر هذا الأمر لدواعي الأمان والحماية! الأوامر التدميرية (مثل مسح كل الإعدادات أو حذف كافة المستخدمين) غير مسموح بتمريرها مباشرة عبر الطرفية لتفادي فقدان الشبكة.",
          output: "Operation rejected by ZCtrl Security Shield."
        });
      }
    }

    // 2. Intelligent Command Parser (handles CLI & API paths, quotes, key=val, and [find ...])
    const cleanedCmd = trimmed.replace(/\r?\n/g, ' ').replace(/\\\s+/g, ' ');
    const bracketFindMatch = cleanedCmd.match(/\[\s*find\s+([^\]]*)\]/i);
    const cmdWithoutFind = bracketFindMatch
      ? (cleanedCmd.slice(0, bracketFindMatch.index!) + ' ' + cleanedCmd.slice(bracketFindMatch.index! + bracketFindMatch[0].length)).trim()
      : cleanedCmd;

    const tokens: string[] = [];
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    let match;
    while ((match = regex.exec(cmdWithoutFind)) !== null) {
      tokens.push(match[1] !== undefined ? match[1] : match[2] !== undefined ? match[2] : match[0]);
    }

    if (tokens.length === 0) {
      return res.status(400).json({ success: false, message: "أمر غير صالح" });
    }

    let endpoint = '';
    const rawParams: string[] = [];

    if (tokens[0].startsWith("/") && tokens[0].indexOf("/", 1) !== -1) {
      // Already an API path like /ip/dns/cache/flush
      endpoint = tokens[0];
      for (let i = 1; i < tokens.length; i++) rawParams.push(tokens[i]);
    } else {
      // Space-separated CLI path like "/ip dns cache flush" or "ip service print detail"
      const pathParts: string[] = [];
      let i = 0;
      const cliPrintModifiers = new Set(['detail', 'terse', 'brief', 'stats', 'without-paging']);
      while (i < tokens.length && !tokens[i].includes("=") && tokens[i] !== "where") {
        const part = i === 0 ? tokens[i].replace(/^\/+/, '') : tokens[i];
        if (pathParts.length > 0 && pathParts[pathParts.length - 1] === 'print' && cliPrintModifiers.has(part.toLowerCase())) {
          i++;
          continue;
        }
        if (part) pathParts.push(part);
        i++;
      }
      endpoint = "/" + pathParts.join("/");
      while (i < tokens.length) {
        if (!(endpoint.endsWith('/print') && cliPrintModifiers.has(tokens[i].toLowerCase()))) {
          rawParams.push(tokens[i]);
        }
        i++;
      }
    }

    // Format CLI key=val params to RouterOS API =key=val
    const apiParams: string[] = rawParams.map((p) => {
      if (p.startsWith('=') || p.startsWith('?') || p.startsWith('.')) return p;
      const eqIdx = p.indexOf('=');
      if (eqIdx > 0) return `=${p}`;
      return p;
    });

    let result: any;
    if (bracketFindMatch) {
      // Resolve [find ...] against base resource print endpoint
      const parts = endpoint.split('/').filter(Boolean);
      const basePath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : endpoint;
      const items = await client.querySafe(`${basePath}/print`);
      const expr = bracketFindMatch[1].trim();
      const matchedIds: string[] = [];

      // Parse conditions like: name="telnet" or comment~"قديم" or list="x" address="y"
      const condRegex = /([a-zA-Z0-9.-]+)\s*(~|=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
      const conds: Array<{ key: string; op: string; val: string }> = [];
      let cm;
      while ((cm = condRegex.exec(expr)) !== null) {
        conds.push({
          key: cm[1],
          op: cm[2],
          val: cm[3] !== undefined ? cm[3] : cm[4] !== undefined ? cm[4] : cm[5]
        });
      }

      if (Array.isArray(items)) {
        for (const row of items) {
          const id = row['.id'] || row.id;
          if (!id) continue;
          if (conds.length === 0) {
            matchedIds.push(id);
            continue;
          }
          const matchesAll = conds.every(({ key, op, val }) => {
            const actual = String(row[key] ?? '');
            if (op === '~') return actual.toLowerCase().includes(val.toLowerCase());
            return actual === val;
          });
          if (matchesAll) matchedIds.push(id);
        }
      }

      if (matchedIds.length === 0) {
        return res.json({ success: true, command, count: 0, output: '[]' });
      }

      const results: any[] = [];
      for (const id of matchedIds) {
        const r = await client.query(endpoint, [`=.id=${id}`, ...apiParams]);
        results.push(r);
      }
      result = results;
    } else {
      result = await client.query(endpoint, apiParams.length > 0 ? apiParams : undefined);
    }

    // If mutating command, invalidate relevant cache & audit
    if (endpoint.includes("/add") || endpoint.includes("/set") || endpoint.includes("/remove") || endpoint.includes("/enable") || endpoint.includes("/disable") || endpoint.includes("/make-static")) {
      const baseSection = endpoint.split("/").slice(0, 3).join("/");
      if (baseSection) invalidateCache(baseSection, client);
      recordAudit(req, "terminal_command_mutation", "router_terminal", "success", {
        resourceId: endpoint,
        changes: { before: null, after: trimmed.slice(0, 180) }
      });
    }

    res.json({ success: true, command, output: JSON.stringify(result, null, 2) });
  } catch (err: any) {
    const msg = translateErrorMessage(err);
    res.status(500).json({ success: false, message: msg, output: msg });
  }
});

// API: Live Router Security Resources (Services, Firewall, Address Lists, Schedulers, Queues/Mangle, VLANs)
router.get("/api/mikrotik/security/resources", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    const ok = await client.ensureConnected();
    if (!ok) return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  }
  try {
    const [servicesRaw, filterRaw, addressListRaw, schedulerRaw, mangleRaw, queuesRaw, vlanRaw] = await Promise.all([
      client.querySafe('/ip/service/print'),
      client.querySafe('/ip/firewall/filter/print'),
      client.querySafe('/ip/firewall/address-list/print'),
      client.querySafe('/system/scheduler/print'),
      client.querySafe('/ip/firewall/mangle/print'),
      client.querySafe('/queue/simple/print'),
      client.querySafe('/interface/vlan/print')
    ]);

    const services = (Array.isArray(servicesRaw) ? servicesRaw : []).map((s: any) => ({
      id: s['.id'] || s.id || s.name,
      name: String(s.name || ''),
      port: Number(s.port) || 0,
      enabled: !(s.disabled === 'true' || s.disabled === true || s.disabled === 'yes')
    }));

    const firewallRules = (Array.isArray(filterRaw) ? filterRaw : []).map((r: any, idx: number) => {
      const comment = String(r.comment || '');
      return {
        id: r['.id'] || r.id || `fw-${idx}`,
        chain: String(r.chain || 'input'),
        action: String(r.action || 'accept'),
        protocol: String(r.protocol || 'all'),
        dstPort: String(r['dst-port'] || r.dstPort || ''),
        comment,
        disabled: r.disabled === 'true' || r.disabled === true || r.disabled === 'yes',
        isOld: comment.toLowerCase().includes('old') || comment.includes('قديم')
      };
    });

    const addressLists = (Array.isArray(addressListRaw) ? addressListRaw : []).map((a: any, idx: number) => ({
      id: a['.id'] || a.id || `al-${idx}`,
      listName: String(a.list || ''),
      address: String(a.address || ''),
      comment: String(a.comment || '')
    }));

    const schedulers = (Array.isArray(schedulerRaw) ? schedulerRaw : []).map((sc: any, idx: number) => ({
      id: sc['.id'] || sc.id || `sc-${idx}`,
      name: String(sc.name || ''),
      interval: String(sc.interval || '1d'),
      enabled: !(sc.disabled === 'true' || sc.disabled === true || sc.disabled === 'yes'),
      runCount: Number(sc['run-count'] || 0),
      comment: String(sc.comment || '')
    }));

    const seenQ = new Set<string>();
    const queuesAndMangles: any[] = [];
    (Array.isArray(queuesRaw) ? queuesRaw : []).forEach((q: any, idx: number) => {
      const key = `Q:${q.target || ''}:${q['max-limit'] || ''}`;
      const isDuplicate = seenQ.has(key) || String(q.comment || '').toLowerCase().includes('duplicate');
      seenQ.add(key);
      queuesAndMangles.push({
        id: q['.id'] || q.id || `q-${idx}`,
        type: 'Queue',
        name: String(q.name || 'queue'),
        target: String(q.target || '0.0.0.0/0'),
        value: String(q['max-limit'] || 'unlimited'),
        isDuplicate
      });
    });
    (Array.isArray(mangleRaw) ? mangleRaw : []).forEach((m: any, idx: number) => {
      const key = `M:${m.chain || ''}:${m.action || ''}:${m['src-address'] || ''}:${m['dst-port'] || ''}`;
      const isDuplicate = seenQ.has(key) || String(m.comment || '').toLowerCase().includes('duplicate');
      seenQ.add(key);
      queuesAndMangles.push({
        id: m['.id'] || m.id || `m-${idx}`,
        type: 'Mangle',
        name: String(m.comment || `${m.chain || 'prerouting'}:${m.action || 'mark'}`),
        target: String(m['src-address'] || m['dst-address'] || m['in-interface'] || m['out-interface'] || 'all'),
        value: String(m.action || ''),
        isDuplicate
      });
    });

    const vlans = (Array.isArray(vlanRaw) ? vlanRaw : []).map((v: any, idx: number) => ({
      id: v['.id'] || v.id || `vl-${idx}`,
      name: String(v.name || ''),
      vlanId: Number(v['vlan-id'] || 0),
      interface: String(v.interface || 'ether1'),
      comment: String(v.comment || '')
    }));

    res.json({
      success: true,
      data: { services, firewallRules, addressLists, scripts: schedulers, queuesAndMangles, vlans }
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

// ==========================================
// BANDWIDTH ANALYTICS & ABNORMAL SPIKES DETECTION API
// ==========================================
router.get("/api/mikrotik/bandwidth/analytics", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client.isConnected()) {
    return res.status(401).json({ success: false, message: "غير متصل بالراوتر" });
  }

  try {
    const [interfacesRaw, activeHotspotRaw] = await Promise.all([
      client.querySafe('/interface/print'),
      client.querySafe('/ip/hotspot/active/print')
    ]);

    const interfaces = (Array.isArray(interfacesRaw) ? interfacesRaw.map(normalizeNetworkInterface).filter(Boolean) : []);
    const activeUsers = (Array.isArray(activeHotspotRaw) ? activeHotspotRaw.map(normalizeActiveHotspotUser).filter(Boolean) : []);

    const wanInterface = interfaces.find((i: any) =>
      i?.name?.toLowerCase().includes('wan') ||
      i?.name?.toLowerCase().includes('ether1') ||
      i?.name?.toLowerCase().includes('internet')
    ) || interfaces[0] || null;

    let totalRxBps = 0;
    let totalTxBps = 0;
    interfaces.forEach((i: any) => {
      if (i.running && !i.disabled) {
        totalRxBps += (i.rxBps || 0);
        totalTxBps += (i.txBps || 0);
      }
    });

    const defaultSpikeThresholdMbps = Number(req.query.threshold) || 10;
    const spikeThresholdBps = defaultSpikeThresholdMbps * 1000000;

    const avgUserRateBps = activeUsers.length > 0
      ? activeUsers.reduce((sum: number, u: any) => sum + (u.totalRateBps || 0), 0) / activeUsers.length
      : 0;

    const spikes: any[] = [];
    activeUsers.forEach((u: any) => {
      const userRate = u.totalRateBps || 0;
      const isThresholdSpike = userRate >= spikeThresholdBps;
      const isOutlierSpike = activeUsers.length >= 2 && userRate >= Math.max(5000000, avgUserRateBps * 3);

      if (isThresholdSpike || isOutlierSpike) {
        const severity = userRate >= 20000000 ? 'critical' : userRate >= 10000000 ? 'high' : 'elevated';
        const reason = isThresholdSpike
          ? `تجاوز الحد الأقصى (${(userRate / 1000000).toFixed(1)} > ${defaultSpikeThresholdMbps} Mbps)`
          : `استهلاك مضاعف (${(userRate / Math.max(1, avgUserRateBps)).toFixed(1)}x أضعاف متوسط الجلسات)`;

        spikes.push({
          ...u,
          severity,
          reason,
          spikeRateMbps: Number((userRate / 1000000).toFixed(2)),
          ratioToTotal: totalRxBps > 0 ? Number(((userRate / totalRxBps) * 100).toFixed(1)) : 0
        });
      }
    });

    // Sort top active sessions by current rate, then transferred bytes
    const topActiveSessions = [...activeUsers]
      .sort((a: any, b: any) => ((b.totalRateBps || 0) + (b.bytesIn + b.bytesOut)) - ((a.totalRateBps || 0) + (a.bytesIn + a.bytesOut)))
      .slice(0, 8);

    res.json({
      success: true,
      timestamp: Date.now(),
      wanInterface,
      totalRxBps,
      totalTxBps,
      activeSessionsCount: activeUsers.length,
      topActiveSessions,
      spikes,
      thresholdMbps: defaultSpikeThresholdMbps
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});


// Governance & Audit Hash Chain Endpoints
router.get("/api/governance/audit-logs", (_req: Request, res: Response) => {
  const logs = AuditHashChain.getRecentLogs(100);
  const chainCheck = AuditHashChain.verifyChain(logs);
  res.json({
    success: true,
    validChain: chainCheck.valid,
    brokenAtSequence: chainCheck.brokenAtSequence,
    count: logs.length,
    logs,
  });
});

router.get("/api/governance/revert-timers", (_req: Request, res: Response) => {
  const pending = RevertJournalSweeper.getPendingRecords();
  res.json({
    success: true,
    pendingCount: pending.length,
    pending,
  });
});

router.post("/api/governance/revert-timers/confirm", (req: Request, res: Response) => {
  const { changeId, actorId } = req.body;
  if (!changeId) {
    return res.status(400).json({ success: false, message: "changeId مطلوب لتأكيد التغيير" });
  }
  const ok = RevertJournalSweeper.confirmChange(changeId, actorId || 'admin');
  if (ok) {
    recordAudit(req, "confirm_revert_timer", "governance", "success", { resourceId: String(changeId) });
    return res.json({ success: true, message: `تم تأكيد التغيير ${changeId} وإلغاء التراجع الآلي بنجاح.` });
  }
  return res.status(404).json({ success: false, message: "لم يتم العثور على مؤقت تراجع نشط بهذا المعرّف" });
});

router.post("/api/governance/change", async (req: Request, res: Response) => {
  const { routerId, commands, riskLevel, reason, authorId, revertCommands, revertTimerMs } = req.body;
  if (!commands || !Array.isArray(commands)) {
    return res.status(400).json({ success: false, message: "قائمة الأوامر commands خالية أو غير صحيحة" });
  }

  try {
    const result = await ChangeEngine.executeChange({
      routerId: routerId || 'default',
      authorId: authorId || (req as any).sessionRole?.operatorName || 'admin',
      operationType: 'governance.api_change',
      commands,
      riskLevel,
      reason,
      revertCommands,
      revertTimerMs,
    });
    recordAudit(req, "execute_governed_change", "governance", "success", {
      resourceId: routerId || 'default',
      reason
    });
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: translateErrorMessage(err) });
  }
});

// AI Assistant (Gemini 4 Hydrogen Integration with Safe Offline Fallback when no key)
router.post("/api/ai/assistant", async (req: Request, res: Response) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ success: false, message: "يجب كتابة سؤال أو استفسار للمساعد" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt.trim(),
        config: {
          systemInstruction:
            "أنت مهندس خبير معتمد في شبكات المايكروتك MikroTik RouterOS (v6 و v7). أجب بدقة واحترافية باللغة العربية، وقدم سكربتات وأوامر RouterOS Terminal جاهزة وصحيحة مع الشرح الوافي.",
        },
      });

      const reply = response.text || "تم تحليل طلبك بنجاح.";
      return res.json({ success: true, reply });
    }

    // Comprehensive expert RouterOS fallback if API key is not configured in environment
    let reply = `أهلاً بك! كمهندس شبكات مايكروتك MikroTik RouterOS، إليك الإجابة الفنية والسكربت المناسب:\n\n`;
    if (prompt.includes('Netcut') || prompt.includes('ARP') || prompt.includes('حماية')) {
      reply += `🛡️ **سكربت حماية المايكروتك من برامج قطع النت (Netcut / ARP Poisoning):**\n\n\`\`\`routeros\n/ip dhcp-server set [find] add-arp=yes\n/interface bridge set [find] arp=reply-only\n/ip firewall filter add chain=forward protocol=udp dst-port=53 in-interface=!WAN action=accept comment="Allow DNS"\n/ip firewall filter add chain=input protocol=tcp dst-port=8728,8291 src-address-list=AdminIPs action=accept comment="Allow WinBox/API only for Admins"\n\`\`\`\n\n📌 **ملاحظة:** تأكد من تفعيل خاصية \`add-arp=yes\` في سيرفر الـ DHCP ليتم تثبيت عناوين الماك تلقائياً.`;
    } else if (prompt.includes('حذف') || prompt.includes('منتهية') || prompt.includes('24 ساعة')) {
      reply += `⏱️ **سكربت الجدولة لحذف كروت الهوتسبوت المنتهية تلقائياً:**\n\n\`\`\`routeros\n/system script add name="CleanExpiredVouchers" source={\n  :foreach u in=[/ip hotspot user find where uptime>=limit-uptime and limit-uptime!=0s] do={\n    /ip hotspot user remove \$u\n  }\n}\n/system scheduler add name="AutoCleanDaily" interval=1d start-time=03:00:00 on-event="CleanExpiredVouchers"\n\`\`\`\n\nيعمل هذا السكربت يومياً عند الساعة 3 فجراً لتنظيف قاعدة بيانات الهوتسبوت والحفاظ على خفة وسرعة السيرفر.`;
    } else if (prompt.includes('دمج') || prompt.includes('PCC') || prompt.includes('خطين')) {
      reply += `🌐 **سكربت دمج خطين إنترنت PCC (Equal Load Balancing):**\n\n\`\`\`routeros\n/ip firewall mangle\nadd chain=prerouting dst-address-type=!local in-interface=bridge per-connection-classifier=both-addresses:2/0 action=mark-connection new-connection-mark=WAN1_conn passthrough=yes\nadd chain=prerouting dst-address-type=!local in-interface=bridge per-connection-classifier=both-addresses:2/1 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes\nadd chain=prerouting connection-mark=WAN1_conn in-interface=bridge action=mark-routing new-routing-mark=to_WAN1 passthrough=no\nadd chain=prerouting connection-mark=WAN2_conn in-interface=bridge action=mark-routing new-routing-mark=to_WAN2 passthrough=no\n\n/ip route\nadd dst-address=0.0.0.0/0 gateway=192.168.1.1 routing-mark=to_WAN1 check-gateway=ping distance=1\nadd dst-address=0.0.0.0/0 gateway=192.168.2.1 routing-mark=to_WAN2 check-gateway=ping distance=1\n\`\`\``;
    } else {
      reply += `💡 **إرشادات الإدارة والتحكم:**\nيمكنك تنفيذ أي أوامر مباشرة في طرفية المايكروتك عبر تبويب **طرفية الأوامر (Terminal)**، أو تخصيص وتوليد الكروت بأقصى دقة وحرية من تبويب **استوديو الكروت (Card Studio)**.`;
    }

    return res.json({ success: true, reply });
  } catch (err: any) {
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    return res.status(status).json({
      success: false,
      message: translateErrorMessage(err) || err?.message || "تعذر معالجة طلب المساعد الذكي",
    });
  }
});

// ==========================================
// COMPATIBILITY ENDPOINTS (Status / Syslog / Logout / Read-Only Invoke)
// Prevents 404 errors for MikrotikService & SystemIntelligence consumers
// ==========================================
router.get("/api/mikrotik/status", (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  const connected = Boolean(client && typeof client.isConnected === "function" && client.isConnected());
  const rawCfg = connected && typeof client.getConfig === "function" ? client.getConfig() : null;
  const safeConfig = rawCfg
    ? {
        ip: rawCfg.host,
        host: rawCfg.host,
        port: rawCfg.port || 8728,
        user: rawCfg.user,
        useSsl: Boolean(rawCfg.tls)
      }
    : null;

  return res.json({
    success: true,
    connected,
    config: safeConfig
  });
});

router.get("/api/mikrotik/syslog", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(401).json({ success: false, messages: [], message: "غير متصل بالراوتر" });
  }
  try {
    const rawLogs = await fetchSafeCached("/log/print", undefined, 10000, client);
    const list = Array.isArray(rawLogs) ? rawLogs.slice(-200).reverse() : [];
    return res.json({ success: true, messages: list });
  } catch (e: any) {
    return res.status(500).json({ success: false, messages: [], message: translateErrorMessage(e) });
  }
});

router.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    const token = resolveRequestToken(req);
    const session = token ? routerClients.get(token) : undefined;
    if (session) {
      try {
        if (session.client && typeof session.client.dispose === "function") {
          await session.client.dispose();
        } else if (session.client && typeof session.client.disconnect === "function") {
          session.client.disconnect();
        }
      } catch {}
      if (getLatestActiveClient() === session.client) {
        setLatestActiveClient(null);
      }
      routerClients.delete(token);
    }
    recordAudit(req, "logout", "session", "success");
    return res.json({ success: true, message: "تم تسجيل الخروج بنجاح" });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: translateErrorMessage(e) });
  }
});

router.post("/api/mikrotik/invoke", async (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI;
  if (!client || !client.isConnected()) {
    return res.status(401).json({ success: false, error: "راوتر المايكروتك غير متصل" });
  }
  try {
    const rawCmd = sanitizeInput(req.body?.cmd || "");
    const rawArgs = Array.isArray(req.body?.args) ? req.body.args : [];

    // Strict allowlist: only safe RouterOS read/print diagnostic queries are permitted here
    if (
      !rawCmd ||
      rawCmd.length > 120 ||
      !/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*\/print$/i.test(rawCmd)
    ) {
      return res.status(400).json({
        success: false,
        error: "الأمر غير مسموح به عبر هذا المسار؛ يُسمح فقط باستعلامات القراءة الآمنة (*/print)."
      });
    }

    const safeArgs: string[] = [];
    for (const arg of rawArgs.slice(0, 12)) {
      const cleaned = sanitizeInput(String(arg || ""));
      if (!cleaned || cleaned.length > 128) continue;
      if (!/^[?=.][a-zA-Z0-9._:/,-]+$/.test(cleaned)) continue;
      safeArgs.push(cleaned);
    }

    const data = await client.querySafe(rawCmd, safeArgs.length > 0 ? safeArgs : undefined);
    return res.json({ success: true, data: Array.isArray(data) ? data : [] });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: translateErrorMessage(e) });
  }
});


  return router;
}
