import { audit } from "../core/audit.js";
import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import { buildDuneArgs, runDune } from "../platform/runner.js";
import { parseMemoryStatusRows } from "../platform/statusParsers.js";
import { runProcessText } from "./boot.js";
import { readJson, task } from "../lib/apiHelpers.js";

export const SWAP_MEMORY_INTERVAL_MS = 10000;
export const SWAP_MEMORY_HIGH_WATERMARK = 90;
export const SWAP_MEMORY_DONOR_MAX_PERCENT = 55;
export const SWAP_MEMORY_EMERGENCY_DONOR_MAX_PERCENT = 70;
export const SWAP_MEMORY_DONOR_POST_TRANSFER_MAX_PERCENT = 80;
export const SWAP_MEMORY_CHUNK_BYTES = 1024 ** 3;
export const SWAP_MEMORY_MIN_HEADROOM_BYTES = 1024 ** 3;

export function createSwapMemoryState() {
  return {
    enabled: false,
    running: false,
    baselineLimits: new Map(),
    lastMessage: "Swap Memory is off.",
    lastAction: "",
    lastError: "",
    updatedAt: null
  };
}

export function publicSwapMemoryState(ctx) {
  const state = ctx.swapMemory;
  return {
    enabled: state.enabled,
    running: state.running,
    lastMessage: state.lastMessage,
    lastAction: state.lastAction,
    lastError: state.lastError,
    updatedAt: state.updatedAt
  };
}

export async function swapMemoryRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const enabled = Boolean(body.enabled);
  const state = ctx.swapMemory;
  if (enabled === state.enabled) return json(res, 200, publicSwapMemoryState(ctx));

  state.enabled = enabled;
  state.lastError = "";
  state.updatedAt = new Date().toISOString();

  if (enabled) {
    state.baselineLimits.clear();
    state.lastMessage = "Swap Memory is monitoring running maps";
    await captureSwapMemoryBaseline(ctx);
    void runSwapMemoryTick(ctx);
  } else {
    state.lastMessage = "Restoring configured memory limits.";
    await restoreSwapMemoryBaseline(ctx);
    state.baselineLimits.clear();
    state.lastMessage = "Swap Memory is off. Configured memory limits are active.";
  }

  audit(ctx.config, req, "maps.memory.swap", { enabled });
  return json(res, 200, publicSwapMemoryState(ctx));
}

export async function liveMapMemoryRoute(ctx, res) {
  try {
    const rows = await readLiveMapMemoryRows(ctx);
    return json(res, 200, { rows, sampledAt: new Date().toISOString() });
  } catch (error) {
    return json(res, 200, { rows: [], sampledAt: new Date().toISOString(), error: redact(error.message || error) });
  }
}

export async function readLiveMapMemoryRows(ctx) {
  const stdout = await runProcessText(ctx, "docker", ["stats", "--no-stream", "--format", "{{json .}}"], 10000);
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map(parseDockerStatsRow).filter(Boolean);
}

async function captureSwapMemoryBaseline(ctx) {
  const rows = await readLiveMapMemoryRows(ctx).catch(() => []);
  for (const row of rows) {
    if (row.limitBytes > 0 && !ctx.swapMemory.baselineLimits.has(row.container)) {
      ctx.swapMemory.baselineLimits.set(row.container, row.limitBytes);
    }
  }
}

async function restoreSwapMemoryBaseline(ctx) {
  const configuredLimits = await configuredMemoryLimitsByContainer(ctx).catch(() => new Map());
  const restoreTargets = new Map(ctx.swapMemory.baselineLimits);
  for (const [container, limitBytes] of configuredLimits.entries()) {
    restoreTargets.set(container, limitBytes);
  }
  for (const [container, limitBytes] of restoreTargets.entries()) {
    if (limitBytes > 0) {
      await dockerUpdateMemoryLimit(ctx, container, limitBytes).catch((error) => {
        ctx.swapMemory.lastError = redact(error.message || error);
      });
    }
  }
  ctx.swapMemory.updatedAt = new Date().toISOString();
}

