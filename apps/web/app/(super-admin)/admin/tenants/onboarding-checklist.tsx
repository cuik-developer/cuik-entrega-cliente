"use client"

import { AlertTriangle, CheckCircle2, ChevronRight, Circle, ExternalLink } from "lucide-react"

export type OnboardingChecklist = {
  activePromotion: { type: string } | null
  activePromotionCount: number
  designPublished: boolean
  appleMode: string | null
  googleConfigured: boolean
  registrationBonus: boolean
  birthdayAsked: boolean
  locations: number
  cashiers: number
  admins: number
  clients: number
}

type Item = {
  key: string
  label: string
  detail: string
  state: "ok" | "todo" | "warn"
  /** Tab of the tenant modal to open (optionally a section inside it), or an absolute href. */
  action?: { tab?: string; anchor?: string; href?: string; label: string }
}

function promotionItem(c: OnboardingChecklist): Item {
  const promoType = c.activePromotion?.type === "points" ? "puntos" : "sellos"
  if (c.activePromotionCount > 1) {
    return {
      key: "promotion",
      label: "Promocion activa",
      detail: `${c.activePromotionCount} activas a la vez: las visitas pueden tomar la equivocada. Deja una sola.`,
      state: "warn",
      action: { tab: "promocion", label: "Promocion" },
    }
  }
  return {
    key: "promotion",
    label: "Promocion activa",
    detail: c.activePromotion
      ? `Programa de ${promoType}.`
      : "Sin promocion activa: el pase no puede generarse.",
    state: c.activePromotion ? "ok" : "todo",
    action: { tab: "promocion", label: "Promocion" },
  }
}

function buildItems(c: OnboardingChecklist, tenantId: string): Item[] {
  return [
    promotionItem(c),
    {
      key: "design",
      label: "Diseno de pase publicado",
      detail: c.designPublished
        ? "Hay un diseno activo."
        : "Sin diseno publicado: los clientes no pueden instalar el pase.",
      state: c.designPublished ? "ok" : "todo",
      action: { href: `/admin/pases?tenant=${tenantId}`, label: "Disenos" },
    },
    {
      key: "apple",
      label: "Apple Wallet",
      detail:
        c.appleMode === "production"
          ? "Certificado propio en produccion."
          : c.appleMode === "configuring"
            ? "Certificado a medio configurar."
            : "En modo demo (certificado compartido de Cuik).",
      state: c.appleMode === "production" ? "ok" : c.appleMode === "configuring" ? "warn" : "todo",
      action: { tab: "apple", label: "Apple" },
    },
    {
      key: "google",
      label: "Google Wallet",
      detail: c.googleConfigured
        ? "Emisor de la plataforma configurado."
        : "Faltan las credenciales de Google Wallet en el servidor.",
      state: c.googleConfigured ? "ok" : "todo",
    },
    {
      key: "registration",
      label: "Registro publico",
      detail: [
        c.registrationBonus ? "bono de bienvenida activo" : "sin bono de bienvenida",
        c.birthdayAsked ? "pregunta cumpleanos" : "no pregunta cumpleanos",
      ].join(" · "),
      state: c.registrationBonus ? "ok" : "todo",
      action: { tab: "registro", label: "Registro" },
    },
    {
      key: "team",
      label: "Equipo del comercio",
      detail: `${c.admins} admin(s) · ${c.cashiers} cajero(s)${c.cashiers === 0 ? " — sin cajeros nadie puede registrar visitas" : ""}`,
      state: c.cashiers > 0 ? "ok" : "todo",
    },
    {
      key: "locations",
      label: "Sucursales",
      detail: c.locations > 0 ? `${c.locations} activa(s).` : "Sin sucursales activas.",
      state: c.locations > 0 ? "ok" : "todo",
      action: { tab: "general", anchor: "sucursales", label: "Sucursales" },
    },
    {
      key: "clients",
      label: "Primer cliente registrado",
      detail:
        c.clients > 0
          ? `${c.clients} cliente(s).`
          : "Todavia nadie se registro: probar el flujo completo antes de entregar.",
      state: c.clients > 0 ? "ok" : "todo",
    },
  ]
}

const ICON = {
  ok: { icon: CheckCircle2, cls: "text-emerald-600" },
  warn: { icon: AlertTriangle, cls: "text-amber-500" },
  todo: { icon: Circle, cls: "text-slate-300" },
} as const

/**
 * Onboarding status of a tenant, with a shortcut to fix each pending item.
 * Read-only: it only reflects data the other tabs already manage.
 */
export function OnboardingChecklist({
  checklist,
  tenantId,
  onOpenTab,
}: {
  checklist: OnboardingChecklist
  tenantId: string
  onOpenTab: (tab: string, anchor?: string) => void
}) {
  const items = buildItems(checklist, tenantId)
  const done = items.filter((i) => i.state === "ok").length
  const pct = Math.round((done / items.length) * 100)

  return (
    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Puesta en marcha
        </p>
        <span className="text-xs font-semibold text-slate-700 tabular-nums">
          {done}/{items.length} listo
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] ${pct === 100 ? "bg-emerald-500" : "bg-[#0e70db]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const I = ICON[item.state]
          const go = item.action
            ? () => {
                if (item.action?.href) window.open(item.action.href, "_blank")
                else if (item.action?.tab) onOpenTab(item.action.tab, item.action.anchor)
              }
            : null
          const body = (
            <>
              <I.icon className={`w-4 h-4 mt-0.5 shrink-0 ${I.cls}`} />
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm ${item.state === "ok" ? "text-slate-700" : "font-medium text-slate-900"}`}
                  >
                    {item.label}
                  </span>
                  {item.action && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[11px] shrink-0 ${
                        item.state === "ok" ? "text-slate-400" : "text-[#0e70db] font-medium"
                      }`}
                    >
                      {item.action.label}
                      {item.action.href ? (
                        <ExternalLink className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">{item.detail}</p>
              </div>
            </>
          )
          return (
            <li key={item.key}>
              {go ? (
                <button
                  type="button"
                  onClick={go}
                  className="w-full flex items-start gap-2.5 rounded-lg -mx-2 px-2 py-1.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e70db]/40 transition-colors"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-start gap-2.5 px-0 py-1.5">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
