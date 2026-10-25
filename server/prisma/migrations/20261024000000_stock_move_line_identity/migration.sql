-- Additive only: never convert old sale.order.line IDs by relabelling them.
-- NULL explicitly preserves legacy/unknown identity until verified against Odoo.
ALTER TABLE "order_products" ADD COLUMN "odoo_line_model" VARCHAR(30);
