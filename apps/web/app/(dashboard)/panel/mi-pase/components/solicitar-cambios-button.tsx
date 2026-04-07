"use client"

import { Loader2, Mail } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type ChangeType = "color" | "texto" | "imagen" | "reglas" | "otro"

const TYPE_OPTIONS: Array<{ value: ChangeType; label: string }> = [
  { value: "color", label: "Colores" },
  { value: "texto", label: "Textos" },
  { value: "imagen", label: "Imágenes / logo" },
  { value: "reglas", label: "Reglas de la promoción" },
  { value: "otro", label: "Otro" },
]

interface SolicitarCambiosButtonProps {
  tenantSlug: string
}

export function SolicitarCambiosButton({ tenantSlug }: SolicitarCambiosButtonProps) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ChangeType>("otro")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setType("otro")
    setMessage("")
    setSubmitting(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (message.trim().length < 10) {
      toast.error("Cuéntanos en al menos 10 caracteres qué cambio necesitas")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/${tenantSlug}/design-change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim() }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(json?.error ?? "No pudimos enviar tu solicitud")
        setSubmitting(false)
        return
      }

      toast.success("Tu solicitud fue enviada al equipo de Cuik")
      reset()
      setOpen(false)
    } catch (err) {
      console.error("[SolicitarCambios] submit failed:", err)
      toast.error("No pudimos enviar tu solicitud")
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
        >
          <Mail className="h-4 w-4" />
          Solicitar cambios
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Solicitar cambios al pase</DialogTitle>
          <DialogDescription>
            Cuéntanos qué te gustaría modificar. El equipo de Cuik recibirá tu solicitud y te
            contactará para coordinar los cambios.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="change-type">Tipo de cambio</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as ChangeType)}
              disabled={submitting}
            >
              <SelectTrigger id="change-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="change-message">¿Qué necesitas cambiar?</Label>
            <Textarea
              id="change-message"
              placeholder="Por ejemplo: cambiar el color principal a azul oscuro, actualizar el logo, modificar la cantidad de sellos para el premio…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={submitting}
              rows={5}
              maxLength={2000}
            />
            <p className="text-xs text-slate-400">
              {message.length}/2000 — describe los cambios con el mayor detalle posible
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || message.trim().length < 10}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando…
                </>
              ) : (
                "Enviar solicitud"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
