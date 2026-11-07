"use client"

import { Loader2, Megaphone, Search, Stamp } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  DataTable,
  FieldList,
  PageHeader,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { DemoClientRow, DemoClientState, DemoTenant } from "@/lib/admin/simulator"
import { cn } from "@/lib/utils"
import { findDemoClients, getDemoClient, simulateCampaign, simulateVisit } from "./actions"

type Recent = {
  id: string
  createdAt: string
  actorName: string | null
  tenantName: string | null
  action: string
  targetName: string | null
  detail: unknown
}

const selectCls =
  "h-7 rounded-[3px] border border-ent-line-strong bg-ent-panel px-2 text-[12.5px] text-ent-fg min-w-0"

function when(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso))
}

function recentAction(r: Recent): string {
  const d = r.detail && typeof r.detail === "object" ? (r.detail as Record<string, unknown>) : {}
  if (r.action === "visit_registered") {
    if (typeof d.stamps === "string") return `Registró visita · sello ${d.stamps}`
    if (typeof d.points === "number") return `Registró visita · ${d.points} puntos`
    return "Registró visita"
  }
  if (r.action === "campaign_sent") {
    return typeof d.sent === "number" ? `Envió campaña · ${d.sent} recibida(s)` : "Envió campaña"
  }
  return r.action
}

function StampRow({ filled, max }: { filled: number; max: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: Math.min(max, 20) }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length stamp row
            key={i}
            className={cn(
              "w-3.5 h-3.5 rounded-full border-[1.5px]",
              i < filled ? "bg-ent-accent border-ent-accent" : "border-ent-line-strong",
            )}
          />
        ))}
      </span>
      <span className="tabular-nums">
        {filled} de {max}
      </span>
    </span>
  )
}

function PassChip({ state }: { state: DemoClientState }) {
  if (state.appleDevices > 0) {
    const phones = state.appleDevices === 1 ? "teléfono" : "teléfonos"
    return (
      <StatusChip tone="ok">
        Apple Wallet en {state.appleDevices} {phones}
      </StatusChip>
    )
  }
  if (state.hasPass)
    return <StatusChip tone="info">Pase creado, sin Apple Wallet registrado</StatusChip>
  return <StatusChip tone="mute">Sin pase</StatusChip>
}

function clientRows(state: DemoClientState, points: boolean) {
  return [
    { label: "Cliente", value: state.name },
    points
      ? { label: "Puntos", value: state.pointsBalance }
      : { label: "Sellos", value: <StampRow filled={state.stampsInCycle} max={state.maxVisits} /> },
    { label: "Visitas totales", value: state.totalVisits },
    { label: "Premios por canjear", value: state.pendingRewards },
    { label: "Pase", value: <PassChip state={state} /> },
  ]
}

function programLabel(tenant: DemoTenant | null): string {
  if (tenant?.program === "points") return "Programa de puntos."
  if (tenant?.program === "stamps") return `Programa de sellos · ${tenant.maxVisits} por tarjeta.`
  return "Sin promoción activa."
}

