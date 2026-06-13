import { json } from "../core/auth.js";
import { commandJson, safeCommandJson, confirmedTask } from "../lib/apiHelpers.js";
import {
  mapSettingsRoute,
  userSettingsSchemaRoute,
  userSettingsRawRoute,
  userSettingsSaveRoute,
  userSettingsResetRoute,
  userSettingsRawWriteRoute
} from "../services/mapsService.js";
import {
  swapMemoryRoute,
  publicSwapMemoryState,
  liveMapMemoryRoute,
  memoryRoute
} from "../services/swapMemory.js";
import { userSettingsRestoreDefaultsRoute } from "../services/setupConfig.js";

export function registerMapsRoutes(router, ctx) {
  router.post("/api/maps/mode", (req, res) => confirmedTask(ctx, req, res, "maps", "mapsSetMode", {}, "SET MAP MODE"));
  router.post("/api/maps/settings", (req, res) => mapSettingsRoute(ctx, req, res));
  router.get("/api/maps", (_req, res) => commandJson(ctx, res, "mapsList"));
  router.get("/api/maps/mode", (_req, res, c, { url }) => commandJson(c, res, "mapsMode", { map: url.searchParams.get("map") || "" }));
  router.post("/api/maps/reconcile", (req, res) => confirmedTask(ctx, req, res, "maps", "mapsReconcile", {}, "RECONCILE MAPS"));
  router.post("/api/maps/spawn", (req, res) => confirmedTask(ctx, req, res, "maps", "mapsSpawn", {}, "SPAWN MAP"));
  router.post("/api/maps/despawn", (req, res) => confirmedTask(ctx, req, res, "maps", "mapsDespawn", {}, "DESPAWN MAP"));
  router.post("/api/maps/autoscaler", (req, res) => confirmedTask(ctx, req, res, "maps", "autoscalerAction", {}, "AUTOSCALER CHANGE"));
  router.get("/api/maps/autoscaler", (_req, res) => commandJson(ctx, res, "autoscalerStatus"));
  router.post("/api/maps/memory", (req, res) => memoryRoute(ctx, req, res));
  router.post("/api/maps/memory/swap", (req, res) => swapMemoryRoute(ctx, req, res));
  router.get("/api/maps/memory/swap", (_req, res) => json(res, 200, publicSwapMemoryState(ctx)));
  router.get("/api/maps/memory/live", (_req, res) => liveMapMemoryRoute(ctx, res));
  router.get("/api/maps/memory", (_req, res) => commandJson(ctx, res, "memoryStatus"));
  router.get("/api/maps/user-settings/schema", (_req, res) => userSettingsSchemaRoute(ctx, res));
  router.post("/api/maps/user-settings/raw", (req, res) => userSettingsRawWriteRoute(ctx, req, res));
  router.get("/api/maps/user-settings/raw", (_req, res, c, { url }) => userSettingsRawRoute(c, res, url));
  router.post("/api/maps/user-settings/save", (req, res) => userSettingsSaveRoute(ctx, req, res));
  router.post("/api/maps/user-settings/reset", (req, res) => userSettingsResetRoute(ctx, req, res));
  router.get("/api/maps/userengine", (_req, res) => safeCommandJson(ctx, res, "userSettingsEngineValues"));
  router.get("/api/maps/usergame", (_req, res, c, { url }) => safeCommandJson(c, res, url.searchParams.get("partitionId") ? "userSettingsPartitionValues" : "userSettingsMapValues", { map: url.searchParams.get("map") || "Survival_1", partitionId: url.searchParams.get("partitionId") || "1" }));
  router.post("/api/maps/user-settings/materialize", (req, res) => confirmedTask(ctx, req, res, "maps", "userSettingsMaterializeCurrent", {}, "REFRESH MAP SETTINGS"));
  router.post("/api/maps/user-settings/restore-defaults", (req, res) => userSettingsRestoreDefaultsRoute(ctx, req, res));
}
