"use client"

import { Loader2 } from "lucide-react"

import { Notice, Panel, PanelMessage } from "@/components/admin/enterprise"
import { useTenant } from "@/hooks/use-tenant"

/**
 * Wraps every Growth page: while the tenant loads shows a spinner; when
 * Growth is off for the tenant, a plain message instead of the screen.
 * Cashiers never reach these pages (the API refuses them too).
 */
export function GrowthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, error, growth, memberRole, readOnly } = useTenant()
  if (error) return <Notice tone="bad">{error}</Notice>
  if (isLoading) {
    return (
      <PanelMessage>
        <Loader2 className="w-4 h-4 animate-spin" />
      </PanelMessage>
    )
  }
  if (!growth) {
    return (
      <Panel>
        <PanelMessage>
          <span>Growth no está activo para tu comercio.</span>
          <span>
            Growth sugiere a quién escribir cada día con las ventas de tu punto de venta y mide qué
            compró cada cliente después del mensaje. Escríbenos para activarlo.
          </span>
        </PanelMessage>
      </Panel>
    )
  }
  if (!readOnly && memberRole !== null && memberRole !== "owner" && memberRole !== "admin") {
    return (
      <Notice tone="info">Solo el dueño o un administrador del comercio puede usar Growth.</Notice>
    )
  }
  return <>{children}</>
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const json = await res.json().catch(() => ({ success: false, error: "Respuesta inválida" }))
  if (!res.ok || !json.success) throw new Error(json.error ?? `Error ${res.status}`)
  return json.data as T
}
