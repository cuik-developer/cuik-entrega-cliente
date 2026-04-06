import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const globalConfig = pgTable("global_config", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})
