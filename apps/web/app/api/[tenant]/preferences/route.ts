import { and, clients, db, eq } from "@cuik/db"
import { z } from "zod"
import { errorResponse, successResponse } from "@/lib/api-utils"
import { clientIp } from "@/lib/client-ip"
import { isSilentClient } from "@/lib/loyalty/archive"
import { setMarketingConsent } from "@/lib/privacy/consent"
import { privacyTenant } from "@/lib/privacy/notice"
import { verifyPreferencesToken } from "@/lib/privacy/token"
import { checkRateLimit, HOUR_MS } from "@/lib/rate-limit"

const bodySchema = z.object({
  token: z.string().min(1).max(512),
  marketingOptIn: z.boolean(),
})

const EXPIRED = "El enlace venció o no es válido. Pide uno nuevo."

/**
 * POST /api/[tenant]/preferences — the client gives or withdraws the promotions
 * authorization with the emailed link. Updates clients.marketing_opt_in and
 * appends the consent event (version, IP, browser) in one transaction.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Solicitud inválida", 400)

    const ip = clientIp(request)
    if (!checkRateLimit(`preferences:ip:${ip}`, 30, HOUR_MS)) {
      return errorResponse("Demasiados intentos. Inténtalo más tarde.", 429)
    }

    const clientId = verifyPreferencesToken(parsed.data.token)
    if (!clientId) return errorResponse(EXPIRED, 401, { code: "expired" })

    const tenant = await privacyTenant(slug)
    if (!tenant) return errorResponse(EXPIRED, 401, { code: "expired" })

    const [client] = await db
      .select({ status: clients.status })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenant.id)))
      .limit(1)
    if (!client || isSilentClient(client.status)) {
      return errorResponse(EXPIRED, 401, { code: "expired" })
    }

    const ok = await setMarketingConsent({
      tenantId: tenant.id,
      clientId,
      granted: parsed.data.marketingOptIn,
      source: "preferencias",
      ip,
      userAgent: request.headers.get("user-agent"),
    })
    if (!ok) return errorResponse(EXPIRED, 401, { code: "expired" })
    return successResponse({ marketingOptIn: parsed.data.marketingOptIn })
  } catch (error) {
    console.error("[POST /api/[tenant]/preferences]", error)
    return errorResponse("Internal server error", 500)
  }
}
