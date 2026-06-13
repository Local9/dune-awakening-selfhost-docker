import type { Task } from "../api/setup";
import type { DatabasePasswordState, HomeTaskResult, PersistedMapsTask } from "../types";
import { DATABASE_PASSWORD_STATE_KEY, FUNCOM_TOKEN_AUTH_ERROR_KEY, MAPS_RESULT_KEY } from "../constants/services";
import { isTerminalTask } from "./tasks";
import { funcomTokenMismatchDetected, conciseTaskError, summarizeCommandText } from "./taskErrors";
import { taskTechnicalDetails } from "./tasks";
import { firstVersionMatch, sameUpdateVersion } from "./updates";

export function loadDatabasePasswordState(): DatabasePasswordState {
  if (typeof window === "undefined") return { result: null };
  try {
    const raw = window.localStorage.getItem(DATABASE_PASSWORD_STATE_KEY);
    if (!raw) return { result: null };
    const parsed = JSON.parse(raw) as DatabasePasswordState;
    return parsed && parsed.result ? parsed : { result: null };
  } catch {
    return { result: null };
  }
}

export function persistDatabasePasswordState(state: DatabasePasswordState) {
  if (typeof window === "undefined") return;
  if (!state.result) {
    window.localStorage.removeItem(DATABASE_PASSWORD_STATE_KEY);
    return;
  }
  window.localStorage.setItem(DATABASE_PASSWORD_STATE_KEY, JSON.stringify(state));
}

export function funcomTokenRestartTaskResult(task: Task): HomeTaskResult {
  const details = taskTechnicalDetails(task);
  if (funcomTokenMismatchDetected(details) || funcomTokenMismatchDetected(task.errorMessage || "")) {
    return funcomTokenMismatchResult(details);
  }
  if (task.status === "failed") {
    return {
      status: "failed",
      title: "Funcom Token Change Failed",
      message: "The token was saved, but the server restart failed. Check the task details and try again.",
      details
    };
  }
  if (task.status === "succeeded") {
    return { status: "running", title: "Checking Funcom Token", details };
  }
  return { status: "running", title: "Restarting Server", details };
}

export function funcomTokenMismatchResult(details: string): HomeTaskResult {
  return {
    status: "failed",
    title: "Authorization Failed",
    message: "Please make sure the Funcom token belongs to the current Battlegroup ID, then save it again.",
    details
  };
}

export function funcomTokenMismatchFromLogResult(details: string): HomeTaskResult {
  return funcomTokenMismatchResult(details);
}

export function isFuncomTokenAuthFailure(result: HomeTaskResult | null) {
  return Boolean(result && result.status === "failed" && funcomTokenMismatchDetected(result.details || ""));
}

export function loadPersistedFuncomTokenResult(): HomeTaskResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FUNCOM_TOKEN_AUTH_ERROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeTaskResult;
    return isFuncomTokenAuthFailure(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function hasPersistedFuncomTokenAuthFailure() {
  return Boolean(loadPersistedFuncomTokenResult());
}

export function persistFuncomTokenResult(result: HomeTaskResult | null) {
  if (typeof window === "undefined") return;
  try {
    if (isFuncomTokenAuthFailure(result)) {
      window.localStorage.setItem(FUNCOM_TOKEN_AUTH_ERROR_KEY, JSON.stringify(result));
    } else if (!result || result.status === "succeeded") {
      window.localStorage.removeItem(FUNCOM_TOKEN_AUTH_ERROR_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function parseUpdateTask(task: Task) {
  const text = task.logLines.map((line) => line.line).join("\n");
  if (task.status === "failed") return { status: "Check Failed", current: "", latest: "", reason: task.errorMessage || summarizeCommandText(text) };
  if (task.status !== "succeeded") return { status: "Checking...", current: "", latest: "", reason: task.progressMessage || "" };
  const current = firstVersionMatch(text, [/current(?: stack)?(?: build| version)?\s*[:=]\s*([^\n]+)/i, /installed(?: build| version)?\s*[:=]\s*([^\n]+)/i, /local(?: build| version)?\s*[:=]\s*([^\n]+)/i]);
  const latest = firstVersionMatch(text, [/latest(?: release| build| version)?\s*[:=]\s*([^\n]+)/i, /remote(?: build| version)?\s*[:=]\s*([^\n]+)/i, /available(?: build| version)?\s*[:=]\s*([^\n]+)/i]);
  const updateAvailable = /update available|newer stack (?:version|commit)|newer|can update|available update|diverged from/i.test(text);
  const latestStatus = /up to date|already latest|already on the latest stack commit|no update|latest stack commit|you are already on the latest/i.test(text) && !updateAvailable;
  if (sameUpdateVersion(current, latest)) return { status: "Latest", current, latest, reason: summarizeCommandText(text) };
  if (updateAvailable) return { status: "Update Available", current, latest, reason: summarizeCommandText(text) };
  if (latestStatus) return { status: "Latest", current, latest, reason: summarizeCommandText(text) };
  return { status: current || latest ? "Completed" : "Version details unavailable", current, latest, reason: current || latest ? summarizeCommandText(text) : "Unable to parse version details from completed check." };
}

export function loadPersistedUpdateTask(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Task;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

export function persistUpdateTask(key: string, task: Task | null) {
  if (typeof window === "undefined") return;
  try {
    if (task && !isTerminalTask(task.status)) {
      window.localStorage.setItem(key, JSON.stringify(task));
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage may be unavailable.
  }
}

export function loadPersistedMapsResult(): HomeTaskResult | null {
  return loadPersistedMapsTask()?.result || null;
}

export function loadPersistedMapsTask(): PersistedMapsTask | null {
  try {
    const raw = window.localStorage.getItem(MAPS_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedMapsTask;
    if (parsed?.result?.status !== "running" || !parsed.taskId) {
      window.localStorage.removeItem(MAPS_RESULT_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistMapsResult(result: HomeTaskResult | null) {
  persistMapsTask(result ? { result } : null);
}

export function persistMapsTask(state: PersistedMapsTask | null) {
  try {
    if (!state?.result || state.result.status !== "running" || !state.taskId) window.localStorage.removeItem(MAPS_RESULT_KEY);
    else window.localStorage.setItem(MAPS_RESULT_KEY, JSON.stringify(state));
  } catch {
    // Browser storage can be unavailable.
  }
}

export function isMissingPersistedTaskError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /task not found|404/i.test(message);
}

export { conciseTaskError, funcomTokenMismatchDetected };
