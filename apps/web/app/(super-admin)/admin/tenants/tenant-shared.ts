import {
  describePointsRate,
  expirationPolicySchema,
  type PointsRate,
} from "@cuik/shared/validators"
import { toast } from "sonner"
import { describeExpirationPolicy } from "@/lib/loyalty/expiration"
import type { TenantHealth } from "./tenant-health"

// ── Types ───────────────────────────────────────────────────────────

export interface ApiTenant {
  id: string
  slug: string
  name: string
  status: TenantStatus
  planId: string | null
  trialEndsAt: string | null
  activatedAt: string | null
  ownerId: string | null
  createdAt: string
  updatedAt: string
  branding: unknown
  clientCount: number
  visitCount: number
  rewardCount: number
  returnRate: number
  planName: string | null
  health?: TenantHealth
  businessType: string | null
  address: string | null
  phone: string | null
  contactEmail: string | null
  timezone: string | null
  segmentationConfig: {
    frequentMaxDays?: number
    oneTimeInactiveDays?: number
    riskMultiplier?: number
    newClientDays?: number
  } | null
  appleConfig: {
    mode?: string
    passTypeId?: string
    teamId?: string
    configuredAt?: string
    expiresAt?: string
  } | null
}

export interface ApiPlan {
  id: string
  name: string
  maxLocations: number
  maxPromos: number
  maxClients: number
  features: unknown
  createdAt: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export type TenantStatus = "pending" | "trial" | "active" | "expired" | "cancelled" | "paused"

export type PlanModalAction = "activate" | "change" | "reactivate"

export interface TenantPromotion {
  id: string
  type: string
  maxVisits: number | null
  rewardValue: string | null
  active: boolean
  config: unknown
  passDesignId: string | null
}

export const statusConfig: Record<TenantStatus, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  trial: { label: "Demo 7 dias", color: "bg-blue-100 text-blue-700 border-blue-200" },
  active: { label: "Activo", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  expired: { label: "Vencido", color: "bg-red-100 text-red-700 border-red-200" },
  cancelled: { label: "Cancelado", color: "bg-slate-100 text-slate-600 border-slate-200" },
  paused: { label: "Pausado", color: "bg-orange-100 text-orange-700 border-orange-200" },
}

// ── Shared PATCH helper ──────────────────────────────────────────────

/** Opens the merchant panel in read-only mode (1 h) in a new tab. */
export async function openTenantPanel(tenantId: string) {
  const res = await fetch("/api/admin/sa-view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId }),
  })
  if (!res.ok) {
    toast.error("No se pudo abrir la vista del comercio")
    return
  }
  window.open("/panel", "_blank")
}

export async function patchTenant(
  tenantId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const res = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) {
      return { ok: false, error: json.error ?? `Error ${res.status}` }
    }
    return { ok: true, data: json.data }
  } catch {
    return { ok: false, error: "Error de conexion" }
  }
}

/* ────────────────────────────────────────────────────────────
   Business type options for the edit form
   ──────────────────────────────────────────────────────────── */
export const BUSINESS_TYPE_OPTIONS = [
  "Cafeteria",
  "Restaurante",
  "Barberia",
  "Pet Shop",
  "Panaderia",
  "Heladeria",
  "Bar",
  "Tienda de ropa",
  "Gimnasio",
  "Spa",
  "Otro",
] as const

/** One-line summary of the active promotion: "Puntos · 1 punto por cada S/ 4.50 · Se reinician cada miercoles". */
export function describePromotion(promo: TenantPromotion): string {
  const cfg = (promo.config ?? {}) as Record<string, unknown>
  if (promo.type === "points") {
    const pts = (cfg.points ?? {}) as Record<string, unknown>
    const policy = expirationPolicySchema.safeParse(pts.pointsExpiration)
    const expiry = policy.success ? describeExpirationPolicy(policy.data) : "Sin vencimiento"
    return ["Puntos", describePointsRate(pts as PointsRate), expiry].join(" · ")
  }
  const parts = ["Sellos"]
  if (promo.maxVisits) parts.push(`${promo.maxVisits} visitas`)
  if (promo.rewardValue) parts.push(promo.rewardValue)
  return parts.join(" · ")
}
