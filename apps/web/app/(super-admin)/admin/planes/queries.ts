import { db, plans, sql, tenants } from "@cuik/db"

export type PlanWithTenantCount = {
  id: string
  name: string
  price: number
  maxLocations: number
  maxPromos: number
  maxClients: number
  features: Record<string, unknown> | null
  active: boolean
  createdAt: Date
  updatedAt: Date
  tenantCount: number
}

export async function getPlansWithTenantCount(): Promise<PlanWithTenantCount[]> {
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      price: plans.price,
      maxLocations: plans.maxLocations,
      maxPromos: plans.maxPromos,
      maxClients: plans.maxClients,
      features: plans.features,
      active: plans.active,
      createdAt: plans.createdAt,
      updatedAt: plans.updatedAt,
      tenantCount: sql<number>`cast(count(${tenants.id}) as integer)`,
    })
    .from(plans)
    .leftJoin(
      tenants,
      sql`${tenants.planId} = ${plans.id} AND ${tenants.status} IN ('trial', 'active')`,
    )
    .groupBy(plans.id)
    .orderBy(plans.createdAt)

  return rows as PlanWithTenantCount[]
}
