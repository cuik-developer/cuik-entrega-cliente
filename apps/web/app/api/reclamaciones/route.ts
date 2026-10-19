import { complaints, db, eq } from "@cuik/db"
import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { z } from "zod"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { complaintDueOn, limaYmd } from "@/lib/business-days"
import { clientIp } from "@/lib/client-ip"
import { emailStatusOf, longDate } from "@/lib/complaints"
import { LEGAL, LEGAL_PAGES_ENABLED } from "@/lib/legal"
import { notifyDecision, sendCapReachedNotice } from "@/lib/notify-cap"
import { checkRateLimit, DAY_MS, HOUR_MS, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit"
import { TURNSTILE_FAILED_MESSAGE, verifyTurnstile } from "@/lib/turnstile"

export const dynamic = "force-dynamic"

const schema = z.object({
  nombre: z.string().trim().min(3, "Ingresa tu nombre completo").max(160),
  documentoTipo: z.enum(["DNI", "CE", "Pasaporte"]),
  documento: z.string().trim().min(6, "Revisa el número de documento").max(20),
  domicilio: z.string().trim().min(5, "Ingresa tu domicilio").max(240),
  telefono: z.string().trim().min(6, "Ingresa un teléfono").max(40),
  email: z.string().trim().email("Revisa el correo"),
  menor: z.boolean().default(false),
  apoderado: z.string().trim().max(160).optional().or(z.literal("")),
  bienTipo: z.enum(["producto", "servicio"]),
  bienDescripcion: z.string().trim().min(3, "Describe el producto o servicio").max(240),
  monto: z
    .string()
    .trim()
    .regex(/^(\d+([.,]\d{1,2})?)?$/, "Ingresa un monto válido")
    .optional()
    .or(z.literal("")),
  tipo: z.enum(["reclamo", "queja"]),
  detalle: z.string().trim().min(20, "Cuéntanos con más detalle").max(4000),
  pedido: z.string().trim().min(5, "Indica qué solución esperas").max(2000),
  acepta: z.literal(true, { errorMap: () => ({ message: "Debes aceptar la declaración" }) }),
  turnstileToken: z.string().max(4096).optional(),
})

const limaDateTime = (d: Date) =>
  new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "long",
    timeStyle: "short",
  }).format(d)

/** Honeypot: a hidden `website` field real people never fill in. */
const filledHoneypot = (body: unknown) =>
  Boolean(body && typeof body === "object" && (body as { website?: unknown }).website)

/** What a bot that filled the honeypot gets: a plausible 201, nothing stored or emailed. */
function fakeFiled() {
  const now = new Date()
  return successResponse(
    {
      numero: `LR-${limaYmd(now).slice(0, 4)}-${now.getTime().toString(36).toUpperCase()}`,
      fecha: limaDateTime(now),
    },
    201,
  )
}

/**
 * Turnstile, then 3 sheets per IP per hour and 3 per consumer email per day.
 * Runs after validation, so typos never use up a consumer's attempts.
 */
async function antiSpam(request: Request, email: string, token: string | undefined) {
  const ip = clientIp(request)
  if (!(await verifyTurnstile(token, ip))) {
    return errorResponse(TURNSTILE_FAILED_MESSAGE, 400, { code: "turnstile_failed" })
  }
  if (
    !checkRateLimit(`reclamaciones:ip:${ip}`, 3, HOUR_MS) ||
    !checkRateLimit(`reclamaciones:email:${email.toLowerCase()}`, 3, DAY_MS)
  ) {
    return errorResponse(RATE_LIMIT_MESSAGE, 429)
  }
  return null
}

/**
 * POST /api/reclamaciones — Hoja de Reclamación virtual. Numbers the sheet,
 * stores it in public.complaints with its legal due date (15 business days,
 * Lima — see lib/business-days.ts), then emails the original to Cuik and a
 * copy to the consumer. The sheet counts as filed once stored: a failed email
 * is only recorded in `email_status`; it is answered from /admin/reclamaciones.
 */
