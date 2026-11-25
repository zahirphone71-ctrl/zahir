// ============================================================
//  ZCtrl Modular Server Entry Point
//  Mounts security shield, RBAC guard, throttled MikroTik
//  API gateway, SQLite voucher engine, modular domain routers,
//  and Vite/Static frontend serving on port 3000.
// ============================================================

import express, { type Request, type Response, type NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import {
  MikrotikAPI as MikrotikAPI_Original,
  MikroTikRequestThrottler
} from "./src/server/mikrotik-api.ts";
import { createVoucherRoutes } from "./src/server/voucher-routes.ts";
import { createApRoutes } from "./src/server/routes/apRoutes.ts";
import routerProfilesRoutes from "./src/server/routes/routerProfiles.ts";
import { createSystemDiagnosticsRoutes } from "./src/server/routes/systemDiagnosticsRoutes.ts";
import { createSubscribersRoutes } from "./src/server/routes/subscribersRoutes.ts";
import { createNetworkFirewallRoutes } from "./src/server/routes/networkFirewallRoutes.ts";
import { voucherDb } from "./src/server/voucher-db.ts";
import { registerPortalEndpoints } from "./src/server/portal-endpoints.ts";
import { ftpService } from "./src/server/ftp-service.ts";
import {
  authRateLimiter,
  diagnosticRateLimiter,
  apiGeneralRateLimiter,
  corsOptions,
  securityConfig,
  resolveRequestToken
} from "./src/server/security-shield.ts";
import { createRbacMiddleware } from "./src/server/rbac.ts";
import { RevertJournalSweeper } from "./src/server/domain/RevertJournalSweeper.ts";
import {
  clientStorage,
  routerClients,
  getLatestActiveClient,
  realtimeSyncServer,
  resolveScopedRouterClient,
  invalidateCache,
  clearCachedUsermanResult,
  destroyRuntimeResources,
  getMemoryHealth
} from "./src/server/runtimeContext.ts";

dotenv.config();
RevertJournalSweeper.startSweeper();

// Global Exception & Rejection Handlers to prevent process crashes
process.on("uncaughtException", (error) => {
  console.error("[Server Process Uncaught Exception]", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Server Process Unhandled Rejection]", reason);
});

declare global {
  namespace Express {
    interface Request {
      routerClient?: any;
      sessionRole?: {
        role: "admin" | "cashier" | "viewer";
        operatorId: string;
        operatorName: string;
      };
    }
  }
}

export { realtimeSyncServer };

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Enable trust proxy for Cloud Run / Reverse Proxy environments
app.set("trust proxy", 1);

// Security Headers Middleware (allowing AI Studio preview iframe embedding)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});

// Dynamic & Controlled CORS Whitelist + JSON Body Parser
app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));

// Fast Health & Ping Endpoints for Local/Desktop & Cloud Connectivity Checks
app.get("/api/ping", (_req, res) => {
  res.json({ success: true, app: "ZCtrl", port: PORT, timestamp: Date.now() });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "ZCtrl", port: PORT, timestamp: Date.now(), memory: getMemoryHealth() });
});

// Rate Limiters for Attack & Abuse Prevention
app.use("/api/mikrotik/connect", authRateLimiter);
app.use("/api/mikrotik/discover", diagnosticRateLimiter);
app.use("/api/mikrotik/diagnose", diagnosticRateLimiter);
app.use("/api/mikrotik", apiGeneralRateLimiter);

