import { conversations, db, eq, messages } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { ANTHROPIC_BASE_URL, getAnthropicHeaders } from "@/lib/office/agents"

export const runtime = "nodejs"

/**
 * POST /api/office/sessions/[id]/events
 * Send a user message to the Anthropic session.
 * Body: { message: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id: conversationId } = await params
  const body = (await request.json()) as { message?: string }
  const { message } = body

  if (!message?.trim()) return errorResponse("message is required", 400)

  // Look up conversation to get Anthropic session ID
  const [conversation] = await db
    .select({ sessionId: conversations.sessionId, agentId: conversations.agentId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)

  if (!conversation?.sessionId) {
    console.error("[Office:Events] Conversation not found:", conversationId)
    return errorResponse("Conversation not found", 404)
  }

  console.info("[Office:Events] Sending message to session:", conversation.sessionId, "message:", message.trim().slice(0, 50))

  // Save user message locally
  await db.insert(messages).values({
    conversationId,
    role: "user",
    content: message.trim(),
  })

  // Send to Anthropic
  const anthropicRes = await fetch(
    `${ANTHROPIC_BASE_URL}/sessions/${conversation.sessionId}/events`,
    {
      method: "POST",
      headers: getAnthropicHeaders(),
      body: JSON.stringify({
        events: [
          {
            type: "user",
            content: [{ type: "text", text: message.trim() }],
          },
        ],
      }),
    },
  )

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    console.error("[Office:Events] Anthropic error:", anthropicRes.status, err)
    return errorResponse("Failed to send message", 502)
  }

  return successResponse({ ok: true })
}
