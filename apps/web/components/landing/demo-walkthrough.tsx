"use client"

import { CheckCircle2, Gift, QrCode } from "lucide-react"
import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "Mira cómo funciona tu pase": three steps synchronized with the live pass.
 *
 *   1. A real moment at the counter (photo): the customer holds up their
 *      phone; the pass phone rises into the scene. Nothing drawn.
 *   2. The cashier scans the pass at the register → the visit is stamped.
 *   3. The card is complete → the reward push.
 *
 * Auto-advances every STEP_MS while in view; clicking a step jumps to it.
 */

const STEP_MS = 3400

const REWARD_PUSH: PushContent = {
  title: "Gradual Café",
  body: "¡Completaste tu tarjeta! 🎁 Tu café gratis te espera.",
  icon: <Gift />,
  color: "#e26534",
}

const STEPS: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <QrCode className="w-7 h-7" />,
    title: "Escanea el QR de tu local",
    desc: "Tu cliente escanea el QR del mostrador y en segundos tiene su pase en la Wallet. Sin apps, sin formularios.",
  },
  {
    icon: <CheckCircle2 className="w-7 h-7" />,
    title: "Se registra la visita",
    desc: "En caja escanean el pase y el sello aparece al instante en el teléfono del cliente.",
  },
  {
    icon: <Gift className="w-7 h-7" />,
    title: "Completa y gana",
    desc: "Al completar todos los sellos, el premio se desbloquea y le llega una notificación.",
  },
]

export function DemoWalkthrough({ active }: { active: boolean }) {
  const [step, setStep] = useState(0)
  // Bumped on manual clicks so the auto-advance timer restarts from the click.
  const [tick, setTick] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` intentionally restarts the timer on manual clicks
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS)
    return () => clearTimeout(t)
  }, [active, step, tick])

  return (
    <div className="dw flex flex-col lg:flex-row items-center gap-14">
      <style>{`
        .dw { --dw-out: cubic-bezier(0.23, 1, 0.32, 1); --dw-drawer: cubic-bezier(0.32, 0.72, 0, 1); }
        .dw-step { opacity: 0.45; transition: opacity 200ms var(--dw-out); }
        .dw-step.is-on, .dw-step:focus-visible { opacity: 1; }
        @media (hover: hover) and (pointer: fine) { .dw-step:hover { opacity: 0.8; } .dw-step.is-on:hover { opacity: 1; } }
        .dw-icon { transform: scale(0.94); transition: transform 200ms var(--dw-out), box-shadow 200ms var(--dw-out); }
        .dw-step.is-on .dw-icon { transform: scale(1); }
        .dw-bar { height: 3px; border-radius: 9999px; background: #dbeafe; overflow: hidden; }
        .dw-bar > i { display: block; height: 100%; background: #0e70db; transform: scaleX(0); transform-origin: left; }
        .dw-step.is-on.is-running .dw-bar > i { animation: dw-fill ${STEP_MS}ms linear forwards; }
        @keyframes dw-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        /* Stage: the counter photo behind, the pass phone in front. Steps 2–3 keep the phone alone. */
        .dw-stage { container-type: inline-size; }
        .dw-photo { position: absolute; inset: 0; border-radius: 1.5rem; overflow: hidden; box-shadow: 0 30px 60px -30px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.06); transform: scale(1); opacity: 1; transition: opacity 500ms var(--dw-out), transform 800ms var(--dw-drawer); }
        .dw-photo img { object-fit: cover; object-position: 46% 42%; }
        .dw-photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(15,23,42,0) 55%, rgba(15,23,42,0.35) 100%); }
        .dw-photo.is-off { opacity: 0; transform: scale(0.96); }
        .dw-passphone { position: absolute; right: 0; bottom: -6%; width: 54%; z-index: 2; transform-origin: 50% 100%; transition: transform 800ms var(--dw-drawer), width 800ms var(--dw-drawer), right 800ms var(--dw-drawer), bottom 800ms var(--dw-drawer); }
        .dw-passphone.is-arrive { animation: dw-arrive 900ms var(--dw-drawer) both; animation-delay: 250ms; }
        @keyframes dw-arrive { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: none; } }
        .dw-passphone.is-solo { right: 16%; bottom: 2%; width: 68%; }
        .dw-cap { position: absolute; left: 1.25rem; bottom: 1.25rem; z-index: 3; display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.75rem; border-radius: 9999px; background: rgba(255,255,255,0.92); color: #0f172a; font-size: 0.75rem; font-weight: 700; box-shadow: 0 10px 30px -12px rgba(15,23,42,0.4); opacity: 0; transform: translateY(6px); transition: opacity 300ms var(--dw-out), transform 400ms var(--dw-out); transition-delay: 700ms; }
        .dw-cap.is-on { opacity: 1; transform: none; }
        .dw-cap i { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }

        @media (prefers-reduced-motion: reduce) {
          .dw-icon { transform: none; transition: none; }
          .dw-step.is-on.is-running .dw-bar > i { animation: none; transform: scaleX(1); }
          .dw-photo, .dw-passphone, .dw-cap { transition: opacity 250ms ease; }
          .dw-photo.is-off { transform: none; }
          .dw-passphone.is-arrive { animation: none; }
        }
      `}</style>

      {/* Stage */}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-8 bg-[#0e70db]/[0.04] rounded-full blur-2xl" />
        <div className="dw-stage relative w-[340px] sm:w-[420px] aspect-[4/5]">
          {/* Step 1: the real moment at the counter */}
          <div className={`dw-photo ${step === 0 ? "" : "is-off"}`} aria-hidden={step !== 0}>
            <Image
              src="/landing/hero-cafe.png"
              alt="Cliente mostrando su pase en el mostrador de una cafetería"
              fill
              sizes="420px"
            />
          </div>
          <div className={`dw-cap ${step === 0 ? "is-on" : ""}`} aria-hidden="true">
            <i /> Pase listo en segundos
          </div>

          {/* The pass in the Wallet */}
          <div className={`dw-passphone ${step === 0 ? "is-arrive" : "is-solo"}`}>
            <LivePass
              base="/landing/mockup-gradual-7.png"
              next="/landing/mockup-gradual-8.png"
              alt="Pase de fidelización Gradual Café en Apple Wallet"
              scan={step === 1}
              crossfade={step >= 1}
              push={step === 2 ? REWARD_PUSH : null}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 grid sm:grid-cols-3 gap-8">
        {STEPS.map((item, i) => {
          const n = i + 1
          const on = step === i
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => {
                setStep(i)
                setTick((t) => t + 1)
              }}
              aria-pressed={on}
              className={`dw-step text-center lg:text-left space-y-3 rounded-xl cursor-pointer ${on ? "is-on" : ""} ${active ? "is-running" : ""}`}
              style={{ "--i": i } as CSSProperties}
            >
              <div className="dw-icon w-12 h-12 rounded-xl bg-[#0e70db] text-white flex items-center justify-center mx-auto lg:mx-0 shadow-lg shadow-blue-200/40">
                {item.icon}
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0e70db] uppercase tracking-wider">
                <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px]">
                  {n}
                </span>
                Paso {n}
              </div>
              <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
              <div className="dw-bar max-w-[160px] mx-auto lg:mx-0" aria-hidden="true">
                <i key={`${item.title}-${tick}`} />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
