"use client"

import { Mail, Smartphone } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { LivePass } from "@/components/landing/live-pass"

/**
 * The customer's real path, on the real phone photo used across the site:
 * our /registro page (email step) → our /bienvenido page with "Agregar a
 * Apple Wallet" → the pass sitting in the Wallet (the photo itself) → the
 * welcome push. The two web screens are faithful replicas of the actual
 * registro/bienvenido components (same header gradient, cards, copy and
 * button styles), rendered inside the phone's screen area, so what moves
 * is exactly what a customer of Gradual Café would see.
 *
 * Screen geometry (measured on mockup-gradual-7.png): left 24%, top 7.5%,
 * width 52%, height 85.8% of the image; corner radius ≈ 7.3% of the width.
 */

type Phase =
  | "registro"
  | "typing"
  | "tapContinue"
  | "bienvenido"
  | "tapApple"
  | "wallet"
  | "push"
  | "hold"
  | "reset"

const TIMELINE: { phase: Phase; ms: number }[] = [
  { phase: "registro", ms: 900 },
  { phase: "typing", ms: 1500 },
  { phase: "tapContinue", ms: 600 },
  { phase: "bienvenido", ms: 1700 },
  { phase: "tapApple", ms: 600 },
  { phase: "wallet", ms: 1000 },
  { phase: "push", ms: 2800 },
  { phase: "hold", ms: 1300 },
  { phase: "reset", ms: 420 },
]

const PRIMARY = "#e26534" // Gradual Café
const EMAIL = "ana.torres@gmail.com"

const WELCOME_PUSH = {
  title: "Gradual Café",
  body: "¡Bienvenida, Ana! Tu pase ya está en tu Wallet. Tu primer café suma sello ☕",
  icon: <Smartphone />,
  color: PRIMARY,
}

