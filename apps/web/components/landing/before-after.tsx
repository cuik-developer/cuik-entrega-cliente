"use client"

import { BarChart3, Palette, PawPrint, RefreshCw, Smartphone, Wallet } from "lucide-react"
import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "El antes y el ahora": the worn cardboard card lifts, flips in 3D and comes
 * back as the digital pass in Apple Wallet. While it flips, the cardboard's
 * problems get struck through; once the pass is up, its advantages appear one
 * by one and the pass plays its loop (2 → 3 visits, visit push).
 *
 * Auto-plays and loops while in view. Transform + opacity only; the flip is a
 * single rotateY on a wrapper with two backface-hidden faces.
 */

type Phase = "card" | "lift" | "flip" | "pass" | "visit" | "push" | "hold" | "reset"

const TIMELINE: { phase: Phase; ms: number }[] = [
  { phase: "card", ms: 2200 },
  { phase: "lift", ms: 450 },
  { phase: "flip", ms: 900 },
  { phase: "pass", ms: 1100 },
  { phase: "visit", ms: 1200 },
  { phase: "push", ms: 2800 },
  { phase: "hold", ms: 1800 },
  { phase: "reset", ms: 420 },
]

const FLIPPED: Phase[] = ["flip", "pass", "visit", "push", "hold"]
const PROS_ON: Phase[] = ["pass", "visit", "push", "hold"]

const CONS = ["Se pierde o se moja", "Cualquiera falsifica el sello", "No sabes quién volvió"]

const PROS: { icon: ReactNode; text: string }[] = [
  { icon: <Smartphone className="w-4 h-4" />, text: "Siempre en su teléfono" },
  { icon: <RefreshCw className="w-4 h-4" />, text: "Se actualiza sola en cada visita" },
  { icon: <BarChart3 className="w-4 h-4" />, text: "Data de cada cliente en tiempo real" },
  { icon: <Wallet className="w-4 h-4" />, text: "Apple Wallet y Google Wallet" },
  { icon: <Palette className="w-4 h-4" />, text: "Con el diseño de tu marca" },
]

const VISIT_PUSH: PushContent = {
  title: "Mascota Veloz",
  body: "¡Visita registrada, Diego! 🐾 Te faltan 3 visitas para tu premio.",
  icon: <PawPrint />,
  color: "#d9542b",
}

