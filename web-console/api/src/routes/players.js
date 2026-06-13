import * as duneDb from "../domain/duneDb.js";
import { dbJson, exportJson, confirmedTask, playerTask, dbPlayerRoute, dbPlayerUnsupported, playerDbMutation } from "../lib/apiHelpers.js";
import {
  giveSingleItemRoute,
  giveItemsRoute,
  inventoryDeleteRoute,
  storageGiveItemRoute
} from "../services/playerGrants.js";

export function registerPlayersRoutes(router, ctx) {
  router.get("/api/players", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.listPlayers(c.getDb(), { q: url.searchParams.get("q") || "" })));
  router.get("/api/players/online", (_req, res) => dbJson(ctx, res, () => duneDb.listPlayers(ctx.getDb(), { online: true })));
  router.get("/api/players/search", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.listPlayers(c.getDb(), { q: url.searchParams.get("q") || "" })));
  router.post("/api/players/kick-all-online", (req, res) => confirmedTask(ctx, req, res, "admin", "adminKickAllOnline", {}, "KICK ALL ONLINE PLAYERS"));

  router.post("/api/players/:playerId/give-item", (req, res, c, { params }) => giveSingleItemRoute(c, req, res, params.playerId, "adminGiveItem"));
  router.post("/api/players/:playerId/give-items", (req, res, c, { params }) => giveItemsRoute(c, req, res, params.playerId));
  router.post("/api/players/:playerId/give-item-id", (req, res, c, { params }) => giveSingleItemRoute(c, req, res, params.playerId, "adminGiveItemId"));
  router.post("/api/players/:playerId/add-xp", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminAddXp"));
  router.post("/api/players/:playerId/set-skill-points", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminSetSkillPoints"));
  router.post("/api/players/:playerId/set-skill-module", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminSetSkillModule"));
  router.post("/api/players/:playerId/refill-water", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminRefillWater"));
  router.post("/api/players/:playerId/kick", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminKick"));
  router.post("/api/players/:playerId/teleport", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminTeleport"));
  router.post("/api/players/:playerId/spawn-vehicle", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminSpawnVehicle"));
  router.post("/api/players/:playerId/clean-inventory", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminCleanInventory", "CLEAN INVENTORY"));
  router.post("/api/players/:playerId/reset-progression", (req, res, c, { params }) => playerTask(c, req, res, params.playerId, "adminResetProgression", "RESET PROGRESSION"));

  const dbMutations = [
    { suffix: "add-currency", action: "players.add-currency", phrase: "ADD CURRENCY", fn: (c, id, body) => duneDb.addCurrency(c.getDb(), id, body) },
    { suffix: "add-faction-reputation", action: "players.add-faction-reputation", phrase: "ADD FACTION REPUTATION", fn: (c, id, body) => duneDb.addFactionReputation(c.getDb(), id, body) },
    { suffix: "add-intel", action: "players.add-intel", phrase: "ADD INTEL", fn: (c, id, body) => duneDb.addIntel(c.getDb(), id, body) },
    { suffix: "specializations/add-xp", action: "players.specializations.add-xp", phrase: "ADD SPECIALIZATION XP", fn: (c, id, body) => duneDb.addSpecializationXp(c.getDb(), id, body) },
    { suffix: "specializations/grant-max", action: "players.specializations.grant-max", phrase: "GRANT MAX SPECIALIZATION", fn: (c, id, body) => duneDb.grantMaxSpecialization(c.getDb(), id, body) },
    { suffix: "specializations/reset", action: "players.specializations.reset", phrase: "RESET SPECIALIZATION", fn: (c, id, body) => duneDb.resetSpecialization(c.getDb(), id, body) },
    { suffix: "specializations/keystones/grant-all", action: "players.specializations.keystones.grant-all", phrase: "GRANT ALL KEYSTONES", fn: (c, id) => duneDb.grantAllSpecializationKeystones(c.getDb(), id) },
    { suffix: "specializations/keystones/reset-all", action: "players.specializations.keystones.reset-all", phrase: "RESET ALL KEYSTONES", fn: (c, id) => duneDb.resetAllSpecializationKeystones(c.getDb(), id) },
    { suffix: "crafting-recipes/unlock", action: "players.crafting-recipes.unlock", phrase: "UNLOCK CRAFTING RECIPE", fn: (c, id, body) => duneDb.unlockCraftingRecipe(c.getDb(), id, body) },
    { suffix: "research-items/unlock", action: "players.research-items.unlock", phrase: "UNLOCK RESEARCH ITEM", fn: (c, id, body) => duneDb.unlockResearchItem(c.getDb(), id, body) },
    { suffix: "journey/complete", action: "players.journey.complete", phrase: "COMPLETE JOURNEY NODE", fn: (c, id, body) => duneDb.completeJourneyNode(c.getDb(), id, body, c.journeyTagsData) },
    { suffix: "journey/reset", action: "players.journey.reset", phrase: "RESET JOURNEY NODE", fn: (c, id, body) => duneDb.resetJourneyNode(c.getDb(), id, body, c.journeyTagsData) },
    { suffix: "tutorials/complete", action: "players.tutorials.complete", phrase: "COMPLETE TUTORIAL", fn: (c, id, body) => duneDb.completeTutorial(c.getDb(), id, body) },
    { suffix: "tutorials/reset", action: "players.tutorials.reset", phrase: "RESET TUTORIAL", fn: (c, id, body) => duneDb.resetTutorial(c.getDb(), id, body) },
    { suffix: "repair-gear", action: "players.repair-gear", phrase: "REPAIR GEAR", fn: (c, id) => duneDb.repairGear(c.getDb(), id) },
    { suffix: "refuel-vehicle", action: "players.refuel-vehicle", phrase: "REFUEL VEHICLE", fn: (c, id, body) => duneDb.refuelVehicle(c.getDb(), id, body) }
  ];

  for (const route of dbMutations) {
    router.post(`/api/players/:playerId/${route.suffix}`, (req, res, c, { params }) =>
      playerDbMutation(c, req, res, params.playerId, route.action, route.phrase, (id, body) => route.fn(c, id, body)));
  }

  router.delete("/api/players/:playerId/inventory/:itemId", (req, res, c, { params }) => inventoryDeleteRoute(c, req, res, params.playerId, params.itemId));
  router.get("/api/players/:playerId/crafting-recipes", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerCraftingRecipes));
  router.get("/api/players/:playerId/research-items", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerResearchItems));
  router.get("/api/players/:playerId/journey", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, (db, id) => duneDb.playerJourney(db, id, c.journeyTagsData)));
  router.get("/api/players/:playerId/inventory", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerInventory));
  router.get("/api/players/:playerId/currency", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerCurrency));
  router.get("/api/players/:playerId/factions", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerFactions));
  router.get("/api/players/:playerId/specs", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerSpecs));
  router.get("/api/players/:playerId/position", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerPosition));
  router.get("/api/players/:playerId/progression", (_req, res, c, { params }) => dbPlayerUnsupported(c, res, params.playerId, "progression"));
  router.get("/api/players/:playerId/events", (_req, res, c, { params }) => dbPlayerUnsupported(c, res, params.playerId, "events"));
  router.get("/api/players/:playerId/stats", (_req, res, c, { params }) => dbPlayerUnsupported(c, res, params.playerId, "stats"));
  router.get("/api/players/:playerId/history", (_req, res, c, { params }) => dbPlayerUnsupported(c, res, params.playerId, "history"));
  router.get("/api/players/:playerId", (_req, res, c, { params }) => dbPlayerRoute(c, res, params.playerId, duneDb.playerProfile));
}

export function registerStorageRoutes(router, ctx) {
  router.get("/api/storage", (_req, res) => dbJson(ctx, res, () => duneDb.listStorage(ctx.getDb())));
  router.get("/api/storage/:id", (_req, res, c, { params }) => dbJson(c, res, async () => ({ storage: (await duneDb.listStorage(c.getDb())).rows.find((row) => String(row.id) === params.id) || null })));
  router.get("/api/storage/:id/items", (_req, res, c, { params }) => dbJson(c, res, () => duneDb.storageItems(c.getDb(), params.id)));
  router.post("/api/storage/:id/give-item", (req, res, c, { params }) => storageGiveItemRoute(c, req, res, params.id));
  router.get("/api/storage/:id/export", (_req, res, c, { params }) => exportJson(c, res, `storage-${params.id}.json`, () => duneDb.storageItems(c.getDb(), params.id)));
}
