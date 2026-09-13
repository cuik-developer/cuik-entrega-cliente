"use client"

import { Cake, Gift, PawPrint } from "lucide-react"
import { useEffect, useState } from "react"
import { LivePass, type PassFrame, type PushContent } from "./live-pass"

/**
 * Hero: three phones on a 3D turntable. The front phone plays its scene, then
 * the turntable rotates and the next phone takes the front. Loops while the
 * hero is in view; pauses otherwise.
 *
 * Slots (offset from the front phone): 0 = front, 1 = back right, 2 = back
 * left. Advancing the front moves front → back left, back left → back right,
 * back right → front, so every phone travels the same circle.
 */

type Scene = "idle" | "visit" | "push"

type Phone = {
  key: string
  base: string
  next?: string
  alt: string
  frame: PassFrame
  width: string // container width that gives every phone the same visual width
  push?: PushContent
}

const PHONES: Phone[] = [
  {
    key: "mascota",
    base: "/landing/mockup-mascotaveloz-2.png",
    next: "/landing/mockup-mascotaveloz-3.png",
    alt: "Pase de fidelización MascotaVeloz en Apple Wallet",
    frame: "standard",
    width: "80%",
    push: {
      title: "Mascota Veloz",
      body: "¡Visita registrada, Diego! 🐾 Te faltan 3 visitas para tu premio.",
      icon: <PawPrint />,
      color: "#d9542b",
    },
  },
  {
    key: "gradual",
    base: "/landing/mockup-gradual-7.png",
    next: "/landing/mockup-gradual-8.png",
    alt: "Pase de fidelización Gradual Café en Apple Wallet",
    frame: "standard",
    width: "80%",
    push: {
      title: "Gradual Café",
      body: "¡Completaste tu tarjeta! 🎁 Tu café gratis te espera.",
      icon: <Gift />,
      color: "#e26534",
    },
  },
  {
    key: "elpatron",
    base: "/landing/mockup-elpatron.png",
    alt: "Pase de puntos El Patrón Barber en Apple Wallet",
    frame: "wide",
    width: "57%",
    push: {
      title: "El Patrón Barber",
      body: "¡Feliz cumpleaños, Carlos! 🎂 Hoy tu corte va por nuestra cuenta.",
      icon: <Cake />,
      color: "#b8923a",
    },
  },
]

// front phone index → scene → how long it holds before the next beat.
const TIMELINE: { front: number; scene: Scene; ms: number }[] = [
  { front: 0, scene: "idle", ms: 1400 },
  { front: 0, scene: "visit", ms: 1200 },
  { front: 0, scene: "push", ms: 2600 },
  { front: 1, scene: "idle", ms: 1400 },
  { front: 1, scene: "visit", ms: 1000 },
  { front: 1, scene: "push", ms: 2400 },
  { front: 2, scene: "idle", ms: 1400 },
  { front: 2, scene: "push", ms: 2600 },
]

export function HeroCarousel({ active }: { active: boolean }) {
  const [step, setStep] = useState(0)
  const [tick, setTick] = useState(0) // bumped on clicks so the timer restarts from the new scene

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` intentionally restarts the timer
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setStep((s) => (s + 1) % TIMELINE.length), TIMELINE[step].ms)
    return () => clearTimeout(t)
  }, [active, step, tick])

  // Clicking a phone brings it to the front and plays its scene from the start.
  const goTo = (phone: number) => {
    if (TIMELINE[step].front === phone) return
    setStep(TIMELINE.findIndex((t) => t.front === phone))
    setTick((t) => t + 1)
  }

  const { front, scene } = TIMELINE[step]

  return (
    <div
      className="hc-stage relative w-[320px] sm:w-[380px] lg:w-[420px] h-[380px] sm:h-[440px] lg:h-[500px]"
      style={{ transformStyle: "preserve-3d", animation: "float 6s ease-in-out infinite" }}
    >
      <style>{`
        .hc-stage { container-type: inline-size; --hc-ease: cubic-bezier(0.77, 0, 0.175, 1); }
        .hc-phone { position: absolute; top: 50%; left: 50%; transform-origin: center center; transition: transform 800ms var(--hc-ease), opacity 800ms var(--hc-ease), filter 800ms var(--hc-ease); will-change: transform, opacity; background: none; border: 0; padding: 0; cursor: pointer; }
        .hc-phone.slot-0 { cursor: default; }
        /* The PNGs have big transparent margins that would swallow clicks meant for the phones behind:
           the button itself ignores the pointer and only the visible phone body (.hc-hit) takes it. */
        .hc-phone { pointer-events: none; }
        .hc-hit { position: absolute; pointer-events: auto; }
        .hc-hit.standard { left: 22.5%; width: 55%; top: 4.5%; height: 91%; }
        .hc-hit.wide { left: 11%; width: 78%; top: 4.5%; height: 91%; }
        .hc-phone.slot-0 .hc-hit { cursor: default; }
        .hc-phone:focus-visible { outline: 2px solid #0e70db; outline-offset: 6px; border-radius: 24px; }
        .hc-phone.slot-0 { transform: translate(-50%, -50%) translateZ(0) rotateY(0deg) scale(1); opacity: 1; filter: blur(0); }
        .hc-phone.slot-1 { transform: translate(calc(-50% + 26cqw), -50%) translateZ(-80px) rotateY(-25deg) scale(0.82); opacity: 0.62; filter: blur(1.5px); }
        .hc-phone.slot-2 { transform: translate(calc(-50% - 26cqw), -50%) translateZ(-80px) rotateY(25deg) scale(0.82); opacity: 0.62; filter: blur(1.5px); }
        @media (prefers-reduced-motion: reduce) {
          .hc-stage { animation: none !important; }
          .hc-phone { transition: opacity 300ms ease; }
        }
      `}</style>

      {PHONES.map((p, i) => {
        const slot = (i - front + PHONES.length) % PHONES.length
        const isFront = slot === 0
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => goTo(i)}
            aria-label={isFront ? p.alt : `Ver ${p.alt}`}
            tabIndex={isFront ? -1 : 0}
            className={`hc-phone slot-${slot}`}
            style={{ width: p.width }}
          >
            <LivePass
              base={p.base}
              next={p.next}
              alt={p.alt}
              frame={p.frame}
              crossfade={isFront && scene !== "idle"}
              push={isFront && scene === "push" ? (p.push ?? null) : null}
              priority
            />
            <span className={`hc-hit ${p.frame}`} aria-hidden="true" />
          </button>
        )
      })}

      {/* Shadow underneath the group */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[80%] h-6 bg-black/10 rounded-full blur-2xl" />
    </div>
  )
}
