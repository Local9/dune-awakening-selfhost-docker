import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseEnvValue, readEnvFileValue, resolveQaFuncomToken } from "./qa-token.mjs";

test("parseEnvValue strips surrounding double quotes", () => {
  assert.equal(parseEnvValue('"abc"'), "abc");
});

test("parseEnvValue strips surrounding single quotes", () => {
  assert.equal(parseEnvValue("'abc'"), "abc");
});

test("readEnvFileValue reads unquoted values and ignores comments", () => {
  const dir = mkdtempSync(join(tmpdir(), "qa-token-"));
  const envPath = join(dir, ".env");
  writeFileSync(envPath, [
    "# comment",
    "",
    "OTHER=value",
    "DUNE_QA_FUNCOM_TOKEN=token-from-file"
  ].join("\n"));
  assert.equal(readEnvFileValue(envPath, "DUNE_QA_FUNCOM_TOKEN"), "token-from-file");
  assert.equal(readEnvFileValue(envPath, "MISSING"), "");
});

test("resolveQaFuncomToken prefers environment over .env file", () => {
  const dir = mkdtempSync(join(tmpdir(), "qa-token-"));
  const envPath = join(dir, ".env");
  writeFileSync(envPath, "DUNE_QA_FUNCOM_TOKEN=token-from-file\n");
  assert.equal(
    resolveQaFuncomToken({ envPath, processEnv: { DUNE_QA_FUNCOM_TOKEN: "token-from-env" } }),
    "token-from-env"
  );
});

test("resolveQaFuncomToken falls back to .env when env var is unset", () => {
  const dir = mkdtempSync(join(tmpdir(), "qa-token-"));
  const envPath = join(dir, ".env");
  writeFileSync(envPath, "DUNE_QA_FUNCOM_TOKEN=token-from-file\n");
  assert.equal(resolveQaFuncomToken({ envPath, processEnv: {} }), "token-from-file");
});

test("resolveQaFuncomToken returns empty when token is missing everywhere", () => {
  const dir = mkdtempSync(join(tmpdir(), "qa-token-"));
  const envPath = join(dir, ".env");
  writeFileSync(envPath, "SERVER_TITLE=QA\n");
  assert.equal(resolveQaFuncomToken({ envPath, processEnv: {} }), "");
});
