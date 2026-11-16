-- FR-10 Employee Performance and Incentives.
ALTER TABLE "products" ADD COLUMN "points_per_item" DOUBLE PRECISION;

CREATE TABLE "incentive_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "points_per_item" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "bonus_points_per_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "rm_per_point" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "incentive_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "incentive_rules_active_effective_from_idx" ON "incentive_rules"("active", "effective_from");

CREATE TABLE "order_point_awards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "role" VARCHAR(20) NOT NULL,
  "item_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "bonus_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "item_breakdown" JSONB NOT NULL DEFAULT '[]',
  "rule_id" UUID,
  "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_point_awards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_point_awards_order_id_employee_id_key" ON "order_point_awards"("order_id", "employee_id");
CREATE INDEX "order_point_awards_employee_id_awarded_at_idx" ON "order_point_awards"("employee_id", "awarded_at");
ALTER TABLE "order_point_awards" ADD CONSTRAINT "order_point_awards_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_point_awards" ADD CONSTRAINT "order_point_awards_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_point_awards" ADD CONSTRAINT "order_point_awards_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "incentive_rules"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE "order_point_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "points" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "created_by" UUID,
  "reverses_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_point_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "order_point_adjustments_reverses_id_key" ON "order_point_adjustments"("reverses_id");
CREATE INDEX "order_point_adjustments_order_id_idx" ON "order_point_adjustments"("order_id");
ALTER TABLE "order_point_adjustments" ADD CONSTRAINT "order_point_adjustments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Seed one default rule so awards work before an admin configures anything.
INSERT INTO "incentive_rules" ("points_per_item", "bonus_points_per_order", "rm_per_point")
VALUES (1, 0, 1);
