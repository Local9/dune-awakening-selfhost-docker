import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { statfsSync } from "node:fs";
import { isSetupComplete } from "../app/context.js";
import { redact } from "../core/redact.js";
import { containerCommand } from "../platform/containerRuntime.js";

export function scheduleBootAutoStart(ctx) {
  if (ctx.config.mockMode || process.env.ADMIN_AUTO_START_STACK_ON_BOOT === "0") return;
  setTimeout(() => {
    void maybeAutoStartStackOnBoot(ctx);
  }, 5000).unref?.();
}

export async function maybeAutoStartStackOnBoot(ctx) {
  if (!isSetupComplete(ctx.config)) {
    console.log("Boot auto-start skipped because first-time setup is not complete.");
    return;
  }
  const mainContainers = [
    "dune-postgres",
    "dune-rmq-admin",
    "dune-rmq-game",
    "dune-text-router",
    "dune-director",
    "dune-server-gateway",
    "dune-server-survival-1",
    "dune-server-overmap"
  ];
  const names = await dockerPsNames(ctx).catch((error) => {
    console.error(`Boot auto-start skipped: ${redact(error.message || error)}`);
    return [];
  });
  if (mainContainers.some((name) => names.includes(name))) return;

  const child = spawn("runtime/scripts/start-all.sh", [], {
    cwd: ctx.config.repoRoot,
    shell: false,
    detached: true,
    env: { ...process.env }
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[boot-autostart] ${redact(chunk.toString())}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[boot-autostart] ${redact(chunk.toString())}`));
  child.on("error", (error) => console.error(`Boot auto-start failed: ${redact(error.message || error)}`));
  child.on("close", (code) => {
    if (code === 0) console.log("Boot auto-start completed.");
    else if (code === 2) console.log("Boot auto-start skipped because manual stop is active for this Linux boot.");
    else console.error(`Boot auto-start exited with code ${code}.`);
  });
}

export async function isInitializedStackPresent(ctx) {
  if (isSetupComplete(ctx.config)) return true;
  if (
    existsSync(resolve(ctx.config.generatedDir, "image-tags.env")) ||
    existsSync(resolve(ctx.config.generatedDir, "server-catalog.json")) ||
    existsSync(resolve(ctx.config.generatedDir, "partition-catalog.json"))
  ) return true;
  try {
    const names = await dockerPsNames(ctx);
    return names.some((name) => [
      "dune-postgres",
      "dune-rmq-admin",
      "dune-rmq-game",
      "dune-text-router",
      "dune-director",
      "dune-server-gateway",
      "dune-server-survival-1",
      "dune-server-overmap",
      "dune-orchestrator"
    ].includes(name));
  } catch {
    return false;
  }
}

export function dockerPsNames(ctx) {
  return new Promise((resolveNames, rejectNames) => {
    const child = spawn(containerCommand(), ["ps", "--format", "{{.Names}}"], { cwd: ctx.config.repoRoot, shell: false });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 10000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectNames);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        rejectNames(new Error(stderr.trim() || `docker ps failed with exit ${code}`));
        return;
      }
      resolveNames(stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    });
  });
}

export function runProcessText(ctx, command, args, timeoutMs = 10000) {
  return new Promise((resolveText, rejectText) => {
    const child = spawn(command, args, { cwd: ctx.config.repoRoot, shell: false });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectText);
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolveText(stdout);
      else rejectText(new Error(stderr.trim() || `${command} ${args.join(" ")} failed with exit ${code}`));
    });
  });
}

let previousCpuSample = null;

export async function performanceSnapshot(ctx) {
  const cpu = readCpuUsagePercent();
  const memory = readMemoryUsage();
  const disk = readDiskUsage(ctx.config.repoRoot);
  const uptimeSeconds = readHostUptimeSeconds();
  return {
    cpuPercent: cpu,
    memory,
    disk,
    uptimeSeconds,
    uptime: formatUptime(uptimeSeconds),
    sampledAt: new Date().toISOString()
  };
}

function readCpuUsagePercent() {
  try {
    const line = readFileSync("/proc/stat", "utf8").split(/\r?\n/).find((row) => row.startsWith("cpu "));
    if (!line) return null;
    const values = line.trim().split(/\s+/).slice(1).map((value) => Number(value) || 0);
    const idle = (values[3] || 0) + (values[4] || 0);
    const total = values.reduce((sum, value) => sum + value, 0);
    const current = { idle, total };
    if (!previousCpuSample) {
      previousCpuSample = current;
      return null;
    }
    const totalDelta = current.total - previousCpuSample.total;
    const idleDelta = current.idle - previousCpuSample.idle;
    previousCpuSample = current;
    if (totalDelta <= 0) return null;
    return roundPercent(((totalDelta - idleDelta) / totalDelta) * 100);
  } catch {
    return null;
  }
}

function readMemoryUsage() {
  try {
    const rows = Object.fromEntries(readFileSync("/proc/meminfo", "utf8").split(/\r?\n/).map((line) => {
      const match = line.match(/^([^:]+):\s+(\d+)/);
      return match ? [match[1], Number(match[2]) * 1024] : null;
    }).filter(Boolean));
    const total = rows.MemTotal || 0;
    const available = rows.MemAvailable || 0;
    const used = Math.max(0, total - available);
    return {
      usedBytes: used,
      totalBytes: total,
      availableBytes: available,
      percent: total ? roundPercent((used / total) * 100) : null
    };
  } catch {
    return {
      usedBytes: 0,
      totalBytes: 0,
      availableBytes: 0,
      percent: null
    };
  }
}

function readDiskUsage(path) {
  const stats = statfsSync(path || ".");
  const total = Number(stats.blocks) * Number(stats.bsize);
  const free = Number(stats.bavail) * Number(stats.bsize);
  const used = Math.max(0, total - free);
  return {
    usedBytes: used,
    totalBytes: total,
    freeBytes: free,
    percent: total ? roundPercent((used / total) * 100) : null
  };
}

function readHostUptimeSeconds() {
  try {
    const value = readFileSync("/proc/uptime", "utf8").trim().split(/\s+/)[0];
    return Math.max(0, Math.floor(Number(value) || 0));
  } catch {
    return 0;
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

function roundPercent(value) {
  return Math.round(value * 10) / 10;
}
