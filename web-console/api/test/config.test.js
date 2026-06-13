import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, publicConfig, loginPublicConfig, authDisabledStartupWarnings } from "../src/core/config.js";

test("web config exposes safe deployment flags and JSON body limit", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "arrakis-config-"));
  const previous = { ...process.env };
  process.env.DUNE_DOCKER_DIR = repoRoot;
  process.env.NODE_ENV = "production";
  process.env.ADMIN_MAX_JSON_BYTES = "12345";
  try {
    const config = loadConfig();
    assert.equal(config.secureCookies, true);
    assert.equal(config.maxJsonBytes, 12345);
    const exposed = publicConfig(config);
    assert.equal(exposed.secureCookies, true);
    assert.equal(exposed.authDisabled, false);
    assert.equal(exposed.mockMode, false);
    assert.equal(Object.hasOwn(exposed, "adminPassword"), false);
    assert.equal(Object.hasOwn(exposed, "sessionSecret"), false);

    const loginExposed = loginPublicConfig(config);
    assert.equal(loginExposed.appName, config.appName);
    assert.equal(loginExposed.authDisabled, false);
    assert.equal(Object.hasOwn(loginExposed, "repoRoot"), false);
    assert.equal(Object.hasOwn(loginExposed, "mockMode"), false);

    process.env.ADMIN_SECURE_COOKIES = "0";
    assert.equal(loadConfig().secureCookies, false);
  } finally {
    process.env = previous;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("authDisabledStartupWarnings returns operator-facing warning lines", () => {
  const lines = authDisabledStartupWarnings();
  assert.equal(lines.length, 2);
  assert.match(lines[0], /ADMIN_AUTH_DISABLED=1/);
  assert.match(lines[1], /untrusted networks/);
});

test("loginPublicConfig omits deployment metadata exposed only after authentication", () => {
  const repoRoot = mkdtempSync(join(tmpdir(), "arrakis-login-config-"));
  const previous = { ...process.env };
  process.env.DUNE_DOCKER_DIR = repoRoot;
  try {
    const config = loadConfig();
    const loginExposed = loginPublicConfig(config);
    const fullExposed = publicConfig(config);
    assert.deepEqual(Object.keys(loginExposed).sort(), ["appName", "authDisabled"]);
    assert.equal(fullExposed.repoRoot, config.repoRoot);
    assert.equal(Object.hasOwn(loginExposed, "repoRoot"), false);
  } finally {
    process.env = previous;
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
