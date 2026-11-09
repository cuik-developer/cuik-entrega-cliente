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

export const clientStatusEnum = pgEnum("client_status", [
  "active",
  "inactive",
  "blocked",
  /** Hidden everywhere; the QR no longer works; purged 30 days after archived_at. */
  "archived",
  /** Personal data wiped; the row stays so visits and points history keep adding up. */
  "deleted",
])

export const rewardStatusEnum = pgEnum("reward_status", [
  "pending",
  "redeemed",
  "expired",
  "voided",
])

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
    /** Stamps spent by early cash-outs; the card runs on totalVisits - stampsCashed. */
    stampsCashed: integer("stamps_cashed").default(0).notNull(),
    /** Cashback accumulated on the current card (cashback reward); back to 0 when it completes. */
    cashbackBalance: numeric("cashback_balance", { precision: 10, scale: 2 })
      .default("0")
      .notNull(),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    birthday: date("birthday"),
    /** Set when an admin archives the client; the purge cron anonymizes 30 days later. */
    archivedAt: timestamp("archived_at"),
    /** Set by the purge cron once the personal data was wiped (status = deleted). */
    anonymizedAt: timestamp("anonymized_at"),
    customData: jsonb("custom_data"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("clients_qr_code_tenant_idx").on(table.qrCode, table.tenantId),
    uniqueIndex("clients_email_tenant_idx").on(table.email, table.tenantId),
    index("clients_tenant_status_idx").on(table.tenantId, table.status),
    index("clients_tenant_tier_idx").on(table.tenantId, table.tier),
    index("clients_points_balance_idx").on(table.tenantId, table.pointsBalance),
    index("clients_archived_idx")
      .on(table.tenantId, table.archivedAt)
      .where(sql`status = 'archived'`),
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
    // Bonus the engine applied: "birthday" | "special_hour"; null = none.
    bonusKind: text("bonus_kind"),
    registeredBy: text("registered_by").references(() => authUsers.id),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    /** Share of `amount` this stamp kept as cashback; null when the reward is a gift. */
    cashbackAmount: numeric("cashback_amount", { precision: 10, scale: 2 }),
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
    /** "final" = full card; "milestone" = early cash-out at an intermediate stamp. */
    kind: text("kind").default("final").notNull(),
    /** Milestone position (e.g. 5) when kind = "milestone". */
    milestoneAt: integer("milestone_at"),
    /** Stamps the client had when cashing out early (e.g. 7). */
    stampsAtRedeem: integer("stamps_at_redeem"),
    /** Soles the till discounts when the reward is cashback (the card's accumulated amount). */
    cashbackAmount: numeric("cashback_amount", { precision: 10, scale: 2 }),
    /** Who redeemed it (user id); needed to allow undoing it. */
    redeemedBy: text("redeemed_by"),
    voidedAt: timestamp("voided_at"),
    status: rewardStatusEnum("status").default("pending").notNull(),
    redeemedAt: timestamp("redeemed_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("rewards_tenant_kind_idx").on(table.tenantId, table.kind, table.status),
    index("rewards_client_status_pending_idx")
      .on(table.clientId, table.status)
      .where(sql`status = 'pending'`),
  ],
)

/**
 * A stage of a tenant's program ("Cashback 5 %" from 2026-11-15): the marker
 * reports compare against, with a snapshot of the key numbers at its start.
 * Nothing before it is deleted or moved; a phase only says where the new
 * strategy began. Created by Cuik from the tenant page, or automatically when
 * the stamps reward switches to cashback.
 */
export const programPhases = loyaltySchema.table(
  "program_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    /** Local day ("YYYY-MM-DD") the stage starts. */
    startsOn: date("starts_on").notNull(),
    note: text("note"),
    /** Snapshot taken when the phase was created (clients, visits, cards, cashback…). */
    baseline: jsonb("baseline"),
    createdBy: text("created_by").references(() => authUsers.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("program_phases_tenant_starts_idx").on(table.tenantId, table.startsOn)],
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
    /** Earn lots only: points of this lot not yet redeemed or expired. */
    remaining: integer("remaining"),
    /** Earn lots only: local midnight after the last valid day. Null = never. */
    expiresAt: timestamp("expires_at"),
    /** Earn lots only: when the "about to expire" push went out for this lot. */
    warnedAt: timestamp("warned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("points_tx_client_created_idx").on(table.clientId, table.createdAt),
    index("points_tx_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("points_tx_client_type_idx").on(table.clientId, table.type),
    index("points_tx_open_lots_client_idx")
      .on(table.clientId, table.expiresAt, table.createdAt)
      .where(sql`type = 'earn' AND remaining > 0`),
    index("points_tx_open_lots_tenant_idx")
      .on(table.tenantId, table.expiresAt)
      .where(sql`type = 'earn' AND remaining > 0`),
  ],
)
