import { and, clients, clientTagAssignments, clientTags, db, eq, inArray } from "@cuik/db"
import { assignTagsSchema } from "@cuik/shared/validators/crm-schema"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
  successResponse,
} from "@/lib/api-utils"

type Params = { params: Promise<{ tenant: string; id: string }> }

export async function GET(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug, id: clientId } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Verify client exists and belongs to tenant
    const clientRows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
      .limit(1)

    if (clientRows.length === 0) {
      return errorResponse("Client not found", 404)
    }

    const tags = await db
      .select({
        id: clientTags.id,
        name: clientTags.name,
        color: clientTags.color,
        assignedAt: clientTagAssignments.assignedAt,
      })
      .from(clientTagAssignments)
      .innerJoin(clientTags, eq(clientTagAssignments.tagId, clientTags.id))
      .where(eq(clientTagAssignments.clientId, clientId))

    return successResponse(tags)
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/[id]/tags]", error)
    return errorResponse("Internal server error", 500)
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug, id: clientId } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    // Verify client exists and belongs to tenant
    const clientRows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
      .limit(1)

    if (clientRows.length === 0) {
      return errorResponse("Client not found", 404)
    }

    const body = await request.json()
    const parsed = assignTagsSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, parsed.error.flatten())
    }

    // Verify all tagIds belong to this tenant
    const validTags = await db
      .select({ id: clientTags.id })
      .from(clientTags)
      .where(and(eq(clientTags.tenantId, tenant.id), inArray(clientTags.id, parsed.data.tagIds)))

    if (validTags.length !== parsed.data.tagIds.length) {
      return errorResponse("One or more tag IDs are invalid or do not belong to this tenant", 400)
    }

    // Replace strategy: delete existing, insert new
    await db.delete(clientTagAssignments).where(eq(clientTagAssignments.clientId, clientId))

    if (parsed.data.tagIds.length > 0) {
      await db.insert(clientTagAssignments).values(
        parsed.data.tagIds.map((tagId) => ({
          clientId,
          tagId,
        })),
      )
    }

    // Return updated tags
    const updatedTags = await db
      .select({
        id: clientTags.id,
        name: clientTags.name,
        color: clientTags.color,
        assignedAt: clientTagAssignments.assignedAt,
      })
      .from(clientTagAssignments)
      .innerJoin(clientTags, eq(clientTagAssignments.tagId, clientTags.id))
      .where(eq(clientTagAssignments.clientId, clientId))

    return successResponse(updatedTags)
  } catch (error) {
    console.error("[POST /api/[tenant]/clients/[id]/tags]", error)
    return errorResponse("Internal server error", 500)
  }
}
