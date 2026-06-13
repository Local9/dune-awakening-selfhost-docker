import { json } from "../core/auth.js";
import { publicTask } from "../platform/tasks.js";
import { preflight } from "../platform/preflight.js";
import { taskRoute } from "../app/router.js";
import { task } from "../lib/apiHelpers.js";
import { setupState, writeConfig, saveToken } from "../services/setupConfig.js";

export function registerSetupRoutes(router, ctx) {
  router.get("/api/setup/state", async (_req, res) => json(res, 200, await setupState(ctx)));
  router.post("/api/setup/preflight", async (_req, res) => json(res, 200, await preflight(ctx.config)));
  router.post("/api/setup/write-config", (req, res) => writeConfig(ctx, req, res));
  router.post("/api/setup/save-token", (req, res) => saveToken(ctx, req, res));
  router.post("/api/setup/init", (req, res) => task(ctx, req, res, "setup", "init", {}));
  router.get("/api/setup/tasks", (_req, res) => json(res, 200, { tasks: ctx.tasks.list().map(publicTask) }));
  router.get("/api/setup/tasks/:id", (req, res, c, meta) => taskRoute(c, req, res, meta));
  router.get("/api/setup/tasks/:id/stream", (req, res, c, meta) => taskRoute(c, req, res, { params: { ...meta.params, sub: "stream" } }));
}
