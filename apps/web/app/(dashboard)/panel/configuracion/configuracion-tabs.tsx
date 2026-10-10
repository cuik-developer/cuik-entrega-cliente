"use client"

import { Building2, type LucideIcon, Mail, MapPin } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { PageHeader } from "@/components/admin/enterprise"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BusinessSection } from "./_components/business-section"
import { LocationsSection } from "./_components/locations-section"
import { ReportsSection } from "./_components/reports-section"
import type { LocationData, TenantConfigData } from "./actions"

export const CONFIG_TABS = ["negocio", "sucursales", "reportes"] as const
export type ConfigTab = (typeof CONFIG_TABS)[number]

const SECTIONS: { value: ConfigTab; label: string; icon: LucideIcon }[] = [
  { value: "negocio", label: "Negocio", icon: Building2 },
  { value: "sucursales", label: "Sucursales", icon: MapPin },
  { value: "reportes", label: "Reportes por correo", icon: Mail },
]

const STORAGE_KEY = "cuik.panel.configTab"

/**
 * Configuración: one section per tab, same bar as the super-admin tenant page.
 * `?tab=` deep-links a section (Campañas points here); otherwise the last tab
 * opened in this browser session is remembered.
 */
export function ConfiguracionTabs({
  initialData,
  initialLocations,
  initialTab,
}: {
  initialData: TenantConfigData
  initialLocations: LocationData[]
  /** Tab from the URL; null = remembered one or "negocio". */
  initialTab: ConfigTab | null
}) {
  // Server and first client render agree on `initialTab ?? "negocio"`; the
  // remembered tab is applied after mount so hydration never mismatches.
  const [tab, setTabState] = useState<ConfigTab>(initialTab ?? "negocio")

  useEffect(() => {
    // A deep link (e.g. the Campañas notice) wins over the remembered tab.
    if (initialTab) {
      setTabState(initialTab)
      return
    }
    try {
      const saved = window.sessionStorage.getItem(STORAGE_KEY)
      if (saved && (CONFIG_TABS as readonly string[]).includes(saved)) {
        setTabState(saved as ConfigTab)
      }
    } catch {
      /* private mode / storage blocked: ignore */
    }
  }, [initialTab])

  const setTab = useCallback((value: string) => {
    const next = value as ConfigTab
    setTabState(next)
    try {
      window.sessionStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* private mode / storage blocked: ignore */
    }
    // Keep the URL shareable without re-running the server page.
    window.history.replaceState(null, "", `/panel/configuracion?tab=${next}`)
  }, [])

  const tenantSlug = initialData.slug

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Inicio", href: "/panel" }, { label: "Configuración" }]}
        title="Configuración"
        subtitle="Datos del negocio, pase, sucursales y todo lo que se envía solo."
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <TabsList className="w-full h-auto justify-start items-stretch gap-0 bg-ent-panel rounded-[4px] border border-ent-line p-0 px-2 overflow-x-auto [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="flex-none gap-1.5 rounded-none border-0 border-b-2 border-b-transparent -mb-px px-3 h-9 text-[12.5px] text-ent-fg-2 whitespace-nowrap data-[state=active]:border-b-ent-accent data-[state=active]:text-ent-accent data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
            >
              <s.icon className="w-3.5 h-3.5 shrink-0" />
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="min-w-0 w-full max-w-3xl">
          <TabsContent value="negocio" className="space-y-3">
            <BusinessSection initialData={initialData} />
          </TabsContent>

          <TabsContent value="sucursales" className="space-y-3">
            <LocationsSection initialLocations={initialLocations} />
          </TabsContent>

          <TabsContent value="reportes" className="space-y-3">
            <ReportsSection tenantSlug={tenantSlug} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
