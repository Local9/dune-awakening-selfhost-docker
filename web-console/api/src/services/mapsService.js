import { audit } from "../core/audit.js";
import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import { buildDuneArgs, parseVehicleList, runDune } from "../platform/runner.js";
import { mockCommand, readJson, safeCommand, task } from "../lib/apiHelpers.js";

export async function structuredVehiclesRoute(ctx, res) {
  if (ctx.config.mockMode) return json(res, 200, { vehicles: [] });
  const result = await runDune(ctx.config, buildDuneArgs("adminVehicleList"));
  return json(res, 200, {
    vehicles: parseVehicleList(result.stdout),
    stdout: result.stdout,
    stderr: result.stderr
  });
}

export async function mapStatusRoute(ctx, res) {
  if (ctx.config.mockMode) return json(res, 200, { maps: mockCommand("mapsList"), services: mockCommand("servers"), readiness: mockCommand("readiness") });
  const [maps, services, readiness, autoscaler] = await Promise.all([
    safeCommand(ctx, "mapsList"),
    safeCommand(ctx, "servers"),
    safeCommand(ctx, "readiness"),
    safeCommand(ctx, "autoscalerStatus")
  ]);
  return json(res, 200, { maps, services, readiness, autoscaler });
}

export async function mapSettingsRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "SAVE MAP SETTINGS") return json(res, 400, { error: "Confirmation phrase required: SAVE MAP SETTINGS" });
  const map = String(body.map || "");
  const partitionId = String(body.partitionId || "").trim();
  const memoryChanged = Boolean(body.memoryChanged);
  const modeChanged = Boolean(body.modeChanged);
  if (!map) return json(res, 400, { error: "Map is required." });
  if (!memoryChanged && !modeChanged) return json(res, 400, { error: "No map setting changes were submitted." });
  const restart = modeChanged && Boolean(body.running);
  const payload = {
    map,
    partitionId,
    mode: String(body.mode || ""),
    memory: String(body.memory || ""),
    modeChanged,
    memoryChanged,
    ...(restart ? restartPayload("map", map, partitionId) : { restartMode: "none", restartLabel: map })
  };
  audit(ctx.config, req, "maps.settings.save", { map, partitionId, modeChanged, memoryChanged, restartMode: payload.restartMode });
  return json(res, 202, { task: ctx.tasks.create("maps", "mapsApplySettings", payload) });
}

export async function userSettingsSchemaRoute(ctx, res) {
  try {
    const result = await runDune(ctx.config, buildDuneArgs("userSettingsMetadata"), { timeoutMs: 8000 });
    return json(res, 200, JSON.parse(result.stdout || "{}"));
  } catch (error) {
    return json(res, 500, { error: redact(error.message || error) });
  }
}

export async function userSettingsRawRoute(ctx, res, url) {
  const kind = String(url.searchParams.get("kind") || "engine");
  const map = url.searchParams.get("map") || "Survival_1";
  const partitionId = url.searchParams.get("partitionId") || "";
  const operation = kind === "profile" ? "userSettingsProfileRaw" : kind === "engine" ? "userSettingsRawEngine" : "userSettingsRawGame";
  try {
    const result = await runDune(ctx.config, buildDuneArgs(operation, { map, partitionId }), { timeoutMs: 8000 });
    return json(res, 200, { content: result.stdout || "" });
  } catch (error) {
    return json(res, 500, { error: redact(error.message || error) });
  }
}

export async function userSettingsSaveRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const payload = userSettingsTaskPayload(body);
  audit(ctx.config, req, "maps.user-settings.save", { scope: payload.scope, map: payload.map, partitionId: payload.partitionId, restartMode: payload.restartMode });
  return json(res, 202, { task: ctx.tasks.create("maps", "userSettingsSaveAndRestart", payload) });
}

export async function userSettingsResetRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "RESTORE MAP DEFAULTS") return json(res, 400, { error: "Confirmation phrase required: RESTORE MAP DEFAULTS" });
  const payload = userSettingsTaskPayload({ ...body, values: {} });
  audit(ctx.config, req, "maps.user-settings.reset", { scope: payload.scope, map: payload.map, partitionId: payload.partitionId, restartMode: payload.restartMode });
  return json(res, 202, { task: ctx.tasks.create("maps", "userSettingsResetAndRestart", payload) });
}

export async function userSettingsRawWriteRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const payload = userSettingsTaskPayload({ ...body, values: {}, content: String(body.content || "") });
  audit(ctx.config, req, "maps.user-settings.raw-write", { scope: payload.scope, map: payload.map, partitionId: payload.partitionId, restartMode: payload.restartMode });
  return json(res, 202, { task: ctx.tasks.create("maps", "userSettingsRawAndRestart", payload) });
}

function userSettingsTaskPayload(body) {
  const scope = ["engine", "global", "map", "partition", "profile"].includes(String(body.scope || "")) ? String(body.scope) : "map";
  const map = String(body.map || "Survival_1");
  const partitionId = String(body.partitionId || "").trim();
  const values = body.values && typeof body.values === "object" && !Array.isArray(body.values) ? body.values : {};
  return {
    scope,
    map,
    partitionId,
    values,
    content: String(body.content || ""),
    ...restartPayload(scope, map, partitionId)
  };
}

function restartPayload(scope, map, partitionId) {
  if (scope === "profile") return { restartMode: "stack", restartLabel: "all game services" };
  if (scope === "engine") return { restartMode: "stack", restartLabel: "all game services" };
  if (scope === "global") return { restartMode: "stack", restartLabel: "all game services" };
  const normalizedMap = String(map || "").toLowerCase();
  const normalizedPartition = String(partitionId || "").trim();
  if (normalizedMap === "survival_1" && (!normalizedPartition || normalizedPartition === "1")) {
    return { restartMode: "service", service: "survival", restartLabel: "Survival_1" };
  }
  if ((normalizedMap === "overmap" || normalizedMap.startsWith("deepdesert_")) && (!normalizedPartition || normalizedPartition === "2")) {
    return { restartMode: "service", service: "overmap", restartLabel: "Deep Desert" };
  }
  if (normalizedPartition) {
    return { restartMode: "respawn", target: normalizedPartition, restartLabel: `partition ${normalizedPartition}` };
  }
  return { restartMode: "respawn", target: map, restartLabel: map };
}
