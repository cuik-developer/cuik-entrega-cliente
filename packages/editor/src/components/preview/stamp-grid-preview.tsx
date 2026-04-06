"use client"

import { useEffect, useRef, useState } from "react"
import type { PassDesignConfigV2 } from "../../types"

// Strip image is 750x246 at @2x
const STRIP_2X_WIDTH = 750
const STRIP_2X_HEIGHT = 246

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

  const { gridCols, stampSize, filledOpacity, emptyOpacity } = stampsConfig
  const totalStamps = stampsConfig.gridCols * stampsConfig.gridRows
  const rowOffsets = stampsConfig.rowOffsets ?? []

  // All coordinates are in @2x space, scaled by container ratio
  const oX = stampsConfig.offsetX ?? 197
  const oY = stampsConfig.offsetY ?? 23
  const gX = stampsConfig.gapX ?? 98
  const gY = stampsConfig.gapY ?? 73

  return (
    <div ref={containerRef} className="absolute inset-0">
      {Array.from({ length: totalStamps }, (_, i) => {
        const row = Math.floor(i / gridCols)
        const col = i % gridCols
        const rowOff = rowOffsets[row] ?? { x: 0, y: 0 }
        const x2 = oX + col * gX + rowOff.x
        const y2 = oY + row * gY + rowOff.y
        const isFilled = i < filledCount
        const opacity = isFilled ? filledOpacity : emptyOpacity

        return (
          <div
            key={`stamp-${row}-${col}`}
            className="absolute flex items-center justify-center"
            style={{
              left: x2 * scale.x,
              top: y2 * scale.y,
              width: stampSize * scale.x,
              height: stampSize * scale.y,
              opacity,
            }}
          >
            {stampImageUrl ? (
              // biome-ignore lint/performance/noImgElement: standalone package without Next.js
              <img
                src={stampImageUrl}
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
        )
      })}
    </div>
  )
}
