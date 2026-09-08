# CE-Hub Codebase Audit — TBM Delivery Management System

**Date:** 2026-08-30
**Scope:** `client/` (React 18 CRA), `server/` (Express 5 + Prisma + PostgreSQL), and root-level legacy files.
**Method:** Three parallel read-only source sweeps (security, DRY/dead-code, architecture), each finding verified against source with exact `file:line` references. Findings that surfaced in more than one sweep are reported once.

---

## 1. Executive Summary

### Health verdict: 🔴 **Critical**

The system's dominant, everything-else-follows-from-it fact is that **there is no server-side authentication or authorization of any kind.** All 26 API route modules are mounted with zero guards ([server/index.js:104-129](server/index.js#L104)); permission checks exist only in the React client ([AuthContext.js](client/src/contexts/AuthContext.js), [Layout.js](client/src/components/Layout.js)). Anyone who can reach the host can read and modify every record in the database — orders, customers, employees (including password hashes), roles, and system settings — by calling the API directly. This is not a hardening gap; it is the absence of the primary security control, and it makes almost every other endpoint-level issue exploitable without a foothold.

### Area scorecard

| Area | Grade | One-line assessment |
|---|---|---|
| **Security** | 🔴 F | No auth/authz anywhere; password hash leaked on login; mass assignment and IDOR pervasive. |
| **Architecture** | 🟠 D | Routes carry heavy domain logic; god functions/components; status/role values un-enumerated; config drift. |
| **DRY / Dead code** | 🟡 C | ~2,300 removable lines; dead legacy root tree still committed; heavy copy-paste, but the service layer where it exists is clean. |

### Top 3 critical risks

