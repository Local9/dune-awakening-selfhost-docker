import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  CONSOLE_CONTAINER,
  REPO_ROOT,
  buildComposeEnv,
  detectRuntime,
  ensureDuneNet,
  getContainerState,
  pollHttp,
  runCompose
} from "./container-runtime.mjs";

const execFileAsync = promisify(execFile);

export const WEB_SERVICE = "redblink-dune-docker-console";
export const DEFAULT_WEB_PORT = 8088;
export const DEFAULT_PANEL_URL = process.env.INSTALL_PANEL_URL
  || process.env.QA_PANEL_URL
  || `http://127.0.0.1:${DEFAULT_WEB_PORT}`;

export function webComposeFiles(repoRoot = REPO_ROOT, { qa = false } = {}) {
  const files = ["-f", "docker-compose.web.yml"];
  if (qa) {
    files.push("-f", "docker-compose.qa.yml");
  }
  if (existsSync(resolve(repoRoot, "docker-compose.traefik.yml"))) {
    files.push("-f", "docker-compose.traefik.yml");
  }
  if (existsSync(resolve(repoRoot, "docker-compose.monitoring.yml")) && process.env.GRAFANA_ADMIN_PASSWORD) {
    files.push("-f", "docker-compose.monitoring.yml");
  }
  return files;
}

export async function prepareContainerRuntime(env = process.env, repoRoot = REPO_ROOT) {
  const runtime = await detectRuntime(repoRoot, env);
  await ensureRuntimeRunning(runtime);
  await ensureCompose(runtime);
  return runtime;
}

export async function ensureRuntimeRunning(runtime) {
  if (await runtimeInfoOk(runtime.executable)) {
    return;
  }

  if (runtime.cli === "podman") {
    console.log("=== Starting Podman machine ===");
    try {
      await execFileAsync(runtime.executable, ["machine", "start"], {
        timeout: 300000,
        windowsHide: true
      });
    } catch (error) {
      throw new Error(formatRuntimeStartHelp(runtime, error));
    }
    if (!await runtimeInfoOk(runtime.executable)) {
      throw new Error(formatRuntimeStartHelp(runtime));
    }
    return;
  }

  throw new Error(formatRuntimeStartHelp(runtime));
}

export async function ensureCompose(runtime) {
  try {
    await execFileAsync(runtime.executable, ["compose", "version"], {
      timeout: 15000,
      windowsHide: true
    });
  } catch (error) {
    throw new Error([
      "Compose is not available for the selected container CLI.",
      runtime.cli === "podman"
        ? "Install Podman Desktop with the Compose extension enabled."
        : "Install Docker Desktop with Compose v2.",
      String(error.stderr || error.message || error).trim()
    ].filter(Boolean).join("\n"));
  }
}

export async function startConsoleContainer(runtime, { qa = false, repoRoot = REPO_ROOT } = {}) {
  const composeEnv = buildComposeEnv(repoRoot, runtime);
  await ensureDuneNet(runtime.executable);
  await runCompose(
    [...webComposeFiles(repoRoot, { qa }), "up", "-d", "--build", WEB_SERVICE],
    composeEnv
  );
  return composeEnv;
}

export async function waitForConsoleHealth(executable, options = {}) {
  const panelUrl = options.panelUrl || DEFAULT_PANEL_URL;
  const timeoutMs = options.timeoutMs ?? 120000;
  const checkUi = options.checkUi ?? false;

  const running = await waitForContainerRunning(executable, CONSOLE_CONTAINER, timeoutMs);
  if (!running) {
    throw new Error(`Console container ${CONSOLE_CONTAINER} did not reach running state.`);
  }

  const health = await pollHttp(`${panelUrl}/api/health`, {
    timeoutMs,
    validate: async (res) => {
      if (!res.ok) return false;
      const body = await res.json();
      return body?.ok === true;
    }
  });
  if (!health.ok) {
    throw new Error(`Admin panel health check failed: ${health.error || "unknown error"}`);
  }

  if (checkUi) {
    const ui = await pollHttp(`${panelUrl}/`, {
      timeoutMs: Math.min(timeoutMs, 30000),
      validate: async (res) => {
        if (!res.ok) return false;
        const body = await res.text();
        return /<!doctype html/i.test(body);
      }
    });
    if (!ui.ok) {
      throw new Error(`Admin panel UI check failed: ${ui.error || "unknown error"}`);
    }
  }
}

async function runtimeInfoOk(executable) {
  try {
    await execFileAsync(executable, ["info"], { timeout: 15000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function formatRuntimeStartHelp(runtime, error) {
  const detail = error ? `\n${String(error.stderr || error.message || error).trim()}` : "";
  if (runtime.cli === "podman") {
    return [
      "Podman is installed but the engine is not reachable.",
      "Start Podman Desktop or run: podman machine start",
      detail
    ].filter(Boolean).join("\n");
  }
  return [
    "Docker is installed but the engine is not reachable.",
    "Start Docker Desktop and wait until it reports running, then retry.",
    detail
  ].filter(Boolean).join("\n");
}

async function waitForContainerRunning(executable, name, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await getContainerState(executable, name)) === "running") {
      return true;
    }
    await sleep(2000);
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
