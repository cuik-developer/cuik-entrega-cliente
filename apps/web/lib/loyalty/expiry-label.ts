/**
 * "jue 8 oct": label of an expiry instant for screens that render in the
 * browser (the till, the client page). The instant is the midnight AFTER the
 * last valid day, so the label names that day. Uses the browser timezone,
 * which for a cashier standing in the shop is the tenant's.
 */
export function expiryLabel(expiresAt: string | Date): string {
  const lastValid = new Date(new Date(expiresAt).getTime() - 1)
  return lastValid
    .toLocaleDateString("es-PE", { weekday: "short", day: "numeric", month: "short" })
    .replace(/\./g, "")
    .replace(",", "")
}

/** "Vencen el jue 8 oct" or "20 puntos vencen el jue 8 oct" depending on whether all the balance expires then. */
export function expiryPhrase(
  next: { amount: number; expiresAt: string | Date } | null | undefined,
  balance: number,
): string | null {
  if (!next) return null
  const when = expiryLabel(next.expiresAt)
  return next.amount >= balance ? `Vencen el ${when}` : `${next.amount} puntos vencen el ${when}`
}
