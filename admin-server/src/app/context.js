import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { createAuth } from "../core/auth.js";
import { createLoginRateLimiter } from "../core/rateLimit.js";
import { TaskManager } from "../platform/tasks.js";
import { createDb } from "../core/db.js";
import { createSwapMemoryState } from "../services/swapMemory.js";

function loadJourneyTagsData(config) {
  try {
    return JSON.parse(readFileSync(join(config.repoRoot, "runtime", "data", "journey-tags.json"), "utf8"));
  } catch {
    return { journey_node_tags: {} };
  }
}

export function createAppContext() {
  const config = loadConfig();
  const auth = createAuth(config);
  const tasks = new TaskManager(config);
  let db = createDb(config);
  return {
    config,
    auth,
    tasks,
    getDb: () => db,
    setDb: (next) => { db = next; },
    journeyTagsData: loadJourneyTagsData(config),
    loginRateLimiter: createLoginRateLimiter(),
    carePackageAuto: { running: false, lastRun: 0 },
    swapMemory: createSwapMemoryState()
  };
}

export function quoteEnv(value) {
  if (/^[A-Za-z0-9_.:-]+$/.test(value)) return value;
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function loginRateLimitKey(req) {
  return req.socket?.remoteAddress || "unknown";
}

export function isSetupComplete(config) {
  return existsSync(resolve(config.repoRoot, ".env"))
    && existsSync(resolve(config.secretsDir, "funcom-token.txt"))
    && existsSync(resolve(config.generatedDir, "battlegroup.env"));
}
