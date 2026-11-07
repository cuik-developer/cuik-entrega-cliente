import { and, complaints, count, db, eq, isNotNull, ne, passDesigns, solicitudes } from "@cuik/db"
import type { AdminAlert, AlertKind } from "@/lib/admin/admin-alerts-types"
import { collectAdminAlerts } from "@/lib/admin/admin-digest"
import type { AdminModuleKey } from "@/lib/admin/admin-modules"
import { limaYmd } from "@/lib/business-days"
import { deadlineBadge } from "@/lib/complaints"
import { type AdminAccess, canAccess } from "@/lib/staff-permissions"

/**
 * "Pendientes" on the super-admin launcher: what needs someone today, each
 * line sent to the module and screen that resolves it. Only real counts.
 */

export type HomePending = {
  key: string
  module: AdminModuleKey
  tone: "bad" | "warn" | "info"
  /** Short bold part, e.g. "3 solicitudes". */
  lead: string
  text: string
  href: string
}

const ALERT_MODULE: Record<AlertKind, AdminModuleKey> = {
  billing: "finanzas",
  cold: "loyalty",
  demo: "crm",
  cert: "loyalty",
  campaign: "loyalty",
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function fromAlert(a: AdminAlert): HomePending {
  return {
    key: a.key,
    module: ALERT_MODULE[a.kind],
    tone: a.severity === "critical" ? "bad" : a.severity === "warning" ? "warn" : "info",
    // Alert texts are full sentences: the comercio goes first as a label.
    lead: `${a.who} ·`,
    text: a.text,
    // The digest builds absolute links for email; stay on this origin here.
    href: a.href.replace(/^https?:\/\/[^/]+/, "") || "/admin",
  }
}

async function ownerPendings(): Promise<HomePending[]> {
  const [[pendingRequests], openComplaints, alerts] = await Promise.all([
    db.select({ n: count() }).from(solicitudes).where(eq(solicitudes.status, "pending")),
    db
      .select({ status: complaints.status, dueOn: complaints.dueOn })
      .from(complaints)
      .where(ne(complaints.status, "closed")),
    collectAdminAlerts().catch((err) => {
      console.error("[home-pendings] alerts", err)
      return [] as AdminAlert[]
    }),
  ])

  const out: HomePending[] = []
  if (pendingRequests && pendingRequests.n > 0) {
    out.push({
      key: "solicitudes",
      module: "crm",
      tone: "warn",
      lead: plural(pendingRequests.n, "solicitud", "solicitudes"),
      text: "esperan revisión.",
      href: "/admin/solicitudes",
    })
  }

  const today = limaYmd()
  const urgent = openComplaints
    .map((c) => deadlineBadge({ status: c.status, dueOn: c.dueOn }, today))
    .filter((b) => b.tone === "bad" || b.tone === "warn")
  if (urgent.length > 0) {
    const late = urgent.filter((b) => b.tone === "bad").length
    out.push({
      key: "reclamaciones",
      module: "reclamaciones",
      tone: late > 0 ? "bad" : "warn",
      lead: plural(urgent.length, "reclamación", "reclamaciones"),
      text:
        late > 0
          ? `por responder, ${late} ya vencida${late === 1 ? "" : "s"}.`
          : "vencen en 3 días hábiles o menos.",
      href: "/admin/reclamaciones",
    })
  }

  return out.concat(alerts.map(fromAlert))
}

async function designsAwaitingReview(): Promise<HomePending | null> {
  const [row] = await db
    .select({ n: count() })
    .from(passDesigns)
    .where(and(isNotNull(passDesigns.reviewRequestedAt), eq(passDesigns.isActive, false)))
  if (!row || row.n === 0) return null
  return {
    key: "disenos",
    module: "loyalty",
    tone: "info",
    lead: plural(row.n, "diseño", "diseños"),
    text: row.n === 1 ? "está listo para publicar." : "están listos para publicar.",
    href: "/admin/pases",
  }
}

const TONE_ORDER = { bad: 0, warn: 1, info: 2 } as const

export async function loadHomePendings(access: AdminAccess): Promise<HomePending[]> {
  const [owner, designs] = await Promise.all([
    access.kind === "super_admin" ? ownerPendings() : Promise.resolve([]),
    canAccess(access, "designs_publish") ? designsAwaitingReview() : Promise.resolve(null),
  ])
  const all = designs ? [...owner, designs] : owner
  return all.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
}
