# deploy-to-iis.ps1
# Run this after git pull to rebuild and restart
# Usage: .\deploy-to-iis.ps1

param(
    [string]$AppPoolName = "TBMDeliveryAPI"
)

$gitRoot = $PSScriptRoot
$clientPath = Join-Path $gitRoot "client"
$serverPath = Join-Path $gitRoot "server"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploying from Git to IIS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build Client
Write-Host "[1/4] Building React client..." -ForegroundColor Green
Push-Location $clientPath
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Client npm install failed" -ForegroundColor Red
    Pop-Location
    pause
    exit 1
}
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Client build failed" -ForegroundColor Red
    Pop-Location
    pause
    exit 1
}
Pop-Location
Write-Host "Client built successfully!" -ForegroundColor Gray
Write-Host ""

# Step 2: Install Server Dependencies
Write-Host "[2/4] Installing server dependencies..." -ForegroundColor Green
Push-Location $serverPath
npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Server npm install failed" -ForegroundColor Red
    Pop-Location
    pause
    exit 1
}
npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Prisma generate failed" -ForegroundColor Red
    Pop-Location
    pause
    exit 1
}
Pop-Location
Write-Host "Server dependencies installed!" -ForegroundColor Gray
Write-Host ""

# Step 3: Restart IIS App Pool
Write-Host "[3/4] Restarting IIS application pool..." -ForegroundColor Green
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (Get-Command Restart-WebAppPool -ErrorAction SilentlyContinue) {
    Restart-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
    Write-Host "App pool '$AppPoolName' restarted" -ForegroundColor Gray
} else {
    Write-Host "Could not restart app pool (run as Administrator)" -ForegroundColor Yellow
}
Write-Host ""

# Step 4: Verify .env exists
Write-Host "[4/4] Verifying configuration..." -ForegroundColor Green
$envFile = Join-Path $serverPath ".env"
if (Test-Path $envFile) {
    Write-Host ".env file found" -ForegroundColor Gray
} else {
    Write-Host "WARNING: .env file not found at $envFile" -ForegroundColor Red
    Write-Host "Copy .env.production to .env and configure it!" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test your deployment:" -ForegroundColor White
Write-Host "  API: https://lab2.tbm2u.net/api/health" -ForegroundColor Gray
Write-Host "  Client: https://lab2.tbm2u.net" -ForegroundColor Gray
Write-Host ""
