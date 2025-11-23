# IIS Setup Script for TBM Delivery System
# Run as Administrator from: C:\inetpub\wwwroot\fyp

param(
    [string]$SiteName = "TBMDelivery",
    [string]$AppPoolName = "TBMDeliveryAPI",
    [string]$HostName = "lab2.tbm2u.net"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TBM Delivery - IIS Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Must run as Administrator" -ForegroundColor Red
    pause
    exit 1
}

# Import IIS module
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (-not (Get-Module WebAdministration)) {
    Write-Host "ERROR: IIS Web Administration module not found" -ForegroundColor Red
    pause
    exit 1
}

$gitRoot = $PSScriptRoot
$clientPath = Join-Path $gitRoot "client"
$serverPath = Join-Path $gitRoot "server"

Write-Host "Git Root: $gitRoot" -ForegroundColor Gray
Write-Host "Client: $clientPath" -ForegroundColor Gray
Write-Host "Server: $serverPath" -ForegroundColor Gray
Write-Host ""

# Set permissions
Write-Host "[1/4] Setting folder permissions..." -ForegroundColor Green
icacls $serverPath /grant "IIS_IUSRS:(OI)(CI)F" /T | Out-Null
icacls $clientPath /grant "IIS_IUSRS:(OI)(CI)R" /T | Out-Null
Write-Host "Permissions set" -ForegroundColor Gray
Write-Host ""

# Create/Update App Pool
Write-Host "[2/4] Creating Application Pool..." -ForegroundColor Green
if (Test-Path "IIS:\AppPools\$AppPoolName") {
    Write-Host "App pool exists, updating..." -ForegroundColor Yellow
    Stop-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    New-WebAppPool -Name $AppPoolName | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ""
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name enable32BitAppOnWin64 -Value $false
Write-Host "App pool configured" -ForegroundColor Gray
Write-Host ""

# Create/Update Website
Write-Host "[3/4] Creating Website..." -ForegroundColor Green
if (Test-Path "IIS:\Sites\$SiteName") {
    Write-Host "Site exists, updating..." -ForegroundColor Yellow
    Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $clientPath
} else {
    New-Website -Name $SiteName -PhysicalPath $clientPath -Force | Out-Null
}

# Set HTTPS binding
$binding = Get-WebBinding -Name $SiteName -Protocol "https" -HostHeader $HostName -ErrorAction SilentlyContinue
if (-not $binding) {
    New-WebBinding -Name $SiteName -Protocol "https" -Port 443 -HostHeader $HostName -ErrorAction SilentlyContinue
    Write-Host "HTTPS binding added (assign SSL certificate in IIS Manager)" -ForegroundColor Yellow
}
Write-Host "Website configured" -ForegroundColor Gray
Write-Host ""

# Create Virtual Application for API
Write-Host "[4/4] Creating API Virtual Application..." -ForegroundColor Green
if (Test-Path "IIS:\Sites\$SiteName\api") {
    Remove-WebApplication -Name "api" -Site $SiteName -ErrorAction SilentlyContinue
}
New-WebApplication -Name "api" -Site $SiteName -PhysicalPath $serverPath -ApplicationPool $AppPoolName | Out-Null
Write-Host "API configured" -ForegroundColor Gray
Write-Host ""

# Start services
Start-WebAppPool -Name $AppPoolName
Start-Website -Name $SiteName

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Assign SSL certificate in IIS Manager" -ForegroundColor Gray
Write-Host "2. Verify .env: $serverPath\.env" -ForegroundColor Gray
Write-Host "3. Run: .\deploy-to-iis.ps1" -ForegroundColor Gray
Write-Host "4. Test: https://$HostName/api/health" -ForegroundColor Gray
Write-Host ""
pause
