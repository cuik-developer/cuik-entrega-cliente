import { z } from "zod"

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
