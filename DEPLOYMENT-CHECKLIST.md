# IIS Deployment Checklist

Use this checklist to ensure a smooth deployment to **lab2.tbm2u.net**

---

## Pre-Deployment (Local Machine)

### ✅ Preparation
- [ ] Reviewed code changes and tested locally
- [ ] Updated version numbers (if applicable)
- [ ] Committed all changes to git
- [ ] Created backup of current production (if updating)

### ✅ Build Process
- [ ] Ran `deploy.bat` successfully
- [ ] Verified `client/build/` folder was created
- [ ] Confirmed `client/build/index.html` exists
- [ ] Checked for build warnings or errors (npm output)

### ✅ Configuration Files
- [ ] Verified `client/.env.production` has correct API URL
- [ ] Verified `server/.env.production` has correct settings
- [ ] Checked `JWT_SECRET` is set to strong value (not default)
- [ ] Confirmed `DATABASE_URL` points to correct database
- [ ] Verified `CLIENT_URL` is set to `https://lab2.tbm2u.net`
- [ ] Email settings are configured correctly

### ✅ Files to Transfer
- [ ] Prepared client files: `client/build/*` + `client/web.config`
- [ ] Prepared server files: `server/*` (excluding `node_modules/`)
- [ ] Have `serviceAccountKey.json` ready (if using Firebase)
- [ ] Have `.env.production` ready to rename to `.env`

---

## IIS Server Prerequisites

### ✅ Software Installed
- [ ] Node.js (v16 or later) - verify with `node --version`
- [ ] npm - verify with `npm --version`
- [ ] IISNode module installed
- [ ] URL Rewrite module installed
- [ ] PostgreSQL client libraries (for Prisma)

### ✅ IIS Features Enabled
- [ ] Web Server (IIS) role installed
- [ ] WebSocket Protocol enabled
- [ ] Static Content enabled
- [ ] Default Document enabled
- [ ] HTTP Redirection enabled

### ✅ Network & Security
- [ ] Port 443 (HTTPS) is open
- [ ] SSL certificate obtained for lab2.tbm2u.net
- [ ] DNS points to server IP address
- [ ] Firewall allows inbound HTTPS traffic
- [ ] PostgreSQL port 5432 accessible (if remote DB)

---

## Deployment Steps (On IIS Server)

### ✅ File Transfer
- [ ] Created directory: `C:\inetpub\wwwroot\fyp\`
- [ ] Copied client files to `C:\inetpub\wwwroot\fyp\client\`
- [ ] Copied server files to `C:\inetpub\wwwroot\fyp\server\`
- [ ] Copied `client/web.config`
- [ ] Copied `server/web.config`
- [ ] Renamed `server/.env.production` to `server/.env`
- [ ] Verified `serviceAccountKey.json` is in server folder

### ✅ Server Setup
- [ ] Ran `server-setup.ps1` as Administrator
- [ ] Script completed without errors
- [ ] Dependencies installed: `npm install --production`
- [ ] Prisma Client generated: `npx prisma generate`
- [ ] Application Pool created: `TBMDeliveryAPI`
- [ ] Website created: `TBMDelivery`
- [ ] Virtual application `/api` created

### ✅ Permissions
- [ ] IIS_IUSRS has full control on `server/` folder
- [ ] IIS_IUSRS has read access on `client/` folder
- [ ] Application Pool identity has necessary permissions

### ✅ IIS Configuration
- [ ] Site binding configured for HTTPS port 443
- [ ] Host name set to `lab2.tbm2u.net`
- [ ] SSL certificate assigned to site binding
- [ ] Application Pool set to "No Managed Code"
- [ ] Virtual application `/api` uses correct Application Pool

### ✅ Database
- [ ] Database connection string verified in `.env`
- [ ] Tested connection: `npx prisma studio` opens successfully
- [ ] Migrations applied (if needed): `npx prisma migrate deploy`
- [ ] Database is accessible from IIS server

---

## Post-Deployment Testing

### ✅ API Tests
- [ ] Health check works: `https://lab2.tbm2u.net/api/health`
  - Expected: `{"ok": true, "time": "..."}`
- [ ] API endpoint responds: `https://lab2.tbm2u.net/api/employees`
- [ ] No CORS errors in browser console

### ✅ Client Tests
- [ ] Homepage loads: `https://lab2.tbm2u.net`
- [ ] Static assets load (CSS, JS, images)
- [ ] Login page displays correctly
- [ ] React Router works (try navigating to different routes)
- [ ] No 404 errors on page refresh

