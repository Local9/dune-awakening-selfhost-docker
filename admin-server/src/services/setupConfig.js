import { existsSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicConfig } from "../core/config.js";
import { audit } from "../core/audit.js";
import { json } from "../core/auth.js";
import { runDockerLogs } from "../platform/runner.js";
import { createDb } from "../core/db.js";
import * as duneDb from "../domain/duneDb.js";
import { quoteEnv } from "../app/context.js";
import { isInitializedStackPresent } from "./boot.js";
import { readJson, task } from "../lib/apiHelpers.js";

export async function setupState(ctx) {
  const env = existsSync(resolve(ctx.config.repoRoot, ".env"));
  const token = existsSync(resolve(ctx.config.secretsDir, "funcom-token.txt"));
  const battlegroup = existsSync(resolve(ctx.config.generatedDir, "battlegroup.env"));
  const initialized = await isInitializedStackPresent(ctx);
  return {
    config: publicConfig(ctx.config),
    files: {
      env,
      token,
      battlegroup,
      complete: (env && token && battlegroup) || initialized,
      initialized,
      duneScript: existsSync(ctx.config.duneScript)
    }
  };
}

export async function writeConfig(ctx, req, res) {
  const body = await readJson(ctx, req);
  const allowed = ["SERVER_IP", "SERVER_IP_MODE", "SERVER_TITLE", "SERVER_REGION", "SERVER_PROVIDER", "STEAM_APP_ID", "BATTLEGROUP_ID"];
  const lines = [];
  for (const key of allowed) {
    if (body[key] !== undefined) lines.push(`${key}=${quoteEnv(String(body[key]))}`);
  }
  writeFileSync(resolve(ctx.config.repoRoot, ".env"), `${lines.join("\n")}\n`, { mode: 0o644 });
  audit(ctx.config, req, "setup.write-config", { keys: Object.keys(body).filter((key) => allowed.includes(key)) });
  return json(res, 200, { ok: true });
}

export async function saveToken(ctx, req, res) {
  const body = await readJson(ctx, req);
  saveFuncomTokenValue(ctx, body.token);
  audit(ctx.config, req, "setup.save-token", { token: "<redacted>" });
  return json(res, 200, { ok: true });
}

export async function saveServerFuncomToken(ctx, req, res) {
  const body = await readJson(ctx, req);
  saveFuncomTokenValue(ctx, body.token);
  audit(ctx.config, req, "server.save-funcom-token", { token: "<redacted>" });
  return json(res, 202, { task: ctx.tasks.create("server", "restartAll", {}) });
}

export async function funcomTokenCheckRoute(ctx, req, res, url) {
  const since = validDockerSince(url.searchParams.get("since")) || "5m";
  const logs = await Promise.all([
    runDockerLogs("director", { since, tail: 600, timeoutMs: 10000 }).catch((error) => ({ stdout: "", stderr: error.message || String(error) })),
    runDockerLogs("gateway", { since, tail: 600, timeoutMs: 10000 }).catch((error) => ({ stdout: "", stderr: error.message || String(error) }))
  ]);
  const text = logs.map((result) => `${result.stdout || ""}\n${result.stderr || ""}`).join("\n");
  const mismatch = funcomAuthMismatchDetected(text);
  return json(res, 200, {
    ok: !mismatch,
    mismatch,
    checkedSince: since,
    details: mismatch ? matchingFuncomAuthLines(text) : ""
  });
}

function validDockerSince(value) {
  const text = String(value || "").trim();
  if (/^\d+[smhdw]$/i.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/i.test(text)) return text;
  return "";
}

function funcomAuthMismatchDetected(text) {
  return isFuncomAuthMismatchText(text);
}

function matchingFuncomAuthLines(text) {
  return String(text || "").split(/\r?\n/)
    .filter((line) => isFuncomAuthMismatchText(line))
    .slice(-20)
    .join("\n");
}

function isFuncomAuthMismatchText(text) {
  const value = String(text || "");
  if (!value) return false;
  if (/Invalid Authorization to manage SelfHosted Battlegroup/i.test(value)) return true;
  if (/ACCESS_DENIED|AccessDenied|access denied|invalid authorization|Unauthorized/i.test(value)) {
    return /Battlegroup|SelfHosted|Funcom|FuncomLiveServices/i.test(value);
  }
  if (/(?:HTTP|status|statusCode|response|code)[^,\n]*(?:401|403)\b/i.test(value)) {
    return /Battlegroup|SelfHosted|Funcom|FuncomLiveServices/i.test(value);
  }
  return false;
}

