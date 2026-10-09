import { z } from "zod"
import { listAdminCampaigns } from "@/lib/admin/campaign-admin"
import { errorResponse, requireAuth, requireRole, successResponse } from "@/lib/api-utils"

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), "Fecha inválida")
const querySchema = z.object({
  tenantId: z.string().uuid().optional(),
  status: z.enum(["draft", "scheduled", "sending", "sent", "cancelled", "failed"]).optional(),
  from: ymd.optional(),
  to: ymd.optional(),
  search: z.string().max(100).optional(),
  includeInternal: z.enum(["0", "1"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

/** GET /api/admin/campaigns — campaigns of every tenant (super-admin "Campañas"). */
export async function GET(request: Request) {
  try {
    const { session, error: authError } = await requireAuth(request)
    if (authError) return authError
    const roleError = requireRole(session, "super_admin")
    if (roleError) return roleError

    const url = new URL(request.url)
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
    if (!parsed.success) return errorResponse("Filtros inválidos", 400)
    const q = parsed.data
    if (q.from && q.to && q.from > q.to) return errorResponse("El rango está invertido", 400)

    const { rows, total } = await listAdminCampaigns({
      tenantId: q.tenantId,
      status: q.status,
      from: q.from,
      to: q.to,
      search: q.search,
      includeInternal: q.includeInternal === "1",
      page: q.page,
      limit: q.limit,
    })
    return successResponse({
      items: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.limit)),
      },
    })
  } catch (error) {
    console.error("[GET /api/admin/campaigns]", error)
    return errorResponse("Internal server error", 500)
  }
}
