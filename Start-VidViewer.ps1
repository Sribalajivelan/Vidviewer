<#
.SYNOPSIS
    Builds and runs VidViewer, exposing it to your local network.

.DESCRIPTION
    - Checks that Node.js 22.5+ is installed (required for the built-in
      SQLite module VidViewer uses).
    - Installs dependencies on first run.
    - Builds the app if it hasn't been built yet, otherwise asks whether
      to rebuild before starting (see -SkipBuild).
    - Opens Windows Firewall rules for the chosen port and for mDNS so
      other devices on your Wi-Fi/LAN can reach it (skipped if not run as
      Administrator; you'll get firewall prompts from Windows instead the
      first time).
    - Starts the server, which also advertises itself over mDNS as
      "<MdnsName>.local" so you can use that name instead of an IP address
      from phones/laptops on the same network.
    - Prints the URLs to open from other devices.

    This runs VidViewer in your current terminal (Ctrl+C stops it). To have
    it start automatically in the background and survive reboots, use
    Install-VidViewerService.ps1 instead.

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
    Reuse an existing build without asking. (If no build output exists
    yet, it always builds regardless of this; otherwise, without this
    switch, you're asked whether to rebuild before starting.)

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

# Always run from the folder this script lives in (the project root).
Set-Location -Path $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')

Test-NodeVersionOrExit
Install-NpmDependencies
Build-VidViewerApp -SkipBuild:$SkipBuild

$env:PORT = "$Port"
Set-MdnsEnv -MdnsName $MdnsName -NoMdns:$NoMdns
Set-MediaRootEnv -MediaRoot $MediaRoot

if (-not $SkipFirewall) {
    Set-VidViewerFirewallRules -Port $Port -NoMdns:$NoMdns
}

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

Write-Step "Starting VidViewer on port $Port ..."
Write-Host ""
npm start
