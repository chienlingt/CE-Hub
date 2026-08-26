-- A.5 Phase 2 (return logistics) + Phase 3 (re-entry) schema.
--
-- 1) order_products: storekeeper scan-to-receive tracking for failed/returned items
--    (A.5.7). Distinct from picked_*/loaded_*/unloaded_* (forward delivery flow) and from
--    item_delivery_status (delivered/failed outcome).
ALTER TABLE "order_products" ADD COLUMN IF NOT EXISTS "return_status" VARCHAR(20) DEFAULT 'pending';
ALTER TABLE "order_products" ADD COLUMN IF NOT EXISTS "returned_at" TIMESTAMP(3);
ALTER TABLE "order_products" ADD COLUMN IF NOT EXISTS "returned_by" UUID;
ALTER TABLE "order_products" ADD COLUMN IF NOT EXISTS "returned_serial" TEXT;

-- 2) delivery_returns: one row per delivery_failure_events row (A.5.5-A.5.8). Created on
--    failure confirmation (transfer_status: 'pending'), advanced by the outbox stub
--    handlers and the scan-to-receive flow through 'awaiting_receipt' -> 'received' ->
--    'inventory_updated'. Phase 3 re-entry gates on 'inventory_updated'.
CREATE TABLE IF NOT EXISTS "delivery_returns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "failure_event_id" UUID NOT NULL,
    "return_do_ref" VARCHAR(100),
    "transfer_status" VARCHAR(30) DEFAULT 'pending',
    "received_at" TIMESTAMP(6),
    "received_by" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "delivery_returns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_returns_failure_event_id_key" ON "delivery_returns"("failure_event_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_returns_failure_event_id_fkey'
  ) THEN
    ALTER TABLE "delivery_returns"
      ADD CONSTRAINT "delivery_returns_failure_event_id_fkey"
      FOREIGN KEY ("failure_event_id") REFERENCES "delivery_failure_events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3) delivery_workflows: re-entry generation chain for a failed order being reset in place
--    (A.5.9-A.5.11). `orders` itself is reset (order_status/time_slot_id cleared), this
--    table records how many times and links each generation back to the failure event
--    that triggered it. Distinct from orders.rescheduled_from_order_id, which is the
--    separate manual "create a brand-new order" flow in PlaceOrder.js.
CREATE TABLE IF NOT EXISTS "delivery_workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "previous_workflow_id" UUID,
    "failure_event_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "reset_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_workflows_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_workflows_order_id_fkey'
  ) THEN
    ALTER TABLE "delivery_workflows"
      ADD CONSTRAINT "delivery_workflows_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_workflows_failure_event_id_fkey'
  ) THEN
    ALTER TABLE "delivery_workflows"
      ADD CONSTRAINT "delivery_workflows_failure_event_id_fkey"
      FOREIGN KEY ("failure_event_id") REFERENCES "delivery_failure_events"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_workflows_previous_workflow_id_fkey'
  ) THEN
    ALTER TABLE "delivery_workflows"
      ADD CONSTRAINT "delivery_workflows_previous_workflow_id_fkey"
      FOREIGN KEY ("previous_workflow_id") REFERENCES "delivery_workflows"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
