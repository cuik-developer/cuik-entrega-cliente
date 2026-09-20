"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"

import { Slider } from "@/components/ui/slider"

/** Output size of the cropped photo (16:9). Big enough for the public page and the cashier. */
export const PHOTO_W = 1200
export const PHOTO_H = 675

export type PhotoAdjusterHandle = {
  /** Renders the current framing to a 16:9 PNG. Null if the image is not loaded yet. */
  getBlob: () => Promise<Blob | null>
}

type Props = {
  /** Object URL or same-origin URL of the source image. */
  src: string
  /** Fired the first time the user moves or zooms the photo. */
  onDirty?: () => void
  disabled?: boolean
}

/**
 * Drag to move, slider to zoom, always covering a 16:9 frame. Always live:
 * the photo is draggable as soon as it is shown, no edit mode. The crop is
 * rendered on a canvas by `getBlob()` when the parent saves.
 */
export const PhotoAdjuster = forwardRef<PhotoAdjusterHandle, Props>(function PhotoAdjuster(
  { src, onDirty, disabled },
  ref,
) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1) // 1 = cover exactly
  const [offset, setOffset] = useState({ x: 0, y: 0 }) // px, frame space
  const [frameW, setFrameW] = useState(0)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => {
    setNatural(null)
    const img = new window.Image()
    img.onload = () => {
      imgRef.current = img
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
    img.src = src
    return () => {
      imgRef.current = null
    }
  }, [src])

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth))
    ro.observe(el)
    setFrameW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const frameH = (frameW * PHOTO_H) / PHOTO_W
  // Scale that makes the image cover the frame at zoom 1.
  const cover = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1
  const scale = cover * zoom
  const drawW = natural ? natural.w * scale : 0
  const drawH = natural ? natural.h * scale : 0
  const maxX = Math.max(0, (drawW - frameW) / 2)
  const maxY = Math.max(0, (drawH - frameH) / 2)

  function clamp(o: { x: number; y: number }) {
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    }
  }

  // Keep the image inside the frame when zooming out.
  // biome-ignore lint/correctness/useExhaustiveDependencies: clamp depends on maxX/maxY only
  useEffect(() => {
    setOffset((o) => clamp(o))
  }, [maxX, maxY])

  function onPointerDown(e: React.PointerEvent) {
    if (disabled) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    if (!drag.current.moved) {
      drag.current.moved = true
      onDirty?.()
    }
    setOffset(
      clamp({
        x: drag.current.ox + (e.clientX - drag.current.x),
        y: drag.current.oy + (e.clientY - drag.current.y),
      }),
    )
  }
  function onPointerUp() {
    drag.current = null
  }

  useImperativeHandle(ref, () => ({
    async getBlob() {
      const img = imgRef.current
      if (!img || !natural || !frameW) return null
      const canvas = document.createElement("canvas")
      canvas.width = PHOTO_W
      canvas.height = PHOTO_H
      const ctx = canvas.getContext("2d")
      if (!ctx) return null
      // Same geometry as the preview, scaled from frame px to output px.
      const k = PHOTO_W / frameW
      const dw = drawW * k
      const dh = drawH * k
      const dx = (PHOTO_W - dw) / 2 + offset.x * k
      const dy = (PHOTO_H - dh) / 2 + offset.y * k
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, dx, dy, dw, dh)
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    },
  }))

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border bg-muted cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="img"
        aria-label="Arrastrá para encuadrar la foto"
      >
        {natural && frameW > 0 && (
          // biome-ignore lint/performance/noImgElement: raw <img> keeps the crop math 1:1 with the canvas
          <img
            src={src}
            alt=""
            draggable={false}
            className="absolute max-w-none pointer-events-none"
            style={{
              width: drawW,
              height: drawH,
              left: (frameW - drawW) / 2 + offset.x,
              top: (frameH - drawH) / 2 + offset.y,
            }}
          />
        )}
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/10" />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-10">Zoom</span>
        <Slider
          value={[zoom]}
          min={1}
          max={3}
          step={0.01}
          disabled={disabled}
          onValueChange={(v) => {
            onDirty?.()
            setZoom(v[0] ?? 1)
          }}
          aria-label="Zoom"
          className="flex-1"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Arrastrá la foto para elegir qué parte se ve. Se guarda en 16:9 al guardar el premio.
      </p>
    </div>
  )
})
