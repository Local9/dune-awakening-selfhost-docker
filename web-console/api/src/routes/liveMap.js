import * as duneDb from "../domain/duneDb.js";
import { dbJson } from "../lib/apiHelpers.js";
import { mapStatusRoute } from "../services/mapsService.js";
import { liveMapMarkersRoute, liveMapTeleportPlayerRoute } from "../services/liveMap.js";

export function registerLiveMapRoutes(router, ctx) {
  router.get("/api/map/status", (_req, res) => mapStatusRoute(ctx, res));
  router.get("/api/map/capabilities", (_req, res) => dbJson(ctx, res, () => duneDb.liveMapCapabilities(ctx.getDb())));
  router.post("/api/map/teleport-player", (req, res) => liveMapTeleportPlayerRoute(ctx, req, res));
  router.get("/api/map/partitions", (_req, res) => dbJson(ctx, res, () => duneDb.liveMapPartitions(ctx.getDb())));
  router.get("/api/map/markers", (_req, res, c, { url }) => liveMapMarkersRoute(c, res, url));
  router.get("/api/map/players", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.liveMapPlayers(c.getDb(), url.searchParams.get("map") || "")));
  router.get("/api/map/bases", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.liveMapBases(c.getDb(), url.searchParams.get("map") || "")));
  router.get("/api/map/storage", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.liveMapStorage(c.getDb(), url.searchParams.get("map") || "")));
  router.get("/api/map/services", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.liveMapServices(c.getDb(), url.searchParams.get("map") || "")));
  router.get("/api/map/overlays", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.liveMapMarkers(c.getDb(), url.searchParams.get("map") || "")));
}
