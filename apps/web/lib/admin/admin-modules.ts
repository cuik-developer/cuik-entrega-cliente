import {
  BookOpen,
  Building2,
  Calculator,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  CreditCard,
  Download,
  FileInput,
  FileOutput,
  FlaskConical,
  HandCoins,
  Handshake,
  Heart,
  History,
  Landmark,
  LayoutDashboard,
  Link2,
  type LucideIcon,
  Megaphone,
  MessageSquareText,
  Paintbrush,
  Palette,
  Plug,
  Rocket,
  Scale,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"
import { type AdminAccess, canAccess, permissionForAdminPath } from "@/lib/staff-permissions"

/**
 * Super-admin modules (app launcher at /admin, like Odoo apps or an Oracle
 * springboard). Each module keeps the menu groups the shell already had;
 * moving between modules goes through the launcher. URLs never change.
 * No server imports here: the client shell reads it too.
 */

export type AdminNavItem = { href: string; label: string; icon: LucideIcon }
export type AdminNavGroup = { title: string; items: AdminNavItem[] }
export type AdminModuleKey =
  | "comercios"
  | "loyalty"
  | "growth"
  | "crm"
  | "reclamaciones"
  | "finanzas"
  | "sistema"

export type AdminModule = {
  key: AdminModuleKey
  label: string
  description: string
  icon: LucideIcon
  /** Thin identity rule on the launcher card; never used as a fill. */
  rule: string
  groups: AdminNavGroup[]
}

export const ADMIN_MODULES: AdminModule[] = [
  {
    // Cross-cutting: a tenant is a Loyalty and a Growth customer at once, and
    // the daily checks (links, campaigns) and the record serve every line.
    key: "comercios",
    label: "Comercios",
    description: "Tenants, validaciones, historial y exportación",
    icon: Building2,
    rule: "#3b5b7a",
    groups: [
      {
        title: "Operación",
        items: [
          { href: "/admin/tenants", label: "Tenants", icon: Building2 },
          { href: "/admin/enlaces", label: "Validación de enlaces", icon: Link2 },
          { href: "/admin/campanas", label: "Validación de campañas", icon: Megaphone },
        ],
      },
      {
        title: "Registro",
        items: [
          { href: "/admin/historial", label: "Historial", icon: History },
          { href: "/admin/exportar", label: "Exportar datos", icon: Download },
        ],
      },
    ],
  },
  {
    key: "loyalty",
    label: "Loyalty",
    description: "Pases, métricas e impacto de la tarjeta",
    icon: Heart,
    rule: "#2f6fb5",
    groups: [
      {
        title: "Análisis",
        items: [
          { href: "/admin/metricas", label: "Métricas", icon: TrendingUp },
          { href: "/admin/impacto", label: "Impacto", icon: Scale },
        ],
      },
      {
        title: "Producto",
        items: [
          { href: "/admin/pases", label: "Diseños de pases", icon: Paintbrush },
          { href: "/admin/branding", label: "Branding", icon: Palette },
        ],
      },
      {
        title: "Demos",
        items: [{ href: "/admin/simulador", label: "Simulador", icon: FlaskConical }],
      },
    ],
  },
  {
    key: "growth",
    label: "Growth",
    description: "Audiencias, envíos y venta atribuida sobre el POS",
    icon: Rocket,
    rule: "#7a4fb3",
    groups: [
      {
        title: "Operación",
        items: [
          { href: "/admin/growth", label: "Estado Growth", icon: Rocket },
          { href: "/admin/growth/reglas", label: "Reglas por comercio", icon: SlidersHorizontal },
        ],
      },
      {
        title: "Datos",
        items: [
          { href: "/admin/growth/conectores", label: "Conectores POS", icon: Plug },
          {
            href: "/admin/growth/plantillas",
            label: "Plantillas y audiencias",
            icon: MessageSquareText,
          },
        ],
      },
    ],
  },
  {
    key: "crm",
    label: "CRM",
    description: "Solicitudes de alta y prospectos",
    icon: Handshake,
    rule: "#3d7f6a",
    groups: [
      {
        title: "Ventas",
        items: [
          { href: "/admin/solicitudes", label: "Solicitudes", icon: ClipboardList },
          { href: "/admin/finanzas/prospectos", label: "Prospectos", icon: Handshake },
        ],
      },
    ],
  },
  {
    key: "reclamaciones",
    label: "Reclamaciones",
    description: "Libro de Reclamaciones y plazos legales",
    icon: BookOpen,
    rule: "#8a4b5a",
    groups: [
      {
        title: "Libro de Reclamaciones",
        items: [{ href: "/admin/reclamaciones", label: "Reclamaciones", icon: BookOpen }],
      },
    ],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    description: "Tablero, costos, cobros y planes",
    icon: Wallet,
    rule: "#8a6a2b",
    groups: [
      {
        title: "Finanzas",
        items: [
          { href: "/admin/finanzas/inicio", label: "Inicio", icon: CalendarClock },
          { href: "/admin/finanzas/tablero", label: "Tablero", icon: LayoutDashboard },
          { href: "/admin/finanzas/cobranza", label: "Cobranza", icon: HandCoins },
          { href: "/admin/finanzas", label: "Costos e ingresos", icon: Wallet },
        ],
      },
      {
        title: "Contabilidad",
        items: [
          { href: "/admin/finanzas/contabilidad", label: "Resumen fiscal", icon: Calculator },
          { href: "/admin/finanzas/ventas", label: "Ventas", icon: FileOutput },
          { href: "/admin/finanzas/compras", label: "Compras", icon: FileInput },
          { href: "/admin/finanzas/cierres", label: "Cierres", icon: CalendarCheck },
        ],
      },
      {
        title: "Configuración",
        items: [
          { href: "/admin/finanzas/empresa", label: "Empresa y régimen", icon: Landmark },
          { href: "/admin/planes", label: "Planes", icon: CreditCard },
        ],
      },
    ],
  },
  {
    key: "sistema",
    label: "Sistema",
    description: "Equipo Cuik y configuración",
    icon: Settings,
    rule: "#5d6675",
    groups: [
      {
        title: "Sistema",
        items: [
          { href: "/admin/equipo", label: "Equipo Cuik", icon: Users },
          { href: "/admin/configuracion", label: "Configuración", icon: Settings },
        ],
      },
    ],
  },
]

/** Business lines still to come: shown greyed on the owner's launcher. */
export const UPCOMING_MODULES: { label: string; description: string; icon: LucideIcon }[] = [
  { label: "Ads", description: "Agencia Meta y Google Ads", icon: Megaphone },
  { label: "Mesa", description: "Pedidos y mesas", icon: UtensilsCrossed },
]

const ALL_ITEMS = ADMIN_MODULES.flatMap((m) =>
  m.groups.flatMap((g) => g.items.map((item) => ({ module: m, item }))),
)

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The module and menu item a path belongs to. The most specific href wins,
 * so /admin/finanzas/prospectos is CRM while /admin/finanzas is Finanzas.
 */
export function moduleForPath(
  pathname: string,
): { module: AdminModule; item: AdminNavItem } | null {
  let best: { module: AdminModule; item: AdminNavItem } | null = null
  for (const entry of ALL_ITEMS) {
    if (!matches(pathname, entry.item.href)) continue
    if (!best || entry.item.href.length > best.item.href.length) best = entry
  }
  return best
}

/** The module's groups with only the items `access` may open (empty groups dropped). */
export function visibleGroups(module: AdminModule, access: AdminAccess): AdminNavGroup[] {
  return module.groups
    .map((g) => ({
      title: g.title,
      items: g.items.filter((i) => canAccess(access, permissionForAdminPath(i.href))),
    }))
    .filter((g) => g.items.length > 0)
}

/** Modules with at least one screen `access` may open, with where each one opens. */
export function visibleModules(
  access: AdminAccess,
): { module: AdminModule; href: string; groups: AdminNavGroup[] }[] {
  return ADMIN_MODULES.flatMap((module) => {
    const groups = visibleGroups(module, access)
    const first = groups[0]?.items[0]
    return first ? [{ module, href: first.href, groups }] : []
  })
}
