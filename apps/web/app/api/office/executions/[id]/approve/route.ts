import { db, eq, executions } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

/** POST /api/office/executions/[id]/approve — approve or reject */
export async function POST(request: Request, { params }: Params) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id } = await params
  const body = await request.json()
  const { action } = body as { action: "approve" | "reject" }

  if (action !== "approve" && action !== "reject") {
    return errorResponse("action must be 'approve' or 'reject'", 400)
  }

  // Verify execution exists and is pending
  const [execution] = await db
    .select({ status: executions.status })
    .from(executions)
    .where(eq(executions.id, id))
    .limit(1)

  if (!execution) return errorResponse("Execution not found", 404)
  if (execution.status !== "pending_approval") {
    return errorResponse(`Cannot ${action} execution with status '${execution.status}'`, 400)
  }

  const [updated] = await db
    .update(executions)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      approvedBy: session.user.id,
      approvedAt: new Date(),
    })
    .where(eq(executions.id, id))
    .returning()

  return successResponse(updated)
}
