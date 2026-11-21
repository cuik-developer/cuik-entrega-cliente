import { asc, db, tenants } from "@cuik/db"
import { redirect } from "next/navigation"

import { currentAdminAccess } from "@/lib/admin-access"
import { LoyaltyImpactClient } from "./loyalty-impact-client"

export const dynamic = "force-dynamic"

/**
 * Loyalty › Análisis › Impacto Loyalty: what one tenant's program generated,
 * with Cuik's own data only (no sales file, no POS). Owner-only: it reads
 * every tenant's visits and campaigns.
 */
export default async function ImpactoLoyaltyPage() {
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") redirect("/admin")

  const rows = await db
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .orderBy(asc(tenants.name))
    .limit(500)

  return <LoyaltyImpactClient tenants={rows} />
}
