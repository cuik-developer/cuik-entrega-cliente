"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
  Notice,
  PageHeader,
  Panel,
  PanelFooter,
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
import type {
  CandidateSale,
  InferredLink,
  LinksReview,
  Suggestion,
  UnlinkedVisit,
} from "@/lib/pos/links-review"

type TenantOption = { id: string; name: string }

const SUGGESTION: Record<Suggestion, { label: string; tone: "ok" | "warn" | "mute" }> = {
  link: { label: "Enlazar", tone: "ok" },
  review: { label: "Revisar", tone: "warn" },
  none: { label: "Sin venta cerca", tone: "mute" },
}

const KIND: Record<string, string> = {
  inferred_amount: "por monto",
  inferred_time: "por única visita cercana",
}

function lastMonths(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }
  return out
}

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1, 12).toLocaleDateString("es-PE", { month: "long", year: "numeric" })
}
const soles = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (iso: string, tz: string) =>
  new Date(iso).toLocaleString("es-PE", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
const time = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("es-PE", { timeZone: tz, hour: "2-digit", minute: "2-digit" })

const input =
  "h-[26px] px-2 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent"

export function EnlacesClient() {
  const [tenants, setTenants] = useState<TenantOption[]>([])
  const [tenantId, setTenantId] = useState("")
  const [month, setMonth] = useState(lastMonths(1)[0])
  const [data, setData] = useState<LinksReview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | Suggestion>("all")
  const [busy, setBusy] = useState<string | null>(null)
  const reqSeq = useRef(0)

  useEffect(() => {
    fetch("/api/admin/pos-links")
      .then((r) => r.json())
      .then((json) => {
        const rows: TenantOption[] = json?.success ? json.data : []
        setTenants(rows)
        setTenantId((cur) => cur || rows[0]?.id || "")
      })
      .catch(() => setError("No se pudo cargar la lista de comercios"))
  }, [])

  const load = useCallback(async () => {
    if (!tenantId) return
    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/pos/links?month=${month}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo cargar")
      if (seq !== reqSeq.current) return
      setData(json.data)
    } catch (e) {
      if (seq === reqSeq.current) setError(e instanceof Error ? e.message : "Error de conexión")
    } finally {
      if (seq === reqSeq.current) setLoading(false)
    }
  }, [tenantId, month])

  useEffect(() => {
    void load()
  }, [load])

  async function post(action: "link" | "unlink" | "corte", body: Record<string, string>) {
    const res = await fetch(`/api/admin/tenants/${tenantId}/pos/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo guardar")
    return json.data
  }

  async function link(v: UnlinkedVisit, c: CandidateSale) {
    setBusy(c.saleId)
    try {
      await post("link", { saleId: c.saleId, visitId: v.visitId })
      toast.success(`Venta enlazada a ${v.clientName}`)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function unlink(l: InferredLink) {
    if (!window.confirm(`¿Quitar el enlace de la venta ${l.orderRef ?? ""} con ${l.clientName}?`))
      return
    setBusy(l.saleId)
    try {
      await post("unlink", { saleId: l.saleId })
      toast.success("Enlace quitado")
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function recomputeCorte() {
    setBusy("corte")
    try {
      await post("corte", { month })
      toast.success(`Corte de ${fmtMonth(month)} recalculado`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const s = data?.summary
  const rows = (data?.unlinked ?? []).filter((v) => filter === "all" || v.suggestion === filter)
  const tz = data?.timezone ?? "America/Lima"

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin" }, { label: "Validación de enlaces" }]}
        title="Validación de enlaces"
        subtitle="Antes de cerrar el mes: los registros (sellos) que no tienen una venta del punto de venta enlazada y los enlaces que Cuik infirió. Lo que se enlaza a mano queda fijo: la sincronización no lo toca."
        actions={
          tenantId && (
            <>
              <Button asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
                <a href={`/api/admin/tenants/${tenantId}/pos/links?month=${month}&format=csv`}>
                  Exportar registros sin venta
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[12.5px]"
                disabled={busy === "corte"}
                onClick={() => void recomputeCorte()}
              >
                Recalcular corte del mes
              </Button>
            </>
          )
        }
      />

      <Panel>
        <Toolbar>
          <select
            value={tenantId}
            aria-label="Comercio"
            onChange={(e) => setTenantId(e.target.value)}
            className={`${input} pr-6 cursor-pointer max-w-56`}
          >
            {tenants.length === 0 && <option value="">Sin comercios con conector</option>}
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={month}
            aria-label="Mes"
            onChange={(e) => setMonth(e.target.value)}
            className={`${input} pr-6 cursor-pointer`}
          >
            {lastMonths(8).map((m) => (
              <option key={m} value={m}>
                {fmtMonth(m)}
              </option>
            ))}
          </select>
          <select
            value={filter}
            aria-label="Sugerencia"
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className={`${input} pr-6 cursor-pointer`}
          >
            <option value="all">Sugerencia: todas</option>
            <option value="link">Enlazar</option>
            <option value="review">Revisar</option>
            <option value="none">Sin venta cerca</option>
          </select>
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-ent-fg-3" />}
        </Toolbar>
      </Panel>

      {error && <Notice tone="bad">{error}</Notice>}

      {s && (
        <StatStrip
          stats={[
            {
              label: "Registros con venta",
              value: s.rate == null ? "—" : `${s.rate} %`,
              hint: `${s.withSale} de ${s.visits} · meta 95 %`,
              tone: s.rate != null && s.rate < 95 ? "warn" : "ok",
            },
            {
              label: "Registros sin venta",
              value: s.withoutSale,
              hint: `${s.suggestions.link} enlazar · ${s.suggestions.review} revisar · ${s.suggestions.none} sin venta cerca`,
            },
            {
              label: "Enlaces del mes",
              value:
                s.byKind.dni + s.byKind.inferredAmount + s.byKind.inferredTime + s.byKind.manual,
              hint: `${s.byKind.dni} por DNI · ${s.byKind.inferredAmount + s.byKind.inferredTime} inferidos · ${s.byKind.manual} a mano`,
            },
            {
              label: "Compras de clientes sin sello",
              value: s.clientNoVisit,
              hint: `${s.guestUnlinked} ventas de invitado sin enlazar`,
            },
          ]}
        />
      )}

      <Panel>
        <PanelHeader title={`Registros sin venta (${rows.length})`} />
        {!data ? (
          <PanelMessage>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Elige un comercio."}
          </PanelMessage>
        ) : rows.length === 0 ? (
          <PanelMessage>Nada que revisar con ese filtro.</PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Registro</Th>
                <Th>Cliente</Th>
                <Th>Tienda</Th>
                <Th className="text-right">Monto sello</Th>
                <Th>Sugerencia</Th>
                <Th>Ventas cercanas (sin enlazar)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <UnlinkedRow
                  key={v.visitId}
                  v={v}
                  tz={tz}
                  tenantId={tenantId}
                  busy={busy !== null}
                  onLink={(c) => void link(v, c)}
                />
              ))}
            </tbody>
          </DataTable>
        )}
        {data && (
          <PanelFooter>
            <span>
              {rows.length} de {data.unlinked.length} registros sin venta en {fmtMonth(month)}
            </span>
            <span>Un registro sin venta cerca suele ser un servicio o un sello sin compra.</span>
          </PanelFooter>
        )}
      </Panel>

      {data && (
        <Panel>
          <PanelHeader
            title={`Enlaces inferidos en ${fmtMonth(month)} (${data.inferred.length})`}
          />
          {data.inferred.length === 0 ? (
            <PanelMessage>Ningún enlace inferido este mes.</PanelMessage>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Venta</Th>
                  <Th className="text-right">Monto</Th>
                  <Th>Registro</Th>
                  <Th className="text-right">Monto sello</Th>
                  <Th>Cómo</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.inferred.map((l) => (
                  <Tr key={l.saleId}>
                    <Td className="whitespace-nowrap text-ent-fg-2">
                      {when(l.soldAt, tz)}
                      {l.store ? ` · ${l.store}` : ""}
                      {l.orderRef ? <span className="text-ent-fg-3"> · {l.orderRef}</span> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{soles(l.amount)}</Td>
                    <Td>
                      {l.clientName}
                      <span className="text-ent-fg-3">
                        {" "}
                        · {time(l.visitAt, tz)}
                        {l.location ? ` · ${l.location}` : ""}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">{soles(l.visitAmount)}</Td>
                    <Td>
                      <StatusChip tone="info">{KIND[l.linkKind] ?? l.linkKind}</StatusChip>
                    </Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11.5px]"
                        disabled={busy !== null}
                        onClick={() => void unlink(l)}
                      >
                        Quitar
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      )}
    </div>
  )
}

function UnlinkedRow({
  v,
  tz,
  tenantId,
  busy,
  onLink,
}: {
  v: UnlinkedVisit
  tz: string
  tenantId: string
  busy: boolean
  onLink: (c: CandidateSale) => void
}) {
  return (
    <Tr>
      <Td className="whitespace-nowrap text-ent-fg-2">
        {when(v.createdAt, tz)}
        {v.registeredBy && <span className="text-ent-fg-3"> · {v.registeredBy.split(" ")[0]}</span>}
      </Td>
      <Td>
        <Link href={`/admin/tenants/${tenantId}`} className="text-ent-fg hover:underline">
          {v.clientName}
        </Link>
        <span className="text-ent-fg-3"> · {v.dni ?? "sin DNI"}</span>
      </Td>
      <Td className="text-ent-fg-2">{v.location ?? "—"}</Td>
      <Td className="text-right tabular-nums">{soles(v.amount)}</Td>
      <Td>
        <StatusChip tone={SUGGESTION[v.suggestion].tone}>
          {SUGGESTION[v.suggestion].label}
        </StatusChip>
      </Td>
      <Td>
        {v.candidates.length === 0 ? (
          <span className="text-ent-fg-3">Ninguna en ±2 h</span>
        ) : (
          <div className="space-y-1">
            {v.candidates.map((c) => (
              <div key={c.saleId} className="flex items-center gap-2 flex-wrap text-[12px]">
                <span className={c.sameAmount ? "font-medium text-ent-fg" : "text-ent-fg-2"}>
                  {time(c.soldAt, tz)} ({c.minutes > 0 ? "+" : ""}
                  {c.minutes} min) · {soles(c.amount)}
                </span>
                <span className="text-ent-fg-3">
                  {c.dni ? `doc. ${c.dni}` : "invitado"}
                  {c.customerName ? ` · ${c.customerName}` : ""}
                  {c.store ? ` · ${c.store}` : ""}
                  {c.clientId ? " · cliente Cuik sin sello" : ""}
                  {c.orderRef ? ` · ${c.orderRef}` : ""}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11.5px]"
                  disabled={busy}
                  onClick={() => onLink(c)}
                >
                  Enlazar
                </Button>
              </div>
            ))}
          </div>
        )}
      </Td>
    </Tr>
  )
}
