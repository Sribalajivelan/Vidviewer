# Shared helpers for Start-VidViewer.ps1, Install-VidViewerService.ps1, and
# Uninstall-VidViewerService.ps1. Dot-source this file; it defines functions
# only and has no side effects on its own.

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Warn {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

function Write-ErrorAndExit {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
    exit 1
}

function Test-IsAdministrator {
    ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
            [Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Re-launches this script elevated (UAC prompt) and exits the current,
# non-elevated instance. No-ops if already elevated.
function Assert-Elevated {
    param([string]$ScriptPath, [string[]]$BoundArgs)

    if (Test-IsAdministrator) { return }

    Write-Warn "This needs Administrator rights (to manage a Windows Service) - requesting elevation..."
    $argString = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$ScriptPath`"") + $BoundArgs
    Start-Process -FilePath "powershell" -ArgumentList $argString -Verb RunAs -Wait
    exit $LASTEXITCODE
}

function Test-NodeVersionOrExit {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-ErrorAndExit "Node.js was not found on PATH. Install Node.js 22.5 or newer from https://nodejs.org and re-run this script."
    }

    $nodeVersionRaw = (node --version).Trim().TrimStart('v')
    try {
        $nodeVersion = [version]($nodeVersionRaw -replace '-.*$', '')
    } catch {
        $nodeVersion = $null
    }
    $minVersion = [version]'22.5.0'

    if (-not $nodeVersion -or $nodeVersion -lt $minVersion) {
        Write-ErrorAndExit "Found Node.js $nodeVersionRaw, but VidViewer needs 22.5.0 or newer (it uses Node's built-in SQLite module). Upgrade Node.js from https://nodejs.org."
    }
    Write-Step "Node.js $nodeVersionRaw OK"
}

function Install-NpmDependencies {
    if (-not (Test-Path "node_modules")) {
        Write-Step "Installing dependencies (npm install)..."
        npm install
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
}

function Invoke-NpmBuild {
    Write-Step "Building the app (npm run build)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# No existing build: there's nothing to run yet, so just build - no point
# asking. Existing build + -SkipBuild: reuse it without asking (for
# automation, or a user who already knows they don't want to rebuild).
# Existing build otherwise: ask, since rebuilding is slow and most of the
# time nothing changed since last run.
function Build-VidViewerApp {
    param([switch]$SkipBuild)

    if (-not (Test-Path ".next")) {
        Write-Step "No existing build found."
        Invoke-NpmBuild
        return
    }

    if ($SkipBuild) { return }

    $answer = Read-Host "A previous build exists. Rebuild before starting? [y/N]"
    if ($answer -match '^y(es)?$') {
        Invoke-NpmBuild
    } else {
        Write-Step "Skipping build, using the existing one."
    }
}

function Set-MediaRootEnv {
    param([string]$MediaRoot)

    if (-not $MediaRoot) { return }
    $resolved = Resolve-Path -Path $MediaRoot -ErrorAction SilentlyContinue
    if (-not $resolved) {
        Write-ErrorAndExit "Folder not found: $MediaRoot"
    }
    $env:MEDIA_ROOT = $resolved.Path
    Write-Step "MEDIA_ROOT set to $($resolved.Path) (only used if no sources exist yet)"
}

function Set-MdnsEnv {
    param([string]$MdnsName, [switch]$NoMdns)

    if ($MdnsName -notmatch '^[a-zA-Z0-9-]+$') {
        Write-ErrorAndExit "-MdnsName can only contain letters, numbers, and hyphens (got '$MdnsName')."
    }
    if ($NoMdns) {
        $env:MDNS_DISABLED = '1'
    } else {
        $env:MDNS_NAME = $MdnsName
    }
}

# Opens the TCP app-port and UDP mDNS firewall rules if run elevated;
# otherwise just warns (Windows will prompt on first listen instead).
function Set-VidViewerFirewallRules {
    param([int]$Port, [switch]$NoMdns)

    $rulesNeeded = @(
        @{ Name = "VidViewer (TCP $Port)"; Protocol = 'TCP'; LocalPort = $Port }
    )
    if (-not $NoMdns) {
        $rulesNeeded += @{ Name = 'VidViewer (mDNS)'; Protocol = 'UDP'; LocalPort = 5353 }
    }

    $anyMissing = $false
    foreach ($rule in $rulesNeeded) {
        if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
            $anyMissing = $true
        }
    }
    if (-not $anyMissing) { return }

    if (Test-IsAdministrator) {
        foreach ($rule in $rulesNeeded) {
            if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
                Write-Step "Adding a Windows Firewall rule: $($rule.Name)..."
                New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound `
                    -Action Allow -Protocol $rule.Protocol -LocalPort $rule.LocalPort `
                    -Profile Private, Domain | Out-Null
            }
        }
    } else {
        Write-Warn "Not running as Administrator, so this script can't add firewall rules automatically."
        Write-Warn "Windows will likely prompt to 'Allow access' the first time it listens on the network - accept it,"
        Write-Warn "or re-run as Administrator to have it set the rules up for you."
    }
}
