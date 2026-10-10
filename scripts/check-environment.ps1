<#
.SYNOPSIS
    Environment verification for GravityDesk.
#>
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " GravityDesk Environment Verification" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

# Check Node.js
try {
    $nodeVer = node -v
    Write-Host "[OK] Node.js is installed: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Node.js is not found on PATH." -ForegroundColor Red
}

# Check Python
try {
    $pyVer = python --version
    Write-Host "[OK] Python is installed: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Python is not found on PATH." -ForegroundColor Red
}

# Check RealGravity Opencode binary
$opencodeExe = Join-Path $RootDir "backend\bin\opencode.exe"
if (Test-Path $opencodeExe) {
    $sizeMb = [math]::Round((Get-Item $opencodeExe).Length / 1MB, 2)
    Write-Host "[OK] RealGravity opencode.exe found ($sizeMb MB)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] opencode.exe not found at $opencodeExe" -ForegroundColor Red
}

# Check Frontend package.json
$fePkg = Join-Path $RootDir "frontend\package.json"
if (Test-Path $fePkg) {
    Write-Host "[OK] Frontend package.json found" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Frontend package.json not found" -ForegroundColor Red
}

# Check Bridge configuration
$bridgeCfg = Join-Path $RootDir "bridge\config\providers.yaml"
if (Test-Path $bridgeCfg) {
    Write-Host "[OK] Bridge providers.yaml found" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Bridge configuration not found" -ForegroundColor Red
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Verification Complete" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
