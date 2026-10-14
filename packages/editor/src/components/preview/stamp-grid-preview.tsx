"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import type { PassDesignConfigV2 } from "../../types"

// Strip image is 750x288 at @2x (store card strip: 375×144 pt)
const STRIP_2X_WIDTH = 750
const STRIP_2X_HEIGHT = 288

interface StampGridPreviewProps {
  stampsConfig: PassDesignConfigV2["stampsConfig"]
  stampImageUrl: string | null
  filledCount: number
}

export function StampGridPreview({
  stampsConfig,
  stampImageUrl,
  filledCount,
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

  const { gridCols, gridRows, stampSize, filledOpacity, emptyOpacity } = stampsConfig
  const gridTotal = gridCols * gridRows
  const totalStamps = Math.min(gridTotal, stampsConfig.maxVisits)
  const rowOffsets = stampsConfig.rowOffsets ?? []
  const fillOrder = stampsConfig.fillOrder ?? "row"

  // All coordinates are in @2x space, scaled by container ratio
  const oX = stampsConfig.offsetX ?? 197
  const oY = stampsConfig.offsetY ?? 23
  const gX = stampsConfig.gapX ?? 98
  const gY = stampsConfig.gapY ?? 73

  return (
    <div ref={containerRef} className="absolute inset-0">
      {Array.from({ length: totalStamps }, (_, i) => {
        const row = fillOrder === "interleaved" ? i % gridRows : Math.floor(i / gridCols)
        const col = fillOrder === "interleaved" ? Math.floor(i / gridRows) : i % gridCols
        const rowOff = rowOffsets[row] ?? { x: 0, y: 0 }
        const x2 = oX + col * gX + rowOff.x
        const y2 = oY + row * gY + rowOff.y
        const isFilled = i < filledCount
        const opacity = isFilled ? filledOpacity : emptyOpacity
        const isSpecial = (stampsConfig.specialPositions ?? []).includes(i + 1)
        const specialUrl = stampsConfig.specialStampUrl ?? null
        const imageUrl = isSpecial && specialUrl ? specialUrl : stampImageUrl
        const scalePct =
          isSpecial && specialUrl
            ? Math.min(200, Math.max(50, stampsConfig.specialStampScale ?? 100)) / 100
            : 1
        const box = stampSize * scalePct
        const shift = (stampSize - box) / 2
        const badge = Math.max(6, Math.round(stampSize * 0.22))
        // Same gift badge the server draws (orange disc, white star, top-right corner),
        // as a sibling so it keeps its own opacity while the empty stamp is faded.
        const badgeEl =
          isSpecial && !specialUrl ? (
            <svg
              aria-hidden="true"
              className="absolute pointer-events-none"
              style={{
                left: (x2 + stampSize - badge * 1.9) * scale.x,
                top: Math.max(0, y2 - badge * 0.1) * scale.y,
                width: badge * 2 * scale.x,
                height: badge * 2 * scale.y,
                opacity: isFilled ? 1 : 0.85,
              }}
              viewBox="0 0 20 20"
            >
              <circle cx="10" cy="10" r="9" fill="#FF4810" stroke="#FFFFFF" strokeWidth="1.5" />
              <polygon
                points="10,4.2 11.4,8.1 15.5,8.1 12.2,10.5 13.5,14.4 10,12 6.5,14.4 7.8,10.5 4.5,8.1 8.6,8.1"
                fill="#FFFFFF"
              />
            </svg>
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
