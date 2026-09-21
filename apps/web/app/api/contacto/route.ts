import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { z } from "zod"

import { errorResponse, successResponse } from "@/lib/api-utils"

export const dynamic = "force-dynamic"

const PROFILES = {
  negocio: "Tengo un negocio",
  cliente: "Ya uso Cuik",
  otro: "Prensa o alianzas",
} as const

const contactSchema = z.object({
  name: z.string().trim().min(2, "Cuéntanos tu nombre").max(120),
  business: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().trim().email("Revisa el correo"),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  profile: z.enum(["negocio", "cliente", "otro"]).default("negocio"),
  source: z.string().trim().max(80).optional().or(z.literal("")),
  newsletter: z.boolean().optional().default(false),
  message: z.string().trim().min(10, "Cuéntanos un poco más").max(3000),
  // Honeypot: real people never fill it in.
  website: z.string().optional(),
})

/**
 * POST /api/contacto — public contact form. Emails the super-admin inbox
 * (SA_EMAIL) with the message and a reply-to hint. Nothing is stored: a
 * contact is a conversation, not a demo request (those go to /api/solicitudes).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const parsed = contactSchema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Revisa los campos marcados", 400, parsed.error.flatten())
    }
    const d = parsed.data
    // Bots that filled the honeypot get a quiet 200 and nothing else.
    if (d.website) return successResponse({ sent: true })

    const to = process.env.SA_EMAIL || "sa@cuik.app"
    const lines = [
      `Perfil: ${PROFILES[d.profile]}`,
      `Nombre: ${d.name}`,
      d.business ? `Negocio: ${d.business}` : null,
      `Correo: ${d.email}`,
      d.phone ? `WhatsApp: ${d.phone}` : null,
      d.source ? `Nos conoció: ${d.source}` : null,
      `Novedades por correo: ${d.newsletter ? "sí" : "no"}`,
    ].filter((l): l is string => Boolean(l))

    await sendEmail({
      to,
      subject: `Contacto web · ${PROFILES[d.profile]} · ${d.name}`,
      template: MensajePersonalizado({
        preview: d.message.slice(0, 90),
        heading: "Nuevo mensaje desde cuik.org/contacto",
        paragraphs: [lines.join("\n"), d.message, `Responde directamente a ${d.email}.`],
        cta: { label: `Responder a ${d.name}`, url: `mailto:${d.email}` },
      }),
    })

    return successResponse({ sent: true })
  } catch (error) {
    console.error("[POST /api/contacto]", error)
    return errorResponse("No pudimos enviar tu mensaje. Escríbenos por WhatsApp.", 502)
  }
}
