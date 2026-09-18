# Demo database — isolated, disposable, safe

A fully separate Postgres instance (Docker container) with realistic seed data for
presentations/demos. It cannot touch PRODUCTION or SANDBOX (`server/.env` is never
read or written by any of this).

Files involved:

| File | Purpose |
|---|---|
| `docker-compose.demo.yml` | Spins up a throwaway `postgres:16-alpine` container on `localhost:5433` |
| `.env.demo` | `DATABASE_URL` for that container only (gitignored, not auto-loaded by the app) |
| `seedDemo.js` | Wipes and repopulates the demo DB with a full lifecycle dataset |

---

## 1. Start the demo database

Requires Docker Desktop running.

```bash
cd server
docker compose -f docker-compose.demo.yml up -d
```

Wait for it to be healthy:

```bash
docker compose -f docker-compose.demo.yml ps   # STATUS should say "healthy"
```

## 2. Push the schema into it

The Prisma CLI reads `DATABASE_URL` from the environment, not from `.env.demo`
automatically — export it into the current shell first (inline env vars beat
`.env` files, so this can never leak into a command that omits it):

PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://tbm_demo:tbm_demo@localhost:5433/tbm_demo?schema=public"
npx prisma db push
```

Bash:

```bash
set -a; source .env.demo; set +a
npx prisma db push
```

This creates all 30 tables in `tbm_demo` exactly as defined in `prisma/schema.prisma`
(verified against a real container while building this) — nothing here touches
`schema.prisma` itself.

> **Don't use `prisma migrate deploy` for this** — I tried it first and it fails:
> `prisma/migrations/20251031161540_init/migration.sql` is saved as UTF-16
> (every other migration file in the repo is plain ASCII/UTF-8), and Prisma's
> migration engine can't read it against a fresh database ("string contains
> embedded null"). That's a pre-existing repo issue, not something introduced
> here — I left it alone rather than re-encoding it, since that would change
> the file's checksum and could break `migrate deploy` against SANDBOX/PRODUCTION,
> where this migration is presumably already recorded as applied with the
> original checksum. `db push` reads `schema.prisma` directly and never touches
> migration history, so it sidesteps the problem entirely — fine for a
> throwaway demo DB that doesn't need migration history anyway. If you want
> `migrate deploy` to work again on a truly fresh database going forward,
> that migration file needs re-saving as UTF-8 — worth doing deliberately,
> separately from this demo setup.

## 3. Seed it

```bash
node seedDemo.js
# or: npm run seed:demo
```

To pin all relative dates to a specific recording date in PowerShell:

```powershell
$env:DEMO_DATE = "2026-09-10"
npm.cmd run seed:demo
```

With that anchor, today's operational records use 10 September 2026; historical
records use 4 and 7 September; and future schedules use 13, 15, and 17 September.
If `DEMO_DATE` is omitted, the seed defaults to 10 September 2026.

`seedDemo.js` loads `.env.demo` itself (no `source` needed for this step) and
**refuses to run** unless `DATABASE_URL` contains `tbm_demo` + `localhost` — a
guard rail against ever pointing it at SANDBOX/PRODUCTION by accident.

It's safe to re-run any time: it truncates every table (this database holds
nothing but demo data) and reseeds from a clean slate, with dates computed
relative to "today" so the demo always looks current.

What you get — 25 orders covering the delivery lifecycle and a historical B.2 route rehearsal:

- **Pending / unassigned** — a fresh order awaiting scheduling
- **Scheduled** (plain, and one requiring installer team + `installation_schedules`)
- **In transit right now** — 2 orders on a truck that "departed" today, one
  still awaiting loading (shows the loading dashboard)
- **Delivered** — with POD photo, signature, 5★ rating
- **Delivered + complaint** — resolved complaint referencing the same order
- **Delivery failed** — `delivery_failure_events` audit row, item marked failed
- **Delivery failed, admin manually reset for rescheduling** — order reset in
  place back to `Pending`
- **Escalated / overdue** — unacknowledged, `overdue_reminder_sent_at` set
- **Rescheduled** — cancelled original linked via `rescheduled_from_order_id`
  to a new scheduled order
- **Cancelled** outright
- **LLM remark parser demo** — `remarks_*` fields differing from the original address
- **Delivered, low rating, no complaint**
- **Scheduled for today, still awaiting loading** — 2 line items pending
- **Failed today, mid-trip** — item refused at the door

The last two exist specifically so **Scan Station** has something in all three current tabs
the moment you open it (no need to change the date picker off "today"):

| Tab | Order | What you'll see |
|---|---|---|
| Loading | DEMO-DO-1016 | 2 items with `DEMO-SERIAL-1016-A` and `DEMO-SERIAL-1016-B` |
| Unloading | DEMO-DO-1004, DEMO-DO-1005 | items loaded, awaiting unload on today's out-for-delivery trip |
| Audit (admin only) | all of the above + DEMO-DO-1010, DEMO-DO-1017 | full scan trail for today across every status |

### Historical B.2 route rehearsal

Eight usable delivery records from the 26 August 2026 TBM scheduler history are
shifted to `DEMO_DATE`, so they appear immediately after login. They keep their real delivery-area addresses,
customer access windows, source workbook row numbers, quantities, and a mix of
delivery-only and installation work. Placeholder calendar rows, transfers,
cancelled/double bookings, and rows without usable delivery addresses are excluded.

The rehearsal slot is assigned to Suresh (`suresh.driver@demo.tbm.local`) and
truck `WYY 5678`. Its orders use the `HIST-DO-*` prefix. Run B.2 for that slot
to test road-time sequencing, ETA calculation, last-stop-first-loaded ordering,
fallback routing, and preservation of the existing route when a dynamic rerun
offers no significant improvement.

Plus 3 roles, 2 outlets, 8 employees (1 deactivated), 3 zones, 14 buildings
(including 8 historical route stops), 3 trucks, 3 teams, 16 customers, 8 products,
10 time slots, 3 lorry trips, issue reports, notifications, system settings,
scheduler config, and 2 integration-outbox rows (`sent` and `pending`).

Demo logins (printed again at the end of the seed run), password `Demo@1234` for all:

| Role | Email |
|---|---|
| Admin | `admin@demo.tbm.local` |
| Driver | `razif.driver@demo.tbm.local` |
| Driver 2 / B.2 rehearsal | `suresh.driver@demo.tbm.local` |
| Installer | `kumaran.installer@demo.tbm.local` |

## 4. Look at it

**GUI, no app needed:**

```powershell
$env:DATABASE_URL = "postgresql://tbm_demo:tbm_demo@localhost:5433/tbm_demo?schema=public"
npx prisma studio
```

**Run the actual app against it**, without touching `server/.env` at all — an
inline env var wins over dotenv's `.env` load, so this is fully reversible by
just running the command again without the prefix:

```powershell
# server
$env:DATABASE_URL = "postgresql://tbm_demo:tbm_demo@localhost:5433/tbm_demo?schema=public"
npm run dev
```

```bash
# client — point it at that server as usual
npm start
```

When the demo is over, just run `npm run dev` normally (no prefix) — it reads
`server/.env` again as always. Nothing was ever edited, so there's nothing to
"switch back."

## 5. Reset between demo runs (optional)

To get a clean slate without tearing down the container:

```bash
node seedDemo.js
```

## 6. Teardown when the demo is over

```bash
# Stop and free resources, but keep the data for next time:
docker compose -f docker-compose.demo.yml stop

# Or fully destroy it — container, image layer, and the data volume:
docker compose -f docker-compose.demo.yml down -v
```

`down -v` is irreversible (it deletes the named volume `tbm_demo_data`). There is
nothing else to clean up — `server/.env` was never touched, so `npm run dev` /
`npm start` already point at SANDBOX as before.
