import { and, clientNotes, clients, db, desc, eq } from "@cuik/db"
import { createNoteSchema } from "@cuik/shared/validators/crm-schema"

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

    const notes = await db
      .select()
      .from(clientNotes)
      .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.tenantId, tenant.id)))
      .orderBy(desc(clientNotes.createdAt))

    return successResponse(notes)
  } catch (error) {
    console.error("[GET /api/[tenant]/clients/[id]/notes]", error)
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
    const parsed = createNoteSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Invalid request body", 400, parsed.error.flatten())
    }

    const [note] = await db
      .insert(clientNotes)
      .values({
        clientId,
        tenantId: tenant.id,
        content: parsed.data.content,
        createdBy: session.user.id,
      })
      .returning()

    return successResponse(note, 201)
  } catch (error) {
    console.error("[POST /api/[tenant]/clients/[id]/notes]", error)
    return errorResponse("Internal server error", 500)
  }
}
