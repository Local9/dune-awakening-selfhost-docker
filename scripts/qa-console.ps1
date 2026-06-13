#requires -Version 5.1
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node (Join-Path $scriptDir "qa-console.mjs") @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
