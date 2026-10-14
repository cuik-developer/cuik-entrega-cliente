"use client"

import { Loader2, Save } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Notice, Panel, PanelHeader } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useTenant } from "@/hooks/use-tenant"
import { renderCardCompleteMessage } from "@/lib/loyalty/card-complete"

import { VariableInsertButton } from "../../campanas/_components/variable-insert-button"

type Data = {
  config: { enabled: boolean; message: string }
  /** Active stamps promotion; null = points program (card hidden). */
  program: { maxVisits: number; reward: string | null } | null
}

const MAX = 150

/**
 * "Tarjeta completa" automation (stamps programs). The moment a visit fills
 * the last stamp, the pass shows this message: lock screen on iPhone, pass
 * notification on Android. Sent with the visit itself, no waiting.
 */
export function CardCompleteAutomationCard({ tenantSlug }: { tenantSlug: string }) {
  const { readOnly, tenantName } = useTenant()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`)
      const json = await res.json()
      if (!json.success) throw new Error()
      const d: Data | undefined = json.data.cardComplete
      if (!d) throw new Error()
      setData(d)
      setEnabled(d.config.enabled)
      setMessage(d.config.message)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  // Hidden while loading, on error, and for points programs.
  if (loading || !data || !data.program) return null

  const dirty = enabled !== data.config.enabled || message !== data.config.message
  const preview = renderCardCompleteMessage(message, {
    clientName: "Ana",
    tenantName: tenantName || "tu negocio",
    reward: data.program.reward,
  })

  async function save() {
    if (!message.trim()) {
      toast.error("Escribe el mensaje")
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/automations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardComplete: { enabled, message: message.trim() } }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(enabled ? "Aviso de tarjeta completa activado" : "Cambios guardados")
      await load()
    } catch {
      toast.error("No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Tarjeta completa"
        actions={
          <span className="flex items-center gap-2 text-[12px] text-ent-fg-2">
            {enabled ? "Activado" : "Desactivado"}
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={readOnly}
              aria-label="Activar aviso de tarjeta completa"
            />
          </span>
        }
      />
      <div className="p-3 space-y-3 text-[12.5px]">
        <p className="text-ent-fg-3 text-[12px]">
          Apenas un cliente llega a la visita {data.program.maxVisits}, su pase le muestra este
          mensaje: en iPhone aparece en la pantalla bloqueada; en Android como notificación del
          pase. Sale con la misma visita, sin esperar.
        </p>

        <Notice tone="info">
          <span className="font-medium">Tu programa:</span> {data.program.maxVisits} visitas, premio{" "}
          {data.program.reward ? `"${data.program.reward}"` : "sin texto definido"}. Para cambiarlo,
          escríbenos.
        </Notice>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">Mensaje</span>
            {!readOnly && <VariableInsertButton textareaRef={textareaRef} onInsert={setMessage} />}
          </div>
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
            rows={2}
            disabled={readOnly}
            className="text-[12.5px]"
          />
          <div className="flex items-center justify-between text-[11px] text-ent-fg-3">
            <span>
              Usa <code className="font-mono">{"{{premio}}"}</code> para el premio de tu programa.
            </span>
            <span
              className={
                message.length >= MAX ? "text-ent-bad" : message.length > 130 ? "text-ent-warn" : ""
              }
            >
              {message.length}/{MAX}
            </span>
          </div>
        </div>

        <div className="rounded-[4px] border border-ent-line bg-ent-panel-2 px-3 py-2">
          <div className="text-[10.5px] uppercase tracking-[0.05em] text-ent-fg-3 mb-0.5">
            Así lo verá Ana
          </div>
          <div className="text-[12.5px] text-ent-fg">{preview || "—"}</div>
        </div>

        <div className="flex items-center">
          <Button
            size="sm"
            className="ml-auto h-7 text-[12px] gap-1.5"
            onClick={save}
            disabled={saving || !dirty || readOnly}
            title={readOnly ? "Solo lectura" : undefined}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Guardar
          </Button>
        </div>
      </div>
    </Panel>
  )
}
