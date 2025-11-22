# Deployment Guide for IIS (lab2.tbm2u.net)

This guide covers deploying the TBM Delivery Management System to an IIS server with the domain **lab2.tbm2u.net**.

## Architecture Overview

- **Client (React SPA)**: Served as static files from root domain (https://lab2.tbm2u.net)
- **Server (Express API)**: Runs as Node.js app via IISNode at /api route (https://lab2.tbm2u.net/api)
- **Database**: PostgreSQL at lab.tbm2u.net:5432

## Prerequisites on IIS Server

### 1. Install Required Software

1. **Node.js** (v16 or later)
   - Download from https://nodejs.org/
   - Verify: `node --version` and `npm --version`

2. **IISNode** (enables Node.js apps on IIS)
   - Download from https://github.com/Azure/iisnode/releases
   - Install the appropriate version (x64 or x86)

3. **URL Rewrite Module** for IIS
   - Download from https://www.iis.net/downloads/microsoft/url-rewrite
   - Required for React Router and API routing

4. **PostgreSQL Client Libraries** (if not already installed)
   - Needed for Prisma to connect to PostgreSQL

### 2. Verify IIS Features

Enable the following IIS features in Windows:
- Web Server (IIS)
- WebSocket Protocol (under Application Development Features)
- Static Content
- Default Document
- HTTP Errors
- HTTP Redirection

## Pre-Deployment Steps (Local Machine)

### 1. Build the Client

```bash
cd c:\Users\New\Documents\fyp\client
npm install
npm run build
```

This creates a `build/` folder with production-ready static files.

### 2. Prepare Server Files

```bash
cd c:\Users\New\Documents\fyp\server

# Install production dependencies
npm install --production

# Generate Prisma Client
npx prisma generate
```

### 3. Copy Files to Prepare for Transfer

Create a deployment package with these files:

**For Client (to be copied to `C:\inetpub\wwwroot\fyp\client`):**
- All files from `client/build/` folder (after running `npm run build`)
- `client/web.config` (IIS configuration)

**For Server (to be copied to `C:\inetpub\wwwroot\fyp\server`):**
- All files from `server/` folder EXCEPT:
  - `node_modules/` (will reinstall on server)
  - `.env` (use `.env.production` instead)
  - `iisnode/` (log folder, will be created)
- Rename `.env.production` to `.env` on the server
- Include `serviceAccountKey.json` (Firebase credentials)
- Include `prisma/` folder with schema and migrations

## Deployment Steps (On IIS Server)

### 1. Create Directory Structure

```powershell
# Create base directory
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\fyp" -Force

# Create subdirectories
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\fyp\client" -Force
New-Item -ItemType Directory -Path "C:\inetpub\wwwroot\fyp\server" -Force
```

### 2. Copy Files to Server

Transfer the prepared files to the server:
- Copy `client/build/*` contents → `C:\inetpub\wwwroot\fyp\client\`
- Copy `client/web.config` → `C:\inetpub\wwwroot\fyp\client\web.config`
- Copy `server/*` → `C:\inetpub\wwwroot\fyp\server\`
- Copy `server/web.config` → `C:\inetpub\wwwroot\fyp\server\web.config`

### 3. Install Server Dependencies

On the IIS server, open PowerShell or Command Prompt:

```powershell
cd C:\inetpub\wwwroot\fyp\server

# Install production dependencies
npm install --production

# Generate Prisma Client
npx prisma generate

# Optional: Run database migrations (if needed)
npx prisma migrate deploy
```

### 4. Configure Environment Variables

Edit `C:\inetpub\wwwroot\fyp\server\.env`:

```bash
DATABASE_URL=postgres://postgres:tbm2u@lab.tbm2u.net:5432/logistics?schema=public
PORT=4000
CLIENT_URL=https://lab2.tbm2u.net
JWT_SECRET=your-strong-secret-key-change-this
GOOGLE_APPLICATION_CREDENTIALS=C:\inetpub\wwwroot\fyp\server\serviceAccountKey.json

EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="chewjh0707@gmail.com"
EMAIL_PASSWORD="eiud rrvp njsf lxxa"
EMAIL_FROM="TBM Delivery <noreply@gmail.com>"

NODE_ENV=production
```

**Important:** Change `JWT_SECRET` to a strong random string in production.

### 5. Set Folder Permissions

Grant IIS user (`IIS_IUSRS` or `IUSR`) permissions:

```powershell
# Grant read/write access to server folder (for logs and node_modules)
icacls "C:\inetpub\wwwroot\fyp\server" /grant "IIS_IUSRS:(OI)(CI)F" /T

# Grant read access to client folder
icacls "C:\inetpub\wwwroot\fyp\client" /grant "IIS_IUSRS:(OI)(CI)R" /T
```

### 6. Configure IIS Sites

#### Option A: Single Site with Virtual Application (Recommended)

1. **Create Main Website:**
   - Open IIS Manager
   - Right-click "Sites" → "Add Website"
   - Site name: `TBMDelivery`
   - Physical path: `C:\inetpub\wwwroot\fyp\client`
   - Binding:
     - Type: `https`
     - Host name: `lab2.tbm2u.net`
     - Port: `443`
     - SSL Certificate: Select/import your SSL certificate
   - Click OK

2. **Add API as Virtual Application:**
   - Right-click on `TBMDelivery` site → "Add Application"
   - Alias: `api`
   - Physical path: `C:\inetpub\wwwroot\fyp\server`
   - Application pool: Select or create a new pool (see step 3)
   - Click OK

#### Option B: Two Separate Sites (Alternative)

Create two separate sites and use URL Rewrite to route `/api` requests.

### 7. Configure Application Pool for Server

1. In IIS Manager, go to "Application Pools"
2. Create new pool or modify existing:
   - Name: `TBMDeliveryAPI`
   - .NET CLR version: `No Managed Code`
   - Pipeline mode: `Integrated`
3. Advanced Settings:
   - Enable 32-bit Applications: `False` (if using 64-bit Node.js)
   - Identity: `ApplicationPoolIdentity` or custom account
   - Start Mode: `AlwaysRunning` (optional, for better performance)

### 8. Test the Deployment

1. **Test API endpoint:**
   - Open browser: `https://lab2.tbm2u.net/api/health`
   - Should return: `{"status":"ok","database":"connected"}`

2. **Test Client:**
   - Open browser: `https://lab2.tbm2u.net`
   - Should load the login page

3. **Check logs:**
   - Server logs: `C:\inetpub\wwwroot\fyp\server\iisnode\`
   - IIS logs: `C:\inetpub\logs\LogFiles\`

## Troubleshooting

### Common Issues

1. **500.1001 Error (IISNode not processing)**
   - Verify IISNode is installed
   - Check `web.config` handler configuration
   - Ensure Node.js is in system PATH

2. **404 Errors on React Routes**
   - Verify URL Rewrite module is installed
   - Check `client/web.config` rewrite rules
   - Clear browser cache

3. **CORS Errors**
   - Verify `CLIENT_URL` in server `.env` matches your domain
   - Check Express CORS configuration in `server/index.js`

4. **Database Connection Errors**
   - Verify `DATABASE_URL` is correct
   - Test connection from server: `npx prisma studio`
   - Check PostgreSQL firewall rules

5. **Module Not Found Errors**
   - Re-run `npm install` in server folder
   - Run `npx prisma generate` to rebuild Prisma Client

### Enable Detailed Errors (Development Only)

In `server/web.config`, temporarily set:
```xml
<iisnode
  debuggingEnabled="true"
  devErrorsEnabled="true"
  loggingEnabled="true"
/>
```

**Remember to disable this in production!**

## Post-Deployment Tasks

### 1. Update DNS (if needed)
Ensure `lab2.tbm2u.net` points to your IIS server's IP address.

### 2. SSL Certificate
- Obtain SSL certificate for `lab2.tbm2u.net`
- Install in IIS and bind to your site
- Options: Let's Encrypt, commercial CA, or company-issued certificate

### 3. Database Migrations
If you have pending migrations:
```powershell
cd C:\inetpub\wwwroot\fyp\server
npx prisma migrate deploy
```

### 4. Set Up Monitoring
- Configure IIS logging
- Set up application monitoring (e.g., Application Insights)
- Monitor `server/iisnode/` logs for errors

### 5. Firewall Configuration
Ensure these ports are open:
- Port 443 (HTTPS) - inbound for web traffic
- Port 5432 (PostgreSQL) - if database is on different server

## Updating the Application

### Update Client

```bash
# On local machine
cd c:\Users\New\Documents\fyp\client
npm run build

# Transfer client/build/* to server
# Replace files in C:\inetpub\wwwroot\fyp\client\
```

### Update Server

```bash
# On IIS server
cd C:\inetpub\wwwroot\fyp\server

# Stop the app pool in IIS Manager first

# Transfer updated files

# Reinstall dependencies if package.json changed
npm install --production

# Regenerate Prisma Client if schema changed
npx prisma generate

# Run migrations if schema changed
npx prisma migrate deploy

# Start the app pool in IIS Manager
```

### Rolling Back

Keep backups of previous versions:
```powershell
# Before updating, backup current version
Copy-Item -Path "C:\inetpub\wwwroot\fyp" -Destination "C:\inetpub\backups\fyp-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Recurse
```

## Security Checklist

- [ ] Change `JWT_SECRET` to a strong random value
- [ ] Use HTTPS with valid SSL certificate
- [ ] Disable detailed errors in production (`devErrorsEnabled="false"`)
- [ ] Hide `.env` and `node_modules` via `web.config` security settings
- [ ] Set restrictive folder permissions (IIS_IUSRS read-only where possible)
- [ ] Enable IIS request filtering and rate limiting
- [ ] Keep Node.js and npm packages updated
- [ ] Configure firewall rules
- [ ] Set up regular database backups
- [ ] Review CORS settings in Express app

## Performance Optimization

1. **Enable IIS Compression:**
   - Static and dynamic compression (enabled in `web.config`)

2. **Node.js Process Management:**
   - In `web.config`, adjust `nodeProcessCountPerApplication` based on server cores

3. **Caching:**
   - Configure browser caching for static assets
   - Add Cache-Control headers in IIS

4. **CDN (Optional):**
   - Serve static assets from CDN for better performance

## Maintenance

### Restart Application
```powershell
# Recycle the API application pool
Import-Module WebAdministration
Restart-WebAppPool -Name "TBMDeliveryAPI"
```

### View Logs
```powershell
# Server logs (IISNode)
Get-Content "C:\inetpub\wwwroot\fyp\server\iisnode\*-stderr-*.txt" -Tail 50

# IIS logs
Get-Content "C:\inetpub\logs\LogFiles\W3SVC*\*.log" -Tail 100
```

## Support

For issues or questions:
- Check IISNode logs: `C:\inetpub\wwwroot\fyp\server\iisnode\`
- Review IIS logs: `C:\inetpub\logs\LogFiles\`
- Verify configuration: `web.config` files in client and server folders
- Test database connection: `npx prisma studio` from server folder

---

**Deployment Checklist:**

- [ ] Node.js installed on server
- [ ] IISNode installed
- [ ] URL Rewrite module installed
- [ ] Client built (`npm run build`)
- [ ] Files copied to `C:\inetpub\wwwroot\fyp\`
- [ ] Server dependencies installed (`npm install`)
- [ ] Prisma Client generated (`npx prisma generate`)
- [ ] `.env` configured with production values
- [ ] Folder permissions set
- [ ] IIS site created and configured
- [ ] Application pool configured
- [ ] SSL certificate installed and bound
- [ ] API health check returns OK
- [ ] Client loads successfully
- [ ] Login functionality works
- [ ] Database operations work
