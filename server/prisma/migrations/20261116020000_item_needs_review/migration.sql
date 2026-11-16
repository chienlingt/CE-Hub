-- Items discovered on order lines start at 0 points and are flagged for admin review.
ALTER TABLE "item_point_rates" ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false;
