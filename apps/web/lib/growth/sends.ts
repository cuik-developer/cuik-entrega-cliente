import {
  and,
  clients,
  db,
  desc,
  eq,
  growthAttributedSales,
  growthClientStats,
  growthSendRecipients,
  growthSends,
  inArray,
  isNotNull,
  sql,
  user,
} from "@cuik/db"
import { measuringDayOf } from "./attribution"
import { AUDIENCE_BY_SLUG, type AudienceSlug } from "./audiences"
import { daysBetween } from "./dates"
import {
  addContactBlock,
  audienceMembers,
  type ClientVarsSource,
  type ContactBlockReason,
  type ContactBlockView,
  chunk,
  clientVarsSources,
  firstName,
  fullName,
  type GrowthTenant,
  getRules,
  type MemberRow,
  petNameFor,
  stampsMissing,
  type TenantVarsContext,
  tenantVarsContext,
  todayOf,
} from "./store"
import {
  petWord,
  renderTemplate,
  TEMPLATE_BY_KEY,
  type TemplateKey,
  type TemplateVars,
  weekdayWord,
  whatsappLink,
} from "./templates"

/**
 * Sends: a frozen snapshot of an audience's ready clients, a control group
 * drawn at creation, and one row per client that the merchant walks one by
 * one (Abrir chat → ✓ Enviado). Only the "Enviado" check starts attribution
 * and cooldown; pending and skipped rows stay free for any other list.
 */

export type SendChannel = "whatsapp" | "export"
export type RecipientStatus =
  | "pending"
  | "opened"
  | "sent"
  | "replied"
  | "skipped"
  | "control"
  | "blocked"

const CONTACTABLE: RecipientStatus[] = ["pending", "opened", "skipped"]

/** What a cross-sell proposes, in the words of the message. */
const MISSING_WORDS: Record<string, string> = {
  arena: "arena para gatos",
  snacks: "snacks",
  húmedo: "alimento húmedo",
  seco: "alimento seco",
  antipulgas: "antipulgas",
}

