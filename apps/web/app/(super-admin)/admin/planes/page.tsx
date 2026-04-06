import { PlanGrid } from "./plan-grid"
import { getPlansWithTenantCount } from "./queries"

export const dynamic = "force-dynamic"

export default async function PlanesPage() {
  const plans = await getPlansWithTenantCount()

  return (
    <div className="mx-auto max-w-4xl py-6 px-4">
      <PlanGrid plans={plans} />
    </div>
  )
}
