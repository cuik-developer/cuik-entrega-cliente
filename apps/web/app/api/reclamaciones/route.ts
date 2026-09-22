import { MensajePersonalizado, sendEmail } from "@cuik/email"
import { z } from "zod"

import { errorResponse, successResponse } from "@/lib/api-utils"
import { LEGAL } from "@/lib/legal"

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
})

/**
 * POST /api/reclamaciones — Hoja de Reclamación virtual. Numbers the sheet,
 * emails a copy to the consumer and the original to Cuik. Not persisted in
 * the database yet: the number is derived from the timestamp so it is unique
 * and traceable from the email itself.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
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

    const now = new Date()
    const lima = new Intl.DateTimeFormat("es-PE", {
      timeZone: "America/Lima",
      dateStyle: "long",
      timeStyle: "short",
    }).format(now)
    const numero = `LR-${now.getFullYear()}-${now.getTime().toString(36).toUpperCase()}`
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
    await Promise.all([
      sendEmail({
        to,
        subject: `Libro de Reclamaciones · ${tipo} ${numero} · ${d.nombre}`,
        template: template("Nueva Hoja de Reclamación", [
          `Responder a ${d.email} dentro de 15 días hábiles.`,
        ]),
      }),
      sendEmail({
        to: d.email,
        subject: `Copia de tu Hoja de Reclamación ${numero}`,
        template: template(`Recibimos tu ${tipo.toLowerCase()}`, [
          `Esta es tu copia. ${LEGAL.razonSocial} responderá en un plazo máximo de 15 días hábiles, conforme al Código de Protección y Defensa del Consumidor. Si necesitas agregar algo, responde a este correo citando el número ${numero}.`,
        ]),
      }),
    ])

    return successResponse({ numero, fecha: lima }, 201)
  } catch (error) {
    console.error("[POST /api/reclamaciones]", error)
    return errorResponse("No pudimos registrar tu reclamo. Escríbenos por correo.", 502)
  }
}
