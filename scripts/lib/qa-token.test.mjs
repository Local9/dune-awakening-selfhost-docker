import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const script = resolve(import.meta.dirname, "..", "qa-console.mjs");

test("up exits immediately when DUNE_QA_FUNCOM_TOKEN is unset", async () => {
  const child = spawn(process.execPath, [script, "up"], {
    env: { ...process.env, DUNE_QA_FUNCOM_TOKEN: "" },
    windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const code = await new Promise((resolveCode) => child.on("close", resolveCode));
  assert.equal(code, 1);
  assert.match(stderr, /DUNE_QA_FUNCOM_TOKEN is required/);
  assert.match(stderr, /did not start any services/i);
});
