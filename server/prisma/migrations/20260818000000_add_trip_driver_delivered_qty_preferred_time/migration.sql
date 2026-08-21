-- Reconciles pre-existing drift, then adds new columns for the Odoo GCA payload work.
--
-- 1) Pre-existing drift: orders.delivered_latitude / delivered_longitude already exist on
--    the live database (added outside migration history at some point) but were never
--    declared in schema.prisma or any migration. Declared here (IF NOT EXISTS, so this is
--    a no-op on databases that already have them, and additive on any that don't) so
--    migration history matches reality for future `prisma migrate deploy` runs.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_latitude" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivered_longitude" DOUBLE PRECISION;

-- 2) New: customer-requested delivery window as received from Odoo at order ingest
--    (Odoo -> CE Hub direction; previously read but silently dropped by pushOrder()).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "preferred_delivery_time" TIMESTAMP(3);

-- 3) New: real per-line delivered quantity (distinct from ordered `quantity` and from the
--    delivered/failed `item_delivery_status` enum), so true partial-unit delivery is
--    representable in the Odoo completion payload.
ALTER TABLE "order_products" ADD COLUMN IF NOT EXISTS "delivered_quantity" INTEGER;

-- 4) New: trip-level driver/assistant, overriding the truck's default driver_id/
--    assistant_id for this specific run once the trip exists (from departure onward).
ALTER TABLE "lorry_trips" ADD COLUMN IF NOT EXISTS "driver_id" UUID;
ALTER TABLE "lorry_trips" ADD COLUMN IF NOT EXISTS "assistant_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_lorry_trip_driver'
  ) THEN
    ALTER TABLE "lorry_trips"
      ADD CONSTRAINT "fk_lorry_trip_driver"
      FOREIGN KEY ("driver_id") REFERENCES "employees"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_lorry_trip_assistant'
  ) THEN
    ALTER TABLE "lorry_trips"
      ADD CONSTRAINT "fk_lorry_trip_assistant"
      FOREIGN KEY ("assistant_id") REFERENCES "employees"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;
