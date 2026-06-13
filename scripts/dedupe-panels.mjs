#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const panelsPath = join(root, "web-console", "web", "src", "features", "panels.tsx");
let content = readFileSync(panelsPath, "utf8");

// Remove duplicate lib functions (now imported from lib/*)
const removeFns = [
  "waitForTask", "waitForTaskSilently", "waitForTaskWithUpdates",
  "loadDatabasePasswordState", "persistDatabasePasswordState",
  "funcomTokenRestartTaskResult", "funcomTokenMismatchResult", "funcomTokenMismatchFromLogResult",
  "isFuncomTokenAuthFailure", "loadPersistedFuncomTokenResult", "hasPersistedFuncomTokenAuthFailure",
  "persistFuncomTokenResult", "parseUpdateTask", "loadPersistedUpdateTask", "persistUpdateTask",
  "loadPersistedMapsResult", "loadPersistedMapsTask", "persistMapsResult", "persistMapsTask",
  "isMissingPersistedTaskError",
  "updateDisplayValue", "stackVersionButtonLabel", "stackVersionButtonTitle", "formatStackVersionLabel",
  "canApplyUpdateStatus", "sameUpdateVersion", "normalizeUpdateVersion", "toHourMinuteTime",
  "sanitizeTimeInput", "isValidHourMinuteTime", "firstVersionMatch",
  "summarizeGameUpdateProgress", "isSteamcmdUpdateActive", "summarizeSteamcmdStage", "gameUpdatePercent",
  "friendlyGameUpdateMessage", "friendlyGameUpdateLine", "isSteamcmdManifestFailure",
  "summarizeStackUpdateProgress", "stackUpdatePercent", "friendlyStackUpdateMessage",
  "summarizeStackUpdateStage", "nextIndentedLine", "friendlyStackUpdateLine"
];

for (const name of removeFns) {
  const asyncRe = new RegExp(`export async function ${name}\\([\\s\\S]*?^}`, "m");
  const syncRe = new RegExp(`export function ${name}\\([\\s\\S]*?^}`, "m");
  const asyncRe2 = new RegExp(`async function ${name}\\([\\s\\S]*?^}`, "m");
  const syncRe2 = new RegExp(`function ${name}\\([\\s\\S]*?^}`, "m");
  content = content.replace(asyncRe, "").replace(syncRe, "").replace(asyncRe2, "").replace(syncRe2, "");
}

// Prefix persistence calls
const persistenceFns = [
  "loadDatabasePasswordState", "persistDatabasePasswordState",
  "funcomTokenRestartTaskResult", "funcomTokenMismatchResult", "funcomTokenMismatchFromLogResult",
  "isFuncomTokenAuthFailure", "loadPersistedFuncomTokenResult", "hasPersistedFuncomTokenAuthFailure",
  "persistFuncomTokenResult", "parseUpdateTask", "loadPersistedUpdateTask", "persistUpdateTask",
  "loadPersistedMapsResult", "loadPersistedMapsTask", "persistMapsResult", "persistMapsTask",
  "isMissingPersistedTaskError"
];
for (const name of persistenceFns) {
  content = content.replace(new RegExp(`(?<!persistence\\.)\\b${name}\\(`, "g"), `persistence.${name}(`);
}

// Prefix update lib calls for functions still used inline in panels
const updateFns = [
  "updateDisplayValue", "formatStackVersionLabel", "canApplyUpdateStatus", "sameUpdateVersion",
  "normalizeUpdateVersion", "toHourMinuteTime", "sanitizeTimeInput", "isValidHourMinuteTime",
  "firstVersionMatch", "summarizeGameUpdateProgress", "isSteamcmdUpdateActive", "summarizeSteamcmdStage",
  "gameUpdatePercent", "friendlyGameUpdateMessage", "friendlyGameUpdateLine", "isSteamcmdManifestFailure",
  "summarizeStackUpdateProgress", "stackUpdatePercent", "friendlyStackUpdateMessage",
  "summarizeStackUpdateStage", "nextIndentedLine", "friendlyStackUpdateLine"
];
content = content.replace(
  /import \{ stackVersionButtonLabel, stackVersionButtonTitle \} from "\.\.\/lib\/updates";/,
  `import * as updatesLib from "../lib/updates";
import { stackVersionButtonLabel, stackVersionButtonTitle } from "../lib/updates";`
);
for (const name of updateFns) {
  content = content.replace(new RegExp(`(?<!updatesLib\\.)\\b${name}\\(`, "g"), `updatesLib.${name}(`);
}

writeFileSync(panelsPath, content.replace(/\n{4,}/g, "\n\n\n"), "utf8");
console.log("deduped panels.tsx");
