-- One truckless row per date and window, so overlapping generator runs cannot
-- duplicate it. Rows with a truck are not limited: a window can hold one per truck.
CREATE UNIQUE INDEX "time_slots_unassigned_date_window_key"
  ON "time_slots" ("date", "time_window_start")
  WHERE "truck_id" IS NULL;
