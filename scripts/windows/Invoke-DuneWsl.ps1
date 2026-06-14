#requires -Version 5.1

function ConvertTo-WslPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WindowsPath
    )

    $normalized = $WindowsPath -replace '\\', '/'
    if ($normalized -match '^([A-Za-z]):(/.*)?$') {
        $drive = $Matches[1].ToLower()
        $rest = if ($Matches[2]) { $Matches[2] } else { '' }
        return "/mnt/$drive$rest"
    }

    throw "Not a Windows absolute path: $WindowsPath"
}

function Invoke-DuneWsl {
    param(
        [switch]$AllowFailure,
        [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
        [string[]]$Command
    )

    if (-not $script:DuneWslRepoRoot) {
        throw "Ensure-DuneWsl.ps1 must be dotted before Invoke-DuneWsl."
    }

    $distro = if ($env:DUNE_WSL_DISTRO) { $env:DUNE_WSL_DISTRO } else { "Ubuntu" }
    $wslRepo = ConvertTo-WslPath $script:DuneWslRepoRoot
    $commandText = ($Command | ForEach-Object {
        if ($_ -match '\s|["'']') {
            "'" + ($_ -replace "'", "'\\''") + "'"
        } else {
            $_
        }
    }) -join ' '

    $wslArgs = @(
        "-d", $distro,
        "--cd", $wslRepo,
        "--",
        "env", "DUNE_QA_IN_WSL=1",
        "DUNE_HOST_REPO_ROOT=$wslRepo",
        "bash", "-lc", $commandText
    )

    & wsl.exe @wslArgs
    if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
