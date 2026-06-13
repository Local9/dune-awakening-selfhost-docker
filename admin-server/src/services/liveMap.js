import { audit } from "../core/audit.js";
import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import { validateNumber } from "../core/validation.js";
import { intParam } from "../core/db.js";
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
  let payload;
  try {
    payload = {
      playerId,
      x: validateNumber(body.x, -100_000_000, 100_000_000, "x"),
      y: validateNumber(body.y, -100_000_000, 100_000_000, "y"),
      z: validateNumber(body.z ?? 5000, -100_000_000, 100_000_000, "z"),
      yaw: validateNumber(body.yaw || 0, -360, 360, "yaw"),
      partitionId: body.partitionId ? intParam(body.partitionId, "partitionId", 1, 1_000_000) : 0
    };
  } catch (error) {
    return json(res, 400, { error: redact(error.message || error) });
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
