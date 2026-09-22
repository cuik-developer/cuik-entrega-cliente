"use client"

import { BarChart3, Palette, PawPrint, RefreshCw, Smartphone, Wallet } from "lucide-react"
import Image from "next/image"
import type { CSSProperties, ReactNode } from "react"
import { useRef } from "react"
import { useScrollProgress } from "./fx"
import { LivePass, type PushContent } from "./live-pass"

/**
 * "El antes y el ahora", driven by the scroll like the flip on Sobre Cuik:
 * as the section travels up the screen the cardboard card lifts, flips in
 * 3D and lands as the pass in the Wallet. By the time the section sits in
 * the middle of the viewport it is fully turned; further down the pass
 * registers a visit and the push arrives. Scrolling back reverses it.
 *
 *   --p 0.00–0.15  cardboard at rest
 *   --p 0.15–0.50  lift + flip (rotateY 0 → 180); cons get struck, pros rise
 *   --p 0.58+      visit registered (2 → 3), then the push (0.66+)
 */

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

export function BeforeAfter({ active: _active }: { active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  // Progress of the whole section through the viewport; 0.5 ≈ centred on screen.
  useScrollProgress(ref, { start: 0.08, end: 0.92 })

  return (
    <div ref={ref} className="ba relative" style={{ "--p": 0 } as CSSProperties}>
      <style>{`
        .ba {
          --p: 0;
          --ba-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
          --f: clamp(0, calc((var(--p) - 0.15) / 0.35), 1);          /* flip */
          --lift: clamp(0, calc((var(--p) - 0.12) / 0.15), 1);       /* rise before the turn */
          --settle: clamp(0, calc((var(--p) - 0.42) / 0.12), 1);     /* land after the turn */
          --pros: clamp(0, calc((var(--p) - 0.34) / 0.2), 1);
        }
        .ba-stage { perspective: 1400px; }
        .ba-lift { transform: translateY(calc((var(--lift) - var(--settle)) * -10px)) scale(calc(1 + (var(--lift) - var(--settle)) * 0.04)); will-change: transform; }
        .ba-flip { position: relative; transform-style: preserve-3d; transform: rotateY(calc(var(--f) * 180deg)); will-change: transform; }
        .ba-face { position: absolute; inset: 0; display: grid; place-items: center; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .ba-face-back { transform: rotateY(180deg); }
        .ba-card { width: 80%; aspect-ratio: 1.62; border-radius: 14px; overflow: hidden; box-shadow: 0 30px 50px -22px rgba(60, 40, 20, 0.6), 0 0 0 1px rgba(60, 40, 20, 0.08); transform: rotate(-3deg); }
        .ba-card img { transform: scale(1.42); transform-origin: 50% 48%; }

        /* Cons: struck through as the card turns (each a little later) */
        .ba-con { position: relative; opacity: calc(1 - var(--f) * 0.55); }
        .ba-con i { position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: #b4432a; transform: scaleX(clamp(0, calc(var(--f) * 1.6 - var(--i) * 0.25), 1)); transform-origin: left center; }

        /* Pros: rise one by one once the pass is up */
        .ba-pro { --k: clamp(0, calc(var(--pros) * 2.5 - var(--i) * 0.3), 1); opacity: var(--k); transform: translateY(calc((1 - var(--k)) * 10px)); }

        /* Caption under the stage */
        .ba-cap { display: grid; }
        .ba-cap > span { grid-area: 1 / 1; transition: opacity 260ms var(--ba-ease-out); }
        .ba-cap .a { opacity: calc(1 - var(--f)); }
        .ba-cap .b { opacity: var(--f); }

        @media (prefers-reduced-motion: reduce) {
          .ba-lift { transform: none; }
          .ba-flip { transform: rotateY(calc(round(var(--f)) * 180deg)); }
          .ba-pro { transform: none; }
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
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
              Antes
            </div>
            <ul className="space-y-3">
              {CONS.map((c, i) => (
                <li key={c}>
                  <span
                    className="ba-con inline-block text-lg text-gray-700"
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
            <div className="ba-stage relative w-[300px] sm:w-[360px]">
              <div className="absolute -inset-10 rounded-full bg-[#0e70db]/[0.06] blur-3xl pointer-events-none" />
              <div className="ba-lift relative">
                <div className="ba-flip aspect-[4/5]">
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
                      <BackPass />
                    </div>
                  </div>
                </div>
              </div>
              <div className="ba-cap text-center mt-2 text-sm font-medium">
                <span className="a text-gray-400">Tarjeta de cartón</span>
                <span className="b text-[#0e70db]">Pase digital en Apple Wallet</span>
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
                  className="ba-pro flex items-center gap-3"
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

/**
 * The pass on the back face. The visit and the push follow the scroll too:
 * they read --p from the section through a tiny observer on the CSS var.
 */
function BackPass() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="ba-back">
      <style>{`
        /* The crossfade and the push are class-driven inside LivePass; the section
           toggles them from --p with two thresholds via these container-level hooks. */
        .ba-back { --visit: clamp(0, calc((var(--p) - 0.58) / 0.04), 1); --push: clamp(0, calc((var(--p) - 0.66) / 0.04), 1); }
        .ba-back .lp-next { opacity: var(--visit) !important; transition: none; }
        .ba-back .lp-push { opacity: var(--push) !important; transform: translateY(calc((1 - var(--push)) * -140%)) !important; transition: none; }
      `}</style>
      <LivePass
        base="/landing/mockup-mascotaveloz-2.png"
        next="/landing/mockup-mascotaveloz-3.png"
        alt="Pase de fidelización Mascota Veloz en Apple Wallet"
        crossfade={false}
        push={VISIT_PUSH}
      />
    </div>
  )
}