// Multi-Session Isolation & Tenant Middleware across ALL API routes
app.use(async (req: Request, res: Response, next: NextFunction) => {
  const pathUrl = (req.baseUrl || req.originalUrl || req.url || "").split("?")[0];
  if (!pathUrl.startsWith("/api/")) {
    return next();
  }

  const PUBLIC_API_ROUTES = [
    "/api/health",
    "/api/ping",
    "/api/mikrotik/connect",
    "/api/mikrotik/cancel-connect",
    "/api/mikrotik/discover",
    "/api/mikrotik/diagnose",
    "/api/mikrotik/session"
  ];

  const isPublicRoute = PUBLIC_API_ROUTES.some(
    (route) => pathUrl === route || pathUrl.startsWith(route + "/")
  );
  if (isPublicRoute) {
    return next();
  }

  const token = resolveRequestToken(req);
  const session = token ? routerClients.get(token) : undefined;
  let client = session?.client;

  if (session) {
    session.lastSeen = Date.now();
    req.sessionRole = {
      role: session.role || "admin",
      operatorId: session.operatorId || "root-admin",
      operatorName: session.operatorName || session.user || "admin"
    };
  }

  const isHardwareRoute =
    pathUrl.startsWith("/api/mikrotik") ||
    pathUrl.startsWith("/api/router") ||
    pathUrl.startsWith("/api/ap");

  if (securityConfig.strictTenantIsolation) {
    if (!token || !session || !client) {
      return res.status(401).json({
        success: false,
        message: "انتهت صلاحية الجلسة أو رمز التحقق غير صالح، يرجى إعادة تسجيل الدخول"
      });
    }

    if (!client.isConnected() && typeof client.ensureConnected === "function") {
      try {
        await client.ensureConnected();
      } catch {}
    }

    if (isHardwareRoute && !client.isConnected()) {
      return res.status(503).json({
        success: false,
        message: "راوتر المايكروتك يعيد الاتصال حالياً، يرجى الانتظار...",
        reconnecting: true
      });
    }

    req.routerClient = client;
    return clientStorage.run(client, () => next());
  }

  // Permissive fallback mode when strictTenantIsolation is explicitly disabled
  if (!client || !client.isConnected()) {
    if (client && typeof client.ensureConnected === "function") {
      try {
        await client.ensureConnected();
      } catch {}
    }
    if (!client || !client.isConnected()) {
      const latestActive = getLatestActiveClient();
      if (latestActive && latestActive.isConnected()) {
        client = latestActive;
      } else if (routerClients.size > 0) {
        for (const [, sess] of routerClients) {
          if (sess.client && sess.client.isConnected()) {
            client = sess.client;
            break;
          }
        }
      } else if (MikrotikAPI_Original.isConnected()) {
        client = MikrotikAPI_Original;
      }
      if (token && client && client.isConnected()) {
        routerClients.set(token, {
          client,
          lastSeen: Date.now(),
          role: session?.role || "admin",
          operatorId: session?.operatorId || "root-admin",
          operatorName: session?.operatorName || "admin"
        });
      }
    }
  }

  if (isHardwareRoute && (!client || !client.isConnected())) {
    return res.status(503).json({
      success: false,
      message: "راوتر المايكروتك يعيد الاتصال حالياً، يرجى الانتظار...",
      reconnecting: true
    });
  }

  if (client && client.isConnected()) {
    req.routerClient = client;
    return clientStorage.run(client, () => next());
  }
  return next();
});

// Role-Based Access Control (RBAC) Enforcement Middleware
app.use(
  createRbacMiddleware((req) => {
    if (req.sessionRole) return req.sessionRole;
    const token = resolveRequestToken(req);
    const session = token ? routerClients.get(token) : undefined;
    if (!session) return undefined;
    return {
      role: session.role || "admin",
      operatorId: session.operatorId || "root-admin",
      operatorName: session.operatorName || session.user || "admin"
    };
  })
);

// Router Profiles CRUD endpoints
app.use("/api/router", routerProfilesRoutes);
app.use("/api/mikrotik/profiles/crud", routerProfilesRoutes);

// ==========================================
// MIKROTIK API REQUEST THROTTLER GATEWAY
// ==========================================
const routerGatewayThrottler = new MikroTikRequestThrottler(25);

app.use("/api/mikrotik", (req: Request, res: Response, next: NextFunction) => {
  const pathUrl = req.baseUrl || req.originalUrl || req.path || "";

  const isBypass = [
    "/session",
    "/discover",
    "/diagnose",
    "/cancel-connect",
    "/throttler/status"
  ].some((r) => pathUrl.includes(r));

  if (isBypass) {
    return next();
  }

  const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);

  routerGatewayThrottler
    .execute(
      async () => {
        return new Promise<void>((resolve) => {
          let released = false;
          let safetyTimer: NodeJS.Timeout | null = null;
          const release = () => {
            if (!released) {
              released = true;
              if (safetyTimer) {
                clearTimeout(safetyTimer);
                safetyTimer = null;
              }
              resolve();
            }
          };
          safetyTimer = setTimeout(release, isMutation ? 65000 : 45000);
          if (safetyTimer.unref) safetyTimer.unref();
          res.once("finish", release);
          res.once("close", release);
          next();
        });
      },
      {
        priority: isMutation,
        timeoutMs: isMutation ? 60000 : 40000
      }
    )
    .catch(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          message: "تم تعليق الطلب في طابور التهدئة لحماية معالج المايكروتك، يرجى المحاولة بعد قليل.",
          throttled: true
        });
      }
    });
});

app.get("/api/mikrotik/throttler/status", (req: Request, res: Response) => {
  const client = req.routerClient || MikrotikAPI_Original;
  const clientStats = typeof client.getThrottlerStats === "function" ? client.getThrottlerStats() : null;
  const gatewayStats = routerGatewayThrottler.getStats();

  res.json({
    success: true,
    throttler: {
      maxConcurrent: 25,
      gateway: gatewayStats,
      client: clientStats,
      isThrottled: gatewayStats.isThrottled || (clientStats?.isThrottled ?? false)
    }
  });
});

