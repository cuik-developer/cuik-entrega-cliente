import { db, solicitudes } from "@cuik/db"
import { SolicitudRecibida, sendEmail } from "@cuik/email"
import { createSolicitudSchema } from "@cuik/shared/validators"
import { errorResponse, successResponse } from "@/lib/api-utils"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = createSolicitudSchema.safeParse(body)

    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.flatten())
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