export function SignupScene() {
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
  const idx = TIMELINE.findIndex((t) => t.phase === ph)
  const after = (p: Phase) => idx >= TIMELINE.findIndex((t) => t.phase === p)
  const typed = ph === "registro" ? 0 : after("typing") ? EMAIL.length : 0
  const onWelcome = after("bienvenido") && !after("wallet")
  const webOn = !after("wallet") // both web screens live in the overlay
  const resetting = ph === "reset"

  return (
    <div ref={ref} className={`ss relative w-full ${resetting ? "is-reset" : ""}`}>
      <style>{`
        .ss { container-type: inline-size; --ss-out: cubic-bezier(0.23, 1, 0.32, 1); --ss-drawer: cubic-bezier(0.32, 0.72, 0, 1); transition: opacity 380ms var(--ss-out); }
        .ss.is-reset { opacity: 0; }
        .ss.is-reset * { transition: none !important; }

        /* The phone's screen, over the photo */
        .ss-screen { position: absolute; left: 24%; top: 7.5%; width: 52%; height: 85.8%; border-radius: 7.3cqw; overflow: hidden; background: #f9fafb; font-size: 2.55cqw; line-height: 1.35; transform-origin: 50% 50%; transition: opacity 420ms var(--ss-out), transform 520ms var(--ss-drawer); z-index: 5; }
        .ss-screen.is-off { opacity: 0; transform: scale(0.94); pointer-events: none; }
        .ss-status { display: flex; justify-content: space-between; align-items: center; padding: 3.2cqw 4.2cqw 0; font-size: 2.6cqw; font-weight: 600; color: #111; }
        .ss-status i { display: inline-block; width: 5.5cqw; height: 2.3cqw; border-radius: 0.6cqw; border: 0.25cqw solid #111; position: relative; }
        .ss-status i::after { content: ''; position: absolute; inset: 0.35cqw; right: 1.2cqw; background: #111; border-radius: 0.3cqw; }
        .ss-url { margin: 1.6cqw 3cqw 0; height: 5.2cqw; border-radius: 2cqw; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 2.3cqw; color: #374151; }

        /* Two pages stacked; crossfade between them */
        .ss-pages { position: relative; height: calc(100% - 12cqw); }
        .ss-page { position: absolute; inset: 0; opacity: 0; transform: translateX(6%); transition: opacity 320ms var(--ss-out), transform 420ms var(--ss-out); overflow: hidden; }
        .ss-page.is-on { opacity: 1; transform: none; }
        .ss-page.is-past { opacity: 0; transform: translateX(-6%); }

        /* registro header (same gradient + copy as the real page) */
        .ss-head { padding: 4cqw 3cqw 5cqw; text-align: center; color: #fff; background: linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY}dd 100%); }
        .ss-logo { width: 9cqw; height: 9cqw; margin: 0 auto 1.4cqw; border-radius: 9999px; background: rgba(255,255,255,0.2); display: grid; place-items: center; font-weight: 800; font-size: 4cqw; box-shadow: 0 6px 14px rgba(0,0,0,0.15); }
        .ss-card { margin: -2cqw 2.6cqw 0; background: #fff; border-radius: 2.4cqw; box-shadow: 0 10px 25px -12px rgba(15,23,42,0.35); padding: 3cqw; }
        .ss-label { display: flex; align-items: center; gap: 1cqw; font-size: 2.3cqw; font-weight: 600; color: #374151; margin-bottom: 1cqw; }
        .ss-input { height: 6.6cqw; border: 1px solid #e5e7eb; border-radius: 1.6cqw; padding: 0 2cqw; display: flex; align-items: center; font-size: 2.5cqw; color: #111; background: #fff; }
        .ss-input .ph { color: #9ca3af; }
        .ss-caret { display: inline-block; width: 1px; height: 3.2cqw; background: #111; margin-left: 0.3cqw; animation: ss-blink 1s steps(2) infinite; }
        .ss-btn { margin-top: 2.4cqw; height: 7cqw; border-radius: 1.8cqw; display: flex; align-items: center; justify-content: center; gap: 1.4cqw; color: #fff; font-weight: 600; font-size: 2.7cqw; transition: transform 140ms var(--ss-out), filter 140ms; }
        .ss-btn.is-pressed { transform: scale(0.97); filter: brightness(0.92); }
        .ss-dashed { margin: 2.4cqw 2.6cqw 0; border: 1px dashed #d1d5db; border-radius: 2.4cqw; padding: 2.4cqw; display: flex; gap: 2cqw; align-items: center; background: #fff; }

        /* Finger: a soft ring where the customer taps */
        .ss-finger { position: absolute; width: 9cqw; height: 9cqw; border-radius: 9999px; background: rgba(14,112,219,0.16); box-shadow: inset 0 0 0 0.4cqw rgba(14,112,219,0.45); opacity: 0; transform: translate(-50%, -50%) scale(1.5); transition: opacity 180ms var(--ss-out), transform 240ms var(--ss-out); pointer-events: none; z-index: 8; }
        .ss-finger.is-on { opacity: 1; transform: translate(-50%, -50%) scale(1); }

        @keyframes ss-blink { to { visibility: hidden; } }

        .ss-cap { display: grid; text-align: center; margin-top: 1.2rem; font-size: 0.875rem; font-weight: 500; }
        .ss-cap > span { grid-area: 1 / 1; opacity: 0; transform: translateY(6px); transition: opacity 260ms var(--ss-out), transform 260ms var(--ss-out); }
        .ss-cap > span.is-on { opacity: 1; transform: none; }

        @media (prefers-reduced-motion: reduce) {
          .ss-screen, .ss-page, .ss-finger, .ss-cap > span, .ss-btn { transition: opacity 250ms ease !important; transform: none !important; }
          .ss-caret { animation: none; }
        }
      `}</style>

      {/* The real photo: pass in Apple Wallet. Push plays on it once the web screens are gone. */}
      <LivePass
        base="/landing/mockup-gradual-7.png"
        alt="Pase de Gradual Café en Apple Wallet"
        push={ph === "push" ? WELCOME_PUSH : null}
        priority
      />

      {/* Web screens over the phone's display */}
      <div className={`ss-screen ${webOn ? "" : "is-off"}`} aria-hidden="true">
        <div className="ss-status">
          <span>9:41</span>
          <i />
        </div>
        <div className="ss-url">cuik.org/gradual-cafe/{onWelcome ? "bienvenido" : "registro"}</div>

        <div className="ss-pages">
          {/* /registro — email step */}
          <div className={`ss-page ${!onWelcome ? "is-on" : "is-past"}`}>
            <div className="ss-head">
              <div className="ss-logo">G</div>
              <div style={{ fontWeight: 700, fontSize: "3.2cqw" }}>Gradual Café</div>
              <div style={{ marginTop: "1cqw", fontSize: "2.3cqw", opacity: 0.9 }}>
                Registrate y obtene tu tarjeta de fidelizacion digital
              </div>
            </div>
            <div className="ss-card">
              <div className="ss-label">
                <Mail style={{ width: "2.4cqw", height: "2.4cqw" }} /> Email
              </div>
              <div className="ss-input">
                {typed === 0 ? (
                  <span className="ph">juan@email.com</span>
                ) : (
                  <span className="ss-typed">{EMAIL}</span>
                )}
                {ph === "typing" && <span className="ss-caret" />}
              </div>
              <div style={{ marginTop: "1cqw", fontSize: "2.1cqw", color: "#6b7280" }}>
                Ingresa tu email para empezar. Si ya tienes cuenta, te enviamos tu pase.
              </div>
              <div
                className={`ss-btn ${ph === "tapContinue" ? "is-pressed" : ""}`}
                style={{ background: PRIMARY }}
              >
                Continuar
              </div>
            </div>
            <div className="ss-dashed">
              <span
                style={{
                  width: "6.5cqw",
                  height: "6.5cqw",
                  borderRadius: "1.6cqw",
                  background: `${PRIMARY}15`,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                <Smartphone style={{ width: "3.2cqw", height: "3.2cqw", color: PRIMARY }} />
              </span>
              <span>
                <span
                  style={{ display: "block", fontSize: "2.3cqw", fontWeight: 600, color: "#111" }}
                >
                  Tu pase digital en Apple Wallet y Google Wallet
                </span>
                <span style={{ display: "block", fontSize: "2cqw", color: "#6b7280" }}>
                  Sin descargar apps • Siempre en tu billetera digital
                </span>
              </span>
            </div>
          </div>

          {/* /bienvenido — pass preview + wallet buttons */}
          <div className={`ss-page ${onWelcome ? "is-on" : ""}`}>
            <div style={{ padding: "4cqw 3cqw 0", textAlign: "center" }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "3.6cqw",
                  color: "#111",
                  letterSpacing: "-0.01em",
                }}
              >
                ¡Bienvenida, Ana!
              </div>
              <div style={{ marginTop: "0.8cqw", fontSize: "2.3cqw", color: "#6b7280" }}>
                Tu pase de Gradual Café está listo
              </div>
            </div>
            {/* pass preview, same look as the real pass */}
            <div
              style={{
                margin: "3cqw 3cqw 0",
                borderRadius: "2.4cqw",
                overflow: "hidden",
                boxShadow: "0 12px 30px -14px rgba(15,23,42,0.45)",
                background: "#1c2a44",
                color: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "2.2cqw 2.6cqw",
                }}
              >
                <span style={{ fontWeight: 800, fontSize: "3.2cqw", letterSpacing: "-0.02em" }}>
                  gradual
                </span>
                <span style={{ textAlign: "right" }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "1.8cqw",
                      opacity: 0.8,
                      textTransform: "uppercase",
                    }}
                  >
                    # de visitas
                  </span>
                  <span style={{ display: "block", fontSize: "3cqw", fontWeight: 700 }}>0</span>
                </span>
              </div>
              <div
                style={{
                  background: "#efe6d6",
                  padding: "2.2cqw 2.6cqw",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "1.4cqw",
                }}
              >
                {Array.from({ length: 8 }).map((_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: static decorative row
                    key={i}
                    style={{
                      aspectRatio: "1",
                      borderRadius: "9999px",
                      border: `0.4cqw solid ${PRIMARY}`,
                      opacity: 0.55,
                    }}
                  />
                ))}
              </div>
              <div
                style={{
                  padding: "2.2cqw 2.6cqw",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>
                  <span style={{ display: "block", fontSize: "1.8cqw", opacity: 0.8 }}>Nombre</span>
                  <span style={{ display: "block", fontSize: "2.6cqw" }}>Ana Torres</span>
                </span>
                <span>
                  <span style={{ display: "block", fontSize: "1.8cqw", opacity: 0.8 }}>
                    Bebida favorita
                  </span>
                  <span style={{ display: "block", fontSize: "2.6cqw" }}>Latte</span>
                </span>
              </div>
            </div>
            <div
              style={{
                margin: "3cqw 3cqw 0",
                textAlign: "center",
                fontSize: "2.3cqw",
                fontWeight: 600,
                color: "#374151",
              }}
            >
              Guarda tu pase en el celular
            </div>
            <div style={{ margin: "1.6cqw 3cqw 0" }}>
              <div
                className={`ss-btn ${ph === "tapApple" ? "is-pressed" : ""}`}
                style={{ background: "#000", marginTop: 0 }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  style={{ width: "3.2cqw", height: "3.2cqw" }}
                  aria-hidden="true"
                >
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                Agregar a Apple Wallet
              </div>
              <div
                className="ss-btn"
                style={{
                  background: "#fff",
                  color: "#111",
                  border: "1px solid #e5e7eb",
                  marginTop: "1.4cqw",
                }}
              >
                Agregar a Google Wallet
              </div>
            </div>
          </div>
        </div>

        {/* Finger taps */}
        <div
          className={`ss-finger ${ph === "tapContinue" ? "is-on" : ""}`}
          style={{ left: "50%", top: "55%" }}
        />
        <div
          className={`ss-finger ${ph === "tapApple" ? "is-on" : ""}`}
          style={{ left: "50%", top: "77%" }}
        />
      </div>

      <div className="ss-cap" aria-live="polite">
        <span className={`text-gray-500 ${!after("bienvenido") ? "is-on" : ""}`}>
          1 · Tu cliente escanea el QR y deja su correo
        </span>
        <span className={`text-gray-500 ${onWelcome ? "is-on" : ""}`}>
          2 · Toca “Agregar a Apple Wallet”
        </span>
        <span className={`text-gray-500 ${ph === "wallet" ? "is-on" : ""}`}>
          3 · El pase queda en su Wallet, sin descargar nada
        </span>
        <span className={`text-[#0e70db] ${ph === "push" || ph === "hold" ? "is-on" : ""}`}>
          4 · Le llega tu bienvenida
        </span>
      </div>
    </div>
  )
}
