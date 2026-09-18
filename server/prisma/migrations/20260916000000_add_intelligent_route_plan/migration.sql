ALTER TABLE "time_slots"
ADD COLUMN "route_plan" JSONB,
ADD COLUMN "route_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "route_last_reason" VARCHAR(100);

ALTER TABLE "scheduler_config"
ADD COLUMN "warehouse_latitude" DECIMAL(10,7),
ADD COLUMN "warehouse_longitude" DECIMAL(10,7);
