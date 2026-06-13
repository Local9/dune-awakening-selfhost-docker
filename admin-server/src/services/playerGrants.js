import { audit, recordAdminHistory } from "../core/audit.js";
import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import { resolveCatalogItem } from "../domain/adminCatalog.js";
import { buildDuneArgs, runDune } from "../platform/runner.js";
import * as duneDb from "../domain/duneDb.js";
import { directDbMutation, playerDbMutation, readJson, task } from "../lib/apiHelpers.js";

export async function resolveCarePackagePlayerIdentity(ctx, playerId) {
  const players = await duneDb.listPlayers(ctx.getDb(), {});
  const rows = players.rows || [];
  const target = String(playerId || "").toLowerCase();
  const player = rows.find((row) => [row.action_player_id, row.funcom_id, row.fls_id, row.account_id, row.actor_id, row.player_pawn_id]
    .some((value) => String(value || "").toLowerCase() === target));
  if (!player) return {};
  return {
    funcomId: player.funcom_id || player.fls_id || player.action_player_id || "",
    flsId: player.fls_id || player.funcom_id || player.action_player_id || "",
    characterName: player.character_name || "",
    actorId: player.actor_id || player.player_pawn_id || "",
    onlineStatus: player.online_status || ""
  };
}

export async function resolvePlayerGrantTarget(ctx, playerId) {
  const players = await duneDb.listPlayers(ctx.getDb(), {}).catch(() => ({ rows: [] }));
  const rows = players.rows || [];
  const target = String(playerId || "").toLowerCase();
  const player = rows.find((row) => [row.action_player_id, row.funcom_id, row.fls_id, row.account_id, row.actor_id, row.player_pawn_id]
    .some((value) => String(value || "").toLowerCase() === target));
  return {
    actionId: String(player?.action_player_id || player?.funcom_id || player?.fls_id || playerId || ""),
    actorId: String(player?.actor_id || player?.player_pawn_id || (/^\d+$/.test(String(playerId || "")) ? playerId : "") || ""),
    characterName: player?.character_name || "",
    online: String(player?.online_status || "").toLowerCase() === "online"
  };
}

export async function inventoryDeleteRoute(ctx, req, res, playerId, itemId) {
  return directDbMutation(ctx, req, res, "players.inventory-delete", "DELETE ITEM", () => duneDb.deleteInventoryItem(ctx.getDb(), playerId, itemId), { playerId, itemId });
}

export async function storageGiveItemRoute(ctx, req, res, storageId) {
  return directDbMutation(ctx, req, res, "storage.give-item", "GIVE ITEM TO STORAGE", async (body) => {
    const resolved = resolveCatalogItem(ctx.config.repoRoot, body);
    return duneDb.giveItemToStorage(ctx.getDb(), storageId, { ...body, templateId: resolved.itemId });
  }, { storageId });
}

export async function giveItemsRoute(ctx, req, res, playerId) {
  const body = await readJson(ctx, req);
  if (!Array.isArray(body.items)) {
    return task(ctx, req, res, "admin", "adminGiveItems", { ...body, playerId });
  }
  if (body.items.length < 1 || body.items.length > 25) return json(res, 400, { error: "Give Multiple Items requires 1-25 items" });

  const results = [];
  const target = await resolvePlayerGrantTarget(ctx, playerId);
  for (const [index, item] of body.items.entries()) {
    try {
      results.push({ index, ...(await grantPlayerItem(ctx, playerId, item, target)) });
    } catch (error) {
      results.push({ index, ok: false, item, error: redact(error.message || error) });
    }
  }
  const ok = results.every((result) => result.ok);
  audit(ctx.config, req, "players.give-items", { playerId, count: body.items.length, ok, results });
  if (body.historyScope === "admin-tools") {
    const friendly = body.historyFriendly || "Grant Items";
    recordAdminHistory(ctx.config, { command: "web-hydrate-all", target: "all", friendly, path: "players.give-items", result: ok ? "published" : "failed", message: `${friendly} for ${playerId}` });
  }
  return json(res, ok ? 200 : 207, { ok, results });
}

export async function giveSingleItemRoute(ctx, req, res, playerId, operation) {
  const body = await readJson(ctx, req);
  if (body.quality === undefined && body.grade === undefined) {
    return task(ctx, req, res, "admin", operation, { ...body, playerId });
  }
  const item = operation === "adminGiveItemId"
    ? { itemId: body.itemId, quantity: body.quantity, quality: body.quality, grade: body.grade, durability: body.durability }
    : { itemName: body.itemName, quantity: body.quantity, quality: body.quality, grade: body.grade, durability: body.durability };
  try {
    const target = await resolvePlayerGrantTarget(ctx, playerId);
    const result = await grantPlayerItem(ctx, playerId, item, target);
    audit(ctx.config, req, operation === "adminGiveItemId" ? "players.give-item-id" : "players.give-item", { playerId, ok: result.ok, result });
    return json(res, result.ok ? 200 : 207, result);
  } catch (error) {
    audit(ctx.config, req, operation === "adminGiveItemId" ? "players.give-item-id" : "players.give-item", { playerId, ok: false, error: redact(error.message || error) });
    return json(res, 400, { ok: false, error: redact(error.message || error) });
  }
}

export async function grantPlayerItem(ctx, playerId, item, target) {
  const resolved = item.itemId ? { itemId: item.itemId } : resolveCatalogItem(ctx.config.repoRoot, item);
  const operation = resolved.itemId ? "adminGiveItemId" : "adminGiveItem";
  const hasExplicitGrade = item.quality !== undefined || item.grade !== undefined;
  const selectedGrade = hasExplicitGrade ? validateGrantGrade(item.quality ?? item.grade) : undefined;
  const usesDatabaseGrade = selectedGrade !== undefined && selectedGrade > 0;
  const payload = {
    playerId: target.actionId || playerId,
    itemId: resolved.itemId,
    itemName: item.itemName,
    quantity: item.quantity ?? 1,
    quality: hasExplicitGrade ? selectedGrade : undefined,
    durability: 1
  };
  if (usesDatabaseGrade) {
    if (!ctx.config.mockMode && !target.actorId) throw new Error("A database actor ID is required to grant graded items");
    const result = ctx.config.mockMode
      ? { ok: true, inserted: { template_id: resolved.itemId || payload.itemName, stack_size: payload.quantity, quality_level: payload.quality } }
      : await duneDb.giveItemToPlayer(ctx.getDb(), target.actorId, {
          templateId: resolved.itemId || "",
          itemName: payload.itemName,
          quantity: payload.quantity,
          quality: payload.quality
        });
    return { ok: true, operation: "dbGiveItemToPlayer", item: payload, result };
  }
  const command = buildDuneArgs(operation, payload);
  if (ctx.config.mockMode) return { ok: true, operation, command };
  const result = await runDune(ctx.config, command);
  return { ok: true, operation, item: payload, stdout: result.stdout, stderr: result.stderr, exitCode: result.code };
}

export function validateGrantGrade(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.trunc(n) !== n || n < 0 || n > 5) throw new Error("Expected item grade 0-5");
  return n;
}

export { playerDbMutation };
