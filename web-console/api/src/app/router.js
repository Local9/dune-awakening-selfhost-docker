import { json } from "../core/auth.js";
import { publicTask } from "../platform/tasks.js";

function compilePattern(pattern) {
  const parts = pattern.split("/").filter(Boolean);
  const keys = [];
  const regexParts = parts.map((part) => {
    if (part.startsWith(":")) {
      keys.push(part.slice(1));
      return "([^/]+)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  return {
    keys,
    regex: new RegExp(`^/${regexParts.join("/")}$`)
  };
}

export function createRouter(ctx) {
  const routes = [];

  function add(method, pattern, handler, { auth = true } = {}) {
    const compiled = compilePattern(pattern);
    routes.push({ method, pattern, handler, auth, ...compiled });
  }

  function route(method, pattern, handler, opts) {
    add(method, pattern, handler, opts);
    return router;
  }

  const router = {
    get: (pattern, handler, opts) => route("GET", pattern, handler, opts),
    post: (pattern, handler, opts) => route("POST", pattern, handler, opts),
    patch: (pattern, handler, opts) => route("PATCH", pattern, handler, opts),
    delete: (pattern, handler, opts) => route("DELETE", pattern, handler, opts),
    any: (pattern, handler, opts) => route("*", pattern, handler, opts),
    add,
    async handle(req, res) {
      const url = new URL(req.url, "http://localhost");
      const pathname = url.pathname;
      const method = req.method || "GET";

      for (const entry of routes) {
        if (entry.method !== "*" && entry.method !== method) continue;
        const match = pathname.match(entry.regex);
        if (!match) continue;

        const params = {};
        for (let i = 0; i < entry.keys.length; i += 1) {
          params[entry.keys[i]] = decodeURIComponent(match[i + 1]);
        }

        if (entry.auth) {
          const session = ctx.auth.requireAuth(req, res);
          if (!session) return;
        }

        return entry.handler(req, res, ctx, { url, params });
      }

      return json(res, 404, { error: "Not found" });
    }
  };

  return router;
}

export function taskRoute(ctx, req, res, { params }) {
  const id = params.id;
  const sub = params.sub || "";
  const taskObj = ctx.tasks.get(id);
  if (!taskObj) return json(res, 404, { error: "Task not found" });
  if (sub === "stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify(publicTask(taskObj))}\n\n`);
    const unsubscribe = ctx.tasks.subscribe(id, (data) => res.write(data));
    req.on("close", unsubscribe);
    return;
  }
  return json(res, 200, { task: publicTask(taskObj) });
}
