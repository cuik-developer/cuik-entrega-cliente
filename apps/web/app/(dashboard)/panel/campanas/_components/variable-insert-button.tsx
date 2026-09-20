"use client"

import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useTenant } from "@/hooks/use-tenant"

type Variable = { variable: string; label: string }

/** Variables that make sense for every program. */
const COMMON: Variable[] = [
  { variable: "{{client.name}}", label: "Nombre del cliente" },
  { variable: "{{stamps.total}}", label: "Visitas totales" },
]
const STAMPS: Variable[] = [
  { variable: "{{stamps.current}}", label: "Sellos en ciclo" },
  { variable: "{{stamps.max}}", label: "Sellos para premio" },
  { variable: "{{stamps.remaining}}", label: "Sellos restantes" },
  { variable: "{{rewards.pending}}", label: "Premios pendientes" },
]
const POINTS: Variable[] = [{ variable: "{{points.balance}}", label: "Balance de puntos" }]
const TAIL: Variable[] = [{ variable: "{{tenant.name}}", label: "Nombre del comercio" }]

/**
 * Only the variables of the tenant's program: a stamps tenant never sees
 * "Balance de puntos" (it would render 0) and a points tenant never sees
 * the stamp counters. Unknown type → both, to be safe.
 */
export function campaignVariablesFor(promotionType: "stamps" | "points" | null): Variable[] {
  const specific =
    promotionType === "points"
      ? POINTS
      : promotionType === "stamps"
        ? STAMPS
        : [...STAMPS, ...POINTS]
  return [...COMMON, ...specific, ...TAIL]
}

interface VariableInsertButtonProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onInsert: (newValue: string) => void
}

export function VariableInsertButton({ textareaRef, onInsert }: VariableInsertButtonProps) {
  const { promotionType } = useTenant()
  const variables = campaignVariablesFor(promotionType)

  function handleInsert(variable: string) {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const currentValue = textarea.value
    const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)

    onInsert(newValue)

    // Restore cursor position after the inserted variable
    requestAnimationFrame(() => {
      const newPos = start + variable.length
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1">
          Insertar variable
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {variables.map((v) => (
          <DropdownMenuItem key={v.variable} onClick={() => handleInsert(v.variable)}>
            <span className="font-mono text-xs text-blue-600 mr-2">{v.variable}</span>
            <span className="text-xs text-muted-foreground">{v.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
