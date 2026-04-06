import { PhoneFrame, WalletPreview } from "@cuik/editor"
import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"
import { Award, Clock, Coins, CreditCard, Gift, Info, Smartphone, Star, Zap } from "lucide-react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { auth } from "@/lib/auth"
import { getTenantForUser } from "@/lib/tenant-context"

import { CompartirPase } from "./components/compartir-pase"
import { SolicitarCambiosButton } from "./components/solicitar-cambios-button"
import { assemblePassConfig, getActiveDesignForTenant } from "./queries"

/**
 * Resolve template variables for admin preview display.
 * Replaces {{path.to.value}} with human-readable descriptions.
 */
function resolvePreviewValue(template: string): string {
  const previewMap: Record<string, string> = {
    "{{client.name}}": "Nombre del cliente",
    "{{client.lastName}}": "Apellido",
    "{{client.tier}}": "Regular",
    "{{client.totalVisits}}": "15",
    "{{client.pointsBalance}}": "325",
    "{{stamps.current}}": "5",
    "{{stamps.max}}": "8",
    "{{stamps.remaining}}": "3",
    "{{stamps.total}}": "15",
    "{{points.balance}}": "325",
    "{{rewards.pending}}": "1",
    "{{tenant.name}}": "Tu comercio",
  }
  let resolved = template
  for (const [key, val] of Object.entries(previewMap)) {
    resolved = resolved.replaceAll(key, val)
  }
  // Resolve {{client.customData.*}} to a readable placeholder based on the key name
  resolved = resolved.replace(/\{\{client\.customData\.(\w+)\}\}/g, (_match, key: string) =>
    key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim(),
  )
  // Catch any remaining {{...}} patterns
  resolved = resolved.replace(/\{\{[^}]+\}\}/g, "—")
  return resolved
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function PassDetails({
  design,
  config,
  promotion,
}: {
  design: { isActive: boolean; updatedAt: Date; type: string }
  config: PassDesignConfigV2
  promotion: { type: string; rewardValue: string | null; maxVisits: number | null } | null
}) {
  const isPoints = promotion?.type === "points"
  const backFields = config.fields.backFields ?? []

  const details = isPoints
    ? [
        { label: "Tipo", value: "Programa de Puntos" },
        { label: "Nombre", value: promotion?.rewardValue ?? "—" },
      ]
    : [
        { label: "Tipo", value: "Tarjeta de Sellos" },
        {
          label: "Sellos para premio",
          value: String(promotion?.maxVisits ?? config.stampsConfig.maxVisits),
        },
        { label: "Premio", value: promotion?.rewardValue ?? "—" },
      ]

  return (
    <div className="space-y-8">
      {/* Status + last updated */}
      <div className="flex items-center justify-between">
        <Badge
          className={
            design.isActive
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
              : "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-100"
          }
        >
          {design.isActive ? "Activo" : "Inactivo"}
        </Badge>
        <span className="text-sm text-slate-500">Actualizado {formatDate(design.updatedAt)}</span>
      </div>

      {/* Key details */}
      <div className="space-y-3">
        {details.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0"
          >
            <span className="text-sm text-slate-500">{item.label}</span>
            <span className="text-sm font-medium text-slate-800">{item.value}</span>
          </div>
        ))}

        {/* Wallets */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <span className="text-sm text-slate-500">Wallets</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
              <Smartphone className="h-4 w-4 text-slate-500" />
              Apple Wallet
              <span className="text-emerald-600">&#10003;</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
              <Smartphone className="h-4 w-4 text-slate-500" />
              Google Wallet
              <span className="text-emerald-600">&#10003;</span>
            </span>
          </div>
        </div>
      </div>

      {/* BackFields */}
      {backFields.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Información del reverso
          </h3>
          <div className="space-y-2">
            {backFields.map((field) => (
              <div key={field.key || field.label} className="rounded-lg bg-slate-50 px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {resolvePreviewValue(field.label)}
                </span>
                <p className="mt-0.5 text-sm text-slate-700">{resolvePreviewValue(field.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-sm leading-relaxed text-blue-700">
          El diseño de tu pase es gestionado por el equipo de Cuik. Si necesitas cambios, solicita
          una modificación.
        </p>
      </div>

      <SolicitarCambiosButton />
    </div>
  )
}

function getRoundingLabel(rounding: unknown): string {
  if (rounding === "floor") return "Piso (redondeo abajo)"
  if (rounding === "ceil") return "Techo (redondeo arriba)"
  return "Normal"
}

function buildPointsRules(
  config: Record<string, unknown>,
): Array<{ icon: React.ReactNode; label: string; value: string }> {
  const pts = config.points as Record<string, unknown> | undefined
  if (!pts) return []

  const rules: Array<{ icon: React.ReactNode; label: string; value: string }> = []
  rules.push({
    icon: <Coins className="h-4 w-4 text-blue-500" />,
    label: "Puntos por sol",
    value: `${pts.pointsPerCurrency ?? 1} punto(s) por cada S/ 1.00`,
  })
  rules.push({
    icon: <Zap className="h-4 w-4 text-amber-500" />,
    label: "Redondeo",
    value: getRoundingLabel(pts.roundingMethod ?? "floor"),
  })
  if (pts.minimumPurchaseForPoints) {
    rules.push({
      icon: <Award className="h-4 w-4 text-violet-500" />,
      label: "Compra minima",
      value: `S/ ${pts.minimumPurchaseForPoints}`,
    })
  }
  return rules
}

function buildStampsRules(
  config: Record<string, unknown>,
): Array<{ icon: React.ReactNode; label: string; value: string }> {
  const rules: Array<{ icon: React.ReactNode; label: string; value: string }> = []
  const stamps = config.stamps as Record<string, unknown> | undefined
  const accumulation = config.accumulation as Record<string, unknown> | undefined

  if (stamps) {
    const maxPerDay = stamps.maxVisitsPerDay as number | undefined
    if (maxPerDay && maxPerDay > 1) {
      rules.push({
        icon: <Star className="h-4 w-4 text-amber-500" />,
        label: "Max visitas por dia",
        value: String(maxPerDay),
      })
    }
    const expDays = stamps.rewardExpirationDays as number | null | undefined
    if (expDays) {
      rules.push({
        icon: <Clock className="h-4 w-4 text-red-500" />,
        label: "Expiracion de premios",
        value: `${expDays} dias`,
      })
    }
  }
  if (accumulation) {
    const minPurchase = accumulation.minimumPurchaseAmount as number | null | undefined
    if (minPurchase) {
      rules.push({
        icon: <Award className="h-4 w-4 text-violet-500" />,
        label: "Compra minima",
        value: `S/ ${minPurchase}`,
      })
    }
  }
  return rules
}

function PromotionRules({
  promotion,
}: {
  promotion: {
    type: string
    rewardValue: string | null
    maxVisits: number | null
    config: Record<string, unknown> | null
  }
}) {
  const isPoints = promotion.type === "points"
  const config = promotion.config

  const rules = config ? (isPoints ? buildPointsRules(config) : buildStampsRules(config)) : []

  if (rules.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Zap className="h-4 w-4 text-slate-500" />
        Reglas de la promocion
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {rules.map((rule) => (
          <div
            key={rule.label}
            className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-3"
          >
            {rule.icon}
            <div>
              <span className="text-xs text-slate-400">{rule.label}</span>
              <p className="text-sm font-medium text-slate-700">{rule.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CatalogPreview({
  items,
}: {
  items: Array<{
    id: string
    name: string
    description: string | null
    pointsCost: number
    category: string | null
  }>
}) {
  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Gift className="h-4 w-4 text-slate-500" />
        Catalogo de premios
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-slate-800">{item.name}</span>
              {item.description && (
                <p className="text-xs text-slate-400 truncate">{item.description}</p>
              )}
              {item.category && (
                <span className="inline-block mt-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {item.category}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-3">
              <Coins className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-sm font-bold text-amber-600">{item.pointsCost}</span>
              <span className="text-xs text-slate-400">pts</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-100">
        <CreditCard className="h-10 w-10 text-slate-400" />
      </div>
      <h2 className="text-lg font-semibold text-slate-800">Tu pase aún no ha sido configurado</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        El equipo de Cuik se encarga de diseñar y configurar tu tarjeta de fidelización. Te
        notificaremos cuando esté listo.
      </p>
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/60 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p className="text-sm leading-relaxed text-blue-700">
          Si ya coordinaste con nuestro equipo, tu pase estará disponible pronto.
        </p>
      </div>
    </div>
  )
}

export default async function MiPasePage() {
  const headersList = await headers()
  const session = await auth.api.getSession({ headers: headersList })

  if (!session) {
    redirect("/login")
  }

  // Build base URL from request headers (works on localhost, ngrok, production)
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000"
  const proto = headersList.get("x-forwarded-proto") || "http"
  const baseUrl = `${proto}://${host}`

  const tenant = await getTenantForUser(session.user.id)
  if (!tenant) {
    return <p className="text-slate-500">No tienes un comercio asignado</p>
  }

  const result = await getActiveDesignForTenant(tenant.tenantId)

  if (!result) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Mi Pase</h1>
          <p className="text-sm text-slate-500">
            {tenant.tenantName} &middot; Diseño de tu tarjeta de fidelización
          </p>
        </div>
        <EmptyState />
      </div>
    )
  }

  const config = assemblePassConfig(result.design, result.assets)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Mi Pase</h1>
        <p className="text-sm text-slate-500">
          {tenant.tenantName} &middot; Diseño de tu tarjeta de fidelización
        </p>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[auto_1fr]">
        {/* LEFT — Wallet preview (hero) */}
        <div className="flex justify-center lg:justify-start">
          <PhoneFrame walletType={result.design.type as "apple_store" | "google_loyalty"}>
            <WalletPreview
              config={config}
              previewFilledStamps={3}
              promotionType={result.promotion?.type === "points" ? "points" : "stamps"}
            />
          </PhoneFrame>
        </div>

        {/* RIGHT — Pass details + share */}
        <div className="min-w-0 space-y-8">
          <PassDetails design={result.design} config={config} promotion={result.promotion} />

          {/* Promotion rules section */}
          {result.promotion && (
            <>
              <div className="border-t border-slate-200" />
              <PromotionRules promotion={result.promotion} />
            </>
          )}

          {/* Catalog section (points only) */}
          {result.catalogItems.length > 0 && (
            <>
              <div className="border-t border-slate-200" />
              <CatalogPreview items={result.catalogItems} />
            </>
          )}

          {/* Divider */}
          <div className="border-t border-slate-200" />

          {/* Share section */}
          <CompartirPase
            registroUrl={`${baseUrl}/${tenant.tenantSlug}/registro`}
            tenantName={tenant.tenantName}
          />
        </div>
      </div>
    </div>
  )
}
