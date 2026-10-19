"use client"

import { Loader2, X } from "lucide-react"
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
  type Stat,
  StatStrip,
  StatusChip,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ComplaintRow, ComplaintsData } from "@/lib/admin/complaints-data"
import { type ComplaintStatus, deadlineBadge, longDate } from "@/lib/complaints"
import { cn } from "@/lib/utils"

type Filter = "all" | ComplaintStatus
const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Pendientes" },
  { value: "answered", label: "Respondidas" },
  { value: "closed", label: "Cerradas" },
  { value: "all", label: "Todas" },
]
const EMAIL_LABEL = {
  sent: "Enviados",
  partial: "Uno falló",
  failed: "Fallaron",
} as const

function dmy(ymd: string) {
  const [y, m, d] = ymd.split("-")
  return `${d}/${m}/${y.slice(2)}`
}
function dateTime(iso: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso))
}

type Result = ComplaintsData & { emailed: boolean | null }

async function patch(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/complaints/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const fieldError = json?.details?.fieldErrors
      ? (Object.values(json.details.fieldErrors as Record<string, string[]>).flat()[0] ?? null)
      : null
    throw new Error(fieldError ?? json?.error ?? "No se pudo guardar")
  }
  return json.data as Result
}

/**
 * Libro de Reclamaciones: the Hojas de Reclamación filed on the public site,
 * their legal deadline (15 business days, Lima) and the answer sent to the
 * consumer.
 */
export function ReclamacionesClient() {
  const [data, setData] = useState<ComplaintsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("pending")
  const [openId, setOpenId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/complaints")
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión")
    }
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const rows = useMemo(() => {
    if (!data) return []
    return filter === "all" ? data.complaints : data.complaints.filter((c) => c.status === filter)
  }, [data, filter])

  if (error) return <PanelMessage className="py-20">{error}</PanelMessage>
  if (!data) {
    return (
      <PanelMessage className="py-20">
        <Loader2 className="w-5 h-5 animate-spin" />
      </PanelMessage>
    )
  }

  const pending = data.complaints.filter((c) => c.status === "pending")
  const overdue = pending.filter((c) => deadlineBadge(c, data.today).tone === "bad").length
  const dueSoon = pending.filter((c) => deadlineBadge(c, data.today).tone === "warn").length
  const emailIssues = data.complaints.filter(
    (c) => c.emailStatus === "failed" || c.emailStatus === "partial",
  ).length
  const stats: Stat[] = [
    { label: "Pendientes", value: pending.length },
    {
      label: "Vencidas",
      value: overdue,
      hint: overdue > 0 ? "fuera de plazo" : "al día",
      tone: overdue > 0 ? "bad" : "ok",
    },
    {
      label: "Vencen pronto",
      value: dueSoon,
      hint: "3 días hábiles o menos",
      tone: dueSoon > 0 ? "warn" : "mute",
    },
    { label: "Total recibidas", value: data.complaints.length },
  ]
  const open = openId ? (data.complaints.find((c) => c.id === openId) ?? null) : null

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/admin" }, { label: "Reclamaciones" }]}
        title="Libro de Reclamaciones"
        subtitle="Hojas de Reclamación del sitio público. El plazo legal para responder es de 15 días hábiles (lunes a viernes, sin feriados nacionales) contados desde el día siguiente a su registro."
      />
      <StatStrip stats={stats} />

      {emailIssues > 0 && (
        <Notice tone="warn">
          {emailIssues === 1
            ? "Una hoja no llegó completa por correo"
            : `${emailIssues} hojas no llegaron completas por correo`}{" "}
          (a Cuik o al consumidor). Quedaron registradas igual; revisa la columna «Correos».
        </Notice>
      )}

      {open && (
        <ComplaintDetail
          key={open.id}
          c={open}
          today={data.today}
          onClose={() => setOpenId(null)}
          onSaved={setData}
        />
      )}

      <Panel>
        <Toolbar>
          <div className="flex items-center gap-1 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "h-7 px-2.5 rounded-[3px] text-[12px] border",
                  filter === f.value
                    ? "bg-ent-fg text-white border-ent-fg"
                    : "border-ent-line text-ent-fg-2 hover:bg-ent-panel-2",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Toolbar>
        {rows.length === 0 ? (
          <PanelMessage className="py-10">
            {data.complaints.length === 0
              ? "Todavía no hay hojas de reclamación."
              : "Nada que coincida con el filtro."}
          </PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Fecha</Th>
                <Th>Tipo</Th>
                <Th>Consumidor</Th>
                <Th>Vence</Th>
                <Th>Correos</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const badge = deadlineBadge(c, data.today)
                return (
                  <Tr
                    key={c.id}
                    className={cn("cursor-pointer", openId === c.id && "bg-ent-accent-soft")}
                    onClick={() => setOpenId(c.id)}
                  >
                    <Td className="font-mono text-[12px]">{c.numero}</Td>
                    <Td className="text-ent-fg-2">{dateTime(c.createdAt)}</Td>
                    <Td>{c.tipo === "reclamo" ? "Reclamo" : "Queja"}</Td>
                    <Td>
                      <div className="font-medium truncate max-w-[220px]">{c.nombre}</div>
                      <div className="text-[11px] text-ent-fg-3 truncate max-w-[220px]">
                        {c.email}
                      </div>
                    </Td>
                    <Td>
                      <StatusChip
                        tone={badge.tone}
                        title={`Vence el ${longDate(c.dueOn)}`}
                        className={cn(badge.tone === "bad" && "font-semibold")}
                      >
                        {badge.label}
                        <span className="text-ent-fg-3 font-normal"> · {dmy(c.dueOn)}</span>
                      </StatusChip>
                    </Td>
                    <Td>
                      {c.emailStatus ? (
                        <StatusChip
                          tone={
                            c.emailStatus === "sent"
                              ? "ok"
                              : c.emailStatus === "partial"
                                ? "warn"
                                : "bad"
                          }
                        >
                          {EMAIL_LABEL[c.emailStatus]}
                        </StatusChip>
                      ) : (
                        <span className="text-ent-fg-3">—</span>
                      )}
                    </Td>
                    <Td align="right">
                      <button
                        type="button"
                        className="text-[12px] text-ent-accent hover:underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpenId(c.id)
                        }}
                      >
                        {c.status === "pending" ? "Responder" : "Ver"}
                      </button>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </div>
  )
}

