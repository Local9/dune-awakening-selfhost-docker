import { existsSync, writeFileSync, mkdirSync, chmodSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { audit, recordAdminHistory } from "../core/audit.js";
import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import { buildBroadcastCommand, buildShutdownBroadcastCommand, publishServerCommand } from "../platform/rmq.js";
import { readJson } from "../lib/apiHelpers.js";

export async function clearAdminHistoryRoute(ctx, req, res) {
  const body = await readJson(ctx, req).catch(() => ({}));
  const historyDir = join(ctx.config.repoRoot, "runtime/generated");
  const historyFile = join(historyDir, "admin-command-history.tsv");
  mkdirSync(historyDir, { recursive: true });
  if (body.scope === "admin-tools") {
    const current = existsSync(historyFile) ? readFileSync(historyFile, "utf8") : "";
    const next = current.split(/\r?\n/).filter((line) => line && !isAdminToolsHistoryLine(line)).join("\n");
    writeFileSync(historyFile, next ? `${next}\n` : "");
    audit(ctx.config, req, "admin.history.clear", { ok: true, scope: "admin-tools" });
    return json(res, 200, { ok: true });
  }
  writeFileSync(historyFile, "");
  writeFileSync(join(historyDir, "admin-command-audit.jsonl"), "");
  audit(ctx.config, req, "admin.history.clear", { ok: true, scope: "all" });
  return json(res, 200, { ok: true });
}

function isAdminToolsHistoryLine(line) {
  const parts = String(line || "").split("\t");
  const command = String(parts[1] || "").trim();
  const target = String(parts[2] || "").trim();
  if (/^web-(broadcast|shutdown-broadcast)$/i.test(command)) return true;
  if (/^web-hydrate-all$/i.test(command)) return true;
  if (/^KickPlayer$/i.test(command) && /^(all|\*)$/i.test(target)) return true;
  return false;
}

export async function broadcastRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const message = body.body ?? body.message;
  try {
    const command = buildBroadcastCommand({ ...body, message });
    const result = ctx.config.mockMode ? { code: 0, stdout: "mock broadcast\n", stderr: "", args: [] } : await publishServerCommand(ctx.config, command, "web-broadcast");
    audit(ctx.config, req, "admin.broadcast", { supported: true, command });
    recordAdminHistory(ctx.config, { command: "web-broadcast", target: "all", friendly: body.title || "Broadcast", path: "rmq:heartbeats/notifications", result: "published", message });
    return json(res, 200, { supported: true, ok: true, stdout: result.stdout, stderr: result.stderr, note: "Broadcast was published to RabbitMQ." });
  } catch (error) {
    audit(ctx.config, req, "admin.broadcast", { supported: false, error: redact(error.message || error) });
    recordAdminHistory(ctx.config, { command: "web-broadcast", target: "all", friendly: body.title || "Broadcast", path: "rmq:heartbeats/notifications", result: "blocked", message });
    return json(res, 400, { supported: false, error: redact(error.message || error), reason: redact(error.message || error) });
  }
}

export async function shutdownBroadcastRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "SHUTDOWN BROADCAST") {
    recordAdminHistory(ctx.config, { command: "web-shutdown-broadcast", target: "all", friendly: "Shutdown broadcast publish test", path: "rmq:heartbeats/notifications", result: "blocked", message: "missing confirmation" });
    return json(res, 400, { error: "Confirmation phrase required: SHUTDOWN BROADCAST" });
  }
  try {
    const command = buildShutdownBroadcastCommand(body);
    const result = ctx.config.mockMode ? { code: 0, stdout: "mock shutdown broadcast\n", stderr: "", args: [] } : await publishServerCommand(ctx.config, command, "web-shutdown-broadcast");
    audit(ctx.config, req, "admin.broadcast-shutdown", { supported: true, command });
    recordAdminHistory(ctx.config, { command: "web-shutdown-broadcast", target: "all", friendly: "Shutdown broadcast publish test", path: "rmq:heartbeats/notifications", result: "published", message: `${body.shutdownType || "Restart"} in ${body.delayMinutes || 15} minutes` });
    return json(res, 200, { supported: true, ok: true, stdout: result.stdout, stderr: result.stderr, note: "Shutdown broadcast publish succeeded, but in-game visibility is unverified." });
  } catch (error) {
    audit(ctx.config, req, "admin.broadcast-shutdown", { supported: false, error: redact(error.message || error) });
    recordAdminHistory(ctx.config, { command: "web-shutdown-broadcast", target: "all", friendly: "Shutdown broadcast publish test", path: "rmq:heartbeats/notifications", result: "blocked", message: `${body.shutdownType || "Restart"} in ${body.delayMinutes || 15} minutes` });
    return json(res, 400, { supported: false, error: redact(error.message || error), reason: redact(error.message || error) });
  }
}

export async function whisperRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const reason = "Whisper remains blocked: the web admin publishes courier chat to exchange chat.whispers with routing key equal to the recipient Funcom ID, AMQP type text_chat, and sender user_id set to a seeded GM hex FLS ID. RedBlink does not currently seed or expose the required GM account/persona rows, sender Funcom ID, sender hex FLS ID, and verified recipient Funcom ID mapping.";
  audit(ctx.config, req, "admin.whisper", { supported: false, reason, playerId: body.playerId });
  recordAdminHistory(ctx.config, { command: "web-whisper", target: body.playerId || "-", friendly: "Whisper blocked", path: "rmq:chat.whispers", result: "blocked", message: body.message });
  return json(res, 501, { supported: false, reason, error: reason });
}
