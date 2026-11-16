import { clients, db, sql } from "@cuik/db"
import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { z } from "zod"
import { errorResponse, successResponse } from "@/lib/api-utils"
import { clientIp } from "@/lib/client-ip"
import { isSilentClient } from "@/lib/loyalty/archive"
import { privacyTenant } from "@/lib/privacy/notice"
import { preferencesPath } from "@/lib/privacy/shared"
import { preferencesToken } from "@/lib/privacy/token"
import { checkRateLimit, HOUR_MS } from "@/lib/rate-limit"
import { TURNSTILE_FAILED_MESSAGE, verifyTurnstile } from "@/lib/turnstile"

const bodySchema = z.object({
  email: z.string().trim().email().max(254),
  turnstileToken: z.string().max(4096).optional(),
})

/**
 * POST /api/[tenant]/preferences/link — emails a client the link to give or
 * withdraw the promotions authorization. Always answers "sent": whether an
 * address is registered is never revealed.
 */
export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return errorResponse("Ingresa un correo válido", 400)

    const ip = clientIp(request)
    if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
      return errorResponse(TURNSTILE_FAILED_MESSAGE, 400, { code: "turnstile_failed" })
    }
    const email = parsed.data.email.toLowerCase()
    if (
      !checkRateLimit(`preferences-link:ip:${ip}`, 10, HOUR_MS) ||
      !checkRateLimit(`preferences-link:email:${email}`, 3, HOUR_MS)
    ) {
      return successResponse({ sent: true })
    }

    const tenant = await privacyTenant(slug)
    if (!tenant) return successResponse({ sent: true })

    const [client] = await db
      .select({ id: clients.id, name: clients.name, status: clients.status })
      .from(clients)
      .where(sql`LOWER(${clients.email}) = ${email} AND ${clients.tenantId} = ${tenant.id}`)
      .limit(1)
    if (!client || isSilentClient(client.status)) return successResponse({ sent: true })

    const token = preferencesToken(client.id)
    if (!token) {
      console.error("[preferences/link] BETTER_AUTH_SECRET is not configured")
      return successResponse({ sent: true })
    }
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://cuik.org").replace(/\/+$/, "")
    const link = `${appUrl}${preferencesPath(slug)}?token=${encodeURIComponent(token)}`

    void sendEmail({
      to: email,
      subject: `Tus preferencias de promociones — ${tenant.name}`,
      template: MensajePersonalizado({
        preview: `Elige si ${tenant.name} puede escribirte con promociones`,
        heading: `Hola, ${client.name}`,
        paragraphs: [
          `Pediste cambiar si ${tenant.name} puede escribirte por WhatsApp o correo con promociones y novedades.`,
          "Abre el enlace para elegir. Vale por 24 horas. Si no lo pediste, ignora este correo: no cambia nada.",
          "Los avisos de tu tarjeta en el pase no dependen de esto; puedes desactivarlos desde tu Wallet.",
        ],
        cta: { label: "Elegir mis preferencias", url: link },
      }),
    })
      .then((r) => {
        if ("error" in r) console.error("[preferences/link]", r.error)
      })
      .catch((err) => console.error("[preferences/link]", err))

    return successResponse({ sent: true })
  } catch (error) {
    console.error("[POST /api/[tenant]/preferences/link]", error)
    return errorResponse("Internal server error", 500)
  }
}
