"use client"

import {
  Cake,
  Car,
  Coffee,
  Dumbbell,
  Gift,
  Pause,
  PawPrint,
  Percent,
  Play,
  Scissors,
  Shirt,
  Sparkles,
  Stamp,
  Star,
  Trophy,
  UtensilsCrossed,
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { LivePass, type PassFrame, type PushContent } from "./live-pass"

/**
 * "4 formas de fidelizar": pick a mechanic on the left, see its real pass in
 * the middle and, on the right, how it works, which businesses it fits and a
 * concrete example. Auto-rotates every TAB_MS while in view (progress bar on
 * the active tab); a click jumps to that mechanic and restarts the timer.
 * Each pass plays a two-beat micro-scene while active (visit, then push).
 */

const TAB_MS = 5600

type Scene = "idle" | "visit" | "push" | "hold"
const SCENES: { scene: Scene; ms: number }[] = [
  { scene: "idle", ms: 1000 },
  { scene: "visit", ms: 1000 },
  { scene: "push", ms: 2600 },
  { scene: "hold", ms: 1000 },
]

const VERTICAL_ICON: Record<string, ReactNode> = {
  Cafeterías: <Coffee className="w-3.5 h-3.5" />,
  Barberías: <Scissors className="w-3.5 h-3.5" />,
  Veterinarias: <PawPrint className="w-3.5 h-3.5" />,
  Restaurantes: <UtensilsCrossed className="w-3.5 h-3.5" />,
  "Nail Bars": <Sparkles className="w-3.5 h-3.5" />,
  Gimnasios: <Dumbbell className="w-3.5 h-3.5" />,
  Pastelerías: <Cake className="w-3.5 h-3.5" />,
  Autolavados: <Car className="w-3.5 h-3.5" />,
  Boutiques: <Shirt className="w-3.5 h-3.5" />,
  Spas: <Sparkles className="w-3.5 h-3.5" />,
  "Yoga Studios": <Sparkles className="w-3.5 h-3.5" />,
  Canchas: <Trophy className="w-3.5 h-3.5" />,
}

type Mechanic = {
  key: string
  icon: ReactNode
  accent: string // tailwind bg for the icon tile
  ring: string // tailwind ring/text accents for chips
  title: string
  tagline: string
  how: string
  example: string
  fits: string[]
  pass: { base: string; next?: string; alt: string; frame?: PassFrame; push: PushContent }
}

const MECHANICS: Mechanic[] = [
  {
    key: "stamps",
    icon: <Stamp className="w-5 h-5" />,
    accent: "bg-[#0e70db]",
    ring: "text-[#0e70db] bg-blue-50",
    title: "Estampillas",
    tagline: "Compra 8, llévate 1 gratis. El clásico, ahora digital.",
    how: "Cada visita suma un sello en el pase. Al completar la tarjeta, el premio se desbloquea solo y el cliente recibe un push.",
    example: "Compra 8 cafés y el 9° va por la casa.",
    fits: ["Cafeterías", "Barberías", "Pastelerías", "Autolavados", "Canchas"],
    pass: {
      base: "/landing/mockup-gradual-7.png",
      next: "/landing/mockup-gradual-8.png",
      alt: "Pase de estampillas Gradual Café en Apple Wallet",
      push: {
        title: "Gradual Café",
        body: "¡Completaste tu tarjeta! 🎁 Tu café gratis te espera.",
        icon: <Gift />,
        color: "#e26534",
      },
    },
  },
  {
    key: "points",
    icon: <Star className="w-5 h-5" />,
    accent: "bg-amber-500",
    ring: "text-amber-700 bg-amber-50",
    title: "Puntos",
    tagline: "Cada sol gastado suma. Cada punto cuenta.",
    how: "Cada compra suma puntos según el monto. El cliente los acumula y los canjea por lo que elijas del catálogo de premios.",
    example: "S/ 1 = 1 punto. Con 500 puntos, baño y corte gratis.",
    fits: ["Veterinarias", "Restaurantes", "Boutiques", "Spas", "Gimnasios"],
    pass: {
      base: "/landing/mockup-elpatron.png",
      alt: "Pase de puntos El Patrón Barber en Apple Wallet",
      frame: "wide",
      push: {
        title: "El Patrón Barber",
        body: "Sumaste 45 puntos, Carlos. ⭐ Ya tienes 580 para canjear.",
        icon: <Star />,
        color: "#b8923a",
      },
    },
  },
  {
    key: "discount",
    icon: <Percent className="w-5 h-5" />,
    accent: "bg-[#ff4810]",
    ring: "text-[#c2380c] bg-orange-50",
    title: "Descuentos",
    tagline: "Un beneficio fijo para tus clientes con pase.",
    how: "Un descuento permanente o por días y horas que tú eliges. Ideal para llenar las horas valle con clientes que ya te conocen.",
    example: "Martes 20 % off para clientes con pase.",
    fits: ["Restaurantes", "Nail Bars", "Yoga Studios", "Pastelerías"],
    pass: {
      base: "/landing/mockup-lumi-descuento.png",
      alt: "Pase de descuento Lumi Nail Bar en Apple Wallet",
      push: {
        title: "Lumi Nail Bar",
        body: "Hoy es martes, Valeria 💅 Tu 20 % off te espera hasta las 6 pm.",
        icon: <Percent />,
        color: "#5a2d6e",
      },
    },
  },
  {
    key: "gift",
    icon: <Gift className="w-5 h-5" />,
    accent: "bg-emerald-600",
    ring: "text-emerald-700 bg-emerald-50",
    title: "Cupones de regalo",
    tagline: "Regálale una experiencia a alguien especial.",
    how: "Un pase que se compra para otra persona y se canjea una sola vez. Llega por WhatsApp y va directo a su Wallet.",
    example: "Regala un masaje. Quien lo recibe solo muestra el QR.",
    fits: ["Spas", "Restaurantes", "Pastelerías", "Boutiques"],
    pass: {
      base: "/landing/mockup-aroma-regalo.png",
      alt: "Cupón de regalo Aroma Spa en Apple Wallet",
      push: {
        title: "Aroma Spa",
        body: "Lucía, alguien te regaló un masaje 🎁 Válido hasta el 31 de diciembre.",
        icon: <Gift />,
        color: "#144442",
      },
    },
  },
]

export function MechanicsShowcase({ active }: { active: boolean }) {
  const [tab, setTab] = useState(0)
  const [tick, setTick] = useState(0) // bumped on manual clicks to restart the timer
  const [sceneStep, setSceneStep] = useState(0)
  const [paused, setPaused] = useState(false)
  const running = active && !paused

  // Auto-advance tabs (not while paused).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` intentionally restarts the timer on manual clicks
  useEffect(() => {
    if (!running) return
    const t = setTimeout(() => setTab((v) => (v + 1) % MECHANICS.length), TAB_MS)
    return () => clearTimeout(t)
  }, [running, tab, tick])

  // Micro-scene of the active pass; restarts on every tab change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tab` and `tick` reset the scene on purpose
  useEffect(() => {
    setSceneStep(0)
  }, [tab, tick])
  useEffect(() => {
    if (!active) return
    if (sceneStep >= SCENES.length - 1) return
    const t = setTimeout(() => setSceneStep((s) => s + 1), SCENES[sceneStep].ms)
    return () => clearTimeout(t)
  }, [active, sceneStep])
  const scene = SCENES[sceneStep].scene

  return (
    <div className="mx relative">
      <style>{`
        .mx { --mx-ease-out: cubic-bezier(0.23, 1, 0.32, 1); }

        /* Tabs: quiet at rest, full when active; icon tile lifts slightly */
        .mx-tab { opacity: 0.55; transition: opacity 200ms var(--mx-ease-out), background-color 200ms ease, box-shadow 200ms ease; }
        .mx-tab.is-on { opacity: 1; background: #fff; box-shadow: 0 10px 30px -18px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(15, 23, 42, 0.06); }
        @media (hover: hover) and (pointer: fine) { .mx-tab:hover { opacity: 0.85; } .mx-tab.is-on:hover { opacity: 1; } }
        .mx-tile { transform: scale(0.94); transition: transform 200ms var(--mx-ease-out); }
        .mx-tab.is-on .mx-tile { transform: scale(1); }
        .mx-bar { height: 3px; border-radius: 9999px; background: #e5e7eb; overflow: hidden; }
        .mx-bar > i { display: block; height: 100%; background: #0e70db; transform: scaleX(0); transform-origin: left; }
        .mx-tab.is-on.is-running .mx-bar > i { animation: mx-fill ${TAB_MS}ms linear forwards; }
        .mx-tab.is-paused .mx-bar > i { animation-play-state: paused; }
        @keyframes mx-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

        /* Stacked layers (passes, details): crossfade + short rise */
        .mx-stack { display: grid; }
        .mx-stack > * { grid-area: 1 / 1; }
        .mx-layer { opacity: 0; transform: translateY(12px); pointer-events: none; transition: opacity 320ms var(--mx-ease-out), transform 320ms var(--mx-ease-out); will-change: transform, opacity; }
        .mx-layer.is-on { opacity: 1; transform: translateY(0); pointer-events: auto; }

        /* Detail rows and chips stagger in when their layer turns on */
        .mx-row { opacity: 0; transform: translateY(6px); transition: opacity 240ms var(--mx-ease-out), transform 240ms var(--mx-ease-out); }
        .mx-layer.is-on .mx-row { opacity: 1; transform: translateY(0); transition-delay: calc(80ms + var(--i) * 60ms); }
        .mx-chip { opacity: 0; transform: translateY(4px); transition: opacity 200ms var(--mx-ease-out), transform 200ms var(--mx-ease-out); }
        .mx-layer.is-on .mx-chip { opacity: 1; transform: translateY(0); transition-delay: calc(220ms + var(--i) * 50ms); }

        @media (prefers-reduced-motion: reduce) {
          .mx-tile, .mx-layer, .mx-row, .mx-chip { transform: none !important; }
          .mx-layer, .mx-row, .mx-chip { transition: opacity 200ms ease; transition-delay: 0ms !important; }
          .mx-tab.is-on.is-running .mx-bar > i { animation: none; transform: scaleX(1); }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">
            4 formas de fidelizar
          </h2>
          <p className="text-gray-500 text-lg">
            Elige la mecánica que mejor funciona para tu negocio
          </p>
        </div>

        <div className="grid gap-8 lg:gap-6 lg:grid-cols-[minmax(0,300px)_auto_minmax(0,1fr)] items-center">
          {/* Tabs */}
          <div>
            <div
              className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible -mx-4 px-4 lg:mx-0 lg:px-0 pb-2 lg:pb-0 snap-x"
              role="tablist"
              aria-label="Mecánicas de fidelización"
            >
              {MECHANICS.map((it, i) => {
                const on = i === tab
                return (
                  <button
                    key={it.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => {
                      setTab(i)
                      setTick((t) => t + 1)
                    }}
                    className={`mx-tab snap-start flex-none w-[240px] lg:w-full text-left rounded-2xl p-4 cursor-pointer ${on ? "is-on" : ""} ${active ? "is-running" : ""} ${paused ? "is-paused" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`mx-tile w-10 h-10 rounded-xl ${it.accent} text-white flex items-center justify-center shadow-md flex-shrink-0`}
                      >
                        {it.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900">{it.title}</div>
                        <div className="text-xs text-gray-500 leading-snug line-clamp-2">
                          {it.tagline}
                        </div>
                      </div>
                    </div>
                    <div className="mx-bar mt-3" aria-hidden="true">
                      <i key={`${it.key}-${tick}`} />
                    </div>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              className="mx-pause mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            >
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {paused ? "Reanudar rotación" : "Pausar rotación"}
            </button>
          </div>

          {/* Pass */}
          <div className="justify-self-center">
            <div className="relative w-[280px] sm:w-[320px]">
              <div className="absolute -inset-10 rounded-full bg-[#0e70db]/[0.05] blur-3xl pointer-events-none" />
              <div className="mx-stack relative">
                {MECHANICS.map((it, i) => {
                  const on = i === tab
                  const wide = it.pass.frame === "wide"
                  return (
                    <div
                      key={it.key}
                      className={`mx-layer ${on ? "is-on" : ""} flex justify-center`}
                      aria-hidden={!on}
                    >
                      {/* El Patrón's photo is a tighter crop; scale it so every phone reads the same size */}
                      <div className={wide ? "w-[71%]" : "w-full"}>
                        <LivePass
                          base={it.pass.base}
                          next={it.pass.next}
                          alt={it.pass.alt}
                          frame={it.pass.frame}
                          crossfade={
                            on && (scene === "visit" || scene === "push" || scene === "hold")
                          }
                          push={on && scene === "push" ? it.pass.push : null}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="mx-stack">
            {MECHANICS.map((it, i) => {
              const on = i === tab
              return (
                <div key={it.key} className={`mx-layer ${on ? "is-on" : ""}`} aria-hidden={!on}>
                  <div className="rounded-2xl border border-gray-100 bg-white/70 p-6 sm:p-7 shadow-sm">
                    <div className="mx-row" style={{ "--i": 0 } as CSSProperties}>
                      <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Cómo funciona
                      </div>
                      <p className="text-gray-700 leading-relaxed">{it.how}</p>
                    </div>
                    <div className="mx-row mt-5" style={{ "--i": 1 } as CSSProperties}>
                      <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                        Ideal para
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {it.fits.map((v, j) => (
                          <span
                            key={v}
                            className={`mx-chip inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${it.ring}`}
                            style={{ "--i": j } as CSSProperties}
                          >
                            {VERTICAL_ICON[v]}
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="mx-row mt-5" style={{ "--i": 2 } as CSSProperties}>
                      <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">
                        Ejemplo
                      </div>
                      <p className="text-gray-900 font-semibold">{it.example}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
