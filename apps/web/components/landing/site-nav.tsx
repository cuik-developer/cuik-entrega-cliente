"use client"

import { Menu, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"

/**
 * Public site navigation, shared by the home page and the marketing pages
 * (/contacto, /sobre-cuik). Hash links always point at the home page so they
 * work from any route; on the home page the browser just scrolls.
 *
 * `solid` renders the white bar from the start (sub-pages); the home page
 * leaves it transparent until the visitor scrolls.
 */
export const SITE_LINKS = [
  { href: "/#beneficios", label: "Beneficios" },
  { href: "/#demo", label: "Demo" },
  { href: "/#precios", label: "Precios" },
  { href: "/sobre-cuik", label: "Sobre Cuik" },
  { href: "/contacto", label: "Contáctanos" },
] as const

export function SiteNav({ solid = false }: { solid?: boolean }) {
  const pathname = usePathname()
  const [mobileMenu, setMobileMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    if (solid) return
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [solid])

  const bar = solid || scrolled

  const isCurrent = (href: string) => !href.includes("#") && pathname === href

  return (
    <nav
      className={`sticky top-0 z-50 transition-all duration-300 ${bar ? "bg-white/90 backdrop-blur-xl shadow-sm border-b border-gray-100" : "bg-transparent"}`}
    >
      <style>{`
        @keyframes site-nav-fade { from { opacity: 0; } to { opacity: 1; } }
        .site-nav-menu { animation: site-nav-fade 0.25s ease-out both; }
        @media (prefers-reduced-motion: reduce) { .site-nav-menu { animation: none; } }
      `}</style>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <CuikLogo />
          <span className="text-xl font-extrabold text-gray-900 tracking-tight">Cuik</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {SITE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrent(link.href) ? "page" : undefined}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-all hover:text-[#0e70db] hover:bg-blue-50/60 ${isCurrent(link.href) ? "text-[#0e70db] bg-blue-50/60" : "text-gray-600"}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex text-gray-700 font-medium hover:text-[#0e70db] hover:bg-blue-50/60"
            >
              Iniciar sesión
            </Button>
          </Link>
          <Link href="/login?view=demo">
            <Button
              size="sm"
              className="hidden md:inline-flex bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-semibold shadow-md shadow-blue-200/50 hover:shadow-lg hover:shadow-blue-200/60 transition-all"
            >
              Agenda una demo
            </Button>
          </Link>
          <button
            type="button"
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Menu"
            aria-expanded={mobileMenu}
          >
            {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenu && (
        <div className="site-nav-menu md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-100 px-4 py-5 space-y-1">
          {SITE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenu(false)}
              aria-current={isCurrent(link.href) ? "page" : undefined}
              className={`block px-3 py-2.5 text-sm font-medium rounded-lg hover:bg-gray-50 ${isCurrent(link.href) ? "text-[#0e70db]" : "text-gray-700"}`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-gray-100 space-y-2">
            <Link href="/login" className="block px-3 py-2.5 text-sm font-semibold text-[#0e70db]">
              Iniciar sesión
            </Link>
            <Link href="/login?view=demo">
              <Button className="w-full bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-semibold">
                Agenda una demo
              </Button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
