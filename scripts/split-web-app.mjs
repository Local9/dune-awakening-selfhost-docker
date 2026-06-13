#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web", "src");
const appPath = join(src, "App.tsx");
const backupPath = join(src, "App.tsx.bak");

if (!existsSync(backupPath)) copyFileSync(appPath, backupPath);

const lines = readFileSync(appPath, "utf8").split(/\r?\n/);

const fnStarts = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(export )?function (\w+)/);
  if (m) fnStarts.push({ name: m[2], line: i });
}
fnStarts.push({ name: "__END__", line: lines.length });

function sliceFn(name) {
  const idx = fnStarts.findIndex((f) => f.name === name);
  if (idx < 0) return "";
  return lines.slice(fnStarts[idx].line, fnStarts[idx + 1].line).join("\n");
}

function write(path, body) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
  console.log("wrote", path.replace(root, ""));
}

// types
write(join(src, "types", "index.ts"), `import type { Task } from "../api/setup";
import type { CarePackageConfig, CarePackageEntry, CarePackageAutoGrantRule } from "../api/carePackage";
import type { UserSettingField } from "../api/maps";

${lines.slice(25, 41).join("\n").replace(/^type /gm, "export type ")}

export type SietchRow = {
  dimension: string;
  partitionId: string;
  displayName: string;
  passwordSet: boolean;
  map: string;
};

export type LiveMapPoint = { x: number; y: number };
`);

write(join(src, "constants", "links.ts"), lines.slice(124, 127).join("\n").replace(/^const /gm, "export const "));

write(join(src, "constants", "services.ts"), `export const VEHICLE_SPAWN_OFFSET_UNITS = 1000;
export const FUNCOM_TOKEN_AUTH_ERROR_KEY = "arrakis.funcomTokenAuthError";
export const DATABASE_PASSWORD_STATE_KEY = "arrakis.databasePasswordState";
export const GAME_UPDATE_TASK_KEY = "arrakis.gameUpdateTask";
export const STACK_UPDATE_TASK_KEY = "arrakis.stackUpdateTask";
export const UPDATE_RESULT_DISMISS_MS = 10000;

export const RESTARTABLE_SERVICES = ${lines.slice(201, 210).join("\n").replace(/^const RESTARTABLE_SERVICES = /, "")}

export const SERVICE_LABELS: Record<string, string> = ${lines.slice(218, 239).join("\n").replace(/^const SERVICE_LABELS: Record<string, string> = /, "")}
`);

write(join(src, "constants", "navigation.tsx"), `import { Archive, Database, FileText, Gift, Home, Map as MapIcon, PackagePlus, RefreshCw, Server, Settings, Shield, Sparkles, Users } from "lucide-react";
import type { Tab } from "../types";

export const navGroups: { title: string; items: { tab: Tab; icon: React.ReactNode }[] }[] = ${lines.slice(92, 122).join("\n").replace(/^const navGroups[^=]*=\s*/, "")}
`);

write(join(src, "lib", "confirmDialog.ts"), `import type { ConfirmDialogRequest } from "../types";

let openConfirmDialog: ((request: ConfirmDialogRequest) => void) | null = null;

export function setOpenConfirmDialog(handler: ((request: ConfirmDialogRequest) => void) | null) {
  openConfirmDialog = handler;
}

${sliceFn("confirmDialog").replace(/^function /, "export function ")}
${sliceFn("confirmSettingsRestart").replace(/^function /, "export function ")}
`);

write(join(src, "lib", "tasks.ts"), `import { setupApi, type Task } from "../api/setup";

${sliceFn("waitForTask").replace(/^async function /, "export async function ")}
${sliceFn("waitForTaskSilently").replace(/^async function /, "export async function ")}
${sliceFn("waitForTaskWithUpdates").replace(/^async function /, "export async function ")}
${sliceFn("withTimeout").replace(/^function /, "export function ")}
${sliceFn("isTerminalTask").replace(/^function /, "export function ")}
${sliceFn("taskTechnicalDetails").replace(/^function /, "export function ")}
`);