### ✅ Functionality Tests
- [ ] Login works with test credentials
- [ ] Session persists after login
- [ ] Navigation menu appears based on user role
- [ ] Can view data (employees, orders, etc.)
- [ ] Can create/update records
- [ ] Password reset email sends successfully

### ✅ Performance & Security
- [ ] HTTPS redirects work (if HTTP->HTTPS redirect configured)
- [ ] SSL certificate is valid and trusted
- [ ] Page load times are acceptable
- [ ] API response times are reasonable
- [ ] Browser console shows no critical errors
- [ ] No sensitive data exposed in API responses

---

## Log Verification

### ✅ Check Logs for Errors
- [ ] Reviewed IISNode logs: `C:\inetpub\wwwroot\fyp\server\iisnode\`
- [ ] Reviewed IIS logs: `C:\inetpub\logs\LogFiles\`
- [ ] No critical errors or warnings in logs
- [ ] Server started successfully (check stdout logs)

### ✅ Monitor Initial Usage
- [ ] Watched logs during first few API requests
- [ ] Verified no database connection errors
- [ ] Checked for any authentication issues
- [ ] Monitored for memory leaks or crashes

---

## Production Configuration Verification

### ✅ Environment Variables (server/.env)
```bash
- [ ] DATABASE_URL=postgres://postgres:tbm2u@lab.tbm2u.net:5432/logistics?schema=public
- [ ] PORT=4000
- [ ] CLIENT_URL=https://lab2.tbm2u.net
- [ ] JWT_SECRET=[strong-random-value]  # NOT the default!
- [ ] NODE_ENV=production
- [ ] EMAIL_* settings configured
```

### ✅ Security Settings
- [ ] JWT_SECRET changed from default value
- [ ] Database password is secure
- [ ] Email password is an app-specific password
- [ ] `.env` file permissions restricted
- [ ] `devErrorsEnabled="false"` in `server/web.config`
- [ ] Error messages don't expose sensitive info

---

## Rollback Plan

### ✅ In Case of Issues
- [ ] Backup of previous version exists: `C:\inetpub\backups\`
- [ ] Know how to stop app pool: `Stop-WebAppPool -Name "TBMDeliveryAPI"`
- [ ] Know how to restore backup files
- [ ] Database backup taken before migration (if schema changed)
- [ ] Can revert DNS changes if needed

---

## Post-Deployment Tasks

### ✅ Documentation
- [ ] Updated internal documentation with deployment date
- [ ] Documented any configuration changes
- [ ] Noted any issues encountered and solutions

### ✅ Monitoring Setup
- [ ] Set up log monitoring (manual or automated)
- [ ] Configure alerts for errors (if applicable)
- [ ] Schedule regular health checks
- [ ] Plan for regular backups

### ✅ User Communication
- [ ] Notified stakeholders of deployment
- [ ] Provided URL to users: `https://lab2.tbm2u.net`
- [ ] Documented any changes in functionality
- [ ] Set up support channel for issues

---

## Maintenance Schedule

### ✅ Regular Tasks
- [ ] Weekly: Review error logs
- [ ] Weekly: Check disk space on server
- [ ] Monthly: Update npm packages (security patches)
- [ ] Monthly: Review and rotate logs
- [ ] Quarterly: Database backup verification
- [ ] Quarterly: SSL certificate renewal check

---

## Quick Commands Reference

### Start/Stop Services
```powershell
# Restart app pool
Import-Module WebAdministration
Restart-WebAppPool -Name "TBMDeliveryAPI"

# Stop/Start website
Stop-Website -Name "TBMDelivery"
Start-Website -Name "TBMDelivery"
```

### View Logs
```powershell
# IISNode logs (Node.js errors)
Get-Content "C:\inetpub\wwwroot\fyp\server\iisnode\*-stderr-*.txt" -Tail 50

# IIS logs
Get-Content "C:\inetpub\logs\LogFiles\W3SVC*\*.log" -Tail 100
```

### Database Operations
```powershell
cd C:\inetpub\wwwroot\fyp\server

# Open Prisma Studio
npx prisma studio

# Run migrations
npx prisma migrate deploy

# Generate client
npx prisma generate
```

---

## Sign-Off

### Deployment Team
- [ ] Developer: _________________ Date: _______
- [ ] Tester: _________________ Date: _______
- [ ] System Admin: _________________ Date: _______

### Approval
- [ ] Project Manager: _________________ Date: _______

---

**Deployment Date:** _______________

**Version Deployed:** _______________

**Notes:**
_________________________________________________
_________________________________________________
_________________________________________________
