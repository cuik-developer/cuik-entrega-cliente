import { conversations, db, desc, eq } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

/**
 * GET /api/office/conversations
 * List conversations for the current super_admin user.
 */
export async function GET(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const rows = await db
    .select({
      id: conversations.id,
      agentId: conversations.agentId,
      sessionId: conversations.sessionId,
      title: conversations.title,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, session.user.id))
    .orderBy(desc(conversations.updatedAt))
    .limit(50)

  return successResponse(rows)
}
