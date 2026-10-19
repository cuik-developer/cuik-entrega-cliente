import { clients, db, sql } from "@cuik/db"
import { z } from "zod"
import { errorResponse, resolveTenant, successResponse } from "@/lib/api-utils"
import { clientIp } from "@/lib/client-ip"
import { checkRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit"

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

    // 60 lookups per 10 minutes per IP (a shop Wi-Fi is shared by many customers). Keyed on the IP alone: an IP+email key
    // let one client enumerate unlimited addresses (a fresh bucket per email).
    if (!checkRateLimit(`check-email:${clientIp(request)}`, 60, 10 * 60 * 1000)) {
      return errorResponse(RATE_LIMIT_MESSAGE, 429)
    }

    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      // Stored emails may carry capitals (older sign-ups): compare case-insensitively,
      // the same way send-pass-link looks the client up.
      .where(sql`LOWER(${clients.email}) = ${email} AND ${clients.tenantId} = ${tenant.id}`)
      .limit(1)

    return successResponse({ exists: rows.length > 0 })
  } catch (error) {
    console.error("[POST /api/[tenant]/check-email]", error)
    return errorResponse("Internal server error", 500)
  }
}
