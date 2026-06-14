import test from "node:test";
import assert from "node:assert/strict";
import { normalizeComposePath, pickContainerCli } from "./container-runtime.mjs";

test("normalizeComposePath on Windows uses forward slashes", () => {
  if (process.platform !== "win32") return;
  assert.equal(normalizeComposePath("D:\\workspace\\dune"), "D:/workspace/dune");
});

test("normalizeComposePath on Unix leaves paths unchanged", () => {
  if (process.platform === "win32") return;
  assert.equal(normalizeComposePath("/home/user/dune"), "/home/user/dune");
});

test("pickContainerCli prefers podman when both are available", () => {
  assert.equal(pickContainerCli({ podmanOk: true, dockerOk: true }), "podman");
});

test("pickContainerCli falls back to docker when podman is unavailable", () => {
  assert.equal(pickContainerCli({ podmanOk: false, dockerOk: true }), "docker");
});

test("pickContainerCli throws when no cli works", () => {
  assert.throws(
    () => pickContainerCli({ podmanOk: false, dockerOk: false }),
    /No working container CLI found/
  );
});
