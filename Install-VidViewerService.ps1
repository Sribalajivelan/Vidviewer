<#
.SYNOPSIS
    Installs VidViewer as a Windows Service that starts automatically.

.DESCRIPTION
    Unlike Start-VidViewer.ps1 (which runs in your terminal until you press
    Ctrl+C), this installs VidViewer as a real Windows Service: it starts
    in the background when Windows boots - before anyone logs in - runs
    for as long as the machine is on, and Windows restarts it automatically
    if it ever crashes. No terminal window needs to stay open.

    Requires Administrator rights (it will prompt via UAC if you didn't
    already run this elevated). Steps:
    - Checks Node.js 22.5+, installs dependencies, builds the app.
    - Opens Windows Firewall rules for the port and mDNS.
    - Registers the service (via node-windows/WinSW) with your chosen
      settings baked in as its environment, and starts it.

    Manage it afterwards like any other service: `Get-Service VidViewer`,
    `Restart-Service VidViewer`, or via services.msc. Logs from the running
    app land in the `daemon\` folder this creates. To remove it, run
    Uninstall-VidViewerService.ps1.

.PARAMETER Port
    Port to listen on. Defaults to 3000.

.PARAMETER MediaRoot
    Folder to use for the default "Local" source. Only has an effect the
    very first time the app runs (before any sources exist).

.PARAMETER MdnsName
    Name to advertise on the network, e.g. "vidviewer" for
    http://vidviewer.local:<Port>. Defaults to "vidviewer".

.PARAMETER NoMdns
    Don't advertise a ".local" name.

.PARAMETER SkipBuild
    Reuse an existing build without asking. (If no build output exists
    yet, it always builds regardless of this; otherwise, without this
    switch, you're asked whether to rebuild before installing the service.)

.EXAMPLE
    .\Install-VidViewerService.ps1

.EXAMPLE
    .\Install-VidViewerService.ps1 -MediaRoot "D:\Videos" -Port 8080
#>

[CmdletBinding()]
param(
    [int]$Port = 3000,
    [string]$MediaRoot,
    [string]$MdnsName = 'vidviewer',
    [switch]$NoMdns,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')

if (-not (Test-IsAdministrator)) {
    $forward = @('-Port', $Port, '-MdnsName', $MdnsName)
    if ($MediaRoot) { $forward += @('-MediaRoot', $MediaRoot) }
    if ($NoMdns) { $forward += '-NoMdns' }
    if ($SkipBuild) { $forward += '-SkipBuild' }
    Assert-Elevated -ScriptPath $PSCommandPath -BoundArgs $forward
}

Test-NodeVersionOrExit
Install-NpmDependencies
Build-VidViewerApp -SkipBuild:$SkipBuild

$env:PORT = "$Port"
Set-MdnsEnv -MdnsName $MdnsName -NoMdns:$NoMdns
Set-MediaRootEnv -MediaRoot $MediaRoot
Set-VidViewerFirewallRules -Port $Port -NoMdns:$NoMdns
Test-NetworkCategory -Interactive

Write-Step "Registering the Windows Service..."
node scripts\service\install.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "VidViewer is now running as a Windows Service and will start" -ForegroundColor Green
Write-Host "automatically every time this machine boots." -ForegroundColor Green
Write-Host ""
Write-Host "  http://localhost:$Port"
if (-not $NoMdns) { Write-Host "  http://$MdnsName.local:$Port" }
Write-Host ""
Write-Host "Manage it with: Get-Service VidViewer / Restart-Service VidViewer / services.msc"
Write-Host "Remove it with: .\Uninstall-VidViewerService.ps1"
