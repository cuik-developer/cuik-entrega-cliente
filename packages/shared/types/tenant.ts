import type { plans, solicitudes, tenants } from "@cuik/db"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type Tenant = InferSelectModel<typeof tenants>
export type NewTenant = InferInsertModel<typeof tenants>

export type Plan = InferSelectModel<typeof plans>
export type NewPlan = InferInsertModel<typeof plans>

export type Solicitud = InferSelectModel<typeof solicitudes>
export type NewSolicitud = InferInsertModel<typeof solicitudes>
