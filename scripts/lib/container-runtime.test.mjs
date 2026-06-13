import test from "node:test";
import assert from "node:assert/strict";
import { normalizeComposePath } from "./container-runtime.mjs";

test("normalizeComposePath on Windows uses forward slashes", () => {
  if (process.platform !== "win32") return;
  assert.equal(normalizeComposePath("D:\\workspace\\dune"), "D:/workspace/dune");
});

test("normalizeComposePath on Unix leaves paths unchanged", () => {
  if (process.platform === "win32") return;
  assert.equal(normalizeComposePath("/home/user/dune"), "/home/user/dune");
});
