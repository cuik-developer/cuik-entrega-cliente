import { db, desc, eq, tenantNotes, user } from "@cuik/db"
import { z } from "zod"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const createNoteSchema = z.object({
  content: z.string().trim().min(1, "La nota no puede estar vacia").max(2000),
  followUpAt: z.string().date().nullable().optional(),
})

/**
 * GET /api/admin/tenants/[id]/notes — internal notes of the Cuik team about a
 * tenant, newest first. Super-admin only; the tenant never sees them.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)

    const rows = await db
      .select({
        id: tenantNotes.id,
        content: tenantNotes.content,
        followUpAt: tenantNotes.followUpAt,
        createdAt: tenantNotes.createdAt,
        authorId: tenantNotes.authorId,
        authorName: user.name,
      })
      .from(tenantNotes)
      .leftJoin(user, eq(user.id, tenantNotes.authorId))
      .where(eq(tenantNotes.tenantId, id))
      .orderBy(desc(tenantNotes.createdAt))
      .limit(200)

    return successResponse(
      rows.map((r) => ({
        id: r.id,
        content: r.content,
        followUpAt: r.followUpAt ? r.followUpAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        author: { id: r.authorId, name: r.authorName },
        mine: r.authorId === session.user.id,
      })),
    )
  } catch (error) {
    console.error("[GET /api/admin/tenants/[id]/notes]", error)
    return errorResponse("Internal server error", 500)
  }
}

/** POST /api/admin/tenants/[id]/notes { content, followUpAt? } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id } = await params
    if (!UUID.test(id)) return errorResponse("Invalid tenant ID", 400)

    const parsed = createNoteSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const [note] = await db
      .insert(tenantNotes)
      .values({
        tenantId: id,
        authorId: session.user.id,
        content: parsed.data.content,
        // Stored at local noon so the day survives timezone round-trips.
        followUpAt: parsed.data.followUpAt ? new Date(`${parsed.data.followUpAt}T12:00:00`) : null,
      })
      .returning({ id: tenantNotes.id })

    return successResponse({ id: note.id }, 201)
  } catch (error) {
    console.error("[POST /api/admin/tenants/[id]/notes]", error)
    return errorResponse("Internal server error", 500)
  }
}
