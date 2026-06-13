import { json } from "../core/auth.js";
import { listCatalogItems } from "../domain/adminCatalog.js";
import { commandJson } from "../lib/apiHelpers.js";
import { structuredVehiclesRoute } from "../services/mapsService.js";
import { clearAdminHistoryRoute, broadcastRoute, shutdownBroadcastRoute, whisperRoute } from "../services/adminBroadcast.js";

export function registerAdminRoutes(router, ctx) {
  router.get("/api/admin/items/catalog", (_req, res, c, { url }) => json(res, 200, { rows: listCatalogItems(c.config.repoRoot, { q: url.searchParams.get("q") || "", limit: url.searchParams.get("limit") || 500 }) }));
  router.get("/api/admin/items/search", (_req, res, c, { url }) => commandJson(c, res, "adminItemSearch", { q: url.searchParams.get("q") || "" }));
  router.get("/api/admin/items", (_req, res, c, { url }) => commandJson(c, res, url.searchParams.get("category") ? "adminItemListCategory" : "adminItemList", { category: url.searchParams.get("category") || "" }));
  router.get("/api/admin/vehicles/structured", (_req, res) => structuredVehiclesRoute(ctx, res));
  router.get("/api/admin/vehicles", (_req, res, c, { url }) => commandJson(c, res, url.searchParams.get("q") ? "adminVehicleSearch" : "adminVehicleList", { q: url.searchParams.get("q") || "" }));
  router.get("/api/admin/skill-modules", (_req, res, c, { url }) => commandJson(c, res, url.searchParams.get("q") ? "adminSkillModulesSearch" : "adminSkillModules", { q: url.searchParams.get("q") || "" }));
  router.get("/api/admin/history", (_req, res) => commandJson(ctx, res, "adminHistory"));
  router.post("/api/admin/history/clear", (req, res) => clearAdminHistoryRoute(ctx, req, res));
  router.post("/api/admin/broadcast", (req, res) => broadcastRoute(ctx, req, res));
  router.post("/api/admin/broadcast-shutdown", (req, res) => shutdownBroadcastRoute(ctx, req, res));
  router.post("/api/admin/whisper", (req, res) => whisperRoute(ctx, req, res));
}
