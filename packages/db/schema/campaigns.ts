import { sql } from "drizzle-orm"
import { index, integer, jsonb, pgEnum, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { authUsers } from "./auth"
import { clients } from "./loyalty"
import { tenants } from "./public"

const campaignsSchema = pgSchema("campaigns")

// --- Enums ---

export const campaignTypeEnum = pgEnum("campaign_type", ["push", "wallet_update", "email"])

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
])

export const notificationChannelEnum = pgEnum("notification_channel", ["wallet_push", "email"])

export const notificationStatusEnum = pgEnum("notification_status", ["sent", "delivered", "failed"])

// --- Tables ---

export const campaigns = campaignsSchema.table(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    type: campaignTypeEnum("type").notNull(),
    message: text("message"),
    content: jsonb("content"),
    scheduledAt: timestamp("scheduled_at"),
    sentAt: timestamp("sent_at"),
    status: campaignStatusEnum("status").default("draft").notNull(),
    createdBy: text("created_by").references(() => authUsers.id),
    targetCount: integer("target_count").default(0).notNull(),
    sentCount: integer("sent_count").default(0).notNull(),
    deliveredCount: integer("delivered_count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("campaigns_tenant_status_idx").on(table.tenantId, table.status),
    index("campaigns_tenant_scheduled_idx")
      .on(table.tenantId, table.scheduledAt)
      .where(sql`status = 'scheduled'`),
  ],
)

export const campaignSegments = campaignsSchema.table("campaign_segments", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  segmentName: text("segment_name"),
  filter: jsonb("filter"),
})

export const notifications = campaignsSchema.table(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    channel: notificationChannelEnum("channel").notNull(),
    status: notificationStatusEnum("status").notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at"),
  },
  (table) => [
    index("notifications_campaign_status_idx").on(table.campaignId, table.status),
    index("notifications_client_sent_idx").on(table.clientId, table.sentAt),
  ],
)
