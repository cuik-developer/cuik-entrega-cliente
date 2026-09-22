"use client"

import { CheckCircle2, Gift, QrCode } from "lucide-react"
import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "Mira cómo funciona tu pase": three steps synchronized with the live pass.
 *
 *   1. The counter sign stands on the left; on the right the customer's phone
 *      (the site's real iPhone photo) shows that same sign through the
 *      camera, with iOS's yellow frame locking onto the QR and the link
 *      chip. Nothing else is drawn.
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
    desc: "Tu cliente escanea el cartel del mostrador y en segundos tiene su pase en la Wallet. Sin apps, sin formularios.",
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

// Deterministic QR-looking pattern (finder squares + timing lines + noise), crisp squares
const QR_N = 25
function finderCell(x: number, y: number): boolean | null {
  const inFinder = (x < 7 && y < 7) || (x >= QR_N - 7 && y < 7) || (x < 7 && y >= QR_N - 7)
  if (!inFinder) return null
  const fx = x < 7 ? x : x - (QR_N - 7)
  const fy = y < 7 ? y : y - (QR_N - 7)
  const ring = fx === 0 || fy === 0 || fx === 6 || fy === 6
  const core = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4
  return ring || core
}
const QR = (() => {
  const cells: boolean[] = []
  let seed = 11
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280
    return seed / 233280
  }
  for (let y = 0; y < QR_N; y++) {
    for (let x = 0; x < QR_N; x++) {
      const f = finderCell(x, y)
      const timing = (x === 7 && y < QR_N - 7) || (y === 7 && x < QR_N - 7)
      cells.push(f ?? (timing ? false : rnd() > 0.52))
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

        /* Stage: the sign (step 1) and the phone (steps 2–3) share the same box and crossfade */
        .dw-stage { container-type: inline-size; }
        .dw-layer { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transition: opacity 420ms var(--dw-out), transform 700ms var(--dw-drawer); }
        .dw-layer.is-off { opacity: 0; transform: translateY(16px) scale(0.97); pointer-events: none; }
        .dw-passphone { width: 76%; }
        /* Counter sign: white card on a slim stand */
        .dw-sign { width: 78%; border-radius: 1.25rem; background: #fff; box-shadow: 0 40px 80px -36px rgba(15,23,42,0.45), 0 0 0 1px rgba(15,23,42,0.06); padding: 1.5rem 1.5rem 1.25rem; text-align: center; position: relative; }
        .dw-sign::before { content: ''; position: absolute; left: 12%; right: 12%; bottom: -14px; height: 14px; border-radius: 0 0 10px 10px; background: linear-gradient(180deg, #cbd5e1, #94a3b8); }
        .dw-sign::after { content: ''; position: absolute; left: 4%; right: 4%; bottom: -22px; height: 8px; border-radius: 9999px; background: #0f172a; opacity: 0.9; }
        .dw-qr { display: grid; grid-template-columns: repeat(25, 1fr); gap: 0; margin: 1.1rem auto 0; width: 100%; aspect-ratio: 1; padding: 0.35rem; border-radius: 0.75rem; background: #fff; box-shadow: inset 0 0 0 1px #eef2f7; }
        .dw-qr i { display: block; background: #0f172a; }
        .dw-qr i.o { background: transparent; }
        /* Step 1 composition: sign left, phone right */
        .dw-scene { position: absolute; inset: 0; }
        .dw-scene .dw-sign { position: absolute; left: 0; top: 4%; width: 58%; padding: 1.1rem 1.1rem 0.9rem; }
        .dw-scene .dw-sign .dw-title { font-size: 1rem; }
        .dw-phone { position: absolute; right: -6%; bottom: -2%; width: 64%; transform: rotate(-7deg); transform-origin: 50% 100%; z-index: 2; }
        .dw-phone > img { width: 100%; height: auto; filter: drop-shadow(0 30px 40px rgba(15,23,42,0.35)); }
        /* the phone's screen: the sign as the camera sees it (measured screen rect of the photo) */
        .dw-screen { position: absolute; left: 24%; top: 7.5%; width: 52%; height: 85.8%; border-radius: 7.3cqw; overflow: hidden; background: radial-gradient(120% 80% at 50% 20%, #f8fafc, #dfe5ec 70%, #c9d1da); container-type: inline-size; }
        .dw-mini { position: absolute; left: 50%; top: 27%; width: 72%; transform: translateX(-50%); border-radius: 8cqw; background: #fff; box-shadow: 0 10cqw 20cqw -8cqw rgba(15,23,42,0.35); padding: 7cqw 7cqw 5cqw; text-align: center; color: #0f172a; }
        .dw-mini .dw-qr { margin-top: 5cqw; padding: 2cqw; border-radius: 3cqw; }
        .dw-frame { position: absolute; left: 50%; top: 45.5%; width: 58%; aspect-ratio: 1; transform: translateX(-50%) scale(1.3); opacity: 0; transition: opacity 240ms var(--dw-out), transform 520ms var(--dw-out); transition-delay: 600ms; pointer-events: none; }
        .dw-layer:not(.is-off) .dw-frame { opacity: 1; transform: translateX(-50%) scale(1); }
        .dw-frame i { position: absolute; width: 24%; height: 24%; border: 2.4cqw solid #ffd60a; border-radius: 2cqw; }
        .dw-frame i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; }
        .dw-frame i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; }
        .dw-frame i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; }
        .dw-frame i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; }
        .dw-chip { position: absolute; left: 50%; top: 16%; transform: translateX(-50%) translateY(6px); padding: 3cqw 6cqw; border-radius: 9999px; background: #ffd60a; color: #111; font-weight: 700; font-size: 6cqw; white-space: nowrap; opacity: 0; transition: opacity 240ms var(--dw-out), transform 420ms var(--dw-out); transition-delay: 1100ms; }
        .dw-layer:not(.is-off) .dw-chip { opacity: 1; transform: translateX(-50%); }
        .dw-cap { position: absolute; left: 50%; bottom: 4%; z-index: 3; transform: translateX(-50%) translateY(6px); display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.85rem; border-radius: 9999px; background: rgba(255,255,255,0.94); color: #0f172a; font-size: 0.75rem; font-weight: 700; white-space: nowrap; box-shadow: 0 10px 30px -12px rgba(15,23,42,0.4), 0 0 0 1px rgba(15,23,42,0.06); opacity: 0; transition: opacity 300ms var(--dw-out), transform 400ms var(--dw-out); transition-delay: 500ms; }
        .dw-cap.is-on { opacity: 1; transform: translateX(-50%); }
        .dw-cap i { width: 0.5rem; height: 0.5rem; border-radius: 9999px; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.2); }

        @media (prefers-reduced-motion: reduce) {
          .dw-icon { transform: none; transition: none; }
          .dw-step.is-on.is-running .dw-bar > i { animation: none; transform: scaleX(1); }
          .dw-layer { transition: opacity 250ms ease; transform: none !important; }
          .dw-frame, .dw-chip { transition: opacity 250ms ease; transform: translateX(-50%) !important; }
          .dw-cap { transition: opacity 250ms ease; transform: translateX(-50%) !important; }
        }
      `}</style>

      {/* Stage */}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-8 bg-[#0e70db]/[0.04] rounded-full blur-2xl" />
        <div className="dw-stage relative w-[340px] sm:w-[420px] aspect-[4/5]">
          {/* Step 1: the counter sign */}
          <div className={`dw-layer ${step === 0 ? "" : "is-off"}`} aria-hidden={step !== 0}>
            <div className="dw-scene">
              {/* The sign on the counter */}
              <div className="dw-sign">
                <div className="flex items-center justify-center gap-1.5">
                  <CuikLogo size="sm" className="!w-5 !h-5" />
                  <span className="text-xs font-extrabold text-gray-900 tracking-tight">Cuik</span>
                </div>
                <div className="dw-title mt-2.5 font-extrabold text-gray-900 tracking-tight leading-[1.15] text-balance">
                  Escanea aquí y obtén tu pase
                </div>
                <div className="dw-qr" role="img" aria-label="Código QR de registro">
                  {QR.map((on, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static pattern
                    <i key={i} className={on ? "" : "o"} />
                  ))}
                </div>
                <div className="mt-2 text-[10px] font-medium text-gray-500">
                  Apple Wallet · Google Wallet
                </div>
              </div>

              {/* The customer's phone, camera on the sign */}
              <div className="dw-phone" aria-hidden="true">
                <Image src="/landing/mockup-gradual-7.png" alt="" width={564} height={1002} />
                <div className="dw-screen">
                  <div className="dw-mini">
                    <div style={{ fontSize: "5cqw", fontWeight: 800, letterSpacing: "-0.01em" }}>
                      Cuik
                    </div>
                    <div
                      style={{
                        marginTop: "3cqw",
                        fontSize: "5.4cqw",
                        fontWeight: 800,
                        lineHeight: 1.15,
                      }}
                    >
                      Escanea aquí y obtén tu pase
                    </div>
                    <div className="dw-qr">
                      {QR.map((on, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: static pattern
                        <i key={i} className={on ? "" : "o"} />
                      ))}
                    </div>
                  </div>
                  <div className="dw-chip">cuik.org/registro</div>
                  <div className="dw-frame">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Steps 2–3: the pass in the Wallet */}
          <div className={`dw-layer ${step === 0 ? "is-off" : ""}`} aria-hidden={step === 0}>
            <div className="dw-passphone">
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