function ComplaintDetail({
  c,
  today,
  onClose,
  onSaved,
}: {
  c: ComplaintRow
  today: string
  onClose: () => void
  onSaved: (d: ComplaintsData) => void
}) {
  const [answer, setAnswer] = useState(c.answer ?? "")
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState<"answer" | "close" | null>(null)
  const badge = deadlineBadge(c, today)

  async function submitAnswer() {
    setBusy("answer")
    try {
      const d = await patch(c.id, { action: "answer", answer, sendEmail: notify })
      onSaved(d)
      if (d.emailed === false) {
        toast.warning("Respuesta guardada, pero el correo al consumidor falló. Reenvíala.")
      } else {
        toast.success(d.emailed ? "Respuesta guardada y enviada" : "Respuesta guardada")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(null)
    }
  }
  async function close() {
    if (!confirm(`¿Cerrar la hoja ${c.numero}?`)) return
    setBusy("close")
    try {
      onSaved(await patch(c.id, { action: "close" }))
      toast.success("Hoja cerrada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cerrar")
    } finally {
      setBusy(null)
    }
  }

  const rows = [
    { label: "Número", value: <span className="font-mono">{c.numero}</span> },
    { label: "Registrada", value: dateTime(c.createdAt) },
    {
      label: "Vence",
      value: (
        <span>
          {longDate(c.dueOn)}{" "}
          <StatusChip tone={badge.tone} className="ml-1">
            {badge.label}
          </StatusChip>
        </span>
      ),
    },
    { label: "Tipo", value: c.tipo === "reclamo" ? "Reclamo" : "Queja" },
    { label: "Consumidor", value: c.nombre },
    { label: "Documento", value: `${c.documentoTipo} ${c.documento}` },
    { label: "Domicilio", value: c.domicilio },
    { label: "Teléfono", value: c.telefono },
    { label: "Correo", value: c.email },
    {
      label: "Menor de edad",
      value: c.menor ? `Sí · apoderado: ${c.apoderado ?? "—"}` : "No",
    },
    {
      label: "Bien contratado",
      value: `${c.bienTipo === "producto" ? "Producto" : "Servicio"} — ${c.bienDescripcion}`,
    },
    {
      label: "Monto reclamado",
      value:
        c.monto === null
          ? "—"
          : `S/ ${c.monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    { label: "Detalle", value: <span className="whitespace-pre-wrap">{c.detalle}</span> },
    { label: "Pedido", value: <span className="whitespace-pre-wrap">{c.pedido}</span> },
    {
      label: "Correos al registrar",
      value: c.emailStatus ? EMAIL_LABEL[c.emailStatus] : "—",
    },
    ...(c.answeredAt
      ? [
          {
            label: "Respondida",
            value: `${dateTime(c.answeredAt)}${c.answeredByName ? ` · ${c.answeredByName}` : ""}`,
          },
        ]
      : []),
  ]

  return (
    <Panel>
      <PanelHeader
        title={`${c.tipo === "reclamo" ? "Reclamo" : "Queja"} ${c.numero}`}
        actions={
          <>
            {c.status !== "closed" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[12px]"
                onClick={close}
                disabled={busy !== null}
              >
                {busy === "close" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Cerrar
              </Button>
            )}
            <button
              type="button"
              className="p-1 text-ent-fg-3 hover:text-ent-fg"
              onClick={onClose}
              aria-label="Ocultar detalle"
              title="Ocultar detalle"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        }
      />
      <div className="grid lg:grid-cols-2 gap-4 p-3">
        <FieldList rows={rows} />
        <div className="space-y-2">
          {c.status === "closed" ? (
            <>
              <Label className="text-xs">Respuesta</Label>
              <div className="text-[12.5px] whitespace-pre-wrap text-ent-fg-2 border border-ent-line rounded-[4px] p-2 min-h-[80px]">
                {c.answer ?? "Cerrada sin respuesta registrada."}
              </div>
            </>
          ) : (
            <>
              <Label htmlFor="complaint-answer" className="text-xs">
                {c.status === "answered" ? "Respuesta (editar y reenviar)" : "Respuesta"}
              </Label>
              <Textarea
                id="complaint-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={10}
                placeholder="Respuesta al consumidor: qué se revisó, qué se resolvió y qué medidas se tomaron."
                className="text-[13px]"
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="complaint-notify"
                  checked={notify}
                  onCheckedChange={(v) => setNotify(v === true)}
                />
                <Label htmlFor="complaint-notify" className="text-[12.5px] font-normal">
                  Enviar la respuesta por correo al consumidor ({c.email})
                </Label>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-8 text-[12.5px]"
                  onClick={submitAnswer}
                  disabled={busy !== null || answer.trim().length < 10}
                >
                  {busy === "answer" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {c.status === "answered" ? "Guardar respuesta" : "Responder"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
