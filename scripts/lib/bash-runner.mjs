import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { REPO_ROOT, detectRuntime } from "./container-runtime.mjs";

function pythonEnvScript(repoRoot) {
  return resolve(repoRoot, "runtime/scripts/python-env.sh").replace(/\\/g, "/");
}

function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function containerCliEnvScript(repoRoot) {
  return resolve(repoRoot, "runtime/scripts/container-cli.sh").replace(/\\/g, "/");
}

function wrapWithPythonEnv(command, repoRoot) {
  const pythonEnv = shellQuote(pythonEnvScript(repoRoot));
  const containerCli = shellQuote(containerCliEnvScript(repoRoot));
  return [
    `source ${pythonEnv}`,
    "{ python_env_ensure || { print_python_install_help; exit 1; }; }",
    `source ${containerCli}`,
    "{ container_cli_ensure || { print_container_install_help; exit 1; }; }",
    command
  ].join(" && ");
}

export function runBash(scriptRelPath, args = [], env = {}, repoRoot = REPO_ROOT) {
  return runBashAsync(scriptRelPath, args, env, repoRoot);
}

async function runBashAsync(scriptRelPath, args = [], env = {}, repoRoot = REPO_ROOT) {
  const scriptPath = resolve(repoRoot, scriptRelPath).replace(/\\/g, "/");
  const runtime = await detectRuntime(repoRoot, { ...process.env, ...env });
  const mergedEnv = {
    ...process.env,
    ...env,
    DUNE_HOST_REPO_ROOT: runtime.hostRepoRoot,
    DUNE_CONTAINER_SOCKET: runtime.socket,
    DUNE_CONTAINER_CLI: runtime.executable
  };
  const quotedArgs = args.map(shellQuote).join(" ");
  const command = wrapWithPythonEnv(`'${scriptPath.replace(/'/g, `'\\''`)}' ${quotedArgs}`, repoRoot);
  return spawnTracked("bash", ["-lc", command], mergedEnv, repoRoot);
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
