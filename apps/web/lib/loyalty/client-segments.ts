// Smart client segmentation — behavior-based segments computed on-the-fly

export type ClientSegment =
  | "nuevo"
  | "frecuente"
  | "esporadico"
  | "one_time"
  | "en_riesgo"
  | "inactivo"

export const SEGMENT_LABELS: Record<ClientSegment, string> = {
  nuevo: "Nuevo",
  frecuente: "Frecuente",
  esporadico: "Esporadico",
  one_time: "Una visita",
  en_riesgo: "En riesgo",
  inactivo: "Inactivo",
}

export const SEGMENT_COLORS: Record<ClientSegment, string> = {
  nuevo: "bg-sky-100 text-sky-700",
  frecuente: "bg-emerald-100 text-emerald-700",
  esporadico: "bg-amber-100 text-amber-700",
  one_time: "bg-slate-100 text-slate-600",
  en_riesgo: "bg-orange-100 text-orange-700",
  inactivo: "bg-red-100 text-red-700",
}

export type ClientSegmentInput = {
  createdAt: Date
  totalVisits: number
  lastVisitAt: Date | null
  avgDaysBetweenVisits: number | null
}

// ── Configurable thresholds ─────────────────────────────────────────

export type SegmentationThresholds = {
  frequentMaxDays: number // Client is "frecuente" if avg interval < this
  oneTimeInactiveDays: number // Client is "one_time" if single visit and no return in this many days
  riskMultiplier: number // Client is "en_riesgo" if absent > avg * this multiplier
  newClientDays: number // Client is "nuevo" if created within this many days
}

export const DEFAULT_THRESHOLDS: SegmentationThresholds = {
  frequentMaxDays: 7,
  oneTimeInactiveDays: 30,
  riskMultiplier: 3,
  newClientDays: 7,
}

export const BUSINESS_TYPE_DEFAULTS: Record<string, SegmentationThresholds> = {
  Cafeteria: { frequentMaxDays: 5, oneTimeInactiveDays: 15, riskMultiplier: 3, newClientDays: 7 },
  Cafe: { frequentMaxDays: 5, oneTimeInactiveDays: 15, riskMultiplier: 3, newClientDays: 7 },
  Restaurante: {
    frequentMaxDays: 7,
    oneTimeInactiveDays: 21,
    riskMultiplier: 3,
    newClientDays: 7,
  },
  Barberia: {
    frequentMaxDays: 21,
    oneTimeInactiveDays: 45,
    riskMultiplier: 3,
    newClientDays: 14,
  },
  Peluqueria: {
    frequentMaxDays: 21,
    oneTimeInactiveDays: 45,
    riskMultiplier: 3,
    newClientDays: 14,
  },
  Veterinaria: {
    frequentMaxDays: 30,
    oneTimeInactiveDays: 60,
    riskMultiplier: 3,
    newClientDays: 14,
  },
  Gym: { frequentMaxDays: 3, oneTimeInactiveDays: 14, riskMultiplier: 3, newClientDays: 7 },
  Gimnasio: { frequentMaxDays: 3, oneTimeInactiveDays: 14, riskMultiplier: 3, newClientDays: 7 },
  Spa: { frequentMaxDays: 14, oneTimeInactiveDays: 30, riskMultiplier: 3, newClientDays: 7 },
  Panaderia: { frequentMaxDays: 4, oneTimeInactiveDays: 14, riskMultiplier: 3, newClientDays: 7 },
  Lavanderia: {
    frequentMaxDays: 10,
    oneTimeInactiveDays: 30,
    riskMultiplier: 3,
    newClientDays: 7,
  },
}

/**
 * Normalize a string for case-insensitive, accent-insensitive matching.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/**
 * Resolve segmentation thresholds by merging:
 * 1. DEFAULT_THRESHOLDS (base)
 * 2. Business type defaults (if match found — case/accent-insensitive)
 * 3. Tenant overrides (any non-null fields override)
 */
