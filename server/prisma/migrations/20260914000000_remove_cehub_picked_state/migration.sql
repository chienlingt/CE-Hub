-- CE Hub no longer owns warehouse picking. Its item lifecycle begins at loading:
-- pending -> loaded -> unloaded.

-- Preserve all pre-load items by mapping the obsolete picked state to pending.
UPDATE "order_products"
SET "picking_status" = 'pending'
WHERE LOWER(COALESCE("picking_status", '')) = 'picked';

-- Rename the state column to reflect CE Hub's actual responsibility.
ALTER TABLE "order_products"
RENAME COLUMN "picking_status" TO "handling_status";

-- Picking metadata belongs to Odoo and is no longer maintained in CE Hub.
ALTER TABLE "order_products"
  DROP COLUMN "picked_at",
  DROP COLUMN "picked_by",
  DROP COLUMN "picked_serial";
