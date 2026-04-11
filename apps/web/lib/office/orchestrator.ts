import { db, eq, executions, tasks } from "@cuik/db"
import {
  type AgentId,
  ANTHROPIC_BASE_URL,
  ENVIRONMENT_ID,
  getAgentApiId,
  getAnthropicHeaders,
  getSkillsForAgent,
} from "./agents"

// ─── Types ────────────────────────────────────────────────────────────

interface SessionResponse {
  id: string
}

interface TurnResponse {
  id: string
  role: string
  model: string
  content: Array<{ type: string; text?: string }>
  stop_reason: string
}

interface ExecutionResult {
  executionId: string
  status: "pending_approval" | "approved" | "failed"
  output: unknown
  agentLogs: Record<string, unknown>[]
  durationMs: number
}

// ─── Anthropic Session Helpers ────────────────────────────────────────

/**
 * Create a session using agent_reference.
 * The agent's system prompt and tools are defined in the Anthropic console.
 */
async function createSession(agentId: AgentId): Promise<string> {
  const agentApiId = getAgentApiId(agentId)
  if (!agentApiId) throw new Error(`No API ID configured for agent: ${agentId}`)

  const payload = {
    environment: ENVIRONMENT_ID,
    agent: { type: "agent_reference", id: agentApiId },
  }

  console.log("[orchestrator] createSession request:", {
    url: `${ANTHROPIC_BASE_URL}/sessions`,
    agentId,
    agentApiId,
    environment: ENVIRONMENT_ID,
  })

  const res = await fetch(`${ANTHROPIC_BASE_URL}/sessions`, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error("[orchestrator] createSession FAILED:", {
      status: res.status,
      statusText: res.statusText,
      body,
      agentId,
      agentApiId,
    })
    throw new Error(`Failed to create session (${res.status}): ${body}`)
  }

  const data = (await res.json()) as SessionResponse
  console.log("[orchestrator] createSession OK:", { sessionId: data.id })
  return data.id
}

/**
 * Send user prompt and read SSE stream until session.status_idle.
 * Skills are injected as first user message before the task prompt.
 */
