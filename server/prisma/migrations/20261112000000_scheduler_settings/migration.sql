-- B.1 scheduler settings move from browser localStorage to the server.
-- Additive only: existing warehouse, cron, enabled and last_run values are kept.

-- One global settings row. Refuse to guess which row is real if there are several.
DO $$
BEGIN
  IF (SELECT count(*) FROM "scheduler_config") > 1 THEN
    RAISE EXCEPTION 'scheduler_config has more than one row; keep one before applying this migration';
  END IF;
END $$;

ALTER TABLE "scheduler_config"
  ADD COLUMN "singleton"                   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "grace_minutes"               INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "buffer_minutes"              INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "load_minutes"                INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "unload_minutes"              INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "max_dos_per_slot"            INTEGER NOT NULL DEFAULT 25,
  ADD COLUMN "planning_cutoff"             VARCHAR(5) NOT NULL DEFAULT '17:00',
  ADD COLUMN "planning_run_offset_minutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "base_delivery_minutes"       INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "fallback_install_minutes"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "service_time_catalogue"      JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "updated_by"                  UUID;

ALTER TABLE "scheduler_config" ADD CONSTRAINT "scheduler_config_singleton_true" CHECK ("singleton");
CREATE UNIQUE INDEX "scheduler_config_singleton_key" ON "scheduler_config"("singleton");

-- New rows default to the derived run time (17:00 cutoff + 60 min). The existing
-- row's cron_expression is left alone; the cron job derives its schedule from
-- planning_cutoff and the next settings save rewrites this mirror column.
ALTER TABLE "scheduler_config" ALTER COLUMN "cron_expression" SET DEFAULT '0 18 * * *';

-- Seed the item-type service-time catalogue (proposal §2 figures, to be
-- confirmed with Mr Lee). Odoo category mapping is empty until GCA confirms values.
UPDATE "scheduler_config"
SET "service_time_catalogue" = '[
  {"id":"washing-machine","label":"Washing machine","odoo_categories":[],"install_minutes":90,"dismantle_minutes":null,"requires_installer":true},
  {"id":"refrigerator","label":"Refrigerator","odoo_categories":[],"install_minutes":60,"dismantle_minutes":null,"requires_installer":false},
  {"id":"tv-wall-mount","label":"TV (wall bracket)","odoo_categories":[],"install_minutes":150,"dismantle_minutes":null,"requires_installer":true},
  {"id":"air-conditioner","label":"Air conditioner","odoo_categories":[],"install_minutes":null,"dismantle_minutes":null,"requires_installer":true}
]'::jsonb
WHERE "service_time_catalogue" = '[]'::jsonb;

-- Dated truck/team unavailability (replaces the browser-only fleet/team overrides).
CREATE TABLE "resource_blockoffs" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "resource_type" VARCHAR(10) NOT NULL,
  "resource_id"   UUID NOT NULL,
  "start_date"    DATE NOT NULL,
  "end_date"      DATE NOT NULL,
  "reason"        VARCHAR(20) NOT NULL,
  "note"          VARCHAR(300),
  "created_by"    UUID,
  "created_at"    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resource_blockoffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "resource_blockoffs_type_check" CHECK ("resource_type" IN ('truck', 'team')),
  CONSTRAINT "resource_blockoffs_range_check" CHECK ("end_date" >= "start_date")
);

CREATE INDEX "resource_blockoffs_resource_type_resource_id_start_date_idx"
  ON "resource_blockoffs"("resource_type", "resource_id", "start_date");
CREATE INDEX "resource_blockoffs_start_date_end_date_idx"
  ON "resource_blockoffs"("start_date", "end_date");
