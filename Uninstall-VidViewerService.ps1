<#
.SYNOPSIS
    Stops and removes the VidViewer Windows Service.

.DESCRIPTION
    Reverses Install-VidViewerService.ps1: stops the service if it's
    running and unregisters it from Windows. Requires Administrator rights
    (prompts via UAC if needed). Your sources and watch history (the
    data\vidviewer.db file) are left alone.

.EXAMPLE
    .\Uninstall-VidViewerService.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')

if (-not (Test-IsAdministrator)) {
    Assert-Elevated -ScriptPath $PSCommandPath -BoundArgs @()
}

Write-Step "Removing the Windows Service..."
node scripts\service\uninstall.js
exit $LASTEXITCODE
