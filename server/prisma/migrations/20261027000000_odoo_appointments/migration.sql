ALTER TABLE "orders"
  ADD COLUMN "appointment_request_ref" VARCHAR(100),
  ADD COLUMN "requested_appointment_date" VARCHAR(10),
  ADD COLUMN "requested_appointment_session" VARCHAR(20),
  ADD COLUMN "appointment_requirements" JSONB,
  ADD COLUMN "delivery_document_requirement" VARCHAR(30),
  ADD COLUMN "appointment_status" VARCHAR(20),
  ADD COLUMN "appointment_message" TEXT,
  ADD COLUMN "appointment_confirmed_at" TIMESTAMP(6);
