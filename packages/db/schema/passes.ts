import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { clients, promotions } from "./loyalty"
import { tenants } from "./public"

const passesSchema = pgSchema("passes")

// --- Enums ---

export const passTypeEnum = pgEnum("pass_type", ["apple_store", "google_loyalty"])

export const assetTypeEnum = pgEnum("asset_type", [
  "logo",
  "icon",
  "strip_bg",
  "stamp",
  "background",
])

// --- Tables ---

export const passDesigns = passesSchema.table(
  "pass_designs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    promotionId: uuid("promotion_id").references(() => promotions.id),
    name: text("name").notNull(),
    type: passTypeEnum("type").notNull(),
    canvasData: jsonb("canvas_data"),
    colors: jsonb("colors"),
    fields: jsonb("fields"),
    stampsConfig: jsonb("stamps_config"),
    isTemplate: boolean("is_template").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("pass_designs_promotion_idx").on(table.promotionId)],
)

export const passAssets = passesSchema.table("pass_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  designId: uuid("design_id")
    .notNull()
    .references(() => passDesigns.id),
  type: assetTypeEnum("type").notNull(),
  url: text("url").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const passInstances = passesSchema.table(
  "pass_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    designId: uuid("design_id")
      .notNull()
      .references(() => passDesigns.id),
    serialNumber: text("serial_number").unique().notNull(),
    applePassUrl: text("apple_pass_url"),
    googleSaveUrl: text("google_save_url"),
    authToken: text("auth_token"),
    etag: text("etag"),
    googleObjectId: text("google_object_id"),
    campaignMessage: text("campaign_message"),
    lastUpdatedAt: timestamp("last_updated_at"),
    deviceTokens: text("device_tokens").array(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("pass_instances_client_idx").on(table.clientId)],
)

export const appleDevices = passesSchema.table(
  "apple_devices",
  {
    deviceLibId: text("device_lib_id").notNull(),
    passTypeId: text("pass_type_id").notNull(),
    serialNumber: text("serial_number").notNull(),
    pushToken: text("push_token"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.deviceLibId, table.serialNumber] }),
    index("apple_devices_serial_idx").on(table.serialNumber),
  ],
)
