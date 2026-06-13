import { audit } from "../core/audit.js";
import { json } from "../core/auth.js";
import { isReadOnlySql, buildDuneArgs, runDune } from "../platform/runner.js";
import * as duneDb from "../domain/duneDb.js";
import { dbJson, readJson } from "../lib/apiHelpers.js";

export async function databaseQuery(ctx, req, res) {
  const body = await readJson(ctx, req);
  const query = String(body.query || "");
  const readOnly = isReadOnlySql(query);
  if (!ctx.config.mockMode && !readOnly) {
    await runDune(ctx.config, buildDuneArgs("backupCreate"), { env: { DB_BACKUP_ORIGIN: "destructive-sql" } });
  }
  audit(ctx.config, req, "database.query", { readOnly, destructive: !readOnly });
  return dbJson(ctx, res, () => duneDb.runSql(ctx.getDb(), query, true));
}

export async function databaseExport(ctx, req, res) {
  const body = await readJson(ctx, req);
  const query = String(body.query || "");
  if (!isReadOnlySql(query)) {
    return json(res, 400, { error: "Export Query JSON supports read-only SELECT, WITH, SHOW, and EXPLAIN queries. Use Run Query for database writes." });
  }
  audit(ctx.config, req, "database.export", {});
  const content = await duneDb.exportRows(ctx.getDb(), query);
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": "attachment; filename=\"query-export.json\""
  });
  res.end(content);
}

export async function databaseRowUpdate(ctx, req, res, schema, table) {
  const body = await readJson(ctx, req);
  audit(ctx.config, req, "database.row-update", { schema, table, columns: Object.keys(body.values || {}) });
  return dbJson(ctx, res, () => duneDb.updateTableRow(ctx.getDb(), schema, table, body.rowId, body.values));
}
