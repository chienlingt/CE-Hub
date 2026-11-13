CREATE TABLE "route_geocode_cache" (
  "address_key" VARCHAR(64) NOT NULL PRIMARY KEY,
  "address" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "expires_at" TIMESTAMP(3),
  "next_retry_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "route_geocode_cache_next_retry_at_idx" ON "route_geocode_cache"("next_retry_at");
