import { NoAccess } from "@/components/admin/admin-access"
import { currentAdminAccess } from "@/lib/admin-access"
import { PlanGrid } from "./plan-grid"
import { getPlansWithTenantCount } from "./queries"

export const dynamic = "force-dynamic"

export default async function PlanesPage() {
  // Reads the DB directly: owner only, checked here and not just by the shell.
  const { access } = await currentAdminAccess()
  if (access.kind !== "super_admin") return <NoAccess access={access} />

  const plans = await getPlansWithTenantCount()

  return (
    <div className="mx-auto max-w-4xl py-6 px-4">
      <PlanGrid plans={plans} />
    </div>
  )
}