1. **No auth + client-only authorization → total data exposure and privilege escalation.** Every `/api/*` route (except three secret-checked webhooks) is open. Because authorization is decided client-side from `GET /api/roles`, the unguarded `PUT /api/roles/:id` ([roles.js:26](server/routes/roles.js#L26)) lets an attacker rewrite any role's `permissions` array, and every client instantly grants those rights. `POST /api/employees` ([employees.js:55](server/routes/employees.js#L55)) lets anyone mint an active admin-role employee.
2. **Login returns the bcrypt password hash, and the client persists it.** `POST /api/auth/login` returns the entire employee row including `password` ([auth.js:51](server/routes/auth.js#L51)); the client writes it to `sessionStorage` ([AuthContext.js:148](client/src/contexts/AuthContext.js#L148)). `POST /api/auth/verify-session` leaks it identically ([auth.js:232](server/routes/auth.js#L232)).
3. **Unauthenticated mass assignment + upload path traversal.** ~15 routes pipe `req.body` straight into Prisma `create`/`update`, and the upload middleware builds a directory path from an unsanitized route param ([middleware/upload.js:20](server/middleware/upload.js#L20)), allowing writes outside `server/uploads/`.

### If you do only one thing

**Add a server-side authentication middleware and apply it across `server/index.js`, then stop trusting client-supplied identity** (`req.query.employee_id`, `req.body.employee_id`). Everything in the roadmap's Phase 1 depends on this, and it converts dozens of "anyone can" findings into "an authenticated actor can," which is a categorically different risk.

### Good news (so triage stays honest)

Not everything is broken, and these facts should shape prioritization:

- **No SQL injection.** Prisma is used throughout; the only raw query is a constant `SELECT 1` health check ([index.js:134](server/index.js#L134)). No `$queryRaw`/`$executeRaw` with interpolation anywhere.
- **`server/.env` is not committed** ([.gitignore:19,24](.gitignore#L19)); `git ls-files` confirms it was never tracked.
- **No hardcoded live secrets** in tracked source, seed scripts, `deploy-to-iis.ps1`, or `client/.env.production` (a regex sweep found only a public base URL and a commented-out key placeholder).
- **Webhooks fail closed.** `verifySecret` is applied to all three webhook endpoints and rejects when the secret env var is unset ([webhooks.js:8-14](server/routes/webhooks.js#L8)).
- **Upload *read*-path traversal defense is sound** — `resolveUploadFile` decodes per-segment then does a `path.resolve` + `root + path.sep` prefix check, correctly rejecting the sibling-prefix bypass ([index.js:76-84](server/index.js#L76)). The write path is the problem, not the read path.
- **The service layer, where it exists, is clean.** The Odoo service trio (`odooService` / `odooOrderIngestService` / `odooSyncService`) is properly layered with no meaningful duplication, and `odooPayloadBuilder.js` is a well-reused shared factory.

---

## 2. Detailed Findings

Findings are grouped by severity, then by area. IDs (`SEC-*`, `ARC-*`, `DRY-*`) are referenced by the roadmap in §3.

---

## 2.1 HIGH severity

### SEC-H-1 — No authentication middleware exists anywhere on the server
**Where:** [server/index.js:104-129](server/index.js#L104) (all routers mounted unguarded); the only `jwt.verify` in the codebase is inside password reset ([auth.js:152](server/routes/auth.js#L152)), not a guard.
**Why:** Every `/api/*` endpoint except the three secret-checked webhooks is reachable, unauthenticated, by anyone who can reach the host. There is no `req.user`, no session, no guard. This is the root cause behind most other SEC findings.
**Fix:** Introduce an `authenticate` middleware that validates a real session credential (see SEC-H-2) and populates `req.user`; apply it globally in `server/index.js` before the route mounts, with an explicit public allowlist (`/api/auth/login`, reset endpoints, `/api/health`, webhooks). Add an `authorize(permission)` middleware for role/permission gating.

### SEC-H-2 — Login issues no session credential at all
**Where:** [auth.js:49-53](server/routes/auth.js#L49) returns `{ success, employee, message }` — no token, no cookie.
**Why:** Even if a guard were added, there is nothing for it to verify. The client "stays logged in" purely by holding the employee object in `sessionStorage`.
**Fix:** On successful login, issue a signed, expiring session token (JWT or a server-side session id) and return it (httpOnly cookie preferred). The `authenticate` middleware validates it.

### SEC-H-3 / SEC-H-27 — Login response includes the bcrypt password hash; client stores it
**Where:** [auth.js:51](server/routes/auth.js#L51) returns the raw Prisma row (includes `password`); same at [auth.js:232](server/routes/auth.js#L232) (`verify-session`). Client persists it: [AuthContext.js:148](client/src/contexts/AuthContext.js#L148).
**Why:** The password hash should never leave the server. It is exposed in the HTTP response and then sits in browser storage, readable by any XSS or local access. Note the employees routes already strip it correctly ([employees.js:22-25,46,78,110](server/routes/employees.js#L22)) — auth just doesn't.
**Fix:** Strip `password` (and any other sensitive columns) from every response. Use a Prisma `select` allowlist or a shared `toPublicEmployee()` serializer.

### SEC-H-4 — `POST /api/auth/verify-session` is an unauthenticated account-lookup oracle
**Where:** [auth.js:207-238](server/routes/auth.js#L207).
**Why:** It takes only `{ employeeId }` and returns the full employee record (hash, role, permissions). Any UUID — obtainable from the unauthenticated `GET /api/employees` ([employees.js:8](server/routes/employees.js#L8)) — yields a full "session".
**Fix:** Replace with a real token-validation endpoint that authenticates the caller and returns only the caller's own sanitized record.

### SEC-H-6 — Unauthenticated role/permission mutation → privilege escalation
**Where:** [roles.js:26-37](server/routes/roles.js#L26) (`PUT /:id`, `data: req.body`), plus `POST` ([roles.js:16](server/routes/roles.js#L16)) and `DELETE` ([roles.js:39](server/routes/roles.js#L39)).
**Why:** Since the client grants abilities based on `GET /api/roles` ([AuthContext.js:29-62](client/src/contexts/AuthContext.js#L29)), an attacker rewrites any role's `permissions` array and every client instantly honors it. This is a one-request privilege escalation.
**Fix:** Guard with `authenticate` + `authorize('manage_roles')`; validate the body against an allowlisted schema (see SEC-H-20).

### SEC-H-7 — Unauthenticated employee creation with arbitrary role
**Where:** [employees.js:55-79](server/routes/employees.js#L55): `role_id = req.body.role` then create.
**Why:** Anyone can create an active employee with the admin role and log in as it.
**Fix:** Guard the route; restrict assignable roles to the caller's authority.

### SEC-H-19 / SEC-H-20 — No validation library; `req.body` passed straight into Prisma (mass assignment)
**Where:** No `joi`/`zod`/`yup`/`express-validator` in [server/package.json](server/package.json). Verified mass-assignment sinks: [roles.js:18,30](server/routes/roles.js#L18) (worst — `permissions` settable), [time-slots.js:231](server/routes/time-slots.js#L231), [zones.js:26,38](server/routes/zones.js#L26), [trucks.js:46,59](server/routes/trucks.js#L46), [customers.js:19,39](server/routes/customers.js#L19), [reports.js:35,47](server/routes/reports.js#L35), [installers.js:43,57](server/routes/installers.js#L43), [order-products.js:27,44](server/routes/order-products.js#L27).
**Why:** Attackers set columns the UI never exposes (status fields, ownership, flags). Combined with no auth, this is arbitrary record shaping.
**Fix:** Add a schema-validation layer (zod recommended) and construct Prisma payloads from explicit allowlisted fields, never a raw spread.

### SEC-H-31 — CORS trusts any RFC1918 / localhost / `*.ngrok` origin, with credentials
**Where:** [server/index.js:18-29](server/index.js#L18). The regex matches `192.168.*`, `10.*`, `172.16-31.*`, and any `*.ngrok-free.app`/`*.ngrok.io`; `!origin` is also allowed ([index.js:22](server/index.js#L22)).
**Why:** With `credentials: true`, any attacker-controlled ngrok tunnel becomes a trusted origin able to make credentialed cross-origin calls. In production this is a broad hole.
**Fix:** Allowlist exact production/staging origins from config; drop the RFC1918/ngrok regex outside development; gate dev origins behind `NODE_ENV`.

### SEC-H-42 — `jsonwebtoken` is used but not declared in `server/package.json`
**Where:** required at [auth.js:5](server/routes/auth.js#L5); `grep -c jsonwebtoken server/package.json` → 0. It resolves today only as a hoisted transitive dep of `firebase-admin`/`twilio`.
**Why:** A dependency bump or stricter installer silently breaks the entire password-reset flow at runtime, and a security-critical library's version is not under direct control.
**Fix:** Add `jsonwebtoken` to `server/package.json` dependencies with a pinned major.

### SEC-H — IDOR across every `:id` endpoint (no ownership check anywhere)
**Where (representative):** orders — [orders.js:1275](server/routes/orders.js#L1275) (`GET /:id`), `:768` (`PUT`), `:908` (`PATCH /:id/status`), `:1261` (`DELETE`), `:1452` (`/:id/deliver`); driver — [driver.js:29](server/routes/driver.js#L29) (`GET /jobs?employee_id=`, identity is a query param), `:165` (overwrite any delivered order's POD/signature), `:295` (attacker-chosen `employee_id` attribution); employees — [employees.js:35,87,122](server/routes/employees.js#L35); notifications — [notifications.js:9,27,135](server/routes/notifications.js#L9) (`user_id` is a query param); settings — [settings.js:52](server/routes/settings.js#L52) (comment says "admin only", no check); buildings — [buildings.js:109](server/routes/buildings.js#L109) (`POST /reassign-and-delete`, bulk mutation).
**Why:** Every object is addressable by anyone who knows/guesses its id; no endpoint checks that the caller owns or may act on the resource.
**Fix:** After adding auth (SEC-H-1), scope each query by the authenticated actor and enforce ownership/role on every `:id` handler. Driver identity must come from `req.user`, never `req.query.employee_id`.

### ARC-H-1 — ~260 lines of domain logic living inside a route file
**Where:** [orders.js:16-274](server/routes/orders.js#L16) — truck volume/capacity math (`getTruckVolumeCm3`, `pickTruckForVolume`), DB-touching assignment logic (`getTeamAssignmentCounts`, `ensureTimeslotAssignments`, `clearTimeslotIfEmpty`), service-time and travel estimation — all before the first handler.
**Why:** This duplicates concerns owned by [services/scheduler.js](server/services/scheduler.js) (see DRY-H-1e), can't be unit-tested independently, and makes the 1,941-line `orders.js` the single hardest file to reason about. `orders.js` also makes raw Odoo RPC calls inline ([orders.js:1651-1676](server/routes/orders.js#L1651)), bypassing the entire `odooService` wrapper.
**Fix:** Extract into `services/orderCapacityService.js` / reuse `scheduler.js`; route handlers should orchestrate, not compute.

---

## 2.2 MEDIUM severity

### SEC-M-8 — Hardcoded JWT fallback secret for reset tokens
**Where:** [auth.js:96,148](server/routes/auth.js#L96): `process.env.JWT_SECRET || 'your-secret-key-change-in-production'`.
**Why:** If `JWT_SECRET` is ever unset (deploy checks only that `.env` exists, not that keys are populated — [deploy-to-iis.ps1:24-30](deploy-to-iis.ps1#L24)), anyone can forge a `{employeeId, type:'password-reset'}` token and take over any account.
**Fix:** Remove the fallback; fail fast at boot if `JWT_SECRET` is missing.

### SEC-M-9 — Reset tokens are stateless, reusable, and non-revocable
**Where:** signed at [auth.js:97-105](server/routes/auth.js#L97), verified at [auth.js:135-190](server/routes/auth.js#L135); no `used_at`/jti, and password change ([auth.js:274](server/routes/auth.js#L274)) doesn't invalidate outstanding tokens.
**Why:** A reset link works repeatedly for its full 1-hour lifetime; a leaked link (see SEC-M-10) is replayable.
**Fix:** Persist a single-use token id, mark it consumed on use, and invalidate outstanding reset tokens on password change.

### SEC-M-10 — Reset token written to plaintext server logs
**Where:** [auth.js:118-119](server/routes/auth.js#L118) prints the full `.../reset-password?token=<JWT>` to stdout when email delivery fails; under IIS this persists to disk ([web.config:41-42](server/web.config#L41)).
**Why:** Anyone with log access gets a working account-takeover link. Made worse by SEC-M-11, which makes email delivery fail routinely.
**Fix:** Never log tokens; log a correlation id instead.

### SEC-M-11 — Reset email URL built from the wrong (client-side) env var
**Where:** [emailService.js:70](server/services/emailService.js#L70): `process.env.REACT_APP_API_BASE_URL || ''` — a CRA variable absent from `server/.env`. The correct line is commented out just above ([emailService.js:69](server/services/emailService.js#L69)).
**Why:** Emailed links become relative (`/reset-password?token=...`), so the primary reset channel silently fails and every reset falls through to the log-the-token path (SEC-M-10).
**Fix:** Use `CLIENT_URL` from server config; delete the dead line.

### SEC-M-12 / SEC-M-30 — Credentials and PII logged to console/disk
**Where:** [auth.js:11-14](server/routes/auth.js#L11) logs the full login body incl. cleartext password (marked "TEMP DEBUG"); [employees.js:58](server/routes/employees.js#L58) logs the create body (cleartext password); [notifications.js:125](server/routes/notifications.js#L125) logs customer phone; reset events by email at [auth.js:192](server/routes/auth.js#L192). All persist to `iisnode/` logs.
**Why:** Cleartext credentials and PII in log files are a direct disclosure and a compliance problem.
**Fix:** Remove these logs; adopt a logger with field redaction.

### SEC-M-13 / SEC-M-14 — Weak password policy; no rate limiting
**Where:** 6-char minimum, no complexity ([auth.js:142-144,249-251](server/routes/auth.js#L142)); employee creation enforces no minimum ([employees.js:67](server/routes/employees.js#L67)). No `express-rate-limit` anywhere — `/login`, `/change-password`, `/reset-request` are unthrottled.
**Why:** Enables brute force and weak-credential accounts; `POST /api/auth/change-password` ([auth.js:242](server/routes/auth.js#L242)) is an unauthenticated online password-verification oracle keyed by `employeeId`.
**Fix:** Enforce a stronger policy; add rate limiting/lockout on auth endpoints.

### SEC-M-21 — Partial mass assignment in employees
**Where:** [employees.js:57,89](server/routes/employees.js#L57) strip only `role` and `password`, then spread the rest.
**Why:** `active_flag`, `email`, and other scalar columns are attacker-settable — e.g. reactivate a deactivated account, or hijack an email to redirect password resets.
**Fix:** Build the payload from an explicit field allowlist.

### SEC-M-28 — Internal error details returned to clients (~93 handlers)
**Where:** `res.status(500).json({ error, details: err.message })` across the route layer, e.g. [orders.js](server/routes/orders.js) (22 sites), [time-slots.js:90,213,224](server/routes/time-slots.js#L90), [truck-zones.js:18,40](server/routes/truck-zones.js#L18), [employees.js:82,117](server/routes/employees.js#L82). Also `/api/health` leaks DB errors unauthenticated ([index.js:137](server/index.js#L137)).
**Why:** Prisma messages expose table/column names and constraint identifiers, directly contradicting the stated intent of the sanitizing global handler at [index.js:142-152](server/index.js#L142) — which is unreachable because every handler responds itself.
**Fix:** Route errors through `next(err)` to the central handler (see DRY-M-1c); return generic messages, log details server-side.

### SEC-M-29 — Customer PII returned without any authorization
**Where:** [driver.js:111-114](server/routes/driver.js#L111) (name + phone), [complaints.js:11-16](server/routes/complaints.js#L11) and [order-issues.js:54-59](server/routes/order-issues.js#L54) (name + email), [notifications.js:61](server/routes/notifications.js#L61).
**Why:** Customer contact data is exposed to any unauthenticated caller.
**Fix:** Gate behind auth + role; return only fields the caller needs.

### SEC-M-32 / SEC-M-35 — CSP disabled + SVG stored-XSS via prefix-only MIME check
**Where:** [index.js:15](server/index.js#L15) `helmet({ contentSecurityPolicy: false })`; upload accepts anything `image/*` including `image/svg+xml` ([upload.js:38](server/middleware/upload.js#L38)); the read-side sniffer doesn't recognize SVG and falls through to extension-based `Content-Type: image/svg+xml` ([index.js:53-58](server/index.js#L53)).
**Why:** An uploaded SVG executes JavaScript on the API origin, with CSP off and no `X-Content-Type-Options` on that path. (Note: the sniffer's PNG branch is also broken — it compares an ASCII-decoded slice against a `\x89`-containing string, so it never matches; PNGs fall through too.)
**Fix:** Reject SVG (and enforce magic-byte checks, SEC-L-36); re-enable a restrictive CSP; add `X-Content-Type-Options: nosniff` on `/uploads`.

### SEC-M-33 — `/uploads` is fully public
**Where:** [index.js:86-101](server/index.js#L86) serves every POD photo, signature, and delivery-failure image with no auth.
**Why:** Any leaked or logged path is permanently public; POD signatures and evidence are sensitive.
**Fix:** Serve uploads through an authenticated, authorization-checked handler.

### SEC-M-34 — Path traversal on the upload *write* path
**Where:** [upload.js:20-23](server/middleware/upload.js#L20): `req.params.orderId || req.params.id` flows unsanitized into `path.join` + `fs.mkdirSync(..., {recursive:true})`; echoed into the stored URL at [upload.js:15](server/middleware/upload.js#L15). Express decodes `%2F` in params, so e.g. `PATCH /api/orders/..%2F..%2Fx/issue` ([orders.js:1691](server/routes/orders.js#L1691)) writes outside `server/uploads/`.
**Why:** Arbitrary directory creation and file placement outside the intended tree.
**Fix:** Validate the id is a UUID before using it in a path; never build filesystem paths from raw route params.

### SEC-M-37 — Webhooks use a replayable shared secret, not an HMAC signature
**Where:** [webhooks.js:9](server/routes/webhooks.js#L9) reads a static `x-odoo-secret` header; no payload signature, timestamp, or nonce.
**Why:** Fully replayable, and the secret is transmitted verbatim on every call. (The verification does fail closed on a missing secret — that part is fine.)
**Fix:** Move to an HMAC signature over the body + timestamp with a replay window; constant-time compare (see SEC-L-38).

### ARC-M-1 — `CLIENT_URL` has two conflicting defaults; `D1_REMINDER_CRON` has three
**Where:** `CLIENT_URL` defaults to the prod host at [index.js:17](server/index.js#L17) but to `localhost:3000` at [auth.js:117](server/routes/auth.js#L117). `D1_REMINDER_CRON`: the [index.js:220](server/index.js#L220) comment says 07:00, [d1ReminderCron.js:5](server/d1ReminderCron.js#L5) says 09:00, and the actual default is `'0 19 * * *'` (19:00) at [index.js:224](server/index.js#L224).
**Why:** A deploy without `CLIENT_URL` set emails users localhost reset links while CORS trusts the prod origin — a silent, environment-dependent failure. The cron confusion means nobody knows when the reminder actually fires.
**Fix:** Centralize config in one `server/config/index.js` module with a single default per variable; reconcile the cron default and comments; ship a real `.env.example` (see ARC-M-3).

### ARC-M-2 — Layering violations and god functions
**Where:** 269 direct `prisma.` calls inside `server/routes/`; several route files import zero services ([teams.js](server/routes/teams.js), [employees.js](server/routes/employees.js)). Largest handlers: `PATCH /:id` reassign at [orders.js:978](server/routes/orders.js#L978) (**283 lines**), create order at [orders.js:613](server/routes/orders.js#L613) (155), 108-line team-versioning handler at [teams.js:58-165](server/routes/teams.js#L58). Mid-file `require()` calls hide the module graph ([orders.js:278,1562,1653](server/routes/orders.js#L278)).
**Why:** Business logic in the transport layer is untestable, un-reusable, and error-prone; there's no rule for when a service exists.
**Fix:** Extract domain logic into services; cap handler size; move all `require`s to file top.

### ARC-M-4 — Status and role values are un-enumerated and inconsistently cased
**Where:** The same state is spelled two ways — `'Delivered'` (9 sites) vs `'delivered'` (6), `'Pending'` vs `'pending'`, `'Scheduled'` vs `'scheduled'` — mixed with `SCREAMING_CASE` and `snake_case` sentinels. Roles are hardcoded strings on both sides ([Layout.js:189-194](client/src/components/Layout.js#L189)). Role extraction is duplicated 4× with subtly different logic — [Layout.js:491](client/src/components/Layout.js#L491) uses `.includes()` (substring) while [AuthContext.js:88](client/src/contexts/AuthContext.js#L88) uses `===` (exact), so the same role can resolve differently depending on which check runs.
**Why:** Casing splits cause silent filter/comparison bugs; the `includes` vs `===` divergence is a live authorization inconsistency.
**Fix:** A shared `status`/`role` enum module consumed by both client and server; one canonical role-extraction helper.

### ARC-M-6 — Silent-swallow catches and fire-and-forget side effects
**Where:** `.catch(() => {})`/`.catch(() => null)` at [driver.js:373](server/routes/driver.js#L373), [time-slots.js:146,254](server/routes/time-slots.js#L146), [odooService.js:186,247,294](server/services/odooService.js#L186). Deliberately-ignored Odoo write-back returns `{ success: true }` while the systems diverge ([orders.js:1674](server/routes/orders.js#L1674)). Customer-notification failures only log while the HTTP response says success ([deliveryFailureService.js:206](server/services/deliveryFailureService.js#L206), [deliveryCompletionService.js:66](server/services/deliveryCompletionService.js#L66)). Cron callbacks are invoked with no `.catch` ([index.js:206-234](server/index.js#L206)); no `unhandledRejection` handler exists.
**Why:** Failures become invisible; data silently diverges from Odoo; a stray rejection can crash the process.
**Fix:** Log-and-surface instead of swallow; add a process-level `unhandledRejection` handler; make integration failures observable (they already flow through the outbox — use it).

---

## 2.3 LOW severity

### Security (low)
- **SEC-L-15 — bcrypt cost 10 with `bcryptjs` (pure JS).** [auth.js:180,271](server/routes/auth.js#L180), [employees.js:68,99](server/routes/employees.js#L68). Below current guidance (12+); `bcryptjs` makes raising it costly. Consider native `bcrypt` and cost ≥12.
- **SEC-L-16 — Unauthenticated outbound WhatsApp trigger.** [notifications.js:91](server/routes/notifications.js#L91) sends a real message bypassing the enabled toggle — loopable for billing abuse/harassment. Gate + throttle.
- **SEC-L-17 — Unauthenticated LLM invocation.** [orders.js:1550](server/routes/orders.js#L1550) calls Groq/Gemini per request — API-spend amplification. Gate + throttle.
- **SEC-L-18 — Integration outbox exposed.** [integrationOutbox.js:6](server/routes/integrationOutbox.js#L6) returns raw payloads + failure details to anyone.
- **SEC-L-24 — Unbounded pagination.** [notifications.js:17,54](server/routes/notifications.js#L17), [integrationOutbox.js:11-12](server/routes/integrationOutbox.js#L11) — `?limit=999999` is a trivial DoS/bulk-exfil lever. Cap it.
- **SEC-L-25 — Prompt injection into the LLM parser.** [llmParserService.js:15-22](server/services/llmParserService.js#L15) interpolates attacker-influenced `delivery_remarks` into the prompt; output is written back to the order. Delimit/escape and validate parsed output.
- **SEC-L-36 — No magic-byte enforcement on uploads.** Sniffing at [index.js:35-51](server/index.js#L35) only *sets* a type, never *rejects*. Enforce it.
- **SEC-L-38/39/40 — Webhook hardening.** Non-constant-time compare ([webhooks.js:10](server/routes/webhooks.js#L10)); secret captured at module load so rotation needs a restart ([webhooks.js:6](server/routes/webhooks.js#L6)); unbounded serial batch loop ([webhooks.js:110-118](server/routes/webhooks.js#L110)).
- **SEC-L-26 — Hardcoded demo credentials in committed seeds.** `Driver@123`/`Admin@123` ([seedDriverTestData.js:19-21](server/seedDriverTestData.js#L19)), `Sales@123` ([seedDemoViva.js:126](server/seedDemoViva.js#L126)), echoed to console. If run against the deployed DB, these are working admin logins into a system with no server-side authz.
- **SEC-L-45/46 — Stale/unused deps as attack surface.** `@google/generative-ai` is the deprecated pre-1.0 SDK; `twilio` and `firebase-admin` are declared but unused (WhatsApp goes through Green API). `helmet ^7` (v8 current) and `nodemon ^2` (v3 current) are behind. Remove unused, update the rest.

### Architecture (low)
- **ARC-L-3 — No `.env.example`, but the deploy script tells you to copy one.** [deploy-to-iis.ps1:26](deploy-to-iis.ps1#L26) references a non-existent `.env.example`. Several read-but-undocumented vars silently disable features (`ODOO_USE_WEBHOOK`, `GOOGLE_MAPS_SERVER_KEY`, `D1_REMINDER_CRON`). Ship a complete `.env.example`.
- **ARC-L-5 — Hardcoded infrastructure values.** Timezone `'Asia/Kuala_Lumpur'` hardcoded 9× despite a canonical `APP_TIMEZONE` constant existing at [utils/dateKey.js:5](server/utils/dateKey.js#L5); ports (`:4000`) and third-party base URLs as literals; three separate WhatsApp deep-link builders. Consolidate to config/constants.
- **ARC-L-7 — Client API base URL inconsistency.** [Schedule.js:648](client/src/components/admin/schedule/Schedule.js#L648) calls `fetch('/api/scheduler/run')` **relative** while the same file uses the configured base elsewhere — works via the dev proxy, breaks in the IIS build. `client/.env.production` leaves `REACT_APP_GOOGLE_MAPS_BROWSER_KEY` as a `# TODO`, so maps get `undefined` in prod.
- **ARC-L-8 — Cron registration split across two mechanisms.** Four jobs are inline anonymous blocks in the `app.listen` callback (each re-`require`ing `node-cron`), a fifth is encapsulated and DB-configurable in [schedulerCron.js:37](server/schedulerCron.js#L37). Unify.
- **ARC-L-9 — Response shapes unstandardized.** `{ error }` (271×), `{ success: true }` (26×), `{ message }` (19×), bare objects/arrays — even within one file ([teams.js:70](server/routes/teams.js#L70)). Standardize an envelope.

### DRY / Dead code (low)
- **DRY-L-0 — Dead legacy root tree, still committed.** [api.js](api.js) (591 lines, a parallel unauthenticated copy of the employee CRUD), [prismaClient.js](prismaClient.js), the vendored [generated/prisma/](generated/prisma/) client (not gitignored), and the root `package.json`/`package-lock.json` (a third, mostly-unused dependency tree) are referenced by nothing. Delete all of it (~600+ lines plus the vendored client).
- **DRY-L-1a — Product `select` shape repeated 6× verbatim** in [orders.js](server/routes/orders.js) (`:564,712,841,874,1022,1210`). Extract one `ORDER_PRODUCT_SELECT` constant (~75 lines saved, drift eliminated across 6 endpoints).
- **DRY-L-1b — Generic CRUD list handler copy-pasted across 6 route files** ([buildings.js:6](server/routes/buildings.js#L6), [employees.js:8](server/routes/employees.js#L8), [products.js:23](server/routes/products.js#L23), [teams.js:6](server/routes/teams.js#L6), [trucks.js:7](server/routes/trucks.js#L7), [zones.js:6](server/routes/zones.js#L6)). A `makeCrudRouter(model, name)` factory collapses several near-identical files.
- **DRY-L-1c — ~150 identical catch/500 tails + 78 hand-written 404s + inline `P2025`→404 translation.** These bypass the global handler at [index.js:142](server/index.js#L142). An `asyncHandler(fn)` wrapper + central error/404/Prisma middleware is the single biggest backend cleanup (~450 lines) and also fixes SEC-M-28.
- **DRY-L-1e — Duplicated domain logic route↔service.** `pickLeastUsedTruck()` defined twice ([orders.js:115](server/routes/orders.js#L115), [scheduler.js:568](server/services/scheduler.js#L568)) — a real truck-assignment divergence hazard; installation-estimate resolution cloned at [orders.js:208-213](server/routes/orders.js#L208) ≡ [scheduler.js:426-431](server/services/scheduler.js#L426). Import from the service.
- **DRY-L-1f — `Loaded`/`Arrived` outbox enqueue is a twin block** ([order-products.js:155-171](server/routes/order-products.js#L155) vs `:174-190`), and the `.then()` enqueue pattern is copy-pasted 5× across routes/services. Parameterize into one helper. (Note: the RPC-vs-webhook branch itself is correctly a single code path — not duplicated.)
- **DRY-L-2a — Client date/status formatters reimplemented ~15×** despite canonical helpers at [orderHelpers.js:104,123](client/src/utils/orderHelpers.js#L104). They already disagree (`day:'numeric'` vs `'2-digit'`, `''` vs `'N/A'`) — a live inconsistency. Consolidate (~120 lines).
- **DRY-L-2b — Three near-clone "issue list" admin pages** ([Cases.js](client/src/components/admin/Cases.js), [ComplaintManagement.js](client/src/components/admin/ComplaintManagement.js), [OrderIssues.js](client/src/components/admin/OrderIssues.js), ~55% shared) — and they even disagree on the data layer (one uses `informationService`, one uses raw fetch). Extract shared `StatusBadge`/`StatTileRow`/`FilterPills`.
- **DRY-L-2c/2d — Duplicated driver modal shell (3×) and schedule screens** ([DelSchedule.js](client/src/components/delivery/DelSchedule.js) ≡ [InsSchedule.js](client/src/components/installer/InsSchedule.js) ≡ [truckSchedule.js](client/src/components/warehouse/truckSchedule.js), 2,417 lines, largely the same screen). Extract a shared `ModalShell` and a common schedule component.
- **DRY-L-2f — Three identical polling hooks** ([useActiveTrips.js](client/src/hooks/useActiveTrips.js), [useDriverJobs.js](client/src/hooks/useDriverJobs.js), [useTripStatus.js](client/src/hooks/useTripStatus.js)). Collapse into one `usePolledFetch(url, interval)`.
- **DRY-L-3 — Dead files & exports.** [InfoTable.js](client/src/components/common/InfoTable.js) (80/86 lines commented out), [ParseRemarksModal.js](client/src/components/admin/ParseRemarksModal.js) (174), [ZoneInfo.js](client/src/components/admin/info/ZoneInfo.js) (56), [SlotDepartBanner.js](client/src/components/driver/SlotDepartBanner.js) (135, superseded), three unreferenced server scripts (`seedRouteTestData.js`, `getPickingDemoIds.js`, `patchPickingDemo.js`), 26 of 83 `informationService` exports unused, and `TruckZoneInfo.js` (490 lines) imported but commented out of the router ([Layout.js:125](client/src/components/Layout.js#L125)). `recharts`/`firebase` client deps unused. ~740 lines.

---

## 3. Refactoring Roadmap

Ordered so each phase is independently shippable and, where it touches live behavior, sequenced to keep the client working. Phase 0 and 1 are the ones that actually reduce risk; everything after is hygiene.

### Phase 0 — Contain (days, low-risk, no behavior change for legitimate flows)
1. **Add `jsonwebtoken` to `server/package.json`** (SEC-H-42) — a latent runtime break; fix first.
2. **Strip the password hash from all auth responses** (SEC-H-3) — one serializer, immediate.
3. **Remove credential/token/PII logging** (SEC-M-10, SEC-M-12, SEC-M-30).
4. **Tighten CORS** to explicit origins; move dev origins behind `NODE_ENV` (SEC-H-31).
5. **Delete the dead legacy root tree** — `api.js`, `prismaClient.js`, `generated/`, root `package.json`/lockfile (DRY-L-0). Removes a parallel unauthenticated copy of the employee API.
6. **Remove the JWT fallback secret; fail fast if `JWT_SECRET` is missing** (SEC-M-8).
7. **Fix the reset-email URL** to use `CLIENT_URL` (SEC-M-11) so the reset channel stops silently failing.

### Phase 1 — Auth foundation (the core fix)
1. Issue a real session token on login **alongside** the existing response shape (non-breaking).
2. Add `authenticate` (populates `req.user`) and `authorize(permission)` middleware; apply globally in `server/index.js` with an explicit public allowlist (SEC-H-1, SEC-H-2).
3. Migrate the client to send the token; then **enforce** — remove trust in `req.query.employee_id` / `req.body.employee_id` (SEC-H IDOR, driver identity).
4. Guard the high-value mutations first: roles, employees, settings, buildings reassign-and-delete (SEC-H-6, SEC-H-7).
5. Scope every `:id` handler by the authenticated actor; move `/uploads` behind auth (SEC-M-33).
   **Verify:** an unauthenticated call to any non-public route returns 401; a non-admin token cannot `PUT /api/roles/:id`.

### Phase 2 — Validation & error hygiene
1. Introduce zod schemas per route; construct Prisma payloads from allowlisted fields only (SEC-H-19/20, SEC-M-21).
2. Add `asyncHandler` + a central error/404/`P2025` middleware; route all handlers through it and drop `details: err.message` (DRY-L-1c, SEC-M-28). Standardize the response envelope (ARC-L-9).
3. Add rate limiting on auth endpoints; strengthen the password policy (SEC-M-13/14).
4. Reject SVG uploads + enforce magic bytes; re-enable a restrictive CSP; validate upload id as UUID (SEC-M-32/34/35, SEC-L-36).
   **Verify:** malformed bodies return 400 with a generic message; `?limit=999999` is capped; an SVG upload is rejected.

### Phase 3 — Structure & DRY
1. Extract `orders.js:16-274` domain logic into services; de-duplicate `pickLeastUsedTruck` and the install-estimate helper (ARC-H-1, ARC-M-2, DRY-L-1e). Split the 283-line `PATCH /:id`.
2. Add a shared `status`/`role` enum consumed by client + server; unify role extraction to one helper (ARC-M-4).
3. Centralize server config in `server/config/index.js`; ship a real `.env.example`; reconcile `CLIENT_URL` and the cron defaults (ARC-M-1, ARC-L-3).
4. Backend DRY: `ORDER_PRODUCT_SELECT` constant, `makeCrudRouter` factory, shared outbox-enqueue helper (DRY-L-1a/1b/1f).
5. Frontend DRY: shared date/status formatters, `ModalShell`/`StatusBadge`/`StatTileRow`/`FilterPills`, one `usePolledFetch` hook, route raw fetches through `informationService` (DRY-L-2a/2b/2c/2f).
6. Delete dead files, unused exports, and unused deps (DRY-L-3).
   **Verify:** `npm run build` (client) and `npm start` (server) succeed; a smoke pass over orders, scheduling, and driver jobs behaves identically.

---

## Appendix — Spot-check the headline claims

```
grep -n "employee: employee" server/routes/auth.js        # → hash returned on login (SEC-H-3)
grep -rn "requireAuth\|authenticate" server/routes server/index.js   # → nothing (SEC-H-1)
grep -c jsonwebtoken server/package.json                   # → 0, undeclared dep (SEC-H-42)
```

*Every finding in this report cites a real `file:line`. Roughly 2,300 lines are removable as dead/duplicated code (~6% of the ~41.5k non-generated LOC), before touching the three near-clone schedule screens.*

---

## Addendum (2026-09-07): Warehouse scope cut — stakeholder decision

Per a stakeholder meeting with TBM, **only salesperson, delivery team, and admin roles use
this app going forward.** The warehouse team uses its own separate system. This retired the
in-app warehouse/storekeeper role, the Return-Logistics feature (spec items **A.5.5–A.5.8**:
Return DO auto-creation, stock-to-quarantine transfer automation, storekeeper scan-to-receive
enforcement, and Odoo inventory auto-update on return), the Order Re-entry feature
(A.5.9–A.5.11, gated entirely on that return-confirmation state), and the standalone warehouse
nav/schedule page — plus the warehouse-team auto-assignment logic in the order-scheduling flow,
which a full-codebase sweep found went beyond the originally-scoped Return Logistics feature.
None of the Odoo-side calls for the return-logistics feature were ever implemented (`// TODO:
confirm Odoo API` stubs) — CE-Hub-local state tracking was built but the return workflow never
reached production integration, so removal had no external-system side effect to unwind.

**Status: Phase A (code) is done. Phase B (schema) is prepared but not yet applied.**

### Phase A — landed (2026-09-07)

Removed, with no schema change (so nothing below is dropped from the database yet):

- `server/services/returnWorkflowService.js`, `server/services/orderReentryService.js` — deleted whole files.
- `server/services/deliveryFailureService.js` — no longer creates a `delivery_returns` row or enqueues `RETURN_DO_CREATE` on failure confirmation.
- `server/integrationOutboxCron.js` — `handleReturnDoCreate`/`handleStockTransfer`/`handleInventoryReturn`/`handleDoLineReset` handlers and their dispatch cases removed.
- `server/routes/order-products.js` — `PATCH /:id/return-status` deleted.
- `server/routes/orders.js` — `GET /:id/failure-history` and `POST /:id/re-enter` deleted; warehouse-team auto-assignment block removed from `ensureTimeslotAssignments`; `/:id/loading-status` no longer resolves `returned_by_name`.
- `server/services/scheduler.js` — warehouse-team branch removed from the nightly `ensureTimeslotAssignments`/`fetchTeams` (delivery/installation team assignment is untouched).
- `server/routes/teams.js` — `warehouse_timeslots` dropped from the team reassign/deletability/delete handlers.
- `server/routes/time-slots.js`, `server/routes/driver.js` — `warehouse_team` include and the driver "Contact Warehouse" fields removed.
- `server/services/whatsappService.js` — `odoo_quarantine_location_id` default setting removed.
- `client/src/components/warehouse/` — whole directory deleted (`truckSchedule.js`), resolving the DRY-L-2c/2d 3-way schedule clone down to a 2-way (delivery/installer).
- `client/src/components/Layout.js` — `returns` tab and warehouse nav section removed; `warehouse`/`storekeeper` stripped from `loading`/`unloading` `allowedRoles`.
- `client/src/components/common/ScanStation.js` — Returns stage, `isWarehouse` role, `ReturnsTable`, `ReturnStatusPill`, `SerialBadge` all removed.
- `client/src/components/admin/exceptions/IssueManagement.js` — "Reset Order for Rescheduling" button and its return-state fetch removed; manual reschedule flow (`PlaceOrder.js`) is unaffected.
- `client/src/components/driver/ContactReportModal.js`, `client/src/utils/templateMessages.js` — "Contact Warehouse" button and `warehouseIssueTemplate` removed.
- `client/src/components/admin/schedule/Schedule.js` — "Assign Warehouse Team" dropdown and its handler removed (the read-only warehouse-team display on existing schedule cards was deliberately left — it just goes stale once Phase B drops the column).
- `client/src/components/delivery/DelSchedule.js`, `TeamInfo.js`, `navigationMode.js`, `Badge.js`, `accessControl.js` — warehouse chip/label/filter/entry cleanup.
- Seed scripts (`seedDemo.js`, `seedDemoViva.js`, `seedDriverTestData.js`, `seedPickingDemo.js`) — storekeeper/warehouse-team employees, teams, and return-logistics demo rows removed; picking/loading demo data reattributed to existing delivery employees (any employee can pick/load — that was never warehouse-role-specific).

Verified: client production build (`npx react-scripts build`) compiles clean; all touched server modules `require()` without error; repo-wide grep for `warehouse_team_id`/`delivery_returns`/`delivery_workflows`/`storekeeper`/`return_status` turns up only the intentionally-kept `warehouse_address`/`warehouse_postal` (depot routing origin) and "Leave warehouse" (driver departure action) terminology, unrelated to the removed role.

### Phase B — prepared, not applied

A migration dropping `delivery_returns`, `delivery_workflows`, `time_slots.warehouse_team_id`,
`lorry_trips.warehouse_team_id`, and `order_products.return_status`/`returned_at`/`returned_by`/
`returned_serial` is written up (see the implementation plan) but deliberately **not run**
until Phase A has soaked in production and a database backup exists — schema drops are much
harder to walk back than a code/UI removal. It also cleans up any pending `integration_outbox`
rows of the four removed event types.

**Not in scope for either phase:** `order_products.picked_by/picking_status/loaded_by/unloaded_by`
and the Loading/Unloading scan stations themselves — those track which employee scanned an
item, independent of role, and were never warehouse-specific.
