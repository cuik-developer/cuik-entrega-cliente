"use client"

import type { CSSProperties, ReactNode } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * Motion primitives for the marketing pages. No library: CSS 3D transforms,
 * IntersectionObserver for reveals and a tiny critically-damped spring driven
 * by requestAnimationFrame for anything that follows the pointer or the
 * scroll. Every primitive degrades to a plain cross-fade (or nothing) under
 * prefers-reduced-motion.
 */

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduce(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return reduce
}

/* ─── Spring (Apple-style: damping ratio + response) ─────────────────── */

type SpringState = { v: number; x: number }

/**
 * Advance a spring one frame. `response` ≈ seconds to reach the target,
 * `damping` 1 = critically damped (no overshoot). Returns the new state.
 */
export function stepSpring(
  s: SpringState,
  target: number,
  dt: number,
  response = 0.45,
  damping = 1,
): SpringState {
  const w = (2 * Math.PI) / response
  const k = w * w
  const c = 2 * damping * w
  const a = k * (target - s.x) - c * s.v
  const v = s.v + a * dt
  const x = s.x + v * dt
  return { v, x }
}

/* ─── Reveal: rise into view once, staggered by --i ──────────────────── */

export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
  once = true,
  y = 28,
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: "div" | "section" | "li" | "p" | "span" | "h1" | "h2" | "h3"
  once?: boolean
  y?: number
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [on, setOn] = useState(false)
  // Before hydration the server HTML is fully visible (no JS, no hiding). On
  // mount we flag the document as scripted and, in the same pre-paint pass,
  // switch on anything already in view, so nothing flashes.
  useLayoutEffect(() => {
    document.documentElement.classList.add("fx-js")
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < window.innerHeight * 0.94 && r.bottom > 0) setOn(true)
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true)
          if (once) obs.disconnect()
        } else if (!once) setOn(false)
      },
      // Low threshold so blocks taller than the viewport (the contact form on a phone) still reveal.
      { threshold: 0.06, rootMargin: "0px 0px -6% 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [once])
  const Comp = Tag as "div"
  return (
    <Comp
      ref={ref as never}
      className={`fx-reveal ${on ? "is-on" : ""} ${className}`}
      style={{ "--fx-delay": `${delay}ms`, "--fx-y": `${y}px` } as CSSProperties}
    >
      {children}
    </Comp>
  )
}

/* ─── TiltCard: 3D tilt that follows the pointer with a spring ───────── */

export function TiltCard({
  children,
  className = "",
  max = 9,
  glare = true,
  perspective = 1200,
  style,
}: {
  children: ReactNode
  className?: string
  max?: number
  glare?: boolean
  perspective?: number
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    if (!fine) return

    let rx: SpringState = { v: 0, x: 0 }
    let ry: SpringState = { v: 0, x: 0 }
    let gx: SpringState = { v: 0, x: 50 }
    let gy: SpringState = { v: 0, x: 50 }
    let tx = 0
    let ty = 0
    let tgx = 50
    let tgy = 50
    let raf = 0
    let last = 0

    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 1 / 30)
      last = now
      rx = stepSpring(rx, tx, dt, 0.5)
      ry = stepSpring(ry, ty, dt, 0.5)
      gx = stepSpring(gx, tgx, dt, 0.5)
      gy = stepSpring(gy, tgy, dt, 0.5)
      el.style.setProperty("--rx", `${rx.x.toFixed(3)}deg`)
      el.style.setProperty("--ry", `${ry.x.toFixed(3)}deg`)
      el.style.setProperty("--gx", `${gx.x.toFixed(2)}%`)
      el.style.setProperty("--gy", `${gy.x.toFixed(2)}%`)
      const settled =
        Math.abs(rx.x - tx) < 0.02 &&
        Math.abs(ry.x - ty) < 0.02 &&
        Math.abs(rx.v) < 0.05 &&
        Math.abs(ry.v) < 0.05
      raf = settled ? 0 : requestAnimationFrame(frame)
      if (settled) last = 0
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width
      const py = (e.clientY - r.top) / r.height
      ty = (px - 0.5) * 2 * max
      tx = -(py - 0.5) * 2 * max
      tgx = px * 100
      tgy = py * 100
      kick()
    }
    const leave = () => {
      tx = 0
      ty = 0
      tgx = 50
      tgy = 50
      kick()
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      cancelAnimationFrame(raf)
    }
  }, [max, reduce])

  return (
    <div
      ref={ref}
      className={`fx-tilt ${className}`}
      style={{ "--fx-persp": `${perspective}px`, ...style } as CSSProperties}
    >
      <div className="fx-tilt-inner">
        {children}
        {glare && <div className="fx-glare" aria-hidden="true" />}
      </div>
    </div>
  )
}

