import { QrCode } from "lucide-react"

import {
  googleBalanceLabel,
  googleBalanceText,
  type PreviewState,
  resolvePreviewValue,
} from "../../lib/preview-values"
import { FIELD_SECTIONS } from "../../lib/validate-config"
import type { PassDesignConfigV2, PromotionType } from "../../types"

const GOOGLE_FONT_STACK = 'Roboto, "Google Sans", system-ui, sans-serif'
/** Google hero (class heroImage) aspect: 1032 × 336. */
const HERO_RATIO = "1032 / 336"

/** Google picks the text colour from the background: white on dark, near-black on light. */
function textOn(hex: string): { fg: string; muted: string } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { fg: "#FFFFFF", muted: "rgba(255,255,255,0.75)" }
  const n = Number.parseInt(m[1], 16)
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return lum > 0.4
    ? { fg: "#1F1F1F", muted: "rgba(31,31,31,0.7)" }
    : { fg: "#FFFFFF", muted: "rgba(255,255,255,0.75)" }
}

interface GoogleWalletPreviewProps {
  config: PassDesignConfigV2
  previewFilledStamps?: number
  promotionType?: PromotionType
  /** Visits per card the server uses (promotion first). Defaults to the design's. */
  maxVisits?: number
  completed?: boolean
  /** Google shows the tenant name (class issuerName / programName), never logoText. */
  tenantName?: string
}

/**
 * Google Wallet loyalty card as the server builds it (loyalty-class.ts +
 * loyalty-object.ts): background colour only (Google chooses the text
 * colour), circular program logo, tenant name, the computed balance string,
 * a static hero and every design field as a text module in the details.
 */
export function GoogleWalletPreview({
  config,
  previewFilledStamps = 3,
  promotionType = "stamps",
  maxVisits: maxVisitsProp,
  completed = false,
  tenantName = "Mi Comercio",
}: GoogleWalletPreviewProps) {
  const { backgroundColor } = config.colors
  const { fg, muted } = textOn(backgroundColor)
  const maxVisits = maxVisitsProp || config.stampsConfig.maxVisits || 8
  const state: PreviewState = {
    promotionType,
    maxVisits,
    current: Math.min(previewFilledStamps, maxVisits),
    completed,
    tenantName,
  }

  const logo = config.assets.logo ?? config.assets.icon ?? null
  const ownHero = config.assets.googleHero ?? null
  const hero = ownHero ?? config.assets.stripBg ?? null
  const textModules = FIELD_SECTIONS.flatMap((s) => config.fields[s] ?? [])

  return (
    <div className="flex w-full flex-col gap-3" style={{ fontFamily: GOOGLE_FONT_STACK }}>
      <div className="w-full overflow-hidden rounded-2xl" style={{ backgroundColor, color: fg }}>
        {/* Logo (circle) + tenant name */}
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <div className="size-8 shrink-0 overflow-hidden rounded-full bg-white/90">
            {logo && (
              // biome-ignore lint/performance/noImgElement: standalone package without Next.js
              <img src={logo} alt="Logo" className="h-full w-full object-cover" draggable={false} />
            )}
          </div>
          <span className="truncate text-sm font-medium" style={{ color: fg }}>
            {tenantName}
          </span>
        </div>

        {/* loyaltyPoints: label + the balance string the server computes */}
        <div className="px-4 pb-3">
          <div className="text-[11px]" style={{ color: muted }}>
            {googleBalanceLabel(promotionType)}
          </div>
          <div className="text-[15px] font-medium leading-snug" style={{ color: fg }}>
            {googleBalanceText(state)}
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="text-[11px]" style={{ color: muted }}>
            Nombre
          </div>
          <div className="text-sm" style={{ color: fg }}>
            Juan Perez
          </div>
        </div>

        {/* QR */}
        <div className="flex justify-center pb-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-white">
            <QrCode className="h-16 w-16 text-gray-800" />
          </div>
        </div>

        {/* Hero: Google-only image, else the Apple strip cropped to 1032 × 336. Static. */}
        <div className="relative w-full" style={{ aspectRatio: HERO_RATIO }}>
          {hero ? (
            // biome-ignore lint/performance/noImgElement: standalone package without Next.js
            <img
              src={hero}
              alt="Imagen de Google"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-black/10" />
          )}
          {hero && !ownHero && (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
              Franja Apple recortada a 1032 × 336
            </span>
          )}
        </div>
      </div>

      {/* Details: every design field becomes a text module (header + secondary + back). */}
      {textModules.length > 0 && (
        <div className="rounded-2xl bg-white px-4 py-3 text-[#1F1F1F] shadow-sm">
          <div className="mb-2 text-[11px] font-medium text-gray-500">Detalles del pase</div>
          <div className="flex flex-col gap-2.5">
            {textModules.map((field, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: keys may repeat while editing
              <div key={`${field.key}-${i}`}>
                <div className="text-[11px] text-gray-500">{field.label}</div>
                <div className="text-sm whitespace-pre-line">
                  {resolvePreviewValue(field.value, state)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
