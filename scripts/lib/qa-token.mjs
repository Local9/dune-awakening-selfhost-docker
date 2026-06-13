import { existsSync, readFileSync } from "node:fs";

export function parseEnvValue(raw) {
  let value = String(raw ?? "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value.trim();
}

export function readEnvFileValue(envPath, key) {
  if (!envPath || !existsSync(envPath)) return "";
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = normalized.indexOf("=");
    if (eq <= 0) continue;
    const lineKey = normalized.slice(0, eq).trim();
    if (lineKey !== key) continue;
    return parseEnvValue(normalized.slice(eq + 1));
  }
  return "";
}

export function resolveQaFuncomToken({ envPath, processEnv = process.env } = {}) {
  const fromEnv = String(processEnv.DUNE_QA_FUNCOM_TOKEN ?? "").trim();
  if (fromEnv) return fromEnv;
  return readEnvFileValue(envPath, "DUNE_QA_FUNCOM_TOKEN");
}
