import { sql } from "drizzle-orm"
import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sales } from "./analytics"
import { authUsers } from "./auth"
import { clients } from "./loyalty"
import { tenants } from "./public"

/**
 * Cuik Growth (docs/GROWTH_PRODUCTO.md): per-tenant rules, nightly client
 * stats and audiences, guided WhatsApp sends with per-client follow-up,
 * attributed POS sales (a link to the real sale, never a copy) and the "No
 * contactar" list. Mirrors migrations/0044_growth.sql.
 */

const growthSchema = pgSchema("growth")

/** Parameters and terms Cuik sets per tenant (the merchant reads them, never edits). */
export const growthTenantRules = growthSchema.table("tenant_rules", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  /** Days before a contacted client may be suggested again. */
  cooldownDays: integer("cooldown_days").default(14).notNull(),
  /** Max days a send may be suggested before the expected purchase day. */
  maxEarlyDays: integer("max_early_days").default(7).notNull(),
  /** Purchases needed to use the client's own interval. */
  minPurchases: integer("min_purchases").default(3).notNull(),
  /** "En riesgo" = more than riskFactor × interval without buying. */
  riskFactor: numeric("risk_factor", { precision: 4, scale: 2 }).default("1.5").notNull(),
  /** Attribution window from the "Enviado" check. */
  attributionDays: integer("attribution_days").default(10).notNull(),
  controlPct: integer("control_pct").default(10).notNull(),
  /** Below this many control clients the result is "orientativo". */
  minControl: integer("min_control").default(30).notNull(),
  feeFixed: numeric("fee_fixed", { precision: 12, scale: 2 }).default("199").notNull(),
  /** % over attributed sales; null = no variable fee. */
  feeVariablePct: numeric("fee_variable_pct", { precision: 5, scale: 2 }),
  pilotMonths: integer("pilot_months").default(2).notNull(),
  startsOn: date("starts_on"),
  /** Audience slugs switched off for this tenant. */
  audiencesOff: jsonb("audiences_off").default(sql`'[]'::jsonb`).notNull(),
  updatedBy: text("updated_by").references(() => authUsers.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

/** Rhythm and preferences of each client with POS purchases (nightly). */
export const growthClientStats = growthSchema.table(
  "client_stats",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Distinct purchase days, whole history. */
    purchases: integer("purchases").default(0).notNull(),
    purchases12m: integer("purchases_12m").default(0).notNull(),
    spend12m: numeric("spend_12m", { precision: 12, scale: 2 }).default("0").notNull(),
    firstPurchaseOn: date("first_purchase_on"),
    lastPurchaseOn: date("last_purchase_on"),
    lastStore: text("last_store"),
    /** Median of the client's latest intervals. */
    intervalDays: numeric("interval_days", { precision: 6, scale: 1 }),
    /** "own" | "category" | "tenant". */
    intervalSource: text("interval_source"),
    /** 0 = Sunday … 6 = Saturday (tenant-local); null = no clear day. */
    habitualWeekday: smallint("habitual_weekday"),
    expectedOn: date("expected_on"),
    suggestedOn: date("suggested_on"),
    /** "perro" | "gato" by what they buy. */
    species: text("species"),
    /** Category key with the most spend ("gato:alimento_humedo"). */
    mainCategory: text("main_category"),
    mainProductSku: text("main_product_sku"),
    mainProductName: text("main_product_name"),
    mainBrand: text("main_brand"),
    stores12m: integer("stores_12m").default(0).notNull(),
    /** { key: { orders, spend, lastOn } } for the last 12 months. */
    categories: jsonb("categories").default(sql`'{}'::jsonb`).notNull(),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.clientId] }),
    index("client_stats_tenant_expected_idx").on(table.tenantId, table.expectedOn),
  ],
)

