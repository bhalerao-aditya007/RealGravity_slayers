<#
.SYNOPSIS
    Starts the GravityDesk 3D Virtual Office Frontend.
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

Write-Host "[GravityDesk] Launching Deskmates 3D Office Frontend on http://localhost:5173..." -ForegroundColor Green
npm run dev
