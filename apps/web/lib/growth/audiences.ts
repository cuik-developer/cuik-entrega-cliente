import { leafIs, type Species, speciesOfKey } from "./categories"
import { addDays, daysBetween } from "./dates"
import type { GrowthRules } from "./rules"
import type { ClientStats } from "./stats"

/**
 * Cuik's audiences for pet shops: who belongs (from the client's stats) and
 * from which day they may be suggested. Blocks (cooldown, open send, "No
 * contactar") are applied afterwards by `suggestion()`, the same for every
 * audience, so a client contacted yesterday is never suggested again by a
 * different list.
 */

export type AudienceSlug =
  | "recompra"
  | "en_riesgo"
  | "gato_sin_arena"
  | "perro_sin_snacks"
  | "seco_sin_humedo"
  | "humedo_sin_seco"
  | "antipulgas"
  | "multi_tienda"
  | "activos"

export type AudienceDef = {
  slug: AudienceSlug
  name: string
  /** One line the merchant reads. */
  rule: string
  templateKey: string
  /** Informational: shown with counts, no suggested send. */
  informational?: boolean
  /** Order in which a client's intents are picked when they fall in several (lower first). */
  priority: number
}

export const AUDIENCES: AudienceDef[] = [
  {
    slug: "recompra",
    name: "Recompra próxima",
    rule: "Su día habitual justo antes de la fecha esperada (última compra + su intervalo), máx. 7 días antes. Con menos de 3 compras usa el intervalo de su categoría.",
    templateKey: "recompra",
    priority: 1,
  },
  {
    slug: "en_riesgo",
    name: "En riesgo (te extrañamos)",
    rule: "3 o más compras y más de 1.5× su intervalo sin volver",
    templateKey: "en_riesgo",
    priority: 2,
  },
  {
    slug: "antipulgas",
    name: "Compran antipulgas",
    rule: "Alguna compra de antipulgas o antiparasitarios; aviso a los 45 días",
    templateKey: "antipulgas",
    priority: 3,
  },
  {
    slug: "gato_sin_arena",
    name: "Compra comida de gato, nunca arena",
    rule: "2+ compras en Gatos · Alimento y ninguna en Arenas (12 meses)",
    templateKey: "cross_arena",
    priority: 4,
  },
  {
    slug: "perro_sin_snacks",
    name: "Compra comida de perro, nunca snacks",
    rule: "2+ compras en Perros · Alimento y ninguna en Snacks (12 meses)",
    templateKey: "cross_snacks",
    priority: 4,
  },
  {
    slug: "seco_sin_humedo",
    name: "Alimento seco sin húmedo",
    rule: "2+ compras de seco y ninguna de húmedo para su mascota (12 meses)",
    templateKey: "cross_humedo",
    priority: 5,
  },
  {
    slug: "humedo_sin_seco",
    name: "Húmedo sin seco",
    rule: "2+ compras de húmedo y ninguna de seco para su mascota (12 meses)",
    templateKey: "cross_seco",
    priority: 5,
  },
  {
    slug: "multi_tienda",
    name: "Compra en más de una tienda",
    rule: "Compras en 2 o más tiendas en el año",
    templateKey: "libre",
    informational: true,
    priority: 9,
  },
  {
    slug: "activos",
    name: "Activos",
    rule: "Compraron en los últimos 60 días",
    templateKey: "libre",
    informational: true,
    priority: 9,
  },
]

export const AUDIENCE_BY_SLUG: ReadonlyMap<AudienceSlug, AudienceDef> = new Map(
  AUDIENCES.map((a) => [a.slug, a]),
)

export type MemberDetail = {
  product?: string | null
  brand?: string | null
  species?: Species | null
  /** What the cross-sell proposes ("arena", "snacks", "húmedo", "seco"). */
  missing?: string
  daysSince?: number
  intervalDays?: number | null
}

export type Membership = {
  audience: AudienceSlug
  /** Day from which the client may be suggested; null = any day. */
  readyOn: string | null
  detail: MemberDetail
}

/** Days after the last flea product before the reminder (until the master carries durations). */
export const FLEAS_REMINDER_DAYS = 45
/** Without buying for this long the client counts as lost: no Recompra, no En riesgo. */
export const LOST_DAYS = 365
const ACTIVE_DAYS = 60
const CROSS_MIN_ORDERS = 2

function ordersIn(stats: ClientStats, pred: (key: string) => boolean): number {
  let n = 0
  for (const [key, s] of Object.entries(stats.categories)) if (pred(key)) n += s.orders
  return n
}

function lastOnIn(stats: ClientStats, pred: (key: string) => boolean): string | null {
  let last: string | null = null
  for (const [key, s] of Object.entries(stats.categories))
    if (pred(key) && (!last || s.lastOn > last)) last = s.lastOn
  return last
}

