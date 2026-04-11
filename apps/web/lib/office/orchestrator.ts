import { db, eq, executions, tasks, tenants } from "@cuik/db"
import {
  type AgentId,
  ANTHROPIC_BASE_URL,
  ENVIRONMENT_ID,
  getAgentApiId,
  getAnthropicHeaders,
  getSkillsForAgent,
} from "./agents"
import { buildDataContext } from "./data-queries"

// ─── Types ────────────────────────────────────────────────────────────

interface SessionResponse {
  id: string
}

interface ExecutionResult {
  executionId: string
  status: "pending_approval" | "approved" | "failed"
  output: unknown
  agentLogs: Record<string, unknown>[]
  durationMs: number
}

// ─── Anthropic Session Helpers ────────────────────────────────────────

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

async function sendEvents(sessionId: string, prompt: string, skills: string): Promise<void> {
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

  console.log("[orchestrator] sendEvents OK")
}

/**
 * Read SSE stream, collect text, and call onIdle callback IMMEDIATELY
 * when status_idle is detected — before attempting any more reads.
 */
async function readStreamUntilIdle(
  sessionId: string,
  onIdle: (collectedText: string, model: string, stopReason: string) => Promise<void>,
): Promise<void> {
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

  console.log("[orchestrator] SSE stream opened")

  const textBlocks: string[] = []
  let model = ""
  let stopReason = ""

  const reader = streamRes.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        console.log("[orchestrator] stream ended (done=true)")
        break
      }

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const jsonStr = line.slice(6).trim()
        if (!jsonStr || jsonStr === "[DONE]") continue

        try {
          const event = JSON.parse(jsonStr)

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

          // Collect text
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

          // STATUS_IDLE: save immediately, then kill stream
          if (event.type === "session.status_idle") {
            const collectedText = textBlocks.join("")
            console.log("[orchestrator] status_idle detected — saving IMMEDIATELY.", {
              textBlocks: textBlocks.length,
              totalChars: collectedText.length,
              preview: collectedText.slice(0, 200) || "(EMPTY)",
            })

            // Save to DB before touching the stream
            await onIdle(collectedText, model, stopReason)

            console.log("[orchestrator] onIdle callback done, cancelling reader")
            try {
              await reader.cancel()
            } catch {
              /* ignore */
            }
            try {
              reader.releaseLock()
            } catch {
              /* ignore */
            }
            return // exit completely
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
  } catch (streamErr) {
    console.error("[orchestrator] stream read error:", streamErr)
    try {
      await reader.cancel()
    } catch {
      /* ignore */
    }
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
    throw streamErr
  }

  // If we got here, stream ended without status_idle
  try {
    reader.releaseLock()
  } catch {
    /* ignore */
  }
  const collectedText = textBlocks.join("")
  console.warn("[orchestrator] stream ended WITHOUT status_idle, saving anyway.", {
    textBlocks: textBlocks.length,
    totalChars: collectedText.length,
  })
  await onIdle(collectedText, model, stopReason)
}

// ─── Task Execution ───────────────────────────────────────────────────

export async function executeTask(taskId: string): Promise<ExecutionResult> {
  const start = Date.now()
  const agentLogs: Record<string, unknown>[] = []

  console.log(`[orchestrator] executeTask started: ${taskId}`)

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) throw new Error(`Task ${taskId} not found`)

  const agentIds = task.agents as string[]
  const primaryAgent = agentIds[0] as AgentId

  console.log(`[orchestrator] task loaded:`, {
    title: task.title,
    primaryAgent,
    requiresApproval: task.requiresApproval,
  })

  const [execution] = await db
    .insert(executions)
    .values({ taskId, status: "running", agentsUsed: [primaryAgent] })
    .returning({ id: executions.id })

  try {
    const sessionId = await createSession(primaryAgent)
    agentLogs.push({ agent: primaryAgent, event: "session_created", sessionId })

    // Build prompt
    let fullPrompt = task.prompt
    if (primaryAgent === "data") {
      const [tenant] = await db
        .select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.slug, "mascota-veloz"))
        .limit(1)

      if (tenant) {
        const dbContext = await buildDataContext(tenant.id, tenant.name)
        fullPrompt = `[DB_CONTEXT]\n${dbContext}\n[/DB_CONTEXT]\n\n${task.prompt}`
        agentLogs.push({ agent: primaryAgent, event: "db_context_built", tenantName: tenant.name })
      } else {
        console.warn("[orchestrator] Tenant mascota-veloz not found, skipping DB context")
      }
    }

    // Send events
    const skills = getSkillsForAgent(primaryAgent)
    await sendEvents(sessionId, fullPrompt, skills)

    // Read stream — DB save happens inside onIdle, BEFORE stream cleanup
    let savedResult: ExecutionResult | null = null

    await readStreamUntilIdle(sessionId, async (collectedText, model, stopReason) => {
      agentLogs.push({
        agent: primaryAgent,
        event: "turn_completed",
        model,
        stopReason,
        outputLength: collectedText.length,
      })

      const durationMs = Date.now() - start
      const finalStatus = task.requiresApproval
        ? ("pending_approval" as const)
        : ("approved" as const)

      console.log(
        `[orchestrator] saving execution ${execution.id}: status=${finalStatus}, chars=${collectedText.length}`,
      )

      await db
        .update(executions)
        .set({ status: finalStatus, output: { text: collectedText }, agentLogs, durationMs })
        .where(eq(executions.id, execution.id))

      await db
        .update(tasks)
        .set({ lastRun: new Date(), updatedAt: new Date() })
        .where(eq(tasks.id, taskId))

      console.log(`[orchestrator] execution ${execution.id} saved to DB OK`)

      savedResult = {
        executionId: execution.id,
        status: finalStatus,
        output: { text: collectedText },
        agentLogs,
        durationMs,
      }
    })

    if (savedResult) return savedResult

    // Fallback — should not happen
    return {
      executionId: execution.id,
      status: "failed",
      output: { error: "No result from stream" },
      agentLogs,
      durationMs: Date.now() - start,
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
    .values({ taskId, status: "running", agentsUsed: agentIds })
    .returning({ id: executions.id })

  try {
    let accumulatedContext = ""

    for (const agentId of agentIds) {
      const sessionId = await createSession(agentId)
      agentLogs.push({ agent: agentId, event: "session_created", sessionId })

      const skills = getSkillsForAgent(agentId)
      let prompt = accumulatedContext
        ? `${task.prompt}\n\n--- Previous agent output ---\n${accumulatedContext}`
        : task.prompt

      if (agentId === "data") {
        const [tenant] = await db
          .select({ id: tenants.id, name: tenants.name })
          .from(tenants)
          .where(eq(tenants.slug, "mascota-veloz"))
          .limit(1)

        if (tenant) {
          const dbContext = await buildDataContext(tenant.id, tenant.name)
          prompt = `[DB_CONTEXT]\n${dbContext}\n[/DB_CONTEXT]\n\n${prompt}`
          agentLogs.push({ agent: agentId, event: "db_context_built", tenantName: tenant.name })
        }
      }

      await sendEvents(sessionId, prompt, skills)

      let turnText = ""
      await readStreamUntilIdle(sessionId, async (collectedText, model, stopReason) => {
        turnText = collectedText
        agentLogs.push({
          agent: agentId,
          event: "turn_completed",
          model,
          stopReason,
          outputLength: collectedText.length,
        })
      })

      accumulatedContext = turnText
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

    console.log(`[orchestrator] collaborative execution ${execution.id} saved to DB OK`)

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
