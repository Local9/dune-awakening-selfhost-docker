import { json } from "../core/auth.js";
import * as duneDb from "../domain/duneDb.js";
import { dbJson, databaseTableRoute, readJson } from "../lib/apiHelpers.js";
import { databaseQuery, databaseExport, databaseRowUpdate } from "../services/database.js";
import { databasePasswordRoute, adminPasswordRoute } from "../services/setupConfig.js";

export function registerDatabaseRoutes(router, ctx) {
  router.get("/api/database/status", (_req, res) => dbJson(ctx, res, () => duneDb.dbStatus(ctx.getDb())));
  router.get("/api/database/schemas", (_req, res) => dbJson(ctx, res, () => duneDb.listSchemas(ctx.getDb())));
  router.get("/api/database/tables", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.listTables(c.getDb(), url.searchParams.get("schema") || "dune")));
  router.get("/api/database/tables/:schema/:table/columns", (_req, res, c, { params, url }) => databaseTableRoute(c, res, params.schema, params.table, "columns", url));
  router.get("/api/database/tables/:schema/:table/preview", (_req, res, c, { params, url }) => databaseTableRoute(c, res, params.schema, params.table, "preview", url));
  router.get("/api/database/tables/:schema/:table/count", (_req, res, c, { params, url }) => databaseTableRoute(c, res, params.schema, params.table, "count", url));
  router.patch("/api/database/tables/:schema/:table/row", (req, res, c, { params }) => databaseRowUpdate(c, req, res, params.schema, params.table));
  router.get("/api/database/search", (_req, res, c, { url }) => dbJson(c, res, () => duneDb.searchDatabase(c.getDb(), url.searchParams.get("q") || url.searchParams.get("term") || "")));
  router.get("/api/database/table/:schemaTable", (_req, res, c, { params, url }) => dbJson(c, res, () => {
    const [schema, table] = decodeURIComponent(params.schemaTable).split(".");
    return duneDb.tablePreview(c.getDb(), schema, table, url.searchParams.get("limit") || 50, url.searchParams.get("offset") || 0);
  }));
  router.post("/api/database/query", (req, res) => databaseQuery(ctx, req, res));
  router.post("/api/database/export", (req, res) => databaseExport(ctx, req, res));
  router.post("/api/database/password", (req, res) => databasePasswordRoute(ctx, req, res));
  router.post("/api/settings/admin-password", (req, res) => adminPasswordRoute(ctx, req, res));
}
