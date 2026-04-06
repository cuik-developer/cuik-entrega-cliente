"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
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

import { createPlan, updatePlan } from "./actions"
import type { PlanWithTenantCount } from "./queries"

// Form schema: price in soles (number), converted to cents on submit
const formSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  priceSoles: z
    .number({ invalid_type_error: "Ingresa un número válido" })
    .min(0, "El precio no puede ser negativo"),
  maxLocations: z
    .number({ invalid_type_error: "Ingresa un número válido" })
    .int()
    .positive("Debe ser al menos 1"),
  maxPromos: z
    .number({ invalid_type_error: "Ingresa un número válido" })
    .int()
    .positive("Debe ser al menos 1"),
  maxClients: z
    .number({ invalid_type_error: "Ingresa un número válido" })
    .int()
    .positive("Debe ser al menos 1"),
})

type FormValues = z.infer<typeof formSchema>

type PlanFormDialogProps = {
  plan?: PlanWithTenantCount | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlanFormDialog({ plan, open, onOpenChange }: PlanFormDialogProps) {
  const [isPending, startTransition] = useTransition()
  const isEdit = !!plan

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: plan
      ? {
          name: plan.name,
          priceSoles: plan.price / 100,
          maxLocations: plan.maxLocations,
          maxPromos: plan.maxPromos,
          maxClients: plan.maxClients,
        }
      : {
          name: "",
          priceSoles: 0,
          maxLocations: 1,
          maxPromos: 1,
          maxClients: 100,
        },
  })

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      const payload = {
        name: values.name,
        price: Math.round(values.priceSoles * 100),
        maxLocations: values.maxLocations,
        maxPromos: values.maxPromos,
        maxClients: values.maxClients,
      }

      const result = isEdit ? await updatePlan(plan.id, payload) : await createPlan(payload)

      if (result.success) {
        toast.success(isEdit ? "Plan actualizado" : "Plan creado")
        reset()
        onOpenChange(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar plan" : "Nuevo plan"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifica los datos del plan. Los comercios asignados no se ven afectados."
              : "Crea un nuevo plan para asignar a comercios."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" placeholder="Ej: Básico" {...register("name")} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="priceSoles">Precio mensual (S/)</Label>
            <Input
              id="priceSoles"
              type="number"
              step="0.01"
              min="0"
              placeholder="69"
              {...register("priceSoles", { valueAsNumber: true })}
            />
            {errors.priceSoles && (
              <p className="text-sm text-red-600">{errors.priceSoles.message}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="maxLocations">Sucursales</Label>
              <Input
                id="maxLocations"
                type="number"
                min="1"
                {...register("maxLocations", { valueAsNumber: true })}
              />
              {errors.maxLocations && (
                <p className="text-sm text-red-600">{errors.maxLocations.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPromos">Promos</Label>
              <Input
                id="maxPromos"
                type="number"
                min="1"
                {...register("maxPromos", { valueAsNumber: true })}
              />
              {errors.maxPromos && (
                <p className="text-sm text-red-600">{errors.maxPromos.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxClients">Clientes</Label>
              <Input
                id="maxClients"
                type="number"
                min="1"
                {...register("maxClients", { valueAsNumber: true })}
              />
              {errors.maxClients && (
                <p className="text-sm text-red-600">{errors.maxClients.message}</p>
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
