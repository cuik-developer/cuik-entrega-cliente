import { z } from "zod"
import { rucSchema } from "./billing-schema"

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

export const financeMonthSchema = z.string().regex(MONTH, "Mes inválido (AAAA-MM)")
export const financeCurrencySchema = z.enum(["PEN", "USD"])
export const financeRecognitionSchema = z.enum(["spread", "cash"])
const everyMonthsSchema = z
  .number()
  .int()
  .refine((n) => [1, 3, 6, 12].includes(n), "Periodicidad inválida")

/** PUT /api/admin/finance/fx — one rate per month. */
export const fxRateSchema = z.object({
  month: financeMonthSchema,
  usdPen: z.number().positive().max(100),
})
export type FxRateInput = z.infer<typeof fxRateSchema>

export const recurringItemSchema = z.object({
  type: z.enum(["cost", "income"]),
  category: z.string().trim().min(1, "Indica la categoría").max(60),
  name: z.string().trim().min(1, "Indica el nombre").max(120),
  amount: z.number().min(0).max(10_000_000),
  currency: financeCurrencySchema.default("PEN"),
  everyMonths: everyMonthsSchema.default(1),
  fromMonth: financeMonthSchema,
  toMonth: z.preprocess(emptyToNull, financeMonthSchema.nullable().optional()),
  recognition: financeRecognitionSchema.default("spread"),
  notes: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
  active: z.boolean().default(true),
})
export type RecurringItemInput = z.infer<typeof recurringItemSchema>
export const updateRecurringItemSchema = recurringItemSchema.partial()

export const financeEntrySchema = z.object({
  type: z.enum(["cost", "income", "contribution", "return"]),
  category: z.string().trim().min(1, "Indica la categoría").max(60),
  name: z.string().trim().min(1, "Indica el nombre").max(120),
  amount: z.number().min(0).max(10_000_000),
  currency: financeCurrencySchema.default("PEN"),
  month: financeMonthSchema,
  months: z.number().int().min(1).max(24).default(1),
  recognition: financeRecognitionSchema.default("spread"),
  tenantId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  notes: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
})
export type FinanceEntryInput = z.infer<typeof financeEntrySchema>
export const updateFinanceEntrySchema = financeEntrySchema.partial()

export const loanSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre").max(120),
  principal: z.number().min(0).max(100_000_000),
  currency: financeCurrencySchema.default("PEN"),
  installment: z.number().min(0).max(10_000_000),
  installments: z.number().int().min(1).max(360),
  firstMonth: financeMonthSchema,
  notes: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
})
export type LoanInput = z.infer<typeof loanSchema>
export const updateLoanSchema = loanSchema.partial()

/** GET /api/admin/finance/ledger — window, break-even ticket and output format. */
const windowMonthSchema = financeMonthSchema.refine((m) => m >= "2000-01" && m <= "2099-12", {
  message: "Mes fuera de rango",
})
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v)
const monthSpan = (a: string, b: string) => {
  const [ya, ma] = a.split("-").map(Number)
  const [yb, mb] = b.split("-").map(Number)
  return (yb - ya) * 12 + (mb - ma)
}
export const financeLedgerQuerySchema = z
  .object({
    from: z.preprocess(emptyToUndefined, windowMonthSchema.optional()),
    to: z.preprocess(emptyToUndefined, windowMonthSchema.optional()),
    /** Average monthly ticket per merchant (PEN) for the break-even figure; default = current average. */
    ticket: z.preprocess(emptyToUndefined, z.coerce.number().positive().max(1_000_000).optional()),
    /** "1": fold open prospects into the projection, weighted by probability. */
    prospects: z.enum(["0", "1"]).default("0"),
    format: z.enum(["json", "xlsx"]).default("json"),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "El mes final es anterior al inicial",
    path: ["to"],
  })
  .refine((q) => !q.from || !q.to || monthSpan(q.from, q.to) <= 120, {
    message: "Máximo 10 años",
    path: ["to"],
  })
export type FinanceLedgerQuery = z.infer<typeof financeLedgerQuerySchema>

/** CRM stages, in pipeline order. */
export const PROSPECT_STAGES = [
  "lead",
  "demo_scheduled",
  "demo_done",
  "proposal",
  "negotiation",
  "won",
  "lost",
  "standby",
] as const
export type ProspectStageValue = (typeof PROSPECT_STAGES)[number]
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)")
const optText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional())
const optDate = z.preprocess(emptyToNull, dateSchema.nullable().optional())

