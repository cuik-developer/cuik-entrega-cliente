"use client"

import {
  BarChart3,
  CreditCard,
  Download,
  Gift,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Send,
  Settings,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { LogoutButton } from "@/components/logout-button"
import { TenantProvider, useTenant } from "@/hooks/use-tenant"
import { useSession } from "@/lib/auth-client"

const CUIK_PRIMARY = "#0e70db"

type NavItem = {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  pointsOnly?: boolean
}

/**
 * Same shell as the super-admin ("enterprise" look): dark top bar, grouped
 * side navigation, flat panels. Groups follow what the merchant does day to
 * day, not the internal modules.
 */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operación",
    items: [
      { href: "/panel", label: "Resumen", icon: LayoutDashboard },
      { href: "/panel/clientes", label: "Clientes", icon: Users },
      { href: "/panel/cajeros", label: "Equipo", icon: UserCheck },
    ],
  },
  {
    title: "Campañas",
    items: [
      { href: "/panel/campanas", label: "Envíos", icon: Send },
      { href: "/panel/campanas/geolocalizadas", label: "Geolocalizadas", icon: MapPin },
      { href: "/panel/campanas/automatizadas", label: "Automatizadas", icon: Sparkles },
    ],
  },
  {
    title: "Programa",
    items: [
      { href: "/panel/mi-pase", label: "Mi pase", icon: CreditCard },
      // Only shown to points programs.
      { href: "/panel/premios", label: "Premios", icon: Gift, pointsOnly: true },
    ],
  },
  {
    title: "Análisis",
    items: [
      { href: "/panel/analitica", label: "Analítica", icon: BarChart3 },
      { href: "/panel/exportar", label: "Exportar datos", icon: Download },
    ],
  },
  {
    title: "Sistema",
    items: [{ href: "/panel/configuracion", label: "Configuración", icon: Settings }],
  },
]
const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

/** Tenant identity in the top bar: logo (or initials on the brand color) + name. */
function TopBarTenant() {
  const { tenantName, branding, isLoading } = useTenant()
  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-[3px] bg-white/10 animate-pulse" />
        <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      {branding?.logoUrl ? (
        <Image
          src={branding.logoUrl}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 rounded-[3px] object-cover bg-white"
        />
      ) : (
        <span
          className="w-6 h-6 rounded-[3px] grid place-items-center text-[10px] font-bold text-white"
          style={{ backgroundColor: primaryColor }}
          aria-hidden="true"
        >
          {getInitials(tenantName || "MC")}
        </span>
      )}
      <span className="font-semibold text-[13px] tracking-[0.02em] truncate max-w-[220px]">
        {tenantName}
      </span>
    </div>
  )
}

/** Shown while a super-admin is viewing the tenant read-only. */
function SuperAdminViewBanner() {
  const { readOnly, tenantName } = useTenant()
  const [leaving, setLeaving] = useState(false)
  if (!readOnly) return null
  async function leave() {
    setLeaving(true)
    try {
      await fetch("/api/admin/sa-view", { method: "DELETE" })
    } finally {
      window.location.href = "/admin/tenants"
    }
  }
  return (
    <div className="bg-[#fff4d6] border-b border-[#f0d58a] text-ent-fg text-[12.5px] px-4 py-1.5 flex items-center justify-between gap-3 shrink-0">
      <span>
        Estás viendo <strong>{tenantName}</strong> como super-admin, en modo{" "}
        <strong>solo lectura</strong>. Los cambios están bloqueados.
      </span>
      <button
        type="button"
        onClick={leave}
        disabled={leaving}
        className="rounded-[4px] border border-ent-line-strong bg-ent-panel px-2.5 py-0.5 text-[12px] font-semibold text-ent-fg hover:bg-ent-panel-2 disabled:opacity-60"
      >
        {leaving ? "Saliendo…" : "Salir"}
      </button>
    </div>
  )
}

function SideNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname()
  const { promotionType, readOnly } = useTenant()
  // Parents with their own entry ("Envíos" is /panel/campanas) match exactly.
  const EXACT = new Set(["/panel", "/panel/campanas"])
  const isActive = (href: string) =>
    EXACT.has(href) ? pathname === href : pathname.startsWith(href)
  // Exportar is a bulk PII download: not offered in the super-admin's read-only view.
  const visible = (item: NavItem) =>
    (!item.pointsOnly || promotionType === "points") &&
    !(readOnly && item.href === "/panel/exportar")

  return (
    <nav className="flex-1 py-2 overflow-y-auto">
      {NAV_GROUPS.map((g) => {
        const items = g.items.filter(visible)
        if (items.length === 0) return null
        return (
          <div key={g.title} className="mb-1.5">
            <div className="px-3.5 pt-2 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-ent-fg-3">
              {g.title}
            </div>
            {items.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 pl-[11px] pr-3 py-2 lg:py-[7px] text-[12.5px] border-l-[3px] transition-colors ${
                    active
                      ? "border-l-ent-accent bg-ent-accent-soft text-ent-accent font-semibold"
                      : "border-l-transparent text-ent-fg-2 hover:bg-ent-panel-2 hover:text-ent-fg"
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: sessionData } = useSession()
  const [open, setOpen] = useState(false)
  // Below `lg` the closed drawer is off-canvas: make it inert so keyboard and
  // screen-reader users do not land on invisible links.
  const [desktop, setDesktop] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const sync = () => setDesktop(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  const userName = sessionData?.user?.name ?? ""
  const initials = getInitials(userName || "U")
  // Most specific entry wins ("/panel/campanas/geolocalizadas" over "/panel/campanas").
  const current =
    NAV_ITEMS.find((i) => i.href === pathname) ??
    [...NAV_ITEMS]
      .sort((a, b) => b.href.length - a.href.length)
      .find((i) => i.href !== "/panel" && pathname.startsWith(i.href))

  // Route change closes the drawer; Escape too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on navigation only
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className="ent fixed inset-0 flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-10 shrink-0 bg-ent-topbar text-[#e8edf3] flex items-center gap-3 px-3">
        <button
          type="button"
          className="lg:hidden p-1.5 -ml-1 rounded-[4px] text-[#b6c0cc] hover:bg-white/10 hover:text-white"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
        >
          {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
        <Link href="/panel" className="shrink-0" aria-label="Resumen">
          <CuikLogo size="sm" className="w-5 h-5 rounded-[3px]" />
        </Link>
        <span className="hidden sm:block w-px h-4 bg-[#3a4756]" aria-hidden="true" />
        <TopBarTenant />
        <span className="hidden sm:inline text-[11px] text-[#b6c0cc] border border-[#3a4756] rounded-[3px] px-1.5 leading-[18px]">
          Panel del comercio
        </span>
        <span className="lg:hidden text-[12.5px] text-[#b6c0cc] truncate">
          {current?.label ?? ""}
        </span>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <span className="hidden sm:inline text-[12px] text-[#b6c0cc] max-w-[160px] truncate">
            {userName}
          </span>
          <span
            className="w-[26px] h-[26px] rounded-full bg-[#4b5968] grid place-items-center text-[11px] font-semibold"
            aria-hidden="true"
          >
            {initials}
          </span>
          <LogoutButton
            className="p-1.5 rounded-[4px] text-[#b6c0cc] hover:bg-white/10 hover:text-white"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-3.5 h-3.5" />
          </LogoutButton>
        </div>
      </header>

      <SuperAdminViewBanner />

      <div className="flex flex-1 min-h-0">
        {/* Side navigation / drawer */}
        <aside
          inert={!desktop && !open}
          className={`fixed top-10 bottom-0 left-0 z-30 w-60 max-w-[85vw] bg-ent-panel border-r border-ent-line flex flex-col transition-transform duration-200 lg:static lg:w-[180px] lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Menú del panel"
        >
          <SideNav onNavigate={() => setOpen(false)} />
          <div className="border-t border-ent-line px-3.5 py-2 text-[11px] text-ent-fg-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            Cuik · panel del comercio
          </div>
        </aside>

        {/* Backdrop (mobile) */}
        {open && (
          // biome-ignore lint/a11y/useSemanticElements: overlay backdrop, not a semantic button
          <div
            className="fixed inset-0 top-10 z-20 bg-black/40 lg:hidden"
            role="button"
            tabIndex={0}
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setOpen(false)
            }}
          />
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-4 py-3 lg:px-5 lg:py-4 max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <Shell>{children}</Shell>
    </TenantProvider>
  )
}
