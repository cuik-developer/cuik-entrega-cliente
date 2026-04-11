import { db, eq, tasks } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { executeCollaborativeTask, executeTask } from "@/lib/office/orchestrator"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

/** POST /api/office/tasks/[id]/run — manually trigger execution */
export async function POST(request: Request, { params }: Params) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id } = await params
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!task) return errorResponse("Task not found", 404)
  if (task.status === "archived") return errorResponse("Cannot run archived task", 400)

  const agentIds = task.agents as string[]
  const execute = task.type === "collaborative" && agentIds.length > 1
    ? executeCollaborativeTask
    : executeTask

  // Run async — don't block the response
  const resultPromise = execute(id).catch((err) => {
    console.error(`[office] Task ${id} execution failed:`, err)
  })

  // Wait briefly to get the execution ID
  const result = await Promise.race([
    resultPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
  ])

  if (result && typeof result === "object" && "executionId" in result) {
    return successResponse({ executionId: (result as { executionId: string }).executionId, message: "Execution started" }, 202)
  }

  return successResponse({ message: "Execution started" }, 202)
}
