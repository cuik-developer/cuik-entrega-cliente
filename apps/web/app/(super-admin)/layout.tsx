"use client"

import {
  Bot,
  Building2,
  ClipboardList,
  CreditCard,
  LogOut,
  Paintbrush,
  Palette,
  Settings,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data: sessionData } = useSession()

  const userName = sessionData?.user?.name ?? "Super Admin"
  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const isActive = (href: string) => {
    return pathname.startsWith(href)
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-[#0f172a] flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <CuikLogo />
            <span className="text-white font-bold text-base">Cuik</span>
            <Badge className="ml-auto bg-[#ff4810]/20 text-[#ff4810] border-0 text-xs px-1.5">
              SA
            </Badge>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
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

        <div className="p-3 border-t border-white/10">
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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div
          className={
            pathname.startsWith("/admin/editor") || pathname.includes("/editor")
              ? ""
              : "p-6 max-w-5xl"
          }
        >
          {children}
        </div>
      </main>
    </div>
  )
}
