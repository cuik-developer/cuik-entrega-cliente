import { complaints, db, eq } from "@cuik/db"
import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { z } from "zod"
import { loadComplaints } from "@/lib/admin/complaints-data"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"
import { LEGAL } from "@/lib/legal"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("answer"),
    answer: z.string().trim().min(10, "Escribe la respuesta").max(8000),
    sendEmail: z.boolean().default(true),
  }),
  z.object({ action: z.literal("close") }),
])

/**
 * Answer or close a Hoja de Reclamación. Answering stores the text, marks it
 * answered and, unless unchecked, emails it to the consumer; the answer is
 * saved even when the email fails (`emailed: false` tells the screen).
 */
export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { session, error } = await requireAuth(request)
    if (error) return error
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError
    const { id } = await ctx.params
    if (!UUID.test(id)) return errorResponse("Not found", 404)

    const body = await request.json().catch(() => null)
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())
    const input = parsed.data

    const [row] = await db.select().from(complaints).where(eq(complaints.id, id)).limit(1)
    if (!row) return errorResponse("Not found", 404)

    if (input.action === "close") {
      await db
        .update(complaints)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(complaints.id, id))
      return successResponse({ ...(await loadComplaints()), emailed: null })
    }

    if (row.status === "closed") return errorResponse("La hoja ya está cerrada", 409)
    const now = new Date()
    await db
      .update(complaints)
      .set({
        status: "answered",
        answer: input.answer,
        answeredAt: now,
        answeredBy: session.user.id,
        updatedAt: now,
      })
      .where(eq(complaints.id, id))

    let emailed: boolean | null = null
    if (input.sendEmail) {
      const tipo = row.tipo === "reclamo" ? "reclamo" : "queja"
      const result = await sendEmail({
        to: row.email,
        subject: `Respuesta a tu Hoja de Reclamación ${row.numero}`,
        template: MensajePersonalizado({
          preview: `Respuesta a tu ${tipo} ${row.numero}`,
          heading: `Respuesta a tu ${tipo}`,
          paragraphs: [
            `Hola, ${row.nombre}:`,
            `Esta es la respuesta de ${LEGAL.razonSocial} a tu Hoja de Reclamación N.° ${row.numero}.`,
            input.answer,
            `Si necesitas agregar algo, responde a este correo citando el número ${row.numero}.`,
          ],
        }),
      }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }))
      emailed = !("error" in result)
      if (!emailed) console.error("[PATCH /api/admin/complaints/[id]] email", row.numero, result)
    }
    return successResponse({ ...(await loadComplaints()), emailed })
  } catch (err) {
    console.error("[PATCH /api/admin/complaints/[id]]", err)
    return errorResponse("Internal server error", 500)
  }
}
