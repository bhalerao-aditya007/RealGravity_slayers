<#
.SYNOPSIS
    Starts both Bridge Server and Frontend simultaneously.
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

Write-Host "[GravityDesk] Starting Mock Bridge Server on background job..." -ForegroundColor Green
$bridgeJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run bridge:mock
} -ArgumentList $FrontendDir

Start-Sleep -Seconds 2

try {
    Write-Host "[GravityDesk] Starting Frontend (Connected to Bridge at http://localhost:8000)..." -ForegroundColor Green
    $env:VITE_USE_MOCK = "false"
    $env:VITE_API_URL = "http://localhost:8000"
    npm run dev
}
finally {
    Write-Host "[GravityDesk] Stopping Bridge Server background job..." -ForegroundColor Yellow
    Stop-Job $bridgeJob -ErrorAction SilentlyContinue
    Remove-Job $bridgeJob -ErrorAction SilentlyContinue
}
