---
name: feedback-cors-deployment
description: Before deploying to TBM server, revert CORS and dev-only settings that were opened up for local/ngrok testing
metadata:
  type: feedback
---

Revert these dev-only changes before deploying to TBM production server (https://lab2.tbm2u.net).

**Why:** They were intentionally loosened for local/ngrok demo testing and must not go to production.

**How to apply:** Check these files before any deployment to TBM.

---

### 1. `server/index.js` — CORS

Current (dev/demo):
```js
app.use(cors({
  origin: true,   // allows ALL origins
  credentials: true,
}));
```

Revert to (production):
```js
app.use(cors({
  origin: process.env.CLIENT_URL || 'https://lab2.tbm2u.net',
  credentials: true,
}));
```

---

### 2. `client/public/index.html` — Eruda mobile debugger

Remove these two lines before deploying:
```html
<script src="https://cdn.jsdelivr.net/npm/eruda"></script>
<script>eruda.init();</script>
```

---

### 3. `client/.env.local` — Local dev overrides

This file should NOT be deployed. It contains:
```
HOST=0.0.0.0
DANGEROUSLY_DISABLE_HOST_CHECK=true
```

Neither of these should exist on the TBM IIS server.

---

### 4. `client/package.json` — Proxy

The `"proxy": "http://localhost:4000"` line is for local dev only.
Remove it before building for production (`npm run build`).