import { QrCode } from "lucide-react"

import type { PassDesignConfigV2, PromotionType } from "../../types"
import { StampGridPreview } from "./stamp-grid-preview"

/** Resolve template variables like {{client.name}} to preview values */
function resolvePreviewValue(value: string, promotionType: PromotionType, maxVisits: number): string {
  const previewValues: Record<string, string> = {
    "{{client.name}}": "Juan Perez",
    "{{client.lastName}}": "Perez",
    "{{client.tier}}": "Regular",
    "{{client.phone}}": "+51 999 888 777",
    "{{client.email}}": "cliente@email.com",
    "{{stamps.current}}": "5",
    "{{stamps.max}}": String(maxVisits),
    "{{stamps.remaining}}": String(maxVisits - 5),
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

interface WalletPreviewProps {
  config: PassDesignConfigV2
  previewFilledStamps?: number
  /** When "points", hides the stamp grid overlay on the strip */
  promotionType?: PromotionType
}

export function WalletPreview({
  config,
  previewFilledStamps = 3,
  promotionType = "stamps",
}: WalletPreviewProps) {
  const { backgroundColor, foregroundColor, labelColor } = config.colors
  const headerField = config.fields.headerFields[0] ?? null

  return (
    <div
      className="w-full overflow-hidden rounded-xl"
      style={{
        backgroundColor,
        color: foregroundColor,
      }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          {config.assets.logo && (
            // biome-ignore lint/performance/noImgElement: standalone package without Next.js
            <img
              src={config.assets.logo}
              alt="Logo"
              className="h-7 w-auto object-contain"
              draggable={false}
            />
          )}
          {config.logoText && (
            <span className="text-sm font-semibold" style={{ color: foregroundColor }}>
              {config.logoText}
            </span>
          )}
        </div>
        {headerField && (
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wider" style={{ color: labelColor }}>
              {headerField.label}
            </div>
            <div className="text-lg font-bold leading-tight" style={{ color: foregroundColor }}>
              {resolvePreviewValue(headerField.value, promotionType, config.stampsConfig.maxVisits)}
            </div>
          </div>
        )}
      </div>

      {/* Strip image with stamp grid overlay */}
      <div className="relative" style={{ height: 110 }}>
        {config.assets.stripBg ? (
          // biome-ignore lint/performance/noImgElement: standalone package without Next.js
          <img
            src={config.assets.stripBg}
            alt="Strip background"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundColor: "rgba(128,128,128,0.15)",
            }}
          />
        )}
        {promotionType === "stamps" && (
          <StampGridPreview
            stampsConfig={config.stampsConfig}
            stampImageUrl={config.assets.stamp}
            filledCount={previewFilledStamps}
          />
        )}
      </div>

      {/* Secondary fields */}
      {config.fields.secondaryFields.length > 0 && (
        <div className="flex gap-6 px-3 py-2">
          {config.fields.secondaryFields.map((field) => (
            <div key={field.key || field.label}>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: labelColor }}>
                {field.label}
              </div>
              <div className="text-sm" style={{ color: foregroundColor }}>
                {resolvePreviewValue(field.value, promotionType, config.stampsConfig.maxVisits)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* QR code placeholder */}
      <div className="flex justify-center py-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white">
          <QrCode className="h-14 w-14 text-gray-800" />
        </div>
      </div>
    </div>
  )
}