export function BeforeAfter({ active }: { active: boolean }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), TIMELINE[step].ms)
    return () => clearTimeout(t)
  }, [active, step])

  const phase = TIMELINE[step].phase
  const flipped = FLIPPED.includes(phase)
  const prosOn = PROS_ON.includes(phase)
  const resetting = phase === "reset"

  return (
    <div className={`ba relative ${resetting ? "no-anim" : ""}`}>
      <style>{`
        .ba { --ba-ease-out: cubic-bezier(0.23, 1, 0.32, 1); --ba-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1); }

        /* Loop reset: the stage fades out, then everything snaps back without transitions */
        .ba-stage { perspective: 1400px; transition: opacity 380ms var(--ba-ease-out); }
        .ba-stage.is-reset { opacity: 0; }
        .ba.no-anim .ba-flip, .ba.no-anim .ba-lift, .ba.no-anim .ba-pro, .ba.no-anim .ba-con, .ba.no-anim .ba-con i, .ba.no-anim .ba-cap > span { transition: none !important; }

        /* Lift: the card rises before flipping */
        .ba-lift { transform: translateY(0) scale(1); transition: transform 450ms var(--ba-ease-out); }
        .ba-lift.is-up { transform: translateY(-10px) scale(1.04); }

        /* Flip: one rotateY on the wrapper; both faces backface-hidden */
        .ba-flip { position: relative; transform-style: preserve-3d; transform: rotateY(0deg); transition: transform 900ms var(--ba-ease-in-out); will-change: transform; }
        .ba-flip.is-flipped { transform: rotateY(180deg); }
        .ba-face { position: absolute; inset: 0; display: grid; place-items: center; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .ba-face-back { transform: rotateY(180deg); }

        /* Cardboard: zoomed crop of the photo, warm shadow */
        .ba-card { width: 80%; aspect-ratio: 1.62; border-radius: 14px; overflow: hidden; box-shadow: 0 30px 50px -22px rgba(60, 40, 20, 0.6), 0 0 0 1px rgba(60, 40, 20, 0.08); transform: rotate(-3deg); }
        .ba-card img { transform: scale(1.42); transform-origin: 50% 48%; }

        /* Cons: strike-through draws left → right, text dims */
        .ba-con { position: relative; transition: opacity 320ms var(--ba-ease-out); }
        .ba-con.is-struck { opacity: 0.45; }
        .ba-con i { position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: #b4432a; transform: scaleX(0); transform-origin: left center; transition: transform 320ms var(--ba-ease-out); transition-delay: calc(var(--i) * 90ms); }
        .ba-con.is-struck i { transform: scaleX(1); }

        /* Pros: rise in one by one */
        .ba-pro { opacity: 0; transform: translateY(10px); transition: opacity 320ms var(--ba-ease-out), transform 320ms var(--ba-ease-out); }
        .ba-pro.is-on { opacity: 1; transform: translateY(0); transition-delay: calc(var(--i) * 140ms); }

        /* Caption under the stage */
        .ba-cap { display: grid; }
        .ba-cap > span { grid-area: 1 / 1; opacity: 0; transform: translateY(6px); transition: opacity 260ms var(--ba-ease-out), transform 260ms var(--ba-ease-out); }
        .ba-cap > span.is-on { opacity: 1; transform: translateY(0); }

        @media (prefers-reduced-motion: reduce) {
          .ba-lift, .ba-lift.is-up { transform: none; transition: none; }
          .ba-flip, .ba-flip.is-flipped { transform: none; transition: none; }
          .ba-face { transition: opacity 300ms ease; }
          .ba-flip.is-flipped .ba-face-front { opacity: 0; }
          .ba-face-back { transform: none; opacity: 0; }
          .ba-flip.is-flipped .ba-face-back { opacity: 1; }
          .ba-pro, .ba-cap > span { transform: none; }
          .ba-con i { transition: none; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
            El antes y el ahora
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            La misma tarjeta de sellos que tus clientes ya conocen, ahora en su Wallet: sin cartón,
            sin perderse y con data para ti.
          </p>
        </div>

        <div className="grid gap-10 lg:gap-8 items-center lg:grid-cols-[1fr_auto_1fr]">
          {/* Antes — cons */}
          <div className="order-2 lg:order-1 lg:justify-self-end">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Antes</div>
            <ul className="space-y-3">
              {CONS.map((c, i) => (
                <li key={c}>
                  <span
                    className={`ba-con inline-block text-lg text-gray-700 ${flipped ? "is-struck" : ""}`}
                    style={{ "--i": i } as CSSProperties}
                  >
                    {c}
                    <i aria-hidden="true" />
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Stage */}
          <div className="order-1 lg:order-2 justify-self-center">
            <div className={`ba-stage relative w-[300px] sm:w-[360px] ${resetting ? "is-reset" : ""}`}>
              {/* glow, same language as the hero */}
              <div className="absolute -inset-10 rounded-full bg-[#0e70db]/[0.06] blur-3xl pointer-events-none" />
              <div className={`ba-lift relative ${phase === "lift" ? "is-up" : ""}`}>
                <div className={`ba-flip aspect-[4/5] ${flipped ? "is-flipped" : ""}`}>
                  <div className="ba-face ba-face-front">
                    <div className="ba-card relative">
                      <Image
                        src="/landing/old-stamp-card.png"
                        alt="Tarjeta de sellos de cartón desgastada"
                        fill
                        className="object-cover"
                      />
                    </div>
                  </div>
                  <div className="ba-face ba-face-back">
                    <div className="w-full">
                      <LivePass
                        base="/landing/mockup-mascotaveloz-2.png"
                        next="/landing/mockup-mascotaveloz-3.png"
                        alt="Pase de fidelización Mascota Veloz en Apple Wallet"
                        crossfade={phase === "visit" || phase === "push" || phase === "hold"}
                        push={phase === "push" ? VISIT_PUSH : null}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="ba-cap text-center mt-2 text-sm font-medium">
                <span className={`text-gray-400 ${flipped ? "" : "is-on"}`}>Tarjeta de cartón</span>
                <span className={`text-[#0e70db] ${flipped ? "is-on" : ""}`}>
                  Pase digital en Apple Wallet
                </span>
              </div>
            </div>
          </div>

          {/* Ahora — pros */}
          <div className="order-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[#0e70db] mb-4">
              Ahora con Cuik
            </div>
            <ul className="space-y-3">
              {PROS.map((p, i) => (
                <li
                  key={p.text}
                  className={`ba-pro flex items-center gap-3 ${prosOn ? "is-on" : ""}`}
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className="w-8 h-8 rounded-lg bg-blue-50 text-[#0e70db] flex items-center justify-center flex-shrink-0">
                    {p.icon}
                  </span>
                  <span className="text-lg text-gray-900 font-medium">{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
