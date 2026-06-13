import type { Task } from "../api/setup";
import { conciseTaskError } from "./taskErrors";
import { stripAnsi } from "./format";

export function updateDisplayValue(status: Record<string, string>, key: "current" | "latest", formatter?: (value: string) => string) {
  if (/checking/i.test(status.status)) return "Checking...";
  if (/updating/i.test(status.status)) return status[key] || "Updating...";
  const value = status[key] || "";
  return value ? (formatter ? formatter(value) : value) : "Unknown";
}


export function stackVersionButtonLabel(status: Record<string, string>) {
  const current = String(status.current || "").trim();
  const latest = String(status.latest || "").trim();
  if (/checking/i.test(String(status.status || ""))) return "Checking";
  if (current && latest && !sameUpdateVersion(current, latest)) return `${formatStackVersionLabel(current)} > ${formatStackVersionLabel(latest)}`;
  return formatStackVersionLabel(current || latest) || "Version";
}


export function stackVersionButtonTitle(status: Record<string, string>) {
  const current = String(status.current || "").trim();
  const latest = String(status.latest || "").trim();
  if (current && latest && !sameUpdateVersion(current, latest)) return "Update Available";
  if (status.status === "Update Available") return "Update Available";
  if (status.status === "Latest" || (current && latest && sameUpdateVersion(current, latest))) return "Latest";
  return "Open Updates";
}


export function formatStackVersionLabel(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (/^v/i.test(clean)) return clean;
  if (/^\d+(?:\.\d+)*(?:[-+][\w.-]+)?$/i.test(clean)) return `v${clean}`;
  return clean;
}


export function canApplyUpdateStatus(status: Record<string, string>) {
  return status.status === "Update Available" && !sameUpdateVersion(status.current, status.latest);
}


export function sameUpdateVersion(current: string, latest: string) {
  const normalizedCurrent = normalizeUpdateVersion(current);
  const normalizedLatest = normalizeUpdateVersion(latest);
  return Boolean(normalizedCurrent && normalizedLatest && normalizedCurrent === normalizedLatest);
}


export function normalizeUpdateVersion(value: string) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .replace(/\s+\(.+\)$/i, "")
    .toLowerCase();
}


export function toHourMinuteTime(value: unknown) {
  const text = String(value || "").trim();
  if (!text || /^unset$/i.test(text)) return "Unset";
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return match ? `${match[1]}:${match[2]}` : text;
}


export function sanitizeTimeInput(value: string) {
  return value.replace(/[^\d:]/g, "").slice(0, 5);
}


export function isValidHourMinuteTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}


export function firstVersionMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().slice(0, 80);
  }
  return "";
}


export function summarizeGameUpdateProgress(task: Task) {
  const text = task.logLines.map((line) => line.line).join("\n");
  const latestLine = [...task.logLines].reverse().map((line) => line.line.trim()).find(Boolean) || task.progressMessage || task.currentStep || "";
  if (task.status === "succeeded") {
    return { title: "Update Complete", percent: 100, message: "The game server update is complete. The server is coming back up now." };
  }
  if (task.status === "failed") {
    return { title: "Update Failed", percent: Math.max(5, gameUpdatePercent(text)), message: conciseTaskError(task) };
  }

  const fixIndex = text.lastIndexOf("Detected a common SteamCMD cache error");
  const attemptIndexes = [...text.matchAll(/SteamCMD install attempt\s+\d+\/\d+/gi)].map((match) => match.index || 0);
  const latestAttemptIndex = attemptIndexes.length ? attemptIndexes[attemptIndexes.length - 1] : -1;
  if (fixIndex >= 0 && fixIndex > latestAttemptIndex) {
    return { title: "Fixing SteamCMD", percent: Math.max(45, gameUpdatePercent(text)), message: "Detected a common Steam download error. Applying the automatic SteamCMD fix, then retrying the update." };
  }
  if (!isSteamcmdUpdateActive(text)) {
    return { title: "Updating", percent: gameUpdatePercent(text), message: friendlyGameUpdateMessage(text, latestLine) };
  }
  const retryMatches = [...text.matchAll(/Retrying(?: app install)? in (\d+)s/gi)];
  const retryMatch = retryMatches[retryMatches.length - 1];
  const retryIndex = retryMatch?.index ?? -1;
  if (retryMatch && retryIndex > latestAttemptIndex) {
    return { title: "Updating", percent: Math.max(45, gameUpdatePercent(text)), message: `Steam download hit a temporary problem. Retrying in ${retryMatch[1]} seconds.` };
  }
  const attemptMatch = text.match(/SteamCMD install attempt\s+(\d+)\/(\d+)/i);
  const steamcmdStage = summarizeSteamcmdStage(task.logLines.map((line) => line.line), attemptMatch);
  if (steamcmdStage) {
    return { title: steamcmdStage.title, percent: Math.max(42, gameUpdatePercent(text), steamcmdStage.percent), message: steamcmdStage.message };
  }
  if (attemptMatch) {
    return { title: "Updating", percent: Math.max(42, gameUpdatePercent(text)), message: `Downloading server files with SteamCMD. Attempt ${attemptMatch[1]} of ${attemptMatch[2]}.` };
  }
  return { title: "Updating", percent: gameUpdatePercent(text), message: friendlyGameUpdateMessage(text, latestLine) };
}


