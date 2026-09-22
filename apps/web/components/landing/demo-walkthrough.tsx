"use client"

import { CheckCircle2, Gift, QrCode } from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "Mira cómo funciona tu pase": three steps synchronized with the live pass.
 *
 *   1. The customer scans the QR on the counter / table sign → the pass
 *      lands in their Wallet (the sign is drawn next to the phone; the pass
 *      rises into the screen).
 *   2. The cashier scans the pass at the register → the visit is stamped
 *      (scan frame over the pass QR, then the crossfade to one more stamp).
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
    desc: "Tu cliente apunta la cámara al cartel del mostrador o de la mesa y su pase entra a la Wallet. Sin apps, sin formularios largos.",
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

// Deterministic QR-looking pattern for the sign (finder squares + noise)
const QR = (() => {
  const n = 21
  const cells: boolean[] = []
  let seed = 7
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const finder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
      if (finder) {
        const fx = x < 7 ? x : x - (n - 7)
        const fy = y < 7 ? y : y - (n - 7)
        const ring = fx === 0 || fy === 0 || fx === 6 || fy === 6
        const core = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4
        cells.push(ring || core)
      } else cells.push(rnd() > 0.55)
    }
  }
  return cells
})()

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

        /* Step 1: the table sign slides in beside the phone; the pass rises into the screen */
        .dw-sign { position: absolute; left: -46%; top: 18%; width: 54%; opacity: 0; transform: translateX(16px) rotate(-6deg) scale(0.96); transition: opacity 360ms var(--dw-out), transform 600ms var(--dw-out); pointer-events: none; z-index: 2; }
        .dw-sign.is-on { opacity: 1; transform: rotate(-6deg); }
        .dw-sign-card { border-radius: 14px; background: #fff; box-shadow: 0 30px 60px -28px rgba(15,23,42,0.45), 0 0 0 1px rgba(15,23,42,0.06); overflow: hidden; }
        .dw-sign-head { background: linear-gradient(135deg, #e26534, #f2a65a); color: #fff; padding: 10px 12px; }
        .dw-qr { display: grid; grid-template-columns: repeat(21, 1fr); gap: 1px; padding: 10px; background: #fff; }
        .dw-qr i { display: block; aspect-ratio: 1; background: #111827; border-radius: 1px; }
        .dw-qr i.o { background: transparent; }
        .dw-pulse { position: absolute; inset: -8px; border-radius: 22px; border: 2px solid rgba(14,112,219,0.55); opacity: 0; }
        .dw-sign.is-on .dw-pulse { animation: dw-pulse 1.6s var(--dw-out) infinite; }
        @keyframes dw-pulse { 0% { opacity: 0.8; transform: scale(0.96); } 100% { opacity: 0; transform: scale(1.08); } }
        /* beam from the sign to the phone */
        .dw-beam { position: absolute; left: 6%; top: 44%; width: 30%; height: 2px; background: linear-gradient(90deg, rgba(14,112,219,0), #0e70db 40%, rgba(14,112,219,0)); opacity: 0; transform: scaleX(0.4); transform-origin: left; transition: opacity 300ms var(--dw-out), transform 600ms var(--dw-out); transition-delay: 250ms; }
        .dw-beam.is-on { opacity: 1; transform: none; }
        .dw-pass.is-arrive { animation: dw-arrive 1000ms var(--dw-drawer) both; animation-delay: 350ms; }
        @keyframes dw-arrive { from { transform: translateY(16px) scale(0.985); opacity: 0.3; } to { transform: none; opacity: 1; } }
        /* phones: the sign tucks over the top-left corner instead of hanging outside the column */
        @media (max-width: 640px) { .dw-sign { left: -6%; top: -4%; width: 40%; } .dw-beam { display: none; } }

        @media (prefers-reduced-motion: reduce) {
          .dw-icon { transform: none; transition: none; }
          .dw-step.is-on.is-running .dw-bar > i { animation: none; transform: scaleX(1); }
          .dw-sign, .dw-beam { transition: opacity 250ms ease; transform: none !important; }
          .dw-pass.is-arrive { animation: none; }
          .dw-sign.is-on .dw-pulse { animation: none; }
        }
      `}</style>

      {/* Phone + counter sign */}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-8 bg-[#0e70db]/[0.04] rounded-full blur-2xl" />
        <div className="relative w-[320px]">
          <div className={`dw-sign ${step === 0 ? "is-on" : ""}`} aria-hidden="true">
            <div className="dw-pulse" />
            <div className="dw-sign-card">
              <div className="dw-sign-head">
                <div className="text-[9px] font-semibold uppercase tracking-wider opacity-80">
                  Gradual Café
                </div>
                <div className="text-[11px] font-extrabold leading-tight">
                  Escanea y llévate tu tarjeta de sellos
                </div>
              </div>
              <div className="dw-qr">
                {QR.map((on, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static pattern
                  <i key={i} className={on ? "" : "o"} />
                ))}
              </div>
              <div className="px-3 pb-2.5 text-[9px] text-gray-500 text-center">
                Sin apps · Apple Wallet y Google Wallet
              </div>
            </div>
          </div>
          <div className={`dw-beam ${step === 0 ? "is-on" : ""}`} aria-hidden="true" />
          <div className={`dw-pass ${step === 0 ? "is-arrive" : ""}`}>
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
