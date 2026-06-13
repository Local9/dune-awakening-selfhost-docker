import type { Task } from "../api/setup";
import type { CarePackageConfig, CarePackageEntry, CarePackageAutoGrantRule } from "../api/carePackage";
import type { UserSettingField } from "../api/maps";

export type Tab = "Home" | "Setup" | "Server Control" | "Services" | "Players" | "Admin Tools" | "Live Map" | "Maps" | "Care Package" | "Addons" | "Database" | "Storage" | "Backups" | "Logs" | "Updates" | "Settings";
export type SetupState = { files: Record<string, boolean>; config: Record<string, unknown> };
export type HomeLoadResult = { statusLoaded: boolean; readinessLoaded: boolean; statusError: string; readinessError: string; statusText: string; readinessText: string };
export type CatalogItem = { name: string; id: string; itemId?: string; category?: string; source?: string; image?: string };
export type CraftingRecipeRow = { recipeId: string; displayName: string; category: string; source: string; qualityLevel: number; unlocked: boolean };
export type ResearchItemRow = { itemKey: string; displayName: string; category: string; productGroup: string; type: string; unlockedState: string; unlocked: boolean; isNew: boolean };
export type SkillModuleCatalogRow = { skillModule: string; category: string; id: string; maxLevel: number };
export type SkillCard = { name: string; type: string; rank: string };
export type SpecializationTrackRow = { trackType: string; xp: number; level: number };
export type JourneyRow = { id: string; name: string; rawName: string; category: string; depth: number; parentId: string; dependency?: string; status: string; complete: boolean; revealed?: boolean; pendingReward?: boolean; tags?: number; state?: number | null };
export type BackupResult = { status: "running" | "succeeded" | "failed"; title: string; message?: string; details?: string; tone?: "danger" | "attention" };
export type HomeTaskResult = { status: "running" | "succeeded" | "failed" | "stopped"; title: string; message?: string; details?: string };
export type DatabasePasswordState = { taskId?: string; result: HomeTaskResult | null };
export type PersistedMapsTask = { taskId?: string; result: HomeTaskResult | null; runningTitle?: string; successTitle?: string };
export type ConfirmDialogDetail = { label: string; value: string; tone?: "accent" | "success" | "danger" };
export type ConfirmDialogRequest = { title: string; message: string; confirmLabel: string; cancelLabel: string; danger: boolean; details?: ConfirmDialogDetail[]; resolve: (confirmed: boolean) => void };

export type SietchRow = {
  dimension: string;
  partitionId: string;
  displayName: string;
  passwordSet: boolean;
  map: string;
};

export type LiveMapPoint = { x: number; y: number };
