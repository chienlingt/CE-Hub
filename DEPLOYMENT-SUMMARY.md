# Deployment Preparation Summary

## Overview
Your TBM Delivery Management System has been prepared for deployment to **lab2.tbm2u.net** on IIS.

---

## Files Created/Modified

### 1. Configuration Files
- ✅ [client/.env.production](client/.env.production) - Production environment for React app
  - API URL: `https://lab2.tbm2u.net/api`

- ✅ [server/.env.production](server/.env.production) - Production environment for Express API
  - Database: `postgres://postgres:tbm2u@lab.tbm2u.net:5432/logistics`
  - Client URL: `https://lab2.tbm2u.net`
  - Production mode enabled

### 2. IIS Configuration Files
- ✅ [client/web.config](client/web.config) - IIS configuration for React SPA
  - URL rewriting for React Router
  - MIME types for static assets
  - Security headers
  - Compression enabled

- ✅ [server/web.config](server/web.config) - IIS configuration for Node.js API
  - IISNode handler configuration
  - URL rewriting for API routes
  - Security settings (hides sensitive folders)
  - CORS headers backup
  - Performance tuning

### 3. Deployment Scripts
- ✅ [deploy.bat](deploy.bat) - Windows batch script for local build
  - Builds React client
  - Installs server dependencies
  - Generates Prisma Client
  - Provides deployment instructions

- ✅ [server-setup.ps1](server-setup.ps1) - PowerShell script for IIS server setup
  - Creates directory structure
  - Sets permissions
  - Installs dependencies
  - Configures IIS sites and app pools
  - Creates virtual application for API
  - Automated deployment process

### 4. Documentation
- ✅ [DEPLOYMENT.md](DEPLOYMENT.md) - Comprehensive deployment guide
  - Prerequisites and setup instructions
  - Step-by-step deployment process
  - Troubleshooting common issues
  - Security checklist
  - Maintenance procedures

- ✅ [QUICK-DEPLOY.md](QUICK-DEPLOY.md) - Quick reference guide
  - Fast-track deployment steps
  - Essential commands
  - Common issues and fixes
  - File structure overview

- ✅ [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) - Deployment checklist
  - Pre-deployment tasks
  - Deployment verification
  - Post-deployment testing
  - Rollback procedures
  - Maintenance schedule

### 5. Other Updates
- ✅ [.gitignore](.gitignore) - Updated to exclude build files and logs
  - Excludes `client/build/`
  - Excludes IISNode logs
  - Excludes production env files

---

## Deployment Architecture

### Structure on IIS Server
```
C:\inetpub\wwwroot\fyp\
│
├── client\                          ← React app (static files)
│   ├── index.html
│   ├── static\
│   │   ├── css\
│   │   └── js\
│   └── web.config                   ← IIS config for SPA
│
└── server\                          ← Express API (Node.js)
    ├── index.js
    ├── routes\
    ├── prisma\
    ├── node_modules\
    ├── .env                         ← Renamed from .env.production
    └── web.config                   ← IIS config for Node.js
```

### URL Routing
- **Client:** `https://lab2.tbm2u.net/` → Serves React app from `client/`
- **API:** `https://lab2.tbm2u.net/api/*` → Proxies to Node.js in `server/`

### IIS Configuration
- **Website:** `TBMDelivery`
  - Physical path: `C:\inetpub\wwwroot\fyp\client`
  - Binding: HTTPS (443), host `lab2.tbm2u.net`

- **Virtual Application:** `/api`
  - Physical path: `C:\inetpub\wwwroot\fyp\server`
  - Application pool: `TBMDeliveryAPI` (No Managed Code)

---

## Key Configuration Settings

### Client Environment (.env.production)
```bash
REACT_APP_API_BASE_URL=https://lab2.tbm2u.net/api
```

### Server Environment (.env.production)
```bash
DATABASE_URL=postgres://postgres:tbm2u@lab.tbm2u.net:5432/logistics?schema=public
PORT=4000
CLIENT_URL=https://lab2.tbm2u.net
JWT_SECRET=your-secret-key-change-in-production  # ⚠️ MUST CHANGE
NODE_ENV=production
```

### CORS Configuration (server/index.js)
- Already configured to read from `process.env.CLIENT_URL`
- Will automatically work with production settings
- No code changes needed

---

## Deployment Process Overview

### Phase 1: Local Build (Your Machine)
1. Run `deploy.bat`
2. Builds client → `client/build/`
3. Prepares server dependencies

### Phase 2: File Transfer
1. Copy `client/build/*` + `client/web.config` → Server `client/` folder
2. Copy `server/*` + `server/web.config` → Server `server/` folder
3. Rename `server/.env.production` → `server/.env`

### Phase 3: IIS Setup (On Server)
1. Run `server-setup.ps1` as Administrator
2. Installs dependencies
3. Configures IIS
4. Creates sites and app pools

