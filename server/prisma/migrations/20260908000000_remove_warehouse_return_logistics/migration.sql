-- Phase B: drop the Return Logistics (A.5.5-A.5.8) and warehouse-team schema,
-- once the corresponding code removal (Phase A) has run clean in production
-- and a backup exists.
--
-- PREREQUISITE — take a backup before applying this migration:
--   pg_dump "$DATABASE_URL" -F c -f pre_phase_b_backup.dump
-- (or your platform's equivalent full/point-in-time backup). This migration
-- drops two tables and five columns; the data-loss confirmation was already
-- reviewed against the isolated demo DB (see AUDIT.md's 2026-09-07 addendum)
-- but that does not substitute for a backup of the real database.
--
-- Verified: `npx prisma db push --accept-data-loss` produced this exact set
-- of changes against server/docker-compose.demo.yml's throwaway Postgres
-- instance; the app (server + client) was then run against the migrated
-- demo DB and the affected flows (Schedule edit/save, Scan Station tabs,
-- Exceptions case detail, Team Info "Normal Team" creation, driver
-- dashboard) were exercised with zero 5xx responses and zero console
-- errors. See this migration's companion note in AUDIT.md for the full
-- verification list.

-- ── Cleanup: discard any pending outbox rows for the handlers being removed ──
-- (integrationOutboxCron.js no longer has RETURN_DO_CREATE/STOCK_TRANSFER/
-- INVENTORY_RETURN/DO_LINE_RESET cases — without this, any such row still
-- 'pending' would sit forever logging "Unknown event_type" every minute.)
UPDATE "integration_outbox"
SET status = 'processed', processed_at = now()
WHERE event_type IN ('RETURN_DO_CREATE', 'STOCK_TRANSFER', 'INVENTORY_RETURN', 'DO_LINE_RESET')
  AND status = 'pending';

-- DropForeignKey
ALTER TABLE "time_slots" DROP CONSTRAINT "fk_time_slots_warehouse_team";

-- DropForeignKey
ALTER TABLE "delivery_returns" DROP CONSTRAINT "delivery_returns_failure_event_id_fkey";

-- DropForeignKey
ALTER TABLE "delivery_workflows" DROP CONSTRAINT "delivery_workflows_order_id_fkey";

-- DropForeignKey
ALTER TABLE "delivery_workflows" DROP CONSTRAINT "delivery_workflows_failure_event_id_fkey";

-- DropForeignKey
ALTER TABLE "delivery_workflows" DROP CONSTRAINT "delivery_workflows_previous_workflow_id_fkey";

-- AlterTable
ALTER TABLE "lorry_trips" DROP COLUMN "warehouse_team_id";

-- AlterTable
ALTER TABLE "order_products" DROP COLUMN "return_status",
DROP COLUMN "returned_at",
DROP COLUMN "returned_by",
DROP COLUMN "returned_serial";

-- AlterTable
ALTER TABLE "time_slots" DROP COLUMN "warehouse_team_id";

-- DropTable
DROP TABLE "delivery_returns";

-- DropTable
DROP TABLE "delivery_workflows";
