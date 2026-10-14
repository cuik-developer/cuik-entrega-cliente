import {
  boolean,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { tenants } from "./public"

/**
 * Finance (super-admin only): Cuik's own money, not the merchants'. Costs,
 * other incomes, the partner's loan and contributions, and the monthly USD
 * rate used to express everything in soles. Merchant invoices stay in
 * `tenant_invoices` and are read into the ledger from there. Migration 0028.
 */
const financeSchema = pgSchema("finance")

/** One USD→PEN rate per month, typed by hand ("YYYY-MM"). Missing months reuse the latest earlier one. */
export const fxRates = financeSchema.table("fx_rates", {
  month: text("month").primaryKey(),
  usdPen: numeric("usd_pen", { precision: 10, scale: 4 }).notNull(),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

/**
 * Something that repeats: a fixed cost (server, Apple Developer, a salary) or
 * a recurring income outside merchant invoices. `everyMonths` is how often it
 * is paid (1, 3, 6, 12); `recognition` says whether the finance views spread
 * the amount over those months or count it all in the month it is paid.
 */
export const recurringItems = financeSchema.table(
  "recurring_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<"cost" | "income">().notNull(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").$type<"PEN" | "USD">().default("PEN").notNull(),
    everyMonths: integer("every_months").default(1).notNull(),
    /** "YYYY-MM" first month it applies. */
    fromMonth: text("from_month").notNull(),
    /** "YYYY-MM" last month it applies, null = open-ended. */
    toMonth: text("to_month"),
    recognition: text("recognition").$type<"spread" | "cash">().default("spread").notNull(),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("finance_recurring_type_idx").on(table.type, table.active)],
)

/**
 * One-off movements in a given month: a variable cost, an income outside
 * invoices, a partner contribution (money put into Cuik) or a return (money
 * paid back to the partner). `months` > 1 lets a prepaid cost or income be
 * spread forward when `recognition` is "spread".
 */
export const financeEntries = financeSchema.table(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").$type<"cost" | "income" | "contribution" | "return">().notNull(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").$type<"PEN" | "USD">().default("PEN").notNull(),
    /** "YYYY-MM" the money moved. */
    month: text("month").notNull(),
    months: integer("months").default(1).notNull(),
    recognition: text("recognition").$type<"spread" | "cash">().default("spread").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("finance_entries_month_idx").on(table.month, table.type)],
)

/**
 * A loan taken for Cuik, paid in equal monthly installments from
 * `firstMonth`. The ledger counts each installment as a cash outflow and
 * shows the remaining balance.
 */
export const loans = financeSchema.table("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  principal: numeric("principal", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").$type<"PEN" | "USD">().default("PEN").notNull(),
  installment: numeric("installment", { precision: 12, scale: 2 }).notNull(),
  installments: integer("installments").notNull(),
  /** "YYYY-MM" of the first installment. */
  firstMonth: text("first_month").notNull(),
  notes: text("notes"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
