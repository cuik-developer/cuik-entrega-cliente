import { asc, conversations, db, eq, messages } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

/**
 * GET /api/office/conversations/[id]
 * Get messages for a conversation.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id: conversationId } = await params

  // Verify ownership
  const [conversation] = await db
    .select({ userId: conversations.userId, agentId: conversations.agentId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)

  if (!conversation) return errorResponse("Conversation not found", 404)
  if (conversation.userId !== session.user.id) return errorResponse("Forbidden", 403)

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      agentId: messages.agentId,
      content: messages.content,
      metadata: messages.metadata,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))

  return successResponse({ agentId: conversation.agentId, messages: rows })
}
