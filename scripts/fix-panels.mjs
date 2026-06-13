#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "web-console", "web", "src");
const backup = readFileSync(join(src, "App.tsx.bak"), "utf8");
const lines = backup.split(/\r?\n/);

const confirmLine = lines.findIndex((l) => l.startsWith("function ConfirmDialog"));
const panelsBody = lines.slice(confirmLine)
  .join("\n")
  .replace(/^function (\w+)/gm, "export function $1")
  .replace(/\bmapsApi\.(sietches|sietchDimensions|updateSietches|deepdesert|updateDeepdesert)\b/g, "sietchesApi.$1");

const header = `import { Fragment, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import { carePackageApi } from "../api/carePackage";
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
import type {
  CatalogItem, CraftingRecipeRow, ResearchItemRow, SkillModuleCatalogRow, SkillCard,
  SpecializationTrackRow, JourneyRow, BackupResult, DatabasePasswordState, PersistedMapsTask,
  HomeTaskResult, HomeLoadResult, SietchRow, LiveMapPoint, ConfirmDialogRequest
} from "../types";
import type { CarePackageConfig, CarePackageEntry, CarePackageAutoGrantRule } from "../api/carePackage";
`;

mkdirSync(join(src, "features"), { recursive: true });
writeFileSync(join(src, "features", "panels.tsx"), header + "\n" + panelsBody, "utf8");
console.log("panels.tsx regenerated from backup, lines:", panelsBody.split("\n").length);
