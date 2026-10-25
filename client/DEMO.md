# Demo build — B.1 Scheduler UI walkthrough

A build of the scheduler UI that runs on **mock data with no backend and no database**, for the
stakeholder walkthrough (Mr Lee, Mrs Sally, Dr Chiew, Mr Tan). Everything is driven by two
environment variables; both default **off**, so a normal `npm run build` is unaffected.

## Running it

```bash
cd client
npm run start:demo     # dev server, mock data, auth bypassed
npm run build:demo     # production bundle of the same
```

On Windows (or anywhere the inline `VAR=x` syntax in those scripts doesn't apply — IIS deploys run
plain `npm run build`), create **`client/.env.production.local`** instead. That filename is already
in `.gitignore`, so it cannot be committed by accident:

```
REACT_APP_DEMO_AUTH=1
REACT_APP_SCHEDULE_DATA_SOURCE=mock
GENERATE_SOURCEMAP=false
```

Delete the file to go back to a normal build.

## The switches

| Variable | Effect |
|---|---|
| `REACT_APP_DEMO_AUTH=1` | `AuthContext` resolves a hardcoded `Demo Admin` session locally and returns before any network call. Without it, a mock build still needs the server — see below. |
| `REACT_APP_SCHEDULE_DATA_SOURCE=mock` | Selects the mock gateway instead of the live one. Also overridable per-URL with `?data=mock` / `?data=live`. |
| `GENERATE_SOURCEMAP=false` | Silences `recharts@3`'s ESM `Failed to parse source map` warnings, so the console looks clean in front of an audience. |
| `REACT_APP_ALLOW_LIVE_IN_DEMO=1` | Escape hatch — re-enables live data in a demo build. Read the warning below before using it. |

## ⚠ A demo build cannot read live data, on purpose

**`client/.env.production` is committed to the repo** and sets
`REACT_APP_API_BASE_URL=https://lab2.tbm2u.net`. CRA loads that file for *every* production build,
including `npm run build:demo` — so the demo bundle ships pointing at **production**.

Combined with `REACT_APP_DEMO_AUTH=1` disabling authentication, typing `?data=live` into a demo URL
would read and write production data with no login. So `services/schedule/dataSource.js` refuses
`live` whenever demo auth is on, falls back to mock, and the workspace shows a red
"Live data refused" banner rather than silently showing the wrong thing.

Override with `REACT_APP_ALLOW_LIVE_IN_DEMO=1` only when you have also pointed
`REACT_APP_API_BASE_URL` at a local server. For the Odoo-team walkthrough, prefer a build with demo
auth **off** (see the last section) so real login still applies.

## Why the auth switch is necessary

`src/App.js` puts every route behind `ProtectedRoute → Layout`, and `AuthContext` has three
separate network dependencies:

- `POST /api/auth/verify-session` runs in a mount effect; **any** failure hits its `catch`, which
  calls `logout()`, which redirects to `/login`.
- `GET /api/roles` resolves permissions. With none, `Layout`'s `filteredNavigation` is empty — so
  there is no navigation at all, not just a degraded one.
- `POST /api/auth/login` is the only way past the login screen.

`AuthProvider` also renders `{!loading && children}`, so a hung fetch shows a blank page rather
than a partial UI. The switch short-circuits the **restore effect**, which is what makes the build
a static artifact you can host anywhere.

`logout()` is also inert under `REACT_APP_DEMO_AUTH=1` — there would be no server to log back in
against, so the button would otherwise dead-end at `/login`.

> **Security note.** `REACT_APP_DEMO_AUTH=1` disables authentication entirely. Never set it on a
> build that is reachable by anyone who shouldn't see the data. Note also that this app has no
> server-side auth at all — login returns the employee record with no token, permission checks are
> client-side, and no Express route has a guard. If you serve `?data=live` to the Odoo team, every
> `/api/*` route is open to anyone with the URL.

## Deploy checklist

Do this **before** building any screens — both of these fail silently and only on a real deploy.

1. **SPA deep links.** Open `/schedule?view=grid` directly on the deployed site. It must not 404.
   The rewrite rule lives in `client/public/web.config` so `npm run build` copies it into
   `client/build/` beside `index.html`. (A stale duplicate sits at `client/web.config`, outside
   `public/`, which CRA never copies — delete it once the `public/` copy is confirmed working.)
   Note `deploy-to-iis.ps1` runs `npm run build` and copies nothing itself.
2. **Open it on a machine that isn't yours, with the API server stopped.** That is the actual test
   of the demo build.

## Scenario URLs

Bookmark these so you can jump to a state instead of hunting for it mid-demo.

