-- AlterTable
ALTER TABLE "teams" ADD COLUMN "primary_driver_id" UUID;
ALTER TABLE "teams" ADD COLUMN "assistant_driver_id" UUID;
ALTER TABLE "teams" ADD COLUMN "truck_id" UUID;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "fk_team_primary_driver" FOREIGN KEY ("primary_driver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "teams" ADD CONSTRAINT "fk_team_assistant_driver" FOREIGN KEY ("assistant_driver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "teams" ADD CONSTRAINT "fk_team_truck" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
