"use client"

import { Plus } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

import { togglePlanActive } from "./actions"
import { PlanCard } from "./plan-card"
import { PlanFormDialog } from "./plan-form-dialog"
import type { PlanWithTenantCount } from "./queries"

type PlanGridProps = {
  plans: PlanWithTenantCount[]
}

export function PlanGrid({ plans }: PlanGridProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PlanWithTenantCount | null>(null)
  const [togglingPlan, setTogglingPlan] = useState<PlanWithTenantCount | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate() {
    setEditingPlan(null)
    setDialogOpen(true)
  }

  function handleEdit(plan: PlanWithTenantCount) {
    setEditingPlan(plan)
    setDialogOpen(true)
  }

  function handleToggle(plan: PlanWithTenantCount) {
    setTogglingPlan(plan)
  }

  function confirmToggle() {
    if (!togglingPlan) return

    const planId = togglingPlan.id
    startTransition(async () => {
      const result = await togglePlanActive(planId)
      if (result.success) {
        toast.success(result.data.active ? "Plan activado" : "Plan desactivado")
      } else {
        toast.error(result.error)
      }
      setTogglingPlan(null)
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Planes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {plans.length} {plans.length === 1 ? "plan" : "planes"} configurados
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo plan
        </Button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center">
          <p className="text-sm text-zinc-500">No hay planes configurados todavia.</p>
          <Button variant="link" onClick={handleCreate} className="mt-2 text-sm">
            Crear el primer plan
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onEdit={handleEdit} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <PlanFormDialog
        key={editingPlan?.id ?? "new"}
        plan={editingPlan}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Toggle confirmation */}
      <AlertDialog
        open={!!togglingPlan}
        onOpenChange={(open) => {
          if (!open) setTogglingPlan(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingPlan?.active
                ? `Desactivar "${togglingPlan.name}"`
                : `Activar "${togglingPlan?.name}"`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingPlan?.active
                ? "Este plan no podra asignarse a nuevos comercios. Los comercios que ya lo tienen asignado no se ven afectados."
                : "Este plan volvera a estar disponible para asignar a comercios."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle} disabled={isPending}>
              {isPending ? "Procesando..." : togglingPlan?.active ? "Desactivar" : "Activar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