export async function runSwapMemoryTick(ctx) {
  const state = ctx.swapMemory;
  if (!state.enabled || state.running) return;
  state.running = true;
  try {
    const rows = (await readLiveMapMemoryRows(ctx)).filter((row) => row.usedBytes > 0 && row.limitBytes > 0);
    for (const row of rows) {
      if (!state.baselineLimits.has(row.container)) state.baselineLimits.set(row.container, row.limitBytes);
    }
    const target = rows.filter((row) => row.percent >= SWAP_MEMORY_HIGH_WATERMARK).sort((a, b) => b.percent - a.percent)[0];
    if (!target) {
      state.lastMessage = "Swap Memory is monitoring running maps";
      state.lastAction = "";
      state.lastError = "";
      state.updatedAt = new Date().toISOString();
      return;
    }

    const donor = selectSwapMemoryDonor(rows, target);

    if (!donor) {
      state.lastMessage = `${target.map} is above ${SWAP_MEMORY_HIGH_WATERMARK}% memory, but no running map has enough spare memory to donate safely`;
      state.lastAction = "";
      state.lastError = "";
      state.updatedAt = new Date().toISOString();
      return;
    }

    const donorLimit = donor.limitBytes - SWAP_MEMORY_CHUNK_BYTES;
    const targetLimit = target.limitBytes + SWAP_MEMORY_CHUNK_BYTES;
    await dockerUpdateMemoryLimit(ctx, target.container, targetLimit);
    await dockerUpdateMemoryLimit(ctx, donor.container, donorLimit);
    state.lastMessage = `Moved 1 GB from ${donor.map} to ${target.map}`;
    state.lastAction = `${donor.container} -> ${target.container}`;
    state.lastError = "";
    state.updatedAt = new Date().toISOString();
  } catch (error) {
    state.lastError = redact(error.message || error);
    state.lastMessage = "Swap Memory could not rebalance memory.";
    state.updatedAt = new Date().toISOString();
  } finally {
    state.running = false;
  }
}

async function configuredMemoryLimitsByContainer(ctx) {
  const [rows, result] = await Promise.all([
    readLiveMapMemoryRows(ctx),
    runDune(ctx.config, buildDuneArgs("memoryStatus"), { timeoutMs: 10000 })
  ]);
  const configuredRows = parseMemoryStatusRows(result.stdout || "");
  const byMap = new Map(configuredRows.map((row) => [String(row.map), parseMemorySettingBytes(row.memory)]).filter(([, bytes]) => bytes > 0));
  const limits = new Map();
  for (const row of rows) {
    const key = memoryTargetForContainer(row.container);
    const configured = byMap.get(key);
    if (configured > 0) limits.set(row.container, configured);
  }
  return limits;
}

function memoryTargetForContainer(container) {
  if (container === "dune-server-survival-1") return "Survival_1";
  const survivalPartition = String(container || "").match(/^dune-server-survival-1-(\d+)$/);
  if (survivalPartition) return `Survival_1:${survivalPartition[1]}`;
  if (container === "dune-server-overmap") return "Overmap";
  return mapFromContainerName(container);
}

export function parseMemorySettingBytes(value) {
  const match = String(value || "").match(/(\d+(?:\.\d+)?)\s*([KMGT]i?B|[KMGT]B?|[kmgt]i?b|[kmgt]b?)/);
  return match ? parseDockerBytes(`${match[1]}${match[2]}`) : 0;
}

