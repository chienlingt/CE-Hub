# PowerShell script to set up the server on IIS
# Run this script ON THE IIS SERVER after transferring files

param(
    [string]$SiteName = "TBMDelivery",
    [string]$AppPoolName = "TBMDeliveryAPI",
    [string]$HostName = "lab2.tbm2u.net",
    [string]$BasePath = "C:\inetpub\wwwroot\fyp"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TBM Delivery System - IIS Setup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# Import IIS module
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (-not (Get-Module WebAdministration)) {
    Write-Host "ERROR: IIS Web Administration module not found" -ForegroundColor Red
    Write-Host "Please ensure IIS is installed on this server" -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "[1/8] Creating directory structure..." -ForegroundColor Green
$clientPath = Join-Path $BasePath "client"
$serverPath = Join-Path $BasePath "server"

New-Item -ItemType Directory -Path $clientPath -Force | Out-Null
New-Item -ItemType Directory -Path $serverPath -Force | Out-Null
Write-Host "Directories created at $BasePath" -ForegroundColor Gray
Write-Host ""

Write-Host "[2/8] Setting folder permissions..." -ForegroundColor Green
# Grant IIS_IUSRS permissions
icacls $serverPath /grant "IIS_IUSRS:(OI)(CI)F" /T | Out-Null
icacls $clientPath /grant "IIS_IUSRS:(OI)(CI)R" /T | Out-Null
Write-Host "Permissions set for IIS_IUSRS" -ForegroundColor Gray
Write-Host ""

Write-Host "[3/8] Installing server dependencies..." -ForegroundColor Green
Push-Location $serverPath
if (Test-Path "package.json") {
    Write-Host "Running npm install..." -ForegroundColor Gray
    npm install --production
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: npm install failed" -ForegroundColor Red
        Pop-Location
        pause
        exit 1
    }

    Write-Host "Generating Prisma Client..." -ForegroundColor Gray
    npx prisma generate
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Prisma generate failed" -ForegroundColor Red
        Pop-Location
        pause
        exit 1
    }
} else {
    Write-Host "WARNING: package.json not found in $serverPath" -ForegroundColor Yellow
    Write-Host "Make sure you've copied the server files to this location" -ForegroundColor Yellow
}
Pop-Location
Write-Host ""

Write-Host "[4/8] Creating Application Pool..." -ForegroundColor Green
# Check if app pool exists
if (Test-Path "IIS:\AppPools\$AppPoolName") {
    Write-Host "Application pool '$AppPoolName' already exists, updating settings..." -ForegroundColor Yellow
    Stop-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    New-WebAppPool -Name $AppPoolName | Out-Null
    Write-Host "Application pool '$AppPoolName' created" -ForegroundColor Gray
}

# Configure app pool
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ""
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name enable32BitAppOnWin64 -Value $false
Write-Host "Application pool configured (No Managed Code)" -ForegroundColor Gray
Write-Host ""

Write-Host "[5/8] Creating/Updating IIS Website..." -ForegroundColor Green
# Check if site exists
if (Test-Path "IIS:\Sites\$SiteName") {
    Write-Host "Website '$SiteName' already exists, updating..." -ForegroundColor Yellow
    Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    # Update physical path
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $clientPath
} else {
    # Create new site
    New-Website -Name $SiteName -PhysicalPath $clientPath -Force | Out-Null
    Write-Host "Website '$SiteName' created" -ForegroundColor Gray
}

# Set binding
$binding = Get-WebBinding -Name $SiteName -Protocol "https" -HostHeader $HostName -ErrorAction SilentlyContinue
if (-not $binding) {
    Write-Host "Adding HTTPS binding for $HostName" -ForegroundColor Gray
    Write-Host "NOTE: You'll need to assign an SSL certificate manually in IIS Manager" -ForegroundColor Yellow
    New-WebBinding -Name $SiteName -Protocol "https" -Port 443 -HostHeader $HostName -ErrorAction SilentlyContinue
}
Write-Host ""

Write-Host "[6/8] Creating API Virtual Application..." -ForegroundColor Green
# Check if virtual app exists
$appPath = "IIS:\Sites\$SiteName\api"
if (Test-Path $appPath) {
    Write-Host "Virtual application 'api' already exists, updating..." -ForegroundColor Yellow
    Remove-WebApplication -Name "api" -Site $SiteName -ErrorAction SilentlyContinue
}

# Create virtual application
New-WebApplication -Name "api" -Site $SiteName -PhysicalPath $serverPath -ApplicationPool $AppPoolName | Out-Null
Write-Host "API virtual application created at /api" -ForegroundColor Gray
Write-Host ""

Write-Host "[7/8] Starting services..." -ForegroundColor Green
Start-WebAppPool -Name $AppPoolName
Start-Website -Name $SiteName
Write-Host "Application pool and website started" -ForegroundColor Gray
Write-Host ""

Write-Host "[8/8] Verifying installation..." -ForegroundColor Green
$clientWebConfig = Join-Path $clientPath "web.config"
$serverWebConfig = Join-Path $serverPath "web.config"
$serverEnv = Join-Path $serverPath ".env"

$issues = @()
if (-not (Test-Path $clientWebConfig)) {
    $issues += "Client web.config not found at $clientWebConfig"
}
if (-not (Test-Path $serverWebConfig)) {
    $issues += "Server web.config not found at $serverWebConfig"
}
if (-not (Test-Path $serverEnv)) {
    $issues += ".env file not found at $serverEnv (should be renamed from .env.production)"
}
if (-not (Test-Path (Join-Path $clientPath "index.html"))) {
    $issues += "Client build files not found (index.html missing)"
}
if (-not (Test-Path (Join-Path $serverPath "index.js"))) {
    $issues += "Server index.js not found"
}

if ($issues.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNINGS - Please address these issues:" -ForegroundColor Yellow
    foreach ($issue in $issues) {
        Write-Host "  - $issue" -ForegroundColor Yellow
    }
} else {
    Write-Host "All required files found!" -ForegroundColor Gray
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Assign SSL certificate to the site in IIS Manager:" -ForegroundColor White
Write-Host "   - Open IIS Manager" -ForegroundColor Gray
Write-Host "   - Select site '$SiteName'" -ForegroundColor Gray
Write-Host "   - Click 'Bindings' -> Edit HTTPS binding" -ForegroundColor Gray
Write-Host "   - Select your SSL certificate for $HostName" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Verify .env configuration:" -ForegroundColor White
Write-Host "   - Edit: $serverEnv" -ForegroundColor Gray
Write-Host "   - Ensure DATABASE_URL, JWT_SECRET, and other settings are correct" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Test the deployment:" -ForegroundColor White
Write-Host "   - API Health Check: https://$HostName/api/health" -ForegroundColor Gray
Write-Host "   - Website: https://$HostName" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Check logs if there are issues:" -ForegroundColor White
Write-Host "   - Server logs: $serverPath\iisnode\" -ForegroundColor Gray
Write-Host "   - IIS logs: C:\inetpub\logs\LogFiles\" -ForegroundColor Gray
Write-Host ""
Write-Host "Site Name: $SiteName" -ForegroundColor Cyan
Write-Host "App Pool: $AppPoolName" -ForegroundColor Cyan
Write-Host "Domain: $HostName" -ForegroundColor Cyan
Write-Host ""
pause
