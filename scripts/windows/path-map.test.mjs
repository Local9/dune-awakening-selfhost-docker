import test from "node:test";
import assert from "node:assert/strict";
import { toWslPath } from "../lib/wsl-path.mjs";

test("toWslPath maps drive-letter paths", () => {
  assert.equal(toWslPath("D:\\workspace\\dune"), "/mnt/d/workspace/dune");
  assert.equal(toWslPath("D:/workspace/dune"), "/mnt/d/workspace/dune");
  assert.equal(toWslPath("C:\\"), "/mnt/c");
});

test("toWslPath rejects non-windows paths", () => {
  assert.throws(() => toWslPath("/home/user/dune"), /Not a Windows absolute path/);
});
