<#
.SYNOPSIS
    Builds and runs VidViewer, exposing it to your local network.

.DESCRIPTION
    - Checks that Node.js 22.5+ is installed (required for the built-in
      SQLite module VidViewer uses).
    - Installs dependencies on first run.
    - Builds the app if it hasn't been built yet.
    - Opens a Windows Firewall rule for the chosen port so other devices
      on your Wi-Fi/LAN can reach it (skipped if not run as Administrator;
      you'll get a firewall prompt from Windows instead the first time).
    - Starts the server and prints the URL to open from other devices.

.PARAMETER Port
    Port to listen on. Defaults to 3000.

.PARAMETER MediaRoot
    Folder to use for the default "Local" source. Only has an effect the
    very first time you run this (before any sources exist) - after that,
    add/change folders from within the app itself.

.PARAMETER SkipBuild
    Skip the build step even if a previous build exists but might be stale.
    (A build always runs if no build output is found yet.)

.PARAMETER SkipFirewall
    Don't try to add a Windows Firewall rule.

.PARAMETER NoBrowser
    Don't automatically open your browser once the server is up.

.EXAMPLE
    .\Start-VidViewer.ps1

.EXAMPLE
    .\Start-VidViewer.ps1 -MediaRoot "D:\Videos" -Port 8080
#>

[CmdletBinding()]
param(
    [int]$Port = 3000,
    [string]$MediaRoot,
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
    $ruleName = "VidViewer (TCP $Port)"

    $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existingRule) {
        if ($isAdmin) {
            Write-Step "Adding a Windows Firewall rule for TCP port $Port..."
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
                -Action Allow -Protocol TCP -LocalPort $Port `
                -Profile Private, Domain | Out-Null
        } else {
            Write-Warn "Not running as Administrator, so this script can't add a firewall rule automatically."
            Write-Warn "Windows will likely show an 'Allow access' prompt the first time Node listens on the network - accept it,"
            Write-Warn "or re-run this script as Administrator to have it set up the rule for you."
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
