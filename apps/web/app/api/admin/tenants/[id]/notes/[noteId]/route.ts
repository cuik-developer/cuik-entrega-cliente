import { and, db, eq, tenantNotes } from "@cuik/db"

import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** DELETE /api/admin/tenants/[id]/notes/[noteId] — only the author can delete a note. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const { id, noteId } = await params
    if (!UUID.test(id) || !UUID.test(noteId)) return errorResponse("Invalid ID", 400)

    const deleted = await db
      .delete(tenantNotes)
      .where(
        and(
          eq(tenantNotes.id, noteId),
          eq(tenantNotes.tenantId, id),
          eq(tenantNotes.authorId, session.user.id),
        ),
      )
      .returning({ id: tenantNotes.id })

    if (deleted.length === 0) return errorResponse("Nota no encontrada o no es tuya", 404)
    return successResponse({ id: noteId })
  } catch (error) {
    console.error("[DELETE /api/admin/tenants/[id]/notes/[noteId]]", error)
    return errorResponse("Internal server error", 500)
  }
}
