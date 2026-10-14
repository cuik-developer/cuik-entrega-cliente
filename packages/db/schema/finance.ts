import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { plans, tenants } from "./public"

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

export type ProspectStage =
  | "lead"
  | "demo_scheduled"
  | "demo_done"
  | "proposal"
  | "negotiation"
  | "won"
  | "lost"
  | "standby"

/**
 * CRM: a merchant Cuik may sign. Carries the commercial terms it would be
 * billed under (plan, amount, periodicity, mode, expected start) so the
 * Tablero can project it weighted by `probability`. `tenantId` links the
 * tenant created for its demo or after winning it. Migration 0029.
 */
export const prospects = financeSchema.table(
  "prospects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    city: text("city"),
    /** Where it came from: referido, Instagram, visita en frío… */
    source: text("source"),
    stage: text("stage").$type<ProspectStage>().default("lead").notNull(),
    /** 0..100, chance of winning it; weights the projection. */
    probability: integer("probability").default(20).notNull(),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    /** Amount per invoice under the expected terms. */
    monthlyAmount: numeric("monthly_amount", { precision: 12, scale: 2 }),
    currency: text("currency").$type<"PEN" | "USD">().default("PEN").notNull(),
    intervalMonths: integer("interval_months").default(1).notNull(),
    billingMode: text("billing_mode").$type<"advance" | "arrears">().default("arrears").notNull(),
    /** First month it would be billed, "YYYY-MM". */
    expectedStartMonth: text("expected_start_month"),
    expectedCloseOn: date("expected_close_on"),
    demoStartOn: date("demo_start_on"),
    demoEndOn: date("demo_end_on"),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    nextStep: text("next_step"),
    nextStepOn: date("next_step_on"),
    lostReason: text("lost_reason"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("finance_prospects_stage_idx").on(t.stage)],
)
