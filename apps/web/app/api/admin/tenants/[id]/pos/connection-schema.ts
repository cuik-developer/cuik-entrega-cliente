import { z } from "zod"

/**
 * What the super-admin may store as the Odoo server: an https origin on a
 * public host. No path (the client appends /jsonrpc), no credentials, and
 * nothing that points back at our own network from the server side.
 */
const PRIVATE_HOST =
  /^(localhost|.*\.(localhost|local|internal|lan)|\d{1,3}(\.\d{1,3}){3}|\[?[0-9a-f:]+\]?)$/i

export const baseUrlSchema = z
  .string()
  .trim()
  .max(300)
  .transform((raw, ctx) => {
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL inválida" })
      return z.NEVER
    }
    if (url.protocol !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La URL debe empezar con https://" })
      return z.NEVER
    }
    if (url.username || url.password || PRIVATE_HOST.test(url.hostname)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Indica el dominio público de Odoo" })
      return z.NEVER
    }
    if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Indica solo el dominio, sin ruta (por ejemplo https://empresa.odoo.com)",
      })
      return z.NEVER
    }
    return url.origin
  })

/** A calendar day that exists ("2025-13-45" is not one). */
export const dayStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    // Date.parse gives NaN for "2025-13-45" instead of throwing.
    const t = Date.parse(`${d}T00:00:00Z`)
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d
  }, "Fecha inválida")

export const connectionFieldsSchema = z.object({
  baseUrl: baseUrlSchema,
  database: z.string().trim().min(1).max(120),
  login: z.string().trim().min(1).max(200),
})

export const connectionSchema = connectionFieldsSchema.extend({
  /** Omitted or empty keeps the stored key. */
  apiKey: z.string().trim().max(500).optional(),
  startDate: dayStringSchema,
  enabled: z.boolean(),
  retentionDays: z.number().int().min(7).max(365),
  excludedDnis: z
    .array(z.string().trim())
    .max(50)
    .transform((list) => [
      ...new Set(list.map((d) => d.replace(/\D/g, "")).filter((d) => d.length === 8)),
    ]),
})
