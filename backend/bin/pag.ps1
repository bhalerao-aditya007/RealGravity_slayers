<#
.SYNOPSIS
    RealGravity (PAG) Windows Launcher.
    Runs in super-lightweight Native Mode (default, ~80MB RAM, zero Docker needed)
    or in Docker Sandbox Mode (--docker).
#>

$PAG_ROOT = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BASE_JSON = Join-Path $PAG_ROOT 'profiles\base.json'
$OPENCODE_EXE = Join-Path $PAG_ROOT 'bin\opencode.exe'

# Robust dynamic argument parsing
$TargetDir = $null
$Profile = 'assist'
$Model = $null
$AllowHosted = $false
$TrustRepoConfig = $false
$Tier = 3
$ListModels = $false
$Help = $false
$UseDocker = $false

$queue = [System.Collections.Generic.Queue[string]]::new()
foreach ($a in $args) {
    if ($a) { $queue.Enqueue($a) }
}

while ($queue.Count -gt 0) {
    $arg = $queue.Dequeue()
    switch -Regex ($arg) {
        '^(-h|--help|-help|\/\?)$' {
            $Help = $true
        }
        '^(--list-models|-listmodels|-list-models)$' {
            $ListModels = $true
        }
        '^(--allow-hosted|-allowhosted|-allow-hosted)$' {
            $AllowHosted = $true
        }
        '^(--trust-repo-config|-trustrepoconfig|-trust-repo-config)$' {
            $TrustRepoConfig = $true
        }
        '^(--docker|-docker)$' {
            $UseDocker = $true
        }
        '^(--model|-model|-m)$' {
            if ($queue.Count -gt 0) {
                $Model = $queue.Dequeue()
            }
        }
        '^(--tier|-tier|-t)$' {
            if ($queue.Count -gt 0) {
                $Tier = [int]$queue.Dequeue()
            }
        }
        '^(strict|assist|turbo)$' {
            $Profile = $arg
        }
        default {
            if (-not $TargetDir -and -not $arg.StartsWith('-')) {
                $TargetDir = $arg
            }
        }
    }
}

if ($Help) {
    Write-Host ''
    Write-Host 'RealGravity (PAG) - Personal Antigravity' -ForegroundColor Cyan -NoNewline
    Write-Host ' [Native Mode]' -ForegroundColor Green
    Write-Host '=========================================================='
    Write-Host 'Usage: pag [project-folder] [profile] [options]'
    Write-Host ''
    Write-Host 'Profiles:' -ForegroundColor Yellow
    Write-Host '  assist   Auto-approve file edits; prompt for shell (Recommended)'
    Write-Host '  strict   Prompt for every edit and shell command'
    Write-Host '  turbo    Auto-approve all actions (requires clean git repo)'
    Write-Host ''
    Write-Host 'Options:' -ForegroundColor Yellow
    Write-Host '  --model [provider/id]   Override the default model (e.g. groq, nvidia, coder, r1)'
    Write-Host '  --list-models           Show all configured open-source models'
    Write-Host '  --docker                Run in Docker container sandbox instead of Native mode'
    Write-Host '  --tier [0-3]            Context management tier (default: 3)'
    Write-Host ''
    Write-Host 'Examples:' -ForegroundColor Green
    Write-Host '  pag D:\Django assist'
    Write-Host '  pag D:\Django assist --model nvidia'
    Write-Host '  pag D:\Django assist --model groq'
    Write-Host '  pag D:\Realgravity\scratch-repo assist'
    Write-Host '  pag --list-models'
    exit 0
}

if ($ListModels -or ($TargetDir -eq '--list-models')) {
    Write-Host ''
    Write-Host '=== RealGravity Available Models (Free Tier) ===' -ForegroundColor Cyan
    Write-Host ''
    if (Test-Path $BASE_JSON) {
        $cfg = Get-Content $BASE_JSON -Raw | ConvertFrom-Json
        $providers = $cfg.providers | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
        foreach ($p in $providers) {
            $pObj = $cfg.providers.$p
            Write-Host "Provider: $($pObj.name)" -ForegroundColor Yellow
            $modelNames = $pObj.models | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            foreach ($m in $modelNames) {
                $mObj = $pObj.models.$m
                Write-Host "  $p/$m" -ForegroundColor Green -NoNewline
                Write-Host "  - $($mObj.name)" -ForegroundColor Gray
            }
            Write-Host ''
        }
        Write-Host 'Current Default: ' -NoNewline
        Write-Host "$($cfg.model)" -ForegroundColor Cyan
    } else {
        Write-Host "[ERROR] Could not find $BASE_JSON" -ForegroundColor Red
    }
    exit 0
}

