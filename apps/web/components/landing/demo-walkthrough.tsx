"use client"

import { CheckCircle2, Gift, QrCode } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "Mira cómo funciona tu pase": three steps synchronized with the live pass.
 * Auto-advances every STEP_MS while in view; clicking a step jumps to it
 * (and restarts the timer from there). Purely presentational.
 */

const STEP_MS = 3200

const REWARD_PUSH: PushContent = {
  title: "Gradual Café",
  body: "¡Completaste tu tarjeta! 🎁 Tu café gratis te espera.",
  icon: <Gift />,
  color: "#e26534",
}

const STEPS: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <QrCode className="w-7 h-7" />,
    title: "El cliente escanea el QR",
    desc: "Apunta la cámara al código QR en tu mostrador. Sin apps, sin registro complicado.",
  },
  {
    icon: <CheckCircle2 className="w-7 h-7" />,
    title: "Se registra la visita",
    desc: "El sello se agrega automáticamente a su pase digital en el wallet.",
  },
  {
    icon: <Gift className="w-7 h-7" />,
    title: "Completa y gana",
    desc: "Al completar todos los sellos, el premio se desbloquea al instante.",
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
    <div className="flex flex-col lg:flex-row items-center gap-14">
      <style>{`
        .dw-step { --dw-ease-out: cubic-bezier(0.23, 1, 0.32, 1); opacity: 0.45; transition: opacity 200ms var(--dw-ease-out); }
        .dw-step.is-on, .dw-step:focus-visible { opacity: 1; }
        @media (hover: hover) and (pointer: fine) { .dw-step:hover { opacity: 0.8; } .dw-step.is-on:hover { opacity: 1; } }
        .dw-icon { transform: scale(0.94); transition: transform 200ms var(--dw-ease-out), box-shadow 200ms var(--dw-ease-out); }
        .dw-step.is-on .dw-icon { transform: scale(1); }
        /* Auto-advance progress: constant motion → linear. transform only. */
        .dw-bar { height: 3px; border-radius: 9999px; background: #dbeafe; overflow: hidden; }
        .dw-bar > i { display: block; height: 100%; background: #0e70db; transform: scaleX(0); transform-origin: left; }
        .dw-step.is-on.is-running .dw-bar > i { animation: dw-fill ${STEP_MS}ms linear forwards; }
        @keyframes dw-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @media (prefers-reduced-motion: reduce) {
          .dw-icon { transform: none; transition: none; }
          .dw-step.is-on.is-running .dw-bar > i { animation: none; transform: scaleX(1); }
        }
      `}</style>

      {/* Phone */}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-8 bg-[#0e70db]/[0.04] rounded-full blur-2xl" />
        <div className="relative w-[320px]">
          <LivePass
            base="/landing/mockup-gradual-7.png"
            next="/landing/mockup-gradual-8.png"
            alt="Pase de fidelización Gradual Café en Apple Wallet"
            scan={step === 0}
            crossfade={step >= 1}
            push={step === 2 ? REWARD_PUSH : null}
          />
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
