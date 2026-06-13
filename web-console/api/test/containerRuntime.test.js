import test from "node:test";
import assert from "node:assert/strict";
import { containerCommand } from "../src/platform/containerRuntime.js";

test("containerCommand defaults to docker", () => {
  const original = process.env.DUNE_CONTAINER_CLI;
  delete process.env.DUNE_CONTAINER_CLI;
  assert.equal(containerCommand(), "docker");
  if (original) process.env.DUNE_CONTAINER_CLI = original;
});

test("containerCommand respects DUNE_CONTAINER_CLI", () => {
  process.env.DUNE_CONTAINER_CLI = "podman";
  assert.equal(containerCommand(), "podman");
  delete process.env.DUNE_CONTAINER_CLI;
});
