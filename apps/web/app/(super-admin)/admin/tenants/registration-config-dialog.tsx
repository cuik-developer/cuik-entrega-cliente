"use client"

import type { RegistrationConfig, StrategicField } from "@cuik/shared/validators"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

import { updateRegistrationConfig } from "./registration-config-actions"

// ── Types ───────────────────────────────────────────────────────────

interface RegistrationConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  config: RegistrationConfig | null
}

type FieldDraft = {
  key: string
  label: string
  type: "text" | "select" | "date" | "location_select"
  required: boolean
  optionsText: string
  placeholder: string
}

// ── Helpers ─────────────────────────────────────────────────────────

function toKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((word, i) =>
      i === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("")
}

function fieldToDraft(field: StrategicField): FieldDraft {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    optionsText: field.options?.join("\n") ?? "",
    placeholder: field.placeholder ?? "",
  }
}

function emptyFieldDraft(): FieldDraft {
  return {
    key: "",
    label: "",
    type: "text",
    required: false,
    optionsText: "",
    placeholder: "",
  }
}

const MAX_FIELDS = 10

const FIELD_TYPES: { value: FieldDraft["type"]; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "select", label: "Selector" },
  { value: "date", label: "Fecha" },
  { value: "location_select", label: "Ubicacion" },
]

// ── Component ───────────────────────────────────────────────────────

