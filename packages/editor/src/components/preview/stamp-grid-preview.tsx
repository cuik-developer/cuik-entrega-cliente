"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { stampOrigin } from "../../lib/stamp-geometry"
import type { PassDesignConfigV2 } from "../../types"

// Strip image is 750x288 at @2x (store card strip: 375×144 pt)
const STRIP_2X_WIDTH = 750
const STRIP_2X_HEIGHT = 288

interface StampGridPreviewProps {
  stampsConfig: PassDesignConfigV2["stampsConfig"]
  stampImageUrl: string | null
  filledCount: number
  /**
   * Stamps to draw: the promotion's maxVisits, as the server does
   * (stripMaxVisits). Defaults to the design's own value.
   */
  maxVisits?: number
  /** Completed card with the reward pending: every stamp drawn filled. */
  completed?: boolean
}

/**
 * Gift badge exactly as strip-image.ts giftBadge(): disc of radius
 * r = max(6, round(size·0.22)) centred at (x + size − 0.9r, max(r, y + 0.9r)),
 * white stroke max(1.5, 0.16r), 10-point star of radii 0.58r / 0.26r.
 */
function badgeGeometry(x: number, y: number, stampSize: number) {
  const r = Math.max(6, Math.round(stampSize * 0.22))
  const cx = x + stampSize - r * 0.9
  const cy = Math.max(r, y + r * 0.9)
  const stroke = Number(Math.max(1.5, r * 0.16).toFixed(1))
  const pad = stroke
  const box = 2 * (r + pad)
  const c = r + pad
  const star = Array.from({ length: 10 }, (_, k) => {
    const radius = k % 2 === 0 ? r * 0.58 : r * 0.26
    const angle = -Math.PI / 2 + (k * Math.PI) / 5
    return `${(c + radius * Math.cos(angle)).toFixed(2)},${(c + radius * Math.sin(angle)).toFixed(2)}`
  }).join(" ")
  return { r, stroke, box, c, left: cx - c, top: cy - c, star }
}

/** Gift badge as a sibling of the stamp, so it keeps its own opacity while the stamp is faded. */
function GiftBadge(props: {
  x: number
  y: number
  stampSize: number
  scale: { x: number; y: number }
  filled: boolean
}) {
  const b = badgeGeometry(props.x, props.y, props.stampSize)
  return (
    <svg
      aria-hidden="true"
      className="absolute pointer-events-none"
      style={{
        left: b.left * props.scale.x,
        top: b.top * props.scale.y,
        width: b.box * props.scale.x,
        height: b.box * props.scale.y,
        opacity: props.filled ? 1 : 0.85,
      }}
      viewBox={`0 0 ${b.box} ${b.box}`}
    >
      <circle cx={b.c} cy={b.c} r={b.r} fill="#FF4810" stroke="#FFFFFF" strokeWidth={b.stroke} />
      <polygon points={b.star} fill="#FFFFFF" />
    </svg>
  )
}

export function StampGridPreview({
  stampsConfig,
  stampImageUrl,
  filledCount,
  maxVisits,
  completed = false,
}: StampGridPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState({ x: 1, y: 1 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setScale({ x: width / STRIP_2X_WIDTH, y: height / STRIP_2X_HEIGHT })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const filledOpacity = stampsConfig.filledOpacity ?? 1
  const emptyOpacity = stampsConfig.emptyOpacity ?? 0.35
  // All coordinates are in @2x space (750×288), scaled by the container ratio.
  // Missing keys of a legacy row use the server fallbacks (strip-layout.ts), see stampOrigin.
  const stampSize = stampsConfig.stampSize ?? 63
  // The server draws every visit of the card, even past the grid.
  const totalStamps = Math.max(0, maxVisits ?? stampsConfig.maxVisits ?? 8)
  const specialPositions = new Set(stampsConfig.specialPositions ?? [])
  const specialUrl = stampsConfig.specialStampUrl ?? null
  // Rounded like the server (strip-layout.ts + strip-image.ts).
  const specialSize = Math.round(
    Math.min(
      200,
      Math.max(
        16,
        stampsConfig.specialStampSize != null
          ? Math.round(stampsConfig.specialStampSize)
          : stampSize,
      ),
    ),
  )
  const specialShift = Math.round((stampSize - specialSize) / 2)

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      {Array.from({ length: totalStamps }, (_, i) => {
        const { x: x2, y: y2 } = stampOrigin(stampsConfig, i)
        const isFilled = completed || i < filledCount
        const opacity = isFilled ? filledOpacity : emptyOpacity
        const isSpecial = specialPositions.has(i + 1)
        const withIcon = isSpecial && specialUrl != null
        const imageUrl = withIcon ? specialUrl : stampImageUrl
        const box = withIcon ? specialSize : stampSize
        const shift = withIcon ? specialShift : 0
        // Same gift badge the server draws (orange disc, white star, top-right corner),
        // as a sibling so it keeps its own opacity while the empty stamp is faded.
        const badgeEl =
          isSpecial && !withIcon ? (
            <GiftBadge x={x2} y={y2} stampSize={stampSize} scale={scale} filled={isFilled} />
          ) : null

        return (
          <Fragment key={`stamp-${i}`}>
            <div
              className="absolute flex items-center justify-center"
              style={{
                left: (x2 + shift) * scale.x,
                top: (y2 + shift) * scale.y,
                width: box * scale.x,
                height: box * scale.y,
                opacity,
              }}
            >
              {imageUrl ? (
                // biome-ignore lint/performance/noImgElement: standalone package without Next.js
                <img
                  src={imageUrl}
                  alt={`Stamp ${i + 1}`}
                  className="h-full w-full object-contain"
                  draggable={false}
                />
              ) : (
                <div
                  className="rounded-full"
                  style={{
                    width: stampSize * scale.x * 0.8,
                    height: stampSize * scale.y * 0.8,
                    backgroundColor: isFilled ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                    border: "2px solid rgba(255,255,255,0.6)",
                  }}
                />
              )}
            </div>
            {badgeEl}
          </Fragment>
        )
      })}
    </div>
  )
}
