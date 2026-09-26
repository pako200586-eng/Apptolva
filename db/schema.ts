import { integer, jsonb, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

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

export const ordenesTrabajo = pgTable("ordenes_trabajo", {
  id: text("id").primaryKey(),
  folioOt: serial("folio_ot"),
  reporteId: text("reporte_id"),
  unidad: text("unidad"),
  operador: text("operador"),
  componente: text("componente"),
  sistema: text("sistema"),
  descripcionFalla: text("descripcion_falla"),
  recurrencia: integer("recurrencia").default(1),
  estatus: text("estatus").default("NUEVA"),
  payload: jsonb("payload"),
  fechaApertura: timestamp("fecha_apertura", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const otSeguimiento = pgTable("ot_seguimiento", {
  id: text("id").primaryKey(),
  otId: text("ot_id"),
  accion: text("accion"),
  usuario: text("usuario"),
  comentario: text("comentario"),
  fecha: timestamp("fecha", { withTimezone: true }).defaultNow(),
});