export function selectSwapMemoryDonor(rows, target) {
  const candidates = rows
    .filter((row) => row.container !== target.container)
    .filter((row) => row.limitBytes - SWAP_MEMORY_CHUNK_BYTES >= minimumSwapLimit(row))
    .filter((row) => percentAfterMemoryDonation(row) <= SWAP_MEMORY_DONOR_POST_TRANSFER_MAX_PERCENT);
  const normal = candidates
    .filter((row) => row.percent <= SWAP_MEMORY_DONOR_MAX_PERCENT)
    .sort((a, b) => a.percent - b.percent || b.limitBytes - a.limitBytes)[0];
  if (normal) return normal;
  return candidates
    .filter((row) => row.percent <= SWAP_MEMORY_EMERGENCY_DONOR_MAX_PERCENT)
    .sort((a, b) => a.percent - b.percent || b.limitBytes - a.limitBytes)[0] || null;
}

export function percentAfterMemoryDonation(row) {
  const nextLimit = row.limitBytes - SWAP_MEMORY_CHUNK_BYTES;
  return nextLimit > 0 ? (row.usedBytes / nextLimit) * 100 : 100;
}

function minimumSwapLimit(row) {
  return Math.max(row.usedBytes + SWAP_MEMORY_MIN_HEADROOM_BYTES, Math.ceil(row.usedBytes * 1.25), SWAP_MEMORY_CHUNK_BYTES);
}

async function dockerUpdateMemoryLimit(ctx, container, limitBytes) {
  await runProcessText(ctx, "docker", ["update", "--memory", dockerMemoryArg(limitBytes), "--memory-reservation", dockerMemoryArg(limitBytes), container], 15000);
}

function dockerMemoryArg(bytes) {
  return `${Math.max(256, Math.round(bytes / (1024 ** 2)))}m`;
}

function parseDockerStatsRow(line) {
  try {
    const row = JSON.parse(line);
    const name = String(row.Name || row.Container || "");
    if (!name.startsWith("dune-server-")) return null;
    const memory = parseMemoryUsage(row.MemUsage || row.MemUsageBytes || "");
    return {
      container: name,
      map: mapFromContainerName(name),
      usedBytes: memory.usedBytes,
      limitBytes: memory.limitBytes,
      percent: Number.parseFloat(String(row.MemPerc || "").replace("%", "")) || memory.percent || 0,
      raw: String(row.MemUsage || "")
    };
  } catch {
    return null;
  }
}

function parseMemoryUsage(value) {
  const [usedRaw, limitRaw] = String(value || "").split("/").map((part) => part.trim());
  const usedBytes = parseDockerBytes(usedRaw);
  const limitBytes = parseDockerBytes(limitRaw);
  return {
    usedBytes,
    limitBytes,
    percent: limitBytes > 0 ? roundPercent((usedBytes / limitBytes) * 100) : 0
  };
}

export function parseDockerBytes(value) {
  const match = String(value || "").match(/^([\d.]+)\s*([KMGTPE]?i?B)?$/i);
  if (!match) return 0;
  const amount = Number.parseFloat(match[1]) || 0;
  const unit = String(match[2] || "B").toLowerCase();
  const multipliers = { b: 1, kb: 1000, kib: 1024, mb: 1000 ** 2, mib: 1024 ** 2, gb: 1000 ** 3, gib: 1024 ** 3, tb: 1000 ** 4, tib: 1024 ** 4 };
  return Math.round(amount * (multipliers[unit] || 1));
}

function mapFromContainerName(name) {
  if (name === "dune-server-survival-1") return "Survival_1";
  if (/^dune-server-survival-1-\d+$/.test(name)) return `Survival_1 partition ${name.split("-").pop()}`;
  if (name === "dune-server-overmap") return "Overmap";
  return name.replace(/^dune-server-/, "");
}

function roundPercent(value) {
  return Math.round(value * 10) / 10;
}

export async function memoryRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const operation = body.action === "unset" ? "memoryUnset" : "memorySet";
  const phrase = operation === "memoryUnset" ? "UNSET MAP MEMORY" : "SET MAP MEMORY";
  if (body.confirmation !== phrase) return json(res, 400, { error: `Confirmation phrase required: ${phrase}` });
  return task(ctx, req, res, "maps", operation, body);
}
