import { conversations, db, eq } from "@cuik/db"
import { errorResponse, requireAuth, requireRole } from "@/lib/api-utils"
import { ANTHROPIC_BASE_URL, getAnthropicHeaders } from "@/lib/office/agents"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/office/sessions/[id]/stream
 * Proxy SSE stream from Anthropic Managed Agents to the frontend.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id: conversationId } = await params

  // Look up conversation to get Anthropic session ID
  const [conversation] = await db
    .select({ sessionId: conversations.sessionId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1)

  if (!conversation?.sessionId) {
    return errorResponse("Conversation not found", 404)
  }

  // Proxy the SSE stream from Anthropic
  const headers = getAnthropicHeaders()
  const upstream = await fetch(
    `${ANTHROPIC_BASE_URL}/sessions/${conversation.sessionId}/stream`,
    {
      headers: {
        ...headers,
        Accept: "text/event-stream",
      },
    },
  )

  if (!upstream.ok || !upstream.body) {
    const err = await upstream.text().catch(() => "unknown")
    console.error("[Office:Stream] Anthropic error:", upstream.status, err)
    return errorResponse("Failed to open stream", 502)
  }

  // Forward the stream directly to the client
  return new Response(upstream.body as ReadableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
