-- Additive only: preserve Odoo order lines, quantities and existing serials.
ALTER TABLE "order_products" ADD COLUMN IF NOT EXISTS "unit_scans" JSONB;
