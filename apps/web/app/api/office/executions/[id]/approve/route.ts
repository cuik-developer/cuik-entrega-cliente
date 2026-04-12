import { db, eq, executions, tasks, tenants } from "@cuik/db"
import { ReporteAprobado, sendEmail } from "@cuik/email"
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
    .select()
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

  // Send email notification on approval (fire-and-forget)
  if (action === "approve") {
    sendReportEmail(execution.taskId, execution.output).catch((err) =>
      console.error("[approve] Email notification failed (non-fatal):", err),
    )
  }

  return successResponse(updated)
}

async function sendReportEmail(taskId: string, output: unknown) {
  // Get task with recipients
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1)

  if (!task) return

  // Get tenant contact email
  const [tenant] = await db
    .select({ name: tenants.name, contactEmail: tenants.contactEmail })
    .from(tenants)
    .where(eq(tenants.slug, "mascota-veloz"))
    .limit(1)

  // Build deduplicated recipient list
  const recipientSet = new Set<string>()
  const taskRecipients = task.recipients as string[] | null
  if (taskRecipients) {
    for (const r of taskRecipients) {
      if (r) recipientSet.add(r.toLowerCase().trim())
    }
  }
  if (tenant?.contactEmail) {
    recipientSet.add(tenant.contactEmail.toLowerCase().trim())
  }

  if (recipientSet.size === 0) {
    console.log("[approve] No recipients configured, skipping email")
    return
  }

  // Extract output data
  const outputData = output as { text?: string; attachments?: Array<{ name: string; url: string }> } | null
  const summary = outputData?.text?.slice(0, 200) ?? ""
  const attachment = outputData?.attachments?.[0]
  const downloadUrl = attachment?.url ?? ""

  if (!downloadUrl) {
    console.log("[approve] No attachment URL in output, skipping email")
    return
  }

  const recipients = Array.from(recipientSet)
  const tenantName = tenant?.name ?? "Tu negocio"

  console.log(`[approve] Sending report email to: ${recipients.join(", ")}`)

  await sendEmail({
    to: recipients,
    subject: `Reporte aprobado: ${task.title}`,
    template: ReporteAprobado({
      taskTitle: task.title,
      summary: summary + (outputData?.text && outputData.text.length > 200 ? "..." : ""),
      downloadUrl,
      tenantName,
    }),
  })
}
