"use client"

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
  FieldList,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatStrip,
  StatusChip,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useTenant } from "@/hooks/use-tenant"
import {
  CHANNEL_LABEL,
  fmtDay,
  fmtDayYear,
  fmtTime,
  phoneLabel,
  RECIPIENT_STATUS,
  rhythmPhrase,
  soles,
} from "@/lib/growth/labels"
import type { RecipientAction, RecipientRow, SendDetail } from "@/lib/growth/sends"
import { TEMPLATE_BY_KEY, type TemplateKey, whatsappLink } from "@/lib/growth/templates"
import { fetchJson, GrowthGate } from "../../_components/growth-gate"
import { NoContactDialog } from "../../_components/no-contact-dialog"

const CONTACTABLE = new Set(["pending", "opened", "skipped"])

type Act = (recipientId: string, action: RecipientAction) => Promise<boolean>

/**
 * Panel › Growth › Envíos › [envío]: the guided flow. Cuik takes the
 * merchant one client at a time: Abrir chat (WhatsApp with the number and
 * message prefilled) → ✓ Enviado. Only that check starts attribution and the
 * cooldown; a client left pending stays free for any other list.
 */
export default function EnvioPage() {
  return (
    <GrowthGate>
      <Envio />
    </GrowthGate>
  )
}