function saveFuncomTokenValue(ctx, token) {
  if (!token || String(token).length < 20) {
    const error = new Error("Token looks too short");
    error.statusCode = 400;
    throw error;
  }
  mkdirSync(ctx.config.secretsDir, { recursive: true });
  const path = resolve(ctx.config.secretsDir, "funcom-token.txt");
  writeFileSync(path, `${String(token).trim()}\n`, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch {}
}

export function updateEnvFileValue(ctx, key, value) {
  const envPath = resolve(ctx.config.repoRoot, ".env");
  const current = existsSync(envPath) ? readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  const line = `${key}=${quoteEnv(String(value))}`;
  let found = false;
  const next = current.map((existing) => {
    if (existing.match(new RegExp(`^${key}=`))) {
      found = true;
      return line;
    }
    return existing;
  });
  if (!found) next.push(line);
  writeFileSync(envPath, `${next.filter((entry, index) => entry !== "" || index < next.length - 1).join("\n")}\n`, { mode: 0o644 });
  try { chmodSync(envPath, 0o644); } catch {}
}

export function validateDatabasePassword(value) {
  const password = String(value || "");
  if (password.length < 4) {
    const error = new Error("Database password must be at least 4 characters.");
    error.statusCode = 400;
    throw error;
  }
  if (password.length > 256 || /[\r\n\0]/.test(password)) {
    const error = new Error("Database password contains unsupported characters.");
    error.statusCode = 400;
    throw error;
  }
  return password;
}

export function validateAdminPassword(value) {
  const password = String(value || "");
  const requirements = [
    password.length >= 13,
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password)
  ];
  if (requirements.some((passed) => !passed)) {
    const error = new Error("New password must be at least 13 characters and include lowercase letters, uppercase letters, numbers, and special symbols.");
    error.statusCode = 400;
    throw error;
  }
  if (password.length > 256 || /[\r\n\0]/.test(password)) {
    const error = new Error("New password contains unsupported characters.");
    error.statusCode = 400;
    throw error;
  }
  return password;
}

export async function databasePasswordRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const password = validateDatabasePassword(body.password);
  if (process.env.ADMIN_DATABASE_URL) {
    return json(res, 400, { error: "Database password changes are unavailable while ADMIN_DATABASE_URL is set. Update the connection URL instead." });
  }
  await duneDb.changeDunePassword(ctx.getDb(), password);
  updateEnvFileValue(ctx, "DUNE_DB_PASSWORD", password);
  process.env.DUNE_DB_PASSWORD = password;
  const previousDb = ctx.getDb();
  ctx.setDb(createDb(ctx.config));
  try { await previousDb.close(); } catch {}
  audit(ctx.config, req, "database.change-password", { user: "dune", password: "<redacted>" });
  return json(res, 202, { ok: true, user: "dune", task: ctx.tasks.create("server", "restartAll", {}) });
}

export async function adminPasswordRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (ctx.config.authDisabled) return json(res, 400, { error: "Login password changes are unavailable while admin authentication is disabled." });
  if (ctx.config.adminPasswordEnvManaged) return json(res, 400, { error: "The login password is managed by ADMIN_PASSWORD. Update the environment value instead." });
  if (!ctx.auth.passwordMatches(body.currentPassword)) return json(res, 400, { error: "Current password is incorrect." });
  const password = validateAdminPassword(body.newPassword);
  writeFileSync(ctx.config.adminPasswordFile, `${password}\n`, { mode: 0o600 });
  try {
    chmodSync(ctx.config.adminPasswordFile, 0o600);
  } catch {
    // Best effort on non-POSIX development hosts.
  }
  ctx.config.adminPassword = password;
  audit(ctx.config, req, "settings.change-admin-password", { password: "<redacted>" });
  return json(res, 200, { ok: true });
}

export async function restartScheduleRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const operation = body.enabled ? "restartScheduleEnable" : "restartScheduleDisable";
  return task(ctx, req, res, "server", operation, body);
}

export async function autoGameUpdateRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "SAVE AUTO GAME UPDATES") {
    return json(res, 400, { error: "Confirmation phrase required: SAVE AUTO GAME UPDATES" });
  }
  const operation = body.enabled ? "updateAutoEnable" : "updateAutoDisable";
  return task(ctx, req, res, "updates", operation, body);
}

export async function previousStackRestoreRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "RESTORE PREVIOUS STACK") {
    return json(res, 400, { error: "Confirmation phrase required: RESTORE PREVIOUS STACK" });
  }
  return task(ctx, req, res, "updates", "selfUpdatePrevious", body);
}

export async function userSettingsRestoreDefaultsRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const reason = "Restore map defaults remains disabled in the web UI: usersettings.py reset-all can remove overrides, but it does not create a backup or preview which UserEngine/UserGame files will change. Web exposure needs backup-before-write and restart impact handling first.";
  audit(ctx.config, req, "maps.user-settings.restore-defaults", { supported: false, reason, requested: body.confirmation === "RESTORE MAP DEFAULTS" });
  return json(res, 501, { supported: false, reason, error: reason });
}

export async function sietchesUpdateRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const operationByAction = {
    "set-max": "sietchesSetMax",
    "set-active": "sietchesSetActive",
    "set-display": "sietchesSetDisplay",
    "set-password": "sietchesSetPassword",
    "set-settings": "sietchesSetSettings",
    sync: "sietchesSync",
    validate: "sietchesValidate",
    reconcile: "sietchesReconcile"
  };
  const operation = operationByAction[String(body.action || "")];
  if (!operation) return json(res, 400, { error: "Unsupported sietch update action" });
  const dangerous = ["sietchesSetActive", "sietchesSetDisplay", "sietchesSetPassword", "sietchesSetSettings", "sietchesReconcile"].includes(operation);
  if (dangerous && body.confirmation !== "UPDATE SIETCHES") return json(res, 400, { error: "Confirmation phrase required: UPDATE SIETCHES" });
  return task(ctx, req, res, "maps", operation, body);
}

export async function deepDesertUpdateRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "UPDATE DEEP DESERT") return json(res, 400, { error: "Confirmation phrase required: UPDATE DEEP DESERT" });
  return task(ctx, req, res, "maps", "deepdesertAction", body);
}