export function isSteamcmdUpdateActive(text: string) {
  const clean = stripAnsi(text);
  const steamStart = clean.lastIndexOf("=== Download/update server files with SteamCMD ===");
  if (steamStart < 0) return false;
  const laterText = clean.slice(steamStart);
  return !/===\s+(Load updated Funcom image tarballs|Detect loaded image tags|Run database update\/migration|Refresh generated map catalogs|Restarting Dune stack)\s+===/i.test(laterText);
}


export function summarizeSteamcmdStage(lines: string[], attemptMatch: RegExpMatchArray | null) {
  const attemptText = attemptMatch ? ` Attempt ${attemptMatch[1]} of ${attemptMatch[2]}.` : "";
  const cleanLines = lines.flatMap((line) => stripAnsi(line).split(/\r+/).map((part) => part.trim()).filter(Boolean));

  for (const line of [...cleanLines].reverse()) {
    const progressMatches = [...line.matchAll(/Update state\s+\([^)]+\)\s+([^,]+),\s+progress:\s+([0-9.]+)/gi)];
    const progressMatch = progressMatches[progressMatches.length - 1];
    if (progressMatch) {
      const state = progressMatch[1].trim().toLowerCase();
      const steamPercent = Math.max(0, Math.min(100, Number(progressMatch[2]) || 0));
      const scaledPercent = 42 + Math.round(steamPercent * 0.18);
      if (/download/i.test(state)) return { title: "Downloading Server Files", percent: scaledPercent, message: `SteamCMD is downloading updated server files (${steamPercent.toFixed(1)}%).${attemptText}` };
      if (/verif/i.test(state)) return { title: "Verifying Server Files", percent: Math.max(56, scaledPercent), message: `SteamCMD is verifying downloaded server files (${steamPercent.toFixed(1)}%).${attemptText}` };
      if (/install|commit|staging|reconfig/i.test(state)) return { title: "Installing Server Files", percent: Math.max(48, scaledPercent), message: `SteamCMD is ${state} (${steamPercent.toFixed(1)}%).${attemptText}` };
      return { title: "Updating Server Files", percent: scaledPercent, message: `SteamCMD update state: ${state} (${steamPercent.toFixed(1)}%).${attemptText}` };
    }

    if (/Success!\s+App\s+'?\d+'?.*fully installed/i.test(line)) {
      return { title: "Server Files Installed", percent: 62, message: `SteamCMD finished installing the server files.${attemptText}` };
    }
    if (/Validating|validation/i.test(line)) {
      return { title: "Validating Server Files", percent: 56, message: `SteamCMD is validating the installed server files.${attemptText}` };
    }
    if (/Downloading item|download item|download depot|downloading/i.test(line)) {
      return { title: "Downloading Server Files", percent: 46, message: `SteamCMD is downloading server file content.${attemptText}` };
    }
    if (/Connecting anonymously|Connecting to Steam/i.test(line)) {
      return { title: "Connecting To Steam", percent: 43, message: `SteamCMD is connecting to Steam.${attemptText}` };
    }
    if (/Waiting for (client config|user info)/i.test(line)) {
      return { title: "Loading Steam Metadata", percent: 44, message: `SteamCMD is loading Steam account and depot metadata.${attemptText}` };
    }
    if (/Logging in user|login anonymous|Logged in OK/i.test(line)) {
      return { title: "Logging In To Steam", percent: 44, message: `SteamCMD is logging in anonymously to Steam.${attemptText}` };
    }
    if (/Loading Steam API/i.test(line)) {
      return { title: "Starting SteamCMD", percent: 42, message: `SteamCMD is starting and loading the Steam API.${attemptText}` };
    }
  }

  return null;
}


