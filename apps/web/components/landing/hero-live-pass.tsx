"use client"

import { Cake } from "lucide-react"
import Image from "next/image"
import { useEffect, useState } from "react"

/**
 * Hero "live pass": the real Gradual Café mockup photo with three animated
 * overlays positioned by percentage of the image (measured on the PNG):
 *   - the 4th stamp being filled after a visit
 *   - the visit counter flipping 3 → 4
 *   - an iOS-style birthday push sliding down over the screen
 *
 * Purely decorative: no product logic, no data. Scenes loop while the hero is
 * in view and pause otherwise. Transitions (not keyframes) so a pause/resume
 * retargets instead of snapping.
 */

type Scene = "idle" | "stamped" | "push" | "reset"

// Scene → how long it stays on screen before the next one.
const TIMELINE: { scene: Scene; ms: number }[] = [
  { scene: "idle", ms: 1400 },
  { scene: "stamped", ms: 2600 },
  { scene: "push", ms: 3400 },
  { scene: "reset", ms: 1200 },
]

export function HeroLivePass({ active }: { active: boolean }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), TIMELINE[step].ms)
    return () => clearTimeout(t)
  }, [active, step])

  const scene = TIMELINE[step].scene
  const stamped = scene === "stamped" || scene === "push"
  const pushVisible = scene === "push"

  return (
    <div className="lp-root relative w-full">
      <style>{`
        .lp-root { container-type: inline-size; --lp-ease-out: cubic-bezier(0.23, 1, 0.32, 1); --lp-ease-drawer: cubic-bezier(0.32, 0.72, 0, 1); }

        /* 4th stamp: filled bean, pops in from 60% */
        .lp-stamp { position: absolute; left: 57.3%; top: 27.6%; width: 7.6%; aspect-ratio: 1; border-radius: 9999px; background: #e26534; display: grid; place-items: center; opacity: 0; transform: scale(0.6); transition: opacity 180ms var(--lp-ease-out), transform 320ms var(--lp-ease-out); will-change: transform, opacity; }
        .lp-stamp.is-on { opacity: 1; transform: scale(1); }

        /* Counter patch: same navy as the pass, digits slide like an odometer */
        .lp-counter { position: absolute; left: 66%; top: 21.7%; width: 4.2%; height: 2.6cqw; background: rgb(33, 44, 63); overflow: hidden; color: #fff; font-weight: 400; font-size: 2.2cqw; line-height: 2.6cqw; text-align: right; }
        .lp-counter-track { display: flex; flex-direction: column; transform: translateY(0); transition: transform 260ms var(--lp-ease-out); }
        .lp-counter-track > span { display: block; height: 2.6cqw; }
        .lp-counter.is-on .lp-counter-track { transform: translateY(-50%); }

        /* Screen clip so the banner enters/leaves through the top of the screen, never over the bezel */
        .lp-screen { position: absolute; left: 23.2%; top: 9%; width: 53.7%; height: 26%; overflow: hidden; pointer-events: none; }
        /* iOS-style banner: enters and leaves through the top of the screen */
        .lp-push { position: absolute; left: 4.1%; width: 91.6%; top: 10.4%; display: flex; align-items: flex-start; gap: 2.2cqw; padding: 2.2cqw 2.6cqw; border-radius: 3.4cqw; background: rgba(255,255,255,0.86); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 2cqw 5cqw rgba(15, 23, 42, 0.18); opacity: 0; transform: translateY(-140%); transition: opacity 220ms var(--lp-ease-out), transform 380ms var(--lp-ease-drawer); will-change: transform, opacity; pointer-events: none; }
        .lp-push.is-on { opacity: 1; transform: translateY(0); }
        .lp-push-icon { flex: none; width: 8.6cqw; height: 8.6cqw; border-radius: 2.2cqw; background: #e26534; color: #fff; display: grid; place-items: center; }
        .lp-push-icon svg { width: 5cqw; height: 5cqw; }
        .lp-push-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1cqw; font-size: 2.7cqw; line-height: 1.2; }
        .lp-push-title { font-weight: 700; color: #111827; }
        .lp-push-time { color: #6b7280; font-size: 2.3cqw; }
        .lp-push-body { margin-top: 0.5cqw; font-size: 2.5cqw; line-height: 1.3; color: #1f2937; }

        @media (prefers-reduced-motion: reduce) {
          .lp-stamp { transform: scale(1); transition: opacity 200ms ease; }
          .lp-counter-track { transition: none; }
          .lp-push { transform: translateY(0); transition: opacity 200ms ease; }
        }
      `}</style>

      <Image
        src="/landing/mockup-gradual.png"
        alt="Pase de fidelización Gradual Café en Apple Wallet"
        width={564}
        height={1002}
        className="w-full h-auto drop-shadow-2xl"
        priority
      />

      {/* 4th stamp */}
      <div className={`lp-stamp ${stamped ? "is-on" : ""}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="w-[55%] h-[55%]" fill="none">
          <title>Sello</title>
          <ellipse cx="12" cy="12" rx="5.2" ry="8.2" fill="#fff" transform="rotate(28 12 12)" />
          <path
            d="M9.4 5.6c2.6 2.2 2.6 10.6 5.2 12.8"
            stroke="#e26534"
            strokeWidth="1.6"
            strokeLinecap="round"
            transform="rotate(28 12 12)"
          />
        </svg>
      </div>

      {/* Visit counter 3 → 4 */}
      <div className={`lp-counter ${stamped ? "is-on" : ""}`} aria-hidden="true">
        <div className="lp-counter-track">
          <span>3</span>
          <span>4</span>
        </div>
      </div>

      {/* Birthday push */}
      <div className="lp-screen" aria-hidden="true">
        <div className={`lp-push ${pushVisible ? "is-on" : ""}`}>
          <div className="lp-push-icon">
            <Cake />
          </div>
          <div className="min-w-0 flex-1">
            <div className="lp-push-head">
              <span className="lp-push-title">Gradual Café</span>
              <span className="lp-push-time">ahora</span>
            </div>
            <p className="lp-push-body">¡Feliz cumpleaños, Francesco! 🎂 Hoy tu Mocha es gratis.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
