@echo off
REM Deployment preparation script for TBM Delivery System
REM Run this on your LOCAL machine before transferring files to IIS server

echo ========================================
echo TBM Delivery System - Deployment Build
echo ========================================
echo.

REM Build the client
echo [1/4] Building React client...
cd client
call npm install
if errorlevel 1 (
    echo ERROR: Client npm install failed
    pause
    exit /b 1
)

call npm run build
if errorlevel 1 (
    echo ERROR: Client build failed
    pause
    exit /b 1
)
echo Client built successfully!
echo.

REM Prepare server
cd ..\server
echo [2/4] Installing server dependencies...
call npm install --production
if errorlevel 1 (
    echo ERROR: Server npm install failed
    pause
    exit /b 1
)
echo Server dependencies installed!
echo.

echo [3/4] Generating Prisma Client...
call npx prisma generate
if errorlevel 1 (
    echo ERROR: Prisma generate failed
    pause
    exit /b 1
)
echo Prisma Client generated!
echo.

cd ..
echo [4/4] Creating deployment package structure...
echo.
echo ========================================
echo Build Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Transfer the following to your IIS server:
echo.
echo    CLIENT FILES (to C:\inetpub\wwwroot\fyp\client\):
echo    - All files from: fyp\client\build\*
echo    - Configuration: fyp\client\web.config
echo.
echo    SERVER FILES (to C:\inetpub\wwwroot\fyp\server\):
echo    - All files from: fyp\server\*
echo    - EXCEPT: node_modules folder (will reinstall on server)
echo    - Remember to rename .env.production to .env on the server
echo.
echo 2. On the IIS server, run:
echo    cd C:\inetpub\wwwroot\fyp\server
echo    npm install --production
echo    npx prisma generate
echo.
echo 3. Follow the steps in DEPLOYMENT.md for IIS configuration
echo.
pause
