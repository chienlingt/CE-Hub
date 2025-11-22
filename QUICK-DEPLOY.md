# Quick Deployment Guide

## TL;DR - Fast Track to Production

### Prerequisites on IIS Server
✅ Node.js (v16+)
✅ IISNode
✅ URL Rewrite Module
✅ SSL Certificate for lab2.tbm2u.net

---

## Step 1: Build Locally (Your Machine)

```bash
# Run the deployment build script
cd c:\Users\New\Documents\fyp
deploy.bat
```

This will:
- Build the React client → `client/build/`
- Install server dependencies
- Generate Prisma Client

---

## Step 2: Transfer Files to IIS Server

Copy these files to the IIS server at `C:\inetpub\wwwroot\fyp\`:

### Client Files → `C:\inetpub\wwwroot\fyp\client\`
- All contents from `client/build/*`
- File: `client/web.config`

### Server Files → `C:\inetpub\wwwroot\fyp\server\`
- All files from `server/*` folder
- **EXCLUDE:** `node_modules/` (will reinstall on server)
- File: `server/web.config`
- **IMPORTANT:** Rename `.env.production` to `.env`

---

## Step 3: Run Setup on IIS Server

Open PowerShell **as Administrator** on the IIS server:

```powershell
cd C:\inetpub\wwwroot\fyp
.\server-setup.ps1
```

This automated script will:
- Create directory structure
- Set permissions
- Install Node dependencies
- Generate Prisma Client
- Create IIS Application Pool
- Create IIS Website
- Configure API virtual application
- Start services

---

## Step 4: Configure SSL Certificate

1. Open IIS Manager
2. Select site `TBMDelivery`
3. Click **Bindings** → Edit HTTPS binding (port 443)
4. Select SSL certificate for `lab2.tbm2u.net`
5. Click OK

---

## Step 5: Verify Deployment

### Test API:
```
https://lab2.tbm2u.net/api/health
```
Expected response: `{"ok": true, "time": "..."}`

### Test Client:
```
https://lab2.tbm2u.net
```
Should load the login page.

---

## If Something Goes Wrong

### Check Server Logs:
```powershell
# IISNode logs (Node.js errors)
Get-Content "C:\inetpub\wwwroot\fyp\server\iisnode\*-stderr-*.txt" -Tail 50

# IIS logs (HTTP errors)
Get-Content "C:\inetpub\logs\LogFiles\W3SVC*\*.log" -Tail 100
```

### Restart Application:
```powershell
Import-Module WebAdministration
Restart-WebAppPool -Name "TBMDeliveryAPI"
```

### Common Issues:

**500 Error - IISNode not working**
- Verify IISNode is installed
- Check `server/web.config` exists
- Ensure Node.js is in system PATH

**404 on React routes**
- Verify URL Rewrite module installed
- Check `client/web.config` exists

**CORS errors**
- Verify `.env` has `CLIENT_URL=https://lab2.tbm2u.net`
- Restart application pool

**Database connection failed**
- Check `DATABASE_URL` in `.env`
- Test connection: `cd server && npx prisma studio`

---

## Environment Configuration

Edit `C:\inetpub\wwwroot\fyp\server\.env`:

```bash
DATABASE_URL=postgres://postgres:tbm2u@lab.tbm2u.net:5432/logistics?schema=public
PORT=4000
CLIENT_URL=https://lab2.tbm2u.net
JWT_SECRET=change-this-to-strong-random-string
NODE_ENV=production

# Email settings
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="chewjh0707@gmail.com"
EMAIL_PASSWORD="eiud rrvp njsf lxxa"
EMAIL_FROM="TBM Delivery <noreply@gmail.com>"
```

⚠️ **IMPORTANT:** Change `JWT_SECRET` to a strong random value!

---

## File Structure on IIS Server

```
C:\inetpub\wwwroot\fyp\
├── client\                    # React app (built)
│   ├── index.html
│   ├── static\
│   ├── manifest.json
│   └── web.config            ← IIS config for client
│
└── server\                    # Express API
    ├── index.js
    ├── routes\
    ├── prisma\
    ├── node_modules\         ← Installed on server
    ├── .env                  ← Renamed from .env.production
    └── web.config            ← IIS config for Node.js
```

---

## IIS Configuration Summary

### Website: `TBMDelivery`
- Physical Path: `C:\inetpub\wwwroot\fyp\client`
- Binding: HTTPS, port 443, host `lab2.tbm2u.net`

### Virtual Application: `/api`
- Physical Path: `C:\inetpub\wwwroot\fyp\server`
- App Pool: `TBMDeliveryAPI` (No Managed Code)

### Result:
- `https://lab2.tbm2u.net/` → React client
- `https://lab2.tbm2u.net/api/*` → Express API

---

## Updating After Initial Deployment

### Update Client:
```bash
# On local machine
cd client
npm run build

# Transfer client/build/* to server
# Replace files in C:\inetpub\wwwroot\fyp\client\
```

### Update Server:
```powershell
# On IIS server
cd C:\inetpub\wwwroot\fyp\server

# Stop app pool
Import-Module WebAdministration
Stop-WebAppPool -Name "TBMDeliveryAPI"

# Transfer updated files

# If dependencies changed
npm install --production

# If database schema changed
npx prisma generate
npx prisma migrate deploy

# Start app pool
Start-WebAppPool -Name "TBMDeliveryAPI"
```

---

## Need More Details?

See **DEPLOYMENT.md** for comprehensive documentation including:
- Detailed troubleshooting
- Security checklist
- Performance optimization
- Maintenance procedures
- Alternative deployment strategies

---

**Questions or Issues?**
- Check logs: `C:\inetpub\wwwroot\fyp\server\iisnode\`
- Review: `DEPLOYMENT.md`
- Verify: `.env` configuration
- Test: Database connection with `npx prisma studio`
