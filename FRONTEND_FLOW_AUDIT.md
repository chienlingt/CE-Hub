# CE Hub — Frontend User Flow & Journey Audit

**Scope:** `client/src` — React 18, react-router-dom v6
**Routing core:** `client/src/App.js` + `client/src/components/Layout.js` + `client/src/components/ProtectedRoute.js`
**Date:** 2026-08-30

---

## 1. Complete route & flow map

The entire app hangs off two routers: `App.js` declares three public routes plus a `/*` catch-all, and `Layout.js` generates every protected route from a single `navigationData` object (sidebar section → top tabs). Permissions are role names fetched from `/api/roles` and matched by key: **a permission string must equal a nav-section key** for the section to appear. Admin bypasses all checks.

### Public routes (`App.js:15–17`)

| Route | Flow |
|---|---|
| `/login` | login OK → `navigate('/')` → Layout redirects to first allowed section |
| `/forgot-password` | email sent → back to `/login` |
| `/reset-password?token=` | success → 3s delay → `/login`; missing token → prompt to `/forgot-password` |

### Protected shell — `/*` → ProtectedRoute → Layout (`App.js:19–23`)

- `sessionStorage.isAuthenticated !== 'true'` → `<Navigate to="/login">`
- `/` or a disallowed root → redirected to first allowed section's first tab (`Layout.js:277–298`)
- Section base paths (e.g. `/dashboard`) → `<Navigate>` to first tab

| Route | Required permission key | Tabs / sub-flows |
|---|---|---|
| `/reports` | any authenticated | ReportIssue — reachable from header on every page |
| `/dashboard` | `dashboard` | (index) Overview · `live-ops` LiveDeliveries (TripDetailDrawer, `?trip=` deep link) · `employee-performance` · `order` OrderPerformance |
| `/driver` | `driver` | (index) DriverDashboard — modals: UpdateOrder · DeliveryEvidence (POD photo + SignaturePad) · ContactReport · FailDelivery (→ return workflow) · DateCalendar · `route` DriverRoute |
| `/schedule` | `schedule` | (index) Schedule · `auto-scheduler` AutoScheduleReview |
| `/info` | `info` | (index) EmployeeInfo · `team` · `building` · `truck` — all via shared `InfoPage` CRUD engine (`product`, `truckzone` commented out) |
| `/cases` | `cases` | (index) Cases · `order-issues` IssueManagement (`?orderId=` deep link) · `delivery-issues` (`?orderId=` deep link) · `sync-monitor` · `completed-deliveries` |
| `/access` | `access` | RoleAccessControl |
| `/delivery` | `delivery` | DeliverySchedule |
| `/customer` | `customer` | (index) PlaceOrder (cart flow, ParseRemarksModal for LLM parsing) · `manage-orders` |
| `/scanning` | `scanning` | `loading` / `unloading` (admin·delivery·driver) · `audit` (admin only) — **tab role filters are UI-only** |
| `/settings` | `settings` | NotificationSettings |

### Shared shell & sub-flows