async function sendTurn(sessionId: string, prompt: string, skills: string): Promise<TurnResponse> {
  const events: Array<{ type: string; content: Array<{ type: string; text: string }> }> = []

  if (skills) {
    events.push({
      type: "user",
      content: [{ type: "text", text: `[CONTEXT]\n${skills}` }],
    })
  }
  events.push({
    type: "user",
    content: [{ type: "text", text: prompt }],
  })

  const eventsPayload = { events }
  const eventsUrl = `${ANTHROPIC_BASE_URL}/sessions/${sessionId}/events`

  console.log("[orchestrator] sendEvents request:", {
    url: eventsUrl,
    eventCount: events.length,
    skillsLength: skills.length,
    promptLength: prompt.length,
  })

  // 1. POST /v1/sessions/{id}/events — send user message
  const eventsRes = await fetch(eventsUrl, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify(eventsPayload),
  })

  if (!eventsRes.ok) {
    const body = await eventsRes.text()
    console.error("[orchestrator] sendEvents FAILED:", {
      status: eventsRes.status,
      statusText: eventsRes.statusText,
      body,
      sessionId,
    })
    throw new Error(`Failed to send events (${eventsRes.status}): ${body}`)
  }

  console.log("[orchestrator] sendEvents OK, opening SSE stream...")

  // 2. GET /v1/sessions/{id}/stream — read SSE until session.status_idle
  const streamUrl = `${ANTHROPIC_BASE_URL}/sessions/${sessionId}/stream`
  const streamHeaders = {
    ...getAnthropicHeaders(),
    Accept: "text/event-stream",
  }

  const streamRes = await fetch(streamUrl, {
    method: "GET",
    headers: streamHeaders,
  })

  if (!streamRes.ok) {
    const body = await streamRes.text()
    console.error("[orchestrator] stream FAILED:", {
      status: streamRes.status,
      statusText: streamRes.statusText,
      body,
      sessionId,
    })
    throw new Error(`Failed to open stream (${streamRes.status}): ${body}`)
  }

  if (!streamRes.body) {
    throw new Error("Stream response has no body")
  }

  // Parse SSE events from the stream
  const textBlocks: string[] = []
  let model = ""
  let stopReason = ""
  let gotIdle = false

  const reader = streamRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (!gotIdle) {
      const { done, value } = await reader.read()
      if (done) {
        console.log("[orchestrator] stream ended (done=true), gotIdle:", gotIdle)
        break
      }

      buffer += decoder.decode(value, { stream: true })

      // Process complete SSE lines
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? "" // keep incomplete line in buffer

      for (const line of lines) {
        if (gotIdle) break // stop processing lines after idle
        if (!line.startsWith("data: ")) continue
        const jsonStr = line.slice(6).trim()
        if (!jsonStr || jsonStr === "[DONE]") continue

        try {
          const event = JSON.parse(jsonStr)

          // Log errors fully, log text-bearing events fully, others just type
          if (event.type === "error") {
            console.error("[orchestrator] SSE error event:", JSON.stringify(event))
          } else if (
            event.type === "agent.message" ||
            event.type === "content_block_delta" ||
            event.content ||
            event.delta
          ) {
            console.log("[orchestrator] SSE text event:", JSON.stringify(event))
          } else {
            console.log("[orchestrator] SSE event:", { type: event.type })
          }

          // Collect text content from agent messages
          if (event.type === "agent.message" || event.type === "content_block_delta") {
            if (event.content) {
              for (const block of event.content) {
                if (block.type === "text" && block.text) {
                  textBlocks.push(block.text)
                }
              }
            }
            if (event.delta?.text) {
              textBlocks.push(event.delta.text)
            }
            if (event.model) model = event.model
            if (event.stop_reason) stopReason = event.stop_reason
          }

          // Session idle = agent is done responding — stop immediately
          if (event.type === "session.status_idle") {
            console.log("[orchestrator] session idle — breaking out of stream loop")
            gotIdle = true
            break // break inner for-loop; while(!gotIdle) exits outer
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
  } finally {
    console.log("[orchestrator] releasing stream reader, gotIdle:", gotIdle)
    reader.cancel().catch(() => {})
    reader.releaseLock()
  }

  const result: TurnResponse = {
    id: sessionId,
    role: "agent",
    model,
    content: textBlocks.map((text) => ({ type: "text", text })),
    stop_reason: stopReason,
  }

  const totalText = textBlocks.join("")
  console.log("[orchestrator] sendTurn completed:", {
    model: result.model || "(no model in events)",
    stopReason: result.stop_reason || "(no stop_reason in events)",
    contentBlocks: result.content.length,
    totalTextLength: totalText.length,
    hasText: totalText.length > 0,
    textPreview:
      totalText.length > 0 ? totalText.slice(0, 200) : "(EMPTY — no text collected from SSE)",
  })

  return result
}

function extractTextFromTurn(turn: TurnResponse): string {
  return turn.content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n\n")
}

// ─── Task Execution ───────────────────────────────────────────────────

/**
 * Execute a single-agent task.
 * Creates a session with inline config, sends the prompt, stores output.
 */
export async function executeTask(taskId: string): Promise<ExecutionResult> {
  const start = Date.now()
  const agentLogs: Record<string, unknown>[] = []

  console.log(`[orchestrator] executeTask started: ${taskId}`)

  // Load task
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) throw new Error(`Task ${taskId} not found`)

  const agentIds = task.agents as string[]
  const primaryAgent = agentIds[0] as AgentId

  console.log(`[orchestrator] task loaded:`, {
    title: task.title,
    primaryAgent,
    requiresApproval: task.requiresApproval,
  })

  // Create execution record
  const [execution] = await db
    .insert(executions)
    .values({
      taskId,
      status: "running",
      agentsUsed: [primaryAgent],
    })
    .returning({ id: executions.id })

  try {
    // Create session with agent_reference
    const sessionId = await createSession(primaryAgent)
    agentLogs.push({ agent: primaryAgent, event: "session_created", sessionId })

    // Send prompt with skills injected as first user message
    const skills = getSkillsForAgent(primaryAgent)
    const turn = await sendTurn(sessionId, task.prompt, skills)
    const outputText = extractTextFromTurn(turn)

    console.log(
      `[orchestrator] extracted output: length=${outputText.length}, preview=${outputText.slice(0, 100)}`,
    )

    agentLogs.push({
      agent: primaryAgent,
      event: "turn_completed",
      model: turn.model,
      stopReason: turn.stop_reason,
      outputLength: outputText.length,
    })

    const durationMs = Date.now() - start
    const finalStatus = task.requiresApproval
      ? ("pending_approval" as const)
      : ("approved" as const)

    console.log(
      `[orchestrator] about to save execution ${execution.id}: status=${finalStatus}, outputLength=${outputText.length}`,
    )

    // Update execution — output as JSON object so jsonb column stores it properly
    await db
      .update(executions)
      .set({ status: finalStatus, output: { text: outputText }, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    console.log(`[orchestrator] execution ${execution.id} saved to DB OK`)

    // Update task last_run
    await db
      .update(tasks)
      .set({ lastRun: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))

    return {
      executionId: execution.id,
      status: finalStatus,
      output: { text: outputText },
      agentLogs,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - start
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error(`[orchestrator] executeTask FAILED for ${taskId}:`, {
      error: errorMsg,
      stack: errorStack,
      durationMs,
      agentLogs,
    })
    agentLogs.push({ event: "error", error: errorMsg })

    await db
      .update(executions)
      .set({ status: "failed", output: { error: errorMsg }, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    return {
      executionId: execution.id,
      status: "failed",
      output: { error: errorMsg },
      agentLogs,
      durationMs,
    }
  }
}

/**
 * Execute a collaborative (multi-agent) task.
 * Runs agents in sequence, passing each output as context to the next.
 */
export async function executeCollaborativeTask(taskId: string): Promise<ExecutionResult> {
  console.log(`[orchestrator] executeCollaborativeTask started: ${taskId}`)
  const start = Date.now()
  const agentLogs: Record<string, unknown>[] = []

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) throw new Error(`Task ${taskId} not found`)

  const agentIds = task.agents as AgentId[]
  console.log(`[orchestrator] collaborative task loaded:`, {
    title: task.title,
    agents: agentIds,
    requiresApproval: task.requiresApproval,
  })

  const [execution] = await db
    .insert(executions)
    .values({
      taskId,
      status: "running",
      agentsUsed: agentIds,
    })
    .returning({ id: executions.id })

  try {
    let accumulatedContext = ""

    for (const agentId of agentIds) {
      const sessionId = await createSession(agentId)
      agentLogs.push({ agent: agentId, event: "session_created", sessionId })

      const skills = getSkillsForAgent(agentId)
      const prompt = accumulatedContext
        ? `${task.prompt}\n\n--- Previous agent output ---\n${accumulatedContext}`
        : task.prompt

      const turn = await sendTurn(sessionId, prompt, skills)
      const output = extractTextFromTurn(turn)
      accumulatedContext = output

      agentLogs.push({
        agent: agentId,
        event: "turn_completed",
        model: turn.model,
        stopReason: turn.stop_reason,
        outputLength: output.length,
      })
    }

    const durationMs = Date.now() - start
    const finalStatus = task.requiresApproval
      ? ("pending_approval" as const)
      : ("approved" as const)

    console.log(
      `[orchestrator] saving collaborative execution ${execution.id}: status=${finalStatus}`,
    )

    await db
      .update(executions)
      .set({ status: finalStatus, output: { text: accumulatedContext }, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    await db
      .update(tasks)
      .set({ lastRun: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))

    return {
      executionId: execution.id,
      status: finalStatus,
      output: { text: accumulatedContext },
      agentLogs,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - start
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error(`[orchestrator] executeCollaborativeTask FAILED for ${taskId}:`, {
      error: errorMsg,
      stack: errorStack,
      durationMs,
      agentLogs,
    })
    agentLogs.push({ event: "error", error: errorMsg })

    await db
      .update(executions)
      .set({ status: "failed", output: { error: errorMsg }, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    return {
      executionId: execution.id,
      status: "failed",
      output: { error: errorMsg },
      agentLogs,
      durationMs,
    }
  }
}
