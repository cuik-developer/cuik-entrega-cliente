import { z } from "zod"

const YMD = /^\d{4}-\d{2}-\d{2}$/
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

/** Fiscal data + monthly fee + billing day of a tenant (super-admin only). */
export const tenantBillingSchema = z.object({
  ruc: z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .regex(/^\d{11}$/, "El RUC tiene 11 dígitos")
      .nullable()
      .optional(),
  ),
  razonSocial: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  direccionFiscal: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional()),
  billingEmail: z.preprocess(
    emptyToNull,
    z.string().trim().email("Correo inválido").max(200).nullable().optional(),
  ),
  contactoPagos: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  monthlyAmount: z.number().min(0).max(1_000_000).nullable().optional(),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  serviceStartOn: z.preprocess(
    emptyToNull,
    z.string().regex(YMD, "Fecha inválida").nullable().optional(),
  ),
  billingDay: z.number().int().min(1).max(28).nullable().optional(),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional()),
})

export type TenantBillingInput = z.infer<typeof tenantBillingSchema>

export const invoiceStatusSchema = z.enum(["pending", "paid", "void"])

export const createInvoiceSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo inválido (AAAA-MM)"),
  issuedOn: z.string().regex(YMD, "Fecha inválida"),
  number: z.preprocess(emptyToNull, z.string().trim().max(60).nullable().optional()),
  amount: z.number().min(0).max(1_000_000),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  status: invoiceStatusSchema.default("pending"),
  paidOn: z.preprocess(emptyToNull, z.string().regex(YMD, "Fecha inválida").nullable().optional()),
  note: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
})

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>

export const updateInvoiceSchema = createInvoiceSchema.partial()

export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
