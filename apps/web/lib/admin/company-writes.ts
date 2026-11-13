import type { TaxProfileInput } from "@cuik/shared/validators"

/** True when a failed write hit a UNIQUE constraint (Drizzle keeps the PG error on `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } } | null)?.cause
  return cause?.code === "23505"
}

/** Columns of a tax profile from the validated input (numerics as strings). */
export function profileValues(v: TaxProfileInput, userId: string, wasValidated: boolean) {
  return {
    issuerId: v.issuerId,
    fromMonth: v.fromMonth,
    regime: v.regime,
    igvRate: String(v.igvRate),
    monthlyRate: String(v.monthlyRate),
    annualBrackets: v.annualBrackets,
    representationCapPct: String(v.representationCapPct),
    representationCapUit: String(v.representationCapUit),
    validatedByAccountant: v.validatedByAccountant,
    // Stamp when it is first marked validated; clear it when unmarked.
    ...(v.validatedByAccountant
      ? wasValidated
        ? {}
        : { validatedAt: new Date() }
      : { validatedAt: null }),
    notes: v.notes,
    updatedBy: userId,
    updatedAt: new Date(),
  }
}
