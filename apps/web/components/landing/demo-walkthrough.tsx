"use client"

import { CheckCircle2, Gift, QrCode, Zap } from "lucide-react"
import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "Mira cómo funciona tu pase": three steps synchronized with the live pass.
 *
 *   1. Two phones, like a real counter: on the left one the customer has the
 *      camera open and iOS is detecting the QR on the sign (yellow frame,
 *      link chip); on the right one the pass sits in the Wallet.
 *   2. The cashier scans the pass at the register → the visit is stamped
 *      (scan frame over the pass QR, then the crossfade to one more stamp).
 *   3. The card is complete → the reward push.
 *
 * Both phones are the site's real iPhone photo; the camera UI is drawn
 * inside the measured screen area of the photo (left 24%, top 7.5%,
 * width 52%, height 85.8%, corner radius ≈ 7.3% of the width).
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
    desc: "Tu cliente apunta la cámara al QR del mostrador o de la mesa y su pase entra a la Wallet. Sin apps, sin formularios largos.",
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

// Deterministic QR-looking pattern (finder squares + noise)
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

        /* Stage: the pass phone on the right; the scanning phone slides in behind it on the left */
        .dw-stage { container-type: inline-size; }
        .dw-passphone { position: relative; margin-left: auto; width: 68%; z-index: 2; transition: transform 800ms var(--dw-drawer); }
        .dw-passphone.is-solo { transform: translateX(-16%); }
        .dw-scanphone { position: absolute; left: 0; top: 10%; width: 60%; z-index: 1; opacity: 0; transform: translateX(10%) rotate(-10deg) scale(0.96); transition: opacity 420ms var(--dw-out), transform 800ms var(--dw-drawer); pointer-events: none; }
        .dw-scanphone.is-on { opacity: 1; transform: rotate(-10deg); }
        .dw-scanphone img { width: 100%; height: auto; filter: drop-shadow(0 30px 40px rgba(15,23,42,0.35)); }
        /* camera UI inside the photo's screen */
        .dw-cam { position: absolute; left: 24%; top: 7.5%; width: 52%; height: 85.8%; border-radius: 7.3cqw; overflow: hidden; background: #0b0b0c; color: #fff; font-size: 2.2cqw; }
        .dw-view { position: absolute; inset: 0; background:
          radial-gradient(60% 40% at 50% 30%, rgba(255,232,210,0.35), transparent 70%),
          linear-gradient(180deg, #3a2b22 0%, #6b4a36 45%, #2a211c 100%); }
        .dw-view::after { content: ''; position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 100%, rgba(0,0,0,0.55), transparent 60%); }
        .dw-status { position: absolute; left: 0; right: 0; top: 0; display: flex; justify-content: space-between; padding: 2cqw 3.4cqw 0; font-weight: 600; font-size: 2.1cqw; }
        .dw-sign { position: absolute; left: 50%; top: 30%; width: 62%; transform: translateX(-50%); border-radius: 1.6cqw; background: #fff; color: #111827; box-shadow: 0 8px 24px rgba(0,0,0,0.35); overflow: hidden; }
        .dw-sign-head { padding: 1.4cqw 1.8cqw 1.2cqw; background: linear-gradient(135deg, #e26534, #f2a65a); color: #fff; }
        .dw-qr { display: grid; grid-template-columns: repeat(21, 1fr); gap: 0.15cqw; padding: 1.6cqw 3cqw 1.2cqw; }
        .dw-qr i { display: block; aspect-ratio: 1; background: #111827; }
        .dw-qr i.o { background: transparent; }
        /* iOS QR detection: yellow corner brackets that settle onto the code, and the link chip */
        .dw-frame { position: absolute; left: 50%; top: 41%; width: 44%; aspect-ratio: 1; transform: translateX(-50%) scale(1.25); opacity: 0; transition: opacity 240ms var(--dw-out), transform 520ms var(--dw-out); transition-delay: 500ms; }
        .dw-scanphone.is-on .dw-frame { opacity: 1; transform: translateX(-50%) scale(1); }
        .dw-frame i { position: absolute; width: 26%; height: 26%; border: 0.55cqw solid #ffd60a; border-radius: 0.6cqw; }
        .dw-frame i:nth-child(1) { left: 0; top: 0; border-right: 0; border-bottom: 0; }
        .dw-frame i:nth-child(2) { right: 0; top: 0; border-left: 0; border-bottom: 0; }
        .dw-frame i:nth-child(3) { left: 0; bottom: 0; border-right: 0; border-top: 0; }
        .dw-frame i:nth-child(4) { right: 0; bottom: 0; border-left: 0; border-top: 0; }
        .dw-chip { position: absolute; left: 50%; top: 21%; transform: translateX(-50%) translateY(6px); display: inline-flex; align-items: center; gap: 1cqw; padding: 1cqw 2cqw; border-radius: 9999px; background: #ffd60a; color: #111; font-weight: 700; font-size: 2cqw; white-space: nowrap; opacity: 0; transition: opacity 240ms var(--dw-out), transform 420ms var(--dw-out); transition-delay: 1000ms; }
        .dw-scanphone.is-on .dw-chip { opacity: 1; transform: translateX(-50%); }
        .dw-shutter { position: absolute; left: 50%; bottom: 4%; width: 12cqw; height: 12cqw; transform: translateX(-50%); border-radius: 9999px; background: #fff; box-shadow: 0 0 0 1cqw rgba(255,255,255,0.35); }
        .dw-modes { position: absolute; left: 0; right: 0; bottom: 18%; display: flex; justify-content: center; gap: 3cqw; font-size: 1.9cqw; font-weight: 600; letter-spacing: 0.06em; color: rgba(255,255,255,0.7); }
        .dw-modes b { color: #ffd60a; }

        @media (prefers-reduced-motion: reduce) {
          .dw-icon { transform: none; transition: none; }
          .dw-step.is-on.is-running .dw-bar > i { animation: none; transform: scaleX(1); }
          .dw-scanphone, .dw-passphone, .dw-frame, .dw-chip { transition: opacity 250ms ease; }
          .dw-scanphone { transform: rotate(-10deg) !important; }
          .dw-passphone { transform: none !important; }
          .dw-frame, .dw-chip { transform: translateX(-50%) !important; }
        }
      `}</style>

      {/* Stage */}
      <div className="relative flex-shrink-0">
        <div className="absolute -inset-8 bg-[#0e70db]/[0.04] rounded-full blur-2xl" />
        <div className="dw-stage relative w-[340px] sm:w-[440px]">
          {/* Customer's phone: camera open, iOS reading the sign's QR */}
          <div className={`dw-scanphone ${step === 0 ? "is-on" : ""}`} aria-hidden="true">
            <Image src="/landing/mockup-gradual-7.png" alt="" width={564} height={1002} />
            <div className="dw-cam">
              <div className="dw-view" />
              <div className="dw-status">
                <span>9:41</span>
                <Zap style={{ width: "2.6cqw", height: "2.6cqw" }} />
              </div>
              <div className="dw-chip">cuik.org/gradual-cafe</div>
              <div className="dw-sign">
                <div className="dw-sign-head">
                  <div style={{ fontSize: "1.5cqw", opacity: 0.85, letterSpacing: "0.08em" }}>
                    GRADUAL CAFÉ
                  </div>
                  <div style={{ fontSize: "2cqw", fontWeight: 800, lineHeight: 1.15 }}>
                    Escanea y llévate tu tarjeta de sellos
                  </div>
                </div>
                <div className="dw-qr">
                  {QR.map((on, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static pattern
                    <i key={i} className={on ? "" : "o"} />
                  ))}
                </div>
              </div>
              <div className="dw-frame">
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="dw-modes">
                <span>VIDEO</span>
                <b>FOTO</b>
                <span>RETRATO</span>
              </div>
              <div className="dw-shutter" />
            </div>
          </div>

          {/* The pass in the Wallet */}
          <div className={`dw-passphone ${step === 0 ? "" : "is-solo"}`}>
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
