import { db, eq, executions, tasks } from "@cuik/db"
import {
  type AgentId,
  ANTHROPIC_BASE_URL,
  getAgentApiId,
  getAnthropicHeaders,
  getEnvironmentId,
} from "./agents"
import { LUNA_MARKETING_SKILLS } from "./skills/marketing"

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

// ─── Skill Injection ──────────────────────────────────────────────────

function getSkillsForAgent(agentId: string): string {
  switch (agentId) {
    case "luna":
      return LUNA_MARKETING_SKILLS
    default:
      return ""
  }
}

// ─── Anthropic Session Helpers ────────────────────────────────────────

async function createSession(agentApiId: string): Promise<string> {
  const envId = getEnvironmentId()
  if (!envId) throw new Error("OFFICE_ENV_ID is not set")

  const payload = {
    environment: envId,
    agent_reference: { type: "agent", id: agentApiId },
  }

  console.log("[orchestrator] createSession request:", {
    url: `${ANTHROPIC_BASE_URL}/sessions`,
    agentApiId,
    envId,
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
      agentApiId,
      envId,
    })
    throw new Error(`Failed to create session (${res.status}): ${body}`)
  }

  const data = (await res.json()) as SessionResponse
  console.log("[orchestrator] createSession OK:", { sessionId: data.id })
  return data.id
}

async function sendTurn(sessionId: string, prompt: string, skills: string): Promise<TurnResponse> {
  const messages = [
    ...(skills ? [{ role: "user" as const, content: `[SYSTEM SKILLS]\n${skills}` }] : []),
    { role: "user" as const, content: prompt },
  ]

  console.log("[orchestrator] sendTurn request:", {
    url: `${ANTHROPIC_BASE_URL}/sessions/${sessionId}/turns`,
    sessionId,
    messageCount: messages.length,
    skillsLength: skills.length,
    promptLength: prompt.length,
  })

  const res = await fetch(`${ANTHROPIC_BASE_URL}/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: getAnthropicHeaders(),
    body: JSON.stringify({ messages }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error("[orchestrator] sendTurn FAILED:", {
      status: res.status,
      statusText: res.statusText,
      body,
      sessionId,
    })
    throw new Error(`Failed to send turn (${res.status}): ${body}`)
  }

  const data = (await res.json()) as TurnResponse
  console.log("[orchestrator] sendTurn OK:", {
    model: data.model,
    stopReason: data.stop_reason,
    contentBlocks: data.content.length,
  })
  return data
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
 * Creates a session, sends the prompt, stores output as pending_approval.
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
    const agentApiId = getAgentApiId(primaryAgent)
    if (!agentApiId) throw new Error(`No API ID for agent: ${primaryAgent}`)

    // Create session
    const sessionId = await createSession(agentApiId)
    agentLogs.push({ agent: primaryAgent, event: "session_created", sessionId })

    // Send prompt with skills
    const skills = getSkillsForAgent(primaryAgent)
    const turn = await sendTurn(sessionId, task.prompt, skills)
    const output = extractTextFromTurn(turn)

    agentLogs.push({
      agent: primaryAgent,
      event: "turn_completed",
      model: turn.model,
      stopReason: turn.stop_reason,
    })

    const durationMs = Date.now() - start
    const finalStatus = task.requiresApproval
      ? ("pending_approval" as const)
      : ("approved" as const)

    // Update execution
    await db
      .update(executions)
      .set({ status: finalStatus, output, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    // Update task last_run
    await db
      .update(tasks)
      .set({ lastRun: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))

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
      const agentApiId = getAgentApiId(agentId)
      if (!agentApiId) throw new Error(`No API ID for agent: ${agentId}`)

      const sessionId = await createSession(agentApiId)
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

    await db
      .update(executions)
      .set({ status: finalStatus, output: accumulatedContext, agentLogs, durationMs })
      .where(eq(executions.id, execution.id))

    await db
      .update(tasks)
      .set({ lastRun: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId))

    return {
      executionId: execution.id,
      status: finalStatus,
      output: accumulatedContext,
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
