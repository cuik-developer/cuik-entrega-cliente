import { z } from "zod"

const YMD = /^\d{4}-\d{2}-\d{2}$/
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
const RUC_PREFIXES = ["10", "15", "16", "17", "20"]

/**
 * A Peruvian RUC: 11 digits, a valid type prefix (10 persona natural, 20
 * empresa, 15/16/17 otros) and the SUNAT modulo-11 check digit.
 */
export function isValidRuc(value: string): boolean {
  if (!/^\d{11}$/.test(value) || !RUC_PREFIXES.includes(value.slice(0, 2))) return false
  const sum = RUC_WEIGHTS.reduce((acc, w, i) => acc + w * Number(value[i]), 0)
  const check = (11 - (sum % 11)) % 10
  return check === Number(value[10])
}

/** RUC field: empty clears it; otherwise 11 digits with a valid check digit. */
export const rucSchema = z
  .string()
  .trim()
  .regex(/^\d{11}$/, "El RUC tiene 11 dígitos")
  .refine(isValidRuc, "RUC inválido: revisa los dígitos")

const fiscalFields = {
  ruc: z.preprocess(emptyToNull, rucSchema.nullable().optional()),
  razonSocial: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  direccionFiscal: z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional()),
  billingEmail: z.preprocess(
    emptyToNull,
    z.string().trim().email("Correo inválido").max(200).nullable().optional(),
  ),
}

/**
 * PUT /api/admin/tenants/[id]/fiscal — the merchant's billing identity, edited
 * in "Datos del negocio". Writes only these fields of `tenant_billing`.
 */
export const tenantFiscalSchema = z.object({
  ...fiscalFields,
  isRetentionAgent: z.boolean().default(false),
})
export type TenantFiscalInput = z.infer<typeof tenantFiscalSchema>

/**
 * Fiscal data + monthly fee + billing day of a tenant (super-admin only).
 * The route writes the fiscal fields only when the body carries them (the
 * Facturación form no longer does; "Datos del negocio" owns them).
 */
export const tenantBillingSchema = z.object({
  ...fiscalFields,
  /** Whether the monthly amount already includes IGV. Omitted = unchanged. */
  amountIncludesIgv: z.boolean().optional(),
  contactoPagos: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  monthlyAmount: z.number().min(0).max(1_000_000).nullable().optional(),
  currency: z.enum(["PEN", "USD"]).default("PEN"),
  serviceStartOn: z.preprocess(
    emptyToNull,
    z.string().regex(YMD, "Fecha inválida").nullable().optional(),
  ),
  billingDay: z.number().int().min(1).max(28).nullable().optional(),
  /** "advance": the month is invoiced at its start; "arrears": once it ended (DB default). Omitted = unchanged. */
  billingMode: z.enum(["advance", "arrears"]).optional(),
  /** Months per invoice: 1, 3, 6 or 12. Omitted = unchanged. */
  billingIntervalMonths: z
    .number()
    .int()
    .refine((n) => [1, 3, 6, 12].includes(n), "Periodicidad inválida")
    .optional(),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional()),
})

export type TenantBillingInput = z.infer<typeof tenantBillingSchema>

export const invoiceStatusSchema = z.enum(["pending", "paid", "void"])

export const createInvoiceSchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Periodo inválido (AAAA-MM)"),
  /** Months of service covered from `period`. */
  months: z
    .number()
    .int()
    .refine((n) => [1, 3, 6, 12].includes(n), "Cobertura inválida")
    .default(1),
  /** How the amount counts in finance: month by month, or all in the month paid. */
  recognition: z.enum(["spread", "cash"]).default("spread"),
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
