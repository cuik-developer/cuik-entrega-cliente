"use client"

import { Check, Wallet } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * What the customer actually experiences: a phone (drawn in CSS, no photo)
 * where a customer of "Gradual Café" opens the registration page, taps
 * "Añadir a Apple Wallet", sees the pass sheet, adds it, watches it drop
 * into the Wallet stack and gets the welcome push with the first stamp.
 *
 * Timeline (loops while in view; every step is transform/opacity only):
 *   form   → registration page with the button
 *   tap1   → finger on the button
 *   sheet  → Apple's "add pass" sheet scales in
 *   tap2   → finger on "Añadir"
 *   drop   → pass flies down into the Wallet stack
 *   push   → welcome notification slides in from the top
 *   hold   → rest, then fade to restart
 */

type Phase = "form" | "tap1" | "sheet" | "tap2" | "drop" | "push" | "hold" | "reset"

const TIMELINE: { phase: Phase; ms: number }[] = [
  { phase: "form", ms: 1800 },
  { phase: "tap1", ms: 520 },
  { phase: "sheet", ms: 1500 },
  { phase: "tap2", ms: 520 },
  { phase: "drop", ms: 1100 },
  { phase: "push", ms: 2800 },
  { phase: "hold", ms: 1200 },
  { phase: "reset", ms: 420 },
]

const ORDER: Phase[] = TIMELINE.map((t) => t.phase)
const at = (p: Phase, q: Phase) => ORDER.indexOf(p) >= ORDER.indexOf(q)

