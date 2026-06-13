import { commandJson } from "../lib/apiHelpers.js";
import { sietchesUpdateRoute, deepDesertUpdateRoute } from "../services/setupConfig.js";

export function registerSietchesRoutes(router, ctx) {
  router.get("/api/sietches", (_req, res) => commandJson(ctx, res, "sietchesList"));
  router.get("/api/sietches/dimensions", (_req, res, c, { url }) => commandJson(c, res, url.searchParams.get("ids") === "1" ? "sietchesDimensionIds" : "sietchesDimensions", { map: url.searchParams.get("map") || "Survival_1" }));
  router.post("/api/sietches/update", (req, res) => sietchesUpdateRoute(ctx, req, res));
  router.get("/api/deepdesert", (_req, res) => commandJson(ctx, res, "deepdesertStatus"));
  router.post("/api/deepdesert/update", (req, res) => deepDesertUpdateRoute(ctx, req, res));
}
