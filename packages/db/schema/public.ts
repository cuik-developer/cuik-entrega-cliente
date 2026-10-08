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
    /** "YYYY-MM" of the due date the invoice covers. */
    period: text("period").notNull(),
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
    createdBy: text("created_by").references(() => user.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tenant_invoices_tenant_issued_idx").on(table.tenantId, table.issuedOn),
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
