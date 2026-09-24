import { Instagram, MessageCircle } from "lucide-react"
import Link from "next/link"
import { CuikLogo } from "@/components/cuik-logo"
import { CookieBanner } from "@/components/landing/cookie-banner"
import { LEGAL_PAGES_ENABLED } from "@/lib/legal"

export const WHATSAPP_URL = "https://wa.me/51972213023"
export const INSTAGRAM_URL = "https://www.instagram.com/cuik.ia/"
// Public inbox shown on /contacto.
export const CONTACT_EMAIL = "francesco.leon@cuik.org"

const COLUMNS = [
  {
    title: "Producto",
    links: [
      { label: "Beneficios", href: "/#beneficios" },
      { label: "Demo", href: "/#demo" },
      { label: "Precios", href: "/#precios" },
    ],
  },
  // "Recursos" (Blog, Guías, API Docs) hidden until there is real content behind it.
  {
    title: "Empresa",
    links: [
      { label: "Sobre Cuik", href: "/sobre-cuik" },
      { label: "Contáctanos", href: "/contacto" },
    ],
  },
  ...(LEGAL_PAGES_ENABLED
    ? [
        {
          title: "Legal",
          links: [
            { label: "Términos y Condiciones", href: "/terminos-y-condiciones" },
            { label: "Política de Privacidad", href: "/politica-de-privacidad" },
            { label: "Política de Cookies", href: "/politica-de-cookies" },
            { label: "Libro de Reclamaciones", href: "/libro-de-reclamaciones" },
          ],
        },
      ]
    : []),
]

/** Public site footer, shared by the home page and the marketing pages. */
export function SiteFooter() {
  return (
    <footer className="bg-[#0f172a] text-gray-400 py-14">
      {LEGAL_PAGES_ENABLED && <CookieBanner />}
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <CuikLogo size="sm" />
              <span className="text-white font-extrabold text-lg tracking-tight">Cuik</span>
            </Link>
            <p className="text-sm leading-relaxed">
              Fidelización digital para comercios físicos en LATAM.
            </p>
            <div className="flex gap-2">
              {/* TikTok y LinkedIn ocultos hasta tener cuentas */}
              {[
                {
                  label: "Instagram de Cuik",
                  href: INSTAGRAM_URL,
                  icon: <Instagram className="w-4 h-4" />,
                },
                {
                  label: "Escríbenos por WhatsApp",
                  href: WHATSAPP_URL,
                  icon: <MessageCircle className="w-4 h-4" />,
                },
              ].map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  title={s.label}
                  className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title} className="space-y-3">
              <div className="text-white font-semibold text-sm">{col.title}</div>
              {col.links.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="block text-sm hover:text-white transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
          <span>© 2026 Cuik. Hecho con amor en Lima, Perú</span>
          <Link
            href="/login?view=demo"
            className="text-[#0e70db] hover:text-blue-400 font-semibold transition-colors"
          >
            Empieza gratis →
          </Link>
        </div>
      </div>
    </footer>
  )
}
