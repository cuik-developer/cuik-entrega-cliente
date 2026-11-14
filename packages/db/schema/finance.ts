import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
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

/**
 * A legal entity that issues Cuik's invoices, with its validity in months
 * ("YYYY-MM"; from null = no start, to null = current). Making Brands until
 * 2026-10, CUIK E.I.R.L. from 2026-11. Migration 0047.
 */
export const issuers = financeSchema.table("issuers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ruc: text("ruc").notNull().unique("issuers_ruc_key"),
  razonSocial: text("razon_social").notNull(),
  nombreComercial: text("nombre_comercial"),
  domicilioFiscal: text("domicilio_fiscal"),
  fromMonth: text("from_month"),
  toMonth: text("to_month"),
  notes: text("notes"),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export type TaxRegime = "rmt" | "rer" | "general"
/** Annual income-tax bracket over net income in UIT; `upToUit` null = no ceiling. */
export type AnnualBracket = { upToUit: number | null; rate: number }

/**
 * Tax regime and rates of an issuer from a month on (the one in force is the
 * latest `fromMonth` <= month). No rate lives in code; the accountant
 * validates them. Migration 0047.
 */
export const taxProfiles = financeSchema.table(
  "tax_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuerId: uuid("issuer_id")
      .notNull()
      .references(() => issuers.id, { onDelete: "cascade" }),
    fromMonth: text("from_month").notNull(),
    regime: text("regime").$type<TaxRegime>().notNull(),
    igvRate: numeric("igv_rate", { precision: 6, scale: 4 }).default("0.18").notNull(),
    /** Monthly advance (RMT / General) or final monthly quota (RER), over net income. */
    monthlyRate: numeric("monthly_rate", { precision: 6, scale: 4 }).notNull(),
    annualBrackets: jsonb("annual_brackets").$type<AnnualBracket[]>().default([]).notNull(),
    representationCapPct: numeric("representation_cap_pct", { precision: 6, scale: 4 })
      .default("0.005")
      .notNull(),
    representationCapUit: numeric("representation_cap_uit", { precision: 8, scale: 2 })
      .default("40")
      .notNull(),
    validatedByAccountant: boolean("validated_by_accountant").default(false).notNull(),
    validatedAt: timestamp("validated_at"),
    notes: text("notes"),
    updatedBy: text("updated_by").references(() => user.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("tax_profiles_issuer_id_from_month_key").on(t.issuerId, t.fromMonth)],
)

/** UIT (Unidad Impositiva Tributaria) of each year, typed by the owner or the accountant. Migration 0047. */
export const uitValues = financeSchema.table("uit_values", {
  year: integer("year").primaryKey(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export type IgvTreatment = "credito" | "sin_credito" | "representacion" | "no_domiciliado"
export type DocType = "01" | "03" | "07" | "08" | "02" | "12" | "14" | "91" | "00"

/**
 * Who Cuik buys from. `domiciled` false for foreign providers (Hetzner,
 * Apple, Google…), whose IGV goes through "utilización de servicios".
 * Migration 0048.
 */
export const suppliers = financeSchema.table("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  docType: text("doc_type").$type<"ruc" | "dni" | "foreign">().default("ruc").notNull(),
  docNumber: text("doc_number"),
  name: text("name").notNull(),
  country: text("country").default("PE").notNull(),
  domiciled: boolean("domiciled").default(true).notNull(),
  defaultCategory: text("default_category"),
  defaultIgvTreatment: text("default_igv_treatment").$type<IgvTreatment>(),
  notes: text("notes"),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

/**
 * One fiscal document, issued (sale) or received (purchase): invoice, boleta,
 * credit/debit note, recibo por honorarios, ticket, utility bill or foreign
 * invoice. Amounts in the document currency; `fxRate` (PEN per USD) only for
 * USD. A merchant invoice in `tenant_invoices` points here through
 * `document_id`. Migration 0048.
 */
export const documents = financeSchema.table(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    direction: text("direction").$type<"sale" | "purchase">().notNull(),
    issuerId: uuid("issuer_id")
      .notNull()
      .references(() => issuers.id),
    docType: text("doc_type").$type<DocType>().notNull(),
    serie: text("serie").notNull(),
    numero: text("numero").notNull(),
    issueDate: date("issue_date").notNull(),
    /** "YYYY-MM" the document counts in for IGV (purchases: may be after issue). */
    taxPeriod: text("tax_period").notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    counterpartyDoc: text("counterparty_doc"),
    counterpartyName: text("counterparty_name").notNull(),
    currency: text("currency").$type<"PEN" | "USD">().default("PEN").notNull(),
    fxRate: numeric("fx_rate", { precision: 10, scale: 4 }),
    baseGravada: numeric("base_gravada", { precision: 12, scale: 2 }).default("0").notNull(),
    baseNoGravada: numeric("base_no_gravada", { precision: 12, scale: 2 }).default("0").notNull(),
    igv: numeric("igv", { precision: 12, scale: 2 }).default("0").notNull(),
    total: numeric("total", { precision: 12, scale: 2 }).notNull(),
    igvTreatment: text("igv_treatment").$type<IgvTreatment>(),
    rentaDeductible: text("renta_deductible").$type<"si" | "no" | "limitado">(),
    category: text("category"),
    detraccionRate: numeric("detraccion_rate", { precision: 6, scale: 4 }),
    detraccionConstancia: text("detraccion_constancia"),
    relatedDocumentId: uuid("related_document_id"),
    status: text("status").$type<"registered" | "void">().default("registered").notNull(),
    paidOn: date("paid_on"),
    pdfKey: text("pdf_key"),
    pdfName: text("pdf_name"),
    xmlKey: text("xml_key"),
    xmlName: text("xml_name"),
    cdrKey: text("cdr_key"),
    cdrName: text("cdr_name"),
    entryId: uuid("entry_id").references(() => financeEntries.id, { onDelete: "set null" }),
    /** The fixed cost (Costos e ingresos) this purchase is the receipt of. Migration 0051. */
    recurringItemId: uuid("recurring_item_id").references(() => recurringItems.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedBy: text("updated_by").references(() => user.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("finance_documents_period_idx").on(t.direction, t.taxPeriod),
    index("finance_documents_tenant_idx").on(t.tenantId),
    // A number exists once, void or not (SUNAT never reuses it).
    uniqueIndex("finance_documents_sale_number_uidx")
      .on(t.issuerId, t.docType, t.serie, t.numero)
      .where(sql`direction = 'sale'`),
    uniqueIndex("finance_documents_purchase_number_uidx")
      .on(t.supplierId, t.docType, t.serie, t.numero)
      .where(sql`direction = 'purchase'`),
  ],
)

/** Codes of the accountant's monthly close (PDT 621 concepts), amounts in soles. */
export type DeclaredSummary = Partial<Record<string, number | string>>

/**
 * One tax month of an issuer: open or closed. A closed month locks its
 * documents and keeps what the panel computed and what the accountant
 * declared (the declared figures carry to the next month), the annual-tax
 * reserve actually moved to the bank and the filing receipt. Migration 0049.
 */
export const taxPeriods = financeSchema.table(
  "tax_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issuerId: uuid("issuer_id")
      .notNull()
      .references(() => issuers.id),
    month: text("month").notNull(),
    status: text("status").$type<"open" | "closed">().default("open").notNull(),
    dueDate: date("due_date"),
    reserveMovedOn: date("reserve_moved_on"),
    reserveAmount: numeric("reserve_amount", { precision: 12, scale: 2 }),
    panelSnapshot: jsonb("panel_snapshot").$type<Record<string, number>>(),
    declared: jsonb("declared").$type<DeclaredSummary>(),
    constanciaKey: text("constancia_key"),
    constanciaName: text("constancia_name"),
    notes: text("notes"),
    closedAt: timestamp("closed_at"),
    closedBy: text("closed_by").references(() => user.id),
    reopenedReason: text("reopened_reason"),
    updatedBy: text("updated_by").references(() => user.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("tax_periods_issuer_id_month_key").on(t.issuerId, t.month)],
)

/** One row of the accountant's registro de ventas / compras. */
export type AccountantLine = {
  book: "V" | "C"
  docType: string
  serie: string
  numero: string
  date: string | null
  counterpartyDoc: string | null
  counterpartyName: string | null
  currency: "PEN" | "USD"
  fxRate: number | null
  base: number
  igv: number
  noGravado: number
  total: number
  note: string | null
}

/** Each import of the accountant's close (the latest is in force). Migration 0049. */
export const accountantCloses = financeSchema.table(
  "accountant_closes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => taxPeriods.id, { onDelete: "cascade" }),
    fileKey: text("file_key"),
    fileName: text("file_name"),
    summary: jsonb("summary").$type<DeclaredSummary>().default({}).notNull(),
    lines: jsonb("lines").$type<AccountantLine[]>().default([]).notNull(),
    importedBy: text("imported_by").references(() => user.id),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (t) => [index("finance_accountant_closes_period_idx").on(t.periodId, t.importedAt.desc())],
)
