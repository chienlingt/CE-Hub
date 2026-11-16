-- Points per item keyed by item name (Odoo lines have no products row).
CREATE TABLE "item_point_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "item_key" VARCHAR(255) NOT NULL,
  "item_name" VARCHAR(255) NOT NULL,
  "points_per_item" DOUBLE PRECISION NOT NULL,
  "updated_by" UUID,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "item_point_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "item_point_rates_item_key_key" ON "item_point_rates"("item_key");
