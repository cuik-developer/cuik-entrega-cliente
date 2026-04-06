import { and, clients, db, eq } from "@cuik/db"
import { z } from "zod"
import { errorResponse, resolveTenant, successResponse } from "@/lib/api-utils"
import { checkRateLimit } from "@/lib/rate-limit"

const checkEmailSchema = z.object({
  email: z.string().email(),
})

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const tenant = await resolveTenant(slug)

    if (!tenant) {
      return errorResponse("Tenant not found", 404)
    }

    const body = await request.json()
    const parsed = checkEmailSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const email = parsed.data.email.trim().toLowerCase()

    // Rate limit: 10 requests per 10 minutes per IP+email combo
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const rateLimitKey = `check-email:${ip}:${email}`

    if (!checkRateLimit(rateLimitKey, 10)) {
      return errorResponse("Demasiados intentos", 429)
    }

    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.email, email), eq(clients.tenantId, tenant.id)))
      .limit(1)

    return successResponse({ exists: rows.length > 0 })
  } catch (error) {
    console.error("[POST /api/[tenant]/check-email]", error)
    return errorResponse("Internal server error", 500)
  }
}
