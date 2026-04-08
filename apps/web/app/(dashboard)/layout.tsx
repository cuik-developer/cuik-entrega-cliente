"use client"

import {
  BarChart3,
  Bell,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  UserCheck,
  Users,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { LogoutButton } from "@/components/logout-button"
import { Button } from "@/components/ui/button"
import { TenantProvider, useTenant } from "@/hooks/use-tenant"

const CUIK_PRIMARY = "#0e70db"
const CUIK_ACCENT = "#ff4810"

const navItems = [
  { href: "/panel", label: "Dashboard", icon: LayoutDashboard },
  { href: "/panel/mi-pase", label: "Mi Pase", icon: CreditCard },
  { href: "/panel/clientes", label: "Clientes", icon: Users },
  { href: "/panel/cajeros", label: "Cajeros", icon: UserCheck },
  { href: "/panel/analitica", label: "Analítica", icon: BarChart3 },
  { href: "/panel/campanas", label: "Campañas", icon: Megaphone },
  { href: "/panel/configuracion", label: "Configuración", icon: Settings },
]

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

function SidebarTenantSection() {
  const { tenantName, branding, isLoading } = useTenant()

  if (isLoading) {
    return (
      <>
        {/* Logo skeleton */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-white/10 animate-pulse" />
          <div className="flex-1">
            <div className="h-3.5 w-24 bg-white/10 rounded animate-pulse" />
            <div className="h-2.5 w-16 bg-white/10 rounded animate-pulse mt-1.5" />
          </div>
        </div>
        {/* Badge skeleton */}
        <div className="px-5 pt-3 pb-2">
          <div className="h-5 w-16 bg-white/10 rounded-full animate-pulse" />
        </div>
      </>
    )
  }

  const displayName = tenantName || "Mi Comercio"
  const _initials = getInitials(displayName)

  return (
    <>
      {/* Logo + Tenant identity */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
        {branding?.logoUrl ? (
          <Image
            src={branding.logoUrl}
            alt={displayName}
            width={32}
            height={32}
            className="w-8 h-8 rounded-lg object-cover"
          />
        ) : (
          <CuikLogo />
        )}
        <div>
          <div className="text-white font-bold text-sm leading-none">{displayName}</div>
          <div className="text-white/40 text-xs mt-0.5">Cuik Platform</div>
        </div>
      </div>

      {/* Tenant name badge */}
      <div className="px-3 pt-3 pb-2">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${branding?.primaryColor ?? CUIK_PRIMARY}20`,
            color: branding?.primaryColor ?? "#60a5fa",
          }}
        >
          {displayName}
        </span>
      </div>
    </>
  )
}

function TopBarTenantAvatar() {
  const { tenantName, branding, isLoading } = useTenant()
  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY
  const accentColor = branding?.accentColor ?? CUIK_ACCENT
  const initials = isLoading ? "" : getInitials(tenantName || "MC")

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5 hidden sm:flex">
        <Bell className="w-3.5 h-3.5" />
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
      </Button>
      {isLoading ? (
        <div className="w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
      ) : branding?.logoUrl ? (
        <Image
          src={branding.logoUrl}
          alt={tenantName ?? "Tenant"}
          width={32}
          height={32}
          className="w-8 h-8 rounded-full object-cover"
        />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: primaryColor }}
        >
          {initials}
        </div>
      )}
    </div>
  )
}

function SidebarNav({ onNavClick }: { onNavClick: () => void }) {
  const pathname = usePathname()
  const { branding } = useTenant()
  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY

  const isActive = (href: string) => {
    if (href === "/panel") return pathname === "/panel"
    return pathname.startsWith(href)
  }

  return (
    <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavClick}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
            isActive(item.href) ? "text-white" : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
          style={isActive(item.href) ? { backgroundColor: primaryColor } : undefined}
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <TenantProvider>
      <div className="fixed inset-0 flex bg-[#f8fafc] dark:bg-background overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`
        fixed inset-y-0 left-0 z-30 w-60 bg-[#0f172a] flex flex-col transition-transform duration-200
        lg:static lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}
        >
          <SidebarTenantSection />
          <SidebarNav onNavClick={() => setSidebarOpen(false)} />

          {/* Bottom */}
          <div className="px-3 pb-4 border-t border-white/10 pt-3">
            <LogoutButton className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors">
              <LogOut className="w-4 h-4" />
              Salir
            </LogoutButton>
          </div>
        </aside>

        {/* Overlay mobile */}
        {sidebarOpen && (
          // biome-ignore lint/a11y/useSemanticElements: overlay backdrop, not a semantic button
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            role="button"
            tabIndex={0}
            onClick={() => setSidebarOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSidebarOpen(false)
            }}
          />
        )}

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar */}
          <header className="bg-white border-b border-slate-200 px-4 lg:px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="lg:hidden p-2 text-slate-500 hover:text-slate-700"
                onClick={() => setSidebarOpen(true)}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <title>Abrir menú</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </button>
            </div>
            <TopBarTenantAvatar />
          </header>

          {/* Content */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-[#f8fafc] dark:bg-background">
            {children}
          </main>
        </div>
      </div>
    </TenantProvider>
  )
}
