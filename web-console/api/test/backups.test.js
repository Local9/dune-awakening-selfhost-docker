import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBackupMetadata,
  stringifyBackupMetadata,
  validBackupDownloadName,
  createTarArchive
} from "../src/services/backups.js";

test("parseBackupMetadata reads yaml key values", () => {
  const metadata = parseBackupMetadata("backup_origin: external\nbattlegroup_id: bg-1\n");
  assert.equal(metadata.backup_origin, "external");
  assert.equal(metadata.battlegroup_id, "bg-1");
});

test("stringifyBackupMetadata round-trips keys", () => {
  const text = stringifyBackupMetadata({ backup_origin: "external", imported_at: "2026-01-01T00:00:00.000Z" });
  const parsed = parseBackupMetadata(text);
  assert.equal(parsed.backup_origin, "external");
  assert.equal(parsed.imported_at, "2026-01-01T00:00:00.000Z");
});

test("validBackupDownloadName accepts known backup filename patterns", () => {
  assert.equal(validBackupDownloadName("dune-db-20260101-120000.dump"), true);
  assert.equal(validBackupDownloadName("imported-backup-20260101-120000.backup"), true);
  assert.equal(validBackupDownloadName("../escape.backup"), false);
});

test("createTarArchive builds ustar archive with file content", () => {
  const archive = createTarArchive([{ name: "sample.backup", content: Buffer.from("hello") }]);
  assert.ok(archive.length >= 1024);
  assert.match(archive.toString("utf8", 0, 512), /sample\.backup/);
});
