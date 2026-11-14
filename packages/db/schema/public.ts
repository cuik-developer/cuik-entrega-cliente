import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"

// --- Enums ---

export const tenantStatusEnum = pgEnum("tenant_status", [
  "pending",
  "trial",
  "active",
  "expired",
  "cancelled",
  "paused",
])

export const solicitudStatusEnum = pgEnum("solicitud_status", ["pending", "approved", "rejected"])

export const designChangeRequestTypeEnum = pgEnum("design_change_request_type", [
  "color",
  "texto",
  "imagen",
  "reglas",
  "otro",
])

export const designChangeRequestStatusEnum = pgEnum("design_change_request_status", [
  "pending",
  "in_progress",
  "done",
  "rejected",
])

// --- Tables ---

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  price: integer("price").notNull().default(0),
  maxLocations: integer("max_locations").notNull(),
  maxPromos: integer("max_promos").notNull(),
  maxClients: integer("max_clients").notNull(),
  features: jsonb("features"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  planId: uuid("plan_id").references(() => plans.id),
  status: tenantStatusEnum("status").default("pending").notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  activatedAt: timestamp("activated_at"),
  branding: jsonb("branding"),
  businessType: text("business_type"),
  address: text("address"),
  phone: text("phone"),
  contactEmail: text("contact_email"),
  registrationConfig: jsonb("registration_config"),
  walletConfig: jsonb("wallet_config"),
  segmentationConfig: jsonb("segmentation_config"),
  // Per-tenant automation settings (birthday greeting, ...). Shape: AutomationsConfig.
  automations: jsonb("automations"),
  // Features Cuik turns on per tenant (super-admin only). Shape: TenantFeatures.
  features: jsonb("features"),
  appleConfig: jsonb("apple_config"),
  timezone: text("timezone").default("America/Lima").notNull(),
  ownerId: text("owner_id").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const solicitudes = pgTable("solicitudes", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull(),
  businessType: text("business_type"),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  city: text("city"),
  status: solicitudStatusEnum("status").default("pending").notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  notes: text("notes"),
  // Who approved/rejected and when (audit + 30-day archiving of rejections).
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by").references(() => user.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

// Internal notes of the Cuik team about a tenant (calls, agreements, incidents).
// Not visible to the tenant. Optional follow-up date for reminders.
export const tenantNotes = pgTable(
  "tenant_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id),
    content: text("content").notNull(),
    followUpAt: timestamp("follow_up_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("tenant_notes_tenant_created_idx").on(table.tenantId, table.createdAt)],
)

// Billing of a tenant (super-admin only, migration 0025): fiscal data, exact
// monthly fee and billing day. One row per tenant.
export const tenantBilling = pgTable("tenant_billing", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  ruc: text("ruc"),
  razonSocial: text("razon_social"),
  direccionFiscal: text("direccion_fiscal"),
  billingEmail: text("billing_email"),
  contactoPagos: text("contacto_pagos"),
  monthlyAmount: numeric("monthly_amount", { precision: 12, scale: 2 }),
  currency: text("currency").$type<"PEN" | "USD">().default("PEN").notNull(),
  /** Day the service started with the merchant; billing periods run monthly from it. */
  serviceStartOn: date("service_start_on"),
  /** Optional override 1..28; null = day of serviceStartOn (capped at 28). */
  billingDay: integer("billing_day"),
  /** "advance": the month is invoiced at its start; "arrears": once it ended. */
  billingMode: text("billing_mode").$type<"advance" | "arrears">().default("arrears").notNull(),
  /** Months covered by each invoice: 1 (monthly), 3, 6 or 12. `monthly_amount` is the amount per invoice. */
  billingIntervalMonths: integer("billing_interval_months").default(1).notNull(),
  /** Whether `monthly_amount` already includes IGV (every current fee does). Migration 0047. */
  amountIncludesIgv: boolean("amount_includes_igv").default(true).notNull(),
  /** The merchant is an IGV withholding agent (keeps 3 % of invoices over S/ 700). Migration 0047. */
  isRetentionAgent: boolean("is_retention_agent").default(false).notNull(),
  /**
   * Who invoices this merchant when it is not the issuer of the month (e.g.
   * a contract signed with Making Brands). Null = the month's issuer. FK to
   * finance.issuers in migration 0050 (not declared here: circular import).
   */
  issuerId: uuid("issuer_id"),
  notes: text("notes"),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Invoices are issued outside Cuik and only recorded here (migration 0025).
export const tenantInvoices = pgTable(
  "tenant_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** "YYYY-MM": first month of service the invoice covers. */
    period: text("period").notNull(),
    /** Months of service covered from `period`: 1, 3, 6 or 12 (migration 0027). */
    months: integer("months").default(1).notNull(),
    /** "spread": the amount counts month by month over `months`; "cash": all in the month paid. */
    recognition: text("recognition").$type<"spread" | "cash">().default("spread").notNull(),
    issuedOn: date("issued_on").notNull(),
    number: text("number"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").$type<"PEN" | "USD">().default("PEN").notNull(),
    status: text("status").$type<"pending" | "paid" | "void">().default("pending").notNull(),
    paidOn: date("paid_on"),
    note: text("note"),
    /** Private storage keys (served through the super-admin files route only). */
    invoiceFileKey: text("invoice_file_key"),
    invoiceFileName: text("invoice_file_name"),
    receiptFileKey: text("receipt_file_key"),
    receiptFileName: text("receipt_file_name"),
    /**
     * Fiscal document of this invoice (finance.documents.id), from CUIK
     * E.I.R.L. on. FK lives in migration 0048 (not declared here to avoid a
     * circular import with the finance schema).
     */
    documentId: uuid("document_id"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tenant_invoices_tenant_issued_idx").on(table.tenantId, table.issuedOn),
    uniqueIndex("tenant_invoices_document_uidx")
      .on(table.documentId)
      .where(sql`document_id IS NOT NULL`),
    uniqueIndex("tenant_invoices_tenant_period_uidx")
      .on(table.tenantId, table.period)
      .where(sql`status <> 'void'`),
  ],
)

export const globalConfig = pgTable("global_config", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const designChangeRequests = pgTable("design_change_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  requestedByUserId: text("requested_by_user_id")
    .notNull()
    .references(() => user.id),
  type: designChangeRequestTypeEnum("type").default("otro").notNull(),
  message: text("message").notNull(),
  status: designChangeRequestStatusEnum("status").default("pending").notNull(),
  resolvedByUserId: text("resolved_by_user_id").references(() => user.id),
  resolvedAt: timestamp("resolved_at"),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export type ComplaintStatus = "pending" | "answered" | "closed"

/**
 * Libro de Reclamaciones (DS 011-2011-PCM): one row per Hoja de Reclamación
 * filed on the public site. `numero` is the correlative shown to the
 * consumer; `dueOn` is the legal answer deadline (15 business days in Lima,
 * see apps/web/lib/business-days.ts). Super-admin only. Migration 0030.
 */
export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    numero: text("numero").notNull().unique(),
    tipo: text("tipo").$type<"reclamo" | "queja">().notNull(),
    nombre: text("nombre").notNull(),
    documentoTipo: text("documento_tipo").notNull(),
    documento: text("documento").notNull(),
    domicilio: text("domicilio").notNull(),
    telefono: text("telefono").notNull(),
    email: text("email").notNull(),
    menor: boolean("menor").default(false).notNull(),
    apoderado: text("apoderado"),
    bienTipo: text("bien_tipo").$type<"producto" | "servicio">().notNull(),
    bienDescripcion: text("bien_descripcion").notNull(),
    monto: numeric("monto", { precision: 12, scale: 2 }),
    detalle: text("detalle").notNull(),
    pedido: text("pedido").notNull(),
    status: text("status").$type<ComplaintStatus>().default("pending").notNull(),
    dueOn: date("due_on").notNull(),
    answer: text("answer"),
    answeredAt: timestamp("answered_at"),
    answeredBy: text("answered_by").references(() => user.id, { onDelete: "set null" }),
    /** Outcome of the two filing emails (Cuik + consumer copy). */
    emailStatus: text("email_status").$type<"sent" | "failed" | "partial">(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("complaints_status_idx").on(table.status),
    index("complaints_created_idx").on(table.createdAt),
  ],
)

// Product change log (Producto › Historial, migration 0037): who changed which
// pass design or branding, and when. Append-only; names are snapshots so the
// entry survives a revoked member or a deleted design.
export const productChanges = pgTable(
  "product_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    tenantName: text("tenant_name"),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorName: text("actor_name"),
    area: text("area").notNull(), // "designs" | "branding"
    action: text("action").notNull(), // created | saved | published | duplicated | deleted
    targetId: text("target_id"),
    targetName: text("target_name"),
    detail: jsonb("detail"), // e.g. { version: 4, passesUpdated: 120 }
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("product_changes_created_idx").on(t.createdAt),
    index("product_changes_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
)