/** The variables of one client's message. */
export function varsFor(input: {
  src: ClientVarsSource
  ctx: TenantVarsContext
  senderName: string | null
  today: string
  detail: { missing?: string } | null
}): TemplateVars {
  const { src, ctx } = input
  const st = src.stats
  const petName = petNameFor(src, ctx)
  const missing = stampsMissing(src, ctx)
  return {
    nombre: firstName(src.name),
    cajero: input.senderName,
    comercio: ctx.tenantName,
    tienda: st?.lastStore ?? null,
    mascota: petWord(petName, st?.species ?? null),
    producto: st?.mainProductName ?? null,
    marca: st?.mainBrand ?? null,
    dias: st?.lastPurchaseOn ? String(daysBetween(st.lastPurchaseOn, input.today)) : null,
    dia_habitual: weekdayWord(st?.habitualWeekday),
    producto_sugerido: input.detail?.missing ? (MISSING_WORDS[input.detail.missing] ?? null) : null,
    sellos_faltan: missing == null ? null : String(missing),
    premio: ctx.stamps?.reward ?? null,
    precio_oferta: null,
  }
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type CreateSendInput = {
  tenant: GrowthTenant
  audience: AudienceSlug
  templateKey: TemplateKey
  /** The template text as the merchant left it (variables included). */
  templateText: string
  channel: SendChannel
  senderName: string | null
  /** Only clients whose habitual store is this one; null = every store. */
  store: string | null
  userId: string
}

export type CreateSendResult =
  | { ok: true; sendId: string; total: number; control: number; toContact: number }
  | { ok: false; error: string }

/** What the "Crear envío" dialog shows before confirming. */
export async function sendPreview(
  tenant: GrowthTenant,
  audience: AudienceSlug,
  store: string | null,
): Promise<{
  inAudience: number
  ready: number
  excluded: {
    cooldown: number
    openSend: number
    noContact: number
    control: number
    notYet: number
  }
  control: number
  toContact: number
  stores: string[]
}> {
  const rules = await getRules(tenant.id)
  const { rows } = await audienceMembers(tenant, audience)
  const stores = [
    ...new Set(rows.map((r) => r.store).filter((s): s is string => Boolean(s))),
  ].sort()
  const scoped = store ? rows.filter((r) => r.store === store) : rows
  const ready = scoped.filter((r) => r.suggestion.ready)
  const excluded = { cooldown: 0, openSend: 0, noContact: 0, control: 0, notYet: 0 }
  for (const r of scoped) {
    if (r.suggestion.ready) continue
    if (r.suggestion.reason === "cooldown") excluded.cooldown++
    else if (r.suggestion.reason === "open_send") excluded.openSend++
    else if (r.suggestion.reason === "no_contact") excluded.noContact++
    else if (r.suggestion.reason === "control") excluded.control++
    else excluded.notYet++
  }
  const control = controlSize(ready.length, rules.controlPct)
  return {
    inAudience: scoped.length,
    ready: ready.length,
    excluded,
    control,
    toContact: ready.length - control,
    stores,
  }
}

export function controlSize(ready: number, controlPct: number): number {
  if (ready < 2 || controlPct <= 0) return 0
  const n = Math.round((ready * controlPct) / 100)
  // Never leave nobody to contact.
  return Math.min(n, ready - 1)
}

export async function createSend(input: CreateSendInput): Promise<CreateSendResult> {
  const def = AUDIENCE_BY_SLUG.get(input.audience)
  if (!def) return { ok: false, error: "Audiencia desconocida" }
  if (def.informational) return { ok: false, error: "Esta audiencia es solo informativa" }
  if (!TEMPLATE_BY_KEY.has(input.templateKey)) return { ok: false, error: "Plantilla desconocida" }
  const text = input.templateText.trim()
  if (!text) return { ok: false, error: "El mensaje está vacío" }

  const rules = await getRules(input.tenant.id)
  const { rows, today } = await audienceMembers(input.tenant, input.audience)
  const scoped = input.store ? rows.filter((r) => r.store === input.store) : rows
  const ready = scoped.filter((r) => r.suggestion.ready)
  if (ready.length === 0)
    return { ok: false, error: "No hay clientes listos hoy en esta audiencia" }

  const control = controlSize(ready.length, rules.controlPct)
  const shuffled = shuffle(ready)
  const controlIds = new Set(shuffled.slice(0, control).map((r) => r.clientId))
  const toContact = ready.filter((r) => !controlIds.has(r.clientId))

  const [ctx, sources] = await Promise.all([
    tenantVarsContext(input.tenant.id),
    clientVarsSources(
      input.tenant.id,
      ready.map((r) => r.clientId),
    ),
  ])

  const name = `${def.name} · ${sendLabel(today)}`
  const sendId = await db.transaction(async (tx) => {
    const [send] = await tx
      .insert(growthSends)
      .values({
        tenantId: input.tenant.id,
        audience: input.audience,
        name,
        templateKey: input.templateKey,
        templateText: text,
        channel: input.channel,
        senderName: input.senderName,
        snapshotTotal: ready.length,
        controlPct: rules.controlPct,
        attributionDays: rules.attributionDays,
        createdBy: input.userId,
      })
      .returning({ id: growthSends.id })
    const recipients: (typeof growthSendRecipients.$inferInsert)[] = []
    let position = 0
    for (const r of toContact) {
      const src = sources.get(r.clientId)
      const vars = src
        ? varsFor({ src, ctx, senderName: input.senderName, today, detail: r.detail })
        : { nombre: firstName(r.name) }
      recipients.push({
        sendId: send.id,
        tenantId: input.tenant.id,
        clientId: r.clientId,
        position: ++position,
        status: "pending",
        messageText: renderTemplate(text, vars),
      })
    }
    for (const r of ready) {
      if (!controlIds.has(r.clientId)) continue
      recipients.push({
        sendId: send.id,
        tenantId: input.tenant.id,
        clientId: r.clientId,
        position: ++position,
        status: "control",
        messageText: null,
      })
    }
    for (const part of chunk(recipients)) await tx.insert(growthSendRecipients).values(part)
    return send.id
  })
  return { ok: true, sendId, total: ready.length, control, toContact: toContact.length }
}

/** "12 nov" for the send's name. */
function sendLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

// --- Read models ---

export type SendCounts = {
  total: number
  pending: number
  opened: number
  sent: number
  replied: number
  skipped: number
  control: number
  blocked: number
  /** Confirmed sends (sent + replied). */
  confirmed: number
  buyers: number
  attributedAmount: number
  attributedTickets: number
  /** First and last "Enviado" check (ISO), when any. */
  firstSentAt: string | null
  lastSentAt: string | null
}

export type SendListRow = {
  id: string
  audience: string
  audienceName: string
  name: string
  channel: SendChannel
  senderName: string | null
  templateKey: string
  status: "open" | "closed"
  createdAt: string
  closedAt: string | null
  attributionDays: number
  /** Day of the measuring window today (1..N), or null once it is over / nothing sent. */
  measuringDay: number | null
  counts: SendCounts
}

export async function listSends(tenant: GrowthTenant): Promise<SendListRow[]> {
  const sends = await db
    .select()
    .from(growthSends)
    .where(eq(growthSends.tenantId, tenant.id))
    .orderBy(desc(growthSends.createdAt))
    .limit(200)
  if (sends.length === 0) return []
  const counts = await countsFor(
    tenant.id,
    sends.map((s) => s.id),
  )
  const today = todayOf(tenant.timezone)
  return sends.map((s) => toListRow(s, counts.get(s.id) ?? emptyCounts(), today, tenant.timezone))
}

function emptyCounts(): SendCounts {
  return {
    total: 0,
    pending: 0,
    opened: 0,
    sent: 0,
    replied: 0,
    skipped: 0,
    control: 0,
    blocked: 0,
    confirmed: 0,
    buyers: 0,
    attributedAmount: 0,
    attributedTickets: 0,
    firstSentAt: null,
    lastSentAt: null,
  }
}

async function countsFor(tenantId: string, sendIds: string[]): Promise<Map<string, SendCounts>> {
  const out = new Map<string, SendCounts>()
  for (const ids of chunk(sendIds)) {
    const [statusRows, attrRows, sentRows] = await Promise.all([
      db
        .select({
          sendId: growthSendRecipients.sendId,
          status: growthSendRecipients.status,
          n: sql<number>`count(*)`,
        })
        .from(growthSendRecipients)
        .where(
          and(
            eq(growthSendRecipients.tenantId, tenantId),
            inArray(growthSendRecipients.sendId, ids),
          ),
        )
        .groupBy(growthSendRecipients.sendId, growthSendRecipients.status),
      db
        .select({
          sendId: growthAttributedSales.sendId,
          buyers: sql<number>`count(distinct ${growthAttributedSales.clientId})`,
          tickets: sql<number>`count(*)`,
          amount: sql<string>`coalesce(sum(${growthAttributedSales.amount}), 0)`,
        })
        .from(growthAttributedSales)
        .where(
          and(
            eq(growthAttributedSales.tenantId, tenantId),
            inArray(growthAttributedSales.sendId, ids),
          ),
        )
        .groupBy(growthAttributedSales.sendId),
      db
        .select({
          sendId: growthSendRecipients.sendId,
          first: sql<Date>`min(${growthSendRecipients.sentAt})`,
          last: sql<Date>`max(${growthSendRecipients.sentAt})`,
        })
        .from(growthSendRecipients)
        .where(
          and(
            eq(growthSendRecipients.tenantId, tenantId),
            inArray(growthSendRecipients.sendId, ids),
            isNotNull(growthSendRecipients.sentAt),
          ),
        )
        .groupBy(growthSendRecipients.sendId),
    ])
    for (const r of sentRows) {
      const c = out.get(r.sendId) ?? emptyCounts()
      c.firstSentAt = new Date(r.first).toISOString()
      c.lastSentAt = new Date(r.last).toISOString()
      out.set(r.sendId, c)
    }
    for (const r of statusRows) {
      const c = out.get(r.sendId) ?? emptyCounts()
      const n = Number(r.n)
      c.total += n
      if (r.status in c) (c as unknown as Record<string, number>)[r.status] += n
      out.set(r.sendId, c)
    }
    for (const r of attrRows) {
      const c = out.get(r.sendId) ?? emptyCounts()
      c.buyers = Number(r.buyers)
      c.attributedTickets = Number(r.tickets)
      c.attributedAmount = Math.round(Number(r.amount) * 100) / 100
      out.set(r.sendId, c)
    }
  }
  for (const c of out.values()) c.confirmed = c.sent + c.replied
  return out
}

function toListRow(
  s: typeof growthSends.$inferSelect,
  counts: SendCounts,
  today: string,
  timezone: string,
): SendListRow {
  const def = AUDIENCE_BY_SLUG.get(s.audience as AudienceSlug)
  return {
    id: s.id,
    audience: s.audience,
    audienceName: def?.name ?? s.audience,
    name: s.name,
    channel: s.channel as SendChannel,
    senderName: s.senderName,
    templateKey: s.templateKey,
    status: s.status as "open" | "closed",
    createdAt: s.createdAt.toISOString(),
    closedAt: s.closedAt ? s.closedAt.toISOString() : null,
    attributionDays: s.attributionDays,
    measuringDay: measuringDayOf(counts, s.attributionDays, today, timezone),
    counts,
  }
}

export type RecipientRow = {
  id: string
  clientId: string
  position: number
  status: RecipientStatus
  name: string
  phone: string | null
  store: string | null
  daysSince: number | null
  intervalDays: number | null
  expectedOn: string | null
  lastPurchaseOn: string | null
  product: string | null
  brand: string | null
  spend12m: number
  species: string | null
  messageText: string | null
  whatsappUrl: string | null
  openedAt: string | null
  sentAt: string | null
  sentBy: string | null
  repliedAt: string | null
  /** Attributed sales of this client in this send. */
  bought: { amount: number; tickets: number; firstOn: string | null }
}

export type SendDetail = SendListRow & {
  templateText: string
  recipients: RecipientRow[]
}

export async function getSend(tenant: GrowthTenant, sendId: string): Promise<SendDetail | null> {
  const [s] = await db
    .select()
    .from(growthSends)
    .where(and(eq(growthSends.id, sendId), eq(growthSends.tenantId, tenant.id)))
    .limit(1)
  if (!s) return null
  const today = todayOf(tenant.timezone)
  const [counts, rows, bought] = await Promise.all([
    countsFor(tenant.id, [s.id]),
    db
      .select({
        id: growthSendRecipients.id,
        clientId: growthSendRecipients.clientId,
        position: growthSendRecipients.position,
        status: growthSendRecipients.status,
        name: clients.name,
        lastName: clients.lastName,
        phone: clients.phone,
        store: growthClientStats.lastStore,
        lastPurchaseOn: growthClientStats.lastPurchaseOn,
        intervalDays: growthClientStats.intervalDays,
        expectedOn: growthClientStats.expectedOn,
        product: growthClientStats.mainProductName,
        brand: growthClientStats.mainBrand,
        spend12m: growthClientStats.spend12m,
        species: growthClientStats.species,
        messageText: growthSendRecipients.messageText,
        openedAt: growthSendRecipients.openedAt,
        sentAt: growthSendRecipients.sentAt,
        sentBy: user.name,
        repliedAt: growthSendRecipients.repliedAt,
      })
      .from(growthSendRecipients)
      .innerJoin(clients, eq(clients.id, growthSendRecipients.clientId))
      .leftJoin(
        growthClientStats,
        and(
          eq(growthClientStats.tenantId, growthSendRecipients.tenantId),
          eq(growthClientStats.clientId, growthSendRecipients.clientId),
        ),
      )
      .leftJoin(user, eq(user.id, growthSendRecipients.sentBy))
      .where(eq(growthSendRecipients.sendId, s.id))
      .orderBy(growthSendRecipients.position),
    db
      .select({
        recipientId: growthAttributedSales.recipientId,
        amount: sql<string>`sum(${growthAttributedSales.amount})`,
        tickets: sql<number>`count(*)`,
        firstOn: sql<string>`min(${growthAttributedSales.soldOn})`,
      })
      .from(growthAttributedSales)
      .where(eq(growthAttributedSales.sendId, s.id))
      .groupBy(growthAttributedSales.recipientId),
  ])
  const boughtBy = new Map(bought.map((b) => [b.recipientId, b]))
  const recipients: RecipientRow[] = rows.map((r) => {
    const b = boughtBy.get(r.id)
    return {
      id: r.id,
      clientId: r.clientId,
      position: r.position,
      status: r.status as RecipientStatus,
      name: fullName(r.name, r.lastName),
      phone: r.phone,
      store: r.store ?? null,
      daysSince: r.lastPurchaseOn ? daysBetween(r.lastPurchaseOn, today) : null,
      intervalDays: r.intervalDays == null ? null : Number(r.intervalDays),
      expectedOn: r.expectedOn ?? null,
      lastPurchaseOn: r.lastPurchaseOn ?? null,
      product: r.product ?? null,
      brand: r.brand ?? null,
      spend12m: r.spend12m == null ? 0 : Number(r.spend12m),
      species: r.species ?? null,
      messageText: r.messageText,
      whatsappUrl: r.messageText ? whatsappLink(r.phone, r.messageText) : null,
      openedAt: r.openedAt ? r.openedAt.toISOString() : null,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      sentBy: r.sentBy,
      repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
      bought: {
        amount: b ? Math.round(Number(b.amount) * 100) / 100 : 0,
        tickets: b ? Number(b.tickets) : 0,
        firstOn: b?.firstOn ?? null,
      },
    }
  })
  return {
    ...toListRow(s, counts.get(s.id) ?? emptyCounts(), today, tenant.timezone),
    templateText: s.templateText,
    recipients,
  }
}

// --- Per-recipient actions ---

export type RecipientAction =
  | { action: "opened" }
  | { action: "sent"; messageText?: string }
  | { action: "replied" }
  | { action: "skipped" }
  | { action: "pending" }
  | { action: "blocked"; reason: ContactBlockReason; note: string | null }

export type RecipientActionResult =
  | { ok: true; status: RecipientStatus; block?: ContactBlockView | null }
  | { ok: false; error: string; status?: number }

const TRANSITIONS: Record<RecipientAction["action"], RecipientStatus[]> = {
  opened: ["pending", "opened", "skipped"],
  sent: ["pending", "opened", "skipped"],
  replied: ["sent"],
  skipped: ["pending", "opened"],
  pending: ["opened", "skipped"],
  // A client who answers "no me escribas" after the check is blocked too; the check stays.
  blocked: [...CONTACTABLE, "sent", "replied"],
}

export async function applyRecipientAction(input: {
  tenant: GrowthTenant
  recipientId: string
  userId: string
  action: RecipientAction
}): Promise<RecipientActionResult> {
  const [row] = await db
    .select({
      id: growthSendRecipients.id,
      clientId: growthSendRecipients.clientId,
      status: growthSendRecipients.status,
      messageText: growthSendRecipients.messageText,
      sendStatus: growthSends.status,
      channel: growthSends.channel,
    })
    .from(growthSendRecipients)
    .innerJoin(growthSends, eq(growthSends.id, growthSendRecipients.sendId))
    .where(
      and(
        eq(growthSendRecipients.id, input.recipientId),
        eq(growthSendRecipients.tenantId, input.tenant.id),
      ),
    )
    .limit(1)
  if (!row) return { ok: false, error: "Cliente del envío no encontrado", status: 404 }
  if (row.sendStatus !== "open") return { ok: false, error: "El envío ya está cerrado" }
  const current = row.status as RecipientStatus
  if (current === "control") return { ok: false, error: "Este cliente es del grupo de control" }
  const act = input.action
  if (!TRANSITIONS[act.action].includes(current)) {
    return { ok: false, error: `No se puede pasar de "${current}" a "${act.action}"` }
  }
  const now = new Date()
  const patch: Partial<typeof growthSendRecipients.$inferInsert> = {}
  switch (act.action) {
    case "opened":
      patch.status = "opened"
      patch.openedAt = now
      break
    case "sent": {
      patch.status = "sent"
      patch.sentAt = now
      patch.sentBy = input.userId
      const edited = act.messageText?.trim()
      if (edited) patch.messageText = edited.slice(0, 2000)
      if (!patch.messageText && !row.messageText) return { ok: false, error: "Falta el mensaje" }
      break
    }
    case "replied":
      patch.status = "replied"
      patch.repliedAt = now
      break
    case "skipped":
      patch.status = "skipped"
      break
    case "pending":
      patch.status = "pending"
      patch.openedAt = null
      break
    case "blocked": {
      const block = await addContactBlock({
        tenantId: input.tenant.id,
        clientId: row.clientId,
        reason: act.reason,
        note: act.note,
        userId: input.userId,
      })
      // Pending rows of open sends became "blocked" inside addContactBlock; a sent row keeps its status.
      const status: RecipientStatus = CONTACTABLE.includes(current) ? "blocked" : current
      return { ok: true, status, block }
    }
  }
  await db.update(growthSendRecipients).set(patch).where(eq(growthSendRecipients.id, row.id))
  return { ok: true, status: patch.status as RecipientStatus }
}

/** Closes the send: pending and opened rows stay as they are (free for other lists). */
export async function closeSend(tenant: GrowthTenant, sendId: string): Promise<boolean> {
  const rows = await db
    .update(growthSends)
    .set({ status: "closed", closedAt: new Date() })
    .where(
      and(
        eq(growthSends.id, sendId),
        eq(growthSends.tenantId, tenant.id),
        eq(growthSends.status, "open"),
      ),
    )
    .returning({ id: growthSends.id })
  return rows.length > 0
}

/** Rows for the bulk tool: pending clients with phone and the resolved message. */
export function exportRows(detail: SendDetail): { name: string; phone: string; message: string }[] {
  return detail.recipients
    .filter((r) => CONTACTABLE.includes(r.status) && r.phone && r.messageText)
    .map((r) => ({ name: r.name, phone: r.phone as string, message: r.messageText as string }))
}

export type { MemberRow }
