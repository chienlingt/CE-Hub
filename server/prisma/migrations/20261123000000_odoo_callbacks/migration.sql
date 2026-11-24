-- CE Hub -> Odoo callbacks (FRD INT-04, INT-07..INT-10): per-DO event sequence and
-- attempt number on failure events.
ALTER TABLE "orders" ADD COLUMN "odoo_event_seq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "delivery_failure_events" ADD COLUMN "attempt_no" INTEGER NOT NULL DEFAULT 1;
