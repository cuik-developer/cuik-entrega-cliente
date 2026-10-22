const BONUS_LABELS: Record<string, string> = {
  birthday_bonus: "Cumpleaños",
  birthday_multiplier: "Cumpleaños",
  double_stamps_day: "Sello doble",
}

/**
 * The rules engine's applied bonuses ("birthday_bonus, Lunes de mañana (×2)")
 * as text for the cashier: "Cumpleaños · Lunes de mañana (×2)".
 */
export function bonusLabel(raw: string): string {
  return raw
    .split(", ")
    .map((r) => BONUS_LABELS[r] ?? r.replace(/^(\d+(?:\.\d+)?)x_multiplier$/, "×$1"))
    .join(" · ")
}
