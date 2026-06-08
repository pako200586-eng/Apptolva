import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

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
