"use client"

import { Check, Gift, X } from "lucide-react"
import Image from "next/image"
import type { CSSProperties } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "El antes y el ahora": a segmented control that swaps two stacked panels.
 *   - Antes: the worn cardboard card, warm paper tones.
 *   - Ahora: dark panel with the live Gradual pass (7 → 8 stamps + reward push).
 *
 * Auto-plays once: starts on "Antes" and, 2.4 s after entering view, flips to
 * "Ahora" with a small confetti burst. After that the visitor is in control.
 * Panels crossfade with a short horizontal slide (before exits left, after
 * enters from the right); list items stagger 40 ms. Transitions, not keyframes,
 * so rapid toggling retargets instead of restarting.
 */

type View = "before" | "after"

const BEFORE = [
  "Se pierde entre bolsillos",
  "No genera data útil",
  "Cero tecnología",
  "Diseño poco profesional",
  "No se puede actualizar",
]

const AFTER = [
  "Siempre en su teléfono",
  "Data accionable en tiempo real",
  "Tecnología Apple & Google Wallet",
  "Diseño profesional personalizado",
  "Se actualiza automáticamente",
]

const REWARD_PUSH: PushContent = {
  title: "Gradual Café",
  body: "¡Completaste tu tarjeta! 🎁 Tu café gratis te espera.",
  icon: <Gift />,
  color: "#e26534",
}

// Live pass loop inside the "Ahora" panel.
type Scene = "idle" | "visit" | "push" | "reset"
const LOOP: { scene: Scene; ms: number }[] = [
  { scene: "idle", ms: 1400 },
  { scene: "visit", ms: 1200 },
  { scene: "push", ms: 2600 },
  { scene: "reset", ms: 1000 },
]

