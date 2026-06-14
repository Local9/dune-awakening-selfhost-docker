/**
 * Map Windows paths to WSL /mnt/<drive>/ paths.
 */
export function toWslPath(windowsPath) {
  const normalized = String(windowsPath ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const match = normalized.match(/^([A-Za-z]):(\/.*)?$/);
  if (!match) {
    throw new Error(`Not a Windows absolute path: ${windowsPath}`);
  }
  const drive = match[1].toLowerCase();
  const rest = match[2] || "";
  return `/mnt/${drive}${rest}`;
}

export function assertWin32Host() {
  if (process.platform !== "win32") {
    throw new Error("WSL delegation helpers are only for the Windows host.");
  }
}

export function requireWslDelegation() {
  if (process.platform === "win32" && process.env.DUNE_QA_IN_WSL !== "1") {
    console.error("On Windows, run .\\install.ps1 or .\\scripts\\qa-console.ps1 instead of node directly.");
    process.exit(1);
  }
}
