import { audit } from "../core/audit.js";
import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import {
  clearCarePackageHistory,
  enableCarePackage,
  grantEligibleCarePackages,
  grantCarePackage,
  retryCarePackageGrant,
  runCarePackageAutoScan,
  saveCarePackageConfig,
  carePackageCapabilities,
  carePackageConfig,
  carePackageEligiblePlayers,
  carePackageHistory
} from "../domain/carePackage.js";
import * as duneDb from "../domain/duneDb.js";
import { readJson } from "../lib/apiHelpers.js";
import { resolveCarePackagePlayerIdentity } from "./playerGrants.js";

export async function carePackageConfigRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "SAVE CARE PACKAGE") return json(res, 400, { error: "Confirmation phrase required: SAVE CARE PACKAGE" });
  try {
    const saved = saveCarePackageConfig(ctx.config, body);
    audit(ctx.config, req, "care-package.config", { supported: true, enabled: saved.enabled, version: saved.version, itemCount: saved.items.length, xp: saved.xp });
    return json(res, 200, saved);
  } catch (error) {
    audit(ctx.config, req, "care-package.config", { supported: false, error: redact(error.message || error) });
    return json(res, 400, { error: redact(error.message || error) });
  }
}

export async function carePackageEnableRoute(ctx, req, res, enabled) {
  const body = await readJson(ctx, req);
  const phrase = enabled ? "ENABLE CARE PACKAGE" : "DISABLE CARE PACKAGE";
  if (body.confirmation !== phrase) return json(res, 400, { error: `Confirmation phrase required: ${phrase}` });
  try {
    const saved = enableCarePackage(ctx.config, enabled);
    audit(ctx.config, req, enabled ? "care-package.enable" : "care-package.disable", { supported: true, version: saved.version });
    return json(res, 200, saved);
  } catch (error) {
    return json(res, 400, { error: redact(error.message || error) });
  }
}

export async function carePackageGrantRoute(ctx, req, res, playerId) {
  try {
    const body = await readJson(ctx, req);
    const identity = await resolveCarePackagePlayerIdentity(ctx, playerId).catch(() => ({}));
    const result = await grantCarePackage(ctx.config, playerId, { ...body, ...identity }, { db: ctx.getDb() });
    audit(ctx.config, req, "care-package.grant", { supported: true, playerId, ok: result.ok, grantId: result.id });
    return json(res, result.ok ? 200 : 207, result);
  } catch (error) {
    audit(ctx.config, req, "care-package.grant", { supported: false, playerId, error: redact(error.message || error) });
    return json(res, 400, { error: redact(error.message || error) });
  }
}

export async function carePackageEligibleRoute(ctx, req, res, url) {
  try {
    const players = await duneDb.listPlayers(ctx.getDb(), {});
    if (players.capabilities?.players === false) return json(res, 501, { supported: false, reason: players.reason || "Player list is unavailable" });
    return json(res, 200, carePackageEligiblePlayers(ctx.config, players.rows || [], {
      ruleId: url.searchParams.get("ruleId") || "",
      onlyEligible: url.searchParams.get("onlyEligible") === "1"
    }));
  } catch (error) {
    return json(res, 500, { supported: false, error: redact(error.message || error), reason: redact(error.message || error) });
  }
}

export async function carePackageGrantEligibleRoute(ctx, req, res) {
  try {
    const players = await duneDb.listPlayers(ctx.getDb(), {});
    if (players.capabilities?.players === false) return json(res, 501, { supported: false, reason: players.reason || "Player list is unavailable" });
    const result = await grantEligibleCarePackages(ctx.config, players.rows || [], await readJson(ctx, req), { db: ctx.getDb() });
    audit(ctx.config, req, "care-package.grant-eligible", { supported: true, granted: result.granted, skipped: result.skipped, failed: result.failed });
    return json(res, result.failed ? 207 : 200, result);
  } catch (error) {
    audit(ctx.config, req, "care-package.grant-eligible", { supported: false, error: redact(error.message || error) });
    return json(res, 400, { error: redact(error.message || error), reason: redact(error.message || error) });
  }
}

