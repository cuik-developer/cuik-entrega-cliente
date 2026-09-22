"use client"

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Loader2,
  MessageCircle,
  Store,
  Users,
} from "lucide-react"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { stepSpring, useReducedMotion } from "@/components/landing/fx"
import { CONTACT_EMAIL, WHATSAPP_URL } from "@/components/landing/site-footer"

/**
 * Contáctanos as a conversation, in the home's visual language: white field
 * with the same soft blue/orange glows and grain the home uses, 16px-radius
 * cards with a hairline border, orange primary action.
 *
 *  1. "Hablemos" writes itself (variable weight). One question — ¿Qué te
 *     trae por aquí? — and three cards that tilt toward the pointer.
 *  2. Pick one: the others fall away, the camera pushes in and the
 *     conversation opens in a card.
 *  3. One question per screen. Enter advances, answers thread above, a
 *     hairline shows progress.
 *  4. Sent: the card turns Cuik blue with one line. WhatsApp stays one tap
 *     away the whole time.
 */

type Profile = "negocio" | "cliente" | "otro"

const PROFILES: { value: Profile; icon: ReactNode; tile: string; title: string; text: string }[] = [
  {
    value: "negocio",
    icon: <Store className="w-5 h-5" />,
    tile: "bg-[#0e70db]",
    title: "Tengo un negocio",
    text: "Quiero que mis clientes vuelvan más.",
  },
  {
    value: "cliente",
    icon: <Users className="w-5 h-5" />,
    tile: "bg-emerald-600",
    title: "Ya uso Cuik",
    text: "Necesito ayuda con mi pase o mi cuenta.",
  },
  {
    value: "otro",
    icon: <Building2 className="w-5 h-5" />,
    tile: "bg-[#ff4810]",
    title: "Prensa o alianzas",
    text: "Medios, integraciones, proveedores.",
  },
]

type Field = "name" | "business" | "email" | "phone" | "message"
type Question = {
  field: Field
  ask: (a: Answers) => string
  placeholder: string
  type?: "text" | "email" | "tel" | "textarea"
  optional?: boolean
  validate?: (v: string) => string | null
}

type Answers = Record<Field, string>
const EMPTY: Answers = { name: "", business: "", email: "", phone: "", message: "" }

const first = (name: string) => name.trim().split(/\s+/)[0] || ""

function questionsFor(profile: Profile): Question[] {
  const business: Question = {
    field: "business",
    ask: (a) =>
      profile === "otro"
        ? `¿De qué empresa o medio nos escribes, ${first(a.name)}?`
        : profile === "cliente"
          ? `¿Cuál es tu negocio en Cuik, ${first(a.name)}?`
          : `¿Cómo se llama tu negocio, ${first(a.name)}?`,
    placeholder: profile === "otro" ? "Nombre de la empresa" : "Café Central",
    optional: true,
  }
  return [
    {
      field: "name",
      ask: () => "¿Cómo te llamas?",
      placeholder: "Tu nombre",
      validate: (v) => (v.trim().length < 2 ? "Cuéntanos tu nombre" : null),
    },
    business,
    {
      field: "email",
      ask: () => "¿A qué correo te respondemos?",
      placeholder: "tu@correo.com",
      type: "email",
      validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? null : "Revisa el correo"),
    },
    {
      field: "phone",
      ask: () => "¿Tienes WhatsApp? Así te contestamos más rápido.",
      placeholder: "+51 999 999 999",
      type: "tel",
      optional: true,
    },
    {
      field: "message",
      ask: () =>
        profile === "negocio"
          ? "Cuéntanos de tu negocio: rubro, locales y qué te gustaría lograr."
          : profile === "cliente"
            ? "¿Qué necesitas? Si es sobre un pase o una campaña, dinos cuál."
            : "Cuéntanos de qué se trata.",
      placeholder: "Escribe aquí…",
      type: "textarea",
      validate: (v) => (v.trim().length < 10 ? "Cuéntanos un poco más" : null),
    },
  ]
}

type Stage = "pick" | "leaving" | "chat" | "sent"

