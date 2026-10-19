import { db, solicitudes } from "@cuik/db"
import { SolicitudRecibida, sendEmail } from "@cuik/email"
import { createSolicitudSchema } from "@cuik/shared/validators"
import { errorResponse, successResponse } from "@/lib/api-utils"
import { clientIp } from "@/lib/client-ip"
import { checkRateLimit, HOUR_MS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit"
import { TURNSTILE_FAILED_MESSAGE, verifyTurnstile } from "@/lib/turnstile"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    // Honeypot: real people never fill it in. Bots get a quiet 201, nothing stored.
    if (body && typeof body === "object" && (body as { website?: unknown }).website) {
      return successResponse({ received: true }, 201)
    }
    const parsed = createSolicitudSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const ip = clientIp(request)
    const token = (body as { turnstileToken?: unknown }).turnstileToken
    if (!(await verifyTurnstile(typeof token === "string" ? token : null, ip))) {
      return errorResponse(TURNSTILE_FAILED_MESSAGE, 400, { code: "turnstile_failed" })
    }
    if (!checkRateLimit(`solicitudes:ip:${ip}`, 5, HOUR_MS)) {
      return errorResponse(RATE_LIMIT_MESSAGE, 429)
    }

    const [solicitud] = await db
      .insert(solicitudes)
      .values({
        businessName: parsed.data.businessName,
        businessType: parsed.data.businessType,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        city: parsed.data.city,
      })
      .returning()

    // Notify SA about new solicitud (fire-and-forget)
    const saEmail = process.env.SA_EMAIL || "sa@cuik.app"
    sendEmail({
      to: saEmail,
      subject: `Nueva solicitud: ${solicitud.businessName}`,
      template: SolicitudRecibida({
        businessName: solicitud.businessName,
        contactName: solicitud.contactName,
        contactEmail: solicitud.email,
        phone: solicitud.phone ?? "",
        message: "",
      }),
    }).catch((err) => console.error("[EMAIL] Failed to send solicitud notification:", err))

    return successResponse(solicitud, 201)
  } catch (error) {
    console.error("[POST /api/solicitudes]", error)
    return errorResponse("Internal server error", 500)
  }
}