/* ─── useScrollProgress: 0→1 as an element travels through the viewport ── */

/**
 * Progress of `ref` through the viewport: 0 when its top enters at the
 * bottom edge, 1 when its bottom leaves at the top edge. Smoothed with a
 * spring so fast wheel ticks don't jump. Written to `--p` on the element.
 */
export function useScrollProgress<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  { start = 0, end = 1, smooth = true }: { start?: number; end?: number; smooth?: boolean } = {},
) {
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let s: SpringState = { v: 0, x: 0 }
    let target = 0
    let raf = 0
    let last = 0
    let active = false

    const read = () => {
      const r = el.getBoundingClientRect()
      const vh = window.innerHeight
      const raw = (vh - r.top) / (vh + r.height)
      const p = Math.min(1, Math.max(0, (raw - start) / (end - start)))
      target = p
      if (!smooth || reduce) {
        s = { v: 0, x: p }
        el.style.setProperty("--p", p.toFixed(4))
        return
      }
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 1 / 30)
      last = now
      s = stepSpring(s, target, dt, 0.35)
      el.style.setProperty("--p", s.x.toFixed(4))
      const settled = Math.abs(s.x - target) < 0.0005 && Math.abs(s.v) < 0.001
      raf = settled ? 0 : requestAnimationFrame(frame)
      if (settled) last = 0
    }
    const onScroll = () => {
      if (active) read()
    }
    const io = new IntersectionObserver(
      ([e]) => {
        active = e.isIntersecting
        if (active) read()
      },
      { rootMargin: "20% 0px 20% 0px" },
    )
    io.observe(el)
    read()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", read)
    return () => {
      io.disconnect()
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", read)
      cancelAnimationFrame(raf)
    }
  }, [ref, start, end, smooth, reduce])
}

/* ─── Shared styles (mount once per page) ────────────────────────────── */

export function FxStyles() {
  return (
    <style>{`
      /* Hidden only once JS is running (html.fx-js); server HTML stays readable without it. */
      .fx-reveal { transition: opacity 700ms cubic-bezier(0.23, 1, 0.32, 1), transform 900ms cubic-bezier(0.23, 1, 0.32, 1); transition-delay: var(--fx-delay, 0ms); will-change: transform, opacity; }
      .fx-js .fx-reveal:not(.is-on) { opacity: 0; transform: translateY(var(--fx-y, 28px)); }

      .fx-tilt { perspective: var(--fx-persp, 1200px); --rx: 0deg; --ry: 0deg; --gx: 50%; --gy: 50%; }
      .fx-tilt-inner { position: relative; transform: rotateX(var(--rx)) rotateY(var(--ry)); transform-style: preserve-3d; will-change: transform; }
      .fx-glare { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: radial-gradient(420px circle at var(--gx) var(--gy), rgba(255,255,255,0.28), rgba(255,255,255,0) 60%); mix-blend-mode: soft-light; opacity: 0.9; }

      @media (prefers-reduced-motion: reduce) {
        .fx-reveal { transition: opacity 300ms ease; }
        .fx-js .fx-reveal:not(.is-on) { transform: none; }
        .fx-tilt-inner { transform: none; }
        .fx-glare { display: none; }
      }
    `}</style>
  )
}
