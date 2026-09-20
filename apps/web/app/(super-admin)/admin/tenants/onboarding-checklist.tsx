"use client"

import { AlertTriangle, CheckCircle2, Circle, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"

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
  /** Tab of the tenant modal to open, or an absolute href. */
  action?: { tab?: string; href?: string; label: string }
}

function buildItems(c: OnboardingChecklist, tenantId: string): Item[] {
  const promoType = c.activePromotion?.type === "points" ? "puntos" : "sellos"
  return [
    {
      key: "promotion",
      label: "Promocion activa",
      detail:
        c.activePromotionCount > 1
          ? `${c.activePromotionCount} activas a la vez: las visitas pueden tomar la equivocada. Deja una sola.`
          : c.activePromotion
            ? `Programa de ${promoType}.`
            : "Sin promocion activa: el pase no puede generarse.",
      state: c.activePromotionCount > 1 ? "warn" : c.activePromotion ? "ok" : "todo",
      action: { tab: "promocion", label: "Promocion" },
    },
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
  onOpenTab: (tab: string) => void
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
      <ul className="space-y-2">
        {items.map((item) => {
          const I = ICON[item.state]
          return (
            <li key={item.key} className="flex items-start gap-2.5">
              <I.icon className={`w-4 h-4 mt-0.5 shrink-0 ${I.cls}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-sm ${item.state === "ok" ? "text-slate-700" : "font-medium text-slate-900"}`}
                  >
                    {item.label}
                  </span>
                  {item.action && item.state !== "ok" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px] text-[#0e70db] gap-1"
                      onClick={() => {
                        if (item.action?.href) window.open(item.action.href, "_blank")
                        else if (item.action?.tab) onOpenTab(item.action.tab)
                      }}
                    >
                      {item.action.label}
                      {item.action.href && <ExternalLink className="w-3 h-3" />}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-slate-500">{item.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
