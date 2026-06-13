import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const routesDir = join(dirname(fileURLToPath(import.meta.url)), "../src/routes");

test("route files do not use router.any", () => {
  const files = readdirSync(routesDir).filter((name) => name.endsWith(".js"));
  for (const file of files) {
    const source = readFileSync(join(routesDir, file), "utf8");
    assert.equal(source.includes("router.any"), false, `${file} must not register router.any routes`);
  }
});

test("server read endpoints are registered with router.get", () => {
  const source = readFileSync(join(routesDir, "server.js"), "utf8");
  const readPaths = [
    "/api/server/status",
    "/api/server/performance",
    "/api/server/readiness",
    "/api/server/ports",
    "/api/server/services",
    "/api/server/doctor",
    "/api/server/funcom-token/check",
    "/api/server/restart-schedule"
  ];
  for (const path of readPaths) {
    assert.match(source, new RegExp(`router\\.get\\("${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});
