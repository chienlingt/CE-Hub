-- B.1 planning run (fixed assignment at the cutoff, proposal §5 Part 2).
-- planning_runs: one row per run. planning_run_deferrals: booked DOs the run
-- could not place, with the reason and a suggested alternative date/session.

CREATE TABLE "planning_runs" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "plan_date"   VARCHAR(10) NOT NULL,
  "trigger"     VARCHAR(10) NOT NULL,
  "dry_run"     BOOLEAN NOT NULL DEFAULT false,
  "status"      VARCHAR(10) NOT NULL,
  "summary"     JSONB,
  "error"       TEXT,
  "created_by"  UUID,
  "started_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(6),
  CONSTRAINT "planning_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "planning_runs_trigger_check" CHECK ("trigger" IN ('cron', 'manual')),
  CONSTRAINT "planning_runs_status_check" CHECK ("status" IN ('running', 'completed', 'failed'))
);
CREATE INDEX "planning_runs_plan_date_started_at_idx" ON "planning_runs"("plan_date", "started_at");

CREATE TABLE "planning_run_deferrals" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "run_id"            UUID NOT NULL,
  "order_id"          UUID NOT NULL,
  "session"           VARCHAR(10) NOT NULL,
  "reason_code"       VARCHAR(30) NOT NULL,
  "reason_detail"     VARCHAR(300),
  "suggested_date"    VARCHAR(10),
  "suggested_session" VARCHAR(10),
  "created_at"        TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "planning_run_deferrals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "planning_run_deferrals_run_id_fkey" FOREIGN KEY ("run_id")
    REFERENCES "planning_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "planning_run_deferrals_run_id_idx" ON "planning_run_deferrals"("run_id");
CREATE INDEX "planning_run_deferrals_order_id_idx" ON "planning_run_deferrals"("order_id");