write(join(src, "lib", "persistence.ts"), `import type { Task } from "../api/setup";
import type { DatabasePasswordState, HomeTaskResult, PersistedMapsTask } from "../types";
import { DATABASE_PASSWORD_STATE_KEY, FUNCOM_TOKEN_AUTH_ERROR_KEY, GAME_UPDATE_TASK_KEY, STACK_UPDATE_TASK_KEY } from "../constants/services";

${[
  "loadDatabasePasswordState", "persistDatabasePasswordState",
  "funcomTokenRestartTaskResult", "funcomTokenMismatchResult", "funcomTokenMismatchFromLogResult",
  "isFuncomTokenAuthFailure", "loadPersistedFuncomTokenResult", "hasPersistedFuncomTokenAuthFailure",
  "persistFuncomTokenResult", "parseUpdateTask", "loadPersistedUpdateTask", "persistUpdateTask",
  "loadPersistedMapsResult", "loadPersistedMapsTask", "persistMapsResult", "persistMapsTask",
  "isMissingPersistedTaskError"
].map((n) => sliceFn(n).replace(/^function /, "export function ")).join("\n\n")}
`);

write(join(src, "lib", "updates.ts"), [
  "updateDisplayValue", "stackVersionButtonLabel", "stackVersionButtonTitle", "formatStackVersionLabel",
  "canApplyUpdateStatus", "sameUpdateVersion", "normalizeUpdateVersion", "toHourMinuteTime",
  "sanitizeTimeInput", "isValidHourMinuteTime", "firstVersionMatch",
  "summarizeGameUpdateProgress", "isSteamcmdUpdateActive", "summarizeSteamcmdStage", "gameUpdatePercent",
  "friendlyGameUpdateMessage", "friendlyGameUpdateLine", "isSteamcmdManifestFailure",
  "summarizeStackUpdateProgress", "stackUpdatePercent", "friendlyStackUpdateMessage",
  "summarizeStackUpdateStage", "nextIndentedLine", "friendlyStackUpdateLine"
].map((n) => sliceFn(n).replace(/^function /, "export function ")).join("\n\n"));

write(join(src, "components", "DiscordLogo.tsx"), sliceFn("DiscordLogo").replace(/^function /, "export function "));
write(join(src, "components", "KofiLogo.tsx"), sliceFn("KofiLogo").replace(/^function /, "export function "));

const panelsHeader = `import { Fragment, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Archive, ChevronDown, ChevronUp, Database, FileText, Gift, Heart, Home, Lock, Map as MapIcon, MessageCircle, PackagePlus, Play, RefreshCw, Server, Settings, Shield, Sparkles, Users, X } from "lucide-react";
import { api, post } from "../api/client";
import { serverApi } from "../api/server";
import type { PerformanceSnapshot } from "../api/server";
import { playersApi } from "../api/players";
import { logsApi } from "../api/logs";
import { backupsApi } from "../api/backups";
import { databaseApi } from "../api/database";
import { mapsApi, type LiveMapMemoryRow, type SwapMemoryState, type UserSettingField, type UserSettingsSchema } from "../api/maps";
import { sietchesApi } from "../api/sietches";
import { updatesApi } from "../api/updates";
import { worldDataApi } from "../api/worldData";
import { adminApi } from "../api/admin";
import { carePackageApi, type CarePackageConfig, type CarePackageEntry } from "../api/carePackage";
import type { CarePackageAutoGrantRule } from "../api/carePackage";
import { setupApi, type Task } from "../api/setup";
import { liveMapApi, type LiveMapConfig, type LiveMapMarker, type LiveMapPartition } from "../api/liveMap";
import { settingsApi } from "../api/settings";
import { SetupWizard } from "../components/SetupWizard";
import { TaskProgress } from "../components/TaskProgress";
import { LogViewer } from "../components/LogViewer";
import { PortChecklist } from "../components/PortChecklist";
import { ReadinessTimeline } from "../components/ReadinessTimeline";
import { SecretInput } from "../components/SecretInput";
import { DiscordLogo } from "../components/DiscordLogo";
import { KofiLogo } from "../components/KofiLogo";
import { confirmDialog } from "../lib/confirmDialog";
import { waitForTask, waitForTaskSilently, waitForTaskWithUpdates } from "../lib/tasks";
import * as persistence from "../lib/persistence";
import { stackVersionButtonLabel, stackVersionButtonTitle } from "../lib/updates";
import { RESTARTABLE_SERVICES, SERVICE_LABELS, VEHICLE_SPAWN_OFFSET_UNITS, UPDATE_RESULT_DISMISS_MS } from "../constants/services";
import { REDBLINK_REPO_URL, REDBLINK_DISCORD_URL, REDBLINK_KOFI_URL } from "../constants/links";
import type { CatalogItem, CraftingRecipeRow, ResearchItemRow, SkillModuleCatalogRow, SkillCard, SpecializationTrackRow, JourneyRow, BackupResult, DatabasePasswordState, PersistedMapsTask, HomeTaskResult, HomeLoadResult, SietchRow, LiveMapPoint } from "../types";
`;

