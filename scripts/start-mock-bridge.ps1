<#
.SYNOPSIS
    Starts the GravityDesk Bridge Contract Server (Port 8000).
#>
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$FrontendDir = Join-Path $RootDir "frontend"

Set-Location $FrontendDir

if (-not (Test-Path "node_modules")) {
    Write-Host "[GravityDesk] Installing frontend dependencies..." -ForegroundColor Cyan
    npm install
}

Write-Host "[GravityDesk] Starting Contract Bridge Server on http://localhost:8000..." -ForegroundColor Green
npm run bridge:mock
