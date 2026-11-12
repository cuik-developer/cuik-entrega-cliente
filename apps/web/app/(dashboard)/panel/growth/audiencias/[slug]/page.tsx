"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelFooter,
  PanelHeader,
  PanelMessage,
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
import { useTenant } from "@/hooks/use-tenant"
import { AUDIENCE_BY_SLUG, type AudienceDef, type AudienceSlug } from "@/lib/growth/audiences"
import { fmtDay, SUGGESTION_LABEL } from "@/lib/growth/labels"
import type { MemberRow } from "@/lib/growth/store"
import { CreateSendDialog } from "../../_components/create-send-dialog"
import { fetchJson, GrowthGate } from "../../_components/growth-gate"

type Data = { audience: AudienceDef; today: string; rows: MemberRow[] }

const PAGE = 100

/** Panel › Growth › Audiencias › [una audiencia]: its clients and today's state, with "Crear envío". */
export default function AudienciaPage() {
  return (
    <GrowthGate>
      <Suspense fallback={null}>
        <Audiencia />
      </Suspense>
    </GrowthGate>
  )
}

function Audiencia() {
  const params = useParams<{ slug: string }>()
  const search = useSearchParams()
  const slug = params.slug as AudienceSlug
  const { tenantSlug, readOnly } = useTenant()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "ready" | "blocked">("all")
  const [store, setStore] = useState("")
  const [limit, setLimit] = useState(PAGE)
  const [createOpen, setCreateOpen] = useState(search.get("crear") === "1" && !readOnly)

  useEffect(() => {
    if (!tenantSlug || !AUDIENCE_BY_SLUG.has(slug)) return
    fetchJson<Data>(`/api/${tenantSlug}/growth/audiences/${slug}`)
      .then(setData)
      .catch((e: Error) => setError(e.message))
  }, [tenantSlug, slug])

  if (!AUDIENCE_BY_SLUG.has(slug)) return <Notice tone="bad">Audiencia no encontrada.</Notice>
  if (error) return <Notice tone="bad">{error}</Notice>
  if (!data) {
    return (
      <PanelMessage>
        <Loader2 className="w-4 h-4 animate-spin" />
      </PanelMessage>
    )
  }

  const stores = [
    ...new Set(data.rows.map((r) => r.store).filter((s): s is string => Boolean(s))),
  ].sort()
  const rows = data.rows.filter(
    (r) =>
      (filter === "all" || (filter === "ready" ? r.suggestion.ready : !r.suggestion.ready)) &&
      (!store || r.store === store),
  )
  const ready = data.rows.filter((r) => r.suggestion.ready).length
  const a = data.audience
  const sample = data.rows.find((r) => r.suggestion.ready) ?? data.rows[0]

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={[
          { label: "Panel", href: "/panel" },
          { label: "Growth", href: "/panel/growth" },
          { label: "Audiencias", href: "/panel/growth/audiencias" },
          { label: a.name },
        ]}
        title={`${a.name} · ${data.rows.length} clientes`}
        subtitle={`${a.rule}. ${a.informational ? "Audiencia informativa: sin envíos sugeridos." : `${ready} listos hoy.`}`}
        actions={
          !a.informational &&
          !readOnly && (
            <Button
              size="sm"
              className="h-8 text-[12.5px]"
              disabled={ready === 0}
              onClick={() => setCreateOpen(true)}
            >
              Crear envío
            </Button>
          )
        }
      />

      {!a.informational && (
        <CreateSendDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          audience={slug}
          sampleName={sample?.name}
        />
      )}

      <Panel>
        <PanelHeader title="Clientes en la audiencia" />
        <Toolbar>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-7 w-[200px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="ready">Listos hoy</SelectItem>
              <SelectItem value="blocked">Fuera hoy</SelectItem>
            </SelectContent>
          </Select>
          {stores.length > 1 && (
            <Select
              value={store || "__all"}
              onValueChange={(v) => setStore(v === "__all" ? "" : v)}
            >
              <SelectTrigger className="h-7 w-[200px] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas las tiendas</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Toolbar>
        <DataTable>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Tienda</Th>
              <Th className="text-right">Sin comprar</Th>
              <Th className="text-right">Cada</Th>
              <Th>Esperada</Th>
              <Th>Producto habitual</Th>
              <Th>Hoy</Th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <Tr key={r.clientId}>
                <Td>
                  <Link
                    href={`/panel/clientes/${r.clientId}`}
                    className="text-ent-accent hover:underline"
                  >
                    {r.name}
                  </Link>
                </Td>
                <Td className="text-ent-fg-2">{r.store ?? "—"}</Td>
                <Td className="text-right tabular-nums">
                  {r.daysSince == null ? "—" : `${r.daysSince} d`}
                </Td>
                <Td className="text-right tabular-nums text-ent-fg-2">
                  {r.intervalDays == null ? "—" : `${Math.round(r.intervalDays)} d`}
                </Td>
                <Td className="text-ent-fg-2">{fmtDay(r.expectedOn)}</Td>
                <Td className="text-ent-fg-2 max-w-[260px] truncate" title={r.product ?? ""}>
                  {r.product ?? "—"}
                  {r.detail.missing && (
                    <span className="text-ent-fg-3"> · nunca {r.detail.missing}</span>
                  )}
                </Td>
                <Td>
                  {a.informational ? (
                    <span className="text-ent-fg-3">—</span>
                  ) : (
                    <StatusChip
                      tone={
                        r.suggestion.ready
                          ? "ok"
                          : r.suggestion.reason === "no_contact"
                            ? "bad"
                            : "mute"
                      }
                    >
                      {SUGGESTION_LABEL[r.suggestion.reason]}
                      {!r.suggestion.ready && r.suggestion.availableOn
                        ? ` · desde ${fmtDay(r.suggestion.availableOn)}`
                        : ""}
                    </StatusChip>
                  )}
                </Td>
              </Tr>
            ))}
            {rows.length === 0 && (
              <Tr>
                <Td colSpan={7} className="text-center text-ent-fg-3 py-6">
                  Nadie con ese filtro.
                </Td>
              </Tr>
            )}
          </tbody>
        </DataTable>
        <PanelFooter>
          <span>
            {Math.min(limit, rows.length)} de {rows.length}
          </span>
          {rows.length > limit && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[12px]"
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Ver más
            </Button>
          )}
        </PanelFooter>
      </Panel>
    </div>
  )
}
