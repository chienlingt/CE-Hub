-- A product's own install/dismantle time on Information > Item.
-- null = follow its item type (then the fallback install time).
ALTER TABLE "item_point_rates" ADD COLUMN "install_minutes" INTEGER,
ADD COLUMN "dismantle_minutes" INTEGER;
