"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useTransition } from "react"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
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

import { createCatalogItem, updateCatalogItem } from "./catalog-actions"

// ── Form schema ─────────────────────────────────────────────────────

const formSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100, "Maximo 100 caracteres"),
  description: z.string().trim().max(500, "Maximo 500 caracteres").nullable(),
  pointsCost: z
    .number({ invalid_type_error: "Ingresa un numero valido" })
    .int("Debe ser un numero entero")
    .positive("Debe ser mayor a 0"),
  category: z.string().trim().max(50, "Maximo 50 caracteres").nullable(),
  active: z.boolean(),
  sortOrder: z.number({ invalid_type_error: "Ingresa un numero valido" }).int().min(0, "Minimo 0"),
})

type FormValues = z.infer<typeof formSchema>

// ── Types ───────────────────────────────────────────────────────────

interface CatalogItemData {
  id: string
  name: string
  description: string | null
  pointsCost: number
  category: string | null
  active: boolean
  sortOrder: number
}

interface CatalogFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  item?: CatalogItemData | null
}

// ── Component ───────────────────────────────────────────────────────

export function CatalogFormDialog({ open, onOpenChange, tenantId, item }: CatalogFormDialogProps) {
  const [isPending, startTransition] = useTransition()
  const isEdit = !!item

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          name: item.name,
          description: item.description ?? "",
          pointsCost: item.pointsCost,
          category: item.category ?? "",
          active: item.active,
          sortOrder: item.sortOrder,
        }
      : {
          name: "",
          description: "",
          pointsCost: 100,
          category: "",
          active: true,
          sortOrder: 0,
        },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        name: values.name,
        description: values.description || null,
        imageUrl: null as string | null,
        pointsCost: values.pointsCost,
        category: values.category || null,
        active: values.active,
        sortOrder: values.sortOrder,
      }

      if (isEdit) {
        const result = await updateCatalogItem(item.id, payload)

        if (result.success) {
          toast.success("Recompensa actualizada")
          onOpenChange(false)
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createCatalogItem(tenantId, payload)

        if (result.success) {
          toast.success("Recompensa creada")
          reset()
          onOpenChange(false)
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar recompensa" : "Nueva recompensa"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos de la recompensa del catalogo."
              : "Agrega una nueva recompensa que los clientes puedan canjear con puntos."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" placeholder="Ej: Cafe americano gratis" {...register("name")} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>

          {/* Descripcion */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripcion (opcional)</Label>
            <Textarea
              id="description"
              placeholder="Descripcion breve de la recompensa"
              rows={2}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-red-600">{errors.description.message}</p>
            )}
          </div>

          {/* Costo en puntos */}
          <div className="space-y-2">
            <Label htmlFor="pointsCost">Costo en puntos</Label>
            <Input
              id="pointsCost"
              type="number"
              min={1}
              placeholder="100"
              {...register("pointsCost", { valueAsNumber: true })}
            />
            {errors.pointsCost && (
              <p className="text-sm text-red-600">{errors.pointsCost.message}</p>
            )}
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <Label htmlFor="category">Categoria (opcional)</Label>
            <Input
              id="category"
              placeholder="Ej: Bebidas, Postres, Descuentos"
              {...register("category")}
            />
            {errors.category && <p className="text-sm text-red-600">{errors.category.message}</p>}
          </div>

          {/* Orden */}
          <div className="space-y-2">
            <Label htmlFor="sortOrder">Orden de aparicion</Label>
            <Input
              id="sortOrder"
              type="number"
              min={0}
              placeholder="0"
              {...register("sortOrder", { valueAsNumber: true })}
            />
            <p className="text-xs text-slate-400">Menor numero aparece primero. Default: 0.</p>
            {errors.sortOrder && <p className="text-sm text-red-600">{errors.sortOrder.message}</p>}
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between">
            <Label htmlFor="catalogActive">Activo</Label>
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Switch id="catalogActive" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear recompensa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
