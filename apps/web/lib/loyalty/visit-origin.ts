export type VisitBonusKind = "birthday" | "special_hour"

/**
 * The bonus kind stored on a visit, from the rules engine's applied reasons.
 * Only one bonus ever applies (the highest wins): birthday, or any hour /
 * day multiplier ("hora especial", legacy double days).
 */
export function visitBonusKind(bonusReasons: string[]): VisitBonusKind | null {
  if (bonusReasons.length === 0) return null
  if (bonusReasons.some((r) => r === "birthday_bonus" || r === "birthday_multiplier")) {
    return "birthday"
  }
  return "special_hour"
}

/**
 * The visit's Origen, the same in the cashier history and the visits export:
 * a bonus wins over how the visit came in (QR or Manual).
 */
export function visitOriginLabel(source: string | null, bonusKind: string | null): string {
  if (source === "bonus") return "Bono de registro"
  if (bonusKind === "birthday") return "Bono de cumpleaños"
  if (bonusKind === "special_hour") return "Bono hora especial"
  if (source === "manual") return "Manual"
  if (source === "qr") return "QR"
  return source ?? ""
}
