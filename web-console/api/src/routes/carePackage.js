import { json } from "../core/auth.js";
import {
  carePackageCapabilities,
  carePackageConfig,
  carePackageHistory,
  carePackageConfigRoute,
  carePackageEnableRoute,
  carePackageGrantRoute,
  carePackageEligibleRoute,
  carePackageGrantEligibleRoute,
  carePackageRunRoute,
  carePackageRetryRoute,
  carePackageClearHistoryRoute
} from "../services/carePackageRoutes.js";

export function registerCarePackageRoutes(router, ctx) {
  router.get("/api/care-package/capabilities", (_req, res) => json(res, 200, carePackageCapabilities()));
  router.post("/api/care-package/config", (req, res) => carePackageConfigRoute(ctx, req, res));
  router.get("/api/care-package/config", (_req, res) => json(res, 200, carePackageConfig(ctx.config)));
  router.post("/api/care-package/history/clear", (req, res) => carePackageClearHistoryRoute(ctx, req, res));
  router.get("/api/care-package/grants", (_req, res, c, { url }) => json(res, 200, carePackageHistory(c.config, url.searchParams.get("limit") || 100)));
  router.get("/api/care-package/history", (_req, res, c, { url }) => json(res, 200, carePackageHistory(c.config, url.searchParams.get("limit") || 100)));
  router.get("/api/care-package/eligible", (req, res, c, meta) => carePackageEligibleRoute(c, req, res, meta.url));
  router.post("/api/care-package/grant-eligible", (req, res) => carePackageGrantEligibleRoute(ctx, req, res));
  router.post("/api/care-package/run", (req, res) => carePackageRunRoute(ctx, req, res));
  router.post("/api/care-package/grant/:id", (req, res, c, { params }) => carePackageGrantRoute(c, req, res, params.id));
  router.post("/api/care-package/retry/:id", (req, res, c, { params }) => carePackageRetryRoute(c, req, res, params.id));
  router.post("/api/care-package/enable", (req, res) => carePackageEnableRoute(ctx, req, res, true));
  router.post("/api/care-package/disable", (req, res) => carePackageEnableRoute(ctx, req, res, false));
}

export { carePackageAutoTick } from "../services/carePackageRoutes.js";
