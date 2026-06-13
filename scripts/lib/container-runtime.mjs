import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CONSOLE_CONTAINER = "redblink-dune-docker-console";
export const DUNE_NET = "dune-net";

export const CORE_STACK_CONTAINERS = [
  "dune-postgres",
  "dune-rmq-admin",
  "dune-rmq-game",
  "dune-text-router",
  "dune-director",
  "dune-server-gateway",
  "dune-server-survival-1",
  "dune-server-overmap"
];

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "..", "..");

export function normalizeComposePath(path) {
  const resolved = resolve(path);
  if (platform() === "win32") {
    return resolved.replace(/\\/g, "/");
  }
  return resolved;
}

export async function tryCliInfo(cli) {
  try {
    await execFileAsync(cli, ["info"], { timeout: 8000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export async function resolveContainerCli(env = process.env) {
  if (env.DUNE_CONTAINER_CLI) {
    const cli = env.DUNE_CONTAINER_CLI.trim();
    if (!await tryCliInfo(cli)) {
      throw new Error(`DUNE_CONTAINER_CLI=${cli} is set but ${cli} info failed.`);
    }
    return cli;
  }
  if (await tryCliInfo("docker")) return "docker";
  if (await tryCliInfo("podman")) return "podman";
  throw new Error("No working container CLI found. Install Docker or Podman and ensure the daemon is running.");
}

export async function resolveContainerSocket(cli, env = process.env) {
  if (env.DUNE_CONTAINER_SOCKET) {
    return env.DUNE_CONTAINER_SOCKET;
  }
  if (platform() === "win32") {
    const podmanSocket = await tryPodmanMachineSocket(cli);
    if (podmanSocket) return podmanSocket;
    return "\\\\.\\pipe\\docker_engine";
  }
  if (cli === "podman" || env.XDG_RUNTIME_DIR) {
    const runtimeDir = env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 0}`;
    const podmanSock = `${runtimeDir}/podman/podman.sock`;
    if (existsSync(podmanSock)) return podmanSock;
  }
  if (existsSync("/run/podman/podman.sock")) return "/run/podman/podman.sock";
  return "/var/run/docker.sock";
}

async function tryPodmanMachineSocket(cli) {
  if (cli !== "podman") return "";
  try {
    const { stdout } = await execFileAsync(cli, [
      "machine",
      "inspect",
      "--format",
      "{{.ConnectionInfo.PodmanSocket.Path}}"
    ], { timeout: 8000, windowsHide: true });
    const path = stdout.trim();
    return existsSync(path) ? path : "";
  } catch {
    return "";
  }
}

export function buildComposeEnv(repoRoot, runtime) {
  const hostRoot = normalizeComposePath(repoRoot);
  return {
  ...process.env,
  DUNE_HOST_REPO_ROOT: hostRoot,
  DUNE_CONTAINER_SOCKET: runtime.socket,
  DUNE_CONTAINER_CLI: runtime.cli
  };
}

export async function detectRuntime(repoRoot = REPO_ROOT, env = process.env) {
  const cli = await resolveContainerCli(env);
  const socket = await resolveContainerSocket(cli, env);
  const hostRepoRoot = normalizeComposePath(repoRoot);
  return { cli, socket, hostRepoRoot };
}

export async function ensureDuneNet(cli) {
  try {
    await execFileAsync(cli, ["network", "create", DUNE_NET], { timeout: 15000, windowsHide: true });
  } catch (error) {
    const message = String(error.stderr || error.message || error);
    if (!/already exists/i.test(message)) {
      throw new Error(`Failed to create network ${DUNE_NET}: ${message.trim()}`);
    }
  }
}

export async function listRunningContainers(cli) {
  const { stdout } = await execFileAsync(cli, ["ps", "--format", "{{.Names}}"], {
    timeout: 15000,
    windowsHide: true
  });
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export async function getContainerState(cli, name) {
  try {
    const { stdout } = await execFileAsync(cli, [
      "inspect",
      "--format",
      "{{.State.Status}}",
      name
    ], { timeout: 10000, windowsHide: true });
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function waitForContainers(cli, names, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const missing = new Set(names);
  while (Date.now() < deadline) {
    const running = await listRunningContainers(cli);
    for (const name of names) {
      if (running.includes(name)) missing.delete(name);
    }
    if (missing.size === 0) return { ok: true, missing: [] };
    await sleep(5000);
  }
  return { ok: false, missing: [...missing] };
}

export async function fetchContainerLogs(cli, name, tail = 50) {
  try {
    const { stdout } = await execFileAsync(cli, ["logs", "--tail", String(tail), name], {
      timeout: 15000,
      windowsHide: true
    });
    return stdout;
  } catch (error) {
    return String(error.stderr || error.message || error);
  }
}

export function runCompose(args, env, cwd = REPO_ROOT) {
  const cli = env.DUNE_CONTAINER_CLI || "docker";
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cli, ["compose", ...args], {
      cwd,
      env,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ code, stdout, stderr });
      else rejectPromise(Object.assign(new Error(`compose ${args.join(" ")} failed with exit ${code}`), { code, stdout, stderr }));
    });
  });
}

export async function pollHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  const intervalMs = options.intervalMs ?? 2000;
  const validate = options.validate ?? (async (res) => res.ok);
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (await validate(res)) return { ok: true, status: res.status };
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = String(error.message || error);
    }
    await sleep(intervalMs);
  }
  return { ok: false, error: lastError };
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
