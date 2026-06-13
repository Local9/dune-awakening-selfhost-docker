import { json } from "../core/auth.js";
import { redact } from "../core/redact.js";
import { buildDuneArgs, runDockerLogs, runDune, validateServiceName } from "../platform/runner.js";
import { knownServices } from "../lib/static.js";

export async function discoverServices(ctx) {
  const services = new Set(knownServices());
  if (ctx.config.mockMode) return [...services].sort();
  try {
    const result = await runDune(ctx.config, buildDuneArgs("services"), { timeoutMs: 8000 });
    for (const name of parseServiceNames(result.stdout)) services.add(name);
  } catch {
    // Fall back to the static allowlist when Docker is not reachable.
  }
  return [...services].sort();
}

function parseServiceNames(text) {
  const names = [];
  const aliases = new Map([
    ["dune-postgres", "postgres"],
    ["dune-rmq-admin", "rmq-admin"],
    ["dune-rmq-game", "rmq-game"],
    ["dune-text-router", "text-router"],
    ["dune-director", "director"],
    ["dune-server-gateway", "gateway"],
    ["dune-server-survival-1", "survival-1"],
    ["dune-server-overmap", "overmap"],
    ["dune-orchestrator", "orchestrator"],
    ["dune-autoscaler", "autoscaler"]
  ]);
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^names\s+/i.test(trimmed)) continue;
    const name = trimmed.split(/\s+/)[0];
    if (aliases.has(name)) {
      names.push(aliases.get(name));
    } else if (/^dune-server-[a-z0-9-]+$/i.test(name)) {
      names.push(name);
    }
  }
  return names;
}

function readLogs(service, options) {
  return runDockerLogs(service, options);
}

export async function logsRoute(ctx, req, res, { params }) {
  const service = validateServiceName(params.service);
  const sub = params.sub || "";

  if (sub === "download") {
    try {
      const result = await readLogs(service, { timeoutMs: 30000 });
      const filename = `dune-${service}-logs.txt`.replace(/[^A-Za-z0-9._-]/g, "_");
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`
      });
      res.end(result.stdout || result.stderr || "");
    } catch (error) {
      json(res, 500, { error: redact(error.stdout || error.message || error) });
    }
    return;
  }
  if (sub === "stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    try {
      await readLogs(service, {
        follow: true,
        timeoutMs: 30 * 60 * 1000,
        onLine: (line) => res.write(`data: ${JSON.stringify({ line })}\n\n`)
      });
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: redact(error.message) })}\n\n`);
    }
    return;
  }
  let output = "";
  try {
    await readLogs(service, {
      timeoutMs: 5000,
      onLine: (line) => { output += line; }
    });
  } catch (error) {
    if (!output) output = redact(error.stdout || error.message || "");
  }
  return json(res, 200, { operation: "logs", stdout: output, stderr: "", exitCode: 0 });
}