export async function POST(request: Request) {
  if (!LEGAL_PAGES_ENABLED) return errorResponse("No disponible", 404)
  try {
    const body = await request.json().catch(() => null)
    if (filledHoneypot(body)) return fakeFiled()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return errorResponse("Revisa los campos marcados", 400, parsed.error.flatten())
    }
    const d = parsed.data
    if (d.menor && !d.apoderado) {
      return errorResponse("Revisa los campos marcados", 400, {
        formErrors: [],
        fieldErrors: { apoderado: ["Indica el nombre del apoderado"] },
      })
    }

    const blocked = await antiSpam(request, d.email, d.turnstileToken)
    if (blocked) return blocked

    const now = new Date()
    const lima = limaDateTime(now)
    const dueOn = complaintDueOn(now)
    const vence = longDate(dueOn)

    // Store first: if this fails the consumer is told to write by email (502).
    // The number comes from the timestamp; on a same-millisecond clash, bump it.
    let numero = ""
    for (let attempt = 0; ; attempt++) {
      numero = `LR-${limaYmd(now).slice(0, 4)}-${(now.getTime() + attempt).toString(36).toUpperCase()}`
      try {
        await db.insert(complaints).values({
          numero,
          tipo: d.tipo,
          nombre: d.nombre,
          documentoTipo: d.documentoTipo,
          documento: d.documento,
          domicilio: d.domicilio,
          telefono: d.telefono,
          email: d.email,
          menor: d.menor,
          apoderado: d.menor && d.apoderado ? d.apoderado : null,
          bienTipo: d.bienTipo,
          bienDescripcion: d.bienDescripcion,
          monto: d.monto ? d.monto.replace(",", ".") : null,
          detalle: d.detalle,
          pedido: d.pedido,
          dueOn,
          createdAt: now,
          updatedAt: now,
        })
        break
      } catch (err) {
        if ((err as { code?: string })?.code === "23505" && attempt < 3) continue
        throw err
      }
    }
    const tipo = d.tipo === "reclamo" ? "Reclamo" : "Queja"

    const lines = [
      `Hoja de Reclamación N.° ${numero}`,
      `Fecha: ${lima}`,
      "",
      `Consumidor: ${d.nombre}`,
      `${d.documentoTipo}: ${d.documento}`,
      `Domicilio: ${d.domicilio}`,
      `Teléfono: ${d.telefono}`,
      `Correo: ${d.email}`,
      d.menor ? `Menor de edad. Apoderado: ${d.apoderado}` : null,
      "",
      `Bien contratado: ${d.bienTipo === "producto" ? "Producto" : "Servicio"} — ${d.bienDescripcion}`,
      d.monto ? `Monto reclamado: S/ ${d.monto}` : null,
      "",
      `Tipo: ${tipo}`,
    ].filter((l): l is string => l !== null)

    const template = (heading: string, tail: string[]) =>
      MensajePersonalizado({
        preview: `${tipo} ${numero}`,
        heading,
        paragraphs: [lines.join("\n"), `Detalle:\n${d.detalle}`, `Pedido:\n${d.pedido}`, ...tail],
      })

    const to = process.env.SA_EMAIL || "sa@cuik.app"
    // Daily cap on Cuik's own notification (lib/notify-cap.ts). The sheet is
    // already stored and the consumer always gets their copy.
    const decision = notifyDecision("reclamaciones")
    if (decision === "cap-reached") void sendCapReachedNotice("reclamaciones")
    const results = await Promise.allSettled([
      ...(decision === "send"
        ? [
            sendEmail({
              to,
              subject: `Libro de Reclamaciones · ${tipo} ${numero} · ${d.nombre}`,
              template: template("Nueva Hoja de Reclamación", [
                `Responder a ${d.email} a más tardar el ${vence} (15 días hábiles), desde Super-admin › Reclamaciones.`,
              ]),
            }),
          ]
        : []),
      sendEmail({
        to: d.email,
        subject: `Copia de tu Hoja de Reclamación ${numero}`,
        template: template(`Recibimos tu ${tipo.toLowerCase()}`, [
          `Esta es tu copia. ${LEGAL.razonSocial} responderá en un plazo máximo de 15 días hábiles, conforme al Código de Protección y Defensa del Consumidor: a más tardar el ${vence}. Si necesitas agregar algo, responde a este correo citando el número ${numero}.`,
        ]),
      }),
    ])
    const emailStatus = emailStatusOf(results)
    if (emailStatus !== "sent") {
      console.error("[POST /api/reclamaciones] email", numero, emailStatus, results)
    }
    // Already filed: a failure here must not turn the 201 into an error.
    await db
      .update(complaints)
      .set({ emailStatus })
      .where(eq(complaints.numero, numero))
      .catch((err) => console.error("[POST /api/reclamaciones] email_status", numero, err))

    return successResponse({ numero, fecha: lima }, 201)
  } catch (error) {
    console.error("[POST /api/reclamaciones]", error)
    return errorResponse("No pudimos registrar tu reclamo. Escríbenos por correo.", 502)
  }
}
