ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "electromecanico" text;--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "proveedor_externo" text;--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "supervisor_mantenimiento" text;--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "fecha_realizacion" text;--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "kilometraje" text;--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "comentarios_ejecutor" text;--> statement-breakpoint
ALTER TABLE "ordenes_trabajo" ADD COLUMN IF NOT EXISTS "comentarios_operador" text;