"use client"

import Image from "next/image"
import { useRef } from "react"
import { useScrollProgress } from "@/components/landing/fx"

/**
 * The problem, told with the object itself: a worn cardboard card that, as
 * you scroll, lifts, flips in 3D and lands as the pass in the Wallet. The
 * scroll position drives the whole sequence (nothing plays on a timer), so
 * the reader controls the pace and can scrub it back.
 *
 *   --p 0.00–0.25  cardboard at rest, problems listed
 *   --p 0.25–0.60  lift + flip (rotateY 0 → 180)
 *   --p 0.60–1.00  pass settles, glow grows
 */
export function ProblemFlip() {
  const ref = useRef<HTMLDivElement>(null)
  useScrollProgress(ref, { start: 0.12, end: 0.78 })

  return (
    <div
      ref={ref}
      className="pf relative mx-auto w-[280px] sm:w-[340px]"
      style={{ "--p": 0 } as never}
    >
      <style>{`
        /* piecewise progress, defined on the root so the glow and the label can read it too:
           lift 0.2→0.4, flip 0.25→0.6, settle 0.6→1 */
        .pf {
          --p: 0; perspective: 1400px;
          --f: clamp(0, calc((var(--p) - 0.25) / 0.35), 1);
          --lift: clamp(0, calc((var(--p) - 0.2) / 0.2), 1);
          --settle: clamp(0, calc((var(--p) - 0.6) / 0.4), 1);
        }
        .pf-flip {
          position: relative; aspect-ratio: 4 / 5; transform-style: preserve-3d;
          transform:
            translateY(calc(var(--lift) * -18px + var(--settle) * 18px))
            scale(calc(1 + var(--lift) * 0.05 - var(--settle) * 0.05))
            rotateY(calc(var(--f) * 180deg));
          will-change: transform;
        }
        .pf-face { position: absolute; inset: 0; display: grid; place-items: center; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .pf-back { transform: rotateY(180deg); }
        .pf-card { width: 82%; aspect-ratio: 1.62; border-radius: 14px; overflow: hidden; box-shadow: 0 30px 50px -22px rgba(60,40,20,0.6), 0 0 0 1px rgba(60,40,20,0.08); transform: rotate(-3deg); }
        .pf-card img { transform: scale(1.42); transform-origin: 50% 48%; }
        .pf-glow { position: absolute; inset: -12%; border-radius: 9999px; background: radial-gradient(ellipse, rgba(14,112,219,0.22), transparent 62%); filter: blur(24px); opacity: var(--settle); pointer-events: none; }
        .pf-label { position: absolute; left: 50%; bottom: -2.25rem; transform: translateX(-50%); white-space: nowrap; font-size: 0.85rem; font-weight: 600; }
        .pf-label span { position: absolute; left: 50%; transform: translateX(-50%); transition: opacity 250ms ease; }
        .pf-label .a { color: #6b7280; opacity: calc(1 - var(--f)); }
        .pf-label .b { color: #0e70db; opacity: var(--f); }
        @media (prefers-reduced-motion: reduce) {
          .pf-flip { transform: rotateY(calc(round(var(--f)) * 180deg)); transition: none; }
        }
      `}</style>
      <div className="pf-glow" aria-hidden="true" />
      <div className="pf-flip">
        <div className="pf-face">
          <div className="pf-card relative">
            <Image
              src="/landing/old-stamp-card.png"
              alt="Tarjeta de sellos de cartón desgastada"
              fill
              className="object-cover"
              sizes="340px"
            />
          </div>
        </div>
        <div className="pf-face pf-back">
          <Image
            src="/landing/mockup-mascotaveloz-3.png"
            alt="Pase de fidelización Mascota Veloz en Apple Wallet"
            width={564}
            height={1002}
            className="w-full h-auto drop-shadow-2xl"
            sizes="340px"
          />
        </div>
      </div>
      <div className="pf-label" aria-hidden="true">
        <span className="a">Tarjeta de cartón</span>
        <span className="b">Pase en Apple Wallet</span>
      </div>
    </div>
  )
}
