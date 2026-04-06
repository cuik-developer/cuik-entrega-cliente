import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { authUsers } from "./auth"
import { tenants } from "./public"

const loyaltySchema = pgSchema("loyalty")

// --- Enums ---

export const clientStatusEnum = pgEnum("client_status", ["active", "inactive", "blocked"])

export const rewardStatusEnum = pgEnum("reward_status", ["pending", "redeemed", "expired"])

export const visitSourceEnum = pgEnum("visit_source", ["qr", "manual", "bonus"])

export const promoTypeEnum = pgEnum("promo_type", [
  "stamps",
  "discount",
  "coupon",
  "subscription",
  "points",
])

export const pointsTransactionTypeEnum = pgEnum("points_tx_type", [
  "earn",
  "redeem",
  "expire",
  "adjust",
])

// --- Tables ---

export const clients = loyaltySchema.table(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    lastName: text("last_name"),
    dni: text("dni"),
    phone: text("phone"),
    email: text("email"),
    qrCode: text("qr_code"),
    status: clientStatusEnum("status").default("active").notNull(),
    totalVisits: integer("total_visits").default(0).notNull(),
    currentCycle: integer("current_cycle").default(1).notNull(),
    tier: text("tier"),
    pointsBalance: integer("points_balance").default(0).notNull(),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    birthday: date("birthday"),
    customData: jsonb("custom_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("clients_qr_code_tenant_idx").on(table.qrCode, table.tenantId),
    uniqueIndex("clients_email_tenant_idx").on(table.email, table.tenantId),
    index("clients_tenant_status_idx").on(table.tenantId, table.status),
    index("clients_tenant_tier_idx").on(table.tenantId, table.tier),
    index("clients_points_balance_idx").on(table.tenantId, table.pointsBalance),
    index("clients_tenant_birthday_idx").on(table.tenantId, table.birthday),
  ],
)

export const visits = loyaltySchema.table(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    visitNum: integer("visit_num").notNull(),
    cycleNumber: integer("cycle_number").notNull(),
    points: integer("points").default(0),
    source: visitSourceEnum("source").default("qr").notNull(),
    registeredBy: text("registered_by").references(() => authUsers.id),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    locationId: uuid("location_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("visits_client_cycle_idx").on(table.clientId, table.cycleNumber),
    index("visits_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
)

export const rewards = loyaltySchema.table(
  "rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    cycleNumber: integer("cycle_number").notNull(),
    rewardType: text("reward_type"),
    status: rewardStatusEnum("status").default("pending").notNull(),
    redeemedAt: timestamp("redeemed_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rewards_client_status_pending_idx")
      .on(table.clientId, table.status)
      .where(sql`status = 'pending'`),
  ],
)

export const locations = loyaltySchema.table("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  address: text("address"),
  lat: numeric("lat", { precision: 10, scale: 7 }),
  lng: numeric("lng", { precision: 10, scale: 7 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const promotions = loyaltySchema.table("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  type: promoTypeEnum("type").notNull(),
  config: jsonb("config"),
  maxVisits: integer("max_visits"),
  rewardValue: text("reward_value"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// --- CRM Tables ---

export const clientNotes = loyaltySchema.table(
  "client_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    content: text("content").notNull(),
    createdBy: text("created_by").references(() => authUsers.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("client_notes_client_tenant_idx").on(table.clientId, table.tenantId)],
)

export const clientTags = loyaltySchema.table(
  "client_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    color: text("color").default("#6b7280"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("client_tags_tenant_name_idx").on(table.tenantId, table.name)],
)

export const clientTagAssignments = loyaltySchema.table(
  "client_tag_assignments",
  {
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => clientTags.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.clientId, table.tagId] }),
    index("client_tag_assignments_tag_id_idx").on(table.tagId),
  ],
)

// --- Points / Catalog Tables ---

export const rewardCatalog = loyaltySchema.table(
  "reward_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    pointsCost: integer("points_cost").notNull(),
    category: text("category"),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("reward_catalog_tenant_active_idx").on(table.tenantId, table.active)],
)

export const pointsTransactions = loyaltySchema.table(
  "points_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    amount: integer("amount").notNull(),
    type: pointsTransactionTypeEnum("type").notNull(),
    visitId: uuid("visit_id").references(() => visits.id),
    catalogItemId: uuid("catalog_item_id").references(() => rewardCatalog.id),
    description: text("description"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("points_tx_client_created_idx").on(table.clientId, table.createdAt),
    index("points_tx_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("points_tx_client_type_idx").on(table.clientId, table.type),
  ],
)
