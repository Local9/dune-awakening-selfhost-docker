import { audit } from "../core/audit.js";
import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import { buildDuneArgs } from "../platform/runner.js";
import * as duneDb from "../domain/duneDb.js";
import { readJson, task } from "../lib/apiHelpers.js";

export async function liveMapMarkersRoute(ctx, res, url) {
  const db = ctx.getDb();
  const configPayload = duneDb.liveMapConfigPayload(url.searchParams.get("map") || "");
  const [markers, partitions] = await Promise.all([
    duneDb.liveMapMarkers(db, configPayload.map.actorMap || configPayload.map.key),
    duneDb.liveMapPartitions(db).catch(() => ({ rows: [] }))
  ]);
  return json(res, 200, {
    ...markers,
    ...configPayload,
    partitions: partitions.rows || []
  });
}

export async function liveMapTeleportPlayerRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const playerId = String(body.playerId || "");
  const payload = {
    playerId,
    x: Number(body.x),
    y: Number(body.y),
    z: Number(body.z ?? 5000),
    yaw: Number(body.yaw || 0),
    partitionId: Number(body.partitionId || 0)
  };
  if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y) || !Number.isFinite(payload.z)) {
    return json(res, 400, { error: "Valid X, Y, and Z coordinates are required." });
  }
  if (body.online === true) {
    try {
      buildDuneArgs("adminTeleport", payload);
    } catch (error) {
      return json(res, 400, { error: redact(error.message || error) });
    }
    audit(ctx.config, req, "live-map.teleport.live", { playerId, x: payload.x, y: payload.y, z: payload.z, partitionId: payload.partitionId });
    return json(res, 202, { path: "live", task: ctx.tasks.create("admin", "adminTeleport", payload) });
  }
  try {
    const result = await duneDb.teleportOfflinePlayerToCoords(ctx.getDb(), playerId, payload);
    audit(ctx.config, req, "live-map.teleport.offline", { playerId, supported: result.supported, x: payload.x, y: payload.y, z: payload.z, partitionId: payload.partitionId });
    return json(res, 200, { path: "offline", ...result });
  } catch (error) {
    audit(ctx.config, req, "live-map.teleport.offline", { playerId, supported: false, error: redact(error.message || error) });
    return json(res, 400, { error: redact(error.message || error) });
  }
}
