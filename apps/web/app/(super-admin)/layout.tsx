"use client"

import {
  Building2,
  ClipboardList,
  CreditCard,
  LogOut,
  Menu,
  Paintbrush,
  Palette,
  Settings,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { LogoutButton } from "@/components/logout-button"
import { Badge } from "@/components/ui/badge"
import { useSession } from "@/lib/auth-client"

const navItems = [
  { href: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardList },
  { href: "/admin/tenants", label: "Tenants", icon: Building2 },
  { href: "/admin/pases", label: "Diseños de Pases", icon: Paintbrush },
  { href: "/admin/branding", label: "Branding", icon: Palette },
  { href: "/admin/planes", label: "Planes", icon: CreditCard },
  { href: "/admin/metricas", label: "Métricas", icon: TrendingUp },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
  // { href: "/admin/office", label: "Office", icon: Bot },
]

/**
 * Super-admin shell. Same mobile pattern as the merchant panel: below `lg`
 * the sidebar is an off-canvas drawer opened from a top bar hamburger and
 * closed by the backdrop, a nav click or the Escape key.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: sessionData } = useSession()
  const [open, setOpen] = useState(false)

  const userName = sessionData?.user?.name ?? "Super Admin"
  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const isActive = (href: string) => pathname.startsWith(href)
  const isEditor = pathname.startsWith("/admin/editor") || pathname.includes("/editor")
  const current = navItems.find((i) => isActive(i.href))

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
    <div className="fixed inset-0 flex bg-slate-50 overflow-hidden">
      {/* Sidebar / drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 max-w-[85vw] bg-[#0f172a] flex flex-col transition-transform duration-200 lg:static lg:w-56 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menú del super-admin"
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CuikLogo />
            <span className="text-white font-bold text-base">Cuik</span>
            <Badge className="ml-auto bg-[#ff4810]/20 text-[#ff4810] border-0 text-xs px-1.5">
              SA
            </Badge>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`w-full flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive(item.href)
                  ? "bg-[#0e70db] text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-xs font-bold text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate">{userName}</div>
              <div className="text-slate-400 text-xs">Super Admin</div>
            </div>
          </div>
          <LogoutButton className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg text-xs transition-colors mt-1">
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </LogoutButton>
        </div>
      </aside>

      {/* Backdrop (mobile) */}
      {open && (
        // biome-ignore lint/a11y/useSemanticElements: overlay backdrop, not a semantic button
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          role="button"
          tabIndex={0}
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setOpen(false)
          }}
        />
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar, mobile only */}
        <header className="lg:hidden bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            className="p-2 -ml-1 rounded-lg text-slate-600 hover:bg-slate-100"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-slate-800 truncate">
            {current?.label ?? "Super-admin"}
          </span>
          <Badge className="ml-auto bg-[#ff4810]/10 text-[#ff4810] border-0 text-[10px] px-1.5">
            SA
          </Badge>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className={isEditor ? "" : "p-4 lg:p-6 max-w-5xl"}>{children}</div>
        </main>
      </div>
    </div>
  )
}
