import { readJsonBody } from "../core/httpSafety.js";
import { json } from "../core/auth.js";
import { audit } from "../core/audit.js";
import { redact } from "../core/redact.js";
import { buildDuneArgs, runDune } from "../platform/runner.js";
import * as duneDb from "../domain/duneDb.js";

export async function readJson(ctx, req) {
  return readJsonBody(req, ctx.config.maxJsonBytes);
}

export function mockCommand(operation) {
  return { operation, stdout: `Mock ${operation} output\n`, stderr: "", exitCode: 0 };
}

export async function safeCommand(ctx, operation, payload = {}) {
  try {
    const args = buildDuneArgs(operation, payload);
    const result = await runDune(ctx.config, args);
    return { operation, stdout: result.stdout, stderr: result.stderr, exitCode: result.code };
  } catch (error) {
    return { operation, stdout: redact(error.stdout || ""), stderr: redact(error.stderr || error.message || error), exitCode: error.code || 1 };
  }
}

export async function commandJson(ctx, res, operation, payload = {}) {
  if (ctx.config.mockMode) return json(res, 200, mockCommand(operation));
  const args = buildDuneArgs(operation, payload);
  const result = await runDune(ctx.config, args);
  return json(res, 200, { operation, stdout: result.stdout, stderr: result.stderr, exitCode: result.code });
}

export async function safeCommandJson(ctx, res, operation, payload = {}) {
  if (ctx.config.mockMode) return json(res, 200, mockCommand(operation));
  return json(res, 200, await safeCommand(ctx, operation, payload));
}

export async function dbJson(ctx, res, fn) {
  try {
    return json(res, 200, await fn());
  } catch (error) {
    const status = error.unsupported ? 501 : 500;
    return json(res, status, { supported: false, error: redact(error.message || error), reason: redact(error.message || error), details: error.details || undefined });
  }
}

export async function exportJson(ctx, res, filename, fn) {
  try {
    const data = await fn();
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`
    });
    res.end(JSON.stringify(data, null, 2));
  } catch (error) {
    const status = error.unsupported ? 501 : 500;
    json(res, status, { supported: false, error: redact(error.message || error), reason: redact(error.message || error), details: error.details || undefined });
  }
}

export function dbPlayerRoute(ctx, res, playerId, fn) {
  return dbJson(ctx, res, () => fn(ctx.getDb(), playerId));
}

export function dbPlayerUnsupported(ctx, res, playerId, feature) {
  return dbJson(ctx, res, () => duneDb.unsupportedPlayerFeature(ctx.getDb(), playerId, feature));
}

export async function task(ctx, req, res, type, operation, payload) {
  try {
    buildDuneArgs(operation, payload);
  } catch (error) {
    return json(res, 400, { error: redact(error.message || error) });
  }
  audit(ctx.config, req, `task.${operation}`, payload);
  return json(res, 202, { task: ctx.tasks.create(type, operation, payload) });
}

export async function confirmedTask(ctx, req, res, type, operation, payload, phrase) {
  const body = await readJson(ctx, req);
  if (phrase && body.confirmation !== phrase) {
    return json(res, 400, { error: `Confirmation phrase required: ${phrase}` });
  }
  return task(ctx, req, res, type, operation, { ...payload, ...body });
}

export async function playerTask(ctx, req, res, playerId, operation, phrase = "") {
  const body = await readJson(ctx, req);
  if (phrase && body.confirmation !== phrase) {
    return json(res, 400, { error: `Confirmation phrase required: ${phrase}` });
  }
  return task(ctx, req, res, "admin", operation, { ...body, playerId });
}

export async function directDbMutation(ctx, req, res, action, phrase, fn, meta = {}) {
  const body = await readJson(ctx, req);
  if (phrase && body.confirmation !== phrase) {
    return json(res, 400, { error: `Confirmation phrase required: ${phrase}` });
  }
  try {
    const result = ctx.config.mockMode ? { ok: true, mock: true } : await fn(body);
    audit(ctx.config, req, action, { ...meta, supported: true, result });
    return json(res, 200, { supported: true, backupCreated: false, result });
  } catch (error) {
    const status = error.unsupported ? 501 : 400;
    audit(ctx.config, req, action, { ...meta, supported: false, error: redact(error.message || error) });
    return json(res, status, { supported: false, error: redact(error.message || error), reason: redact(error.message || error), details: error.details || undefined });
  }
}

export async function playerDbMutation(ctx, req, res, playerId, action, phrase, fn) {
  return directDbMutation(ctx, req, res, action, phrase, (body) => fn(playerId, body), { playerId });
}

export function queryParams(url, names) {
  const out = {};
  for (const name of names) out[name] = url.searchParams.get(name) || "";
  return out;
}

export function databaseTableRoute(ctx, res, schema, table, action, url) {
  const db = ctx.getDb();
  if (action === "columns") return dbJson(ctx, res, () => duneDb.tableColumns(db, schema, table));
  if (action === "count") return dbJson(ctx, res, () => duneDb.tableCount(db, schema, table));
  return dbJson(ctx, res, () => duneDb.tablePreview(db, schema, table, url.searchParams.get("limit") || 50, url.searchParams.get("offset") || 0));
}
