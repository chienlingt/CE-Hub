CREATE TABLE "odoo_sync_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "run_key" TEXT NOT NULL,
  "source" TEXT NOT NULL, "target_date" TEXT, "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0, "next_retry_at" TIMESTAMP(6), "lease_until" TIMESTAMP(6),
  "report" JSONB NOT NULL, "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "odoo_sync_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "odoo_sync_runs_run_key_key" ON "odoo_sync_runs"("run_key");
CREATE INDEX "odoo_sync_runs_status_next_retry_at_idx" ON "odoo_sync_runs"("status", "next_retry_at");
CREATE INDEX "odoo_sync_runs_created_at_idx" ON "odoo_sync_runs"("created_at");
