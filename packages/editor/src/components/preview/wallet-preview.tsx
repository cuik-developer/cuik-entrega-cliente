"use client"

import { QrCode } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { resolvePreviewValue } from "../../lib/preview-values"
import { APPLE_MAX_HEADER_FIELDS, APPLE_MAX_SECONDARY_AUX_FIELDS } from "../../lib/validate-config"
import type { PassDesignConfigV2, PromotionType } from "../../types"
import { StampGridPreview } from "./stamp-grid-preview"

/** Width of a store card on an iPhone, in points: every pt size below is scaled from it. */
const IPHONE_CARD_PT = 343
/** Logo box of a store card (packages/wallet image-set.ts buildLogoSet: contain, centred). */
const LOGO_BOX_PT = { width: 160, height: 50 }

export const APPLE_FONT_STACK = '-apple-system, "SF Pro Text", system-ui, sans-serif'

interface WalletPreviewProps {
  config: PassDesignConfigV2
  previewFilledStamps?: number
  /** When "points", hides the stamp grid overlay on the strip */
  promotionType?: PromotionType
  /** Visits per card the server uses (promotion first). Defaults to the design's. */
  maxVisits?: number
  /** "Tarjeta completa": every stamp filled, as the server draws a pending reward. */
  completed?: boolean
  tenantName?: string
}

export function WalletPreview({
  config,
  previewFilledStamps = 3,
  promotionType = "stamps",
  maxVisits: maxVisitsProp,
  completed = false,
  tenantName = "Mi Comercio",
}: WalletPreviewProps) {
  const { backgroundColor, foregroundColor, labelColor } = config.colors
  const maxVisits = maxVisitsProp || config.stampsConfig.maxVisits || 8
  const state = {
    promotionType,
    maxVisits,
    current: Math.min(previewFilledStamps, maxVisits),
    completed,
    tenantName,
  }

  // pt → px of this preview (the card is drawn at its own width).
  const cardRef = useRef<HTMLDivElement>(null)
  const [pt, setPt] = useState(1)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setPt(w / IPHONE_CARD_PT)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // iOS shows at most 3 header fields and 4 secondary + auxiliary fields.
  const headerFields = config.fields.headerFields.slice(0, APPLE_MAX_HEADER_FIELDS)
  const secondaryFields = config.fields.secondaryFields.slice(0, APPLE_MAX_SECONDARY_AUX_FIELDS)

  return (
    <div
      ref={cardRef}
      className="w-full overflow-hidden rounded-xl"
      style={{ backgroundColor, color: foregroundColor, fontFamily: APPLE_FONT_STACK }}
    >
      {/* Header: logo box (160 × 50 pt) + header fields. logoText is never shown on iOS. */}
      <div
        className="flex items-center justify-between gap-2"
        style={{ padding: `${8 * pt}px ${12 * pt}px` }}
      >
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ width: LOGO_BOX_PT.width * pt, height: LOGO_BOX_PT.height * pt }}
        >
          {config.assets.logo && (
            // biome-ignore lint/performance/noImgElement: standalone package without Next.js
            <img
              src={config.assets.logo}
              alt="Logo"
              className="h-full w-full object-contain object-center"
              draggable={false}
            />
          )}
        </div>
        {headerFields.length > 0 && (
          <div className="flex min-w-0 items-start justify-end" style={{ gap: 10 * pt }}>
            {headerFields.map((field, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: keys may repeat while editing
              <div key={`${field.key}-${i}`} className="min-w-0 text-right">
                <div
                  className="truncate uppercase"
                  style={{ color: labelColor, fontSize: 9 * pt, letterSpacing: "0.04em" }}
                >
                  {field.label}
                </div>
                <div
                  className="truncate font-semibold leading-tight"
                  style={{ color: foregroundColor, fontSize: 15 * pt }}
                >
                  {resolvePreviewValue(field.value, state)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Strip image with stamp grid overlay */}
      <div className="relative" style={{ aspectRatio: "750 / 288" }}>
        {config.assets.stripBg ? (
          // biome-ignore lint/performance/noImgElement: standalone package without Next.js
          <img
            src={config.assets.stripBg}
            alt="Strip background"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(128,128,128,0.15)" }} />
        )}
        {promotionType === "stamps" && (
          <StampGridPreview
            stampsConfig={config.stampsConfig}
            stampImageUrl={config.assets.stamp}
            filledCount={state.current}
            maxVisits={maxVisits}
            completed={completed}
          />
        )}
      </div>

      {/* Secondary (+ auxiliary) fields, wrapped like iOS */}
      {secondaryFields.length > 0 && (
        <div
          className="flex flex-wrap"
          style={{ padding: `${8 * pt}px ${12 * pt}px`, columnGap: 18 * pt, rowGap: 6 * pt }}
        >
          {secondaryFields.map((field, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: keys may repeat while editing
            <div key={`${field.key}-${i}`} className="min-w-0 max-w-full">
              <div
                className="truncate uppercase"
                style={{ color: labelColor, fontSize: 9 * pt, letterSpacing: "0.04em" }}
              >
                {field.label}
              </div>
              <div className="truncate" style={{ color: foregroundColor, fontSize: 14 * pt }}>
                {resolvePreviewValue(field.value, state)}
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
