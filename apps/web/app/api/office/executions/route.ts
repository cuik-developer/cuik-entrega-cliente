import { db, desc, eq, executions, tasks } from "@cuik/db"
import { requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

/** GET /api/office/executions — list executions, default pending_approval */
export async function GET(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") ?? "pending_approval"

  const rows = await db
    .select({
      id: executions.id,
      taskId: executions.taskId,
      taskTitle: tasks.title,
      status: executions.status,
      agentsUsed: executions.agentsUsed,
      durationMs: executions.durationMs,
      createdAt: executions.createdAt,
    })
    .from(executions)
    .innerJoin(tasks, eq(executions.taskId, tasks.id))
    .where(
      eq(
        executions.status,
        status as "running" | "pending_approval" | "approved" | "rejected" | "failed",
      ),
    )
    .orderBy(desc(executions.createdAt))
    .limit(50)

  return successResponse(rows)
}
