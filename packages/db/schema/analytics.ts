import {
  date,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
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
