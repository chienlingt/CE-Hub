# Deployment Architecture for lab2.tbm2u.net

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet Users                           │
│                    (Browsers / Mobile Apps)                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTPS (Port 443)
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    lab2.tbm2u.net                                │
│                    (IIS Web Server)                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              SSL Certificate (HTTPS)                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Website: TBMDelivery                                     │  │
│  │  Binding: HTTPS://lab2.tbm2u.net (Port 443)              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────┐       ┌────────────────────────────┐  │
│  │   Static Files      │       │   Virtual Application      │  │
│  │   (React SPA)       │       │   /api (Node.js)           │  │
│  │                     │       │                            │  │
│  │ Physical Path:      │       │ Physical Path:             │  │
│  │ C:\inetpub\         │       │ C:\inetpub\                │  │
│  │ wwwroot\fyp\client\ │       │ wwwroot\fyp\server\        │  │
│  │                     │       │                            │  │
│  │ Contains:           │       │ App Pool:                  │  │
│  │ - index.html        │       │ TBMDeliveryAPI             │  │
│  │ - static/css/       │       │ (No Managed Code)          │  │
│  │ - static/js/        │       │                            │  │
│  │ - manifest.json     │       │ Runtime: Node.js           │  │
│  │ - web.config        │       │ via IISNode                │  │
│  │                     │       │                            │  │
│  │ URL: /              │       │ URL: /api/*                │  │
│  │ GET /               │       │ GET /api/health            │  │
│  │ GET /login          │       │ POST /api/auth/login       │  │
│  │ GET /dashboard      │       │ GET /api/employees         │  │
│  │ (all React routes)  │       │ GET /api/orders            │  │
│  │                     │       │ ... (all API routes)       │  │
│  └─────────────────────┘       └────────────┬───────────────┘  │
│                                              │                  │
│                                              │ Express.js       │
│                                              │ server/index.js  │
└──────────────────────────────────────────────┼──────────────────┘
                                               │
                                               │ Prisma Client
                                               │ (PostgreSQL Driver)
                                               │
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              PostgreSQL Database Server                           │
│              lab.tbm2u.net:5432                                   │
│                                                                   │
│  Database: logistics                                              │
│  Schema: public                                                   │
│                                                                   │
│  Tables: employees, roles, orders, products, teams,               │
│          trucks, zones, buildings, customers, etc.                │
└──────────────────────────────────────────────────────────────────┘
```

---

## Request Flow

### 1. Client Page Request (e.g., https://lab2.tbm2u.net/dashboard)

```
User Browser
    │
    │ HTTPS GET /dashboard
    │
    ▼
IIS Web Server (lab2.tbm2u.net)
    │
    │ URL Rewrite (web.config)
    │ - Checks: Is this a file? NO
    │ - Checks: Is this a directory? NO
    │ - Checks: Is this /api? NO
    │ - Action: Rewrite to /index.html
    │
    ▼
Serves: C:\inetpub\wwwroot\fyp\client\index.html
    │
    │ React app loads
    │ React Router handles /dashboard route
    │
    ▼
User sees Dashboard page
```

### 2. API Request (e.g., https://lab2.tbm2u.net/api/employees)

```
User Browser (React App)
    │
    │ fetch('https://lab2.tbm2u.net/api/employees')
    │
    ▼
IIS Web Server (lab2.tbm2u.net)
    │
    │ URL Rewrite detects /api path
    │ Routes to Virtual Application: /api
    │
    ▼
IISNode Handler
    │
    │ Executes: C:\inetpub\wwwroot\fyp\server\index.js
    │ Spawns/uses Node.js process
    │
    ▼
Express.js Application
    │
    │ Route: GET /api/employees
    │ Handler: routes/employees.js
    │
    ▼
Prisma Client
    │
    │ Query: prisma.employees.findMany()
    │
    ▼
PostgreSQL (lab.tbm2u.net:5432)
    │
    │ Executes SQL query
    │ Returns results
    │
    ▼
Express Response → IIS → Browser
    │
    │ JSON: { success: true, data: [...] }
    │
    ▼
React app updates UI with employee data
```

---

## Component Breakdown

### Frontend (React SPA)
- **Technology:** React 18 + React Router v6
- **Build Tool:** react-scripts (Create React App)
- **Styling:** TailwindCSS
- **Location:** `C:\inetpub\wwwroot\fyp\client\`
- **Entry Point:** `index.html`
- **Environment:** `.env.production` → Sets `REACT_APP_API_BASE_URL`

**Served as static files by IIS**
- All routing handled by React Router on client-side
- IIS web.config rewrites all non-file requests to index.html
- No server-side rendering

### Backend (Express API)
- **Technology:** Express.js (Node.js)
- **Runtime:** Node.js via IISNode
- **Location:** `C:\inetpub\wwwroot\fyp\server\`
- **Entry Point:** `index.js`
- **Environment:** `.env` → Database, CORS, JWT, Email config

**Runs as Node.js process via IISNode**
- IISNode manages Node.js processes
- Multiple processes can run (configured in web.config)
- Automatic restart on file changes (watchedFiles in web.config)
- Process recycling on errors

### Database Layer
- **Technology:** PostgreSQL
- **ORM:** Prisma
- **Host:** `lab.tbm2u.net:5432`
- **Database:** `logistics`
- **Schema Location:** `server/prisma/schema.prisma`

**Connection via Prisma Client**
- Connection pooling managed by Prisma
- Migrations stored in `server/prisma/migrations/`
- Client generated: `npx prisma generate`

---

## Network Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Corporate Network                         │
│                                                              │
│  ┌────────────────────┐         ┌──────────────────────┐   │
│  │  Web Server (IIS)  │         │  Database Server     │   │
│  │  lab2.tbm2u.net    │────────▶│  lab.tbm2u.net       │   │
│  │                    │ Port    │  PostgreSQL :5432    │   │
│  │  - Client (React)  │ 5432    │                      │   │
│  │  - Server (Node)   │         │  Database: logistics │   │
│  └─────────┬──────────┘         └──────────────────────┘   │
│            │                                                 │
│            │ Port 443 (HTTPS)                               │
│            │ SSL Certificate                                │
└────────────┼─────────────────────────────────────────────────┘
             │
             │ Firewall
             │ - Allow inbound: 443 (HTTPS)
             │ - Block others from internet
             │
┌────────────▼─────────────────────────────────────────────────┐
│                         Internet                             │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ User PC  │  │ User PC  │  │ Mobile   │  │  Tablet  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Ports
- **443 (HTTPS):** Public web access (client + API)
- **5432 (PostgreSQL):** Internal database access (server to DB)

### DNS
- **lab2.tbm2u.net:** Points to IIS web server IP
- **lab.tbm2u.net:** Database server (internal)

---

## File Structure Comparison

### Development (Local)
```
fyp/
├── client/
│   ├── src/               ← React source code
│   ├── public/            ← Static assets
│   ├── package.json
│   └── .env               ← API: http://localhost:4000
│
└── server/
    ├── routes/            ← API routes
    ├── prisma/            ← Database schema
    ├── index.js           ← Entry point
    ├── package.json
    └── .env               ← CLIENT_URL: http://localhost:3000
```

### Production (IIS Server)
```
C:\inetpub\wwwroot\fyp/
├── client/                ← Built React app
│   ├── index.html         ← Main HTML file
│   ├── static/            ← Bundled JS/CSS
│   │   ├── css/
│   │   └── js/
│   ├── manifest.json
│   └── web.config         ← IIS config (URL rewrite)
│
└── server/                ← Express API
    ├── routes/            ← API routes
    ├── prisma/            ← Database schema
    ├── node_modules/      ← Dependencies (installed on server)
    ├── index.js           ← Entry point
    ├── package.json
    ├── .env               ← CLIENT_URL: https://lab2.tbm2u.net
    └── web.config         ← IIS config (IISNode)
```

---

## Security Layers

### 1. Transport Security
- ✅ **HTTPS (TLS):** All traffic encrypted
- ✅ **SSL Certificate:** Issued for lab2.tbm2u.net
- ✅ **HTTP → HTTPS Redirect:** (Optional, configure in IIS)

### 2. Application Security
- ✅ **Helmet.js:** Sets security headers
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: SAMEORIGIN
  - X-XSS-Protection: 1; mode=block
- ✅ **CORS:** Restricted to specific origin
- ✅ **bcrypt:** Password hashing (10 rounds)
- ✅ **JWT:** Password reset tokens (1-hour expiration)

### 3. IIS Security
- ✅ **Hidden Segments:** `.env`, `node_modules`, `prisma` folder
- ✅ **Request Filtering:** Blocks dangerous requests
- ✅ **File Permissions:** IIS_IUSRS with minimal access
- ✅ **Application Pool Isolation:** Separate identity

### 4. Database Security
- ✅ **Connection String:** Username/password authentication
- ✅ **Parameterized Queries:** Prisma prevents SQL injection
- ✅ **Network:** Internal network (not exposed to internet)

---

## Scalability Considerations

### Current Setup (Single Server)
- **Client:** Static files served by IIS (highly scalable)
- **API:** Node.js process(es) via IISNode
- **Database:** Single PostgreSQL instance

### Scaling Options

#### Horizontal Scaling (Multiple Servers)
```
         ┌────────────────┐
         │ Load Balancer  │
         │ (Azure LB /    │
         │  Nginx)        │
         └────────┬───────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼────┐      ┌────▼────┐
    │ IIS #1  │      │ IIS #2  │
    │ (Client │      │ (Client │
    │  + API) │      │  + API) │
    └────┬────┘      └────┬────┘
         │                │
         └────────┬───────┘
                  │
         ┌────────▼──────────┐
         │  PostgreSQL DB    │
         │  (Single/Primary) │
         └───────────────────┘
```

#### Vertical Scaling (Larger Server)
- Increase CPU/RAM on IIS server
- Adjust `nodeProcessCountPerApplication` in web.config
- Optimize PostgreSQL configuration

---

## Monitoring Points

### Application Logs
1. **IISNode Logs:** `C:\inetpub\wwwroot\fyp\server\iisnode\`
   - `*-stdout-*.txt` - Console.log output
   - `*-stderr-*.txt` - Error output

2. **IIS Logs:** `C:\inetpub\logs\LogFiles\`
   - HTTP requests
   - Response codes
   - Performance metrics

### Health Check
- **Endpoint:** `GET https://lab2.tbm2u.net/api/health`
- **Returns:** `{"ok": true, "time": "..."}`
- **Tests:** Database connection + API responsiveness

### Key Metrics to Monitor
- Response time (client page load)
- API latency (database queries)
- Error rate (500/404 errors)
- CPU/Memory usage (server resources)
- Database connections (active/idle)

---

## Deployment Pipeline

```
┌──────────────────────┐
│  Developer Machine   │
│  (Local Development) │
│                      │
│  1. Code changes     │
│  2. Test locally     │
│  3. Run deploy.bat   │
└──────────┬───────────┘
           │
           │ Build outputs:
           │ - client/build/
           │ - server/ (prepared)
           │
           ▼
┌──────────────────────┐
│  File Transfer       │
│  (RDP / FTP / Git)   │
│                      │
│  Copy to IIS server  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  IIS Server          │
│  (Production)        │
│                      │
│  1. server-setup.ps1 │
│  2. Configure SSL    │
│  3. Test deployment  │
└──────────────────────┘
```

### Continuous Integration (Future)
- Set up Git repository
- Configure GitHub Actions / Azure Pipelines
- Automated build on commit
- Automated deployment to IIS

---

## Technology Stack Summary

| Layer        | Technology          | Purpose                    |
|--------------|---------------------|----------------------------|
| Frontend     | React 18            | UI framework               |
| Routing      | React Router v6     | Client-side routing        |
| Styling      | TailwindCSS         | CSS framework              |
| Build Tool   | react-scripts (CRA) | Build & bundling           |
| Web Server   | IIS 10+             | Static file serving        |
| Backend      | Express.js          | API framework              |
| Runtime      | Node.js v16+        | JavaScript runtime         |
| Process Mgr  | IISNode             | Node.js on IIS             |
| ORM          | Prisma              | Database ORM               |
| Database     | PostgreSQL          | Relational database        |
| Auth         | Session + bcrypt    | Authentication             |
| Security     | Helmet.js           | Security headers           |
| Email        | Nodemailer          | Password reset emails      |

---

## Related Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
- **[QUICK-DEPLOY.md](QUICK-DEPLOY.md)** - Quick reference
- **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** - Deployment checklist
- **[DEPLOYMENT-SUMMARY.md](DEPLOYMENT-SUMMARY.md)** - Overview of changes
- **[CLAUDE.md](CLAUDE.md)** - Project architecture & guidelines
