import { task, readJson } from "../lib/apiHelpers.js";
import {
  backupsListRoute,
  externalBackupImportRoute,
  backupDownloadRoute,
  backupAutoStatusRoute,
  autoBackupRoute,
  remoteBackupImportRoute
} from "../services/backups.js";

export function registerBackupsRoutes(router, ctx) {
  router.get("/api/backups", (_req, res) => backupsListRoute(ctx, res));
  router.post("/api/backups/auto", (req, res) => autoBackupRoute(ctx, req, res));
  router.post("/api/backups/import-external", (req, res) => externalBackupImportRoute(ctx, req, res));
  router.post("/api/backups/import-remote", (req, res) => remoteBackupImportRoute(ctx, req, res));
  router.get("/api/backups/auto", (_req, res) => backupAutoStatusRoute(ctx, res));
  router.post("/api/backups/create", (req, res) => task(ctx, req, res, "backup", "backupCreate", {}));
  router.post("/api/backups/delete-all", (req, res) => task(ctx, req, res, "backup", "backupDeleteAll", {}));
  router.post("/api/backups/restore", async (req, res) => {
    const body = await readJson(ctx, req);
    return task(ctx, req, res, "backup", "backupRestore", { backup: body.backup });
  });
  router.get("/api/backups/:name/download", (_req, res, c, { params }) => backupDownloadRoute(c, res, params.name));
  router.delete("/api/backups/:name", (req, res, c, { params }) => task(c, req, res, "backup", "backupDelete", { backup: params.name }));
}
