CREATE TABLE IF NOT EXISTS "bitacora_reports" (
	"id" varchar(32) PRIMARY KEY,
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
