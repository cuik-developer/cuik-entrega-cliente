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

interface StreamResult {
  text: string
  model: string
  stopReason: string
}

// ─── Anthropic Helpers ────────────────────────────────────────────────

async function createSession(agentId: AgentId): Promise<string> {
  const agentApiId = getAgentApiId(agentId)
  if (!agentApiId) throw new Error(`No API ID configured for agent: ${agentId}`)

  const payload = {
    environment: ENVIRONMENT_ID,
    agent: { type: "agent_reference", id: agentApiId },
  }

  console.log("[orchestrator] createSession:", { agentId, agentApiId })

  const res = await fetch(`${ANTHROPIC_BASE_URL}/sessions`, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error("[orchestrator] createSession FAILED:", res.status, body)
    throw new Error(`Failed to create session (${res.status}): ${body}`)
  }

  const data = (await res.json()) as SessionResponse
  console.log("[orchestrator] createSession OK:", data.id)
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

  console.log("[orchestrator] sendEvents:", {
    eventCount: events.length,
    promptLength: prompt.length,
  })

  const res = await fetch(`${ANTHROPIC_BASE_URL}/sessions/${sessionId}/events`, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify({ events }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error("[orchestrator] sendEvents FAILED:", res.status, body)
    throw new Error(`Failed to send events (${res.status}): ${body}`)
  }

  console.log("[orchestrator] sendEvents OK")
}

/**
 * Read the entire SSE stream as text (with 120s timeout), then parse events.
 * No streaming reader — just fetch().text() to avoid hanging on reader.read().
 */
async function readStream(sessionId: string): Promise<StreamResult> {
  const streamUrl = `${ANTHROPIC_BASE_URL}/sessions/${sessionId}/stream`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  console.log("[orchestrator] opening stream (120s timeout)...")

  try {
    const res = await fetch(streamUrl, {
      method: "GET",
      headers: { ...getAnthropicHeaders(), Accept: "text/event-stream" },
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      console.error("[orchestrator] stream FAILED:", res.status, body)
      throw new Error(`Failed to open stream (${res.status}): ${body}`)
    }

    const rawText = await res.text()
    clearTimeout(timeout)

    console.log("[orchestrator] stream body received:", rawText.length, "chars")

    // Parse SSE lines
    const dataLines = rawText.split("\n").filter((l) => l.startsWith("data: "))
    const textBlocks: string[] = []
    let model = ""
    let stopReason = ""

    for (const line of dataLines) {
      const jsonStr = line.slice(6).trim()
      if (!jsonStr || jsonStr === "[DONE]") continue

      try {
        const event = JSON.parse(jsonStr)

        if (event.type === "error") {
          console.error("[orchestrator] SSE error:", JSON.stringify(event))
        }

        // Collect text from agent messages
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

        if (event.type === "session.status_idle") {
          console.log("[orchestrator] status_idle found in stream data")
        }
      } catch {
        // Not valid JSON, skip
      }
    }

    const text = textBlocks.join("")
    console.log("[orchestrator] parsed stream:", {
      dataLines: dataLines.length,
      textBlocks: textBlocks.length,
      totalChars: text.length,
      model: model || "(none)",
      preview: text.slice(0, 200) || "(EMPTY)",
    })

    return { text, model, stopReason }
  } catch (err) {
    clearTimeout(timeout)
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Stream timed out after 120 seconds")
    }
    throw err
  }
}

// ─── Task Execution ───────────────────────────────────────────────────

export async function executeTask(taskId: string): Promise<ExecutionResult> {
  const start = Date.now()
  const agentLogs: Record<string, unknown>[] = []

  console.log(`[orchestrator] executeTask: ${taskId}`)

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) throw new Error(`Task ${taskId} not found`)

  const agentIds = task.agents as string[]
  const primaryAgent = agentIds[0] as AgentId

  const [execution] = await db
    .insert(executions)
    .values({ taskId, status: "running", agentsUsed: [primaryAgent] })
    .returning({ id: executions.id })

  try {
    // 1. Create session
    const sessionId = await createSession(primaryAgent)
    agentLogs.push({ agent: primaryAgent, event: "session_created", sessionId })

    // 2. Build prompt
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
      }
    }

    // 3. Send events
    const skills = getSkillsForAgent(primaryAgent)
    await sendEvents(sessionId, fullPrompt, skills)

    // 4. Read entire stream as text (no streaming reader)
    const stream = await readStream(sessionId)

    agentLogs.push({
      agent: primaryAgent,
      event: "turn_completed",
      model: stream.model,
      stopReason: stream.stopReason,
      outputLength: stream.text.length,
    })

    // 5. Save to DB
    const durationMs = Date.now() - start
    const finalStatus = task.requiresApproval
      ? ("pending_approval" as const)
      : ("approved" as const)

    console.log(
      `[orchestrator] saving execution ${execution.id}: status=${finalStatus}, chars=${stream.text.length}`,
    )

    await db
      .update(executions)
      .set({ status: finalStatus, output: { text: stream.text }, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    await db
      .update(tasks)
      .set({ lastRun: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))

    console.log(`[orchestrator] execution ${execution.id} saved OK`)

    return {
      executionId: execution.id,
      status: finalStatus,
      output: { text: stream.text },
      agentLogs,
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - start
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(`[orchestrator] executeTask FAILED:`, errorMsg)
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
  console.log(`[orchestrator] executeCollaborativeTask: ${taskId}`)
  const start = Date.now()
  const agentLogs: Record<string, unknown>[] = []

  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) throw new Error(`Task ${taskId} not found`)

  const agentIds = task.agents as AgentId[]

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
      const stream = await readStream(sessionId)
      accumulatedContext = stream.text

      agentLogs.push({
        agent: agentId,
        event: "turn_completed",
        model: stream.model,
        stopReason: stream.stopReason,
        outputLength: stream.text.length,
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

    console.log(`[orchestrator] collaborative execution ${execution.id} saved OK`)

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
    console.error(`[orchestrator] executeCollaborativeTask FAILED:`, errorMsg)
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
