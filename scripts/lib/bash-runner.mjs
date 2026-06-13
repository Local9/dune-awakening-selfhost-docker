import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { resolve } from "node:path";
import { REPO_ROOT } from "./container-runtime.mjs";

const GIT_BASH_PATHS = [
  "C:\\Program Files\\Git\\bin\\bash.exe",
  "C:\\Program Files (x86)\\Git\\bin\\bash.exe"
];

export function resolveBash() {
  if (platform() !== "win32") {
    return { mode: "native", bash: "bash" };
  }
  if (process.env.DUNE_QA_BASH) {
    if (!existsSync(process.env.DUNE_QA_BASH)) {
      throw new Error(`DUNE_QA_BASH is set but not found: ${process.env.DUNE_QA_BASH}`);
    }
    return { mode: "path", bash: process.env.DUNE_QA_BASH };
  }
  for (const path of GIT_BASH_PATHS) {
    if (existsSync(path)) return { mode: "path", bash: path };
  }
  if (existsSync("C:\\Windows\\System32\\wsl.exe")) {
    return { mode: "wsl", bash: "C:\\Windows\\System32\\wsl.exe" };
  }
  throw new Error(
    "Bash is required to run Dune stack scripts on Windows. Install WSL2 or Git Bash, or set DUNE_QA_BASH to your bash.exe path."
  );
}

export function runBash(scriptRelPath, args = [], env = {}, repoRoot = REPO_ROOT) {
  const bashInfo = resolveBash();
  const scriptPath = resolve(repoRoot, scriptRelPath).replace(/\\/g, "/");
  const mergedEnv = { ...process.env, ...env };

  if (bashInfo.mode === "wsl") {
    const wslPath = scriptPath.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
    const wslRepo = repoRoot.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
    const command = `cd '${wslRepo}' && '${wslPath}' ${args.map(shellQuote).join(" ")}`;
    return spawnTracked(bashInfo.bash, ["-e", "bash", "-lc", command], mergedEnv, repoRoot);
  }

  if (bashInfo.mode === "path") {
    return spawnTracked(bashInfo.bash, [scriptPath, ...args], mergedEnv, repoRoot);
  }

  return spawnTracked(bashInfo.bash, [scriptPath, ...args], mergedEnv, repoRoot);
}

function spawnTracked(command, args, env, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      const result = { code, stdout, stderr, command, args };
      if (code === 0) resolvePromise(result);
      else rejectPromise(Object.assign(new Error(`${command} failed with exit ${code}`), result));
    });
  });
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}
