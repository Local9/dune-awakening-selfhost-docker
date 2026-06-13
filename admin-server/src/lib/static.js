import { existsSync, createReadStream } from "node:fs";
import { extname } from "node:path";
import { json, withSecurityHeaders } from "../core/auth.js";
import { safeStaticTarget } from "../core/httpSafety.js";

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"]
]);

export function knownServices() {
  return ["postgres", "rmq-admin", "rmq-game", "text-router", "director", "gateway", "survival-1", "overmap", "orchestrator", "autoscaler"];
}

export function serveStatic(req, res, config) {
  const path = new URL(req.url || "/", "http://localhost").pathname;
  const target = safeStaticTarget(config.staticDir, path);
  if (!existsSync(target)) {
    json(res, 200, { app: config.appName, message: "Frontend is not built yet. Run pnpm install && pnpm run build in web/." });
    return;
  }
  res.writeHead(200, withSecurityHeaders({ "content-type": mime.get(extname(target)) || "application/octet-stream" }));
  createReadStream(target).pipe(res);
}