const CONFETTI_COLORS = ["#0e70db", "#ff4810", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"]

export function BeforeAfter({ active }: { active: boolean }) {
  const [view, setView] = useState<View>("before")
  const [autoPlayed, setAutoPlayed] = useState(false)
  const [burst, setBurst] = useState(0) // > 0 mounts a confetti burst; bumped per burst
  const [step, setStep] = useState(0)

  const goAfter = () => {
    if (view === "after") return
    setView("after")
    setBurst((b) => b + 1)
  }

  // Auto-play once when the section comes into view.
  useEffect(() => {
    if (!active || autoPlayed) return
    const t = setTimeout(() => {
      setAutoPlayed(true)
      setView((v) => {
        if (v === "after") return v
        setBurst((b) => b + 1)
        return "after"
      })
    }, 2400)
    return () => clearTimeout(t)
  }, [active, autoPlayed])

  // Confetti self-clears after its animation.
  useEffect(() => {
    if (!burst) return
    const t = setTimeout(() => setBurst(0), 1800)
    return () => clearTimeout(t)
  }, [burst])

  // Live pass loop, only while "Ahora" is showing and the section is in view.
  const looping = active && view === "after"
  useEffect(() => {
    if (!looping) {
      setStep(0)
      return
    }
    const t = setTimeout(() => setStep((s) => (s + 1) % LOOP.length), LOOP[step].ms)
    return () => clearTimeout(t)
  }, [looping, step])
  const scene = LOOP[step].scene

  const isAfter = view === "after"

  return (
    <div className="relative">
      <style>{`
        .ba { --ba-ease-out: cubic-bezier(0.23, 1, 0.32, 1); }

        /* Segmented control: one sliding indicator behind two equal buttons */
        .ba-seg { position: relative; display: grid; grid-template-columns: 1fr 1fr; }
        .ba-ind { position: absolute; top: 0; left: 0; width: 50%; height: 100%; border-radius: 0.5rem; background: #111827; box-shadow: 0 4px 12px rgba(17, 24, 39, 0.18); transform: translateX(0); transition: transform 220ms var(--ba-ease-out), background-color 220ms ease, box-shadow 220ms ease; will-change: transform; }
        .ba-ind.is-after { transform: translateX(100%); background: #0e70db; box-shadow: 0 4px 12px rgba(14, 112, 219, 0.28); }
        .ba-btn { position: relative; z-index: 1; transition: color 200ms ease; }

        /* Panels stacked in the same grid cell; crossfade + short slide */
        .ba-stack { display: grid; }
        .ba-stack > * { grid-area: 1 / 1; }
        .ba-panel { opacity: 0; pointer-events: none; transition: opacity 260ms var(--ba-ease-out), transform 260ms var(--ba-ease-out); will-change: transform, opacity; }
        .ba-panel.is-on { opacity: 1; pointer-events: auto; transform: translateX(0); }
        .ba-panel.from-left { transform: translateX(-24px); }
        .ba-panel.from-right { transform: translateX(24px); }
        .ba-panel.is-on.from-left, .ba-panel.is-on.from-right { transform: translateX(0); }

        /* Items: enter staggered, leave together */
        .ba-item { opacity: 0; transform: translateY(6px); transition: opacity 220ms var(--ba-ease-out), transform 220ms var(--ba-ease-out); }
        .ba-panel.is-on .ba-item { opacity: 1; transform: translateY(0); transition-delay: calc(60ms + var(--i) * 40ms); }

        /* Confetti: one short burst, transform + opacity only */
        .ba-confetti { position: absolute; left: 50%; top: 22%; pointer-events: none; animation: ba-spread 1.6s cubic-bezier(0.23, 1, 0.32, 1) forwards; }
        @keyframes ba-spread { 0% { transform: translate(0, 0) scale(0.6); opacity: 1; } 25% { transform: translate(var(--cx), var(--cy)) scale(1); opacity: 1; } 100% { transform: translate(var(--cx), calc(var(--cy) + 220px)) rotate(540deg) scale(0.4); opacity: 0; } }

        @media (prefers-reduced-motion: reduce) {
          .ba-ind { transition: background-color 220ms ease; }
          .ba-panel, .ba-panel.from-left, .ba-panel.from-right { transform: none; transition: opacity 220ms ease; }
          .ba-item { transform: none; transition: opacity 220ms ease; }
          .ba-panel.is-on .ba-item { transition-delay: 0ms; }
          .ba-confetti { display: none; }
        }
      `}</style>

      {burst > 0 && (
        <div key={burst} className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i / 24) * Math.PI * 2
            const r = 140 + (i % 4) * 45
            const style = {
              width: 6 + (i % 3) * 3,
              height: 6 + (i % 3) * 3,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              borderRadius: i % 2 ? "9999px" : "2px",
              animationDelay: `${(i % 5) * 60}ms`,
              "--cx": `${Math.cos(angle) * r}px`,
              "--cy": `${Math.sin(angle) * r * 0.5 - 60}px`,
            } as CSSProperties
            // biome-ignore lint/suspicious/noArrayIndexKey: static particles
            return <span key={i} className="ba-confetti" style={style} />
          })}
        </div>
      )}

      <div className="ba max-w-4xl mx-auto px-4 sm:px-6 relative">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 text-center mb-3 tracking-tight">
          El antes y el ahora
        </h2>
        <p className="text-gray-500 text-lg text-center mb-8">
          La misma tarjeta de sellos, sin cartón y sin perderse
        </p>

        <div className="flex justify-center mb-10">
          <div className="ba-seg bg-white rounded-xl p-1 border border-gray-200 shadow-sm w-[300px]">
            <div className={`ba-ind ${isAfter ? "is-after" : ""}`} aria-hidden="true" />
            <button
              type="button"
              onClick={() => setView("before")}
              aria-pressed={!isAfter}
              className={`ba-btn px-4 py-2.5 rounded-lg text-sm font-semibold ${!isAfter ? "text-white" : "text-gray-500"}`}
            >
              Antes
            </button>
            <button
              type="button"
              onClick={goAfter}
              aria-pressed={isAfter}
              className={`ba-btn px-4 py-2.5 rounded-lg text-sm font-semibold ${isAfter ? "text-white" : "text-gray-500"}`}
            >
              Ahora con Cuik
            </button>
          </div>
        </div>

        <div className="ba-stack">
          {/* Antes */}
          <div
            className={`ba-panel from-left rounded-2xl border border-[#e7dcc6] bg-[#f6efe2] overflow-hidden ${!isAfter ? "is-on" : ""}`}
            aria-hidden={isAfter}
          >
            <div className="h-full flex items-center p-8 sm:p-10">
              <div className="w-full grid md:grid-cols-2 gap-10 items-center">
                <div className="space-y-4">
                  {BEFORE.map((item, i) => (
                    <div
                      key={item}
                      className="ba-item flex items-center gap-3"
                      style={{ "--i": i } as CSSProperties}
                    >
                      <div className="w-6 h-6 rounded-full bg-[#e9cfc4] flex items-center justify-center flex-shrink-0">
                        <X className="w-3.5 h-3.5 text-[#b4432a]" />
                      </div>
                      <span className="text-[#5b4a3a]">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center">
                  <div className="relative w-64 h-44 rounded-xl overflow-hidden shadow-[0_18px_40px_-18px_rgba(60,40,20,0.55)] -rotate-3">
                    <Image
                      src="/landing/old-stamp-card.png"
                      alt="Tarjeta de sellos de cartón desgastada"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ahora */}
          <div
            className={`ba-panel from-right rounded-2xl bg-[#0c3d7a] overflow-hidden ${isAfter ? "is-on" : ""}`}
            aria-hidden={!isAfter}
          >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(14,112,219,0.35),transparent_55%)]" />
            <div className="relative p-8 sm:p-10">
              <div className="grid md:grid-cols-2 gap-10 items-center">
                <div className="space-y-4">
                  {AFTER.map((item, i) => (
                    <div
                      key={item}
                      className="ba-item flex items-center gap-3"
                      style={{ "--i": i } as CSSProperties}
                    >
                      <div className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <span className="text-white font-medium">{item}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-center">
                  <div className="w-[260px]">
                    <LivePass
                      base="/landing/mockup-gradual-7.png"
                      next="/landing/mockup-gradual-8.png"
                      alt="Pase de fidelización Gradual Café en Apple Wallet"
                      crossfade={scene === "visit" || scene === "push"}
                      push={scene === "push" ? REWARD_PUSH : null}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
