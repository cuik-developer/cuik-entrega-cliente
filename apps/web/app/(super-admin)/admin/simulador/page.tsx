import { redirect } from "next/navigation"
import { listProductChanges } from "@/lib/admin/product-changes"
import { listDemoTenants } from "@/lib/admin/simulator"
import { currentAdminAccess } from "@/lib/admin-access"
import { canAccess } from "@/lib/staff-permissions"
import { SimulatorClient } from "./simulator-client"

export const dynamic = "force-dynamic"

/** Loyalty › Demos › Simulador: test visits and campaigns on the internal demo comercios. */
export default async function SimuladorPage() {
  const { access } = await currentAdminAccess()
  if (!canAccess(access, "simulator")) redirect("/admin")

  const [tenants, recent] = await Promise.all([
    listDemoTenants(),
    listProductChanges({ areas: ["simulator"] }),
  ])

  return (
    <SimulatorClient
      tenants={tenants}
      isOwner={access.kind === "super_admin"}
      recent={recent.slice(0, 15).map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actorName: r.actorName,
        tenantName: r.tenantName,
        action: r.action,
        targetName: r.targetName,
        detail: r.detail,
      }))}
    />
  )
}
