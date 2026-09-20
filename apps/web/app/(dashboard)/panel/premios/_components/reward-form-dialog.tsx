"use client"

import { ImagePlus, Trash2 } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

import { PhotoAdjuster, type PhotoAdjusterHandle } from "./photo-adjuster"

export type CatalogItem = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  pointsCost: number
  category: string | null
  active: boolean
  sortOrder: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantSlug: string
  item: CatalogItem | null
  onSaved: () => void | Promise<void>
}

const MAX_MB = 5

/**
 * Create / edit a reward. The photo is always draggable in its 16:9 frame
 * (drag + zoom, no edit mode); the crop is rendered and uploaded when the
 * reward is saved, and only if the photo is new or was re-framed. Removing
 * it only clears the reference.
 */
export function RewardFormDialog({ open, onOpenChange, tenantSlug, item, onSaved }: Props) {
  const isEdit = Boolean(item)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [pointsCost, setPointsCost] = useState("100")
  const [category, setCategory] = useState("")
  const [sortOrder, setSortOrder] = useState("0")
  const [active, setActive] = useState(true)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Object URL of the photo shown in the frame; photoDirty = needs crop + upload on save.
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [photoDirty, setPhotoDirty] = useState(false)
  const adjusterRef = useRef<PhotoAdjusterHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (photoSrc?.startsWith("blob:")) URL.revokeObjectURL(photoSrc)
    }
  }, [photoSrc])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the form every time the dialog opens for a (different) item
  useEffect(() => {
    if (!open) return
    setName(item?.name ?? "")
    setDescription(item?.description ?? "")
    setPointsCost(String(item?.pointsCost ?? 100))
    setCategory(item?.category ?? "")
    setSortOrder(String(item?.sortOrder ?? 0))
    setActive(item?.active ?? true)
    setImageUrl(item?.imageUrl ?? null)
    setPhotoSrc(null)
    setPhotoDirty(false)
    // Load the saved photo into the frame so it can be re-framed right away.
    if (item?.imageUrl) {
      let cancelled = false
      fetch(item.imageUrl)
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("fetch"))))
        .then((blob) => {
          if (!cancelled) setPhotoSrc(URL.createObjectURL(blob))
        })
        .catch(() => {
          /* keep the static preview */
        })
      return () => {
        cancelled = true
      }
    }
  }, [open, item?.id])

  function pickPhoto(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Usá una imagen PNG o JPG")
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`La imagen supera ${MAX_MB} MB`)
      return
    }
    setPhotoSrc(URL.createObjectURL(file))
    setPhotoDirty(true)
    if (fileRef.current) fileRef.current.value = ""
  }

  function removePhoto() {
    setPhotoSrc(null)
    setPhotoDirty(false)
    setImageUrl(null)
  }

  /** Crops the current framing and uploads it. Returns the asset URL. */
  async function uploadFramedPhoto(): Promise<string> {
    const blob = await adjusterRef.current?.getBlob()
    if (!blob) throw new Error("La foto todavía no terminó de cargar")
    const file = new File([blob], "premio.png", { type: "image/png" })
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(`La imagen supera ${MAX_MB} MB`)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`/api/${tenantSlug}/assets/upload`, { method: "POST", body: fd })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "No se pudo subir la foto")
      return json.data.url as string
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    const cost = Number(pointsCost)
    if (!name.trim()) {
      toast.error("Escribí el nombre del premio")
      return
    }
    if (!Number.isInteger(cost) || cost <= 0) {
      toast.error("El costo en puntos debe ser un entero mayor a 0")
      return
    }
    const order = Number(sortOrder)
    setSaving(true)
    let finalImageUrl = imageUrl
    if (photoSrc && photoDirty) {
      try {
        finalImageUrl = await uploadFramedPhoto()
        setImageUrl(finalImageUrl)
        setPhotoDirty(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo subir la foto")
        setSaving(false)
        return
      }
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      imageUrl: finalImageUrl,
      pointsCost: cost,
      category: category.trim() || null,
      active,
      sortOrder: Number.isInteger(order) && order >= 0 ? order : 0,
    }
    try {
      const res = await fetch(
        isEdit && item ? `/api/${tenantSlug}/catalog/${item.id}` : `/api/${tenantSlug}/catalog`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success(isEdit ? "Premio actualizado" : "Premio creado")
      onOpenChange(false)
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar premio" : "Nuevo premio"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cambiá la foto, el costo o el texto. Los clientes lo ven al instante."
              : "Un premio que tus clientes canjean con puntos. La foto ayuda a que lo elijan."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo */}
          <div className="space-y-2">
            <Label>Foto (opcional)</Label>
            {photoSrc ? (
              <PhotoAdjuster
                ref={adjusterRef}
                src={photoSrc}
                disabled={saving}
                onDirty={() => setPhotoDirty(true)}
              />
            ) : (
              <div className="relative aspect-[16/9] rounded-xl border border-dashed bg-muted/40 overflow-hidden">
                {imageUrl ? (
                  <Image src={imageUrl} alt="" fill className="object-cover" unoptimized />
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
                    disabled={saving}
                  >
                    <ImagePlus className="w-5 h-5" />
                    <span className="text-xs">
                      PNG o JPG · hasta {MAX_MB} MB · después la encuadrás
                    </span>
                  </button>
                )}
              </div>
            )}
            {(photoSrc || imageUrl) && (
              <div className="flex justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={saving}
                >
                  Cambiar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={removePhoto}
                  disabled={saving}
                  aria-label="Quitar foto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) pickPhoto(f)
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rw-name">Nombre</Label>
            <Input
              id="rw-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Café americano gratis"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rw-desc">Descripción (opcional)</Label>
            <Textarea
              id="rw-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Qué incluye, condiciones, horarios…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="rw-cost">Costo en puntos</Label>
              <Input
                id="rw-cost"
                type="number"
                min={1}
                value={pointsCost}
                onChange={(e) => setPointsCost(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-cat">Categoría (opcional)</Label>
              <Input
                id="rw-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Bebidas, Postres…"
                maxLength={50}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="rw-order">Orden</Label>
              <Input
                id="rw-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Menor número aparece primero.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="rw-active" className="text-sm">
                Visible para clientes
              </Label>
              <Switch id="rw-active" checked={active} onCheckedChange={setActive} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {uploading
              ? "Subiendo foto…"
              : saving
                ? "Guardando…"
                : isEdit
                  ? "Guardar cambios"
                  : "Crear premio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
