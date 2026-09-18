<#
.SYNOPSIS
    Shows the IP address(es) and URLs VidViewer is (or would be) reachable
    at on your LAN, and checks the things that usually block that.

.DESCRIPTION
    A read-only diagnostic - it doesn't start, stop, or change anything - for
    answering "what IP/URL should I use from my phone, and if it's not
    working, why not". Reports:
    - This machine's real LAN IPv4 address(es) (skips loopback/APIPA).
    - Whether anything is currently listening on the app port.
    - Whether the VidViewer Windows Service is installed and its status.
    - Whether the VidViewer firewall rules exist and are enabled.
    - Whether any connected network is categorized "Public" (blocks the
      firewall rules even when they exist - the most common cause of
      "works on this laptop, not from my phone").

.PARAMETER Port
    Port to check. Defaults to 3000 (VidViewer's default).

.PARAMETER MdnsName
    mDNS name to show the .local URL for. Defaults to "vidviewer".

.EXAMPLE
    .\Show-VidViewerStatus.ps1

.EXAMPLE
    .\Show-VidViewerStatus.ps1 -Port 8080 -MdnsName movienight
#>

[CmdletBinding()]
param(
    [int]$Port = 3000,
    [string]$MdnsName = 'vidviewer'
)

Set-Location -Path $PSScriptRoot
. (Join-Path $PSScriptRoot 'scripts\Common.ps1')

Write-Step "LAN address(es) this machine is reachable at"
$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
    Where-Object { (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq 'Up' } |
    Select-Object -ExpandProperty IPAddress -Unique

if (-not $addresses) {
    Write-Warn "No active LAN network adapter found - connect to Wi-Fi or Ethernet first."
} else {
    foreach ($addr in $addresses) {
        Write-Host "  http://${addr}:$Port"
    }
    Write-Host "  http://$MdnsName.local:$Port  (mDNS - Windows/macOS/iOS only; most Android browsers can't resolve .local names)"
}

Write-Step "Is anything listening on port $Port right now?"
$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    Write-Host "  Yes - $($proc.ProcessName) (PID $($listener.OwningProcess))" -ForegroundColor Green
} else {
    Write-Warn "  No - nothing is listening on port $Port. Start it with 'npm start'/'npm run dev', or check the service below."
}

Write-Step "VidViewer Windows Service"
$service = Get-Service -Name VidViewer -ErrorAction SilentlyContinue
if ($service) {
    $color = if ($service.Status -eq 'Running') { 'Green' } else { 'Yellow' }
    Write-Host "  Installed - Status: $($service.Status), StartType: $($service.StartType)" -ForegroundColor $color
} else {
    Write-Host "  Not installed (run Install-VidViewerService.ps1 to install it as a background service)."
}

Write-Step "Firewall rules"
foreach ($rule in @(
    @{ Name = "VidViewer (TCP $Port)"; Purpose = 'app traffic' },
    @{ Name = 'VidViewer (mDNS)'; Purpose = 'the .local name' }
)) {
    $fw = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    if ($fw -and $fw.Enabled -eq 'True') {
        Write-Host "  '$($rule.Name)' - present and enabled" -ForegroundColor Green
    } elseif ($fw) {
        Write-Warn "  '$($rule.Name)' exists but is disabled - other devices can't reach $($rule.Purpose)."
    } else {
        Write-Warn "  '$($rule.Name)' is missing - other devices can't reach $($rule.Purpose). Run Start-VidViewer.ps1 or Install-VidViewerService.ps1 as Administrator to add it."
    }
}

Write-Step "Network category"
$profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue |
    Where-Object { $_.IPv4Connectivity -ne 'Disconnected' }
if (-not $profiles) {
    Write-Warn "  Could not read network profiles."
} else {
    foreach ($netProfile in $profiles) {
        if ($netProfile.NetworkCategory -eq 'Public') {
            Write-Warn "  '$($netProfile.Name)': Public - other devices on it CANNOT reach VidViewer, even with the firewall rules in place."
            Write-Warn "    Fix: Settings > Network & Internet > Wi-Fi > $($netProfile.Name) > set network profile to Private,"
            Write-Warn "    or run as Administrator: Set-NetConnectionProfile -InterfaceIndex $($netProfile.InterfaceIndex) -NetworkCategory Private"
        } else {
            Write-Host "  '$($netProfile.Name)': $($netProfile.NetworkCategory) - OK" -ForegroundColor Green
        }
    }
}
