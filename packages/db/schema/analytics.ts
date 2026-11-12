import { sql } from "drizzle-orm"
import {
  boolean,
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
import { clients, visits } from "./loyalty"
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
    /** "file" (upload) or "pos" (connector: one row per synced month). */
    source: text("source").default("file").notNull(),
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
  (table) => [
    index("sales_imports_tenant_created_idx").on(table.tenantId, table.createdAt),
    // One "Odoo · YYYY-MM" row per tenant even when two sync runs race for the month.
    uniqueIndex("sales_imports_pos_month_idx")
      .on(table.tenantId, table.fileName)
      .where(sql`${table.source} = 'pos'`),
  ],
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
    /** "file" or "pos" (see salesImports.source). */
    source: text("source").default("file").notNull(),
    /** The POS's own order id (Odoo pos.order.id) for synced rows. */
    posOrderId: integer("pos_order_id"),
    /** Instant of sale (UTC) for synced rows; `soldOn` is its tenant-local day. */
    soldAt: timestamp("sold_at"),
    /** The Cuik client with this DNI at sync time, if any. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** The visit registered the same day at the same store, if any (one per visit). */
    visitId: uuid("visit_id").references(() => visits.id, { onDelete: "set null" }),
    /** How the visit was linked: "dni" | "inferred_amount" | "inferred_time" | "manual"; null = no visit. */
    linkKind: text("link_kind"),
  },
  (table) => [
    index("sales_tenant_dni_day_idx").on(table.tenantId, table.dni, table.soldOn),
    index("sales_tenant_day_idx").on(table.tenantId, table.soldOn),
    uniqueIndex("sales_tenant_order_idx").on(table.tenantId, table.orderRef),
    uniqueIndex("sales_tenant_pos_order_idx")
      .on(table.tenantId, table.posOrderId)
      .where(sql`${table.posOrderId} IS NOT NULL`),
    index("sales_tenant_client_day_idx").on(table.tenantId, table.clientId, table.soldOn),
    uniqueIndex("sales_visit_idx").on(table.visitId).where(sql`${table.visitId} IS NOT NULL`),
  ],
)

/** One line (product) of a synced order. */
export const saleLines = analyticsSchema.table(
  "sale_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    posLineId: integer("pos_line_id").notNull(),
    /** Normalised SKU (the POS's internal reference), joined with `products`. */
    sku: text("sku"),
    productName: text("product_name"),
    /** The POS's own category path ("Alimento / Perro"), as a fallback for the master. */
    odooCategory: text("odoo_category"),
    qty: numeric("qty", { precision: 12, scale: 3 }).default("0").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).default("0").notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).default("0").notNull(),
    /** Line total with taxes, after discount. */
    total: numeric("total", { precision: 12, scale: 2 }).default("0").notNull(),
    /** Cuik classification ("gato:alimento_humedo"): the master first, else the Odoo path. */
    categoryKey: text("category_key"),
    /** The master's brand, else the one in parentheses in the product name. */
    brand: text("brand"),
  },
  (table) => [
    uniqueIndex("sale_lines_sale_line_idx").on(table.saleId, table.posLineId),
    index("sale_lines_tenant_sku_idx").on(table.tenantId, table.sku),
    index("sale_lines_tenant_category_idx").on(table.tenantId, table.categoryKey),
    index("sale_lines_tenant_brand_idx").on(table.tenantId, table.brand),
  ],
)

/**
 * The merchant's product master (SKU -> category, class, subclass), loaded
 * from a file in the super-admin; `odooCategory` is what the POS says and is
 * filled by the sync for SKUs the master does not have yet.
 */
export const products = analyticsSchema.table(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sku: text("sku").notNull(),
    name: text("name"),
    category: text("category"),
    class: text("class"),
    subclass: text("subclass"),
    odooCategory: text("odoo_category"),
    /** From the master; wins over the brand parsed from the product name. */
    brand: text("brand"),
    /** "7 kg", "lata 100 g". */
    packSize: text("pack_size"),
    /** Days the product usually lasts (expected repurchase). */
    durationDays: integer("duration_days"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("products_tenant_sku_idx").on(table.tenantId, table.sku)],
)

/**
 * The tenant's POS connection (one per tenant). The API key is stored
 * encrypted (apps/web/lib/encryption.ts); `cursor` is where the incremental
 * pull resumes ({ writeDate, id }).
 */
export const posConnections = analyticsSchema.table("pos_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id),
  provider: text("provider").default("odoo").notNull(),
  baseUrl: text("base_url").notNull(),
  database: text("database").notNull(),
  login: text("login").notNull(),
  apiKeyEnc: text("api_key_enc"),
  /** First day to pull (backfill start). */
  startDate: date("start_date").notNull(),
  enabled: boolean("enabled").default(false).notNull(),
  cursor: jsonb("cursor"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncOrders: integer("last_sync_orders"),
  lastError: text("last_error"),
  /** Corte options for a tenant that only uses the API (no file to inherit them from). */
  retentionDays: integer("retention_days").default(90).notNull(),
  excludedDnis: jsonb("excluded_dnis"),
  /** Pair guest sales with the visit of the same store minutes later. */
  inferLinks: boolean("infer_links").default(true).notNull(),
  /** How many minutes after the sale a visit may still be its stamp. */
  inferWindowMinutes: integer("infer_window_minutes").default(20).notNull(),
  /** Per-tenant lock: set by a run, cleared when it ends; a stale one (30 min) is taken over. */
  syncStartedAt: timestamp("sync_started_at"),
  createdBy: text("created_by").references(() => authUsers.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

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