const appIdx = fnStarts.findIndex((f) => f.name === "App");
const confirmIdx = fnStarts.findIndex((f) => f.name === "ConfirmDialog");
let panelsBody = lines.slice(confirmIdx).join("\n")
  .replace(/^function (\w+)/gm, "export function $1")
  .replace(/\bmapsApi\.(sietches|sietchDimensions|updateSietches|deepdesert|updateDeepdesert)\b/g, "sietchesApi.$1")
  .replace(/let openConfirmDialog[^;]+;/, "")
  .replace(/function confirmDialog\([\s\S]*?^}/m, "")
  .replace(/function confirmSettingsRestart\([\s\S]*?^}/m, "");

write(join(src, "features", "panels.tsx"), panelsHeader + "\n" + panelsBody);

// Feature re-exports
const featureExports = [
  ["home", "HomePanel"],
  ["server", "ServerPanel"],
  ["services", "ServicesPanel"],
  ["players", "PlayersPanel"],
  ["admin", "AdminToolsPanel"],
  ["liveMap", "LiveMapPanel"],
  ["maps", "MapsPanel"],
  ["carePackage", "CarePackagePanel"],
  ["addons", "AddonsPanel"],
  ["database", "DatabasePanel"],
  ["storage", "StoragePanel"],
  ["backups", "BackupsPanel"],
  ["logs", "LogsPanel"],
  ["updates", "UpdatesPanel"],
  ["settings", "SettingsPanel"]
];
for (const [dir, panel] of featureExports) {
  write(join(src, "features", dir, `${panel}.tsx`), `export { ${panel} } from "../panels";\n`);
}

write(join(src, "features", "index.ts"), featureExports.map(([, p]) => `export { ${p} } from "./panels";`).join("\n") + `\nexport { ConfirmDialog } from "./panels";\n`);

const appBody = sliceFn("App")
  .replace(/api<\{ authenticated: boolean; csrfToken: string \| null \}>\("\/api\/auth\/state"\)/g, "authApi.state()")
  .replace(/const result = await post<\{ authenticated: boolean; csrfToken: string \}>\("\/api\/auth\/login", \{ password \}\)/, "const result = await authApi.login(password)")
  .replace(/await post\("\/api\/auth\/logout"\)/g, "await authApi.logout()")
  .replace(/openConfirmDialog = \(request\) => setConfirmRequest\(request\)/, "setOpenConfirmDialog((request) => setConfirmRequest(request))")
  .replace(/openConfirmDialog = null/, "setOpenConfirmDialog(null)")
  .replace(/loadPersistedFuncomTokenResult\(\)/g, "persistence.loadPersistedFuncomTokenResult()")
  .replace(/persistFuncomTokenResult\(/g, "persistence.persistFuncomTokenResult(")
  .replace(/parseUpdateTask\(/g, "persistence.parseUpdateTask(")
  .replace(/withTimeout\(/g, "withTimeout(");

write(join(src, "App.tsx"), `import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, MessageCircle } from "lucide-react";
import { setCsrfToken } from "./api/client";
import { authApi } from "./api/auth";
import { setupApi, type Task } from "./api/setup";
import { updatesApi } from "./api/updates";
import { serverApi } from "./api/server";
import { SetupWizard } from "./components/SetupWizard";
import { TaskProgress } from "./components/TaskProgress";
import { DiscordLogo } from "./components/DiscordLogo";
import { KofiLogo } from "./components/KofiLogo";
import { setOpenConfirmDialog } from "./lib/confirmDialog";
import { withTimeout, waitForTaskSilently } from "./lib/tasks";
import * as persistence from "./lib/persistence";
import { stackVersionButtonLabel, stackVersionButtonTitle } from "./lib/updates";
import { navGroups } from "./constants/navigation";
import { REDBLINK_REPO_URL, REDBLINK_DISCORD_URL, REDBLINK_KOFI_URL } from "./constants/links";
import type { Tab, SetupState, HomeTaskResult, HomeLoadResult, ConfirmDialogRequest } from "./types";
import {
  HomePanel, ServerPanel, ServicesPanel, PlayersPanel, AdminToolsPanel,
  LiveMapPanel, MapsPanel, CarePackagePanel, AddonsPanel, DatabasePanel,
  StoragePanel, BackupsPanel, LogsPanel, UpdatesPanel, SettingsPanel, ConfirmDialog
} from "./features/panels";

${appBody}
`);

console.log("Done.");
