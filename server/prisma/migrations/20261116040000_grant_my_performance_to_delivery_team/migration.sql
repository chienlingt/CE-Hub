-- Drivers and assistants (the "Delivery Team" role) can open My Performance.
-- Adds one permission; nothing is removed. An admin can still turn it off in
-- Access Control. Safe to run twice.
UPDATE "roles"
SET "permissions" = array_append("permissions", 'my_performance'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE lower(btrim("name")) = 'delivery team'
  AND NOT ('my_performance' = ANY("permissions"));
