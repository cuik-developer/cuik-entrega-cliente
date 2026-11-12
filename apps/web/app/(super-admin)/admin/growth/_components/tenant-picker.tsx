"use client"

import { useEffect, useRef, useState } from "react"

import type { TenantGrowthRow } from "@/lib/growth/results"

export const selectClass =
  "h-[26px] px-2 pr-6 rounded-[4px] border border-ent-line-strong bg-ent-panel text-[12.5px] text-ent-fg focus:outline-none focus:border-ent-accent cursor-pointer max-w-64"

/**
 * The tenants as Growth › Estado sees them (switch, connector, rules), for
 * the Growth screens that work one tenant at a time. `prefer` picks the
 * first tenant that matches when nothing is selected yet.
 */
export function useGrowthTenants(prefer?: (t: TenantGrowthRow) => boolean) {
  const [rows, setRows] = useState<TenantGrowthRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState("")
  // The predicate is fixed per screen: read it through a ref so the fetch runs once.
  const preferRef = useRef(prefer)
  preferRef.current = prefer

  useEffect(() => {
    fetch("/api/admin/growth")
      .then((r) => r.json())
      .then((json) => {
        if (!json?.success) throw new Error(json?.error ?? "No se pudo cargar")
        const list: TenantGrowthRow[] = json.data.tenants
        setRows(list)
        const pick = preferRef.current
        setTenantId((cur) => cur || (list.find(pick ?? (() => true)) ?? list[0])?.id || "")
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  return {
    rows,
    error,
    tenantId,
    setTenantId,
    tenant: rows?.find((t) => t.id === tenantId) ?? null,
  }
}

export function TenantSelect({
  rows,
  value,
  onChange,
  label = "Comercio",
}: {
  rows: TenantGrowthRow[]
  value: string
  onChange: (id: string) => void
  label?: string
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
    >
      {rows.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.growthOn ? "" : " (solo Loyalty)"}
        </option>
      ))}
    </select>
  )
}
