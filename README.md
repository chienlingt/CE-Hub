# TBM Delivery Management System

Delivery management system with role-based access control.

## Deployment to IIS (lab2.tbm2u.net)

### One-Time Setup
```powershell
cd C:\inetpub\wwwroot
git clone <your-repo-url> fyp
cd fyp
Copy-Item "server\.env.production" "server\.env"
notepad server\.env              # Edit settings
.\server-setup.ps1               # Run as Administrator
.\deploy-to-iis.ps1
```

Then assign SSL certificate in IIS Manager.

### Update Code
```powershell
cd C:\inetpub\wwwroot\fyp
git pull
.\deploy-to-iis.ps1
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for full guide.

## Local Development

### Client
```bash
cd client
npm install
npm start          # http://localhost:3000
```

### Server
```bash
cd server
npm install
npm run dev        # http://localhost:4000
```

## Tech Stack

- Frontend: React 18 + TailwindCSS
- Backend: Express.js + Prisma ORM
- Database: PostgreSQL
- Deployment: IIS + IISNode
