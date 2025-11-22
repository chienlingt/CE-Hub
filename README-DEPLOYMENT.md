# IIS Deployment Guide - Quick Start

Welcome! This guide will help you deploy the TBM Delivery Management System to IIS at **lab2.tbm2u.net**.

---

## 📁 Documentation Files

This repository includes several deployment-related files:

| File | Purpose | When to Use |
|------|---------|-------------|
| **[QUICK-DEPLOY.md](QUICK-DEPLOY.md)** | Fast-track deployment steps | **START HERE** - Quick reference guide |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Comprehensive deployment guide | Detailed instructions & troubleshooting |
| **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** | Step-by-step checklist | During deployment to track progress |
| **[DEPLOYMENT-SUMMARY.md](DEPLOYMENT-SUMMARY.md)** | Overview of deployment setup | Understanding what was configured |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System architecture diagrams | Understanding system structure |
| **[deploy.bat](deploy.bat)** | Build script (local machine) | Building the app before deployment |
| **[server-setup.ps1](server-setup.ps1)** | IIS setup script (server) | Automated IIS configuration |

---

## 🚀 Quick Start (3 Steps)

### Step 1: Build Locally (5 minutes)
On your development machine:
```bash
cd c:\Users\New\Documents\fyp
deploy.bat
```

### Step 2: Transfer Files (10 minutes)
Copy to IIS server at `C:\inetpub\wwwroot\fyp\`:
- `client/build/*` → `client/`
- `server/*` → `server/`
- Rename `server/.env.production` to `server/.env`

### Step 3: Setup on Server (10 minutes)
On the IIS server (as Administrator):
```powershell
cd C:\inetpub\wwwroot\fyp
.\server-setup.ps1
```

Then configure SSL certificate in IIS Manager.

✅ **Done!** Test at: https://lab2.tbm2u.net

---

## 📋 Prerequisites

### On IIS Server
- ✅ Node.js v16+ installed
- ✅ IISNode module installed
- ✅ URL Rewrite module installed
- ✅ SSL certificate for lab2.tbm2u.net

**Need help?** See [Prerequisites](DEPLOYMENT.md#prerequisites-on-iis-server) in DEPLOYMENT.md

---

## 🎯 Deployment Path

Choose your experience level:

### 🟢 First-Time Deployer
1. Read **[QUICK-DEPLOY.md](QUICK-DEPLOY.md)** (5-minute overview)
2. Use **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** (follow step-by-step)
3. Reference **[DEPLOYMENT.md](DEPLOYMENT.md)** when you need details

### 🟡 Experienced with IIS
1. Run **[deploy.bat](deploy.bat)** to build
2. Transfer files to server
3. Run **[server-setup.ps1](server-setup.ps1)** on server
4. Configure SSL and test

### 🔵 Just Updating Existing Deployment
See [Updating After Initial Deployment](QUICK-DEPLOY.md#updating-after-initial-deployment) section

---

## 🏗️ Architecture Overview

```
https://lab2.tbm2u.net/          → React Client (Static Files)
https://lab2.tbm2u.net/api/*     → Express API (Node.js via IISNode)
                                    ↓
                           PostgreSQL Database
                           (lab.tbm2u.net:5432)
```

**Details:** See [ARCHITECTURE.md](ARCHITECTURE.md) for full diagrams and explanation

---

## 🔐 Security Reminders

Before going to production:

1. **⚠️ Change JWT_SECRET** in `server/.env`
   ```bash
   JWT_SECRET="your-strong-random-string-here"
   ```

2. **✅ Verify SSL** certificate is valid and installed

3. **✅ Review permissions** on server folders

4. **✅ Disable debug mode** in `server/web.config`:
   ```xml
   <iisnode devErrorsEnabled="false" debuggingEnabled="false" />
   ```

---

## 🧪 Testing Your Deployment

### 1. API Health Check
```
GET https://lab2.tbm2u.net/api/health
```
Expected: `{"ok": true, "time": "..."}`

### 2. Client Access
```
https://lab2.tbm2u.net
```
Expected: Login page loads

### 3. Login Test
Use test credentials to verify authentication works

**Troubleshooting:** See [QUICK-DEPLOY.md#if-something-goes-wrong](QUICK-DEPLOY.md#if-something-goes-wrong)

---

## 📞 Getting Help

### Check Logs
```powershell
# Node.js errors
Get-Content "C:\inetpub\wwwroot\fyp\server\iisnode\*-stderr-*.txt" -Tail 50

# IIS HTTP logs
Get-Content "C:\inetpub\logs\LogFiles\W3SVC*\*.log" -Tail 100
```

### Common Issues

| Problem | Solution |
|---------|----------|
| 500 Error | Check IISNode logs, verify Node.js installed |
| 404 on routes | Install URL Rewrite module, check web.config |
| CORS errors | Verify CLIENT_URL in .env, restart app pool |
| DB connection | Check DATABASE_URL, test with `npx prisma studio` |

**Full Troubleshooting:** See [DEPLOYMENT.md](DEPLOYMENT.md#troubleshooting)

---

## 🔄 Update Workflow

### Quick Update (Client Only)
```bash
# Local machine
cd client
npm run build

# Transfer client/build/* to server
# No restart needed (static files)
```

### Full Update (Client + Server)
```powershell
# On server (stop app pool first)
Stop-WebAppPool -Name "TBMDeliveryAPI"

# Transfer files, then:
cd C:\inetpub\wwwroot\fyp\server
npm install --production
npx prisma generate

# Start app pool
Start-WebAppPool -Name "TBMDeliveryAPI"
```

---

## 📚 Additional Resources

### Project Documentation
- **[CLAUDE.md](CLAUDE.md)** - Development guidelines & architecture
- **[package.json](client/package.json)** - Client dependencies
- **[package.json](server/package.json)** - Server dependencies
- **[schema.prisma](server/prisma/schema.prisma)** - Database schema

### External Resources
- [IISNode Documentation](https://github.com/Azure/iisnode)
- [URL Rewrite Module](https://www.iis.net/downloads/microsoft/url-rewrite)
- [Prisma Documentation](https://www.prisma.io/docs)

---

## ✅ Deployment Success Criteria

Your deployment is successful when:
- [ ] API health check returns OK
- [ ] Client loads at https://lab2.tbm2u.net
- [ ] Login functionality works
- [ ] No errors in browser console
- [ ] No errors in IISNode logs
- [ ] Database operations complete successfully

---

## 🎉 Ready to Deploy?

**Recommended Path:**

1. **Read:** [QUICK-DEPLOY.md](QUICK-DEPLOY.md) (5 minutes)
2. **Print:** [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md) (to track progress)
3. **Run:** [deploy.bat](deploy.bat) on local machine
4. **Follow:** Step-by-step instructions from checklist
5. **Reference:** [DEPLOYMENT.md](DEPLOYMENT.md) when needed

**Good luck! 🚀**

---

## 📝 Notes

- Default app pool name: `TBMDeliveryAPI`
- Default site name: `TBMDelivery`
- Default server path: `C:\inetpub\wwwroot\fyp\`
- These can be changed in [server-setup.ps1](server-setup.ps1) parameters

---

## 🤝 Support

If you encounter issues:
1. Check logs (see "Getting Help" section above)
2. Review troubleshooting in [DEPLOYMENT.md](DEPLOYMENT.md#troubleshooting)
3. Verify all prerequisites are met
4. Consult [ARCHITECTURE.md](ARCHITECTURE.md) to understand system flow

---

**Last Updated:** 2025-01-23
**Target Environment:** IIS on Windows Server
**Domain:** lab2.tbm2u.net