- **Every page:** header with Report Issue (→ `/reports`), NotificationBell (deep-links into `/cases/*`), ProfileModal, Logout (→ `/login`).
- **Responsive navigation forks three ways** (`utils/navigationMode.js`): desktop sidebar; mobile drawer for office users; bottom nav + "More" drawer for field-only users (field permission keys only, no office/admin keys).
- **Redirect chain after login:** `/login` → `navigate('/')` → Layout effect → first allowed section → section-base `<Navigate>` → first tab. Three hops, all `replace`, so Back works — but the destination depends on permission-array ordering, not an explicit per-role home.
- **No access:** a user whose role grants zero matching keys gets a dead-end "No access" screen with only Logout.
- **Hidden inventory:** the `installation` section plus `ComplaintManagement`, `OrderIssues`, `DoAssignment`, `FailureNotificationLog`, `ProductInfo`, `TruckZoneInfo` are imported in `Layout.js` but not routed — dead weight in the bundle. (The `warehouse` section was removed entirely — see `ARCHITECTURE.md`'s 2026-09-07 addendum.)

---

## 2. Route guard & flow vulnerabilities

### CRITICAL — All protected routes are registered regardless of permission
Layout builds its `<Route>` elements from the full `navigationData`, not `filteredNavigation`. The only permission enforcement is a `useEffect` that redirects when the path **root** isn't allowed — which runs *after* first render, so the unauthorized component mounts for a frame and fires its data fetches before the redirect lands.
`client/src/components/Layout.js:522–544` (route generation) vs `:221–234` (filtering); redirect at `:290–298`.

### CRITICAL — Tab-level roles are cosmetic; direct URLs bypass them
The Scan Station's `allowedRoles` only filters which tab *buttons* render. A non-admin user with the `scanning` permission can type `/scanning/audit` and the admin-only audit stage renders fully, because the redirect effect checks only the root `/scanning`. The same hole applies to any tab in any section the user's root permission covers.
`client/src/components/Layout.js:486–492` (UI filter) vs `:534–544` (unguarded routes).

### CRITICAL — Authentication is a spoofable sessionStorage flag
`isAuthenticated()` is `sessionStorage.getItem('isAuthenticated') === 'true'`. Anyone can set that key plus a fabricated `employeeData` blob in DevTools and walk into the full admin UI — and since the backend has no auth middleware at all, every API behind it responds too. All client-side guarding in this app is UX, not security.
`client/src/contexts/AuthContext.js:76–77`; `client/src/components/ProtectedRoute.js:33`.

### CRITICAL — Permission model leaks every role's permission map to every client
`fetchPermissionsForRole` downloads **all** roles from unauthenticated `GET /api/roles` and matches client-side. Any visitor can enumerate the full access-control matrix. Permissions are also cached in sessionStorage at login and never refreshed, so revoking access does nothing until the user's tab closes.
`client/src/contexts/AuthContext.js:21–66, :204–208`.

### FLOW — No 404; unknown sub-paths render a blank content pane
An unknown *root* (`/bogus`) is silently redirected to the first allowed section, so typos teleport the user with no explanation. An unknown *sub-path* under an allowed root (`/dashboard/bogus`) passes the root check, matches no route, and renders an empty content area with live chrome — a dead screen with no message.
`client/src/components/Layout.js:515–548` — no `path="*"` fallback inside the inner `<Routes>`.

### FLOW — `/reports` is "for everyone" but unreachable for zero-permission users
The redirect effect special-cases `/reports` as permission-free (`Layout.js:271`), but the "No access" early return at `:355` fires first whenever `filteredNavigation` is empty — so the one page every employee is supposed to reach is blocked for exactly the users who have nothing else.

### FLOW — Sessions die per-tab and never expire
sessionStorage means a new tab or browser restart silently logs the user out (drivers lose their session every time they follow a link out and back), while within a tab the session lives forever with no expiry, no token, and no server-side invalidation. There is no session-expiry redirect flow because there is nothing to expire.
`client/src/contexts/AuthContext.js:146–152, :183–241`.

### Form flows

| Flow | Double-submit guard | Draft survives refresh/back | Notes |
|---|---|---|---|
| Login / ForgotPassword / ResetPassword | ✓ `disabled={loading}` | n/a | Reset flow handles a missing token with a recovery path — good. |
| PlaceOrder (`order/PlaceOrder.js`, 991 lines) | ✓ `submitting` flag | ✗ | Entire cart + customer form is in-memory; refresh or Back discards everything with no warning (no `beforeunload`, no draft persistence). |
| Driver modals (evidence, fail-delivery, contact) | ✓ per-modal flags | ✗ | POD photos + signature lost if the modal closes; painful on flaky mobile. |
| ReportIssue | ✓ | ✗ | |
| Info CRUD (via `InfoPage`) | partial | ✗ | Deletes confirmed via `window.confirm`, then `window.location.reload()`. |

---

## 3. Redundancies & UX/code bottlenecks

### Two parallel schedule pages, one of them unrouted
`delivery/DelSchedule.js` (754 lines) and `installer/InsSchedule.js` (683) are structural siblings — the same employeeId-resolution line is repeated verbatim in both (`DelSchedule.js:166`, `InsSchedule.js:163`) — but they've drifted into divergent copies. Only DelSchedule is routed; InsSchedule is commented out of the nav yet still imported into Layout and shipped in the bundle. (A third sibling, `warehouse/truckSchedule.js`, was removed entirely — see `ARCHITECTURE.md`'s 2026-09-07 addendum.)

