import type { Task } from "../api/setup";
import { taskTechnicalDetails } from "./tasks";

export function funcomTokenMismatchDetected(text: string) {
  const value = text || "";
  if (/Funcom token mismatch detected|Invalid Authorization to manage SelfHosted Battlegroup/i.test(value)) return true;
  if (/ACCESS_DENIED|AccessDenied|access denied|invalid authorization|Unauthorized/i.test(value)) {
    return /Battlegroup|SelfHosted|Funcom|FuncomLiveServices/i.test(value);
  }
  if (/(?:HTTP|status|statusCode|response|code)[^,\n]*(?:401|403)\b/i.test(value)) {
    return /Battlegroup|SelfHosted|Funcom|FuncomLiveServices/i.test(value);
  }
  return false;
}

export function conciseTaskError(task: Task) {
  const text = [task.errorMessage, task.progressMessage, ...task.logLines.map((row) => row.line)].filter(Boolean).join("\n");
  const line = text.split(/\r?\n/).map((part) => part.trim()).filter(Boolean).find((part) => !/^dune\s+\w+ failed with exit \d+$/i.test(part));
  return line?.replace(/^dune\s+\w+\s+failed\s+with\s+exit\s+\d+[:\s-]*/i, "").slice(0, 220) || task.errorMessage || "Task failed.";
}

export function summarizeCommandText(text: string) {
  if (/^\s*(\{\}|\[\]|null|undefined)\s*$/i.test(text)) return "Action completed.";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "No output.";
  const important = lines.filter((line) => /local build|remote build|current stack version|latest release|update available|no update|already latest|up to date|ok|ready|warning|error|failed|success|blocked|unsupported|publish/i.test(line));
  return (important[0] || lines[0]).slice(0, 240);
}

export { taskTechnicalDetails };