```
/schedule?data=mock                                  (Today board — the default)
/schedule?data=mock&view=board&scenario=overbooked   (slot totals at the 25-DO cap)
/schedule?data=mock&view=board&scenario=locked       (today's trips out for delivery)
/schedule?data=mock&view=board&order=o-24001         (a DO pinned in the drawer)
/schedule?data=mock&view=board&lorry=tk-01           (lorry card: crew + phones)
/schedule?data=mock&view=grid
/schedule?data=mock&view=exec
/schedule?data=mock&exceptions=1&scenario=exceptions
/schedule/approval?data=mock&scenario=awaitingApproval
/schedule/settings?data=mock
```

## Running against live (seeded) data

The scheduler also reads a real database. Build **without** `REACT_APP_DEMO_AUTH` (a plain
`npm start`), point `REACT_APP_API_BASE_URL` at a local server, and use `?data=live`. Real login
then applies and the demo gate above is not in the way.

The repo already has a throwaway demo database for this — a Docker Postgres on port **5433** (so
it cannot collide with a local install) defined in `server/docker-compose.demo.yml`, with its
connection string in `server/.env.demo`. Nothing in the running app reads either file:
`prismaClient.js` hardcodes `.env`, so the app can never pick up the demo database by accident.

```bash
cd server

# 1. start the throwaway demo database
docker compose -f docker-compose.demo.yml up -d

# 2. point this shell at it (and only this shell)
set -a; source .env.demo; set +a

# 3. create the schema.
#    db push, NOT migrate deploy: the committed migrations are UTF-16 and badly
#    behind — the init migration creates `orders` with 19 columns against the 74
#    in schema.prisma today. For a throwaway database, schema.prisma is the
#    authority and db push syncs it directly.
npx prisma db push

# 4. seed a realistic scheduler week
npm run seed:scheduler

# 5. run the API against the demo database (same shell, so DATABASE_URL applies)
npm run dev
```

Then, in a separate terminal, the client in **normal** (non-demo) mode and open
`/schedule?data=live`:

```bash
cd client && npm start          # NOT start:demo
```

Close that first shell (or `unset DATABASE_URL`) and everything reverts to the normal `.env`.
To wipe the demo database entirely: `docker compose -f docker-compose.demo.yml down -v`.

`npm run seed:scheduler` creates the week the scheduler UI is designed around: 70–92 DOs/day across
the three windows, 8 × 3-ton and 13 × 1-ton lorries, a far-area Thursday with only two windows,
today's morning trips already out for delivery (so the locked states show), a spread of
`unassigned` / `assigned` / `approved` orders for the approval queue, and an unassigned pool whose
orders genuinely fail constraints so the exception panel has real reasons.

**Wednesday is deliberately the peak day** — 92 DOs on a thin 4-lorry roster, which is the only
reason the amber and red capacity bands and the `▲` over-capacity glyph render at all. Verified
against the seeded database: 1 slot at 113% volume (red), 3 at 90–97% (amber), one slot holding
26 DOs against the 25 cap. The other four days sit at 4–58%, so the contrast is visible rather than
uniform. Flattening Wednesday back to an even week silently removes those UI states from the demo —
there is a comment on `PEAK_WEEKDAY` in the seed saying so.

`npm run seed:demo` remains the broader app-wide seed; `seed:scheduler` is scheduler-focused. Both
load `.env.demo` explicitly and both refuse to run unless `DATABASE_URL` contains **both**
`tbm_demo` and `localhost`/`127.0.0.1`, so neither can touch sandbox or production.

Two stale references exist in the repo, both pre-dating this work: `docker-compose.demo.yml` points
at a `server/DEMO.md` that does not exist (this file is the walkthrough), and `.env.demo` mentions a
`teardownDemo.js` that does not either (use `docker compose … down -v`).

### What is not wired on live data yet

| Works | Doesn't |
|---|---|
| Grid, exec dashboard, day view, week board, drag-and-drop | **Rejecting** a trip — `POST /api/orders/:id/reject` does not exist on the server |
| Assignment via `PATCH /api/orders/:id`, including the truck-upgrade prompt | Grace period / buffers / slot cap **persisting** — no `scheduler_config` columns yet, so they stay in this browser |
| Approval via `POST /api/orders/:id/approve` (writes back to Odoo) | Payload in kilograms — no weight column, so it renders `—` rather than a derived figure |
| Running the engine via `POST /api/scheduler/run` | B.2's route plan — populated only once Chien Ling's module has run |

Each of those fails visibly with the reason, never silently.

`seedDemo.js` hard-aborts unless `DATABASE_URL` contains both `tbm_demo` and
`localhost`/`127.0.0.1`, so it cannot touch anything real. Only `seed:demo` and `seed:driver` work
— the other six seed scripts point at files deleted in commit `43f2d25`.