### URL state is mirrored into React state, then synced back by effect
`activeSection` and `topNavActive` duplicate what `location.pathname` already says. A 55-line effect (`Layout.js:256–310`) re-derives them on every navigation, and the tab-inference logic (`:305–308`, matching the *last* path segment) silently falls back to the first tab when it fails — so the highlighted tab can disagree with the rendered page. Nav items are `<button onClick={navigate}>` instead of `<NavLink>`, which is why this bookkeeping exists at all (and why nav items aren't real links — no middle-click, no copy-address).

### Hardcoded path strings, browser dialogs, and full-page reloads
- Navigation targets are string literals scattered across ten files (`'/cases/order-issues'` in `NotificationBell.js:103–118`, `'/dashboard/live-ops'` in two places, `'/customer/'` with a stray trailing slash twice) with no route-constants module.
- Feedback is a mix of `alert()`/`window.confirm()` (40+ call sites: ManageOrders ×6, ScanStation ×6, Schedule ×5, AutoScheduleReview ×5, …) alongside the purpose-built `Modal`/`ResultModal`/`InfoModal` components that already exist.
- Three info pages "refresh" after delete with `window.location.reload()` (`BuildingInfo.js:94,120` · `ProductInfo.js:102` · `TruckInfo.js:99`) — a full app reboot including session restore, wiping every filter and scroll position.

### Deep-linkable state exists but only in three places
Live-ops (`?trip=`) and the two issue queues (`?orderId=`) correctly put drill-down state in the URL. Everywhere else (driver dashboard date/tab/search filters at `DriverDashboard.js:56–64`, cases filters, schedule scope) filter state is component-local and evaporates on refresh, so nobody can share or bookmark a filtered view.

### What's already right — build on these
- The `InfoPage` engine (`common/InfoPage.js`: columns + fields + normalizers in, full CRUD out) is exactly the consolidation pattern the schedule pages need.
- `navigationData` as a single source for nav + routes is a sound idea — it just needs to drive the guards too.
- The field-mobile bottom-nav split in `utils/navigationMode.js` is a clean, testable pure-function approach to responsive role UX.

---

## 4. Streamlining plan

Ordered by dependency — each step makes the next one smaller.

1. **Put real auth on the server before polishing the client guards.** Issue a JWT (the library is already installed for password resets) at `/api/auth/login`, verify it in one Express middleware on `/api/*`, and return only the caller's own role via `GET /api/roles/me`. Then swap the sessionStorage flag for token presence + a 401-interceptor in a shared fetch wrapper that redirects to `/login` — which finally gives the app a session-expiry flow.
2. **Generate routes from `filteredNavigation` and guard tabs where they render.** Change `Layout.js:522–544` to map over `filteredNavigation` so disallowed sections have no route at all; wrap tab elements in a small `<RequireRoles roles={tab.allowedRoles}>` that redirects instead of relying on hidden buttons; add `<Route path="*">` with a real NotFound page inside the inner Routes; drop the redirect-by-effect entirely in favor of declarative `<Navigate>` elements (no unauthorized first paint).
3. **Delete the mirrored nav state and the dead inventory.** Derive section and active tab from `useLocation()` (or switch nav to `<NavLink>`), removing `activeSection`/`topNavActive` and the 55-line sync effect. Remove the six imported-but-unrouted components from `Layout.js` — restore from git history if the features return.
4. **Centralize paths and standardize feedback.** Add `src/routes.js` exporting path constants and builders (`orderIssuePath(orderId)`), then replace the string literals in NotificationBell, ActiveTripsPanel, TripDetailDrawer, and friends. Migrate the 40+ `alert`/`confirm` call sites onto the existing `ResultModal`/`Modal` components, and replace the three `window.location.reload()` calls with a refetch callback inside `InfoPage`.
5. **Consolidate the schedule pair on the InfoPage model.** Extract one parameterized `SchedulePage` (data source, columns, row actions as config) from DelSchedule, and re-implement the installer variant as a thin config when it's re-enabled.
6. **Make journeys survive refresh.** Move list filters (driver date/tab/search, cases filters) into URL search params, extending the pattern live-ops already uses. Persist the PlaceOrder cart draft to localStorage keyed by employee, restore on mount, clear on successful submit, and add a `beforeunload` warning while the cart is non-empty. Consider localStorage (or the step-1 cookie/JWT) for the session itself so drivers stop losing their login between tabs.
