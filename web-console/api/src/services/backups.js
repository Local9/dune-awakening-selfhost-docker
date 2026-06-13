import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { audit } from "../core/audit.js";
import { readMultipartForm } from "../core/httpSafety.js";
import { buildDuneArgs, runDune } from "../platform/runner.js";
import { parseBackupAutoStatus, parseBackupListRows } from "../platform/statusParsers.js";
import { json } from "../core/auth.js";
import { mockCommand, readJson, safeCommand, task } from "../lib/apiHelpers.js";

export function parseBackupMetadata(content) {
  return Object.fromEntries(String(content || "").split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    return match ? [match[1], match[2].trim()] : null;
  }).filter(Boolean));
}

export function stringifyBackupMetadata(metadata) {
  return `${Object.entries(metadata).map(([key, value]) => `${key}: ${String(value || "")}`).join("\n")}\n`;
}

export function validBackupDownloadName(name) {
  return /^dune-db-([a-z0-9][a-z0-9_-]*__)?[0-9]{8}-[0-9]{6}\.(dump|sql)$/i.test(name) ||
    /^[a-z0-9][a-z0-9_-]*-[0-9]{8}-[0-9]{6}\.backup$/i.test(name);
}

export function createTarArchive(files) {
  const blocks = [];
  for (const file of files) {
    const header = Buffer.alloc(512, 0);
    writeTarString(header, 0, 100, file.name);
    writeTarOctal(header, 100, 8, 0o600);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, file.content.length);
    writeTarOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    header.fill(32, 148, 156);
    header[156] = 48;
    writeTarString(header, 257, 6, "ustar");
    writeTarString(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeTarOctal(header, 148, 8, checksum);
    blocks.push(header, file.content);
    const padding = (512 - (file.content.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

function writeTarString(buffer, offset, length, value) {
  buffer.write(String(value).slice(0, length - 1), offset, length, "utf8");
}

function writeTarOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, "0").slice(0, length - 1);
  buffer.write(text, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function readBackupMetadata(ctx, name) {
  if (!/^[A-Za-z0-9_.-]+\.(backup|dump|sql)$/i.test(String(name || ""))) return {};
  const metadataPath = resolve(ctx.config.repoRoot, "runtime/backups/db", `${name}.yaml`);
  if (!existsSync(metadataPath)) return {};
  try {
    return parseBackupMetadata(readFileSync(metadataPath, "utf8"));
  } catch {
    return {};
  }
}

function enrichBackupRows(ctx, rows) {
  return rows.map((row) => {
    const metadata = readBackupMetadata(ctx, row.name);
    const origin = String(metadata.backup_origin || metadata.origin || "").trim().toLowerCase();
    const battlegroupId = String(metadata.imported_from_battlegroup_id || metadata.battlegroup_id || "").trim();
    const enriched = { ...row, battlegroupId: battlegroupId || "Unknown" };
    if (/^(automatic|scheduled)$/.test(origin)) return { ...enriched, type: "Automatic Backup" };
    if (/^(restore-safety|restore_safety|restore safety)$/.test(origin)) return { ...enriched, type: "Restore Safety Backup" };
    if (/^(pre-update|pre_update|preupdate)$/.test(origin)) return { ...enriched, type: "Pre-update Backup" };
    if (/^(destructive-sql|destructive_sql|destructive sql|sql-safety|sql_safety)$/.test(origin)) return { ...enriched, type: "SQL Safety Backup" };
    if (/^(external|imported)$/.test(origin)) return { ...enriched, type: "Imported Backup", source: "External" };
    return enriched;
  });
}

function readCurrentBattlegroupId(ctx) {
  try {
    const text = readFileSync(resolve(ctx.config.generatedDir, "battlegroup.env"), "utf8");
    return text.match(/^BATTLEGROUP_ID=(.*)$/m)?.[1]?.replace(/\\ /g, " ").trim() || "";
  } catch {
    return "";
  }
}

function nextImportedBackupName(backupDir) {
  const now = new Date();
  for (let offset = 0; offset < 86400; offset += 1) {
    const candidateDate = new Date(now.getTime() + offset * 1000);
    const stamp = [
      candidateDate.getFullYear(),
      String(candidateDate.getMonth() + 1).padStart(2, "0"),
      String(candidateDate.getDate()).padStart(2, "0")
    ].join("") + "-" + [
      String(candidateDate.getHours()).padStart(2, "0"),
      String(candidateDate.getMinutes()).padStart(2, "0"),
      String(candidateDate.getSeconds()).padStart(2, "0")
    ].join("");
    const name = `imported-backup-${stamp}.backup`;
    if (!existsSync(resolve(backupDir, name)) && !existsSync(resolve(backupDir, `${name}.yaml`))) return name;
  }
  throw new Error("Could not allocate imported backup filename.");
}

function normalizeImportedBackupMetadata(ctx, content) {
  const metadata = parseBackupMetadata(content);
  const currentBattlegroupId = readCurrentBattlegroupId(ctx);
  const originalBattlegroupId = String(metadata.battlegroup_id || "").trim();
  if (originalBattlegroupId && currentBattlegroupId && originalBattlegroupId !== currentBattlegroupId && !metadata.imported_from_battlegroup_id) {
    metadata.imported_from_battlegroup_id = originalBattlegroupId;
  }
  metadata.backup_origin = "external";
  metadata.imported_at = new Date().toISOString();
  return stringifyBackupMetadata(metadata);
}

export async function backupsListRoute(ctx, res) {
  if (ctx.config.mockMode) return json(res, 200, { ...mockCommand("backupList"), rows: [] });
  const result = await runDune(ctx.config, buildDuneArgs("backupList"));
  return json(res, 200, { operation: "backupList", stdout: result.stdout, stderr: result.stderr, exitCode: result.code, rows: enrichBackupRows(ctx, parseBackupListRows(result.stdout)) });
}

export async function externalBackupImportRoute(ctx, req, res) {
  const form = await readMultipartForm(req, ctx.config.maxUploadBytes);
  const backup = form.files.find((file) => file.fieldName === "backup");
  const metadata = form.files.find((file) => file.fieldName === "metadata");
  if (!backup) return json(res, 400, { error: "Select a .backup file to import." });
  if (!metadata) return json(res, 400, { error: "Select the matching .backup.yaml file to import." });

  const backupName = basename(backup.fileName || "");
  const metadataName = basename(metadata.fileName || "");
  if (!/\.backup$/i.test(backupName)) return json(res, 400, { error: "The backup file must end with .backup." });
  if (!/\.ya?ml$/i.test(metadataName)) return json(res, 400, { error: "The metadata file must end with .yaml or .yml." });
  if (!backup.content.length) return json(res, 400, { error: "The selected .backup file is empty." });
  if (!metadata.content.length) return json(res, 400, { error: "The selected metadata file is empty." });

  const backupDir = resolve(ctx.config.repoRoot, "runtime/backups/db");
  mkdirSync(backupDir, { recursive: true });
  const importedName = nextImportedBackupName(backupDir);
  const backupPath = resolve(backupDir, importedName);
  const metadataPath = `${backupPath}.yaml`;
  writeFileSync(backupPath, backup.content, { mode: 0o600 });
  writeFileSync(metadataPath, normalizeImportedBackupMetadata(ctx, metadata.content), { mode: 0o600 });
  chmodSync(backupPath, 0o600);
  chmodSync(metadataPath, 0o600);
  audit(ctx.config, req, "backup.import-external", { backup: importedName, sourceBackup: backupName, sourceMetadata: metadataName });

  const result = await runDune(ctx.config, buildDuneArgs("backupList"));
  const rows = enrichBackupRows(ctx, parseBackupListRows(result.stdout));
  return json(res, 200, { ok: true, backup: importedName, rows, row: rows.find((row) => row.name === importedName) || null });
}

export async function backupDownloadRoute(ctx, res, backupName) {
  if (!validBackupDownloadName(backupName)) return json(res, 400, { error: "Invalid backup name." });
  const backupDir = resolve(ctx.config.repoRoot, "runtime/backups/db");
  const backupPath = resolve(backupDir, backupName);
  const metadataPath = `${backupPath}.yaml`;
  if (!backupPath.startsWith(`${backupDir}/`)) return json(res, 400, { error: "Invalid backup path." });
  if (!existsSync(backupPath)) return json(res, 404, { error: "Backup file was not found." });
  if (!existsSync(metadataPath)) return json(res, 404, { error: "Backup metadata .yaml file was not found." });

  const archiveName = `${backupName}.tar.gz`;
  const archive = gzipSync(createTarArchive([
    { name: backupName, content: readFileSync(backupPath) },
    { name: `${backupName}.yaml`, content: readFileSync(metadataPath) }
  ]));
  res.writeHead(200, {
    "content-type": "application/gzip",
    "content-length": archive.length,
    "content-disposition": `attachment; filename="${archiveName.replace(/"/g, "")}"`
  });
  res.end(archive);
}

export async function backupAutoStatusRoute(ctx, res) {
  if (ctx.config.mockMode) return json(res, 200, { ...mockCommand("backupAutoStatus"), status: { ok: true, enabled: false, backupTime: "05:00", intervalHours: "", retentionDays: "0", retentionLabel: "No Retention Limit", timer: "" } });
  const result = await safeCommand(ctx, "backupAutoStatus");
  return json(res, 200, { ...result, status: parseBackupAutoStatus(result) });
}

export async function autoBackupRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const operation = body.enabled ? "backupAutoEnable" : "backupAutoDisable";
  return task(ctx, req, res, "backup", operation, body);
}

export async function remoteBackupImportRoute(ctx, req, res) {
  const body = await readJson(ctx, req);
  const reason = "Remote SSH backup import remains disabled in the web UI: the Dune Manager flow is interactive and asks for SSH host/user/port/path before running scp. A safe web wrapper needs key-only credential selection, remote preview, no secret logging, and restore preflight coverage.";
  audit(ctx.config, req, "backup.import-remote", {
    supported: false,
    reason,
    host: body.host ? "<redacted-host>" : "",
    user: body.user ? "<redacted-user>" : "",
    path: body.path ? "<redacted-path>" : ""
  });
  return json(res, 501, { supported: false, reason, error: reason });
}
