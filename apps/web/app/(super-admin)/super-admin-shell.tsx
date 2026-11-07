"use client"

import { ArrowLeft, LayoutGrid, LogOut, Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { AdminAccessProvider, NoAccess } from "@/components/admin/admin-access"
import { TenantSearch } from "@/components/admin/tenant-search"
import { CuikLogo } from "@/components/cuik-logo"
import { LogoutButton } from "@/components/logout-button"
import { moduleForPath, visibleGroups } from "@/lib/admin/admin-modules"
import { useSession } from "@/lib/auth-client"
import { type AdminAccess, canAccess, canOpenAdminPath } from "@/lib/staff-permissions"

/**
 * Super-admin shell, enterprise look: a thin dark top bar (brand, global
 * search, user) over a light grouped side navigation. /admin is the module
 * launcher (no side menu); inside a module the side menu shows only that
 * module, and the grid button goes back to the launcher. Below `lg` the
 * navigation is an off-canvas drawer opened from the top bar and closed by
 * the backdrop, a nav click or Escape. Equipo Cuik staff see only the
 * sections they were granted; any other page shows "No tienes acceso".
 */
export function SuperAdminShell({
  access,
  children,
}: {
  access: AdminAccess
  children: React.ReactNode
}) {
  const isStaff = access.kind === "staff"
  const pathname = usePathname()
  const isHome = pathname === "/admin"
  // The most specific item wins, so /admin/finanzas/prospectos is CRM › Prospectos.
  const hit = isHome ? null : moduleForPath(pathname)
  const module = hit?.module ?? null
  const navGroups = module ? visibleGroups(module, access) : []
  const showSide = navGroups.length > 0
  const current = hit?.item ?? null
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

  const userName = sessionData?.user?.name ?? (isStaff ? "Equipo Cuik" : "Super Admin")
  const initials = userName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  const isActive = (href: string) => current?.href === href
  const isEditor = pathname.startsWith("/admin/editor") || pathname.includes("/editor")

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
    <AdminAccessProvider access={access}>
      <div className="ent fixed inset-0 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-10 shrink-0 bg-ent-topbar text-[#e8edf3] flex items-center gap-3 px-3">
          {showSide && (
            <button
              type="button"
              className="lg:hidden p-1.5 -ml-1 rounded-[4px] text-[#b6c0cc] hover:bg-white/10 hover:text-white"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={open}
            >
              {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          )}
          {!isHome && (
            <Link
              href="/admin"
              title="Volver a los módulos"
              aria-label="Volver a los módulos"
              className="grid place-items-center w-[30px] h-[30px] -ml-1 rounded-[4px] text-[#b6c0cc] hover:bg-white/10 hover:text-white"
            >
              <LayoutGrid className="w-[17px] h-[17px]" />
            </Link>
          )}
          <Link href="/admin" className="flex items-center gap-2 shrink-0">
            <CuikLogo size="sm" className="w-5 h-5 rounded-[3px]" />
            <span className="font-semibold text-[13px] tracking-[0.02em]">Cuik</span>
          </Link>
          {module ? (
            <>
              <span className="w-px h-[18px] bg-[#3a4756]" aria-hidden="true" />
              <span className="flex items-center gap-1.5 text-[13px] font-semibold truncate">
                <module.icon className="w-3.5 h-3.5 shrink-0 text-[#b6c0cc]" aria-hidden />
                {module.label}
              </span>
            </>
          ) : (
            <span className="hidden sm:inline text-[11px] text-[#b6c0cc] border border-[#3a4756] rounded-[3px] px-1.5 leading-[18px]">
              {isStaff ? "Equipo Cuik" : "Super-admin"}
            </span>
          )}

          {canAccess(access, "tenants_view") && (
            <TenantSearch className="ml-auto hidden md:block" />
          )}

          <div className="flex items-center gap-2 shrink-0 md:ml-0 ml-auto">
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

        <div className="flex flex-1 min-h-0">
          {/* Side navigation / drawer: only inside a module */}
          {showSide && (
            <aside
              inert={!desktop && !open}
              className={`fixed top-10 bottom-0 left-0 z-30 w-60 max-w-[85vw] bg-ent-panel border-r border-ent-line flex flex-col transition-transform duration-200 lg:static lg:w-[180px] lg:translate-x-0 ${
                open ? "translate-x-0" : "-translate-x-full"
              }`}
              aria-label="Menú del super-admin"
            >
              <nav className="flex-1 py-2 overflow-y-auto">
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 mx-2 mb-1.5 px-2 py-1.5 border border-ent-line rounded-[4px] text-[12px] text-ent-fg-2 hover:bg-ent-panel-2 hover:text-ent-fg"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  Módulos
                </Link>
                {navGroups.map((g) => (
                  <div key={g.title} className="mb-1.5">
                    <div className="px-3.5 pt-2 pb-1 text-[10.5px] uppercase tracking-[0.08em] text-ent-fg-3">
                      {g.title}
                    </div>
                    {g.items.map((item) => {
                      const active = isActive(item.href)
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
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
                ))}
              </nav>
              <div className="border-t border-ent-line px-3.5 py-2 text-[11px] text-ent-fg-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {isStaff ? "Cuik · Equipo Cuik" : "Cuik · super-admin"}
              </div>
            </aside>
          )}

          {/* Backdrop (mobile) */}
          {showSide && open && (
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
            <div className={isEditor ? "" : "px-4 py-3 lg:px-5 lg:py-4 max-w-[1280px]"}>
              {canOpenAdminPath(access, pathname) ? children : <NoAccess access={access} />}
            </div>
          </main>
        </div>
      </div>
    </AdminAccessProvider>
  )
}
