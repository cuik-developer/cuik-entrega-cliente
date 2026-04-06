import { asc, db, eq, plans } from "@cuik/db"
import { successResponse } from "@/lib/api-utils"

/**
 * GET /api/public/plans
 *
 * Public endpoint — no auth required.
 * Returns active plans with only public-safe fields, ordered by price ascending.
 */
export async function GET() {
  const rows = await db
    .select({
      name: plans.name,
      price: plans.price,
      maxLocations: plans.maxLocations,
      maxPromos: plans.maxPromos,
      maxClients: plans.maxClients,
      features: plans.features,
    })
    .from(plans)
    .where(eq(plans.active, true))
    .orderBy(asc(plans.price))

  return successResponse(rows)
}
