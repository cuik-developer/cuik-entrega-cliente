import { db, desc, eq, tasks } from "@cuik/db"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { getNextRun } from "@/lib/office/cron-utils"

export const runtime = "nodejs"

/** GET /api/office/tasks — list active tasks */
export async function GET(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status") ?? "active"

  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.status, status as "active" | "paused" | "archived"))
    .orderBy(desc(tasks.createdAt))

  return successResponse(rows)
}

/** POST /api/office/tasks — create a new task */
export async function POST(request: Request) {
  const { session, error: authError } = await requireAuth(request)
  if (authError) return authError
  const roleError = requireRole(session, "super_admin")
  if (roleError) return roleError

  try {
    const body = await request.json()

    const { title, agents, prompt, type, cronExpression, recipients, requiresApproval } = body as {
      title: string
      agents: string[]
      prompt: string
      type?: string
      cronExpression?: string
      recipients?: string[]
      requiresApproval?: boolean
    }

    if (!title || !agents?.length || !prompt) {
      return errorResponse("title, agents, and prompt are required", 400)
    }

    const nextRun = cronExpression ? getNextRun(cronExpression) : null

    const [task] = await db
      .insert(tasks)
      .values({
        type: type ?? "single",
        title,
        agents,
        prompt,
        cronExpression: cronExpression ?? null,
        nextRun,
        recipients: recipients ?? null,
        requiresApproval: requiresApproval ?? true,
        createdBy: session.user.id,
      })
      .returning()

    return successResponse(task, 201)
  } catch (error) {
    return errorResponse(
      "Failed to create task",
      500,
      error instanceof Error ? error.message : undefined,
    )
  }
}