export function getThresholds(
  businessType?: string | null,
  tenantOverrides?: Partial<SegmentationThresholds> | null,
): SegmentationThresholds {
  let thresholds = { ...DEFAULT_THRESHOLDS }

  // Apply business type defaults if match found
  if (businessType) {
    const normalized = normalizeForMatch(businessType)
    const matchedKey = Object.keys(BUSINESS_TYPE_DEFAULTS).find(
      (key) => normalizeForMatch(key) === normalized,
    )
    if (matchedKey) {
      thresholds = { ...thresholds, ...BUSINESS_TYPE_DEFAULTS[matchedKey] }
    }
  }

  // Apply tenant overrides on top
  if (tenantOverrides) {
    if (tenantOverrides.frequentMaxDays != null)
      thresholds.frequentMaxDays = tenantOverrides.frequentMaxDays
    if (tenantOverrides.oneTimeInactiveDays != null)
      thresholds.oneTimeInactiveDays = tenantOverrides.oneTimeInactiveDays
    if (tenantOverrides.riskMultiplier != null)
      thresholds.riskMultiplier = tenantOverrides.riskMultiplier
    if (tenantOverrides.newClientDays != null)
      thresholds.newClientDays = tenantOverrides.newClientDays
  }

  return thresholds
}

/**
 * Compute a behavior-based segment for a client.
 * Pure function — no DB access, no side effects.
 *
 * Priority order matters: more specific segments are checked first.
 * Accepts optional thresholds for per-tenant/business-type configuration.
 */
export function computeClientSegment(
  client: ClientSegmentInput,
  thresholds: SegmentationThresholds = DEFAULT_THRESHOLDS,
): ClientSegment {
  const now = new Date()
  const daysSinceCreation = daysBetween(client.createdAt, now)

  // nuevo: created within newClientDays AND has <= 1 visit
  if (daysSinceCreation <= thresholds.newClientDays && client.totalVisits <= 1) {
    return "nuevo"
  }

  // inactivo: 0 visits AND created oneTimeInactiveDays+ ago
  if (client.totalVisits === 0 && daysSinceCreation >= thresholds.oneTimeInactiveDays) {
    return "inactivo"
  }

  // one_time: exactly 1 visit AND last visit oneTimeInactiveDays+ ago
  if (client.totalVisits === 1 && client.lastVisitAt) {
    const daysSinceLastVisit = daysBetween(client.lastVisitAt, now)
    if (daysSinceLastVisit >= thresholds.oneTimeInactiveDays) {
      return "one_time"
    }
  }

  // en_riesgo: was frecuente (3+ visits, avg < frequentMaxDays) but hasn't visited in riskMultiplier * avg
  if (
    client.totalVisits >= 3 &&
    client.avgDaysBetweenVisits !== null &&
    client.avgDaysBetweenVisits < thresholds.frequentMaxDays &&
    client.lastVisitAt
  ) {
    const daysSinceLastVisit = daysBetween(client.lastVisitAt, now)
    if (daysSinceLastVisit >= client.avgDaysBetweenVisits * thresholds.riskMultiplier) {
      return "en_riesgo"
    }
  }

  // frecuente: 3+ visits AND avg days between visits < frequentMaxDays
  if (
    client.totalVisits >= 3 &&
    client.avgDaysBetweenVisits !== null &&
    client.avgDaysBetweenVisits < thresholds.frequentMaxDays
  ) {
    return "frecuente"
  }

  // esporadico: 3+ visits AND avg days between visits >= frequentMaxDays
  if (
    client.totalVisits >= 3 &&
    client.avgDaysBetweenVisits !== null &&
    client.avgDaysBetweenVisits >= thresholds.frequentMaxDays
  ) {
    return "esporadico"
  }

  // Default fallback: nuevo (recently created with few visits but >newClientDays, etc.)
  return "nuevo"
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime())
  return ms / (1000 * 60 * 60 * 24)
}
