import { and, db, eq, sql, tasks } from "@cuik/db"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { getNextRun } from "@/lib/office/cron-utils"
import { executeCollaborativeTask, executeTask } from "@/lib/office/orchestrator"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    // Verify cron secret
    const cronSecret = request.headers.get("x-cron-secret")
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return errorResponse("Unauthorized", 401)
    }

    // Find active tasks with cron that are due
    const dueTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "active"),
          sql`${tasks.cronExpression} IS NOT NULL`,
          sql`${tasks.nextRun} IS NOT NULL`,
          sql`${tasks.nextRun} <= NOW()`,
        ),
      )

    const errors: string[] = []
    let processed = 0

    for (const task of dueTasks) {
      try {
        console.log(`[cron/office-tasks] Executing task "${task.title}" (${task.id})`)

        const agentIds = task.agents as string[]
        const execute =
          task.type === "collaborative" && agentIds.length > 1
            ? executeCollaborativeTask
            : executeTask

        await execute(task.id)
        processed++

        // Calculate next run and update task
        const nextRun = getNextRun(task.cronExpression!)
        await db
          .update(tasks)
          .set({
            lastRun: new Date(),
            nextRun,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, task.id))

        console.log(`[cron/office-tasks] Task "${task.title}" done, next run: ${nextRun.toISOString()}`)
      } catch (err) {
        const msg = `Task ${task.id} ("${task.title}"): ${err instanceof Error ? err.message : String(err)}`
        errors.push(msg)
        console.error(`[cron/office-tasks] ${msg}`)
      }
    }

    return successResponse({ processed, errors })
  } catch (error) {
    console.error("[POST /api/cron/office-tasks]", error)
    return errorResponse("Internal server error", 500)
  }
}
