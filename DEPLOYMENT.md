# IIS Deployment Guide

Deploy TBM Delivery System to **lab2.tbm2u.net** using Git.

---

## Prerequisites on IIS Server

- ✅ Node.js v16+
- ✅ IISNode module
- ✅ URL Rewrite Module
- ✅ Git
- ✅ SSL Certificate for lab2.tbm2u.net

---

## One-Time Setup

### 1. Clone in wwwroot

```powershell
cd C:\inetpub\wwwroot
git clone <your-git-repo-url> fyp
cd fyp
```

### 2. Create .env

```powershell
Copy-Item "server\.env.production" "server\.env"
notepad server\.env
```

Update:
```bash
CLIENT_URL=https://lab2.tbm2u.net
JWT_SECRET=your-strong-random-secret-change-this
```

### 3. Configure IIS (As Administrator)

```powershell
.\server-setup.ps1
```

This creates:
- Website "TBMDelivery" pointing to `C:\inetpub\wwwroot\fyp\client`
- Virtual Application "/api" pointing to `C:\inetpub\wwwroot\fyp\server`

### 4. Build & Deploy

```powershell
.\deploy-to-iis.ps1
```

### 5. Assign SSL Certificate

- Open IIS Manager
- Select site "TBMDelivery"
- Edit HTTPS binding → Select certificate for lab2.tbm2u.net

---

## Deploy Updates

After every code change:

```powershell
cd C:\inetpub\wwwroot\fyp
git pull
.\deploy-to-iis.ps1
```

---

## File Structure

```
C:\inetpub\wwwroot\fyp\              ← Git repository
├── client\
│   ├── src\                         ← React source
│   ├── build\                       ← Built (created by script)
│   └── web.config                   ← IIS config
├── server\
│   ├── routes\
│   ├── index.js
│   ├── .env                         ← Create manually (not in git)
│   └── web.config                   ← IIS config
└── deploy-to-iis.ps1                ← Deployment script
```

**IIS Serves:**
- `https://lab2.tbm2u.net/` → `client/build/` (static files)
- `https://lab2.tbm2u.net/api/*` → `server/` (Node.js via IISNode)

---

## Troubleshooting

### Check Logs
```powershell
# Node.js errors
Get-Content "server\iisnode\*-stderr-*.txt" -Tail 50

# Restart app
Restart-WebAppPool -Name "TBMDeliveryAPI"
```

### Common Issues

| Error | Solution |
|-------|----------|
| 500 | Check `server\iisnode\` logs, verify `.env` exists |
| 404 on routes | Verify URL Rewrite installed |
| CORS | Check `CLIENT_URL` in `.env`, restart app pool |

---

## Test Deployment

- **API:** https://lab2.tbm2u.net/api/health
- **App:** https://lab2.tbm2u.net

---

## Important

- **Don't commit** `server/.env` to git (contains secrets)
- **Run** `deploy-to-iis.ps1` after every `git pull`
- **Change** `JWT_SECRET` in `.env` to a strong random string
