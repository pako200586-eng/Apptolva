CREATE TABLE "ordenes_trabajo" (
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
CREATE TABLE "ot_seguimiento" (
	"id" text PRIMARY KEY,
	"ot_id" text,
	"accion" text,
	"usuario" text,
	"comentario" text,
	"fecha" timestamp with time zone DEFAULT now()
);
