import ExcelJS from "exceljs"
import { z } from "zod"

import {
  errorResponse,
  requireAuth,
  requireRole,
  requireTenantMembership,
  resolveTenant,
} from "@/lib/api-utils"

const bodySchema = z.object({
  rejected: z
    .array(
      z.object({
        row: z.number().int().positive(),
        dni: z.string().nullable(),
        phone: z.string().nullable(),
        reason: z.enum(["not_found", "blocked", "duplicate", "empty"]),
      }),
    )
    .min(1)
    .max(20000),
})

const REASON_LABELS: Record<z.infer<typeof bodySchema>["rejected"][number]["reason"], string> = {
  not_found: "No existe un cliente con ese DNI ni teléfono",
  blocked: "Cliente bloqueado",
  duplicate: "Cliente repetido en el archivo (ya contado en otra fila)",
  empty: "Fila sin DNI ni teléfono",
}

/**
 * POST /api/[tenant]/campaigns/import-recipients/rejected
 * Receives the rejected rows from a previous import and returns them as an
 * .xlsx so the operator can fix and re-upload. Kept server-side so ExcelJS
 * stays out of the browser bundle.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError

    const roleError = requireRole(session, "admin")
    if (roleError) return roleError

    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)
    if (!tenant) return errorResponse("Tenant not found", 404)

    const membershipError = await requireTenantMembership(session, tenant.id)
    if (membershipError) return membershipError

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.flatten())

    const wb = new ExcelJS.Workbook()
    wb.creator = "Cuik"
    const ws = wb.addWorksheet("Rechazados")
    ws.columns = [
      { header: "Fila", key: "row", width: 8 },
      { header: "DNI", key: "dni", width: 16 },
      { header: "Teléfono", key: "phone", width: 18 },
      { header: "Motivo", key: "reason", width: 52 },
    ]
    const header = ws.getRow(1)
    header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 }
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0E70DB" } }
    header.alignment = { vertical: "middle", horizontal: "center" }
    header.height = 24

    for (const r of parsed.data.rejected) {
      ws.addRow({
        row: r.row,
        dni: r.dni ?? "",
        phone: r.phone ?? "",
        reason: REASON_LABELS[r.reason],
      })
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer())
    const date = new Date().toISOString().slice(0, 10)
    return new Response(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="rechazados-${date}.xlsx"`,
      },
    })
  } catch (error) {
    console.error("[POST /api/[tenant]/campaigns/import-recipients/rejected]", error)
    return errorResponse("Internal server error", 500)
  }
}
