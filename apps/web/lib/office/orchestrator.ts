import { db, eq, executions, tasks, tenants } from "@cuik/db"
import { uploadAsset } from "@/lib/storage"
import {
  type AgentId,
  ANTHROPIC_BASE_URL,
  ENVIRONMENT_ID,
  getAgentApiId,
  getAnthropicHeaders,
  getSkillsForAgent,
} from "./agents"
import { buildReportData, formatDataContext } from "./data-queries"
import { generateReport } from "./excel-generator"

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
 * Read SSE stream chunk by chunk. On status_idle, return immediately
 * without closing the reader — let GC clean it up.
 */
async function readStream(sessionId: string): Promise<StreamResult> {
  const streamUrl = `${ANTHROPIC_BASE_URL}/sessions/${sessionId}/stream`

  console.log("[orchestrator] opening stream...")

  const res = await fetch(streamUrl, {
    method: "GET",
    headers: { ...getAnthropicHeaders(), Accept: "text/event-stream" },
  })

  console.log("[orchestrator] stream response:", res.status)

  if (!res.ok) {
    const body = await res.text()
    console.error("[orchestrator] stream FAILED:", res.status, body)
    throw new Error(`Failed to open stream (${res.status}): ${body}`)
  }

  if (!res.body) throw new Error("Stream response has no body")

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ""
  let model = ""
  let stopReason = ""
  let buffer = ""
  let chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      console.log("[orchestrator] stream ended (done=true), chunks received:", chunkCount)
      break
    }

    chunkCount++
    console.log("[orchestrator] chunk received, bytes:", value.byteLength, "chunk#:", chunkCount)

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue
      const jsonStr = line.slice(6).trim()
      if (!jsonStr || jsonStr === "[DONE]") continue

      try {
        const event = JSON.parse(jsonStr)

        console.log("[orchestrator] SSE event:", event.type)

        if (event.type === "error") {
          console.error("[orchestrator] SSE error:", JSON.stringify(event))
        }

        if (
          event.type === "agent" ||
          event.type === "agent.message" ||
          event.type === "content_block_delta"
        ) {
          if (event.content) {
            for (const block of event.content) {
              if (block.type === "text" && block.text) text += block.text
            }
          }
          if (event.delta?.text) text += event.delta.text
          if (event.model) model = event.model
          if (event.stop_reason) stopReason = event.stop_reason
        }

        console.log(
          "[orchestrator] checking idle:",
          JSON.stringify(event.type),
          event.type === "status_idle",
          event.type === "session.status_idle",
        )

        if (event.type === "session.status_idle" || event.type === "status_idle") {
          console.log(
            "[orchestrator] status_idle -> returning immediately, text length:",
            text.length,
          )
          return { text, model, stopReason }
        }
      } catch {
        // Not valid JSON, skip
      }
    }
  }

  console.log("[orchestrator] stream ended without status_idle, text length:", text.length)
  return { text, model, stopReason }
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

    // 2. Build prompt — for data agent, query DB and build context
    let fullPrompt = task.prompt
    let reportData: Awaited<ReturnType<typeof buildReportData>> | null = null
    let tenantName = ""

    if (primaryAgent === "data") {
      const [tenant] = await db
        .select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.slug, "mascota-veloz"))
        .limit(1)

      if (tenant) {
        tenantName = tenant.name
        reportData = await buildReportData(tenant.id)
        const dbContext = formatDataContext(reportData, tenant.name)
        fullPrompt = `[DB_CONTEXT]\n${dbContext}\n[/DB_CONTEXT]\n\n${task.prompt}`
        agentLogs.push({ agent: primaryAgent, event: "db_context_built", tenantName: tenant.name })
      }
    }

    // 3. Send events
    const skills = getSkillsForAgent(primaryAgent)
    await sendEvents(sessionId, fullPrompt, skills)

    // 4. Read stream
    const stream = await readStream(sessionId)

    agentLogs.push({
      agent: primaryAgent,
      event: "turn_completed",
      model: stream.model,
      stopReason: stream.stopReason,
      outputLength: stream.text.length,
    })

    // 5. Generate Excel and upload to MinIO (data agent only)
    const attachments: Array<{ name: string; url: string }> = []

    if (primaryAgent === "data" && reportData) {
      try {
        console.log("[orchestrator] generating Excel report...")
        const excelBuffer = await generateReport(tenantName, reportData)
        const key = `office/reports/${execution.id}.xlsx`
        const url = await uploadAsset(
          key,
          excelBuffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        attachments.push({
          name: `reporte-${tenantName.toLowerCase().replace(/\s+/g, "-")}.xlsx`,
          url,
        })
        console.log("[orchestrator] Excel uploaded:", url)
      } catch (excelErr) {
        console.error("[orchestrator] Excel generation failed (non-fatal):", excelErr)
      }
    }

    // 6. Save to DB
    const durationMs = Date.now() - start
    const finalStatus = task.requiresApproval
      ? ("pending_approval" as const)
      : ("approved" as const)

    const output =
      attachments.length > 0 ? { text: stream.text, attachments } : { text: stream.text }

    console.log(
      `[orchestrator] saving execution ${execution.id}: status=${finalStatus}, chars=${stream.text.length}, attachments=${attachments.length}`,
    )

    await db
      .update(executions)
      .set({ status: finalStatus, output, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    await db
      .update(tasks)
      .set({ lastRun: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))

    console.log(`[orchestrator] execution ${execution.id} saved OK`)

    return {
      executionId: execution.id,
      status: finalStatus,
      output,
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
          const rd = await buildReportData(tenant.id)
          const dbContext = formatDataContext(rd, tenant.name)
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
