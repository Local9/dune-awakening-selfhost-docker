import { json } from "../core/auth.js";
import { discoverServices, logsRoute } from "../services/logs.js";

export function registerLogsRoutes(router, ctx) {
  router.get("/api/logs/services", async (_req, res) => json(res, 200, { services: await discoverServices(ctx) }));
  router.get("/api/logs/:service", (req, res, c, meta) => logsRoute(c, req, res, meta));
  router.get("/api/logs/:service/download", (req, res, c, meta) => logsRoute(c, req, res, { params: { ...meta.params, sub: "download" } }));
  router.get("/api/logs/:service/stream", (req, res, c, meta) => logsRoute(c, req, res, { params: { ...meta.params, sub: "stream" } }));
}
