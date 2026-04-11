import { and, db, eq, tasks } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

/** GET /api/office/tasks/[id] — task detail */
export async function GET(request: Request, { params }: Params) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id } = await params
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1)
  if (!task) return errorResponse("Task not found", 404)

  return successResponse(task)
}

/** PATCH /api/office/tasks/[id] — update task */
export async function PATCH(request: Request, { params }: Params) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id } = await params
  const body = await request.json()

  const allowedFields = [
    "title",
    "agents",
    "prompt",
    "type",
    "cronExpression",
    "recipients",
    "requiresApproval",
    "status",
  ] as const
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning()

  if (!updated) return errorResponse("Task not found", 404)
  return successResponse(updated)
}

/** DELETE /api/office/tasks/[id] — archive (soft delete) */
export async function DELETE(request: Request, { params }: Params) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { id } = await params
  const [archived] = await db
    .update(tasks)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(tasks.id, id)))
    .returning()

  if (!archived) return errorResponse("Task not found", 404)
  return successResponse(archived)
}
