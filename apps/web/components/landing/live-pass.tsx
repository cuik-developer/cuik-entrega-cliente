"use client"

import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { useRef } from "react"

/**
 * A real Apple Wallet mockup photo with decorative overlays. Controlled: the
 * parent decides which scene is on. No product logic, no data.
 *
 *   - crossfade: fades `next` (the same pass with one more stamp) over `base`
 *   - scan:      scanning frame + sweeping line over the QR (standard frame only)
 *   - push:      iOS-style banner sliding down over the screen
 *
 * Two photo frames exist: "standard" (2250×2813, phone ≈ 54% of width) and
 * "wide" (El Patrón, 1536×2752, phone ≈ 76% of width). Overlay geometry is a
 * percentage of the image; banner sizes use `--u`, one "phone unit" per frame,
 * so the banner reads the same on both.
 */

export type PushContent = { title: string; body: string; icon: ReactNode; color: string }

export type PassFrame = "standard" | "wide"

const FRAME: Record<PassFrame, { screen: CSSProperties; push: CSSProperties }> = {
  standard: {
    screen: { left: "23.2%", top: "9%", width: "53.7%", height: "26%" },
    push: { left: "4.1%", width: "91.6%", top: "10.4%", "--u": "1cqw" } as CSSProperties,
  },
  wide: {
    screen: { left: "12.1%", top: "6.5%", width: "75.9%", height: "24%" },
    push: { left: "4.1%", width: "91.6%", top: "28%", "--u": "1.41cqw" } as CSSProperties,
  },
}

export function LivePass({
  base,
  next,
  alt,
  frame = "standard",
  crossfade = false,
  scan = false,
  push = null,
  priority = false,
}: {
  base: string
  next?: string
  alt: string
  frame?: PassFrame
  crossfade?: boolean
  scan?: boolean
  push?: PushContent | null
  priority?: boolean
}) {
  // Keep the last push content mounted while the banner slides out.
  const lastPush = useRef<PushContent | null>(null)
  if (push) lastPush.current = push
  const content = lastPush.current
  const f = FRAME[frame]

  return (
    <div className="lp-root relative w-full">
      <style>{`
        .lp-root { container-type: inline-size; --lp-ease-out: cubic-bezier(0.23, 1, 0.32, 1); --lp-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1); }

        /* Crossfade: the "after" photo sits on top and fades in */
        .lp-next { position: absolute; inset: 0; opacity: 0; transition: opacity 320ms var(--lp-ease-out); will-change: opacity; }
        .lp-next.is-on { opacity: 1; }

        /* Scan frame over the QR: four corner brackets + a line sweeping top → bottom */
        .lp-scan { position: absolute; left: 42.4%; top: 46.4%; width: 15.2%; aspect-ratio: 1; opacity: 0; transform: scale(1.08); transition: opacity 200ms var(--lp-ease-out), transform 260ms var(--lp-ease-out); pointer-events: none; }
        .lp-scan.is-on { opacity: 1; transform: scale(1); }
        .lp-scan i { display: block; position: absolute; width: 22%; height: 22%; border: 0.6cqw solid #0e70db; border-radius: 0.6cqw; }
        .lp-scan i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; }
        .lp-scan i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; }
        .lp-scan i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; }
        .lp-scan i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; }
        .lp-scanline { position: absolute; left: 6%; right: 6%; top: 0; height: 0.5cqw; border-radius: 9999px; background: #0e70db; box-shadow: 0 0 1.2cqw rgba(14, 112, 219, 0.7); }
        .lp-scan.is-on .lp-scanline { animation: lp-sweep 1.4s linear infinite; }
        @keyframes lp-sweep { from { transform: translateY(0); } to { transform: translateY(14.4cqw); } }

        /* Screen clip so the banner enters/leaves through the top of the screen, never over the bezel */
        .lp-screen { position: absolute; overflow: hidden; pointer-events: none; }
        /* iOS-style banner: enters and leaves through the top of the screen */
        .lp-push { position: absolute; display: flex; align-items: flex-start; gap: calc(2.2 * var(--u)); padding: calc(2.2 * var(--u)) calc(2.6 * var(--u)); border-radius: calc(3.4 * var(--u)); background: rgba(255,255,255,0.86); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 calc(2 * var(--u)) calc(5 * var(--u)) rgba(15, 23, 42, 0.18); opacity: 0; transform: translateY(-140%); transition: opacity 220ms var(--lp-ease-out), transform 380ms var(--lp-ease-drawer); will-change: transform, opacity; pointer-events: none; }
        .lp-push.is-on { opacity: 1; transform: translateY(0); }
        .lp-push-icon { flex: none; width: calc(8.6 * var(--u)); height: calc(8.6 * var(--u)); border-radius: calc(2.2 * var(--u)); color: #fff; display: grid; place-items: center; }
        .lp-push-icon svg { width: calc(5 * var(--u)); height: calc(5 * var(--u)); }
        .lp-push-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--u); font-size: calc(2.7 * var(--u)); line-height: 1.2; }
        .lp-push-title { font-weight: 700; color: #111827; }
        .lp-push-time { color: #6b7280; font-size: calc(2.3 * var(--u)); }
        .lp-push-body { margin-top: calc(0.5 * var(--u)); font-size: calc(2.5 * var(--u)); line-height: 1.3; color: #1f2937; }

        @media (prefers-reduced-motion: reduce) {
          .lp-scan { transform: scale(1); transition: opacity 200ms ease; }
          .lp-scan.is-on .lp-scanline { animation: none; top: 50%; }
          .lp-push { transform: translateY(0); transition: opacity 200ms ease; }
        }
      `}</style>

      <Image
        src={base}
        alt={alt}
        width={564}
        height={1002}
        className="w-full h-auto drop-shadow-2xl"
        priority={priority}
      />
      {next && (
        <div className={`lp-next ${crossfade ? "is-on" : ""}`} aria-hidden="true">
          <Image
            src={next}
            alt=""
            width={564}
            height={1002}
            className="w-full h-auto drop-shadow-2xl"
            priority={priority}
            loading={priority ? undefined : "eager"}
          />
        </div>
      )}

      {/* QR scan frame */}
      <div className={`lp-scan ${scan ? "is-on" : ""}`} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <div className="lp-scanline" />
      </div>

      {/* Push banner */}
      <div className="lp-screen" style={f.screen} aria-hidden="true">
        <div className={`lp-push ${push ? "is-on" : ""}`} style={f.push}>
          {content && (
            <>
              <div className="lp-push-icon" style={{ background: content.color }}>
                {content.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="lp-push-head">
                  <span className="lp-push-title">{content.title}</span>
                  <span className="lp-push-time">ahora</span>
                </div>
                <p className="lp-push-body">{content.body}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