### Phase 4: SSL Configuration
1. Open IIS Manager
2. Assign SSL certificate to site binding

### Phase 5: Testing
1. Test API: `https://lab2.tbm2u.net/api/health`
2. Test client: `https://lab2.tbm2u.net`
3. Verify login and functionality

---

## Prerequisites Checklist

### On IIS Server (Before Deployment)
- [ ] Windows Server with IIS installed
- [ ] Node.js v16+ installed
- [ ] IISNode module installed
- [ ] URL Rewrite module installed
- [ ] SSL certificate for lab2.tbm2u.net
- [ ] PostgreSQL accessible from server
- [ ] DNS configured (lab2.tbm2u.net → server IP)

---

## Security Considerations

### ⚠️ MUST DO Before Production
1. **Change JWT_SECRET** in `server/.env`
   - Current value: `your-secret-key-change-in-production`
   - Use a strong random string (32+ characters)
   - Example: `openssl rand -base64 32`

2. **Verify Email Credentials**
   - Email password in `.env` should be app-specific password
   - Not your actual Gmail password

3. **Review Permissions**
   - Restrict `.env` file access
   - IIS_IUSRS should have minimal necessary permissions

4. **Disable Debug Mode**
   - `server/web.config`: `devErrorsEnabled="false"`
   - `server/web.config`: `debuggingEnabled="false"`

### Security Features Implemented
✅ Helmet.js for security headers
✅ CORS configured for specific domain
✅ bcrypt for password hashing
✅ JWT for password reset tokens
✅ Session-based authentication
✅ Hidden sensitive folders in `web.config`
✅ HTTPS enforced

---

## Testing Endpoints

### API Health Check
```
GET https://lab2.tbm2u.net/api/health
Expected: {"ok": true, "time": "2025-01-23T..."}
```

### API Endpoints (require authentication)
```
GET  https://lab2.tbm2u.net/api/employees
GET  https://lab2.tbm2u.net/api/orders
POST https://lab2.tbm2u.net/api/auth/login
```

### Client Routes
```
https://lab2.tbm2u.net/          → Login page
https://lab2.tbm2u.net/dashboard → Dashboard (after login)
https://lab2.tbm2u.net/schedule  → Schedule (after login)
```

---

## Troubleshooting Quick Reference

### 500 Error (IISNode)
```powershell
# Check logs
Get-Content "C:\inetpub\wwwroot\fyp\server\iisnode\*-stderr-*.txt" -Tail 50
```

### 404 on React Routes
- Verify URL Rewrite module installed
- Check `client/web.config` exists

### CORS Errors
- Verify `CLIENT_URL` in `server/.env`
- Restart app pool: `Restart-WebAppPool -Name "TBMDeliveryAPI"`

### Database Connection Failed
```powershell
cd C:\inetpub\wwwroot\fyp\server
npx prisma studio  # Test connection
```

---

## Next Steps

1. **Review Documentation**
   - Read [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions
   - Use [QUICK-DEPLOY.md](QUICK-DEPLOY.md) as quick reference
   - Follow [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) during deployment

2. **Run Local Build**
   ```bash
   cd c:\Users\New\Documents\fyp
   deploy.bat
   ```

3. **Transfer Files**
   - Copy to IIS server as documented

4. **Run Server Setup**
   - Execute `server-setup.ps1` on IIS server

5. **Configure SSL**
   - Assign certificate in IIS Manager

6. **Test Deployment**
   - Verify API and client functionality

---

## Support & Resources

### Documentation Files
- `DEPLOYMENT.md` - Full deployment guide
- `QUICK-DEPLOY.md` - Quick reference
- `DEPLOYMENT-CHECKLIST.md` - Deployment checklist
- `CLAUDE.md` - Project overview and architecture

### Log Locations
- **IISNode logs:** `C:\inetpub\wwwroot\fyp\server\iisnode\`
- **IIS logs:** `C:\inetpub\logs\LogFiles\`

### Important Commands
```powershell
# Restart app pool
Restart-WebAppPool -Name "TBMDeliveryAPI"

# View Node.js logs
Get-Content "C:\inetpub\wwwroot\fyp\server\iisnode\*-stderr-*.txt" -Tail 50

# Test database
cd C:\inetpub\wwwroot\fyp\server
npx prisma studio
```

---

## Summary

Your application is now ready for deployment to IIS at **lab2.tbm2u.net**. All necessary configuration files, scripts, and documentation have been created. Follow the deployment guide to complete the setup.

**Key Points:**
- ✅ Client and server are configured for production
- ✅ IIS configuration files (web.config) created
- ✅ Automated deployment scripts ready
- ✅ Comprehensive documentation provided
- ⚠️ Remember to change JWT_SECRET before production
- ⚠️ SSL certificate must be configured in IIS

**Ready to deploy!** Start with [QUICK-DEPLOY.md](QUICK-DEPLOY.md) for fast-track deployment.