export const prospectSchema = z.object({
  name: z.string().trim().min(1, "Indica el nombre del negocio").max(120),
  contactName: optText(120),
  phone: optText(40),
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email("Correo inválido").nullable().optional(),
  ),
  city: optText(80),
  source: optText(80),
  stage: z.enum(PROSPECT_STAGES).default("lead"),
  probability: z.number().int().min(0).max(100).default(20),
  planId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  monthlyAmount: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.number().min(0).max(10_000_000).nullable().optional(),
  ),
  currency: financeCurrencySchema.default("PEN"),
  intervalMonths: everyMonthsSchema.default(1),
  billingMode: z.enum(["advance", "arrears"]).default("arrears"),
  expectedStartMonth: z.preprocess(emptyToNull, financeMonthSchema.nullable().optional()),
  expectedCloseOn: optDate,
  demoStartOn: optDate,
  demoEndOn: optDate,
  tenantId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  nextStep: optText(200),
  nextStepOn: optDate,
  lostReason: optText(200),
  notes: optText(2000),
})
export type ProspectInput = z.infer<typeof prospectSchema>
export const updateProspectSchema = prospectSchema.partial()

/** Suggested categories (free text is allowed; these seed the selects). */
export const FINANCE_COST_CATEGORIES = [
  "Infraestructura",
  "Licencias y software",
  "Marketing",
  "Operación",
  "Personal",
  "Financiero",
  "Impuestos",
  "Otros",
] as const
export const FINANCE_INCOME_CATEGORIES = ["Servicios", "Consultoría", "Diseño", "Otros"] as const

// ── Contabilidad: emisor, régimen y UIT (migration 0047) ───────────────────

const nullableMonth = z.preprocess(emptyToNull, financeMonthSchema.nullable())
const rate = z.number().min(0).max(1)

/** POST /api/admin/finance/issuers, PATCH …/[id] (whole object). */
export const issuerSchema = z
  .object({
    ruc: rucSchema,
    razonSocial: z.string().trim().min(1, "Falta la razón social").max(200),
    nombreComercial: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
    domicilioFiscal: z.preprocess(emptyToNull, z.string().trim().max(300).nullable()),
    fromMonth: nullableMonth,
    toMonth: nullableMonth,
    notes: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
  })
  .refine((v) => !v.fromMonth || !v.toMonth || v.fromMonth <= v.toMonth, {
    message: "El mes final es anterior al inicial",
    path: ["toMonth"],
  })
export type IssuerInput = z.infer<typeof issuerSchema>

export const TAX_REGIMES = ["rmt", "rer", "general"] as const

const annualBracketSchema = z.object({
  /** Upper limit of the bracket in UIT of net income; null = no ceiling (last bracket). */
  upToUit: z.number().positive().max(100_000).nullable(),
  rate,
})

/** POST /api/admin/finance/tax-profiles, PATCH …/[id] (whole object). */
export const taxProfileSchema = z
  .object({
    issuerId: z.string().uuid(),
    fromMonth: financeMonthSchema,
    regime: z.enum(TAX_REGIMES),
    igvRate: rate,
    monthlyRate: rate,
    annualBrackets: z.array(annualBracketSchema).max(6),
    representationCapPct: rate,
    representationCapUit: z.number().min(0).max(100_000),
    validatedByAccountant: z.boolean(),
    notes: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
  })
  .refine(
    (v) =>
      (v.annualBrackets.length === 0 || v.annualBrackets.at(-1)?.upToUit === null) &&
      v.annualBrackets.every((b, i, all) => {
        if (b.upToUit === null) return i === all.length - 1
        const prev = i === 0 ? 0 : (all[i - 1]?.upToUit ?? Number.POSITIVE_INFINITY)
        return b.upToUit > prev
      }),
    {
      message: "Los tramos deben ir de menor a mayor y el último no debe tener tope",
      path: ["annualBrackets"],
    },
  )
export type TaxProfileInput = z.infer<typeof taxProfileSchema>

/** PUT /api/admin/finance/uit — the UIT of one year. */
export const uitValueSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  value: z.number().positive().max(1_000_000),
})
export type UitValueInput = z.infer<typeof uitValueSchema>

// ── Contabilidad: comprobantes y proveedores (migration 0048) ──────────────

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
export const DOC_TYPES = ["01", "03", "07", "08", "02", "12", "14", "91", "00"] as const
export const IGV_TREATMENTS = [
  "credito",
  "sin_credito",
  "representacion",
  "no_domiciliado",
] as const
/** Always positive: a credit note subtracts because of its type (07), never by its sign. */
const money = z.number().min(0, "Escribe el monto en positivo").max(1_000_000)
const realDate = (v: string) => {
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}
const SALE_DOC_TYPES: readonly string[] = ["01", "03", "07", "08"]
const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional())

