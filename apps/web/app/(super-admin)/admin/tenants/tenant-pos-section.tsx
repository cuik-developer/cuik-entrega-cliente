"use client"

import { Loader2, Plug, RefreshCw, Upload } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { FieldList, Notice, StatusChip } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  MASTER_FIELD_LABELS,
  MASTER_FIELDS,
  type MasterField,
  type MasterMapping,
} from "@/lib/pos/product-master"
import type { MasterApplyResult, MasterPreview, MasterSummary } from "@/lib/pos/products"
import type { PosConnectionView, SyncResult, TestResult } from "@/lib/pos/sync"

/**
 * Super-admin › tenant › General: the POS connector (Odoo) and the product
 * master. The API key is write-only: typed here, stored encrypted, never
 * shown again.
 */

type Form = {
  baseUrl: string
  database: string
  login: string
  apiKey: string
  startDate: string
  enabled: boolean
  retentionDays: string
  excludedDnis: string
}

function todayYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" })
}

function emptyForm(startDate: string): Form {
  return {
    baseUrl: "",
    database: "",
    login: "",
    apiKey: "",
    startDate,
    enabled: false,
    retentionDays: "90",
    excludedDnis: "",
  }
}

/** The form as the server stored it (trimmed, origin only), with the key field blank. */
function formFrom(c: PosConnectionView): Form {
  return {
    baseUrl: c.baseUrl,
    database: c.database,
    login: c.login,
    apiKey: "",
    startDate: c.startDate,
    enabled: c.enabled,
    retentionDays: String(c.retentionDays),
    excludedDnis: c.excludedDnis.join(", "),
  }
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "Nunca"
  return new Date(iso).toLocaleString("es-PE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const inputClass = "h-8 text-[12.5px]"
const labelClass = "text-[11px] uppercase tracking-[0.05em] text-ent-fg-3"

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; connection: PosConnectionView | null; suggestedStartDate: string | null }

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one form with its view, edit and action states
export function TenantPosSection({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [form, setForm] = useState<Form>(emptyForm(todayYmd()))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<"save" | "test" | "sync" | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)
  const conn = state.kind === "ready" ? state.connection : null

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/pos`)
      const json = await res.json()
      if (!json.success) {
        setState({ kind: "error", message: json.error ?? "No se pudo cargar el conector" })
        return
      }
      const c = json.data.connection as PosConnectionView | null
      const suggested = (json.data.suggestedStartDate as string | null) ?? null
      setState({ kind: "ready", connection: c, suggestedStartDate: suggested })
      if (c) setForm(formFrom(c))
      else {
        setForm(emptyForm(suggested ?? todayYmd()))
        setEditing(true)
      }
    } catch {
      setState({ kind: "error", message: "Error de conexión" })
    }
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setTest(null)
    setForm((f) => ({ ...f, [k]: v }))
  }

  function payload() {
    return {
      baseUrl: form.baseUrl,
      database: form.database,
      login: form.login,
      startDate: form.startDate,
      enabled: form.enabled,
      retentionDays: Number(form.retentionDays) || 90,
      excludedDnis: form.excludedDnis
        .split(/[\s,;]+/)
        .map((d) => d.trim())
        .filter(Boolean),
      apiKey: form.apiKey || undefined,
    }
  }

  async function save() {
    setBusy("save")
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/pos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo guardar")
        return
      }
      const saved = json.data as PosConnectionView
      setState((s) => (s.kind === "ready" ? { ...s, connection: saved } : s))
      setForm(formFrom(saved))
      setTest(null)
      setEditing(false)
      toast.success("Conector guardado")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusy(null)
    }
  }

  /** Tests what is on screen (unsaved values included), not what was stored. */
  async function runTest() {
    setBusy("test")
    setTest(null)
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/pos/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: form.baseUrl,
          database: form.database,
          login: form.login,
          apiKey: form.apiKey || undefined,
          startDate: form.startDate || undefined,
        }),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "La prueba falló")
        return
      }
      const r = json.data as TestResult
      setTest(r)
      if (r.kind === "databases") {
        // Asked with the database blank: the server told us what it hosts.
        if (r.databases.length === 1) {
          setForm((f) => ({ ...f, database: r.databases[0] }))
          toast.success(`Base de datos detectada: ${r.databases[0]}`)
        } else if (r.databases.length === 0) {
          toast.info("Odoo no muestra sus bases de datos; pídele el nombre al administrador.")
        } else toast.success(`${r.databases.length} bases de datos encontradas`)
      } else toast.success("Conexión correcta")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusy(null)
    }
  }

  async function runSync(full: boolean) {
    if (
      full &&
      !window.confirm(
        "¿Volver a traer todas las órdenes desde la fecha de inicio? Tarda varias corridas.",
      )
    )
      return
    setBusy("sync")
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/pos/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full }),
      })
      const json = await res.json()
      const r = json.data as SyncResult | undefined
      if (!json.success || !r) toast.error(json.error ?? "No se pudo sincronizar")
      else if (r.error) toast.error(r.error)
      else {
        const parts = [
          `${r.pulled.toLocaleString("es-PE")} órdenes leídas`,
          `${r.matchedVisits.toLocaleString("es-PE")} visitas vinculadas`,
        ]
        if (r.replacedFileSales > 0)
          parts.push(
            `${r.replacedFileSales.toLocaleString("es-PE")} ventas del archivo reemplazadas`,
          )
        if (r.skippedBadAmount > 0) parts.push(`${r.skippedBadAmount} descartadas por monto`)
        if (r.more) parts.push("continúa en la próxima corrida")
        toast.success(parts.join(" · "))
      }
      await load()
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusy(null)
    }
  }

  // The database may be blank: the test then lists the ones the server hosts.
  const canTest = !!form.baseUrl && !!form.login && (!!form.apiKey || !!conn?.hasApiKey)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ent-fg-3 uppercase tracking-wide">Conector POS</p>
      <div className="rounded-[4px] border border-ent-line">
        {state.kind === "loading" && (
          <div className="flex items-center gap-2 p-3 text-[12.5px] text-ent-fg-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
          </div>
        )}
        {state.kind === "error" && (
          <div className="p-3">
            <Notice
              tone="bad"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[12px]"
                  onClick={() => {
                    setState({ kind: "loading" })
                    void load()
                  }}
                >
                  Reintentar
                </Button>
              }
            >
              {state.message}
            </Notice>
          </div>
        )}
        {state.kind === "ready" && (
          <>
            <div className="flex items-start gap-3 p-3 border-b border-ent-line">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ent-fg">Odoo (API externa, JSON-RPC)</div>
                <div className="text-[11.5px] text-ent-fg-3 leading-snug mt-0.5">
                  Las ventas del punto de venta llegan solas cada 15 minutos con sus productos y se
                  vinculan a la visita del cliente. Reemplaza el archivo mensual de Impacto desde la
                  fecha de inicio.
                </div>
              </div>
              {conn && (
                <div className="flex flex-col items-end gap-1">
                  <StatusChip tone={conn.enabled ? (conn.lastError ? "bad" : "ok") : "mute"}>
                    {conn.enabled ? (conn.lastError ? "Con error" : "Activo") : "Apagado"}
                  </StatusChip>
                  {conn.syncing && <StatusChip tone="info">Sincronizando</StatusChip>}
                  {!conn.syncing && conn.enabled && conn.backfilling && (
                    <StatusChip tone="info">Carga inicial</StatusChip>
                  )}
                </div>
              )}
            </div>

            {conn && !editing && (
              <div className="p-3 space-y-3">
                <FieldList
                  rows={[
                    { label: "Servidor", value: conn.baseUrl },
                    { label: "Base de datos", value: conn.database },
                    { label: "Usuario", value: conn.login },
                    { label: "API key", value: conn.hasApiKey ? "Configurada" : "Falta" },
                    { label: "Desde", value: conn.startDate },
                    {
                      label: "Corte",
                      value: `Retención ${conn.retentionDays} días${
                        conn.excludedDnis.length
                          ? ` · ${conn.excludedDnis.length} DNI excluidos`
                          : " · sin DNI excluidos"
                      }`,
                    },
                    {
                      label: "Última sincronización",
                      value: `${fmtWhen(conn.lastSyncAt)}${
                        conn.lastSyncOrders !== null
                          ? ` · ${conn.lastSyncOrders.toLocaleString("es-PE")} órdenes leídas`
                          : ""
                      }`,
                    },
                    {
                      label: "Cursor",
                      value: conn.cursor
                        ? `${conn.cursor.writeDate} UTC${conn.cursor.exhausted ? "" : " (incompleto)"}`
                        : "Sin iniciar",
                    },
                  ]}
                />
                {conn.lastError && <Notice tone="bad">{conn.lastError}</Notice>}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[12px] gap-1.5"
                    onClick={() => {
                      setTest(null)
                      setEditing(true)
                    }}
                    disabled={busy !== null}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[12px] gap-1.5"
                    onClick={() => void runTest()}
                    disabled={busy !== null || !canTest}
                  >
                    {busy === "test" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plug className="w-3.5 h-3.5" />
                    )}
                    Probar conexión
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-[12px] gap-1.5"
                    onClick={() => void runSync(false)}
                    disabled={busy !== null || !conn.hasApiKey || conn.syncing}
                  >
                    {busy === "sync" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    Sincronizar ahora
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[12px]"
                    onClick={() => void runSync(true)}
                    disabled={busy !== null || !conn.hasApiKey || conn.syncing}
                  >
                    Re-sincronizar todo
                  </Button>
                </div>
                {test && <TestSummary test={test} />}
              </div>
            )}

            {editing && (
              <div className="p-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className={labelClass}>URL del servidor</Label>
                    <Input
                      className={inputClass}
                      placeholder="https://empresa.odoo.com"
                      value={form.baseUrl}
                      onChange={(e) => set("baseUrl", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>Base de datos</Label>
                    <Input
                      className={inputClass}
                      value={form.database}
                      onChange={(e) => set("database", e.target.value)}
                    />
                    <div className="text-[11px] text-ent-fg-3">
                      ¿No la sabes? Déjala vacía y pulsa "Probar conexión": Odoo dice cuáles tiene.
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>Usuario (login)</Label>
                    <Input
                      className={inputClass}
                      value={form.login}
                      onChange={(e) => set("login", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>
                      API key {conn?.hasApiKey ? "(vacío = mantener la actual)" : ""}
                    </Label>
                    <Input
                      className={inputClass}
                      type="password"
                      autoComplete="off"
                      value={form.apiKey}
                      onChange={(e) => set("apiKey", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>Traer ventas desde</Label>
                    <Input
                      className={inputClass}
                      type="date"
                      value={form.startDate}
                      onChange={(e) => set("startDate", e.target.value)}
                    />
                    {state.suggestedStartDate && (
                      <div className="text-[11px] text-ent-fg-3">
                        Los archivos cargados llegan hasta el día anterior a{" "}
                        {state.suggestedStartDate}.
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className={labelClass}>Retención del corte (días)</Label>
                    <Input
                      className={inputClass}
                      type="number"
                      min={7}
                      max={365}
                      value={form.retentionDays}
                      onChange={(e) => set("retentionDays", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className={labelClass}>DNI excluidos del corte (personal)</Label>
                    <Input
                      className={inputClass}
                      placeholder="12345678, 87654321"
                      value={form.excludedDnis}
                      onChange={(e) => set("excludedDnis", e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-[12.5px] text-ent-fg">
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(v) => set("enabled", v)}
                    aria-label="Conector activado"
                  />
                  {form.enabled ? "Activado" : "Desactivado"}
                </div>
                <div className="text-[11.5px] text-ent-fg-3">
                  Desde la fecha de inicio el conector es el dueño de las ventas: la primera corrida
                  reemplaza las que vinieron por archivo en ese periodo y el archivo solo acepta
                  fechas anteriores. Cambiar la fecha reinicia la carga.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 text-[12px] gap-1.5"
                    onClick={() => void save()}
                    disabled={busy !== null || !form.baseUrl || !form.database || !form.login}
                  >
                    {busy === "save" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[12px] gap-1.5"
                    onClick={() => void runTest()}
                    disabled={busy !== null || !canTest}
                  >
                    {busy === "test" ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plug className="w-3.5 h-3.5" />
                    )}
                    Probar conexión
                  </Button>
                  {conn && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[12px]"
                      onClick={() => {
                        setEditing(false)
                        setTest(null)
                        setForm(formFrom(conn))
                      }}
                      disabled={busy !== null}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
                {test && <TestSummary test={test} />}
              </div>
            )}
          </>
        )}
      </div>

      <ProductMasterBlock tenantId={tenantId} />
    </div>
  )
}

function TestSummary({ test }: { test: TestResult }) {
  if (test.kind === "databases") {
    return (
      <Notice tone={test.databases.length ? "info" : "warn"}>
        Odoo {test.version} ·{" "}
        {test.databases.length
          ? `bases de datos en el servidor: ${test.databases.join(", ")}`
          : "el servidor no muestra sus bases de datos (pídele el nombre al administrador de Odoo)"}
      </Notice>
    )
  }
  return (
    <Notice tone="ok">
      Odoo {test.version} · {test.ordersSinceStart.toLocaleString("es-PE")} órdenes desde la fecha
      de inicio · {test.ordersLast30Days.toLocaleString("es-PE")} en los últimos 30 días
      {test.hasEmployee ? " · cajero por empleado" : " · cajero por usuario"}
      {test.hasIdType ? " · tipo de documento disponible" : ""}
    </Notice>
  )
}

/* ── Product master ─────────────────────────────────────────────────── */

function ProductMasterBlock({ tenantId }: { tenantId: string }) {
  const [summary, setSummary] = useState<MasterSummary | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/products`)
      const json = await res.json()
      if (json.success) setSummary(json.data)
    } catch {}
  }, [tenantId])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="rounded-[4px] border border-ent-line">
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-ent-fg">Maestra de producto</div>
          <div className="text-[11.5px] text-ent-fg-3 leading-snug mt-0.5">
            SKU → categoría, clase y subclase del comercio. Clasifica cada línea vendida; lo que no
            está en la maestra queda con la categoría del POS.
          </div>
          {summary && (
            <div className="text-[12px] text-ent-fg-2 mt-1.5">
              {summary.classified.toLocaleString("es-PE")} SKU clasificados
              {summary.unclassified > 0 && (
                <>
                  {" · "}
                  <span className="text-ent-warn">
                    {summary.unclassified.toLocaleString("es-PE")} vendidos sin clasificar
                  </span>
                </>
              )}
              {summary.updatedAt && ` · actualizada ${fmtWhen(summary.updatedAt)}`}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[12px] gap-1.5"
          onClick={() => setOpen(true)}
        >
          <Upload className="w-3.5 h-3.5" /> Cargar maestra
        </Button>
      </div>
      {summary && summary.missing.length > 0 && (
        <details className="border-t border-ent-line">
          <summary className="px-3 py-2 text-[12px] text-ent-fg-3 cursor-pointer">
            SKU vendidos que la maestra no clasifica ({summary.missing.length}
            {summary.missing.length === 200 ? "+" : ""})
          </summary>
          <div className="px-3 pb-2 max-h-56 overflow-y-auto text-[12px]">
            {summary.missing.map((m) => (
              <div key={m.sku} className="flex gap-2 py-0.5 border-b border-ent-line last:border-0">
                <span className="font-mono text-ent-fg w-28 shrink-0 truncate">{m.sku}</span>
                <span className="text-ent-fg-2 truncate flex-1">{m.name ?? "—"}</span>
                <span className="text-ent-fg-3 truncate max-w-[180px]">{m.odooCategory ?? ""}</span>
                <span className="text-ent-fg-3 tabular-nums w-14 text-right">{m.lines} lín.</span>
              </div>
            ))}
          </div>
        </details>
      )}
      <MasterUploadDialog
        tenantId={tenantId}
        open={open}
        onOpenChange={setOpen}
        onDone={() => void load()}
      />
    </div>
  )
}

