"use client"

import type { TenantBranding } from "@cuik/shared/validators"
import { createContext, useContext, useEffect, useRef, useState } from "react"
import { authClient } from "@/lib/auth-client"

type TenantContextValue = {
  tenantId: string
  tenantSlug: string
  tenantName: string
  organizationId: string
  branding: TenantBranding | null
  timezone: string
  promotionType: "stamps" | "points" | null
  promotionId: string | null
  promotionConfig: Record<string, unknown> | null
  isLoading: boolean
  error: string | null
}

const TenantContext = createContext<TenantContextValue | null>(null)

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TenantContextValue>({
    tenantId: "",
    tenantSlug: "",
    tenantName: "",
    organizationId: "",
    branding: null,
    timezone: "America/Lima",
    promotionType: null,
    promotionId: null,
    promotionConfig: null,
    isLoading: true,
    error: null,
  })

  const orgActivatedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function fetchTenant() {
      try {
        const res = await fetch("/api/me/tenant")
        const json = await res.json()

        if (cancelled) return

        if (!res.ok || !json.success) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: json.error || "No estas asignado a ningun comercio",
          }))
          return
        }

        const orgId = json.data.organizationId as string

        setState({
          tenantId: json.data.tenantId,
          tenantSlug: json.data.tenantSlug,
          tenantName: json.data.tenantName,
          organizationId: orgId,
          branding: json.data.branding ?? null,
          timezone: json.data.timezone ?? "America/Lima",
          promotionType: json.data.promotionType ?? null,
          promotionId: json.data.promotionId ?? null,
          promotionConfig: json.data.promotionConfig ?? null,
          isLoading: false,
          error: null,
        })

        // Set active organization for Better Auth — once only
        if (orgId && !orgActivatedRef.current) {
          orgActivatedRef.current = true
          authClient.organization.setActive({ organizationId: orgId }).catch((err) => {
            console.error("[TenantProvider] Failed to set active organization:", err)
          })
        }
      } catch {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Error al cargar el comercio",
        }))
      }
    }

    fetchTenant()

    return () => {
      cancelled = true
    }
  }, [])

  return <TenantContext value={state}>{children}</TenantContext>
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext)
  if (!ctx) {
    throw new Error("useTenant must be used within a TenantProvider")
  }
  return ctx
}
