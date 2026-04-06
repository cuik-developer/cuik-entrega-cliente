"use client"

import { Building2, Megaphone, Pencil, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import type { PlanWithTenantCount } from "./queries"

type PlanCardProps = {
  plan: PlanWithTenantCount
  onEdit: (plan: PlanWithTenantCount) => void
  onToggle: (plan: PlanWithTenantCount) => void
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Gratis"
  return `S/${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

export function PlanCard({ plan, onEdit, onToggle }: PlanCardProps) {
  const isInactive = !plan.active

  return (
    <div
      className={`relative rounded-xl border p-5 transition-all ${
        isInactive
          ? "border-zinc-200 bg-zinc-50 opacity-60"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">{plan.name}</h3>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-zinc-900">
              {formatPrice(plan.price)}
            </span>
            {plan.price > 0 && <span className="text-sm text-zinc-500">/mes</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {plan.tenantCount > 0 && (
            <Badge variant="secondary" className="text-xs font-medium">
              {plan.tenantCount} {plan.tenantCount === 1 ? "comercio" : "comercios"}
            </Badge>
          )}
          {isInactive && (
            <Badge
              variant="outline"
              className="border-amber-300 bg-amber-50 text-amber-700 text-xs"
            >
              Inactivo
            </Badge>
          )}
        </div>
      </div>

      {/* Limits */}
      <div className="space-y-2 mb-5">
        <LimitRow icon={Building2} label="Sucursales" value={plan.maxLocations} />
        <LimitRow icon={Megaphone} label="Promociones" value={plan.maxPromos} />
        <LimitRow icon={Users} label="Clientes" value={plan.maxClients} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-zinc-100">
        <Button variant="ghost" size="sm" className="flex-1 text-sm" onClick={() => onEdit(plan)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Editar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`flex-1 text-sm ${
            isInactive
              ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              : "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
          }`}
          onClick={() => onToggle(plan)}
        >
          {isInactive ? "Activar" : "Desactivar"}
        </Button>
      </div>
    </div>
  )
}

function LimitRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="font-medium text-zinc-800">{value}</span>
    </div>
  )
}