export function SimulatorClient({
  tenants,
  isOwner,
  recent,
}: {
  tenants: DemoTenant[]
  isOwner: boolean
  recent: Recent[]
}) {
  const router = useRouter()
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "")
  const tenant = tenants.find((t) => t.id === tenantId) ?? null
  const [query, setQuery] = useState("")
  const [clients, setClients] = useState<DemoClientRow[] | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [state, setState] = useState<DemoClientState | null>(null)
  const [amount, setAmount] = useState("")
  const [toAll, setToAll] = useState(false)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState<"visit" | "campaign" | null>(null)
  const [, startTransition] = useTransition()

  const loadClients = useCallback(
    async (q: string) => {
      if (!tenantId) return
      const r = await findDemoClients(tenantId, q)
      if (r.success) setClients(r.data)
      else {
        setClients([])
        toast.error(r.error)
      }
    },
    [tenantId],
  )

  // New demo: start over with its newest clients.
  useEffect(() => {
    setClientId(null)
    setState(null)
    setClients(null)
    setQuery("")
    void loadClients("")
  }, [loadClients])

  async function pick(id: string) {
    setClientId(id)
    setState(null)
    const r = await getDemoClient(tenantId, id)
    if (r.success) setState(r.data)
    else toast.error(r.error)
  }

  async function visit() {
    if (!tenant || !clientId) return
    const value = Number(amount.replace(",", "."))
    if (tenant.program === "points" && !(value > 0)) {
      toast.error("Ingresa el monto de la compra para sumar puntos.")
      return
    }
    setBusy("visit")
    try {
      const r = await simulateVisit({
        tenantId: tenant.id,
        clientId,
        amount: tenant.program === "points" ? value : undefined,
      })
      if (r.success) {
        toast.success(r.data.message)
        if (r.data.state) setState(r.data.state)
        startTransition(() => router.refresh())
      } else toast.error(r.error)
    } catch {
      toast.error("No se pudo registrar la visita. Intenta de nuevo")
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    if (!tenant || (!toAll && !clientId)) return
    setBusy("campaign")
    try {
      const r = await simulateCampaign({
        tenantId: tenant.id,
        clientId: toAll ? null : clientId,
        message,
      })
      if (r.success) {
        toast.success(r.data.message)
        setMessage("")
        startTransition(() => router.refresh())
      } else toast.error(r.error)
    } catch {
      toast.error("No se pudo enviar la campaña. Intenta de nuevo")
    } finally {
      setBusy(null)
    }
  }

  const header = (
    <PageHeader
      crumbs={[{ label: "Inicio", href: "/admin" }, { label: "Loyalty" }, { label: "Simulador" }]}
      title="Simulador"
      subtitle="Prueba visitas y campañas en las demos internas. Los comercios reales no aparecen aquí."
    />
  )

  if (tenants.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        <Panel>
          <PanelMessage>
            No hay demos internas marcadas.
            {isOwner ? (
              <Link href="/admin/configuracion" className="text-ent-accent hover:underline">
                Márcalas en Sistema › Configuración
              </Link>
            ) : (
              <span>Pide al dueño que las marque en Sistema › Configuración.</span>
            )}
          </PanelMessage>
        </Panel>
      </div>
    )
  }

  const selected = clients?.find((c) => c.id === clientId) ?? null
  const silent = state ? state.status === "archived" || state.status === "deleted" : false

  return (
    <div className="space-y-3">
      {header}

      <Panel className="flex items-center gap-2.5 flex-wrap px-3 py-2 border-l-[3px] border-l-ent-warn">
        <span className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-ent-warn">
          Modo demo
        </span>
        <label htmlFor="sim-tenant" className="text-[12.5px] text-ent-fg-2">
          Comercio
        </label>
        <select
          id="sim-tenant"
          className={selectCls}
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-ent-fg-3">
          {programLabel(tenant)} Las notificaciones llegan de verdad a los teléfonos con pases de
          esta demo.
        </span>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Cliente de prueba" />
          <form
            className="flex items-center gap-2 px-3 py-2.5 border-b border-ent-line"
            onSubmit={(e) => {
              e.preventDefault()
              void loadClients(query)
            }}
          >
            <Input
              id="sim-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, teléfono o DNI"
              className="h-7 text-[12.5px]"
              aria-label="Buscar cliente"
            />
            <Button type="submit" size="sm" variant="outline" className="h-7 text-[12px] gap-1.5">
              <Search className="w-3.5 h-3.5" />
              Buscar
            </Button>
          </form>

          {clients === null ? (
            <PanelMessage>
              <Loader2 className="w-4 h-4 animate-spin" />
            </PanelMessage>
          ) : clients.length === 0 ? (
            <PanelMessage>
              Sin clientes en esta demo. Regístrate desde la página pública de la demo para crear
              uno.
            </PanelMessage>
          ) : (
            <ul className="max-h-[220px] overflow-y-auto border-b border-ent-line">
              {clients.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void pick(c.id)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-[7px] text-left text-[12.5px] border-b border-ent-line last:border-b-0 hover:bg-ent-panel-2",
                      c.id === clientId && "bg-ent-accent-soft text-ent-accent font-semibold",
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-ent-fg-3 tabular-nums shrink-0">
                      {c.status === "archived" ? "Archivado" : (c.phone ?? "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selected && !state && (
            <PanelMessage>
              <Loader2 className="w-4 h-4 animate-spin" />
            </PanelMessage>
          )}
          {state && (
            <>
              <FieldList className="px-3" rows={clientRows(state, tenant?.program === "points")} />
              <div className="px-3 py-2.5 border-t border-ent-line space-y-2">
                {silent && (
                  <div className="text-[12px] text-ent-warn">
                    Cliente archivado: la visita se registra, pero su pase no recibe avisos.
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {tenant?.program === "points" && (
                    <Input
                      id="sim-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Monto S/"
                      className="h-7 w-28 text-[12.5px]"
                      aria-label="Monto de la compra"
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-[12px] gap-1.5"
                    disabled={busy !== null}
                    onClick={() => void visit()}
                  >
                    {busy === "visit" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Stamp className="w-3.5 h-3.5" />
                    )}
                    Registrar visita
                  </Button>
                </div>
                <div className="text-[12px] text-ent-fg-3">
                  Misma lógica que el cajero: suma la visita, actualiza el pase y avisa al teléfono.
                </div>
              </div>
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Campaña de prueba" />
          <div className="p-3 space-y-2.5">
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">Para</div>
              <div className="flex flex-col gap-1.5 text-[12.5px]">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sim-to"
                    checked={!toAll}
                    onChange={() => setToAll(false)}
                  />
                  {state ? `Solo ${state.name}` : "Solo el cliente seleccionado"}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="sim-to"
                    checked={toAll}
                    onChange={() => setToAll(true)}
                  />
                  Todos los clientes de la demo
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <label
                htmlFor="sim-message"
                className="block text-[11px] uppercase tracking-[0.05em] text-ent-fg-3"
              >
                Mensaje
              </label>
              <Textarea
                id="sim-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Hoy 2x1 en cafés hasta las 6 pm. Muestra tu tarjeta."
                className="text-[12.5px]"
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-7 text-[12px] gap-1.5"
              disabled={busy !== null || !message.trim() || (!toAll && !clientId)}
              onClick={() => void send()}
            >
              {busy === "campaign" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Megaphone className="w-3.5 h-3.5" />
              )}
              Enviar campaña
            </Button>
            <div className="text-[12px] text-ent-fg-3">
              Archivados y eliminados nunca la reciben. Queda en Validación de campañas y en
              Historial.
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Últimas pruebas"
          actions={
            <Link
              href="/admin/historial?area=simulator"
              className="text-[12px] font-normal text-ent-accent hover:underline"
            >
              Ver historial
            </Link>
          }
        />
        {recent.length === 0 ? (
          <PanelMessage>Todavía no hay pruebas. Aparecerán aquí.</PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Persona</Th>
                <Th>Comercio</Th>
                <Th>Acción</Th>
                <Th>Sobre</Th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular-nums text-ent-fg-2">{when(r.createdAt)}</Td>
                  <Td>{r.actorName || "—"}</Td>
                  <Td>{r.tenantName || "—"}</Td>
                  <Td className="font-medium">{recentAction(r)}</Td>
                  <Td>{r.targetName || "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </div>
  )
}
