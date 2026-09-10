import {
  campaigns,
  clientNotes,
  clients,
  db,
  desc,
  eq,
  locations,
  notifications,
  promotions,
  rewards,
  sql,
  user,
  visits,
} from "@cuik/db"

export type TimelineEventType =
  | "visit"
  | "reward_earned"
  | "reward_redeemed"
  | "reward_expired"
  | "note"
  | "status_change"
  | "campaign"
  | "registered"

export type TimelineEvent = {
  id: string
  type: TimelineEventType
  /** ISO timestamp (UTC). */
  at: string
  title: string
  detail?: string
  /** Who did it, when known (cashier, note author). */
  by?: string
}

const PER_SOURCE_LIMIT = 200

type VisitRow = {
  id: string
  at: Date
  visitNum: number
  cycleNumber: number
  source: string
  amount: string | null
  points: number | null
  locationName: string | null
  cashierName: string | null
}

type RewardRow = {
  id: string
  createdAt: Date
  redeemedAt: Date | null
  expiresAt: Date | null
  status: string
  rewardType: string | null
  cycleNumber: number
}

type NoteRow = { id: string; at: Date; content: string; author: string | null }

type NotifRow = {
  id: string
  at: Date | null
  status: string
  campaignName: string
  message: string | null
}

function visitEvent(v: VisitRow, isPointsProgram: boolean): TimelineEvent {
  const bits: string[] = []
  if (v.locationName) bits.push(v.locationName)
  if (v.amount && Number(v.amount) > 0) bits.push(`S/ ${Number(v.amount).toFixed(2)}`)
  // visits.points is also written by stamp programs (1 per visit); only meaningful for points.
  if (isPointsProgram && v.points && v.points > 0) bits.push(`+${v.points} pts`)
  if (v.source === "manual") bits.push("registro manual")
  if (v.source === "bonus") bits.push("bonus")
  return {
    id: `visit-${v.id}`,
    type: "visit",
    at: v.at.toISOString(),
    title: `Visita · sello ${v.visitNum} (ciclo ${v.cycleNumber})`,
    detail: bits.length ? bits.join(" · ") : undefined,
    by: v.cashierName ?? undefined,
  }
}

/** One reward can produce up to two events: earned, then redeemed or expired. */
function rewardEvents(r: RewardRow): TimelineEvent[] {
  const name = r.rewardType ?? "Premio"
  const out: TimelineEvent[] = [
    {
      id: `reward-earned-${r.id}`,
      type: "reward_earned",
      at: r.createdAt.toISOString(),
      title: `Ganó un premio: ${name}`,
      detail: `Ciclo ${r.cycleNumber} completado${r.expiresAt ? ` · vence ${r.expiresAt.toISOString()}` : ""}`,
    },
  ]
  if (r.status === "redeemed" && r.redeemedAt) {
    out.push({
      id: `reward-redeemed-${r.id}`,
      type: "reward_redeemed",
      at: r.redeemedAt.toISOString(),
      title: `Canjeó su premio: ${name}`,
    })
  } else if (r.status === "expired") {
    out.push({
      id: `reward-expired-${r.id}`,
      type: "reward_expired",
      at: (r.expiresAt ?? r.createdAt).toISOString(),
      title: `Premio vencido sin canjear: ${name}`,
    })
  }
  return out
}

// Block/unblock writes an audit note (see PATCH /clients/[id]); show it as its own event.
const STATUS_NOTE = /^Cliente (bloqueado|desbloqueado)\.?(?: Motivo: (.*))?$/s

function noteEvent(n: NoteRow): TimelineEvent {
  const m = STATUS_NOTE.exec(n.content)
  if (m) {
    return {
      id: `note-${n.id}`,
      type: "status_change",
      at: n.at.toISOString(),
      title: m[1] === "bloqueado" ? "Cliente bloqueado" : "Cliente desbloqueado",
      detail: m[2] ? `Motivo: ${m[2]}` : undefined,
      by: n.author ?? undefined,
    }
  }
  return {
    id: `note-${n.id}`,
    type: "note",
    at: n.at.toISOString(),
    title: "Nota",
    detail: n.content,
    by: n.author ?? undefined,
  }
}

