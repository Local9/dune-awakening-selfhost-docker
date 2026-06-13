import { createServer } from "node:http";
import { createAppContext } from "./app/context.js";
import { createRouter } from "./app/router.js";
import { registerAllRoutes } from "./routes/index.js";
import { serveStatic } from "./lib/static.js";
import { json } from "./core/auth.js";
import { redact } from "./core/redact.js";
import { carePackageAutoTick } from "./routes/carePackage.js";
import { runSwapMemoryTick, SWAP_MEMORY_INTERVAL_MS } from "./services/swapMemory.js";
import { scheduleBootAutoStart } from "./services/boot.js";

const ctx = createAppContext();
const router = createRouter(ctx);
registerAllRoutes(router, ctx);

createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) {
      await router.handle(req, res);
      return;
    }
    serveStatic(req, res, ctx.config);
  } catch (error) {
    json(res, error.statusCode || 500, { error: redact(error.message || error) });
  }
}).listen(ctx.config.port, ctx.config.host, () => {
  console.log(`${ctx.config.appName} API listening on http://${ctx.config.host}:${ctx.config.port}`);
  if (!ctx.config.authDisabled) {
    console.log("Initial admin password is stored in runtime/secrets/admin-web-password.txt");
  }
  scheduleBootAutoStart(ctx);
});

setInterval(() => {
  void carePackageAutoTick(ctx);
}, 10000).unref?.();

setInterval(() => {
  if (!ctx.swapMemory.enabled) return;
  void runSwapMemoryTick(ctx);
}, SWAP_MEMORY_INTERVAL_MS).unref?.();
