import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { authUsers } from "./auth"
import { tenants } from "./public"

const analyticsSchema = pgSchema("analytics")

// --- Tables ---

export const visitsDaily = analyticsSchema.table(
  "visits_daily",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    date: date("date").notNull(),
    locationId: uuid("location_id").notNull(),
    totalVisits: integer("total_visits").default(0).notNull(),
    uniqueClients: integer("unique_clients").default(0).notNull(),
    newClients: integer("new_clients").default(0).notNull(),
    rewardsRedeemed: integer("rewards_redeemed").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.date, table.locationId],
    }),
  ],
)

export const retentionCohorts = analyticsSchema.table(
  "retention_cohorts",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cohortMonth: date("cohort_month").notNull(),
    monthOffset: integer("month_offset").notNull(),
    clientsCount: integer("clients_count").default(0).notNull(),
    retentionPct: numeric("retention_pct", { precision: 5, scale: 2 }),
  },
  (table) => [
    primaryKey({
      columns: [table.tenantId, table.cohortMonth, table.monthOffset],
    }),
  ],
)

export const events = analyticsSchema.table("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// --- Impacto: the merchant's own sales crossed with Cuik ---

/**
 * One upload of a merchant's sales file (Odoo POS lines, a generic
 * DNI·fecha·monto sheet…). Keeps the file (MinIO key), the column mapping
 * used and the DNIs excluded (staff), so the next month starts from the same
 * settings. Loading a period again replaces its sales rows.
 */
export const salesImports = analyticsSchema.table(
  "sales_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fileName: text("file_name").notNull(),
    /** MinIO key of the uploaded file (null when the file could not be kept). */
    fileKey: text("file_key"),
    /** "mapping" (uploaded, columns not confirmed), "processing", "ready", "failed". */
    status: text("status").default("mapping").notNull(),
    error: text("error"),
    /** Column mapping used (field -> column index), plus options such as the retention window. */
    mapping: jsonb("mapping"),
    /** DNIs left out of every metric (staff accounts used at the till). */
    excludedDnis: jsonb("excluded_dnis"),
    periodFrom: date("period_from"),
    periodTo: date("period_to"),
    rowsTotal: integer("rows_total").default(0).notNull(),
    ordersTotal: integer("orders_total").default(0).notNull(),
    ordersWithDni: integer("orders_with_dni").default(0).notNull(),
    createdBy: text("created_by").references(() => authUsers.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
  },
  (table) => [index("sales_imports_tenant_created_idx").on(table.tenantId, table.createdAt)],
)

/** One purchase of the merchant (order lines already added up), as imported. */
export const sales = analyticsSchema.table(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => salesImports.id, { onDelete: "cascade" }),
    /** The POS order reference, when the file has one. */
    orderRef: text("order_ref"),
    /** Digits only; null when the row had no usable identity document. */
    dni: text("dni"),
    customerName: text("customer_name"),
    phone: text("phone"),
    store: text("store"),
    cashier: text("cashier"),
    soldOn: date("sold_on").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).default("0").notNull(),
  },
  (table) => [
    index("sales_tenant_dni_day_idx").on(table.tenantId, table.dni, table.soldOn),
    index("sales_tenant_day_idx").on(table.tenantId, table.soldOn),
    uniqueIndex("sales_tenant_order_idx").on(table.tenantId, table.orderRef),
  ],
)

/**
 * One "corte": the metrics computed from an import, kept as a snapshot so
 * the screen, the Excel and the month-to-month comparison read the same
 * numbers. `phaseId` is the program phase in force when it was computed.
 */
export const impactReports = analyticsSchema.table(
  "impact_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => salesImports.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id"),
    periodFrom: date("period_from").notNull(),
    periodTo: date("period_to").notNull(),
    /** The whole ImpactSummary (see apps/web/lib/loyalty/impact). */
    summary: jsonb("summary").notNull(),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => [index("impact_reports_tenant_period_idx").on(table.tenantId, table.periodTo)],
)