export async function carePackageRunRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  if (body.confirmation !== "RUN CARE PACKAGE SCAN") return json(res, 400, { error: "Confirmation phrase required: RUN CARE PACKAGE SCAN" });
  try {
    const players = await duneDb.listPlayers(ctx.getDb(), {});
    if (players.capabilities?.players === false) return json(res, 501, { supported: false, reason: players.reason || "Player list is unavailable" });
    const result = await runCarePackageAutoScan(ctx.config, players.rows || [], "manual-scan", { db: ctx.getDb() });
    audit(ctx.config, req, "care-package.run", { supported: true, ...result, results: undefined });
    return json(res, result.failed ? 207 : 200, result);
  } catch (error) {
    audit(ctx.config, req, "care-package.run", { supported: false, error: redact(error.message || error) });
    return json(res, 400, { error: redact(error.message || error), reason: redact(error.message || error) });
  }
}

export async function carePackageRetryRoute(ctx, req, res, grantId) {
  try {
    const result = await retryCarePackageGrant(ctx.config, grantId, await readJson(ctx, req), { db: ctx.getDb() });
    audit(ctx.config, req, "care-package.retry", { supported: true, grantId, ok: result.ok, retryGrantId: result.id });
    return json(res, result.ok ? 200 : 207, result);
  } catch (error) {
    audit(ctx.config, req, "care-package.retry", { supported: false, grantId, error: redact(error.message || error) });
    return json(res, 400, { error: redact(error.message || error) });
  }
}

export async function carePackageClearHistoryRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const phrase = "CLEAR GRANT HISTORY";
  if (body.confirmation !== phrase) return json(res, 400, { error: `Confirmation phrase required: ${phrase}` });
  try {
    const result = clearCarePackageHistory(ctx.config);
    audit(ctx.config, req, "care-package.history-clear", { supported: true, removed: result.removed });
    return json(res, 200, result);
  } catch (error) {
    audit(ctx.config, req, "care-package.history-clear", { supported: false, error: redact(error.message || error) });
    return json(res, 400, { error: redact(error.message || error) });
  }
}

export async function carePackageAutoTick(ctx) {
  if (ctx.carePackageAuto.running) return;
  let kit;
  try {
    kit = carePackageConfig(ctx.config);
  } catch (error) {
    console.error(`Care Package auto-grant config read failed: ${redact(error.message || error)}`);
    return;
  }
  const hasEnabledRule = Array.isArray(kit.autoGrantRules) && kit.autoGrantRules.some((rule) => rule.enabled);
  if (!kit.enabled || !hasEnabledRule) return;
  const intervalMs = Math.max(60, Number(kit.autoGrantIntervalSeconds) || 60) * 1000;
  if (Date.now() - ctx.carePackageAuto.lastRun < intervalMs) return;
  ctx.carePackageAuto.running = true;
  ctx.carePackageAuto.lastRun = Date.now();
  try {
    const players = await duneDb.listPlayers(ctx.getDb(), {});
    if (players.capabilities?.players === false) return;
    const result = await runCarePackageAutoScan(ctx.config, players.rows || [], "auto", { db: ctx.getDb() });
    if (result.granted || result.failed) {
      console.log(`Care Package auto-grant scan: granted=${result.granted || 0} skipped=${result.skipped || 0} failed=${result.failed || 0}`);
    }
    if (result.granted || result.skipped || result.failed) {
      audit(ctx.config, null, "care-package.auto-scan", { supported: true, granted: result.granted || 0, skipped: result.skipped || 0, failed: result.failed || 0 });
    }
  } catch (error) {
    console.error(`Care Package auto-grant scan failed: ${redact(error.message || error)}`);
  } finally {
    ctx.carePackageAuto.running = false;
  }
}

export { carePackageCapabilities, carePackageConfig, carePackageHistory };
