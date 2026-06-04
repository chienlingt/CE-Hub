# deploy-to-iis.ps1
# Run this after git pull to rebuild and restart
# Usage: .\deploy-to-iis.ps1 (Run as Administrator)

param(
    [string]$AppPoolName = "TBMDeliveryAPI"
)

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

$gitRoot = $PSScriptRoot
$clientPath = Join-Path $gitRoot "client"
$serverPath = Join-Path $gitRoot "server"

# Pre-flight: .env must exist before any step runs
$envFile = Join-Path $serverPath ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env file not found at $envFile" -ForegroundColor Red
    Write-Host "Copy .env.example to .env and fill in all values before deploying." -ForegroundColor Yellow
    pause
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploying from Git to IIS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 0: Stop IIS App Pool (to unlock files)
Write-Host "[1/3] Stopping IIS app pool..." -ForegroundColor Green
Import-Module WebAdministration -ErrorAction SilentlyContinue
if (Get-Command Stop-WebAppPool -ErrorAction SilentlyContinue) {
    Stop-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Write-Host "App pool stopped" -ForegroundColor Gray
} else {
    Write-Host "Could not stop app pool (run as Administrator)" -ForegroundColor Yellow
}
Write-Host ""

# Step 1: Build Client
Write-Host "[2/3] Building and installing..." -ForegroundColor Green
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
Write-Host "  Installing server dependencies..." -ForegroundColor Green
Push-Location $serverPath
npm install
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
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Prisma migration failed" -ForegroundColor Red
    Pop-Location
    pause
    exit 1
}
Pop-Location
Write-Host "Server dependencies installed!" -ForegroundColor Gray
Write-Host ""

# Step 3: Start IIS App Pool
Write-Host "[3/3] Starting IIS application pool..." -ForegroundColor Green
if (Get-Command Start-WebAppPool -ErrorAction SilentlyContinue) {
    Start-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
    Write-Host "App pool '$AppPoolName' started" -ForegroundColor Gray
} else {
    Write-Host "Could not start app pool (run as Administrator)" -ForegroundColor Yellow
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
