-- Renames orders.preferred_delivery_time to orders.preferred_timeslot to match
-- GCA's "Confirmed Data Mapping Requirements" table (10 Jul 2026 meeting notes, §6).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'preferred_delivery_time'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'preferred_timeslot'
  ) THEN
    ALTER TABLE "orders" RENAME COLUMN "preferred_delivery_time" TO "preferred_timeslot";
  END IF;
END $$;
