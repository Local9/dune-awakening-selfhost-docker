#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { REPO_ROOT } from "./lib/container-runtime.mjs";
import {
  DEFAULT_WEB_PORT,
  prepareContainerRuntime,
  startConsoleContainer,
  waitForConsoleHealth
} from "./lib/console-install.mjs";
import { requireWslDelegation } from "./lib/wsl-path.mjs";

requireWslDelegation();

async function main() {
  const [command] = process.argv.slice(2);
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  console.log("Starting Dune Docker Console installer.\n");
  console.log("=== Detecting container runtime ===");
  const runtime = await prepareContainerRuntime();
  console.log(`Container CLI: ${runtime.cli}`);
  if (runtime.socket) {
    console.log(`Container socket: ${runtime.socket}`);
  }

  console.log("=== Starting Web UI ===");
  await startConsoleContainer(runtime);
  console.log("=== Waiting for admin panel ===");
  await waitForConsoleHealth(runtime.executable);
  await showFinish();
}

function printHelp() {
  console.log(`
Dune Docker Console — Windows / cross-platform web UI installer

Starts the admin panel only (same as install.sh on Linux).
Use qa-console for full-stack local QA with the game server.

Usage:
  node scripts/install-console.mjs
  .\\install.ps1

On Windows, use install.ps1 (delegates into WSL2).

Environment:
  DUNE_CONTAINER_CLI       Force podman or docker (auto-detect prefers podman)
  DUNE_CONTAINER_SOCKET    Container socket path override
  DUNE_HOST_REPO_ROOT      Host repo path for bind mounts
  INSTALL_PANEL_URL        URL for health check (default http://127.0.0.1:8088)
`);
}

async function showFinish() {
  const passwordFile = resolve(REPO_ROOT, "runtime/secrets/admin-web-password.txt");
  const adminPassword = await readAdminPassword(passwordFile);
  const lanIp = pickLanIPv4();
  const publicIp = await detectPublicIPv4();

  console.log("");
  console.log("Dune Docker Console is ready.");
  console.log("");
  console.log("Open the Web UI in your browser:");
  console.log(`  http://127.0.0.1:${DEFAULT_WEB_PORT}`);
  if (lanIp) {
    console.log(`  Same network: http://${lanIp}:${DEFAULT_WEB_PORT}`);
  }
  if (publicIp && publicIp !== lanIp) {
    console.log(`  Public:       http://${publicIp}:${DEFAULT_WEB_PORT}`);
  }
  console.log("");
  console.log("Finish setup in the browser wizard. For the full game stack on Windows:");
  console.log("  .\\scripts\\qa-console.ps1 up");
  console.log("");
  if (adminPassword) {
    console.log("Your first admin password:");
    console.log(`  ${adminPassword}`);
  } else if (process.env.ADMIN_PASSWORD) {
    console.log("Admin password: set via ADMIN_PASSWORD in .env");
  } else {
    console.log("Admin password file is not ready yet. Check runtime/secrets/admin-web-password.txt in a few seconds.");
  }
  console.log("");
}

async function readAdminPassword(passwordFile) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (existsSync(passwordFile)) {
      const value = readFileSync(passwordFile, "utf8").trim();
      if (value) return value;
    }
    await sleep(1000);
  }
  return "";
}

function pickLanIPv4() {
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(entry.address)) {
        return entry.address;
      }
    }
  }
  return "";
}

async function detectPublicIPv4() {
  try {
    const res = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(5000) });
    const ip = (await res.text()).trim();
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : "";
  } catch {
    return "";
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
