import type { PromotionType } from "../types"

/** Sample client state shown by the previews. */
export interface PreviewState {
  promotionType: PromotionType
  /** Visits per card the server uses (promotion first, see effectiveMaxVisits). */
  maxVisits: number
  /** Stamps filled in the preview. */
  current: number
  /** "Tarjeta completa": card finished, reward pending at the counter. */
  completed: boolean
  tenantName: string
}

/** Stamps filled in the "en progreso" preview: 3, or fewer on a tiny card. */
export function sampleProgress(maxVisits: number): number {
  return Math.max(0, Math.min(3, maxVisits - 1))
}

/**
 * Resolve template variables like {{client.name}} to preview values, with
 * the same stamp numbers the server would send (a completed card reports
 * current = max and remaining = 0, as the Apple routes do).
 */
export function resolvePreviewValue(value: string, s: PreviewState): string {
  const current = s.completed ? s.maxVisits : s.current
  const previewValues: Record<string, string> = {
    "{{client.name}}": "Juan Perez",
    "{{client.lastName}}": "Perez",
    "{{client.tier}}": "Regular",
    "{{client.phone}}": "+51 999 888 777",
    "{{client.email}}": "cliente@email.com",
    "{{client.birthday}}": "15/03",
    "{{stamps.current}}": String(current),
    "{{stamps.max}}": String(s.maxVisits),
    "{{stamps.remaining}}": String(Math.max(0, s.maxVisits - current)),
    "{{stamps.total}}": s.promotionType === "points" ? "12" : String(current + s.maxVisits),
    "{{points.balance}}": "325",
    "{{rewards.pending}}": s.completed ? "1" : "0",
    "{{tenant.name}}": s.tenantName,
  }

  let resolved = value
  for (const [key, val] of Object.entries(previewValues)) {
    resolved = resolved.replaceAll(key, val)
  }
  // Resolve {{client.customData.*}} to a readable placeholder based on the key name
  resolved = resolved.replace(/\{\{client\.customData\.(\w+)\}\}/g, (_match, key: string) =>
    key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim(),
  )
  // Catch any remaining unresolved {{...}} patterns
  resolved = resolved.replace(/\{\{[^}]+\}\}/g, "—")
  return resolved
}

/**
 * Google `loyaltyPoints.balance.string`, built like buildBalanceText in
 * packages/wallet/src/google/loyalty-object.ts (keep both in sync).
 */
export function googleBalanceText(s: PreviewState): string {
  if (s.promotionType === "points") return "325 puntos"
  if (s.completed) return `${s.maxVisits} de ${s.maxVisits} visitas | Premio disponible!`
  const remaining = s.maxVisits - s.current
  return `${s.current} de ${s.maxVisits} visitas | Te faltan ${remaining} para el premio`
}

/** Google `loyaltyPoints.label`, as buildLoyaltyPointsLabel. */
export function googleBalanceLabel(promotionType: PromotionType): string {
  return promotionType === "points" ? "Puntos" : "Sellos"
}
