ALTER TABLE "orders" ADD COLUMN "odoo_picking_id" INTEGER;
ALTER TABLE "orders" ADD COLUMN "doo_ready" BOOLEAN;
CREATE UNIQUE INDEX "orders_odoo_picking_id_key" ON "orders"("odoo_picking_id");
ALTER TABLE "order_products" ADD COLUMN "assigned_serials" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "order_products" ADD COLUMN "prepared_quantity" INTEGER;
ALTER TABLE "order_products" ADD COLUMN "serial_tracking" TEXT;
