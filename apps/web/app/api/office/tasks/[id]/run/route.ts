import { db, eq, tasks } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { executeCollaborativeTask, executeTask } from "@/lib/office/orchestrator"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

/** POST /api/office/tasks/[id]/run — manually trigger execution */
export async function POST(request: Request, { params }: Params) {
  console.log("[office/run] POST received")

  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) {
      console.log("[office/run] Auth failed")
      return authError
    }
    const roleError = requireRole(session, "super_admin")
    if (roleError) {
      console.log("[office/run] Role check failed")
      return roleError
    }

    const { id } = await params
    console.log(`[office/run] Running task ${id}`)

    const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
    if (!task) {
      console.log(`[office/run] Task ${id} not found`)
      return errorResponse("Task not found", 404)
    }
    if (task.status === "archived") return errorResponse("Cannot run archived task", 400)

    const agentIds = task.agents as string[]
    const execute =
      task.type === "collaborative" && agentIds.length > 1 ? executeCollaborativeTask : executeTask

    console.log(`[office/run] Executing task ${id} with agents: ${agentIds.join(", ")}`)

    // Run synchronously — wait for the full result so the execution record is complete
    const result = await execute(id)

    console.log(`[office/run] Task ${id} finished: status=${result.status}, executionId=${result.executionId}`)

    return successResponse(
      {
        executionId: result.executionId,
        status: result.status,
        message: "Execution completed",
      },
      201,
    )
  } catch (error) {
    console.error("[office/run] Unhandled error:", error)
    return errorResponse(
      "Execution failed",
      500,
      error instanceof Error ? error.message : String(error),
    )
  }
}
