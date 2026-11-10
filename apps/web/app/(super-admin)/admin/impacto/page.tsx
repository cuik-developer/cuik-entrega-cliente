import { asc, db, tenants } from "@cuik/db"
import { redirect } from "next/navigation"

import { currentAdminAccess } from "@/lib/admin-access"
import { ImpactClient } from "./impact-client"

export const dynamic = "force-dynamic"

/**
 * Loyalty › Operación › Impacto: the merchant's sales file crossed with Cuik,
 * one corte per month. Owner-only for now (client data of every tenant).
 */
export default async function ImpactoPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") redirect("/admin")

  const rows = await db
    .select({ id: tenants.id, name: tenants.name, status: tenants.status })
    .from(tenants)
    .orderBy(asc(tenants.name))
    .limit(500)

  return <ImpactClient tenants={rows} />
}
