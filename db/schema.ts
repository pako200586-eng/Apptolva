import { jsonb, pgTable, text, timestamp, varchar, serial } from "drizzle-orm/pg-core";
export const bitacoraReports = pgTable("bitacora_reports", {
  id: varchar("id", { length: 32 }).primaryKey(),
  folio: text("folio").notNull(),
  reportType: text("report_type").notNull().default("bitacora"),
  unitId: text("unit_id").notNull(),
  driverName: text("driver_name").notNull(),
  license: text("license").notNull().default(""),
  priority: text("priority").notNull().default("media"),
  syncStatus: text("sync_status").notNull().default("sincronizado"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ordenesTrabajo = pgTable('ordenes_trabajo', {
  id: text('id').primaryKey(),
  folio_ot: serial('folio_ot'),
  reporte_id: text('reporte_id'),
  unidad: text('unidad'),
  operador: text('operador'),
  componente: text('componente'),
  sistema: text('sistema'),
  descripcion_falla: text('descripcion_falla'),
  recurrencia: serial('recurrencia'),
  payload: jsonb('payload'),
  estatus: text('estatus').default('NUEVA'),
  fecha_apertura: timestamp('fecha_apertura', { withTimezone: true }).defaultNow(),
});

export const otSeguimiento = pgTable('ot_seguimiento', {
  id: text('id').primaryKey(),
  ot_id: text('ot_id'),
  accion: text('accion'),
  usuario: text('usuario'),
  comentario: text('comentario'),
  fecha: timestamp('fecha', { withTimezone: true }).defaultNow(),
});
