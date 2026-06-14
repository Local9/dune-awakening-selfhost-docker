import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { webComposeFiles } from "./console-install.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");

test("webComposeFiles includes qa overlay when requested", () => {
  const files = webComposeFiles(repoRoot, { qa: true });
  assert.deepEqual(files.slice(0, 4), [
    "-f",
    "docker-compose.web.yml",
    "-f",
    "docker-compose.qa.yml"
  ]);
});

test("webComposeFiles omits qa overlay by default", () => {
  const files = webComposeFiles(repoRoot, { qa: false });
  assert.deepEqual(files.slice(0, 2), ["-f", "docker-compose.web.yml"]);
  assert.equal(files.includes("docker-compose.qa.yml"), false);
});
