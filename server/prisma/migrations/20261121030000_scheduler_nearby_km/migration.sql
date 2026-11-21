-- Slot recommendation (B.1 Part 1 Step 2): a booked DO within this road
-- distance of the new address counts as nearby.
ALTER TABLE "scheduler_config" ADD COLUMN "nearby_km" INTEGER NOT NULL DEFAULT 10;
