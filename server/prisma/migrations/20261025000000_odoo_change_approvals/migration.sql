CREATE TABLE "odoo_change_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "do_ref" TEXT NOT NULL,
  "request_kind" VARCHAR(20) NOT NULL,
  "request_key" VARCHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "before_snapshot" JSONB NOT NULL,
  "baseline_hash" VARCHAR(64) NOT NULL,
  "changes" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "reviewed_by" UUID,
  "reviewed_by_name" TEXT,
  "review_note" TEXT,
  "reviewed_at" TIMESTAMP(6),
  "applied_snapshot" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "odoo_change_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "odoo_change_requests_request_key_key" ON "odoo_change_requests"("request_key");
CREATE INDEX "odoo_change_requests_status_created_at_idx" ON "odoo_change_requests"("status", "created_at");
CREATE INDEX "odoo_change_requests_order_id_idx" ON "odoo_change_requests"("order_id");