/** Who is in each audience and from which day they may be suggested (nightly). */
export const growthAudienceMembers = growthSchema.table(
  "audience_members",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Audience slug ("recompra", "en_riesgo", "gato_sin_arena", …). */
    audience: text("audience").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Day from which the client is due; null = any day. */
    readyOn: date("ready_on"),
    /** { product, brand, missing, … } for the message. */
    detail: jsonb("detail"),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.audience, table.clientId] }),
    index("audience_members_tenant_audience_ready_idx").on(
      table.tenantId,
      table.audience,
      table.readyOn,
    ),
  ],
)

/** One send: a frozen snapshot of an audience + template + channel. */
export const growthSends = growthSchema.table(
  "sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    audience: text("audience").notNull(),
    /** "En riesgo · 12 nov". */
    name: text("name").notNull(),
    templateKey: text("template_key").notNull(),
    /** Template with variables, as used. */
    templateText: text("template_text").notNull(),
    /** "whatsapp" (one by one from Cuik) | "export" (list for a bulk tool). */
    channel: text("channel").default("whatsapp").notNull(),
    /** {cajero}: who writes. */
    senderName: text("sender_name"),
    /** Clients in the snapshot, control included. */
    snapshotTotal: integer("snapshot_total").default(0).notNull(),
    controlPct: integer("control_pct").default(10).notNull(),
    /** Copied from the rules at creation; never changes afterwards. */
    attributionDays: integer("attribution_days").default(10).notNull(),
    /** "open" | "closed". */
    status: text("status").default("open").notNull(),
    createdBy: text("created_by").references(() => authUsers.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
  },
  (table) => [index("sends_tenant_created_idx").on(table.tenantId, table.createdAt)],
)

/** One row per client of a send, with its status and the exact text. */
export const growthSendRecipients = growthSchema.table(
  "send_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sendId: uuid("send_id")
      .notNull()
      .references(() => growthSends.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Suggested order. */
    position: integer("position").notNull(),
    /** "pending" | "opened" | "sent" | "replied" | "skipped" | "control" | "blocked". */
    status: text("status").default("pending").notNull(),
    /** Resolved message (what was sent). */
    messageText: text("message_text"),
    openedAt: timestamp("opened_at"),
    /** The "Enviado" check: starts attribution and cooldown. */
    sentAt: timestamp("sent_at"),
    sentBy: text("sent_by").references(() => authUsers.id),
    repliedAt: timestamp("replied_at"),
  },
  (table) => [
    unique("send_recipients_send_id_client_id_key").on(table.sendId, table.clientId),
    index("send_recipients_tenant_client_sent_idx").on(
      table.tenantId,
      table.clientId,
      table.sentAt,
    ),
    index("send_recipients_send_status_idx").on(table.sendId, table.status),
  ],
)

/** A real POS sale attributed to a send (one sale, one send; never a copy of the sale). */
export const growthAttributedSales = growthSchema.table(
  "attributed_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => growthSendRecipients.id, { onDelete: "cascade" }),
    sendId: uuid("send_id")
      .notNull()
      .references(() => growthSends.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id")
      .notNull()
      .unique()
      .references(() => sales.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    /** Tenant-local day of the sale (base of the monthly close). */
    soldOn: date("sold_on").notNull(),
    daysAfter: integer("days_after").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("attributed_sales_tenant_sold_idx").on(table.tenantId, table.soldOn),
    index("attributed_sales_send_idx").on(table.sendId),
  ],
)

/** "No contactar": pet died, asked not to receive, wrong number, other. Reversible. */
export const growthContactBlocks = growthSchema.table(
  "contact_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** "pet_died" | "asked_no_contact" | "wrong_number" | "other". */
    reason: text("reason").notNull(),
    note: text("note"),
    createdBy: text("created_by").references(() => authUsers.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    liftedBy: text("lifted_by").references(() => authUsers.id),
    liftedAt: timestamp("lifted_at"),
  },
  (table) => [
    // One active block per client.
    uniqueIndex("contact_blocks_active_client_idx")
      .on(table.clientId)
      .where(sql`${table.liftedAt} IS NULL`),
    index("contact_blocks_tenant_idx").on(table.tenantId, table.liftedAt),
  ],
)
