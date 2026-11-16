-- Admin now follows its saved permissions instead of always seeing everything.
-- So that nothing disappears for the admin today, save the sections it has been
-- seeing through the old "full access" shortcut (Orders, and editing the Schedule),
-- keep Access Control on, and drop My Performance, which is for crew members.
-- Safe to run twice.
UPDATE "roles"
SET "permissions" = ARRAY(
      SELECT DISTINCT p
      FROM unnest(array_cat("permissions", ARRAY['order', 'schedule_edit', 'access'])) AS p
      WHERE p <> 'my_performance'
    ),
    "updated_at" = CURRENT_TIMESTAMP
WHERE lower(btrim("name")) = 'admin';
