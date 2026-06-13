#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { runBash } from "./lib/bash-runner.mjs";
import { resolveQaFuncomToken } from "./lib/qa-token.mjs";
import {
  CONSOLE_CONTAINER,
  CORE_STACK_CONTAINERS,
  REPO_ROOT,
  buildComposeEnv,
  detectRuntime,
  ensureDuneNet,
  fetchContainerLogs,
  getContainerState,
  listRunningContainers,
  pollHttp,
  runCompose,
  waitForContainers
} from "./lib/container-runtime.mjs";

const COMPOSE_FILES = ["-f", "docker-compose.web.yml", "-f", "docker-compose.qa.yml"];
const PANEL_URL = process.env.QA_PANEL_URL || "http://127.0.0.1:8088";
const PANEL_TIMEOUT_MS = Number(process.env.QA_PANEL_TIMEOUT_MS || 120000);
const STACK_TIMEOUT_MS = Number(process.env.QA_STACK_TIMEOUT_MS || 600000);
const READY_TIMEOUT_MS = Number(process.env.QA_READY_TIMEOUT_MS || 7200000);

const paths = {
  env: resolve(REPO_ROOT, ".env"),
  envQa: resolve(REPO_ROOT, ".env.qa.example"),
  envExample: resolve(REPO_ROOT, ".env.example"),
  token: resolve(REPO_ROOT, "runtime/secrets/funcom-token.txt"),
  battlegroup: resolve(REPO_ROOT, "runtime/generated/battlegroup.env"),
  generated: resolve(REPO_ROOT, "runtime/generated"),
  secrets: resolve(REPO_ROOT, "runtime/secrets"),
  password: resolve(REPO_ROOT, "runtime/secrets/admin-web-password.txt"),
  imageTags: resolve(REPO_ROOT, "runtime/generated/image-tags.env"),
  serverCatalog: resolve(REPO_ROOT, "runtime/generated/server-catalog.json"),
  partitionCatalog: resolve(REPO_ROOT, "runtime/generated/partition-catalog.json")
};

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((arg) => arg.startsWith("--")));
  const positional = rest.filter((arg) => !arg.startsWith("--"));

  switch (command || "help") {
    case "up":
      await cmdUp();
      break;
    case "down":
      await cmdDown(flags.has("--all"));
      break;
    case "logs":
      await cmdLogs(flags.has("--stack"));
      break;
    case "check":
      await cmdCheck();
      break;
    case "wait-ready":
      await cmdWaitReady();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
Dune Docker Console — end-to-end production QA

Usage:
  node scripts/qa-console.mjs up
  node scripts/qa-console.mjs down [--all]
  node scripts/qa-console.mjs logs [--stack]
  node scripts/qa-console.mjs check
  node scripts/qa-console.mjs wait-ready

Environment:
  DUNE_QA_FUNCOM_TOKEN     Required for up and wait-ready (.env or env var; no action if unset)
  QA_PANEL_TIMEOUT_MS      Admin panel wait (default 120000)
  QA_STACK_TIMEOUT_MS      Core stack wait (default 600000)
  QA_READY_TIMEOUT_MS      dune ready wait (default 7200000)
`);
}

async function cmdUp() {
  const qaToken = requireQaFuncomToken();
  console.log("=== QA: detecting container runtime ===");
  const runtime = await detectRuntime();
  const composeEnv = buildComposeEnv(REPO_ROOT, runtime);
  await ensureDuneNet(runtime.cli);

  console.log("=== QA: bootstrap setup (non-destructive) ===");
  await bootstrapSetup(composeEnv, qaToken);

  console.log("=== QA: starting Dune stack if needed ===");
  await ensureStack(composeEnv);

  console.log("=== QA: starting production admin console ===");
  await runCompose([...COMPOSE_FILES, "up", "-d", "--build", CONSOLE_CONTAINER], composeEnv);

  console.log("=== QA: verifying admin panel ===");
  await verifyAdminPanel(runtime.cli);

  console.log("=== QA: verifying core stack ===");
  const stack = await waitForContainers(runtime.cli, CORE_STACK_CONTAINERS, STACK_TIMEOUT_MS);
  if (!stack.ok) {
    await failPhase("core stack", runtime.cli, CONSOLE_CONTAINER, `Missing containers: ${stack.missing.join(", ")}`);
  }

  console.log("=== QA: API smoke checks ===");
  await apiSmokeChecks();

  console.log("");
  console.log("QA ready — admin panel: " + PANEL_URL);
  if (existsSync(paths.password)) {
    console.log("Admin password file: runtime/secrets/admin-web-password.txt");
  } else if (process.env.ADMIN_PASSWORD) {
    console.log("Admin password: set via ADMIN_PASSWORD environment variable");
  }
  console.log("Optional: node scripts/qa-console.mjs wait-ready");
}

async function cmdDown(all) {
  const runtime = await detectRuntime();
  const composeEnv = buildComposeEnv(REPO_ROOT, runtime);
  try {
    await runCompose([...COMPOSE_FILES, "down"], composeEnv);
  } catch (error) {
    console.error(error.message);
  }
  if (all) {
    console.log("=== QA: stopping Dune stack ===");
    await runBash("runtime/scripts/dune", ["stop"], bashEnv(composeEnv));
  }
}

async function cmdLogs(stack) {
  const runtime = await detectRuntime();
  if (stack) {
    for (const name of CORE_STACK_CONTAINERS) {
      console.log(`\n--- ${name} ---`);
      console.log(await fetchContainerLogs(runtime.cli, name, 80));
    }
    return;
  }
  console.log(await fetchContainerLogs(runtime.cli, CONSOLE_CONTAINER, 200));
}

async function cmdCheck() {
  try {
    const runtime = await detectRuntime();
    console.log(`Container CLI: ${runtime.cli}`);
    console.log(`Socket: ${runtime.socket}`);
    console.log(`Host repo root: ${runtime.hostRepoRoot}`);
    console.log(`Setup files: env=${existsSync(paths.env)} token=${existsSync(paths.token)} battlegroup=${existsSync(paths.battlegroup)}`);
    const running = await listRunningContainers(runtime.cli);
    const core = CORE_STACK_CONTAINERS.filter((name) => running.includes(name));
    console.log(`Core stack running (${core.length}/${CORE_STACK_CONTAINERS.length}): ${core.join(", ") || "none"}`);
    const panelState = await getContainerState(runtime.cli, CONSOLE_CONTAINER);
    console.log(`Console container: ${panelState || "not found"}`);
    const health = await pollHttp(`${PANEL_URL}/api/health`, { timeoutMs: 5000, intervalMs: 500 });
    console.log(`Admin /api/health: ${health.ok ? "ok" : health.error || "failed"}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

async function cmdWaitReady() {
  requireQaFuncomToken();
  const composeEnv = buildComposeEnv(REPO_ROOT, await detectRuntime());
  const deadline = Date.now() + READY_TIMEOUT_MS;
  console.log("Waiting for dune ready (this can take a long time on first install)...");
  while (Date.now() < deadline) {
    try {
      const result = await runBash("runtime/scripts/dune", ["ready"], bashEnv(composeEnv));
      if (!/\bFAIL\b/.test(result.stdout)) {
        console.log("dune ready: no FAIL lines detected.");
        console.log(result.stdout);
        return;
      }
      console.log("dune ready still reporting FAIL; retrying in 30s...");
    } catch (error) {
      console.log(`dune ready failed (${error.message}); retrying in 30s...`);
    }
    await sleep(30000);
  }
  await failPhase("dune ready", (await detectRuntime()).cli, "dune-director", "Timed out waiting for dune ready");
}

function isSetupComplete() {
  if (existsSync(paths.env) && existsSync(paths.token) && existsSync(paths.battlegroup)) return true;
  if (existsSync(paths.imageTags) || existsSync(paths.serverCatalog) || existsSync(paths.partitionCatalog)) return true;
  return false;
}

function requireQaFuncomToken() {
  const token = resolveQaFuncomToken({ envPath: paths.env });
  if (!token) {
    console.error("DUNE_QA_FUNCOM_TOKEN is required. QA did not start any services.");
    console.error("Set it in .env or the environment:");
    console.error("  .env:       DUNE_QA_FUNCOM_TOKEN=<your-funcom-token>");
    console.error("  PowerShell: $env:DUNE_QA_FUNCOM_TOKEN = \"<your-funcom-token>\"");
    console.error("  bash:       export DUNE_QA_FUNCOM_TOKEN=\"<your-funcom-token>\"");
    process.exit(1);
  }
  return token;
}

async function bootstrapSetup(composeEnv, qaToken) {
  if (isSetupComplete()) {
    console.log("Setup already complete; skipping bootstrap.");
    return;
  }

  mkdirSync(paths.secrets, { recursive: true });
  mkdirSync(paths.generated, { recursive: true });

  if (!existsSync(paths.env)) {
    const source = existsSync(paths.envQa) ? paths.envQa : paths.envExample;
    if (!existsSync(source)) {
      throw new Error("No .env, .env.qa.example, or .env.example found.");
    }
    copyFileSync(source, paths.env);
    console.log(`Created .env from ${source.split(/[/\\]/).pop()}`);
  }

  if (!existsSync(paths.token)) {
    writeFileSync(paths.token, `${qaToken}\n`, { mode: 0o600 });
    try { chmodSync(paths.token, 0o600); } catch {}
    console.log("Created runtime/secrets/funcom-token.txt from DUNE_QA_FUNCOM_TOKEN");
  }

  if (!existsSync(paths.battlegroup)) {
    console.log("Running non-interactive init (DUNE_INIT_ASSUME_YES=1)...");
    await runBash("runtime/scripts/init.sh", [], {
      ...bashEnv(composeEnv),
      DUNE_INIT_ASSUME_YES: "1"
    });
  }
}

async function ensureStack(composeEnv) {
  const runtime = await detectRuntime();
  const running = await listRunningContainers(runtime.cli);
  const missing = CORE_STACK_CONTAINERS.filter((name) => !running.includes(name));
  if (missing.length === 0) {
    console.log("Core stack already running.");
    return;
  }
  console.log(`Starting stack (missing: ${missing.join(", ")})...`);
  await runBash("runtime/scripts/dune", ["start"], {
    ...bashEnv(composeEnv),
    DUNE_IGNORE_MANUAL_STOP: "1"
  });
  const wait = await waitForContainers(runtime.cli, CORE_STACK_CONTAINERS, STACK_TIMEOUT_MS);
  if (!wait.ok) {
    await failPhase("stack start", runtime.cli, missing[0] || "dune-postgres", `Still missing: ${wait.missing.join(", ")}`);
  }
}

async function verifyAdminPanel(cli) {
  const state = await getContainerState(cli, CONSOLE_CONTAINER);
  if (state !== "running") {
    await failPhase("admin panel", cli, CONSOLE_CONTAINER, `Container state: ${state || "missing"}`);
  }

  const health = await pollHttp(`${PANEL_URL}/api/health`, {
    timeoutMs: PANEL_TIMEOUT_MS,
    validate: async (res) => {
      if (!res.ok) return false;
      const body = await res.json();
      return body?.ok === true;
    }
  });
  if (!health.ok) {
    await failPhase("admin panel health", cli, CONSOLE_CONTAINER, health.error || "health check failed");
  }

  const ui = await pollHttp(`${PANEL_URL}/`, {
    timeoutMs: 30000,
    validate: async (res) => {
      if (!res.ok) return false;
      const body = await res.text();
      return /<!doctype html/i.test(body);
    }
  });
  if (!ui.ok) {
    await failPhase("admin panel UI", cli, CONSOLE_CONTAINER, ui.error || "static UI check failed");
  }
}

async function apiSmokeChecks() {
  const setup = await pollHttp(`${PANEL_URL}/api/setup/state`, {
    timeoutMs: 30000,
    validate: async (res) => res.ok
  });
  if (!setup.ok) {
    throw new Error(`GET /api/setup/state failed: ${setup.error}`);
  }
  const body = await (await fetch(`${PANEL_URL}/api/setup/state`)).json();
  if (!body?.files?.complete && !body?.files?.initialized) {
    throw new Error("Setup state is not complete or initialized after QA up.");
  }

  const composeEnv = buildComposeEnv(REPO_ROOT, await detectRuntime());
  await runBash("runtime/scripts/dune", ["status"], bashEnv(composeEnv));
}

async function failPhase(phase, cli, logContainer, detail) {
  console.error(`\nQA failed during: ${phase}`);
  console.error(detail);
  console.error("\nRecent logs:");
  console.error(await fetchContainerLogs(cli, logContainer, 50));
  process.exit(1);
}

function bashEnv(composeEnv) {
  return {
    DUNE_HOST_REPO_ROOT: composeEnv.DUNE_HOST_REPO_ROOT,
    DUNE_CONTAINER_CLI: composeEnv.DUNE_CONTAINER_CLI
  };
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