const NOTIF_STATUS_LABEL: Record<string, string> = {
  failed: "no se pudo entregar",
  delivered: "entregada",
  sent: "enviada",
}

function campaignEvent(n: Omit<NotifRow, "at"> & { at: Date }): TimelineEvent {
  return {
    id: `campaign-${n.id}`,
    type: "campaign",
    at: n.at.toISOString(),
    title: `Campaña "${n.campaignName}" ${NOTIF_STATUS_LABEL[n.status] ?? n.status}`,
    detail: n.message ?? undefined,
  }
}

/**
 * Everything that happened to one client, newest first, from five tables:
 * visits, rewards (earned / redeemed / expired), notes, campaign
 * notifications and the registration itself. Read-only; the ficha renders it
 * as one chronological feed so a claim ("I came last week", "I never got my
 * reward") can be settled from a single screen.
 */
export async function getClientTimeline(params: {
  tenantId: string
  clientId: string
  limit?: number
}): Promise<TimelineEvent[]> {
  const { tenantId, clientId } = params
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500)

  const [clientRows, promoRows, visitRows, rewardRows, noteRows, notifRows] = await Promise.all([
    db
      .select({ createdAt: clients.createdAt })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1),

    db
      .select({ type: promotions.type })
      .from(promotions)
      .where(sql`${promotions.tenantId} = ${tenantId} AND ${promotions.active} = true`)
      .limit(1),

    db
      .select({
        id: visits.id,
        at: visits.createdAt,
        visitNum: visits.visitNum,
        cycleNumber: visits.cycleNumber,
        source: visits.source,
        amount: visits.amount,
        points: visits.points,
        locationName: locations.name,
        cashierName: user.name,
      })
      .from(visits)
      .leftJoin(locations, eq(locations.id, visits.locationId))
      .leftJoin(user, eq(user.id, visits.registeredBy))
      .where(sql`${visits.clientId} = ${clientId} AND ${visits.tenantId} = ${tenantId}`)
      .orderBy(desc(visits.createdAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: rewards.id,
        createdAt: rewards.createdAt,
        redeemedAt: rewards.redeemedAt,
        expiresAt: rewards.expiresAt,
        status: rewards.status,
        rewardType: rewards.rewardType,
        cycleNumber: rewards.cycleNumber,
      })
      .from(rewards)
      .where(sql`${rewards.clientId} = ${clientId} AND ${rewards.tenantId} = ${tenantId}`)
      .orderBy(desc(rewards.createdAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: clientNotes.id,
        at: clientNotes.createdAt,
        content: clientNotes.content,
        author: user.name,
      })
      .from(clientNotes)
      .leftJoin(user, eq(user.id, clientNotes.createdBy))
      .where(sql`${clientNotes.clientId} = ${clientId} AND ${clientNotes.tenantId} = ${tenantId}`)
      .orderBy(desc(clientNotes.createdAt))
      .limit(PER_SOURCE_LIMIT),

    db
      .select({
        id: notifications.id,
        at: notifications.sentAt,
        status: notifications.status,
        campaignName: campaigns.name,
        message: campaigns.message,
      })
      .from(notifications)
      .innerJoin(campaigns, eq(campaigns.id, notifications.campaignId))
      .where(sql`${notifications.clientId} = ${clientId} AND ${campaigns.tenantId} = ${tenantId}`)
      .orderBy(desc(notifications.sentAt))
      .limit(PER_SOURCE_LIMIT),
  ])

  const registeredAt = clientRows[0]?.createdAt
  const isPointsProgram = promoRows[0]?.type === "points"
  const events: TimelineEvent[] = [
    ...(registeredAt
      ? [
          {
            id: `registered-${clientId}`,
            type: "registered" as const,
            at: registeredAt.toISOString(),
            title: "Se registró en el programa",
          },
        ]
      : []),
    ...visitRows.map((v) => visitEvent(v, isPointsProgram)),
    ...rewardRows.flatMap(rewardEvents),
    ...noteRows.map(noteEvent),
    ...notifRows.flatMap((n) => (n.at ? [campaignEvent({ ...n, at: n.at })] : [])),
  ]

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return events.slice(0, limit)
}