/** Audiences the client belongs to today (no blocks applied). */
export function evaluateAudiences(
  stats: ClientStats,
  ctx: { today: string; rules: Pick<GrowthRules, "riskFactor" | "minPurchases"> },
): Membership[] {
  const out: Membership[] = []
  if (!stats.lastPurchaseOn) return out
  const daysSince = daysBetween(stats.lastPurchaseOn, ctx.today)
  const base: MemberDetail = {
    product: stats.mainProductName,
    brand: stats.mainBrand,
    species: stats.species,
    daysSince,
    intervalDays: stats.intervalDays,
  }

  // Past riskFactor × interval the client is no longer "about to buy": with an
  // own interval they are "en riesgo"; with a borrowed one they simply leave
  // Recompra (one-time buyers are never chased every cooldown forever). After
  // LOST_DAYS without buying nobody is chased at all.
  const overdue =
    stats.intervalDays !== null && daysSince > stats.intervalDays * ctx.rules.riskFactor
  const lost = daysSince > LOST_DAYS
  if (overdue) {
    if (stats.intervalSource === "own" && !lost)
      out.push({ audience: "en_riesgo", readyOn: null, detail: base })
  } else if (stats.expectedOn && stats.suggestedOn && stats.intervalDays) {
    // Recompra: from the suggested day until the client turns "en riesgo".
    out.push({ audience: "recompra", readyOn: stats.suggestedOn, detail: base })
  }

  const fleasLast = lastOnIn(stats, (k) => leafIs(k, "fleas"))
  if (fleasLast)
    out.push({
      audience: "antipulgas",
      readyOn: addDays(fleasLast, FLEAS_REMINDER_DAYS),
      detail: { ...base, missing: "antipulgas" },
    })

  const catFood = ordersIn(stats, (k) => speciesOfKey(k) === "gato" && leafIs(k, "food"))
  const catLitter = ordersIn(stats, (k) => speciesOfKey(k) === "gato" && leafIs(k, "litter"))
  if (catFood >= CROSS_MIN_ORDERS && catLitter === 0)
    out.push({
      audience: "gato_sin_arena",
      readyOn: null,
      detail: { ...base, species: "gato", missing: "arena" },
    })

  const dogFood = ordersIn(stats, (k) => speciesOfKey(k) === "perro" && leafIs(k, "food"))
  const dogSnacks = ordersIn(stats, (k) => speciesOfKey(k) === "perro" && leafIs(k, "snacks"))
  if (dogFood >= CROSS_MIN_ORDERS && dogSnacks === 0)
    out.push({
      audience: "perro_sin_snacks",
      readyOn: null,
      detail: { ...base, species: "perro", missing: "snacks" },
    })

  if (stats.species) {
    const sp = stats.species
    const dry = ordersIn(stats, (k) => speciesOfKey(k) === sp && leafIs(k, "dry"))
    const wet = ordersIn(stats, (k) => speciesOfKey(k) === sp && leafIs(k, "wet"))
    if (dry >= CROSS_MIN_ORDERS && wet === 0)
      out.push({
        audience: "seco_sin_humedo",
        readyOn: null,
        detail: { ...base, missing: "húmedo" },
      })
    if (wet >= CROSS_MIN_ORDERS && dry === 0)
      out.push({ audience: "humedo_sin_seco", readyOn: null, detail: { ...base, missing: "seco" } })
  }

  if (stats.stores12m >= 2) out.push({ audience: "multi_tienda", readyOn: null, detail: base })
  if (daysSince <= ACTIVE_DAYS) out.push({ audience: "activos", readyOn: null, detail: base })
  return out
}

export type BlockState = {
  /** Local day of the client's latest confirmed send, if any. */
  lastSentOn: string | null
  /** The client is pending or opened in an open send. */
  inOpenSend: boolean
  /** Active "No contactar". */
  noContact: boolean
  /** Local day the client's control window ends (drawn as control in a send still measuring); null = none. */
  controlUntil?: string | null
}

export type SuggestionReason =
  | "ready"
  | "not_yet"
  | "cooldown"
  | "open_send"
  | "no_contact"
  | "control"

export type Suggestion = {
  ready: boolean
  reason: SuggestionReason
  /** First day the client could be suggested (cooldown end or ready_on), when known. */
  availableOn: string | null
}

/** Whether a member may be suggested today, and why not otherwise. Blocks win over timing. */
export function suggestion(
  member: Pick<Membership, "readyOn">,
  block: BlockState,
  today: string,
  rules: Pick<GrowthRules, "cooldownDays">,
): Suggestion {
  if (block.noContact) return { ready: false, reason: "no_contact", availableOn: null }
  if (block.inOpenSend) return { ready: false, reason: "open_send", availableOn: null }
  // A control client stays untouched while the send is measured: contacting
  // them from another list would spoil the comparison.
  if (block.controlUntil && today <= block.controlUntil)
    return { ready: false, reason: "control", availableOn: addDays(block.controlUntil, 1) }
  if (block.lastSentOn) {
    const until = addDays(block.lastSentOn, rules.cooldownDays)
    if (today < until) return { ready: false, reason: "cooldown", availableOn: until }
  }
  if (member.readyOn && today < member.readyOn)
    return { ready: false, reason: "not_yet", availableOn: member.readyOn }
  return { ready: true, reason: "ready", availableOn: today }
}

/** The main intent of a client in several audiences: lowest priority number wins. */
export function mainAudience(slugs: AudienceSlug[]): AudienceSlug | null {
  let best: AudienceDef | null = null
  for (const s of slugs) {
    const def = AUDIENCE_BY_SLUG.get(s)
    if (def && !def.informational && (!best || def.priority < best.priority)) best = def
  }
  return best?.slug ?? null
}
