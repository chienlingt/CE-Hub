-- Fleet Availability: block one staff member (leave, MC).
-- An employee row names the staff member in resource_id. A delivery team whose
-- driver is blocked counts as blocked; an installer team is blocked when every
-- installer is (rules in services/fleetAvailabilitySpec.js).

ALTER TABLE "resource_blockoffs" DROP CONSTRAINT "resource_blockoffs_type_check";
ALTER TABLE "resource_blockoffs" ADD CONSTRAINT "resource_blockoffs_type_check"
  CHECK ("resource_type" IN ('fleet', 'truck_type', 'truck', 'team', 'employee'));

ALTER TABLE "resource_blockoffs" DROP CONSTRAINT "resource_blockoffs_target_check";
ALTER TABLE "resource_blockoffs" ADD CONSTRAINT "resource_blockoffs_target_check" CHECK (
  ("resource_type" IN ('truck', 'team', 'employee') AND "resource_id" IS NOT NULL AND "scope_value" IS NULL)
  OR ("resource_type" = 'truck_type' AND "resource_id" IS NULL AND "scope_value" IS NOT NULL)
  OR ("resource_type" = 'fleet' AND "resource_id" IS NULL AND "scope_value" IS NULL)
);
