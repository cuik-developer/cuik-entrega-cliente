"use client"

import {
  DEFAULT_SOLICITUD_EMAIL_TEMPLATES,
  SOLICITUD_EMAIL_VARIABLES,
  type SolicitudEmailKind,
  type SolicitudEmailTemplates,
} from "@cuik/shared/validators"
import { Loader2, Mail, RotateCcw, Send } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

import { saveSolicitudEmailTemplates, sendSolicitudEmailTest } from "./actions"

const KIND_META: Record<SolicitudEmailKind, { title: string; hint: string }> = {
  approval: {
    title: "Aprobación",
    hint: "Se envía al aprobar una solicitud. Debajo de tu texto van siempre las credenciales y el botón para ingresar; no hace falta escribirlos.",
  },
  rejection: {
    title: "Rechazo",
    hint: "Se envía al rechazar una solicitud, solo si activás el interruptor. El motivo que escribas al rechazar entra en {{reason}}.",
  },
}

/** Subject + body editors for the Solicitudes emails, with variables and a test send. */
export function EmailTemplatesForm({ initialData }: { initialData: SolicitudEmailTemplates }) {
  const [data, setData] = useState<SolicitudEmailTemplates>(initialData)
  const [saving, startSave] = useTransition()
  const [testing, setTesting] = useState<SolicitudEmailKind | null>(null)
  const bodyRefs = useRef<Record<SolicitudEmailKind, HTMLTextAreaElement | null>>({
    approval: null,
    rejection: null,
  })

  function update(kind: SolicitudEmailKind, patch: Partial<SolicitudEmailTemplates[typeof kind]>) {
    setData((d) => ({ ...d, [kind]: { ...d[kind], ...patch } }))
  }

  function insertVar(kind: SolicitudEmailKind, variable: string) {
    const ta = bodyRefs.current[kind]
    const body = data[kind].body
    if (!ta) {
      update(kind, { body: `${body}${variable}` })
      return
    }
    const start = ta.selectionStart ?? body.length
    const end = ta.selectionEnd ?? body.length
    const next = body.slice(0, start) + variable + body.slice(end)
    update(kind, { body: next })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + variable.length, start + variable.length)
    })
  }

  function save() {
    startSave(async () => {
      const result = await saveSolicitudEmailTemplates(data)
      if (result.success) toast.success("Correos guardados")
      else toast.error(result.error)
    })
  }

  async function sendTest(kind: SolicitudEmailKind) {
    setTesting(kind)
    try {
      const result = await sendSolicitudEmailTest(kind, data[kind])
      if (result.success) toast.success(`Prueba enviada a ${result.data.to}`)
      else toast.error(result.error)
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-slate-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900">Correos de solicitudes</h2>
          <p className="text-sm text-slate-500">
            El texto de los correos que reciben los comercios al aprobar o rechazar su solicitud. El
            diseño (logo, colores, pie) no cambia.
          </p>
        </div>
      </div>

      <Tabs defaultValue="approval">
        <TabsList>
          <TabsTrigger value="approval">Aprobación</TabsTrigger>
          <TabsTrigger value="rejection">
            Rechazo{data.rejection.enabled ? "" : " (apagado)"}
          </TabsTrigger>
        </TabsList>

        {(["approval", "rejection"] as SolicitudEmailKind[]).map((kind) => (
          <TabsContent key={kind} value={kind} className="mt-4 space-y-4">
            <p className="text-xs text-slate-500">{KIND_META[kind].hint}</p>

            {kind === "rejection" && (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <Label htmlFor="rej-enabled" className="text-sm">
                  Enviar correo al rechazar
                </Label>
                <Switch
                  id="rej-enabled"
                  checked={data.rejection.enabled}
                  onCheckedChange={(v) => update("rejection", { enabled: v })}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${kind}-subject`}>Asunto</Label>
              <Input
                id={`${kind}-subject`}
                value={data[kind].subject}
                maxLength={150}
                onChange={(e) => update(kind, { subject: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${kind}-body`}>Mensaje</Label>
                <span className="text-xs text-slate-400">
                  {data[kind].body.length}/5000 · una línea en blanco separa párrafos
                </span>
              </div>
              <Textarea
                id={`${kind}-body`}
                ref={(el) => {
                  bodyRefs.current[kind] = el
                }}
                value={data[kind].body}
                rows={8}
                maxLength={5000}
                onChange={(e) => update(kind, { body: e.target.value })}
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SOLICITUD_EMAIL_VARIABLES.filter((v) => v.kinds.includes(kind)).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(kind, v.key)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                    title={v.label}
                  >
                    <span className="font-mono text-blue-600">{v.key}</span>{" "}
                    <span className="text-slate-400">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => sendTest(kind)}
                disabled={testing !== null}
              >
                {testing === kind ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Enviarme una prueba
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-slate-500"
                onClick={() =>
                  setData((d) => ({ ...d, [kind]: { ...DEFAULT_SOLICITUD_EMAIL_TEMPLATES[kind] } }))
                }
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Volver al texto por defecto
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex justify-end border-t pt-4">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {saving ? "Guardando…" : "Guardar correos"}
        </Button>
      </div>
    </div>
  )
}