export function RegistrationConfigDialog({
  open,
  onOpenChange,
  tenantId,
  config,
}: RegistrationConfigDialogProps) {
  const [isPending, startTransition] = useTransition()

  // -- Field drafts --
  const [fields, setFields] = useState<FieldDraft[]>([])

  // -- Marketing bonus --
  const [bonusEnabled, setBonusEnabled] = useState(false)
  const [stampsBonus, setStampsBonus] = useState(0)
  const [pointsBonus, setPointsBonus] = useState(0)

  // -- Validation errors --
  const [fieldErrors, setFieldErrors] = useState<Record<number, string>>({})

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (config) {
        setFields(config.strategicFields.map(fieldToDraft))
        setBonusEnabled(config.marketingBonus.enabled)
        setStampsBonus(config.marketingBonus.stampsBonus)
        setPointsBonus(config.marketingBonus.pointsBonus)
      } else {
        setFields([])
        setBonusEnabled(false)
        setStampsBonus(0)
        setPointsBonus(0)
      }
      setFieldErrors({})
    }
  }, [open, config])

  // -- Field operations --

  const addField = () => {
    if (fields.length >= MAX_FIELDS) {
      toast.error(`Maximo ${MAX_FIELDS} campos estrategicos`)
      return
    }
    setFields((prev) => [...prev, emptyFieldDraft()])
  }

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
    setFieldErrors((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const updateField = (index: number, updates: Partial<FieldDraft>) => {
    setFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f
        const updated = { ...f, ...updates }
        // Auto-generate key from label if label changed and key was auto-generated
        if (updates.label !== undefined) {
          const autoKey = toKey(updates.label)
          if (autoKey && (f.key === "" || f.key === toKey(f.label))) {
            updated.key = autoKey
          }
        }
        return updated
      }),
    )
    // Clear error on edit
    if (fieldErrors[index]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[index]
        return next
      })
    }
  }

  // -- Validation --

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation logic with multiple field type checks, duplicate key detection, and error aggregation
  const validate = (): boolean => {
    const errors: Record<number, string> = {}

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i]
      if (!f.label.trim()) {
        errors[i] = "El label es obligatorio"
        continue
      }
      if (!f.key.trim()) {
        errors[i] = "El key es obligatorio"
        continue
      }
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(f.key)) {
        errors[i] = "El key debe empezar con letra y ser alfanumerico"
        continue
      }
      if (f.type === "select") {
        const options = f.optionsText
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean)
        if (options.length === 0) {
          errors[i] = "Las opciones son obligatorias para tipo selector"
        }
      }
    }

    // Check duplicate keys
    const _keys = fields.map((f) => f.key).filter(Boolean)
    const seen = new Set<string>()
    for (let i = 0; i < fields.length; i++) {
      const k = fields[i].key
      if (k && seen.has(k)) {
        errors[i] = `Key duplicado: "${k}"`
      }
      if (k) seen.add(k)
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  // -- Submit --

  const handleSubmit = () => {
    if (!validate()) return

    startTransition(async () => {
      const strategicFields = fields.map((f) => ({
        key: f.key,
        label: f.label.trim(),
        type: f.type,
        required: f.required,
        ...(f.type === "select"
          ? {
              options: f.optionsText
                .split("\n")
                .map((o) => o.trim())
                .filter(Boolean),
            }
          : {}),
        ...(f.placeholder.trim() ? { placeholder: f.placeholder.trim() } : {}),
      }))

      const newConfig: RegistrationConfig = {
        strategicFields: strategicFields as RegistrationConfig["strategicFields"],
        marketingBonus: {
          enabled: bonusEnabled,
          stampsBonus: bonusEnabled ? stampsBonus : 0,
          pointsBonus: bonusEnabled ? pointsBonus : 0,
        },
      }

      const result = await updateRegistrationConfig(tenantId, newConfig)

      if (result.success) {
        toast.success("Configuracion de registro actualizada")
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuracion de registro</DialogTitle>
          <DialogDescription>
            Configura los campos estrategicos y bonos de marketing para el formulario de registro de
            clientes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Strategic Fields ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Campos estrategicos</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs gap-1"
                onClick={addField}
                disabled={fields.length >= MAX_FIELDS}
              >
                <Plus className="w-3 h-3" /> Agregar campo
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-xs text-slate-400 py-2">
                Sin campos estrategicos. Agrega campos personalizados para recolectar informacion
                adicional durante el registro.
              </p>
            )}

            {fields.map((field, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: field.key changes on keystroke causing React remount
              <div key={index} className="bg-slate-50 rounded-xl p-3 space-y-3 relative">
                {/* Remove button */}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 h-6 w-6 p-0 text-slate-400 hover:text-red-600"
                  onClick={() => removeField(index)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>

                {/* Label */}
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    placeholder="Ej: Sucursal preferida"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Key (auto-generated, editable) */}
                <div className="space-y-1">
                  <Label className="text-xs">
                    Key <span className="text-slate-400 font-normal">(auto-generado)</span>
                  </Label>
                  <Input
                    value={field.key}
                    onChange={(e) => updateField(index, { key: e.target.value })}
                    placeholder="sucursalPreferida"
                    className="h-8 text-sm font-mono"
                  />
                </div>

                <div className="flex gap-3">
                  {/* Type */}
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={field.type}
                      onValueChange={(val) =>
                        updateField(index, {
                          type: val as FieldDraft["type"],
                        })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELD_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Required */}
                  <div className="space-y-1 flex flex-col items-center pt-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Obligatorio</Label>
                      <Switch
                        checked={field.required}
                        onCheckedChange={(checked) => updateField(index, { required: checked })}
                      />
                    </div>
                  </div>
                </div>

                {/* Options (for select type) */}
                {field.type === "select" && (
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Opciones <span className="text-slate-400 font-normal">(una por linea)</span>
                    </Label>
                    <textarea
                      value={field.optionsText}
                      onChange={(e) =>
                        updateField(index, {
                          optionsText: e.target.value,
                        })
                      }
                      placeholder={"Opcion 1\nOpcion 2\nOpcion 3"}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  </div>
                )}

                {/* Placeholder (optional) */}
                <div className="space-y-1">
                  <Label className="text-xs">
                    Placeholder <span className="text-slate-400 font-normal">(opcional)</span>
                  </Label>
                  <Input
                    value={field.placeholder}
                    onChange={(e) => updateField(index, { placeholder: e.target.value })}
                    placeholder="Texto de ayuda..."
                    className="h-8 text-sm"
                  />
                </div>

                {/* Error */}
                {fieldErrors[index] && <p className="text-xs text-red-600">{fieldErrors[index]}</p>}
              </div>
            ))}

            {fields.length > 0 && (
              <p className="text-[10px] text-slate-400">
                {fields.length}/{MAX_FIELDS} campos configurados
              </p>
            )}
          </div>

          {/* ── Marketing Bonus ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Bono de marketing</Label>
              <Switch checked={bonusEnabled} onCheckedChange={setBonusEnabled} />
            </div>

            <p className="text-xs text-slate-400">
              Otorga sellos o puntos extra cuando el cliente acepta recibir marketing durante el
              registro.
            </p>

            {bonusEnabled && (
              <div className="bg-slate-50 rounded-xl p-3 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Sellos bonus</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={stampsBonus}
                    onChange={(e) =>
                      setStampsBonus(Math.max(0, Math.min(10, Number(e.target.value) || 0)))
                    }
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-slate-400">Sellos extra al registrarse (0-10)</p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Puntos bonus</Label>
                  <Input
                    type="number"
                    min={0}
                    max={1000}
                    value={pointsBonus}
                    onChange={(e) =>
                      setPointsBonus(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))
                    }
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-slate-400">Puntos extra al registrarse (0-1000)</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Guardando...
              </>
            ) : (
              "Guardar configuracion"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
