import { and, db, eq, locations } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

/**
 * POST /api/admin/tenants/[id]/locations
 * Create a new business location (sucursal) for a tenant.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id: tenantId } = await params
    const body = await request.json()
    const name = (body.name ?? "").trim()
    const address = (body.address ?? "").trim()

    if (!name) {
      return errorResponse("El nombre es obligatorio", 400)
    }

    const [row] = await db
      .insert(locations)
      .values({
        tenantId,
        name,
        address: address || null,
      })
      .returning({
        id: locations.id,
        name: locations.name,
        address: locations.address,
        active: locations.active,
      })

    return successResponse(row)
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/locations]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * DELETE /api/admin/tenants/[id]/locations?locationId=xxx
 * Delete a business location.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id: tenantId } = await params
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get("locationId")

    if (!locationId) {
      return errorResponse("locationId es requerido", 400)
    }

    const result = await db
      .delete(locations)
      .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)))
      .returning({ id: locations.id })

    if (result.length === 0) {
      return errorResponse("Sucursal no encontrada", 404)
    }

    return successResponse({ deleted: true })
  } catch (error) {
    console.error("[DELETE /api/admin/tenants/[id]/locations]", error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * PATCH /api/admin/tenants/[id]/locations
 * Toggle active state of a location.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id: tenantId } = await params
    const body = await request.json()
    const { locationId, active } = body

    if (!locationId || typeof active !== "boolean") {
      return errorResponse("locationId y active son requeridos", 400)
    }

    const result = await db
      .update(locations)
      .set({ active })
      .where(and(eq(locations.id, locationId), eq(locations.tenantId, tenantId)))
      .returning({ id: locations.id })

    if (result.length === 0) {
      return errorResponse("Sucursal no encontrada", 404)
    }

    return successResponse({ updated: true })
  } catch (error) {
    console.error("[PATCH /api/admin/tenants/[id]/locations]", error)
    return errorResponse("Internal server error", 500)
  }
}
