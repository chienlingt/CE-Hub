-- Item types move from Scheduler Settings (scheduler_config.service_time_catalogue
-- JSON) to their own table, managed on Information > Item. Each product name in
-- item_point_rates is assigned to a type; an unassigned name needs review.

-- CreateTable
CREATE TABLE "item_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "install_minutes" INTEGER,
    "dismantle_minutes" INTEGER,
    "requires_installer" BOOLEAN NOT NULL DEFAULT false,
    "default_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_types_name_key" ON "item_types"("name");

-- Copy the saved catalogue. Odoo categories become keywords (lower-cased).
-- Minutes outside 0-480 or not whole numbers are dropped to "not confirmed".
INSERT INTO "item_types" ("name", "install_minutes", "dismantle_minutes", "requires_installer", "keywords")
SELECT DISTINCT ON (lower(btrim(e->>'label')))
       left(btrim(e->>'label'), 80),
       CASE WHEN (e->>'install_minutes') ~ '^\d+$' AND (e->>'install_minutes')::int <= 480 THEN (e->>'install_minutes')::int END,
       CASE WHEN (e->>'dismantle_minutes') ~ '^\d+$' AND (e->>'dismantle_minutes')::int <= 480 THEN (e->>'dismantle_minutes')::int END,
       COALESCE((e->>'requires_installer')::boolean, false),
       COALESCE(ARRAY(
         SELECT DISTINCT lower(btrim(c))
         FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(e->'odoo_categories') = 'array' THEN e->'odoo_categories' ELSE '[]'::jsonb END) AS c
         WHERE btrim(c) <> ''
       ), ARRAY[]::TEXT[])
FROM "scheduler_config" sc
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(sc."service_time_catalogue") = 'array' THEN sc."service_time_catalogue" ELSE '[]'::jsonb END
) AS e
WHERE sc."singleton" = true AND btrim(COALESCE(e->>'label', '')) <> '';

-- Settings were never saved: start from the same defaults the catalogue had.
INSERT INTO "item_types" ("name", "install_minutes", "requires_installer")
SELECT v.name, v.install_minutes, v.requires_installer
FROM (VALUES
  ('Washing machine', 90, true),
  ('Refrigerator', 60, false),
  ('TV (wall bracket)', 150, true),
  ('Air conditioner', NULL::int, true)
) AS v(name, install_minutes, requires_installer)
WHERE NOT EXISTS (SELECT 1 FROM "scheduler_config" WHERE "singleton" = true);

-- Starter keywords for the four seeded types, so suggestions work on day one.
UPDATE "item_types" SET "keywords" = ARRAY['washer', 'washing machine']
  WHERE "name" = 'Washing machine' AND COALESCE(cardinality("keywords"), 0) = 0;
UPDATE "item_types" SET "keywords" = ARRAY['fridge', 'refrigerator']
  WHERE "name" = 'Refrigerator' AND COALESCE(cardinality("keywords"), 0) = 0;
UPDATE "item_types" SET "keywords" = ARRAY['tv']
  WHERE "name" = 'TV (wall bracket)' AND COALESCE(cardinality("keywords"), 0) = 0;
UPDATE "item_types" SET "keywords" = ARRAY['aircond', 'aircon', 'air conditioner']
  WHERE "name" = 'Air conditioner' AND COALESCE(cardinality("keywords"), 0) = 0;

-- AlterTable: "needs review" is now derived (item_type_id IS NULL). Points
-- already set per name are kept as they are.
ALTER TABLE "item_point_rates" DROP COLUMN "needs_review",
ADD COLUMN     "classification_source" VARCHAR(20),
ADD COLUMN     "item_type_id" UUID,
ADD COLUMN     "suggested_item_type_id" UUID;

-- AddForeignKey
ALTER TABLE "item_point_rates" ADD CONSTRAINT "item_point_rates_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "item_types"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "item_point_rates" ADD CONSTRAINT "item_point_rates_suggested_item_type_id_fkey" FOREIGN KEY ("suggested_item_type_id") REFERENCES "item_types"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AlterTable: the catalogue now lives in item_types.
ALTER TABLE "scheduler_config" DROP COLUMN "service_time_catalogue";
