CREATE TABLE IF NOT EXISTS "bitacora_reports" (
  "id" varchar(32) PRIMARY KEY NOT NULL,
  "folio" text NOT NULL,
  "report_type" text DEFAULT 'bitacora' NOT NULL,
  "unit_id" text NOT NULL,
  "driver_name" text NOT NULL,
  "license" text DEFAULT '' NOT NULL,
  "priority" text DEFAULT 'media' NOT NULL,
  "sync_status" text DEFAULT 'sincronizado' NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "bitacora_reports_created_at_idx" ON "bitacora_reports" ("created_at");
CREATE INDEX IF NOT EXISTS "bitacora_reports_unit_id_idx" ON "bitacora_reports" ("unit_id");
CREATE INDEX IF NOT EXISTS "bitacora_reports_driver_name_idx" ON "bitacora_reports" ("driver_name");
CREATE INDEX IF NOT EXISTS "bitacora_reports_report_type_idx" ON "bitacora_reports" ("report_type");
