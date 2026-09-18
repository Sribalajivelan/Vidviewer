<#
.SYNOPSIS
    Builds and runs VidViewer, exposing it to your local network.

.DESCRIPTION
    - Checks that Node.js 22.5+ is installed (required for the built-in
      SQLite module VidViewer uses).
    - Installs dependencies on first run.
    - Builds the app if it hasn't been built yet.
    - Opens Windows Firewall rules for the chosen port and for mDNS so
      other devices on your Wi-Fi/LAN can reach it (skipped if not run as
      Administrator; you'll get firewall prompts from Windows instead the
      first time).
    - Starts the server, which also advertises itself over mDNS as
      "<MdnsName>.local" so you can use that name instead of an IP address
      from phones/laptops on the same network.
    - Prints the URLs to open from other devices.

.PARAMETER Port
    Port to listen on. Defaults to 3000.

.PARAMETER MediaRoot
    Folder to use for the default "Local" source. Only has an effect the
    very first time you run this (before any sources exist) - after that,
    add/change folders from within the app itself.

.PARAMETER MdnsName
    The name VidViewer advertises itself as on the local network, e.g.
    "vidviewer" makes it reachable at http://vidviewer.local:<Port>.
    Defaults to "vidviewer". Needs another device that supports mDNS
    (Bonjour) to resolve it - that's the default on macOS, iOS, Android,
    and modern Windows/Linux out of the box.

.PARAMETER NoMdns
    Don't advertise a ".local" name; only the plain IP address URLs work.

.PARAMETER SkipBuild
    Skip the build step even if a previous build exists but might be stale.
    (A build always runs if no build output is found yet.)

.PARAMETER SkipFirewall
    Don't try to add Windows Firewall rules.

.PARAMETER NoBrowser
    Don't automatically open your browser once the server is up.

.EXAMPLE
    .\Start-VidViewer.ps1

.EXAMPLE
    .\Start-VidViewer.ps1 -MediaRoot "D:\Videos" -Port 8080 -MdnsName movienight
#>

[CmdletBinding()]
param(
    [int]$Port = 3000,
    [string]$MediaRoot,
    [string]$MdnsName = 'vidviewer',
    [switch]$NoMdns,
    [switch]$SkipBuild,
    [switch]$SkipFirewall,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Warn {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Yellow
}

# Always run from the folder this script lives in (the project root).
Set-Location -Path $PSScriptRoot

# --- 1. Node.js version check -------------------------------------------

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "Node.js was not found on PATH." -ForegroundColor Red
    Write-Host "Install Node.js 22.5 or newer from https://nodejs.org and re-run this script." -ForegroundColor Red
    exit 1
}

$nodeVersionRaw = (node --version).Trim().TrimStart('v')
try {
    $nodeVersion = [version]($nodeVersionRaw -replace '-.*$', '')
} catch {
    $nodeVersion = $null
}
$minVersion = [version]'22.5.0'

if (-not $nodeVersion -or $nodeVersion -lt $minVersion) {
    Write-Host "Found Node.js $nodeVersionRaw, but VidViewer needs 22.5.0 or newer" -ForegroundColor Red
    Write-Host "(it uses Node's built-in SQLite module). Please upgrade Node.js from https://nodejs.org." -ForegroundColor Red
    exit 1
}
Write-Step "Node.js $nodeVersionRaw OK"

# --- 2. Install dependencies ---------------------------------------------

if (-not (Test-Path "node_modules")) {
    Write-Step "Installing dependencies (npm install)..."
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# --- 3. Build ---------------------------------------------------------

if (-not $SkipBuild -or -not (Test-Path ".next")) {
    Write-Step "Building the app (npm run build)..."
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# --- 4. Environment for this run -----------------------------------------

$env:PORT = "$Port"

if ($MdnsName -notmatch '^[a-zA-Z0-9-]+$') {
    Write-Host "-MdnsName can only contain letters, numbers, and hyphens (got '$MdnsName')." -ForegroundColor Red
    exit 1
}
if ($NoMdns) {
    $env:MDNS_DISABLED = '1'
} else {
    $env:MDNS_NAME = $MdnsName
}

if ($MediaRoot) {
    $resolved = Resolve-Path -Path $MediaRoot -ErrorAction SilentlyContinue
    if (-not $resolved) {
        Write-Host "Folder not found: $MediaRoot" -ForegroundColor Red
        exit 1
    }
    $env:MEDIA_ROOT = $resolved.Path
    Write-Step "MEDIA_ROOT set to $($resolved.Path) (only used if no sources exist yet)"
}

# --- 5. Windows Firewall ---------------------------------------------

if (-not $SkipFirewall) {
    $isAdmin = ([Security.Principal.WindowsPrincipal] `
        [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
            [Security.Principal.WindowsBuiltInRole]::Administrator)

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

    if ($anyMissing) {
        if ($isAdmin) {
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
            Write-Warn "Windows will likely prompt to 'Allow access' the first time Node listens on the network - accept it,"
            Write-Warn "or re-run this script as Administrator to have it set the rules up for you (needed for both the app"
            Write-Warn "port and, if you want the '.local' name to work, mDNS on UDP 5353)."
        }
    }
}

# --- 6. Open a browser once the server responds --------------------------

if (-not $NoBrowser) {
    Start-Job -ScriptBlock {
        param($Port)
        for ($i = 0; $i -lt 30; $i++) {
            try {
                Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 1 | Out-Null
                Start-Process "http://localhost:$Port"
                return
            } catch {
                Start-Sleep -Milliseconds 500
            }
        }
    } -ArgumentList $Port | Out-Null
}

# --- 7. Run it -----------------------------------------------------

Write-Step "Starting VidViewer on port $Port ..."
Write-Host ""
npm start
