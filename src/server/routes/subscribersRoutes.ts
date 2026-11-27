import { Router } from "express";
import { registerHotspotUsersRoutes } from "./subscribers/hotspotUsersRoutes.ts";
import { registerBatchSubscribersRoutes } from "./subscribers/batchSubscribersRoutes.ts";
import { registerHotspotProfilesRoutes } from "./subscribers/hotspotProfilesRoutes.ts";
import { registerPppRoutes } from "./subscribers/pppRoutes.ts";
import { registerUsermanRoutes } from "./subscribers/usermanRoutes.ts";

export function createSubscribersRoutes(): Router {
  const router = Router();
  registerHotspotUsersRoutes(router);
  registerBatchSubscribersRoutes(router);
  registerHotspotProfilesRoutes(router);
  registerPppRoutes(router);
  registerUsermanRoutes(router);
  return router;
}
