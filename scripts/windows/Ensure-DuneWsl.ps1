#requires -Version 5.1

param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) {
    Write-Host "WSL is required but wsl.exe was not found."
    Write-Host "Enable WSL2 and install Ubuntu, then retry:"
    Write-Host "  wsl --install -d Ubuntu"
    exit 1
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptRoot "Invoke-DuneWsl.ps1")

$script:DuneWslRepoRoot = (Resolve-Path $RepoRoot).Path
$distro = if ($env:DUNE_WSL_DISTRO) { $env:DUNE_WSL_DISTRO } else { "Ubuntu" }
$stampPath = Join-Path $script:DuneWslRepoRoot "runtime\generated\wsl-provision.stamp"

function Test-WslDistro {
    param([string]$Name)
    $list = & wsl.exe -l -q 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    foreach ($line in $list) {
        $clean = ($line -replace '^\*?\s*', '').Trim()
        if ($clean -eq $Name) {
            return $true
        }
    }
    return $false
}

if (-not (Test-WslDistro $distro)) {
    Write-Host "WSL distro '$distro' was not found."
    Write-Host "Install it with:"
    Write-Host "  wsl --install -d $distro"
    Write-Host "Or set DUNE_WSL_DISTRO to an installed distro name."
    exit 1
}

$verifyCmd = @'
command -v node >/dev/null &&
(
  (command -v podman >/dev/null && podman info >/dev/null 2>&1 && podman compose version >/dev/null 2>&1) ||
  (command -v docker >/dev/null && docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1)
)
'@

function Test-WslRuntimeReady {
    Invoke-DuneWsl -AllowFailure @("bash", "-lc", $verifyCmd) | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Invoke-WslProvision {
    if (Test-Path $stampPath) {
        Remove-Item $stampPath -Force
    }
    Invoke-DuneWsl @("env", "DUNE_WSL_REPROVISION=1", "bash", "runtime/scripts/wsl-provision.sh")
}

if (-not (Test-WslRuntimeReady)) {
    if (Test-Path $stampPath) {
        Write-Host "WSL runtime is incomplete or the distro was reset (ignoring stale provision stamp)."
    } else {
        Write-Host "=== Provisioning WSL environment (first run) ==="
    }
    Invoke-WslProvision
}

if (-not (Test-WslRuntimeReady)) {
    Write-Host "WSL provisioning did not install required tools (node, container CLI, and compose)."
    Write-Host "Retry with: `$env:DUNE_WSL_REPROVISION = '1'; .\install.ps1"
    if (Test-Path $stampPath) {
        Remove-Item $stampPath -Force
    }
    exit 1
}

$dnsCheck = Invoke-DuneWsl -AllowFailure @("bash", "-lc", "grep -E '^nameserver (8\\.8\\.8\\.8|1\\.1\\.1\\.1)' /etc/resolv.conf >/dev/null")
if ($LASTEXITCODE -ne 0) {
    Write-Host "WSL is still using the Windows stub DNS resolver."
    Write-Host "Run from PowerShell:"
    Write-Host "  wsl --shutdown"
    Write-Host "Then:"
    Write-Host "  .\install.ps1"
}
