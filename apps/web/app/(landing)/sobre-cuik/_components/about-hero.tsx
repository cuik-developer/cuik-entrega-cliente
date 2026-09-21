"use client"

import { ArrowDown, ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { stepSpring, useReducedMotion } from "@/components/landing/fx"
import { Button } from "@/components/ui/button"

/**
 * Full-bleed dark hero (the be! "hand with phone" opener, in Cuik's world):
 * four real Wallet passes fan out in 3D behind the headline. They rise into
 * place one after another on load; the whole stage then tilts with the
 * pointer on a critically-damped spring, and drifts slowly on its own so
 * the scene never looks frozen. Touch devices get the drift only.
 */

type Phone = { src: string; alt: string; x: number; z: number; ry: number; w: number; d: number }

// x in cqw of the stage, z in px, ry in deg, w = width in cqw, d = entrance delay ms
const PHONES: Phone[] = [
  {
    src: "/landing/mockup-gradual-7.png",
    alt: "Pase de estampillas Gradual Café",
    x: 0,
    z: 40,
    ry: 0,
    w: 56,
    d: 120,
  },
  {
    src: "/landing/mockup-mascotaveloz-3.png",
    alt: "Pase de sellos Mascota Veloz",
    x: -34,
    z: -120,
    ry: 22,
    w: 50,
    d: 320,
  },
  {
    src: "/landing/mockup-lumi-descuento.png",
    alt: "Pase de descuento Lumi Nail Bar",
    x: 34,
    z: -120,
    ry: -22,
    w: 50,
    d: 420,
  },
  {
    src: "/landing/mockup-aroma-regalo.png",
    alt: "Cupón de regalo Aroma Spa",
    x: -60,
    z: -300,
    ry: 34,
    w: 42,
    d: 560,
  },
  {
    src: "/landing/mockup-elpatron.png",
    alt: "Pase de puntos El Patrón Barber",
    x: 60,
    z: -300,
    ry: -34,
    w: 30,
    d: 640,
  },
]

export function AboutHero() {
  const stage = useRef<HTMLDivElement>(null)
  // "static": server HTML as-is (no JS yet, or JS arrived late — no entrance then, no flash).
  // "pending": hidden start pose for one frame, then "ready" plays the entrance.
  const [phase, setPhase] = useState<"static" | "pending" | "ready">("static")
  const reduce = useReducedMotion()

  useLayoutEffect(() => {
    const late = performance.now() > 2500
    if (late) return
    setPhase("pending")
    const t = setTimeout(() => setPhase("ready"), 80)
    return () => clearTimeout(t)
  }, [])

  // Pointer tilt + idle drift, one rAF loop, spring-smoothed.
  useEffect(() => {
    const el = stage.current
    if (!el || reduce) return
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    let rx = { v: 0, x: 0 }
    let ry = { v: 0, x: 0 }
    let tx = 0
    let ty = 0
    let hover = false
    let raf = 0
    let last = 0
    const t0 = performance.now()

    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 1 / 30)
      last = now
      const t = (now - t0) / 1000
      // idle drift: slow figure-eight so the stage breathes when nobody is pointing at it
      const driftX = Math.sin(t * 0.35) * 2.2
      const driftY = Math.sin(t * 0.23 + 1) * 3.5
      const gx = hover ? tx : driftX
      const gy = hover ? ty : driftY
      rx = stepSpring(rx, gx, dt, 0.7)
      ry = stepSpring(ry, gy, dt, 0.7)
      el.style.setProperty("--rx", `${rx.x.toFixed(3)}deg`)
      el.style.setProperty("--ry", `${ry.x.toFixed(3)}deg`)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      ty = (px - 0.5) * 2 * 10
      tx = -(py - 0.5) * 2 * 7
      hover = true
    }
    const leave = () => {
      hover = false
    }
    if (fine) {
      el.addEventListener("pointermove", move)
      el.addEventListener("pointerleave", leave)
    }
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
    }
  }, [reduce])

  return (
    <section className="ah relative overflow-hidden bg-[#0b1220] text-white">
      <style>{`
        .ah { --ah-ease: cubic-bezier(0.23, 1, 0.32, 1); }
        .ah-bg { position: absolute; inset: 0; background:
          radial-gradient(900px 600px at 50% 120%, rgba(14,112,219,0.55), transparent 60%),
          radial-gradient(700px 500px at 15% -10%, rgba(59,142,232,0.22), transparent 60%),
          radial-gradient(600px 400px at 90% 10%, rgba(255,72,16,0.16), transparent 60%);
        }
        .ah-grid { position: absolute; inset: 0; opacity: 0.35; background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 64px 64px; mask-image: radial-gradient(ellipse at 50% 60%, #000 30%, transparent 75%); }
        .ah-stage { container-type: inline-size; perspective: 1600px; --rx: 0deg; --ry: 0deg; }
        .ah-world { position: relative; height: 100%; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateY(var(--ry)); will-change: transform; }
        /* Resting pose is the default (what the server renders); .is-pending is the start pose, .is-ready animates back. */
        .ah-phone { position: absolute; left: 50%; bottom: 0; transform-style: preserve-3d; opacity: 1; transform: translate3d(calc(-50% + var(--x)), 0, var(--z)) rotateY(var(--ry0)) rotateX(0deg); will-change: transform, opacity; }
        .ah.is-pending .ah-phone { opacity: 0; transform: translate3d(calc(-50% + var(--x)), 12%, calc(var(--z) - 240px)) rotateY(var(--ry0)) rotateX(10deg); }
        .ah.is-ready .ah-phone { transition: transform 1500ms var(--ah-ease), opacity 900ms var(--ah-ease); transition-delay: var(--d); }
        .ah-phone img { width: 100%; height: auto; filter: drop-shadow(0 40px 60px rgba(0,0,0,0.55)); }
        .ah-phone.is-back img { filter: drop-shadow(0 30px 40px rgba(0,0,0,0.5)) brightness(0.72); }
        .ah-phone.is-far img { filter: drop-shadow(0 20px 30px rgba(0,0,0,0.5)) brightness(0.5) blur(0.6px); }
        .ah-floor { position: absolute; left: 50%; bottom: -6%; width: 120%; height: 40%; transform: translateX(-50%); background: radial-gradient(ellipse at 50% 50%, rgba(14,112,219,0.35), transparent 60%); filter: blur(30px); }
        .ah.is-pending .ah-copy > * { opacity: 0; transform: translateY(18px); }
        .ah.is-ready .ah-copy > * { opacity: 1; transform: none; transition: opacity 700ms var(--ah-ease), transform 900ms var(--ah-ease); }
        .ah.is-ready .ah-copy > :nth-child(1) { transition-delay: 80ms; }
        .ah.is-ready .ah-copy > :nth-child(2) { transition-delay: 180ms; }
        .ah.is-ready .ah-copy > :nth-child(3) { transition-delay: 300ms; }
        .ah.is-ready .ah-copy > :nth-child(4) { transition-delay: 420ms; }
        .ah-cue { animation: ah-cue 2.2s ease-in-out infinite; }
        @keyframes ah-cue { 0%, 100% { transform: translateY(0); opacity: 0.6 } 50% { transform: translateY(6px); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ah.is-pending .ah-phone { transform: translate3d(calc(-50% + var(--x)), 0, var(--z)) rotateY(var(--ry0)); }
          .ah.is-pending .ah-copy > * { transform: none; }
          .ah.is-ready .ah-phone, .ah.is-ready .ah-copy > * { transition: opacity 300ms ease; }
          .ah-world { transform: none; }
          .ah-cue { animation: none; }
        }
      `}</style>

      <div
        className={`ah relative ${phase === "pending" ? "is-pending" : phase === "ready" ? "is-ready" : ""}`}
      >
        <div className="ah-bg" aria-hidden="true" />
        <div className="ah-grid" aria-hidden="true" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-0 text-center">
          <div className="ah-copy max-w-3xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">Sobre Cuik</p>
            <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[3.75rem] font-extrabold tracking-[-0.02em] leading-[1.04] text-balance">
              La fidelización que usan las grandes cadenas, ahora en la Wallet de tus clientes
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-blue-100/80 max-w-2xl mx-auto leading-relaxed">
              Nacimos en Lima con una obsesión: que el negocio de barrio tenga clientes que vuelven,
              sin apps, sin cartón y con la data en sus manos.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/login?view=demo">
                <Button
                  size="lg"
                  className="w-full sm:w-auto bg-white text-[#0b1220] hover:bg-blue-50 font-bold h-12 rounded-full px-6 group"
                >
                  Agenda una demo
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </Link>
              <Link href="/contacto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-12 rounded-full px-6 font-semibold border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur"
                >
                  Contáctanos
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* 3D stage */}
        <div
          ref={stage}
          className="ah-stage relative mx-auto mt-4 sm:mt-6 w-full max-w-5xl h-[340px] sm:h-[440px] lg:h-[520px]"
          aria-hidden="true"
        >
          <div className="ah-floor" />
          <div className="ah-world">
            {PHONES.map((p, i) => (
              <div
                key={p.src}
                className={`ah-phone ${i >= 3 ? "is-far" : i >= 1 ? "is-back" : ""}`}
                style={
                  {
                    "--x": `${p.x}cqw`,
                    "--z": `${p.z}px`,
                    "--ry0": `${p.ry}deg`,
                    "--d": `${p.d}ms`,
                    width: `${p.w}cqw`,
                    maxWidth: 420,
                    zIndex: 10 - i,
                  } as CSSProperties
                }
              >
                <Image src={p.src} alt="" width={564} height={1002} priority={i === 0} />
              </div>
            ))}
          </div>
        </div>

        <div className="relative pb-8 flex justify-center text-blue-200/70">
          <span className="ah-cue inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <ArrowDown className="w-4 h-4" /> El problema que resolvemos
          </span>
        </div>
      </div>
    </section>
  )
}
