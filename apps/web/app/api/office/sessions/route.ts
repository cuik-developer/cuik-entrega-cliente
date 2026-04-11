import { conversations, db } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import {
  ANTHROPIC_BASE_URL,
  getAgentApiId,
  getAnthropicHeaders,
  getEnvironmentId,
  type AgentId,
} from "@/lib/office/agents"

export const runtime = "nodejs"

/**
 * POST /api/office/sessions
 * Create a new Anthropic Managed Agent session + local conversation record.
 * Body: { agentId: "luna", title?: string }
 */
export async function POST(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const body = (await request.json()) as { agentId?: string; title?: string }
  const { agentId, title } = body

  if (!agentId) return errorResponse("agentId is required", 400)

  const agentApiId = getAgentApiId(agentId as AgentId)
  if (!agentApiId) {
    console.error("[Office:Sessions] Agent not found:", agentId, "— check OFFICE_*_AGENT_ID env vars")
    return errorResponse("Agent not found or not configured", 400)
  }

  const envId = getEnvironmentId()
  if (!envId) {
    console.error("[Office:Sessions] OFFICE_ENV_ID not set")
    return errorResponse("Office environment not configured", 503)
  }

  console.info("[Office:Sessions] Creating session:", { agentId, agentApiId, envId })

  // 1. Create Anthropic session
  const anthropicRes = await fetch(`${ANTHROPIC_BASE_URL}/sessions`, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify({
      agent: { type: "agent_reference", agent_id: agentApiId },
      environment_id: envId,
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    console.error("[Office:Sessions] Anthropic error:", anthropicRes.status, err)
    return errorResponse("Failed to create agent session", 502)
  }

  const anthropicSession = (await anthropicRes.json()) as { id: string }

  // 2. Create local conversation record
  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: session.user.id,
      agentId,
      sessionId: anthropicSession.id,
      title: title || `Chat con ${agentId}`,
    })
    .returning()

  return successResponse({
    conversationId: conversation.id,
    sessionId: anthropicSession.id,
    agentId,
  })
}
