-- B.4 Fleet Availability (FR-10-001..007).
-- A block-off row now covers the whole fleet, every truck of one tonnage, one
-- truck or one team, for one or more delivery sessions. Rows saved together
-- share a group_id so the admin can list and remove them as one block-off.
-- Existing rows keep working: they become truck/team rows covering all three
-- sessions, each in its own group.

ALTER TABLE "resource_blockoffs" DROP CONSTRAINT "resource_blockoffs_type_check";

ALTER TABLE "resource_blockoffs" ALTER COLUMN "resource_type" TYPE VARCHAR(12);
ALTER TABLE "resource_blockoffs" ALTER COLUMN "resource_id" DROP NOT NULL;

ALTER TABLE "resource_blockoffs" ADD COLUMN "scope_value" VARCHAR(20);
ALTER TABLE "resource_blockoffs"
  ADD COLUMN "sessions" TEXT[] NOT NULL DEFAULT ARRAY['morning', 'afternoon', 'evening']::TEXT[];
ALTER TABLE "resource_blockoffs" ADD COLUMN "group_id" UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE "resource_blockoffs" ADD CONSTRAINT "resource_blockoffs_type_check"
  CHECK ("resource_type" IN ('fleet', 'truck_type', 'truck', 'team'));

-- truck/team rows name a resource; fleet rows name nothing; truck_type rows name a tonnage.
ALTER TABLE "resource_blockoffs" ADD CONSTRAINT "resource_blockoffs_target_check" CHECK (
  ("resource_type" IN ('truck', 'team') AND "resource_id" IS NOT NULL AND "scope_value" IS NULL)
  OR ("resource_type" = 'truck_type' AND "resource_id" IS NULL AND "scope_value" IS NOT NULL)
  OR ("resource_type" = 'fleet' AND "resource_id" IS NULL AND "scope_value" IS NULL)
);

ALTER TABLE "resource_blockoffs" ADD CONSTRAINT "resource_blockoffs_sessions_check"
  CHECK (cardinality("sessions") > 0 AND "sessions" <@ ARRAY['morning', 'afternoon', 'evening']::TEXT[]);

CREATE INDEX "resource_blockoffs_group_id_idx" ON "resource_blockoffs"("group_id");
