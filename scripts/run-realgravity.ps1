<#
.SYNOPSIS
    Convenience wrapper to launch RealGravity (PAG) backend from GravityDesk root.
.EXAMPLE
    .\scripts\run-realgravity.ps1 D:\myproject assist
    .\scripts\run-realgravity.ps1 D:\myproject turbo
    .\scripts\run-realgravity.ps1 --list-models
#>
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$PagScript = Join-Path $RootDir "backend\bin\pag.ps1"

& $PagScript @args
