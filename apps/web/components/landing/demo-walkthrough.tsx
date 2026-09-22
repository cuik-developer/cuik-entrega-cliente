"use client"

import { CheckCircle2, Gift, QrCode } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "Mira cómo funciona tu pase": three steps synchronized with the live pass.
 *
 *   1. The pass arrives: the phone rises into place in one quick motion,
 *      with a small "ready in seconds" pill. Nothing else on stage.
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

 /* Stage: just the phone. Step 1 plays its arrival; the pill confirms the speed. */
        .dw-stage { container-type: inline-size; }
        .dw-passphone { position: relative; width: 100%; transform-origin: 50% 100%; }
        .dw-passphone.is-arrive { animation: dw-arrive 900ms var(--dw-drawer) both; }
        @keyframes dw-arrive { from { opacity: 0; transform: translateY(28px) scale(0.96); } to { opacity: 1; transform: none; } }
        .dw-cap { position: absolute; left: 50%; bottom: 4%; z-index: 3; transform: translateX(-50%) translateY(6px); display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.85rem; border-radius: 9999px; background: rgba(255,255,255,0.94); color: #0f172a; font-size: 0.75rem; font-weight: 700; white-space: nowrap; box-shadow: 0 10px 30px -12px rgba(15,23,42,0.4), 0 0 0 1px rgba(15,23,42,0.06); opacity: 0; transition: opacity 300ms var(--dw-out), transform 400ms var(--dw-out); transition-delay: 750ms; }
        .dw-cap.is-on { opacity: 1; transform: translateX(-50%); }
        .dw-cap i { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }

        @media (prefers-reduced-motion: reduce) {
          .dw-icon { transform: none; transition: none; }
          .dw-step.is-on.is-running .dw-bar > i { animation: none; transform: scaleX(1); }
          .dw-cap { transition: opacity 250ms ease; transform: translateX(-50%) !important; }
          .dw-passphone.is-arrive { animation: none; }
        }
      `}</style>

      {/* Stage */}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-8 bg-[#0e70db]/[0.04] rounded-full blur-2xl" />
        <div className="dw-stage relative w-[300px] sm:w-[320px]">
          {/* The pass in the Wallet */}
          <div className={`dw-passphone ${step === 0 ? "is-arrive" : ""}`}>
            <LivePass
              base="/landing/mockup-gradual-7.png"
              next="/landing/mockup-gradual-8.png"
              alt="Pase de fidelización Gradual Café en Apple Wallet"
              scan={step === 1}
              crossfade={step >= 1}
              push={step === 2 ? REWARD_PUSH : null}
            />
          </div>
          <div className={`dw-cap ${step === 0 ? "is-on" : ""}`} aria-hidden="true">
            <i /> Pase listo en segundos
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