export function gameUpdatePercent(text: string) {
  const stages: [RegExp, number][] = [
    [/Pre-flight: check Steam/i, 8],
    [/Update is available/i, 15],
    [/Check Docker volume free space/i, 22],
    [/Stop game servers before update/i, 30],
    [/Download\/update server files with SteamCMD/i, 40],
    [/SteamCMD install attempt\s+2\//i, 52],
    [/SteamCMD install attempt\s+3\//i, 60],
    [/Load updated Funcom image tarballs/i, 70],
    [/Detect loaded image tags/i, 78],
    [/Run database update\/migration/i, 86],
    [/Refresh generated map catalogs/i, 94],
    [/Restarting Dune stack/i, 98]
  ];
  let percent = 3;
  for (const [pattern, value] of stages) {
    if (pattern.test(text)) percent = Math.max(percent, value);
  }
  return percent;
}


export function friendlyGameUpdateMessage(text: string, latestLine: string) {
    if (/Restarting Dune stack/i.test(text)) return "Restarting the Dune server with the updated build.";
  if (/Refresh generated map catalogs/i.test(text)) return "Refreshing generated map catalogs.";
  if (/Run database update\/migration/i.test(text)) return "Running database migrations for the updated build.";
  if (/Detect loaded image tags/i.test(text)) return "Detecting updated image versions.";
  if (/Load updated Funcom image tarballs/i.test(text)) return "Loading updated game container images.";
  if (/Download\/update server files with SteamCMD/i.test(text)) return "Downloading updated game server files.";
  if (/Stop game servers before update/i.test(text)) return "Stopping game servers before replacing server files.";
  if (/Check Docker volume free space/i.test(text)) return "Checking available disk space before downloading files.";
  if (/Pre-flight: check Steam/i.test(text)) return "Checking Steam for the latest available server build.";
  return latestLine && !/^\s*Task started/i.test(latestLine) ? friendlyGameUpdateLine(latestLine) : "Preparing the game update.";
}


export function friendlyGameUpdateLine(line: string) {
  if (/^Running updateApply$/i.test(line)) return "Preparing the game update.";
  if (/^Task started$/i.test(line)) return "Preparing the game update.";
  if (/Steam app id:/i.test(line)) return "Preparing Steam update metadata.";
  return "Working on the game update.";
}


export function isSteamcmdManifestFailure(task: Task) {
  const text = stripAnsi(task.logLines.map((line) => line.line).join("\n"));
  return /SteamCMD failed|App\s+'[^']+'\s+state is\s+0x6|appmanifest_\d+\.acf|SteamCMD cache\/metadata is stale/i.test(text);
}


export function summarizeStackUpdateProgress(task: Task) {
  const text = task.logLines.map((line) => line.line).join("\n");
  const latestLine = [...task.logLines].reverse().map((line) => line.line.trim()).find(Boolean) || task.progressMessage || task.currentStep || "";
  if (task.status === "succeeded") {
    const installedVersion = firstVersionMatch(text, [/Installed stack version:\s*([^\n]+)/i]);
    return { title: "Console Update Complete", percent: 100, message: installedVersion ? `Console files were updated to ${installedVersion}. Refresh this page to load the new Web UI. You may need to sign in again.` : "Console files were updated. Refresh this page to load the new Web UI. You may need to sign in again." };
  }
  if (task.status === "failed") {
    return { title: "Console Update Failed", percent: Math.max(5, stackUpdatePercent(text)), message: conciseTaskError(task) };
  }
  const stackStage = summarizeStackUpdateStage(task.logLines.map((line) => line.line));
  if (stackStage) return stackStage;
  return { title: "Updating Console", percent: stackUpdatePercent(text), message: friendlyStackUpdateMessage(text, latestLine) };
}


export function stackUpdatePercent(text: string) {
  const stages: [RegExp, number][] = [
    [/Running selfUpdateApply/i, 5],
    [/Downloading stack release/i, 20],
    [/Backing up current stack files/i, 42],
    [/Installing stack release into/i, 66],
    [/Installed stack version/i, 88],
    [/Previous stack files backup/i, 94],
    [/Rebuilding Dune Docker Console|Dune Docker Console was rebuilt/i, 98]
  ];
  let percent = 3;
  for (const [pattern, value] of stages) {
    if (pattern.test(text)) percent = Math.max(percent, value);
  }
  return percent;
}


export function friendlyStackUpdateMessage(text: string, latestLine: string) {
  if (/Detected fork origin/i.test(text)) return "Pulling the latest console commit from the configured git remote.";
  if (/Fetching branch:/i.test(text)) return "Fetching the latest commit from the configured git branch.";
  if (/Resetting stack checkout to:/i.test(text)) return "Resetting the local checkout to the latest remote commit.";
  if (/Downloading stack release/i.test(text)) return "Downloading the selected console release.";
  if (/Backing up current stack files/i.test(text)) return "Backing up the current console files before replacing them.";
  if (/Installing stack release into/i.test(text)) return "Installing the downloaded console release files.";
  if (/Installed stack version/i.test(text) || /Installed stack commit:/i.test(text)) return "Verifying the installed console update.";
  if (/Rebuilding Dune Docker Console/i.test(text)) return "Rebuilding and restarting the web console container.";
  if (/Dune Docker Console was rebuilt/i.test(text)) return "The web console container was rebuilt successfully.";
  if (/Previous stack files backup/i.test(text)) return "Finishing the console update and recording the backup location.";
  return latestLine && !/^\s*Task started/i.test(latestLine) ? friendlyStackUpdateLine(latestLine) : "Preparing the console update.";
}


export function summarizeStackUpdateStage(lines: string[]) {
  const cleanLines = lines.map((line) => stripAnsi(line).replace(/\s+$/g, "")).filter((line) => line.trim());
  const latestIndex = (pattern: RegExp) => {
    for (let index = cleanLines.length - 1; index >= 0; index -= 1) {
      if (pattern.test(cleanLines[index].trim())) return index;
    }
    return -1;
  };
  const backupIndex = latestIndex(/^Backing up current stack files to:/i);
  const installIndex = latestIndex(/^Installing stack release into:/i);
  const installedIndex = latestIndex(/^Installed stack version:\s*/i);
  const installedCommitIndex = latestIndex(/^Installed stack commit:/i);
  const resetIndex = latestIndex(/^Resetting stack checkout to:/i);
  const backupDoneIndex = latestIndex(/^Previous stack files backup:/i);
  const downloadIndex = latestIndex(/^Downloading stack release:\s*/i);
  const dirtyIndex = latestIndex(/^Local repo has uncommitted tracked changes\./i);

  if (backupDoneIndex >= 0) {
    const backupFile = nextIndentedLine(cleanLines, backupDoneIndex);
    return { title: "Finishing Console Update", percent: 94, message: backupFile ? `Recorded backup at ${backupFile}.` : "Recording the previous console backup location." };
  }
  if (installedIndex >= 0 || installedCommitIndex >= 0) {
    const line = cleanLines[installedIndex >= 0 ? installedIndex : installedCommitIndex].trim();
    const label = line.replace(/^Installed stack (?:version|commit):\s*/i, "").trim();
    return { title: "Verifying Console Update", percent: 88, message: label ? `Installed console update ${label}. Finishing the update.` : "Verifying the installed console update." };
  }
  if (resetIndex >= 0) {
    const target = nextIndentedLine(cleanLines, resetIndex);
    return { title: "Pulling Latest Commit", percent: 66, message: target ? `Resetting the checkout to ${target}.` : "Resetting the checkout to the latest remote commit." };
  }
  if (installIndex >= 0) {
    const target = nextIndentedLine(cleanLines, installIndex);
    return { title: "Installing Console Release", percent: 66, message: target ? `Installing the downloaded console release into ${target}.` : "Installing the downloaded console release files." };
  }
  if (backupIndex >= 0) {
    const backupDir = nextIndentedLine(cleanLines, backupIndex);
    return { title: "Backing Up Console Files", percent: 42, message: backupDir ? `Backing up current console files to ${backupDir}.` : "Backing up the current console files before replacing them." };
  }
  if (downloadIndex >= 0) {
    const tag = cleanLines[downloadIndex].trim().replace(/^Downloading stack release:\s*/i, "").trim();
    return { title: "Downloading Console Release", percent: 20, message: tag ? `Downloading console release ${tag} from GitHub.` : "Downloading the selected console release." };
  }
  if (dirtyIndex >= 0) {
    return { title: "Preparing Console Backup", percent: 12, message: "Local tracked changes were detected; the updater will back up the current console files first." };
  }
  return null;
}


export function nextIndentedLine(lines: string[], index: number) {
  const next = lines[index + 1] || "";
  return /^\S/.test(next) ? "" : next.trim();
}


export function friendlyStackUpdateLine(line: string) {
  if (/^Running selfUpdateApply$/i.test(line)) return "Preparing the console update.";
  if (/^Task started$/i.test(line)) return "Preparing the console update.";
  if (/^Update source: git remote/i.test(line)) return "Using git pull-latest for this fork clone.";
  if (/^Detected fork origin/i.test(line)) return "Fork origin detected; checking the latest git commit instead of GitHub releases.";
  if (/^Update source: Red-Blink GitHub releases/i.test(line)) return "Using Red-Blink GitHub releases for this update check.";
  if (/^Fetching branch:/i.test(line)) return "Fetching the latest commit from the configured git branch.";
  if (/^Resetting stack checkout to:/i.test(line)) return "Resetting the local checkout to the latest remote commit.";
  if (/Could not|failed|denied|rate-limited/i.test(line)) return line;
  return "Working on the console update.";
}
