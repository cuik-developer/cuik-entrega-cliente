"use client"

import { Clock, LogOut, QrCode, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { LogoutButton } from "@/components/logout-button"
import { TenantProvider, useTenant } from "@/hooks/use-tenant"
import { CUIK_ACCENT, CUIK_PRIMARY, darkenColor } from "@/lib/color-utils"

const navItems = [
  { href: "/cajero/escanear", label: "Escanear", icon: QrCode },
  { href: "/cajero/buscar", label: "Buscar", icon: Search },
  { href: "/cajero/historial", label: "Historial", icon: Clock },
]

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
}

function LogoOrInitials({
  logoUrl,
  name,
  color,
  isLoading,
}: {
  logoUrl?: string | null
  name: string
  color: string
  isLoading: boolean
}) {
  const [imgFailed, setImgFailed] = useState(false)

  if (isLoading) {
    return <div className="w-8 h-8 rounded-lg bg-white/10 animate-pulse" />
  }

  if (logoUrl && !imgFailed) {
    return (
      // biome-ignore lint/performance/noImgElement: dynamic src from tenant branding, cannot use next/image without known domains
      <img
        src={logoUrl}
        alt={name}
        className="w-8 h-8 rounded-lg object-cover"
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
      style={{ backgroundColor: color }}
    >
      {getInitials(name)}
    </div>
  )
}

function CajeroHeader() {
  const { tenantName, branding, isLoading } = useTenant()
  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY
  const displayName = tenantName || "Sin comercio"

  return (
    <header className="bg-[#0f172a] px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <LogoOrInitials
          logoUrl={branding?.logoUrl}
          name={displayName}
          color={primaryColor}
          isLoading={isLoading}
        />
        <div>
          <div className="text-white font-bold text-sm leading-none">
            {isLoading ? "Cargando..." : displayName}
          </div>
          <div className="text-white/40 text-xs">Cajero</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-white/40 text-xs">
          <Clock className="w-3.5 h-3.5" />
          <span>
            {new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <LogoutButton className="text-white/40 hover:text-white transition-colors">
          <LogOut className="w-4 h-4" />
        </LogoutButton>
      </div>
    </header>
  )
}

function CajeroNav() {
  const pathname = usePathname()
  const { branding } = useTenant()
  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="max-w-lg mx-auto flex gap-1">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                active ? "border-current" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              style={active ? { color: primaryColor, borderColor: primaryColor } : undefined}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function CajeroContent({ children }: { children: React.ReactNode }) {
  const { isLoading, error, branding } = useTenant()
  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div
          className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: `${primaryColor} transparent transparent transparent` }}
        />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-900">Sin comercio asignado</h2>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return <div className="flex-1 max-w-lg mx-auto w-full px-4 py-6">{children}</div>
}

function CajeroShell({ children }: { children: React.ReactNode }) {
  const { branding } = useTenant()
  const primaryColor = branding?.primaryColor ?? CUIK_PRIMARY
  const accentColor = branding?.accentColor ?? CUIK_ACCENT
  const primaryDark = darkenColor(primaryColor, 0.25)

  return (
    <div
      className="min-h-screen bg-[#f8fafc] flex flex-col"
      style={
        {
          "--brand-primary": primaryColor,
          "--brand-accent": accentColor,
          "--brand-primary-dark": primaryDark,
        } as React.CSSProperties
      }
    >
      <CajeroHeader />
      <CajeroNav />
      <CajeroContent>{children}</CajeroContent>
    </div>
  )
}

export default function CajeroLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <CajeroShell>{children}</CajeroShell>
    </TenantProvider>
  )
}
