import { QrCode } from "lucide-react"

import type { PassDesignConfigV2, PromotionType } from "../../types"

/** Resolve template variables like {{client.name}} to preview values */
function resolvePreviewValue(value: string, promotionType: PromotionType): string {
  const previewValues: Record<string, string> = {
    "{{client.name}}": "Juan Perez",
    "{{client.lastName}}": "Perez",
    "{{client.tier}}": "Regular",
    "{{client.phone}}": "+51 999 888 777",
    "{{client.email}}": "cliente@email.com",
    "{{stamps.current}}": "5",
    "{{stamps.max}}": "10",
    "{{stamps.remaining}}": "5",
    "{{stamps.total}}": promotionType === "points" ? "12" : "15",
    "{{points.balance}}": "325",
    "{{rewards.pending}}": "1",
    "{{tenant.name}}": "Mi Comercio",
  }

  let resolved = value
  for (const [key, val] of Object.entries(previewValues)) {
    resolved = resolved.replaceAll(key, val)
  }
  // Resolve {{client.customData.*}} to a readable placeholder based on the key name
  resolved = resolved.replace(/\{\{client\.customData\.(\w+)\}\}/g, (_match, key: string) =>
    key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim(),
  )
  // Catch any remaining unresolved {{...}} patterns
  resolved = resolved.replace(/\{\{[^}]+\}\}/g, "—")
  return resolved
}

interface GoogleWalletPreviewProps {
  config: PassDesignConfigV2
  previewFilledStamps?: number
  /** When "points", adjusts label and value display */
  promotionType?: PromotionType
}

export function GoogleWalletPreview({
  config,
  previewFilledStamps = 3,
  promotionType = "stamps",
}: GoogleWalletPreviewProps) {
  const { backgroundColor, foregroundColor, labelColor } = config.colors
  const headerField = config.fields.headerFields[0] ?? null

  const programName = config.logoText || "Programa de Fidelidad"

  const loyaltyLabel = promotionType === "points" ? "Puntos" : "Sellos"
  const loyaltyValue = headerField
    ? resolvePreviewValue(headerField.value, promotionType)
    : promotionType === "points"
      ? "325"
      : `${previewFilledStamps}`

  return (
    <div
      className="w-full overflow-hidden rounded-xl"
      style={{
        backgroundColor,
        color: foregroundColor,
      }}
    >
      {/* Header bar — logo + issuer name */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        {(config.assets.logo || config.assets.icon) && (
          // biome-ignore lint/performance/noImgElement: standalone package without Next.js
          <img
            src={config.assets.logo ?? config.assets.icon ?? undefined}
            alt="Logo"
            className="size-6 rounded-full object-contain"
            draggable={false}
          />
        )}
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: labelColor }}>
          {programName}
        </span>
      </div>

      {/* Thin separator */}
      <div className="mx-4" style={{ borderBottom: `1px solid ${labelColor}33` }} />

      {/* Program name — large */}
      <div className="px-4 pt-3 pb-1">
        <span className="text-lg font-bold leading-tight" style={{ color: foregroundColor }}>
          {programName}
        </span>
      </div>

      {/* Loyalty balance section */}
      <div className="px-4 pt-1 pb-3">
        <div className="text-[10px] uppercase tracking-wider" style={{ color: labelColor }}>
          {loyaltyLabel}
        </div>
        <div className="text-2xl font-bold leading-tight" style={{ color: foregroundColor }}>
          {loyaltyValue}
        </div>
      </div>

      {/* Secondary fields as label/value list */}
      {config.fields.secondaryFields.length > 0 && (
        <div className="space-y-1.5 px-4 pb-3">
          {config.fields.secondaryFields.map((field) => (
            <div key={field.key || field.label} className="flex justify-between items-baseline">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: labelColor }}>
                {field.label}
              </span>
              <span className="text-sm font-medium" style={{ color: foregroundColor }}>
                {resolvePreviewValue(field.value, promotionType)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* QR code placeholder */}
      <div className="flex justify-center py-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white">
          <QrCode className="h-14 w-14 text-gray-800" />
        </div>
      </div>
    </div>
  )
}