function Envio() {
  const { id } = useParams<{ id: string }>()
  const { tenantSlug, timezone, readOnly } = useTenant()
  const [send, setSend] = useState<SendDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  /** The message as edited for one recipient; another recipient starts from its own text. */
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState("all")
  /** A sent client who later asked not to be written to: "No contactar" from the table. */
  const [blockTarget, setBlockTarget] = useState<RecipientRow | null>(null)

  const base = `/api/${tenantSlug}/growth/sends/${id}`

  const load = useCallback(async () => {
    if (!tenantSlug) return
    try {
      setSend(await fetchJson<SendDetail>(base))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [tenantSlug, base])

  useEffect(() => {
    void load()
  }, [load])

  // The client in front: the one chosen with "Ir", else the one opened and
  // not yet confirmed, else the first pending by position.
  const current = useMemo<RecipientRow | null>(() => {
    if (!send) return null
    const chosen = currentId ? send.recipients.find((r) => r.id === currentId) : null
    if (chosen && CONTACTABLE.has(chosen.status)) return chosen
    return (
      send.recipients.find((r) => r.status === "opened") ??
      send.recipients.find((r) => r.status === "pending") ??
      null
    )
  }, [send, currentId])

  const draftText = current
    ? draft?.id === current.id
      ? draft.text
      : (current.messageText ?? "")
    : ""

  const act: Act = async (recipientId, action) => {
    setBusy(true)
    try {
      await fetchJson(`${base}/recipients/${recipientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      })
      await load()
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function markSent() {
    if (!current) return
    if (await act(current.id, { action: "sent", messageText: draftText })) {
      setCurrentId(null)
      toast.success(`Enviado a ${current.name.split(" ")[0]}`)
    }
  }

  async function close() {
    if (!send) return
    const pending = send.counts.pending + send.counts.opened
    const msg =
      pending > 0
        ? `¿Cerrar el envío con ${send.counts.confirmed} enviados? Los ${pending} sin contactar quedan libres para cualquier otra lista y lo enviado se sigue midiendo ${send.attributionDays} días.`
        : `¿Cerrar el envío? Lo enviado se sigue midiendo ${send.attributionDays} días.`
    if (!window.confirm(msg)) return
    try {
      await fetchJson(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      })
      toast.success("Envío cerrado")
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!send) {
    return (
      <PanelMessage>
        <Loader2 className="w-4 h-4 animate-spin" />
      </PanelMessage>
    )
  }

  const c = send.counts
  const toContact = c.total - c.control
  const open = send.status === "open" && !readOnly
  const templateName =
    TEMPLATE_BY_KEY.get(send.templateKey as TemplateKey)?.name ?? send.templateKey
  const hasExportable = c.pending > 0 || c.opened > 0 || c.skipped > 0

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[
          { label: "Panel", href: "/panel" },
          { label: "Growth", href: "/panel/growth" },
          { label: "Envíos", href: "/panel/growth/envios" },
          { label: send.name },
        ]}
        title={send.name}
        subtitle={`${send.senderName ? `Escribe ${send.senderName} · ` : ""}${CHANNEL_LABEL[send.channel] ?? send.channel} · plantilla “${templateName}”`}
        actions={
          open && (
            <>
              {hasExportable && (
                <Button asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
                  <a href={`${base}/export`}>Exportar lista</a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[12.5px]"
                onClick={() => void close()}
              >
                Cerrar envío
              </Button>
            </>
          )
        }
      />

      <StatStrip
        stats={[
          {
            label: "Enviados",
            value: `${c.confirmed} de ${toContact}`,
            hint: "confirmados con el check",
          },
          {
            label: "Pendientes",
            value: c.pending + c.opened,
            hint: `${c.opened} abiertos sin confirmar · ${c.skipped} omitidos · ${c.blocked} no contactar`,
          },
          { label: "Control", value: c.control, hint: "sorteados al crear · no escribir" },
          {
            label: "Compraron",
            value: c.buyers,
            hint: `${soles(c.attributedAmount)} · ${send.measuringDay ? `día ${send.measuringDay} de ${send.attributionDays}` : `${send.attributionDays} días tras el envío`}`,
          },
        ]}
      />

      {send.status === "closed" && (
        <Notice tone="info">
          Envío cerrado. Lo enviado se mide {send.attributionDays} días desde cada check; los no
          contactados quedaron libres para otras listas.
        </Notice>
      )}

      {open && current && (
        <CurrentClient
          current={current}
          toContact={toContact}
          timezone={timezone}
          draft={draftText}
          onDraft={(text) => setDraft({ id: current.id, text })}
          busy={busy}
          act={act}
          onMarkSent={markSent}
          onDone={() => setCurrentId(null)}
        />
      )}

      {open && !current && (
        <Notice
          tone="ok"
          action={
            <Button size="sm" className="h-8 text-[12.5px]" onClick={() => void close()}>
              Cerrar envío · {c.confirmed} enviados
            </Button>
          }
        >
          No queda nadie por contactar. Al cerrar, lo enviado se sigue midiendo{" "}
          {send.attributionDays} días y los {c.skipped} omitidos quedan libres para otras listas.
        </Notice>
      )}

      {blockTarget && (
        <NoContactDialog
          open
          onOpenChange={(o) => !o && setBlockTarget(null)}
          clientName={blockTarget.name}
          onConfirm={async (reason, note) => {
            await act(blockTarget.id, { action: "blocked", reason: reason as "other", note })
          }}
        />
      )}

      <Panel>
        <PanelHeader title="Todos los del envío" />
        <Toolbar>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-7 w-[220px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(RECIPIENT_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[11.5px] text-ent-fg-3">Puedes saltar a cualquiera con “Ir”</span>
        </Toolbar>
        <DataTable>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Cliente</Th>
              <Th>Tienda</Th>
              <Th className="text-right">Sin comprar</Th>
              <Th>Producto habitual</Th>
              <Th>Estado</Th>
              <Th>Compró</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {send.recipients
              .filter((r) => filter === "all" || r.status === filter)
              .map((r) => (
                <RecipientLine
                  key={r.id}
                  r={r}
                  isCurrent={current?.id === r.id}
                  open={open}
                  busy={busy}
                  timezone={timezone}
                  act={act}
                  onGo={() => setCurrentId(r.id)}
                  onBlock={() => setBlockTarget(r)}
                />
              ))}
          </tbody>
        </DataTable>
      </Panel>
    </div>
  )
}

/** The client in front: who they are, the editable message, and the Abrir chat → ✓ Enviado steps. */
function CurrentClient({
  current,
  toContact,
  timezone,
  draft,
  onDraft,
  busy,
  act,
  onMarkSent,
  onDone,
}: {
  current: RecipientRow
  toContact: number
  timezone: string
  draft: string
  onDraft: (text: string) => void
  busy: boolean
  act: Act
  onMarkSent: () => Promise<void>
  onDone: () => void
}) {
  const [noContactOpen, setNoContactOpen] = useState(false)
  const waUrl = whatsappLink(current.phone, draft)
  const opened = current.status === "opened"

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(draft)
      toast.success("Mensaje copiado")
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={`Siguiente cliente · ${current.position} de ${toContact}`}
        actions={
          opened ? (
            <StatusChip tone="warn">
              Chat abierto a las {fmtTime(current.openedAt, timezone)} · sin confirmar
            </StatusChip>
          ) : (
            <span className="text-[11.5px] text-ent-fg-3">
              Cuik te lleva uno por uno; también funciona desde el celular
            </span>
          )
        }
      />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-y lg:divide-y-0 lg:divide-x divide-ent-line">
        <div className="p-3 space-y-3">
          <div>
            <Link
              href={`/panel/clientes/${current.clientId}`}
              className="text-[15px] font-semibold text-ent-fg hover:underline"
            >
              {current.name}
            </Link>
            <div className="text-[12.5px] text-ent-fg-2">
              {[
                current.phone ? phoneLabel(current.phone) : null,
                current.store,
                rhythmPhrase({ intervalDays: current.intervalDays, daysSince: current.daysSince }),
                current.spend12m ? `gasto 12 m ${soles(current.spend12m)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          <FieldList
            rows={[
              { label: "Producto habitual", value: current.product ?? "—" },
              { label: "Marca", value: current.brand ?? "—" },
              {
                label: "Última compra",
                value: current.lastPurchaseOn
                  ? `${fmtDayYear(current.lastPurchaseOn)}${current.store ? ` · ${current.store}` : ""}`
                  : "—",
              },
              { label: "Esperada", value: fmtDay(current.expectedOn) },
            ]}
          />
          {!current.phone && (
            <Notice tone="warn">
              Sin celular registrado: no se puede abrir el chat. Omítelo o corrige el número en su
              ficha.
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            {opened ? (
              <Button
                size="sm"
                className="h-9 text-[13px] gap-1.5"
                disabled={busy}
                onClick={() => void onMarkSent()}
              >
                <Check className="w-4 h-4" /> Sí, enviado · siguiente cliente
              </Button>
            ) : waUrl ? (
              <Button
                asChild
                size="sm"
                className="h-9 text-[13px] gap-1.5"
                onClick={() => void act(current.id, { action: "opened" })}
              >
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  Abrir chat en WhatsApp <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </Button>
            ) : (
              <Button size="sm" className="h-9 text-[13px]" disabled>
                Abrir chat en WhatsApp
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-[12.5px] gap-1.5"
              onClick={() => void copyMessage()}
              disabled={!draft}
            >
              <Copy className="w-3.5 h-3.5" /> Copiar mensaje
            </Button>
            {opened && waUrl && (
              <Button asChild variant="outline" size="sm" className="h-9 text-[12.5px]">
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  Volver a abrir el chat
                </a>
              </Button>
            )}
            {opened ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-[12.5px]"
                disabled={busy}
                onClick={() => void act(current.id, { action: "pending" })}
              >
                No se envió · dejar pendiente
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-[12.5px]"
                disabled={busy}
                onClick={() => {
                  void act(current.id, { action: "skipped" }).then((ok) => ok && onDone())
                }}
              >
                Omitir por ahora
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-[12.5px] text-ent-bad"
              disabled={busy}
              onClick={() => setNoContactOpen(true)}
            >
              No contactar…
            </Button>
          </div>
          <div className={opened ? "text-[12px] text-ent-fg-2" : "text-[11.5px] text-ent-fg-3"}>
            {opened
              ? "¿Enviaste el mensaje en WhatsApp? Confírmalo con el check: solo así arranca la medición."
              : "“Abrir chat” lanza WhatsApp (web o app) con el número y el mensaje ya escritos. Tú solo tocas enviar. Luego vuelves aquí y confirmas."}
          </div>
        </div>
        <div className="p-3 space-y-1.5">
          <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">
            Mensaje para {current.name.split(" ")[0]} (editable)
          </div>
          <Textarea
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            rows={7}
            className="text-[13px]"
            maxLength={2000}
          />
          <div className="text-[11.5px] text-ent-fg-3">
            Variables ya reemplazadas. Si lo editas, se guarda tal cual lo enviaste.
          </div>
        </div>
      </div>
      <NoContactDialog
        open={noContactOpen}
        onOpenChange={setNoContactOpen}
        clientName={current.name}
        onConfirm={async (reason, note) => {
          if (await act(current.id, { action: "blocked", reason: reason as "other", note }))
            onDone()
        }}
      />
    </Panel>
  )
}

function RecipientLine({
  r,
  isCurrent,
  open,
  busy,
  timezone,
  act,
  onGo,
  onBlock,
}: {
  r: RecipientRow
  isCurrent: boolean
  open: boolean
  busy: boolean
  timezone: string
  act: Act
  onGo: () => void
  onBlock: () => void
}) {
  const st = RECIPIENT_STATUS[r.status] ?? { label: r.status, tone: "mute" as const }
  const inProgress = isCurrent && open
  const when = r.sentAt
    ? ` · ${fmtTime(r.sentAt, timezone)}${r.sentBy ? ` · ${r.sentBy.split(" ")[0]}` : ""}`
    : ""
  const replied = r.repliedAt ? ` · respondió ${fmtTime(r.repliedAt, timezone)}` : ""
  return (
    <Tr className={isCurrent ? "bg-ent-accent-soft" : undefined}>
      <Td className="text-ent-fg-3 tabular-nums">{r.position}</Td>
      <Td>
        <Link href={`/panel/clientes/${r.clientId}`} className="text-ent-accent hover:underline">
          {r.name}
        </Link>
        {!r.phone && r.status !== "control" && (
          <span className="text-ent-fg-3"> · sin celular</span>
        )}
      </Td>
      <Td className="text-ent-fg-2">{r.store ?? "—"}</Td>
      <Td className="text-right tabular-nums">{r.daysSince == null ? "—" : `${r.daysSince} d`}</Td>
      <Td className="text-ent-fg-2 max-w-[240px] truncate" title={r.product ?? ""}>
        {r.product ?? "—"}
      </Td>
      <Td>
        <StatusChip tone={inProgress ? "warn" : st.tone}>
          {inProgress && r.status !== "opened" ? "En curso" : st.label}
          {when}
          {replied}
        </StatusChip>
      </Td>
      <Td className="tabular-nums">
        {r.bought.tickets > 0 ? (
          `${soles(r.bought.amount)} · ${fmtDay(r.bought.firstOn)}`
        ) : (
          <span className="text-ent-fg-3">—</span>
        )}
      </Td>
      <Td className="text-right whitespace-nowrap">
        {open && CONTACTABLE.has(r.status) && !isCurrent && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[12px]" onClick={onGo}>
            Ir
          </Button>
        )}
        {open && r.status === "sent" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[12px]"
            disabled={busy}
            onClick={() => void act(r.id, { action: "replied" })}
          >
            Respondió
          </Button>
        )}
        {open && (r.status === "sent" || r.status === "replied") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[12px] text-ent-bad"
            disabled={busy}
            onClick={onBlock}
          >
            No contactar
          </Button>
        )}
      </Td>
    </Tr>
  )
}
