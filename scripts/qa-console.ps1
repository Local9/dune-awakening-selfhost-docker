#requires -Version 5.1
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
. (Join-Path $repoRoot "scripts\windows\Ensure-DuneWsl.ps1") -RepoRoot $repoRoot

$command = @("node", "scripts/qa-console.mjs") + $args
Invoke-DuneWsl $command
