import { db, eq, executions, tasks } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

/** GET /api/office/executions/[id] — execution detail with task info */
export async function GET(request: Request, { params }: Params) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id } = await params

  const rows = await db
    .select({
      id: executions.id,
      taskId: executions.taskId,
      taskTitle: tasks.title,
      taskPrompt: tasks.prompt,
      status: executions.status,
      output: executions.output,
      agentLogs: executions.agentLogs,
      agentsUsed: executions.agentsUsed,
      durationMs: executions.durationMs,
      approvedBy: executions.approvedBy,
      approvedAt: executions.approvedAt,
      createdAt: executions.createdAt,
    })
    .from(executions)
    .innerJoin(tasks, eq(executions.taskId, tasks.id))
    .where(eq(executions.id, id))
    .limit(1)

  if (!rows.length) return errorResponse("Execution not found", 404)
  return successResponse(rows[0])
}
