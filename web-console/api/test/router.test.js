import test from "node:test";
import assert from "node:assert/strict";
import { createRouter } from "../src/app/router.js";
import { json } from "../src/core/auth.js";

function mockCtx(authResult = { csrf: "token" }) {
  return {
    config: { appName: "Test", maxJsonBytes: 1024 },
    auth: {
      requireAuth: (req, res) => {
        if (authResult === null) {
          json(res, 401, { error: "Unauthorized" });
          return null;
        }
        return authResult;
      }
    }
  };
}

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(body) {
      this.body = body || "";
    }
  };
  return res;
}

test("router matches static paths and extracts params", async () => {
  const ctx = mockCtx();
  const router = createRouter(ctx);
  let captured = null;

  router.get("/api/players/online", () => {});
  router.get("/api/players/:playerId", (_req, _res, _ctx, meta) => { captured = meta.params; });

  const req = { method: "GET", url: "/api/players/alice%2F1" };
  const res = mockRes();
  await router.handle(req, res);
  assert.deepEqual(captured, { playerId: "alice/1" });
});

test("router prefers earlier registered routes", async () => {
  const ctx = mockCtx();
  const router = createRouter(ctx);
  let hit = "";

  router.get("/api/players/online", () => { hit = "online"; });
  router.get("/api/players/:playerId", () => { hit = "param"; });

  const req = { method: "GET", url: "/api/players/online" };
  const res = mockRes();
  await router.handle(req, res);
  assert.equal(hit, "online");
});

test("router enforces auth on protected routes", async () => {
  const ctx = mockCtx(null);
  const router = createRouter(ctx);
  router.get("/api/secret", () => {});

  const req = { method: "GET", url: "/api/secret" };
  const res = mockRes();
  await router.handle(req, res);
  assert.equal(res.statusCode, 401);
});

test("router returns 404 for unknown paths", async () => {
  const ctx = mockCtx();
  const router = createRouter(ctx);
  const req = { method: "GET", url: "/api/missing" };
  const res = mockRes();
  await router.handle(req, res);
  assert.equal(res.statusCode, 404);
});

test("router respects HTTP method", async () => {
  const ctx = mockCtx();
  const router = createRouter(ctx);
  let hit = false;
  router.post("/api/action", () => { hit = true; });

  const req = { method: "GET", url: "/api/action" };
  const res = mockRes();
  await router.handle(req, res);
  assert.equal(hit, false);
  assert.equal(res.statusCode, 404);
});
