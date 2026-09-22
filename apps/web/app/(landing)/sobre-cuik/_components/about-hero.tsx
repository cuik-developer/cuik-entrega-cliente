"use client"

import { ArrowDown, ArrowRight } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { stepSpring, useReducedMotion } from "@/components/landing/fx"
import { Button } from "@/components/ui/button"

/**
 * Full-bleed dark hero: five real Wallet passes fan out in 3D behind the
 * headline. They rise into place one after another on load; the stage then
 * tilts with the pointer on a critically-damped spring and drifts slowly on
 * its own. Tapping any pass swaps it with the front one, so visitors can
 * browse the five mechanics.
 */

type Phone = { key: string; src: string; label: string; wide?: boolean }
type Slot = { x: number; z: number; ry: number; w: number; d: number }

const PHONES: Phone[] = [
  { key: "gradual", src: "/landing/mockup-gradual-7.png", label: "Estampillas · Gradual Café" },
  { key: "mascota", src: "/landing/mockup-mascotaveloz-3.png", label: "Sellos · Mascota Veloz" },
  { key: "lumi", src: "/landing/mockup-lumi-descuento.png", label: "Descuento · Lumi Nail Bar" },
  { key: "aroma", src: "/landing/mockup-aroma-regalo.png", label: "Cupón de regalo · Aroma Spa" },
  {
    key: "elpatron",
    src: "/landing/mockup-elpatron.png",
    label: "Puntos · El Patrón Barber",
    wide: true,
  },
]

// x in cqw of the stage, z in px, ry in deg, w = width in cqw (standard frame), d = entrance delay
const SLOTS: Slot[] = [
  { x: 0, z: 40, ry: 0, w: 56, d: 120 },
  { x: -34, z: -120, ry: 22, w: 50, d: 320 },
  { x: 34, z: -120, ry: -22, w: 50, d: 420 },
  { x: -60, z: -300, ry: 34, w: 42, d: 560 },
  { x: 60, z: -300, ry: -34, w: 42, d: 640 },
]

// The El Patrón photo is a tighter crop (phone = 78% of the width vs 55%): scale its box down.
const WIDE_SCALE = 0.55 / 0.78

