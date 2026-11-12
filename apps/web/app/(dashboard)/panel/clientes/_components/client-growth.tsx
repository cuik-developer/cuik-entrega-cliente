"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
  FieldList,
  Notice,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/hooks/use-tenant"
import { leafOfKey, speciesOfKey } from "@/lib/growth/categories"
import {
  blockReasonLabel,
  fmtDateTime,
  fmtDay,
  fmtDayYear,
  RECIPIENT_STATUS,
  rhythmPhrase,
  SUGGESTION_LABEL,
  soles,
} from "@/lib/growth/labels"
import type { ClientGrowthView } from "@/lib/growth/store"
import { NoContactDialog } from "../../growth/_components/no-contact-dialog"

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({ success: false, error: "Respuesta inválida" }))
  if (!res.ok || !json.success) throw new Error(json.error ?? `Error ${res.status}`)
  return json.data as T
}

/**
 * Clientes › ficha › Growth: the client's rhythm and preferences from the
 * POS, the audiences they are in today, every send they got, the sales
 * attributed, and the "No contactar" mark (set or lifted here).
 */
export function ClientGrowth({
  clientId,
  tenantSlug,
  clientName,
}: {
  clientId: string
  tenantSlug: string
  clientName: string
}) {
  const { timezone, readOnly } = useTenant()
  const [data, setData] = useState<ClientGrowthView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const url = `/api/${tenantSlug}/growth/clients/${clientId}`

  const load = useCallback(async () => {
    try {
      setData(await fetchJson<ClientGrowthView>(url))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  async function block(reason: string, note: string | null) {
    try {
      await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, note }),
      })
      toast.success("Marcado como “No contactar”")
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function lift() {
    if (!window.confirm("¿Volver a permitir mensajes de Growth a este cliente?")) return
    try {
      await fetchJson(url, { method: "DELETE" })
      toast.success("Marca retirada")
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (error) return <Notice tone="bad">{error}</Notice>
  if (!data) {
    return (
      <PanelMessage>
        <Loader2 className="w-4 h-4 animate-spin" />
      </PanelMessage>
    )
  }

  const s = data.stats

  return (
    <div className="space-y-3">
      <ContactNotice
        data={data}
        timezone={timezone}
        readOnly={readOnly}
        onLift={() => void lift()}
        onBlock={() => setDialog(true)}
      />

      <NoContactDialog
        open={dialog}
        onOpenChange={setDialog}
        clientName={clientName}
        onConfirm={block}
      />

      {!s ? (
        <Panel>
          <PanelMessage>
            <span>Sin compras del punto de venta vinculadas a este cliente.</span>
            <span>
              Cuando el conector traiga una venta con su DNI, aquí aparecerá su ritmo y sus
              audiencias.
            </span>
          </PanelMessage>
        </Panel>
      ) : (
        <StatsPanels s={s} today={data.today} />
      )}

      <Panel>
        <PanelHeader title="Audiencias hoy" />
        {data.audiences.length === 0 ? (
          <PanelMessage className="py-5">En ninguna audiencia hoy.</PanelMessage>
        ) : (
          <div className="px-3 py-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {data.audiences.map((a) => (
              <Link
                key={a.slug}
                href={`/panel/growth/audiencias/${a.slug}`}
                className="hover:underline"
              >
                <StatusChip tone={a.suggestion.ready ? "ok" : "mute"}>
                  {a.name} · {SUGGESTION_LABEL[a.suggestion.reason]}
                </StatusChip>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader title={`Envíos (${data.sends.length})`} />
        {data.sends.length === 0 ? (
          <PanelMessage className="py-5">Nunca se le ha escrito desde Growth.</PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Envío</Th>
                <Th>Estado</Th>
                <Th>Mensaje</Th>
              </tr>
            </thead>
            <tbody>
              {data.sends.map((r) => {
                const st = RECIPIENT_STATUS[r.status] ?? { label: r.status, tone: "mute" as const }
                return (
                  <Tr key={r.recipientId}>
                    <Td>
                      <Link
                        href={`/panel/growth/envios/${r.sendId}`}
                        className="text-ent-accent hover:underline"
                      >
                        {r.name}
                      </Link>
                    </Td>
                    <Td>
                      <StatusChip tone={st.tone}>
                        {st.label}
                        {r.sentAt
                          ? ` · ${fmtDateTime(r.sentAt, timezone)}${r.sentBy ? ` · ${r.sentBy.split(" ")[0]}` : ""}`
                          : ""}
                      </StatusChip>
                    </Td>
                    <Td
                      className="text-ent-fg-2 max-w-[420px] truncate"
                      title={r.messageText ?? ""}
                    >
                      {r.messageText ?? "—"}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {data.attributed.length > 0 && (
        <Panel>
          <PanelHeader title={`Ventas atribuidas (${data.attributed.length})`} />
          <DataTable>
            <thead>
              <tr>
                <Th>Día</Th>
                <Th className="text-right">Monto</Th>
                <Th>Envío</Th>
                <Th className="text-right">Días después</Th>
              </tr>
            </thead>
            <tbody>
              {data.attributed.map((a) => (
                <Tr key={a.saleId}>
                  <Td>{fmtDayYear(a.soldOn)}</Td>
                  <Td className="text-right tabular-nums">{soles(a.amount, 2)}</Td>
                  <Td className="text-ent-fg-2">{a.sendName}</Td>
                  <Td className="text-right tabular-nums">{a.daysAfter}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}
    </div>
  )
}

function ContactNotice({
  data,
  timezone,
  readOnly,
  onLift,
  onBlock,
}: {
  data: ClientGrowthView
  timezone: string
  readOnly: boolean
  onLift: () => void
  onBlock: () => void
}) {
  const b = data.block
  if (b) {
    return (
      <Notice
        tone="bad"
        action={
          !readOnly && (
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onLift}>
              Volver a contactar
            </Button>
          )
        }
      >
        No contactar · {blockReasonLabel(b.reason)}
        {b.note ? ` · ${b.note}` : ""} · {fmtDateTime(b.createdAt, timezone)}
        {b.createdBy ? ` · ${b.createdBy}` : ""}
      </Notice>
    )
  }
  const received = data.sends.filter((x) => x.status === "sent" || x.status === "replied").length
  return (
    <Notice
      tone="info"
      action={
        !readOnly && (
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onBlock}>
            Marcar “No contactar”
          </Button>
        )
      }
    >
      Contacto activo · {received} envíos recibidos · {data.attributed.length} ventas atribuidas
    </Notice>
  )
}

const SOURCE_LABEL: Record<string, string> = {
  own: "propio",
  category: "de su categoría",
  tenant: "del comercio",
}

function StatsPanels({ s, today }: { s: NonNullable<ClientGrowthView["stats"]>; today: string }) {
  const categories = Object.entries(s.categories)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 6)
  const daysSince = s.lastPurchaseOn
    ? Math.round((Date.parse(today) - Date.parse(s.lastPurchaseOn)) / 86_400_000)
    : null
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Panel>
        <PanelHeader title="Ritmo" />
        <div className="px-3 py-1">
          <FieldList
            rows={[
              {
                label: "Compra",
                value:
                  rhythmPhrase({
                    intervalDays: s.intervalDays,
                    daysSince,
                    habitualWeekday: s.habitualWeekday,
                  }) || "—",
              },
              {
                label: "Intervalo",
                value: s.intervalDays
                  ? `${s.intervalDays} días (${SOURCE_LABEL[s.intervalSource ?? ""] ?? ""})`
                  : "sin intervalo todavía",
              },
              {
                label: "Última compra",
                value: s.lastPurchaseOn
                  ? `${fmtDayYear(s.lastPurchaseOn)}${s.lastStore ? ` · ${s.lastStore}` : ""}`
                  : "—",
              },
              {
                label: "Próxima esperada",
                value: s.expectedOn
                  ? `${fmtDay(s.expectedOn)}${s.expectedOn < today ? " (vencida)" : ""}${s.suggestedOn ? ` · sugerir el ${fmtDay(s.suggestedOn)}` : ""}`
                  : "—",
              },
              {
                label: "Compras 12 m",
                value: `${s.purchases12m} (${s.purchases} en total) · ${soles(s.spend12m)}`,
              },
            ]}
          />
        </div>
      </Panel>
      <Panel>
        <PanelHeader title="Preferencias" />
        <div className="px-3 py-1">
          <FieldList
            rows={[
              {
                label: "Mascota",
                value: s.species
                  ? `${s.species === "perro" ? "Perro" : "Gato"} (por lo que compra)`
                  : "—",
              },
              { label: "Producto habitual", value: s.mainProductName ?? "—" },
              { label: "Marca principal", value: s.mainBrand ?? "—" },
              {
                label: "Categorías",
                value:
                  categories.length > 0
                    ? categories
                        .map(
                          ([k, v]) =>
                            `${speciesOfKey(k) ? `${speciesOfKey(k)} · ` : ""}${leafOfKey(k).replace(/_/g, " ")} (${v.orders})`,
                        )
                        .join(", ")
                    : "—",
              },
              { label: "Tiendas 12 m", value: s.stores12m },
            ]}
          />
        </div>
      </Panel>
    </div>
  )
}
