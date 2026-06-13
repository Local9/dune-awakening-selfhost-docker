import { json } from "../core/auth.js";
import { setupState, writeConfig } from "../services/setupConfig.js";

export function registerSettingsRoutes(router, ctx) {
  router.post("/api/settings", (req, res) => writeConfig(ctx, req, res));
  router.get("/api/settings", async (_req, res) => json(res, 200, await setupState(ctx)));
}