// Auto-Invalidate Cache Middleware for write operations
app.use((req: Request, res: Response, next: NextFunction) => {
  const method = req.method;
  const pathUrl = req.baseUrl || req.originalUrl || "";

  if (["POST", "PUT", "DELETE"].includes(method)) {
    res.on("finish", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (
          pathUrl.includes("/hotspot/users") ||
          pathUrl.includes("/cards/generate") ||
          pathUrl.includes("/vouchers/generate") ||
          pathUrl.includes("/vouchers/sync")
        ) {
          invalidateCache("/ip/hotspot/user/print");
          invalidateCache("/ip/hotspot");
        }
        if (pathUrl.includes("/hotspot/active")) {
          invalidateCache("/ip/hotspot/active/print");
        }
        if (
          pathUrl.includes("/hotspot/profiles") ||
          pathUrl.includes("/profiles") ||
          pathUrl.includes("/router/profiles") ||
          pathUrl.includes("/mikrotik/profiles")
        ) {
          invalidateCache("/ip/hotspot/user/profile");
          invalidateCache("/ppp/profile");
          invalidateCache("/user-manager");
          invalidateCache("/tool/user-manager");
          clearCachedUsermanResult();
        }
        if (pathUrl.includes("/ppp/secrets") || pathUrl.includes("/ppp")) {
          invalidateCache("/ppp/secret/print");
          invalidateCache("/ppp");
        }
        if (pathUrl.includes("/ppp/profiles")) {
          invalidateCache("/ppp/profile/print");
        }
        if (pathUrl.includes("/ppp/active")) {
          invalidateCache("/ppp/active/print");
        }
        if (pathUrl.includes("/userman") || pathUrl.includes("user-manager")) {
          invalidateCache("/user-manager");
          invalidateCache("/tool/user-manager");
          clearCachedUsermanResult();
        }
        if (pathUrl.includes("/queues")) {
          invalidateCache("/queue/simple/print");
        }
        if (pathUrl.includes("/ip-bindings")) {
          invalidateCache("/ip/hotspot/ip-binding/print");
        }
      }
    });
  }
  next();
});


// Mount Domain Modules
app.use(createVoucherRoutes(resolveScopedRouterClient));
app.use("/api/ap", createApRoutes(resolveScopedRouterClient));
app.use("/api/mikrotik/ap", createApRoutes(resolveScopedRouterClient));
registerPortalEndpoints(app, routerClients, MikrotikAPI_Original);

app.use(createSystemDiagnosticsRoutes());
app.use(createSubscribersRoutes());
app.use(createNetworkFirewallRoutes());

// API 404 Catch-All Middleware
app.all("/api/*", (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `المسار البرمجي غير موجود (${req.method} ${req.originalUrl})`
  });
});

// Vite Development / Production Static Middleware
if (process.env.NODE_ENV !== "production") {
  import("vite")
    .then(({ createServer: createViteServer }) => {
      return createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: "spa"
      });
    })
    .then((vite) => {
      app.use(vite.middlewares);
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Real MikroTik Server running on http://localhost:${PORT}`);
      });
      realtimeSyncServer.attach(server);
      server.on("error", (err: any) => {
        console.error(`[Server Dev Error] Failed to listen on port ${PORT}:`, err);
      });
    })
    .catch((err) => {
      console.error("Failed to start Vite server:", err);
      process.exit(1);
    });
} else {
  const getSafeDirname = () => {
    try {
      if (typeof __dirname !== "undefined") return __dirname;
      return path.dirname(fileURLToPath(import.meta.url));
    } catch {
      return process.cwd();
    }
  };
  const safeDir = getSafeDirname();
  let distPath = path.join(process.cwd(), "dist");
  const resPath = (process as any).resourcesPath;
  const candidates = [
    path.join(safeDir, "index.html"),
    path.join(safeDir, "dist", "index.html"),
    path.join(safeDir, "..", "dist", "index.html"),
    path.join(process.cwd(), "dist", "index.html"),
    ...(resPath
      ? [
          path.join(resPath, "app.asar", "dist", "index.html"),
          path.join(resPath, "app", "dist", "index.html"),
          path.join(resPath, "dist", "index.html")
        ]
      : [])
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      distPath = path.dirname(cand);
      break;
    }
  }

  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    const indexPath = path.join(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(503).send("ZCtrl is initializing. Please wait a moment and reload.");
    }
  });
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Real MikroTik Server running on http://localhost:${PORT}`);
  });
  realtimeSyncServer.attach(server);
  server.on("error", (err: any) => {
    console.error(`[Server Process Error] Failed to listen on port ${PORT}:`, err);
  });
}

// Graceful Shutdown Lifecycle
const handleGracefulShutdown = async () => {
  RevertJournalSweeper.stopSweeper();
  try {
    voucherDb.close();
  } catch {}
  try {
    await ftpService.closeAll();
  } catch {}
  try {
    await destroyRuntimeResources();
  } catch {}
  process.exit(0);
};

process.on("SIGTERM", handleGracefulShutdown);
process.on("SIGINT", handleGracefulShutdown);
