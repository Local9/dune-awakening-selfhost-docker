import test from "node:test";
import assert from "node:assert/strict";
import { confirmedTask, dbJson } from "../src/lib/apiHelpers.js";
import { json } from "../src/core/auth.js";

function mockCtx() {
  return {
    config: { mockMode: false, maxJsonBytes: 4096 },
    tasks: { create: () => ({ id: "t1" }) },
    auth: { requireAuth: () => ({ csrf: "x" }) }
  };
}

function mockRes() {
  return {
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
}

function mockReq(body) {
  return {
    method: "POST",
    url: "/api/test",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    }
  };
}

test("confirmedTask requires confirmation phrase", async () => {
  const ctx = mockCtx();
  const res = mockRes();
  await confirmedTask(ctx, mockReq({}), res, "admin", "adminKickAllOnline", {}, "KICK ALL ONLINE PLAYERS");
  assert.equal(res.statusCode, 400);
  assert.match(res.body, /Confirmation phrase required/);
});

test("dbJson returns 501 for unsupported capability errors", async () => {
  const ctx = mockCtx();
  const res = mockRes();
  const error = new Error("Not supported");
  error.unsupported = true;
  await dbJson(ctx, res, async () => { throw error; });
  assert.equal(res.statusCode, 501);
  const body = JSON.parse(res.body);
  assert.equal(body.supported, false);
});
