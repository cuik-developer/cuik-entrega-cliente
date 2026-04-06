import { clients, db, sql } from "@cuik/db"
import { AccesoPase, sendEmail } from "@cuik/email"
import { z } from "zod"
import { errorResponse, resolveTenant, successResponse } from "@/lib/api-utils"
import { generateClientToken } from "@/lib/client-token"
import { checkRateLimit } from "@/lib/rate-limit"

const bodySchema = z.object({
  email: z.string().email(),
})

export async function POST(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase()

    // Rate limit: max 3 per email per 10 minutes
    const allowed = checkRateLimit(`send-pass:${normalizedEmail}`, 3)
    if (!allowed) {
      // Return success anyway to prevent enumeration of rate-limited emails
      return successResponse({ sent: true })
    }

    const tenant = await resolveTenant(slug)
    if (!tenant) {
      // Return success to prevent tenant enumeration
      return successResponse({ sent: true })
    }

    // Find client by normalized email + tenant
    const clientRows = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(
        sql`LOWER(${clients.email}) = ${normalizedEmail} AND ${clients.tenantId} = ${tenant.id}`,
      )
      .limit(1)

    const client = clientRows[0]

    if (!client) {
      // Log for debugging but return success to prevent email enumeration
      console.log("[send-pass-link] No client found for email in tenant", {
        email: normalizedEmail,
        slug,
      })
      return successResponse({ sent: true })
    }

    // Generate stateless HMAC token (24h expiry)
    const secret = process.env.BETTER_AUTH_SECRET
    if (!secret) {
      console.error("[send-pass-link] BETTER_AUTH_SECRET is not configured")
      return successResponse({ sent: true })
    }

    const token = generateClientToken(secret, client.id)

    // Build access link from request headers
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https"
    const forwardedHost =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost"
    const accessLink = `${forwardedProto}://${forwardedHost}/${slug}/bienvenido?clientToken=${token}`

    // Fire-and-forget email send
    void sendEmail({
      to: normalizedEmail,
      subject: `Acced\u00e9 a tu pase \u2014 ${tenant.name}`,
      template: AccesoPase({ clientName: client.name, organizationName: tenant.name, accessLink }),
    })
      .then((r) => {
        if ("error" in r) console.error("[send-pass-link]", r.error)
      })
      .catch((err) => console.error("[send-pass-link]", err))

    return successResponse({ sent: true })
  } catch (error) {
    console.error("[POST /api/[tenant]/send-pass-link]", error)
    return errorResponse("Internal server error", 500)
  }
}