export function AboutHero() {
  const stage = useRef<HTMLDivElement>(null)
  const hero = useRef<HTMLDivElement>(null)
  // "static": server HTML as-is (no JS yet, or JS arrived late — no entrance then, no flash).
  // "pending": hidden start pose for one frame; "ready": entrance plays; "done": free to swap.
  const [phase, setPhase] = useState<"static" | "pending" | "ready" | "done">("static")
  // order[slot] = phone index
  const [order, setOrder] = useState<number[]>([0, 1, 2, 3, 4])
  const reduce = useReducedMotion()

  useLayoutEffect(() => {
    if (performance.now() > 2500) {
      setPhase("done")
      return
    }
    setPhase("pending")
    const t1 = setTimeout(() => setPhase("ready"), 80)
    const t2 = setTimeout(() => setPhase("done"), 2400)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  // Pointer tilt + idle drift, one rAF loop, spring-smoothed.
  useEffect(() => {
    const el = stage.current
    const host = hero.current
    if (!el || !host || reduce) return
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
      const driftX = Math.sin(t * 0.35) * 2.2
      const driftY = Math.sin(t * 0.23 + 1) * 3.5
      rx = stepSpring(rx, hover ? tx : driftX, dt, 0.7)
      ry = stepSpring(ry, hover ? ty : driftY, dt, 0.7)
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
      host.addEventListener("pointermove", move)
      host.addEventListener("pointerleave", leave)
    }
    return () => {
      cancelAnimationFrame(raf)
      host.removeEventListener("pointermove", move)
      host.removeEventListener("pointerleave", leave)
    }
  }, [reduce])

  // Tap a pass: it swaps places with the one at the front.
  const bringToFront = (slot: number) => {
    if (slot === 0) return
    setOrder((o) => {
      const next = [...o]
      const front = next[0]
      next[0] = next[slot]
      next[slot] = front
      return next
    })
  }

  const stateClass =
    phase === "pending"
      ? "is-pending"
      : phase === "ready"
        ? "is-ready"
        : phase === "done"
          ? "is-done"
          : ""

  return (
    <section className="relative overflow-hidden bg-[#0b1220] text-white">
      <style>{`
        .ah { --ah-ease: cubic-bezier(0.23, 1, 0.32, 1); --ah-move: cubic-bezier(0.77, 0, 0.175, 1); }
        .ah-bg { position: absolute; inset: 0; background:
          radial-gradient(900px 600px at 50% 120%, rgba(14,112,219,0.55), transparent 60%),
          radial-gradient(700px 500px at 15% -10%, rgba(59,142,232,0.22), transparent 60%),
          radial-gradient(600px 400px at 90% 10%, rgba(255,72,16,0.16), transparent 60%);
        }
        .ah-grid { position: absolute; inset: 0; opacity: 0.35; background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 64px 64px; mask-image: radial-gradient(ellipse at 50% 60%, #000 30%, transparent 75%); }
        .ah-stage { container-type: inline-size; perspective: 1600px; --rx: 0deg; --ry: 0deg; pointer-events: none; }
        .ah-world { position: relative; height: 100%; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateY(var(--ry)); will-change: transform; }
        /* Resting pose is the default (what the server renders). */
        .ah-phone { position: absolute; left: 50%; bottom: 0; transform-style: preserve-3d; background: none; border: 0; padding: 0; opacity: 1; transform: translate3d(calc(-50% + var(--x)), 0, var(--z)) rotateY(var(--ry0)) rotateX(0deg); will-change: transform, opacity; pointer-events: none; }
        .ah.is-pending .ah-phone { opacity: 0; transform: translate3d(calc(-50% + var(--x)), 12%, calc(var(--z) - 240px)) rotateY(var(--ry0)) rotateX(10deg); }
        .ah.is-ready .ah-phone { transition: transform 1500ms var(--ah-ease), opacity 900ms var(--ah-ease); transition-delay: var(--d); }
        /* After the entrance, swaps travel on one shared curve, no stagger */
        .ah.is-done .ah-phone { transition: transform 900ms var(--ah-move), width 900ms var(--ah-move); }
        .ah-phone img { width: 100%; height: auto; filter: drop-shadow(0 40px 60px rgba(0,0,0,0.55)); transition: filter 900ms var(--ah-move); }
        .ah-phone.is-back img { filter: drop-shadow(0 30px 40px rgba(0,0,0,0.5)) brightness(0.72); }
        .ah-phone.is-far img { filter: drop-shadow(0 20px 30px rgba(0,0,0,0.5)) brightness(0.5) blur(0.6px); }
        /* Only the visible phone body takes the pointer (the PNGs have big transparent margins) */
        .ah-hit { position: absolute; pointer-events: auto; cursor: pointer; border-radius: 12%; left: 22.6%; width: 54.8%; top: 6.2%; height: 88.5%; }
        .ah-hit.is-wide { left: 11.1%; width: 77.8%; }
        .ah-phone.is-front .ah-hit { cursor: default; }
        .ah-phone:focus-visible { outline: none; }
        .ah-phone:focus-visible .ah-hit { outline: 2px solid #3b8ee8; outline-offset: 6px; }
        @media (hover: hover) and (pointer: fine) { .ah-phone:not(.is-front):hover img { filter: drop-shadow(0 30px 40px rgba(0,0,0,0.5)) brightness(0.9); } }
        .ah-floor { position: absolute; left: 50%; bottom: -6%; width: 120%; height: 40%; transform: translateX(-50%); background: radial-gradient(ellipse at 50% 50%, rgba(14,112,219,0.35), transparent 60%); filter: blur(30px); pointer-events: none; }
        .ah.is-pending .ah-copy > * { opacity: 0; transform: translateY(18px); }
        .ah.is-ready .ah-copy > * { opacity: 1; transform: none; transition: opacity 700ms var(--ah-ease), transform 900ms var(--ah-ease); }
        .ah.is-ready .ah-copy > :nth-child(1) { transition-delay: 80ms; }
        .ah.is-ready .ah-copy > :nth-child(2) { transition-delay: 180ms; }
        .ah.is-ready .ah-copy > :nth-child(3) { transition-delay: 300ms; }
        .ah.is-ready .ah-copy > :nth-child(4) { transition-delay: 420ms; }
        .ah-label { display: grid; }
        .ah-label > span { grid-area: 1 / 1; opacity: 0; transform: translateY(4px); transition: opacity 300ms var(--ah-ease), transform 300ms var(--ah-ease); }
        .ah-label > span.is-on { opacity: 1; transform: none; }
        .ah-cue { animation: ah-cue 2.2s ease-in-out infinite; }
        @keyframes ah-cue { 0%, 100% { transform: translateY(0); opacity: 0.6 } 50% { transform: translateY(6px); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .ah.is-pending .ah-phone { transform: translate3d(calc(-50% + var(--x)), 0, var(--z)) rotateY(var(--ry0)); }
          .ah.is-pending .ah-copy > * { transform: none; }
          .ah.is-ready .ah-phone, .ah.is-ready .ah-copy > * { transition: opacity 300ms ease; }
          .ah.is-done .ah-phone { transition: opacity 300ms ease; }
          .ah-world { transform: none; }
          .ah-cue { animation: none; }
        }
      `}</style>

      <div ref={hero} className={`ah relative ${stateClass}`}>
        <div className="ah-bg" aria-hidden="true" />
        <div className="ah-grid" aria-hidden="true" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-0 text-center">
          <div className="ah-copy max-w-3xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300">Sobre Cuik</p>
            <h1 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] leading-[1.08] text-balance max-w-4xl mx-auto">
              La fidelización que usan las grandes cadenas, ahora en la Wallet de tus clientes
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-blue-100/80 max-w-2xl mx-auto leading-relaxed">
              Nacimos en Lima con una obsesión: que los negocios locales tengan clientes que
              vuelven, sin apps, sin cartón y con la data en sus manos.
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
        >
          <div className="ah-floor" aria-hidden="true" />
          <div className="ah-world">
            {PHONES.map((p, i) => {
              const slot = order.indexOf(i)
              const s = SLOTS[slot]
              const w = p.wide ? s.w * WIDE_SCALE : s.w
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => bringToFront(slot)}
                  aria-label={slot === 0 ? p.label : `Ver al frente: ${p.label}`}
                  tabIndex={slot === 0 ? -1 : 0}
                  className={`ah-phone ${slot === 0 ? "is-front" : slot >= 3 ? "is-far" : "is-back"}`}
                  style={
                    {
                      "--x": `${s.x}cqw`,
                      "--z": `${s.z}px`,
                      "--ry0": `${s.ry}deg`,
                      "--d": `${s.d}ms`,
                      width: `${w}cqw`,
                      maxWidth: p.wide ? 420 * WIDE_SCALE : 420,
                      zIndex: 10 - slot,
                    } as CSSProperties
                  }
                >
                  <Image src={p.src} alt="" width={564} height={1002} priority={slot === 0} />
                  <span className={`ah-hit ${p.wide ? "is-wide" : ""}`} aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </div>

        <div className="relative pb-8 flex flex-col items-center gap-3 text-blue-200/70">
          <div className="ah-label text-sm font-semibold text-blue-100/90" aria-live="polite">
            {PHONES.map((p, i) => (
              <span key={p.key} className={order[0] === i ? "is-on" : ""}>
                {p.label}
              </span>
            ))}
          </div>
          <span className="text-xs text-blue-200/60">Toca un pase para verlo al frente</span>
          <span className="ah-cue inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
            <ArrowDown className="w-4 h-4" /> El problema que resolvemos
          </span>
        </div>
      </div>
    </section>
  )
}
