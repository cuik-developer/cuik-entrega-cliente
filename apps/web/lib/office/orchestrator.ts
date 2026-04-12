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
        } else if (
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
        } else if (event.type === "session.status_idle" || event.type === "status_idle") {
          console.log(
            "[orchestrator] status_idle -> returning immediately, text length:",
            text.length,
          )
          return { text, model, stopReason }
        } else if (event.type === "terminated") {
          console.log("[orchestrator] terminated event received, text length:", text.length)
          if (text.length > 0) {
            return { text, model, stopReason: "terminated" }
          }
          throw new Error("Session terminated by server before response was complete")
        } else {
          console.log("[orchestrator] unhandled event type:", event.type)
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

    // ── Data agent: 2-session flow ───────────────────────────────────
    if (primaryAgent === "data" && reportData) {
      const reportFile = `/tmp/cuik_reporte_${taskId}.md`
      const excelFile = `/tmp/cuik_reporte_${taskId}.xlsx`

      // SESSION 1 — Analysis & report generation
      const prompt1 = `${fullPrompt}\n\nIMPORTANTE: Al terminar el análisis, guarda el reporte completo en ${reportFile} usando bash. Confirma cuando esté guardado.`
      const skills = getSkillsForAgent(primaryAgent)
      await sendEvents(sessionId, prompt1, skills)

      console.log("[orchestrator] session 1 (analysis) started...")
      const stream1 = await readStream(sessionId)

      agentLogs.push({
        agent: primaryAgent,
        event: "session1_analysis_completed",
        model: stream1.model,
        stopReason: stream1.stopReason,
        outputLength: stream1.text.length,
      })

      console.log(`[orchestrator] session 1 done, text length: ${stream1.text.length}`)

      // SESSION 2 — Excel generation (same session, new turn)
      const attachments: Array<{ name: string; url: string }> = []
      let analysisText = stream1.text

      try {
        const prompt2 = `Lee el archivo ${reportFile} y genera un Excel profesional con openpyxl en ${excelFile} con estas 9 hojas: Dashboard Ejecutivo, Patrones Temporales, Segmentación Clientes, Retención, Performance por Local, Digital & Rewards, Crecimiento, Plan de Acción, Anomalías. Usa headers en negrita con color #4A90D9, bordes en todas las celdas, y colores alternos en filas. Cuando termines, imprime el resultado de: base64 ${excelFile}`

        await sendEvents(sessionId, prompt2, "")

        console.log("[orchestrator] session 2 (Excel generation) started...")
        const stream2 = await readStream(sessionId)

        agentLogs.push({
          agent: primaryAgent,
          event: "session2_excel_completed",
          model: stream2.model,
          stopReason: stream2.stopReason,
          outputLength: stream2.text.length,
        })

        console.log(`[orchestrator] session 2 done, text length: ${stream2.text.length}`)

        // Extract base64-encoded Excel from stream2 text
        const base64Match = stream2.text.match(
          /(?:```[^\n]*\n)?((?:[A-Za-z0-9+/]{4}){10,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4}))(?:\n```)?/,
        )

        if (base64Match?.[1]) {
          console.log("[orchestrator] found base64 Excel data, decoding...")
          const excelBuffer = Buffer.from(base64Match[1], "base64")
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
          console.log("[orchestrator] agent-generated Excel uploaded:", url)
        } else {
          console.warn("[orchestrator] no base64 Excel found in session 2 output, falling back to ExcelJS...")
          const excelBuffer = await generateReport(tenantName, reportData, analysisText)
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
          console.log("[orchestrator] fallback Excel uploaded:", url)
        }
      } catch (session2Err) {
        console.error("[orchestrator] session 2 failed (non-fatal), saving analysis only:", session2Err)
        agentLogs.push({
          agent: primaryAgent,
          event: "session2_failed",
          error: session2Err instanceof Error ? session2Err.message : String(session2Err),
        })

        // Fallback: try ExcelJS generator
        try {
          const excelBuffer = await generateReport(tenantName, reportData, analysisText)
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
          console.log("[orchestrator] fallback Excel uploaded after session 2 failure:", url)
        } catch (fallbackErr) {
          console.error("[orchestrator] fallback Excel also failed:", fallbackErr)
        }
      }

      // Save to DB
      const durationMs = Date.now() - start
      const finalStatus = task.requiresApproval
        ? ("pending_approval" as const)
        : ("approved" as const)

      const output =
        attachments.length > 0
          ? { text: analysisText, attachments }
          : { text: analysisText }

      console.log(
        `[orchestrator] saving execution ${execution.id}: status=${finalStatus}, chars=${analysisText.length}, attachments=${attachments.length}`,
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

      return { executionId: execution.id, status: finalStatus, output, agentLogs, durationMs }
    }

    // ── Non-data agents: single session flow ─────────────────────────
    const skills = getSkillsForAgent(primaryAgent)
    await sendEvents(sessionId, fullPrompt, skills)

    const stream = await readStream(sessionId)

    agentLogs.push({
      agent: primaryAgent,
      event: "turn_completed",
      model: stream.model,
      stopReason: stream.stopReason,
      outputLength: stream.text.length,
    })

    const durationMs = Date.now() - start
    const finalStatus = task.requiresApproval
      ? ("pending_approval" as const)
      : ("approved" as const)

    const output = { text: stream.text }

    console.log(
      `[orchestrator] saving execution ${execution.id}: status=${finalStatus}, chars=${stream.text.length}`,
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

    return { executionId: execution.id, status: finalStatus, output, agentLogs, durationMs }
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
