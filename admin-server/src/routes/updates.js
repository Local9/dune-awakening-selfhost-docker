import { task, safeCommandJson, readJson } from "../lib/apiHelpers.js";
import { autoGameUpdateRoute, previousStackRestoreRoute } from "../services/setupConfig.js";

export function registerUpdatesRoutes(router, ctx) {
  router.post("/api/updates/check-game", (req, res) => task(ctx, req, res, "updates", "updateCheck", {}));
  router.post("/api/updates/apply-game", (req, res) => task(ctx, req, res, "updates", "updateApply", {}));
  router.post("/api/updates/fix-steamcmd", (req, res) => task(ctx, req, res, "updates", "updateFixSteamcmd", {}));
  router.post("/api/updates/check-stack", (req, res) => task(ctx, req, res, "updates", "selfUpdateCheck", {}));
  router.post("/api/updates/apply-stack", (req, res) => task(ctx, req, res, "updates", "selfUpdateApply", {}));
  router.post("/api/updates/auto-game", (req, res) => autoGameUpdateRoute(ctx, req, res));
  router.post("/api/updates/restore-previous-stack", (req, res) => previousStackRestoreRoute(ctx, req, res));
  router.get("/api/updates/auto-game", (_req, res) => safeCommandJson(ctx, res, "updateAutoStatus"));
  router.get("/api/updates/previous-stack", (_req, res) => safeCommandJson(ctx, res, "selfUpdateList"));
  router.post("/api/updates/repair-runtime", (req, res) => task(ctx, req, res, "updates", "readiness", {}));
}
