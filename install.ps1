#requires -Version 5.1
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $repoRoot "scripts\windows\Ensure-DuneWsl.ps1") -RepoRoot $repoRoot

$command = @("node", "scripts/install-console.mjs") + $args
Invoke-DuneWsl $command