export function ContactExperience() {
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<Stage>("pick")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [answers, setAnswers] = useState<Answers>(EMPTY)
  const [qi, setQi] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const questions = profile ? questionsFor(profile) : []
  const q = questions[qi]
  const current = PROFILES.find((p) => p.value === profile)

  const pick = (p: Profile) => {
    setProfile(p)
    setStage("leaving")
    setTimeout(() => setStage("chat"), reduce ? 0 : 520)
  }

  // Focus the current answer field on each step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus on every question change
  useEffect(() => {
    if (stage !== "chat") return
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [stage, qi])

  const next = async () => {
    if (!q) return
    const v = answers[q.field]
    const err = q.validate?.(v) ?? null
    if (err && !(q.optional && !v.trim())) {
      setError(err)
      return
    }
    setError(null)
    if (qi < questions.length - 1) {
      setDir(1)
      setQi(qi + 1)
      return
    }
    await send()
  }
  const back = () => {
    if (qi === 0) {
      setStage("pick")
      setProfile(null)
      return
    }
    setError(null)
    setDir(-1)
    setQi(qi - 1)
  }

  const send = async () => {
    setSending(true)
    setFailed(null)
    try {
      const res = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, profile, website: "" }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) setStage("sent")
      else setFailed(json?.error ?? "No pudimos enviar tu mensaje.")
    } catch {
      setFailed("No pudimos enviar tu mensaje.")
    } finally {
      setSending(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(q?.type === "textarea" && e.shiftKey)) {
      e.preventDefault()
      void next()
    }
  }

  const progress = questions.length ? qi / questions.length : 0

  return (
    <section className="ce relative overflow-hidden grain min-h-[calc(100dvh-4rem)] flex flex-col">
      <style>{`
        .ce { --out: cubic-bezier(0.23, 1, 0.32, 1); --io: cubic-bezier(0.77, 0, 0.175, 1); }
        .grain::after { content: ''; position: absolute; inset: 0; opacity: 0.025; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); pointer-events: none; }

        /* Kinetic title: each glyph rises and thickens (variable font weight) */
        .ce-title span { display: inline-block; opacity: 0; transform: translateY(0.35em); font-weight: 300; animation: ce-glyph 900ms var(--out) forwards; animation-delay: calc(var(--i) * 70ms + 150ms); }
        @keyframes ce-glyph { to { opacity: 1; transform: none; font-weight: 800; } }
        .ce-rise { opacity: 0; transform: translateY(12px); animation: ce-rise 800ms var(--out) forwards; animation-delay: var(--d, 820ms); }
        @keyframes ce-rise { to { opacity: 1; transform: none; } }

        /* Choice cards: the home's card, tilting toward the pointer */
        .ce-cards { display: grid; gap: 1rem; transition: transform 560ms var(--io), opacity 420ms var(--out), filter 560ms var(--io); transform-origin: 50% 40%; }
        .ce-cards.is-leaving { transform: scale(1.22); opacity: 0; filter: blur(8px); pointer-events: none; }
        .ce-card { position: relative; text-align: left; border-radius: 1rem; padding: 1.5rem; background: #fff; border: 1px solid #f3f4f6; box-shadow: 0 1px 2px rgba(15,23,42,0.04); transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform 120ms linear, box-shadow 300ms var(--out), border-color 300ms var(--out); opacity: 0; animation: ce-rise 900ms var(--out) forwards; animation-delay: calc(1000ms + var(--i) * 110ms); will-change: transform; cursor: pointer; }
        .ce-card::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(360px circle at var(--gx, 50%) var(--gy, 50%), rgba(14,112,219,0.08), transparent 60%); opacity: 0; transition: opacity 300ms var(--out); pointer-events: none; }
        @media (hover: hover) and (pointer: fine) {
          .ce-card:hover { border-color: rgba(14,112,219,0.35); box-shadow: 0 30px 60px -30px rgba(15,23,42,0.35); }
          .ce-card:hover::after { opacity: 1; }
        }
        .ce-card:active { transform: perspective(1000px) scale(0.985); }
        .ce-card:focus-visible { outline: 2px solid #0e70db; outline-offset: 4px; }
        .ce-cards.is-leaving .ce-card.is-picked { border-color: rgba(14,112,219,0.6); background: #eaf2fd; }

        /* Conversation card lands where the chosen card was */
        .ce-panel { position: relative; border-radius: 1rem; background: #fff; border: 1px solid #f3f4f6; box-shadow: 0 30px 60px -30px rgba(15,23,42,0.3); overflow: hidden; animation: ce-land 700ms var(--out) both; }
        @keyframes ce-land { from { opacity: 0; transform: scale(0.94) translateY(16px); } to { opacity: 1; transform: none; } }
        .ce-panel.is-sent { background: #0c3d7a; border-color: #0c3d7a; color: #fff; }
        .ce-bar { position: absolute; left: 0; top: 0; height: 3px; width: 100%; background: #0e70db; transform-origin: left; transform: scaleX(var(--p)); transition: transform 600ms var(--io); }

        .ce-thread { display: flex; flex-direction: column; gap: 0.35rem; }
        .ce-thread > div { display: flex; align-items: baseline; gap: 0.6rem; font-size: 0.875rem; color: #6b7280; animation: ce-rise 400ms var(--out) both; --d: 0ms; }
        .ce-thread b { color: #111827; font-weight: 600; }

        .ce-q { animation: ce-in 520ms var(--out) both; }
        .ce-q.is-back { animation-name: ce-in-back; }
        @keyframes ce-in { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @keyframes ce-in-back { from { opacity: 0; transform: translateY(-28px); } to { opacity: 1; transform: none; } }
        .ce-input { width: 100%; background: transparent; border: 0; border-bottom: 2px solid #e5e7eb; color: #111827; font-size: clamp(1.25rem, 2.2vw, 1.6rem); font-weight: 600; letter-spacing: -0.01em; padding: 0.6rem 0; outline: none; transition: border-color 200ms var(--out); resize: none; line-height: 1.3; }
        .ce-input::placeholder { color: #9ca3af; font-weight: 500; }
        .ce-input:focus { border-color: #0e70db; }

        /* WhatsApp, always one tap away */
        .ce-wa { position: fixed; right: 1rem; bottom: 1rem; z-index: 40; display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.9rem 0.55rem 0.55rem; border-radius: 0.875rem; background: #fff; color: #111827; border: 1px solid #f3f4f6; box-shadow: 0 20px 50px -20px rgba(15,23,42,0.35); transition: transform 200ms var(--out), box-shadow 200ms var(--out); animation: ce-rise 700ms var(--out) both; --d: 1400ms; }
        .ce-wa:hover { transform: translateY(-2px); box-shadow: 0 26px 60px -20px rgba(15,23,42,0.4); }
        .ce-wa:active { transform: scale(0.98); }

        @media (prefers-reduced-motion: reduce) {
          .ce-title span, .ce-rise, .ce-card, .ce-panel, .ce-q, .ce-thread > div, .ce-wa { animation: ce-fade 300ms ease forwards !important; animation-delay: 0ms !important; transform: none !important; }
          @keyframes ce-fade { to { opacity: 1; } }
          .ce-cards.is-leaving { transform: none; filter: none; }
          .ce-card { transform: none !important; }
        }
      `}</style>

      {/* The home's background: subtle radial glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full bg-[#0e70db]/[0.05] blur-3xl" />
        <div className="absolute bottom-[-10%] right-[5%] w-[500px] h-[500px] rounded-full bg-[#ff4810]/[0.04] blur-3xl" />
      </div>

      <div className="relative flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-24 flex flex-col">
        <p
          className="ce-rise text-xs font-bold uppercase tracking-wider text-gray-400"
          style={{ "--d": "0ms" } as CSSProperties}
        >
          Contáctanos
        </p>
        <h1
          className="ce-title mt-4 text-5xl sm:text-6xl lg:text-[4.25rem] font-extrabold text-gray-900 leading-[1.08] tracking-tight"
          aria-label="Hablemos"
        >
          {"Hablemos".split("").map((ch, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: glyph order is the key
              key={i}
              style={{ "--i": i } as CSSProperties}
              aria-hidden="true"
            >
              {ch}
            </span>
          ))}
        </h1>
        <p className="ce-rise mt-5 text-lg sm:text-xl text-gray-500 leading-relaxed max-w-lg">
          Te responde una persona del equipo en menos de un día hábil. Sin call center, sin tickets.
        </p>

        <div className="mt-12 sm:mt-14 flex-1 flex flex-col justify-center">
          {(stage === "pick" || stage === "leaving") && (
            <div>
              <p
                className="ce-rise text-xs font-bold uppercase tracking-wider text-gray-400 mb-4"
                style={{ "--d": "900ms" } as CSSProperties}
              >
                ¿Qué te trae por aquí?
              </p>
              <div className={`ce-cards sm:grid-cols-3 ${stage === "leaving" ? "is-leaving" : ""}`}>
                {PROFILES.map((p, i) => (
                  <ChoiceCard
                    key={p.value}
                    index={i}
                    picked={profile === p.value}
                    onPick={() => pick(p.value)}
                    disabled={stage === "leaving"}
                  >
                    <span
                      className={`w-11 h-11 rounded-xl ${p.tile} text-white flex items-center justify-center mb-5 shadow-md`}
                    >
                      {p.icon}
                    </span>
                    <span className="block text-lg font-bold text-gray-900 tracking-tight">
                      {p.title}
                    </span>
                    <span className="block mt-1 text-sm text-gray-500">{p.text}</span>
                    <ArrowRight className="absolute right-5 top-5 w-4 h-4 text-gray-300" />
                  </ChoiceCard>
                ))}
              </div>
            </div>
          )}

          {stage === "chat" && q && current && (
            <div className="ce-panel max-w-3xl w-full p-6 sm:p-10">
              <div
                className="ce-bar"
                style={{ "--p": progress } as CSSProperties}
                aria-hidden="true"
              />

              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-400">
                <span className="inline-flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-md ${current.tile} text-white flex items-center justify-center [&>svg]:w-3.5 [&>svg]:h-3.5`}
                  >
                    {current.icon}
                  </span>
                  {current.title}
                </span>
                <span>
                  {qi + 1} / {questions.length}
                </span>
              </div>

              {qi > 0 && (
                <div className="ce-thread mt-6">
                  {questions.slice(0, qi).map((prev) =>
                    answers[prev.field].trim() ? (
                      <div key={prev.field}>
                        <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 translate-y-0.5" />
                        <span>
                          <b>{answers[prev.field]}</b>
                        </span>
                      </div>
                    ) : null,
                  )}
                </div>
              )}

              <div key={q.field} className={`ce-q mt-8 ${dir < 0 ? "is-back" : ""}`}>
                <label
                  htmlFor={`ce-${q.field}`}
                  className="block text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight leading-tight text-balance"
                >
                  {q.ask(answers)}
                  {q.optional && (
                    <span className="ml-2 text-sm font-medium text-gray-400 align-middle">
                      opcional
                    </span>
                  )}
                </label>
                <div className="mt-6">
                  {q.type === "textarea" ? (
                    <textarea
                      ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                      id={`ce-${q.field}`}
                      className="ce-input"
                      rows={3}
                      value={answers[q.field]}
                      onChange={(e) => setAnswers({ ...answers, [q.field]: e.target.value })}
                      onKeyDown={onKey}
                      placeholder={q.placeholder}
                    />
                  ) : (
                    <input
                      ref={inputRef as React.RefObject<HTMLInputElement>}
                      id={`ce-${q.field}`}
                      className="ce-input"
                      type={q.type ?? "text"}
                      value={answers[q.field]}
                      onChange={(e) => setAnswers({ ...answers, [q.field]: e.target.value })}
                      onKeyDown={onKey}
                      placeholder={q.placeholder}
                      autoComplete={
                        q.field === "email"
                          ? "email"
                          : q.field === "phone"
                            ? "tel"
                            : q.field === "name"
                              ? "name"
                              : "organization"
                      }
                    />
                  )}
                  {error && <p className="mt-2 text-sm text-[#c2380c]">{error}</p>}
                  {failed && (
                    <p className="mt-2 text-sm text-[#c2380c]">
                      {failed}{" "}
                      <a
                        href={WHATSAPP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold"
                      >
                        Abrir WhatsApp
                      </a>
                    </p>
                  )}
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void next()}
                    disabled={sending}
                    className="inline-flex items-center gap-2 h-13 px-7 rounded-xl bg-[#ff4810] hover:bg-[#e03f0d] text-white font-bold shadow-lg shadow-orange-200/50 hover:shadow-xl transition-all active:scale-[0.97] disabled:opacity-60 group"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {qi === questions.length - 1
                      ? sending
                        ? "Enviando…"
                        : "Enviar"
                      : q.optional && !answers[q.field].trim()
                        ? "Saltar"
                        : "Continuar"}
                    {!sending && (
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex items-center gap-2 h-13 px-4 rounded-xl text-gray-600 font-semibold hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Atrás
                  </button>
                  <span className="ml-auto text-xs text-gray-400 hidden sm:inline">
                    Enter ↵ para continuar
                    {q.type === "textarea" ? " · Shift+Enter para otra línea" : ""}
                  </span>
                </div>
              </div>
            </div>
          )}

          {stage === "sent" && (
            <div className="ce-panel is-sent max-w-3xl w-full p-8 sm:p-12">
              <span className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center mb-6">
                <Check className="w-6 h-6" />
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-balance">
                Listo, {first(answers.name)}. Te escribimos hoy.
              </h2>
              <p className="mt-3 text-blue-100">
                Respondemos a <b className="text-white">{answers.email.trim()}</b> en menos de un
                día hábil. Si es urgente, WhatsApp.
              </p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2 h-13 px-7 rounded-xl bg-white text-[#0c3d7a] font-bold hover:bg-blue-50 transition-colors active:scale-[0.97]"
              >
                <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
              </a>
            </div>
          )}
        </div>

        <p className="mt-12 text-sm text-gray-400">
          ¿Prefieres el correo?{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-gray-600 hover:text-[#0e70db] underline-offset-4 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>

      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="ce-wa">
        <span className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-md">
          <MessageCircle className="w-4.5 h-4.5" />
        </span>
        <span className="text-sm leading-tight">
          <span className="block font-bold">WhatsApp</span>
          <span className="block text-xs text-gray-500">Te responde una persona · L–V 9 a 18</span>
        </span>
      </a>
    </section>
  )
}

/** The home's card, tilting toward the pointer on a critically-damped spring. */
function ChoiceCard({
  children,
  index,
  picked,
  onPick,
  disabled,
}: {
  children: ReactNode
  index: number
  picked: boolean
  onPick: () => void
  disabled: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el || reduce) return
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    let rx = { v: 0, x: 0 }
    let ry = { v: 0, x: 0 }
    let tx = 0
    let ty = 0
    let raf = 0
    let last = 0
    const frame = (now: number) => {
      const dt = Math.min((now - (last || now)) / 1000, 1 / 30)
      last = now
      rx = stepSpring(rx, tx, dt, 0.45)
      ry = stepSpring(ry, ty, dt, 0.45)
      el.style.setProperty("--rx", `${rx.x.toFixed(2)}deg`)
      el.style.setProperty("--ry", `${ry.x.toFixed(2)}deg`)
      const settled =
        Math.abs(rx.x - tx) < 0.02 && Math.abs(ry.x - ty) < 0.02 && Math.abs(rx.v) < 0.05
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
      ty = (px - 0.5) * 10
      tx = -(py - 0.5) * 8
      el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`)
      el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`)
      kick()
    }
    const leave = () => {
      tx = 0
      ty = 0
      kick()
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
      cancelAnimationFrame(raf)
    }
  }, [reduce])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onPick}
      disabled={disabled}
      className={`ce-card ${picked ? "is-picked" : ""}`}
      style={{ "--i": index } as CSSProperties}
    >
      {children}
    </button>
  )
}