/** POST /api/admin/finance/suppliers, PUT …/[id]. */
export const supplierSchema = z
  .object({
    docType: z.enum(["ruc", "dni", "foreign"]),
    docNumber: optionalText(30),
    name: z.string().trim().min(1, "Falta el nombre").max(200),
    country: z.string().trim().length(2).toUpperCase().default("PE"),
    domiciled: z.boolean(),
    defaultCategory: optionalText(60),
    defaultIgvTreatment: z.preprocess(emptyToNull, z.enum(IGV_TREATMENTS).nullable().optional()),
    notes: optionalText(1000),
  })
  .refine(
    (v) => v.docType !== "ruc" || (v.docNumber != null && rucSchema.safeParse(v.docNumber).success),
    {
      message: "RUC inválido: revisa los dígitos",
      path: ["docNumber"],
    },
  )
  .refine((v) => v.docType !== "dni" || (v.docNumber != null && /^\d{8}$/.test(v.docNumber)), {
    message: "El DNI tiene 8 dígitos",
    path: ["docNumber"],
  })
export type SupplierInput = z.infer<typeof supplierSchema>

/**
 * POST /api/admin/finance/documents, PUT …/[id] (whole object). Sales need a
 * counterparty name (or a tenant); purchases a supplier and an IGV treatment.
 * Base + no gravada + IGV must add up to the total.
 */
export const documentSchema = z
  .object({
    direction: z.enum(["sale", "purchase"]),
    docType: z.enum(DOC_TYPES),
    serie: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,4}$/, "Serie inválida (hasta 4 letras o números)"),
    numero: z
      .string()
      .trim()
      .regex(/^\d{1,10}$/, "Número inválido (solo dígitos)"),
    issueDate: z.string().regex(YMD_RE, "Fecha inválida").refine(realDate, "Fecha inválida"),
    taxPeriod: financeMonthSchema,
    tenantId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    supplierId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    counterpartyDoc: optionalText(30),
    counterpartyName: optionalText(200),
    currency: financeCurrencySchema,
    fxRate: z.number().positive().max(100).nullable().optional(),
    baseGravada: money,
    baseNoGravada: money,
    igv: money,
    total: money,
    igvTreatment: z.preprocess(emptyToNull, z.enum(IGV_TREATMENTS).nullable().optional()),
    rentaDeductible: z.preprocess(
      emptyToNull,
      z.enum(["si", "no", "limitado"]).nullable().optional(),
    ),
    category: optionalText(60),
    detraccionRate: z.number().min(0).max(1).nullable().optional(),
    detraccionConstancia: optionalText(60),
    relatedDocumentId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    paidOn: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(YMD_RE, "Fecha inválida")
        .refine(realDate, "Fecha inválida")
        .nullable()
        .optional(),
    ),
    notes: optionalText(1000),
    /**
     * Purchases: create the cost in Costos e ingresos (management ledger). On
     * edit, false removes the cost the purchase created; omitted keeps it.
     */
    createCostEntry: z.boolean().optional(),
    /**
     * Purchases: the fixed cost of Costos e ingresos this is the receipt of
     * (no new cost is created). Omitted = unchanged on edit.
     */
    recurringItemId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  })
  .refine(
    (v) => Math.abs(Math.round((v.baseGravada + v.baseNoGravada + v.igv - v.total) * 100)) <= 2,
    { message: "Base + no gravado + IGV no suman el total", path: ["total"] },
  )
  .refine((v) => v.currency === "PEN" || (v.fxRate ?? 0) > 0, {
    message: "Falta el tipo de cambio del comprobante",
    path: ["fxRate"],
  })
  .refine((v) => v.direction === "sale" || !!v.supplierId, {
    message: "Elige el proveedor",
    path: ["supplierId"],
  })
  .refine((v) => v.direction === "sale" || !!v.igvTreatment, {
    message: "Indica cómo se trata el IGV",
    path: ["igvTreatment"],
  })
  .refine((v) => v.direction === "purchase" || SALE_DOC_TYPES.includes(v.docType), {
    message: "Ese tipo de comprobante no se emite",
    path: ["docType"],
  })
  .refine((v) => v.direction === "purchase" || !!v.tenantId || !!v.counterpartyName, {
    message: "Indica el cliente",
    path: ["counterpartyName"],
  })
export type DocumentInput = z.infer<typeof documentSchema>