export function AddToWalletScene() {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), TIMELINE[step].ms)
    return () => clearTimeout(t)
  }, [active, step])

  const ph = TIMELINE[step].phase
  const sheetOn = ph === "sheet" || ph === "tap2"
  const dropped = at(ph, "drop") && ph !== "reset"
  const pushOn = ph === "push"
  const resetting = ph === "reset"

  return (
    <div ref={ref} className={`aw relative mx-auto w-[280px] ${resetting ? "is-reset" : ""}`}>
      <style>{`
        .aw { --aw-out: cubic-bezier(0.23, 1, 0.32, 1); --aw-drawer: cubic-bezier(0.32, 0.72, 0, 1); transition: opacity 380ms var(--aw-out); }
        .aw.is-reset { opacity: 0; }
        .aw.is-reset * { transition: none !important; }

        .aw-phone { position: relative; aspect-ratio: 9 / 19.2; border-radius: 44px; background: #0b0f19; padding: 10px; box-shadow: 0 50px 80px -30px rgba(15,23,42,0.55), inset 0 0 0 2px rgba(255,255,255,0.08); }
        .aw-screen { position: relative; height: 100%; border-radius: 36px; overflow: hidden; background: #f5f6f8; }
        .aw-notch { position: absolute; top: 8px; left: 50%; width: 34%; height: 22px; transform: translateX(-50%); border-radius: 9999px; background: #0b0f19; z-index: 30; }

        /* Registration page */
        .aw-brand { background: linear-gradient(135deg, #e26534, #f2a65a); color: #fff; padding: 44px 18px 18px; }
        .aw-stamp { width: 18px; height: 18px; border-radius: 9999px; border: 2px solid rgba(226,101,52,0.35); display: grid; place-items: center; }
        .aw-stamp.is-filled { background: #e26534; border-color: #e26534; color: #fff; }
        .aw-stamp.is-filled { opacity: 0; transform: scale(0.6); transition: opacity 280ms var(--aw-out), transform 380ms var(--aw-out); }
        .aw.pushed .aw-stamp.is-filled { opacity: 1; transform: scale(1); transition-delay: 600ms; }
        .aw-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; border-radius: 12px; background: #000; color: #fff; font-weight: 600; font-size: 13px; transition: transform 140ms var(--aw-out); }
        .aw.tapping1 .aw-btn { transform: scale(0.96); }

        /* Finger */
        .aw-finger { position: absolute; width: 34px; height: 34px; border-radius: 9999px; background: rgba(14,112,219,0.18); box-shadow: 0 0 0 2px rgba(14,112,219,0.5) inset; opacity: 0; transform: scale(1.6); transition: opacity 200ms var(--aw-out), transform 260ms var(--aw-out); pointer-events: none; z-index: 40; }
        .aw-finger.is-on { opacity: 1; transform: scale(1); }

        /* Add-pass sheet: scales in from the bottom like iOS */
        .aw-sheet { position: absolute; inset: 0; background: rgba(245,246,248,0.98); opacity: 0; transform: translateY(6%) scale(0.98); transition: opacity 320ms var(--aw-out), transform 420ms var(--aw-drawer); z-index: 20; display: flex; flex-direction: column; }
        .aw-sheet.is-on { opacity: 1; transform: none; }
        .aw-sheet.is-off { opacity: 0; transform: translateY(6%) scale(0.98); pointer-events: none; }

        /* Pass card: lives in the sheet, then flies into the wallet stack */
        .aw-pass { border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 20px 40px -20px rgba(15,23,42,0.45); transform-origin: 50% 100%; transition: transform 900ms var(--aw-drawer), opacity 300ms var(--aw-out); will-change: transform; }
        .aw.dropped .aw-pass.in-sheet { transform: translateY(150%) scale(0.72); opacity: 0; }
        .aw-pass-head { background: linear-gradient(135deg, #e26534, #f2a65a); color: #fff; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; }
        .aw-pass-strip { background: #fbe9dc; padding: 12px 14px; display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }

        /* Wallet stack at the bottom: rises to catch the pass */
        .aw-wallet { position: absolute; left: 12px; right: 12px; bottom: 14px; z-index: 10; transform: translateY(40%); opacity: 0; transition: transform 700ms var(--aw-drawer), opacity 300ms var(--aw-out); }
        .aw.dropped .aw-wallet { transform: none; opacity: 1; }
        .aw-wallet .aw-pass { position: relative; box-shadow: 0 -10px 30px -16px rgba(15,23,42,0.35); }
        .aw-card-back { height: 22px; border-radius: 14px 14px 0 0; margin: 0 8px -8px; }

        /* Push banner */
        .aw-push { position: absolute; left: 10px; right: 10px; top: 14px; z-index: 50; display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 16px; background: rgba(255,255,255,0.9); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); box-shadow: 0 10px 30px rgba(15,23,42,0.18); opacity: 0; transform: translateY(-140%); transition: opacity 220ms var(--aw-out), transform 420ms var(--aw-drawer); }
        .aw-push.is-on { opacity: 1; transform: none; }

        .aw-cap { display: grid; text-align: center; }
        .aw-cap > span { grid-area: 1 / 1; opacity: 0; transform: translateY(6px); transition: opacity 260ms var(--aw-out), transform 260ms var(--aw-out); }
        .aw-cap > span.is-on { opacity: 1; transform: none; }

        @media (prefers-reduced-motion: reduce) {
          .aw-sheet, .aw-pass, .aw-wallet, .aw-push, .aw-finger, .aw-cap > span, .aw-stamp.is-filled { transition: opacity 250ms ease !important; transform: none !important; }
        }
      `}</style>

      <div
        className={`aw-phone ${ph === "tap1" ? "tapping1" : ""} ${dropped ? "dropped" : ""} ${at(ph, "push") && !resetting ? "pushed" : ""}`}
      >
        <div className="aw-screen">
          <div className="aw-notch" />

          {/* Registration page */}
          <div className="aw-brand">
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
              Tarjeta de sellos
            </div>
            <div className="text-lg font-extrabold tracking-tight">Gradual Café</div>
            <div className="text-[11px] opacity-90 mt-0.5">
              Compra 8 cafés y el 9° va por la casa
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded-xl bg-white border border-gray-100 p-3">
              <div className="text-[10px] text-gray-400 font-semibold">Tu nombre</div>
              <div className="text-sm font-semibold text-gray-900">Ana Torres</div>
            </div>
            <div className="rounded-xl bg-white border border-gray-100 p-3">
              <div className="text-[10px] text-gray-400 font-semibold mb-2">Tus sellos</div>
              <div className="grid grid-cols-8 gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: static decorative row
                    key={i}
                    className={`aw-stamp ${i === 0 ? "is-filled" : ""}`}
                  >
                    {i === 0 && <Check className="w-2.5 h-2.5" />}
                  </span>
                ))}
              </div>
            </div>
            <div className="aw-btn">
              <Wallet className="w-4 h-4" />
              Añadir a Apple Wallet
            </div>
            <div className="text-center text-[10px] text-gray-400">
              También disponible para Google Wallet
            </div>
          </div>
          <div
            className={`aw-finger ${ph === "tap1" ? "is-on" : ""}`}
            style={{ left: "44%", top: "63%" }}
          />

          {/* Add-pass sheet */}
          <div className={`aw-sheet ${sheetOn ? "is-on" : ""} ${dropped ? "is-off" : ""}`}>
            <div className="flex items-center justify-between px-4 pt-11 pb-3 text-[12px]">
              <span className="text-[#0e70db] font-medium">Cancelar</span>
              <span className="font-semibold text-gray-900">Pase</span>
              <span
                className={`font-semibold ${ph === "tap2" ? "text-[#0a56b0]" : "text-[#0e70db]"}`}
              >
                Añadir
              </span>
            </div>
            <div className="px-4">
              <PassCard className="aw-pass in-sheet" />
            </div>
            <div
              className={`aw-finger ${ph === "tap2" ? "is-on" : ""}`}
              style={{ right: "6%", top: "9%" }}
            />
          </div>

          {/* Wallet stack */}
          <div className="aw-wallet">
            <div
              className="aw-card-back"
              style={{ background: "#1f4b8f", marginLeft: 16, marginRight: 16 }}
            />
            <div className="aw-card-back" style={{ background: "#144442" }} />
            <PassCard className="aw-pass" stamps={1} />
          </div>

          {/* Welcome push */}
          <div className={`aw-push ${pushOn ? "is-on" : ""}`}>
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ background: "#e26534" }}
            >
              <span className="text-[11px] font-extrabold">g</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex justify-between items-baseline text-[11px]">
                <span className="font-bold text-gray-900">Gradual Café</span>
                <span className="text-gray-500">ahora</span>
              </span>
              <span className="block text-[11px] text-gray-800 leading-snug">
                ¡Bienvenida, Ana! Tu primer sello ya está en tu pase ☕
              </span>
            </span>
          </div>
        </div>
      </div>

      <div className="aw-cap mt-5 text-sm font-medium">
        <span className={`text-gray-500 ${ph === "form" || ph === "tap1" ? "is-on" : ""}`}>
          1 · Tu cliente se registra desde el QR
        </span>
        <span className={`text-gray-500 ${sheetOn ? "is-on" : ""}`}>
          2 · Añade el pase a su Wallet
        </span>
        <span className={`text-gray-500 ${ph === "drop" ? "is-on" : ""}`}>
          3 · Listo, sin descargar nada
        </span>
        <span className={`text-[#0e70db] ${ph === "push" || ph === "hold" ? "is-on" : ""}`}>
          4 · Recibe tu bienvenida y su primer sello
        </span>
      </div>
    </div>
  )
}

function PassCard({ className = "", stamps = 0 }: { className?: string; stamps?: number }) {
  return (
    <div className={className}>
      <div className="aw-pass-head">
        <div>
          <div className="text-[9px] uppercase tracking-wider opacity-80">Gradual Café</div>
          <div className="text-sm font-extrabold tracking-tight">gradual</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-wider opacity-80">Sellos</div>
          <div className="text-sm font-extrabold">{stamps}/8</div>
        </div>
      </div>
      <div className="aw-pass-strip">
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative row
            key={i}
            className={`aw-stamp ${i < stamps ? "is-filled" : ""}`}
            style={i < stamps ? { opacity: 1, transform: "none" } : undefined}
          >
            {i < stamps && <Check className="w-2.5 h-2.5" />}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2.5">
        <div>
          <div className="text-[9px] text-gray-400 uppercase tracking-wider">Nombre</div>
          <div className="text-[11px] font-semibold text-gray-900">Ana Torres</div>
        </div>
        <div className="w-9 h-9 rounded bg-gray-900 grid grid-cols-3 gap-[2px] p-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: static decorative QR
              key={i}
              className={i % 2 === 0 ? "bg-white" : "bg-gray-900"}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