if (-not $TargetDir) {
    Write-Host '[ERROR] Please specify a target project folder.' -ForegroundColor Red
    Write-Host 'Example: pag D:\Django assist' -ForegroundColor Yellow
    exit 1
}

# Resolve full Windows path
if (-not (Test-Path $TargetDir)) {
    Write-Host "[ERROR] Target directory does not exist: $TargetDir" -ForegroundColor Red
    exit 1
}

$ResolvedPath = (Resolve-Path $TargetDir).Path

# Resolve model shorthands
if ($Model) {
    switch ($Model.ToLower()) {
        'groq'        { $Model = 'groq/openai/gpt-oss-120b' }
        '120b'        { $Model = 'groq/openai/gpt-oss-120b' }
        'qwen'        { $Model = 'groq/qwen/qwen3.8-27b' }
        'coder'       { $Model = 'openrouter/qwen/qwen3.8-27b:free' }
        'openrouter'  { $Model = 'openrouter/qwen/qwen3.8-27b:free' }
        'fast'        { $Model = 'groq/openai/gpt-oss-20b' }
        'instant'     { $Model = 'groq/openai/gpt-oss-20b' }
    }
}

# ─────────────────────────────────────────────────────────────
# OPTION A: DOCKER SANDBOX MODE (only if user explicitly passes --docker)
# ─────────────────────────────────────────────────────────────
if ($UseDocker) {
    $Drive = $ResolvedPath.Substring(0, 1).ToLower()
    $PathWithoutDrive = $ResolvedPath.Substring(2).Replace('\', '/')
    $WslTargetDir = "/mnt/$Drive$PathWithoutDrive"

    $WslPagRootDrive = $PAG_ROOT.Substring(0, 1).ToLower()
    $WslPagRootPath = $PAG_ROOT.Substring(2).Replace('\', '/')
    $WslPagRoot = "/mnt/$WslPagRootDrive$WslPagRootPath"

    $cmdParts = [System.Collections.Generic.List[string]]::new()
    $cmdParts.Add("$WslPagRoot/bin/pag")
    $cmdParts.Add("`"$WslTargetDir`"")
    $cmdParts.Add($Profile)

    if ($Model) { $cmdParts.Add('--model'); $cmdParts.Add("`"$Model`"") }
    if ($AllowHosted) { $cmdParts.Add('--allow-hosted') }
    if ($TrustRepoConfig) { $cmdParts.Add('--trust-repo-config') }
    if ($Tier -ne 3) { $cmdParts.Add('--tier'); $cmdParts.Add("$Tier") }

    $WslCmd = $cmdParts -join ' '
    Write-Host 'RealGravity - Launching Docker Sandbox Mode...' -ForegroundColor Cyan
    wsl -d Ubuntu -- bash -c "$WslCmd"
    exit $LASTEXITCODE
}

# ─────────────────────────────────────────────────────────────
# OPTION B: NATIVE MODE (DEFAULT — Fast, No Docker, ~80MB RAM)
# ─────────────────────────────────────────────────────────────

# 1. Verify or auto-download opencode binary
if (-not (Test-Path $OPENCODE_EXE)) {
    Write-Host "[INFO] First-time setup: Downloading native opencode binary..." -ForegroundColor Cyan
    $tgzPath = Join-Path $PAG_ROOT 'bin\opencode.tgz'
    curl.exe -fsSL "https://registry.npmjs.org/@opencode/cli-windows-x64/-/cli-windows-x64-2.0.22.tgz" -o $tgzPath
    tar.exe -xzf $tgzPath -C (Join-Path $PAG_ROOT 'bin') --strip-components=2 package/bin/opencode.exe
    if (Test-Path $tgzPath) { Remove-Item $tgzPath -Force }
}

# 2. Generate native configuration from .env and base.json
$GenScript = Join-Path $PAG_ROOT 'scripts\gen-native-config.py'
if (Test-Path $GenScript) {
    if ($Model) {
        python $GenScript $Profile $Model
    } else {
        python $GenScript $Profile
    }
}

# 3. Privacy check & record
$HostedFile = Join-Path $PAG_ROOT 'hosted-allowed.txt'
if (Test-Path $HostedFile) {
    $content = Get-Content $HostedFile -Raw
    if ($content -notmatch [regex]::Escape($ResolvedPath)) {
        Add-Content -Path $HostedFile -Value $ResolvedPath
    }
}

# 4. Git Checkpointing & Branching
Push-Location $ResolvedPath
try {
    if (-not (Test-Path ".git")) {
        Write-Host "[INFO] Initializing git in $ResolvedPath..." -ForegroundColor Cyan
        git init -b main 2>$null
    }

    # Ensure git user name/email configured
    $gitUser = git config user.name 2>$null
    if (-not $gitUser) {
        git config user.name "RealGravity Agent"
        git config user.email "agent@realgravity.local"
    }

    # Check for uncommitted work
    $gitStatus = git status --porcelain 2>$null
    if ($gitStatus) {
        if ($Profile -eq 'turbo') {
            Write-Host "[ERROR] Turbo profile requires a clean git repository." -ForegroundColor Red
            Pop-Location
            exit 1
        }
        git add -A 2>$null
        git commit -m "pag: checkpoint before session" 2>$null
    }

    $TS = Get-Date -Format "yyyyMMdd-HHmmss"
    $BranchName = "agent/$TS"
    git checkout -b $BranchName 2>$null

    $StartCommit = git rev-parse HEAD 2>$null
    if (-not $StartCommit) { $StartCommit = "HEAD" }

    if (-not (Test-Path ".agent")) { New-Item -ItemType Directory -Path ".agent" -Force | Out-Null }
    Set-Content -Path ".agent\start" -Value $StartCommit

    # Exclude .agent and .pag from git
    $ExcludeFile = ".git\info\exclude"
    if (Test-Path $ExcludeFile) {
        $excludeContent = Get-Content $ExcludeFile -Raw -ErrorAction SilentlyContinue
        if ($excludeContent -notmatch "\.agent/") { Add-Content -Path $ExcludeFile -Value ".agent/" }
        if ($excludeContent -notmatch "\.pag/") { Add-Content -Path $ExcludeFile -Value ".pag/" }
    }

    # 5. Generate repository map
    $RepoMapScript = Join-Path $PAG_ROOT 'scripts\repo-map.py'
    if (Test-Path $RepoMapScript) {
        python $RepoMapScript $ResolvedPath 2>$null
    }

    # 6. Launch Native OpenCode TUI Session
    Write-Host ''
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host '            RealGravity - Personal Antigravity Agent            ' -ForegroundColor Cyan
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host " Mode:     Native (Fast, No Docker, Low Resource)" -ForegroundColor Green
    Write-Host " Target:   $ResolvedPath" -ForegroundColor DarkGray
    Write-Host " Profile:  $Profile" -ForegroundColor DarkGray
    Write-Host " Branch:   $BranchName" -ForegroundColor DarkGray
    if ($Model) {
        Write-Host " Model:    $Model" -ForegroundColor Yellow
    } else {
        Write-Host " Model:    openrouter/qwen/qwen3.8-27b:free (Default free - large context)" -ForegroundColor Yellow
    }
    Write-Host '================================================================' -ForegroundColor Cyan
    Write-Host ''

    # Run native opencode
    & $OPENCODE_EXE $ResolvedPath

    # 7. Post-Session Diff Summary & Rollback
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host '   RealGravity Session Summary' -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan

    Write-Host "Changes since start commit ($StartCommit):" -ForegroundColor Yellow
    git diff --stat $StartCommit 2>$null
    Write-Host ''
    Write-Host 'Diff detail:' -ForegroundColor Yellow
    git diff -U0 $StartCommit 2>$null

    $SummaryFile = ".agent\summary-$TS.txt"
    $statDiff = git diff --stat $StartCommit 2>$null
    $patchDiff = git diff -U0 $StartCommit 2>$null
    $summaryLines = @(
        "RealGravity Session Summary: $TS",
        "Start Commit: $StartCommit",
        "Branch: $BranchName",
        "Profile: $Profile",
        "",
        "$statDiff",
        "",
        "$patchDiff"
    )
    $summaryLines | Out-File -FilePath $SummaryFile -Encoding utf8 -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host "Summary saved to: $SummaryFile" -ForegroundColor DarkGray
    Write-Host ''
    Write-Host "To KEEP changes:   git checkout main; git merge $BranchName" -ForegroundColor Green
    Write-Host "To ROLL BACK:      git checkout main; git branch -D $BranchName" -ForegroundColor Red
    Write-Host '============================================================' -ForegroundColor Cyan

} finally {
    Pop-Location
}