function MasterUploadDialog({
  tenantId,
  open,
  onOpenChange,
  onDone,
}: {
  tenantId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<MasterPreview | null>(null)
  const [mapping, setMapping] = useState<MasterMapping | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<MasterApplyResult | null>(null)

  function reset() {
    setFile(null)
    setPreview(null)
    setMapping(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  /** Every way out of the dialog leaves it clean for the next file. */
  function close() {
    onOpenChange(false)
    reset()
  }

  async function post(withMapping: boolean) {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (withMapping && mapping) fd.append("mapping", JSON.stringify(mapping))
      const res = await fetch(`/api/admin/tenants/${tenantId}/products`, {
        method: "POST",
        body: fd,
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? "No se pudo leer el archivo")
        return
      }
      if (withMapping) {
        setResult(json.data)
        onDone()
      } else {
        setPreview(json.data)
        setMapping(json.data.mapping)
      }
    } catch {
      toast.error("Error de conexión")
    } finally {
      setBusy(false)
    }
  }

  const canApply =
    mapping?.sku != null &&
    (mapping.category != null || mapping.class != null || mapping.subclass != null)

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Cargar maestra de producto</DialogTitle>
          <DialogDescription className="text-[12px]">
            Excel o CSV con una fila por SKU. Los SKU que ya estaban se actualizan; los que no
            vienen en el archivo se conservan.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <Notice tone="ok">
              {result.rows.toLocaleString("es-PE")} SKU cargados
              {result.rowsWithoutSku > 0 && ` · ${result.rowsWithoutSku} filas sin SKU omitidas`}
              {result.duplicates > 0 &&
                ` · ${result.duplicates} SKU repetidos (vale la última fila)`}
              {result.keptFromBefore > 0 &&
                ` · ${result.keptFromBefore.toLocaleString("es-PE")} SKU de cargas anteriores conservados`}
            </Notice>
            <div className="flex justify-end">
              <Button size="sm" className="h-7 text-[12px]" onClick={close}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="block w-full text-[12.5px] text-ent-fg-2 file:mr-3 file:h-7 file:rounded-[4px] file:border file:border-ent-line-strong file:bg-ent-panel file:px-2.5 file:text-[12px]"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setPreview(null)
                setMapping(null)
              }}
            />
            {!preview && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="h-7 text-[12px] gap-1.5"
                  disabled={!file || busy}
                  onClick={() => void post(false)}
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Leer columnas
                </Button>
              </div>
            )}
            {preview && mapping && (
              <>
                <div className="text-[12px] text-ent-fg-3">
                  {preview.rowsTotal.toLocaleString("es-PE")} filas. Indica qué columna es cada
                  campo:
                </div>
                <div className="space-y-1.5">
                  {MASTER_FIELDS.map((f) => (
                    <MappingRow
                      key={f}
                      field={f}
                      headers={preview.headers}
                      sample={preview.sample}
                      value={mapping[f]}
                      onChange={(v) => setMapping((m) => (m ? { ...m, [f]: v } : m))}
                    />
                  ))}
                </div>
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[12px]"
                    onClick={reset}
                    disabled={busy}
                  >
                    Otro archivo
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-[12px] gap-1.5"
                    disabled={!canApply || busy}
                    onClick={() => void post(true)}
                  >
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Cargar
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function MappingRow({
  field,
  headers,
  sample,
  value,
  onChange,
}: {
  field: MasterField
  headers: string[]
  sample: unknown[][]
  value: number | null
  onChange: (v: number | null) => void
}) {
  const example = value !== null ? sample.map((r) => r[value]).find((v) => v != null) : null
  // The column number is the option's identity (two columns may share a header).
  const options = headers.map((label, i) => ({ value: String(i), label }))
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <div>
        <div className="text-[12.5px] text-ent-fg">
          {MASTER_FIELD_LABELS[field]}
          {field === "sku" && <span className="text-ent-bad"> *</span>}
        </div>
        {example != null && (
          <div className="text-[11px] text-ent-fg-3 truncate">ej. {String(example)}</div>
        )}
      </div>
      <Select
        value={value === null ? "none" : String(value)}
        onValueChange={(v) => onChange(v === "none" ? null : Number(v))}
      >
        <SelectTrigger className="h-8 text-[12.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="none">— No está en el archivo —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
