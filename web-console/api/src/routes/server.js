import { json } from "../core/auth.js";
import { performanceSnapshot } from "../services/boot.js";
import { commandJson, safeCommandJson, task, readJson } from "../lib/apiHelpers.js";
import { saveServerFuncomToken, funcomTokenCheckRoute, restartScheduleRoute } from "../services/setupConfig.js";

export function registerServerRoutes(router, ctx) {
  router.get("/api/server/status", (_req, res) => commandJson(ctx, res, "status"));
  router.get("/api/server/performance", async (_req, res) => json(res, 200, await performanceSnapshot(ctx)));
  router.get("/api/server/readiness", (_req, res) => safeCommandJson(ctx, res, "readiness"));
  router.get("/api/server/ports", (_req, res) => commandJson(ctx, res, "ports"));
  router.get("/api/server/services", (_req, res) => commandJson(ctx, res, "services"));
  router.get("/api/server/doctor", (_req, res) => safeCommandJson(ctx, res, "doctor"));
  router.post("/api/server/start", (req, res) => task(ctx, req, res, "server", "start", {}));
  router.post("/api/server/stop", (req, res) => task(ctx, req, res, "server", "stop", {}));
  router.post("/api/server/restart", (req, res) => task(ctx, req, res, "server", "restartAll", {}));
  router.post("/api/server/restart-service", async (req, res) => {
    const body = await readJson(ctx, req);
    return task(ctx, req, res, "server", "restartService", { service: body.service });
  });
  router.post("/api/server/funcom-token", (req, res) => saveServerFuncomToken(ctx, req, res));
  router.get("/api/server/funcom-token/check", (req, res, c, { url }) => funcomTokenCheckRoute(c, req, res, url));
  router.post("/api/server/title", async (req, res) => {
    const body = await readJson(ctx, req);
    return task(ctx, req, res, "server", "serverTitle", { title: body.title });
  });
  router.post("/api/server/restart-schedule", (req, res) => restartScheduleRoute(ctx, req, res));
  router.get("/api/server/restart-schedule", (_req, res) => safeCommandJson(ctx, res, "restartScheduleStatus"));
}
