CREATE TABLE IF NOT EXISTS "ordenes_trabajo" (
	"id" text PRIMARY KEY,
	"folio_ot" serial,
	"reporte_id" text,
	"unidad" text,
	"operador" text,
	"componente" text,
	"sistema" text,
	"descripcion_falla" text,
	"recurrencia" integer DEFAULT 1,
	"estatus" text DEFAULT 'NUEVA',
	"payload" jsonb,
	"fecha_apertura" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "folio_ot" serial;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "reporte_id" text;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "unidad" text;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "operador" text;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "componente" text;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "sistema" text;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "descripcion_falla" text;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "recurrencia" integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "estatus" text DEFAULT 'NUEVA';
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "payload" jsonb;
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "fecha_apertura" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ot_seguimiento" (
	"id" text PRIMARY KEY,
	"ot_id" text,
	"accion" text,
	"usuario" text,
	"comentario" text,
	"fecha" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ot_seguimiento" ADD COLUMN IF NOT EXISTS "ot_id" text;
--> statement-breakpoint
ALTER TABLE "ot_seguimiento" ADD COLUMN IF NOT EXISTS "accion" text;
--> statement-breakpoint
ALTER TABLE "ot_seguimiento" ADD COLUMN IF NOT EXISTS "usuario" text;
--> statement-breakpoint
ALTER TABLE "ot_seguimiento" ADD COLUMN IF NOT EXISTS "comentario" text;
--> statement-breakpoint
ALTER TABLE "ot_seguimiento" ADD COLUMN IF NOT EXISTS "fecha" timestamp with time zone DEFAULT now();
