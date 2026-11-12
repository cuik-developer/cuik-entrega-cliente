"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Notice, StatusChip } from "@/components/admin/enterprise"
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
import { Textarea } from "@/components/ui/textarea"
import { useTenant } from "@/hooks/use-tenant"
import { AUDIENCE_BY_SLUG, type AudienceSlug } from "@/lib/growth/audiences"
import type { CreateSendResult, SendChannel } from "@/lib/growth/sends"
import {
  petWord,
  renderTemplate,
  TEMPLATE_BY_KEY,
  TEMPLATE_VARIABLES,
  TEMPLATES,
  type TemplateKey,
} from "@/lib/growth/templates"
import { fetchJson } from "./growth-gate"

type Preview = {
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
}

/**
 * "Crear envío": what the snapshot would hold today (ready, excluded,
 * control), the channel, the template (editable, with variables) and who
 * writes. On confirm the send is created and the guided flow opens.
 */
export function CreateSendDialog({
  open,
  onOpenChange,
  audience,
  sampleName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  audience: AudienceSlug
  /** A client of the audience, to show "Así le llega a …". */
  sampleName?: string | null
}) {
  const router = useRouter()
  const { tenantSlug, tenantName } = useTenant()
  const def = AUDIENCE_BY_SLUG.get(audience)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [store, setStore] = useState<string>("")
  const [channel, setChannel] = useState<SendChannel>("whatsapp")
  const [templateKey, setTemplateKey] = useState<TemplateKey>(def?.templateKey as TemplateKey)
  const [text, setText] = useState(TEMPLATE_BY_KEY.get(def?.templateKey as TemplateKey)?.text ?? "")
  const [senderName, setSenderName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !tenantSlug) return
    setPreview(null)
    const q = store ? `&store=${encodeURIComponent(store)}` : ""
    fetchJson<Preview>(`/api/${tenantSlug}/growth/audiences/${audience}?preview=1${q}`)
      .then(setPreview)
      .catch((e: Error) => setError(e.message))
  }, [open, tenantSlug, audience, store])

  function pickTemplate(key: TemplateKey) {
    setTemplateKey(key)
    setText(TEMPLATE_BY_KEY.get(key)?.text ?? "")
  }

  async function create() {
    if (!tenantSlug) return
    setSaving(true)
    setError(null)
    try {
      const r = await fetchJson<CreateSendResult & { ok: true }>(
        `/api/${tenantSlug}/growth/sends`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audience,
            templateKey,
            templateText: text,
            channel,
            senderName: senderName.trim() || null,
            store: store || null,
          }),
        },
      )
      toast.success(`Envío creado: ${r.toContact} por contactar, ${r.control} en control`)
      onOpenChange(false)
      router.push(`/panel/growth/envios/${r.sendId}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const sample = renderTemplate(text, {
    nombre: sampleName?.split(" ")[0] ?? "Natalia",
    cajero: senderName.trim() || null,
    comercio: tenantName,
    tienda: store || null,
    mascota: petWord(null, "gato"),
    producto: "su alimento habitual",
    marca: "su marca",
    dias: "30",
    dia_habitual: "sábado",
    producto_sugerido: "arena para gatos",
    sellos_faltan: "2",
    premio: "tu premio",
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear envío · {def?.name}</DialogTitle>
          <DialogDescription>
            Se congela la foto de hoy. Solo los que marques “Enviado” cuentan para la medición; los
            pendientes quedan libres para cualquier otra lista.
          </DialogDescription>
        </DialogHeader>

        {error && <Notice tone="bad">{error}</Notice>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12.5px]">
          {preview ? (
            <>
              <Figure label="En la audiencia" value={preview.inAudience} />
              <Figure
                label="Fuera hoy"
                value={
                  preview.excluded.cooldown +
                  preview.excluded.openSend +
                  preview.excluded.noContact +
                  preview.excluded.control +
                  preview.excluded.notYet
                }
                hint={`${preview.excluded.cooldown} contactados hace poco · ${preview.excluded.openSend} en otro envío · ${preview.excluded.noContact} no contactar · ${preview.excluded.control} en control de otro envío · ${preview.excluded.notYet} aún no les toca`}
              />
              <Figure
                label="Entran al envío"
                value={preview.ready}
                hint={`${preview.control} al control`}
              />
              <Figure label="Por contactar" value={preview.toContact} strong />
            </>
          ) : (
            <div className="col-span-4 flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-ent-fg-3" />
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {preview && preview.stores.length > 1 && (
            <div className="space-y-1">
              <Label className="text-[12px]">Tienda</Label>
              <Select
                value={store || "__all"}
                onValueChange={(v) => setStore(v === "__all" ? "" : v)}
              >
                <SelectTrigger className="h-8 text-[12.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Clientes de todas las tiendas</SelectItem>
                  {preview.stores.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-[12px]">Canal</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as SendChannel)}>
              <SelectTrigger className="h-8 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp 1 a 1 desde Cuik</SelectItem>
                <SelectItem value="export">Exportar lista (herramienta masiva)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Plantilla</Label>
            <Select value={templateKey} onValueChange={(v) => pickTemplate(v as TemplateKey)}>
              <SelectTrigger className="h-8 text-[12.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[12px]">Quién escribe ({"{cajero}"})</Label>
            <Input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Rosa"
              className="h-8 text-[12.5px]"
              maxLength={80}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[12px]">Mensaje con variables</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="text-[12.5px]"
            maxLength={2000}
          />
          <div className="text-[11px] text-ent-fg-3">
            Variables: {TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(" ")}. Una frase cuyo dato
            falte para un cliente se omite entera.
          </div>
        </div>

        <div className="rounded-[4px] border border-ent-line bg-ent-panel-2 px-3 py-2 text-[12.5px]">
          <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3 mb-1">
            Así le llega a {sampleName?.split(" ")[0] ?? "un cliente"} (ejemplo)
          </div>
          {sample || <span className="text-ent-fg-3">—</span>}
        </div>

        <div className="flex items-center justify-between gap-2">
          <StatusChip tone="info">
            {preview
              ? `${preview.control} sorteados al control (${Math.round((preview.control / Math.max(1, preview.ready)) * 100)} %)`
              : "…"}
          </StatusChip>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={() => void create()}
              disabled={saving || !preview || preview.ready === 0 || !text.trim()}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Crear envío · {preview?.toContact ?? 0} por contactar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Figure({
  label,
  value,
  hint,
  strong,
}: {
  label: string
  value: number
  hint?: string
  strong?: boolean
}) {
  return (
    <div className="rounded-[4px] border border-ent-line px-2.5 py-2" title={hint}>
      <div className="text-[11px] uppercase tracking-[0.05em] text-ent-fg-3">{label}</div>
      <div
        className={`text-[17px] tabular-nums ${strong ? "font-semibold text-ent-fg" : "text-ent-fg-2"}`}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-ent-fg-3 leading-snug mt-0.5 line-clamp-2">{hint}</div>
      )}
    </div>
  )
}
