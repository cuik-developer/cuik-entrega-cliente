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
 * Contáctanos as a conversation, not a form.
 *
 *  1. Opener: "Hablemos" writes itself (kinetic, variable weight) over a
 *     dark field with drifting light. One question — ¿Qué te trae por aquí? —
 *     and three glass cards that tilt and catch the light.
 *  2. Pick one: the others fall away, the camera pushes into the chosen card
 *     and the conversation opens inside it.
 *  3. One question per screen. Enter advances, the thread of answers stacks
 *     above, a hairline shows progress. Springs, not keyframes, on the slide.
 *  4. Sent: the panel turns Cuik blue with one line. WhatsApp stays one tap
 *     away the whole time.
 */

type Profile = "negocio" | "cliente" | "otro"

const PROFILES: { value: Profile; icon: ReactNode; title: string; text: string }[] = [
  {
    value: "negocio",
    icon: <Store className="w-6 h-6" />,
    title: "Tengo un negocio",
    text: "Quiero que mis clientes vuelvan más.",
  },
  {
    value: "cliente",
    icon: <Users className="w-6 h-6" />,
    title: "Ya uso Cuik",
    text: "Necesito ayuda con mi pase o mi cuenta.",
  },
  {
    value: "otro",
    icon: <Building2 className="w-6 h-6" />,
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

  // Pick a card: the others fall away, the camera pushes in, the chat opens.
  const pick = (p: Profile) => {
    setProfile(p)
    setStage("leaving")
    setTimeout(() => setStage("chat"), reduce ? 0 : 520)
  }

  // Focus the current answer field on each step.
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

  const progress = questions.length ? (qi + (stage === "sent" ? 1 : 0)) / questions.length : 0

  return (
    <section className="ce relative overflow-hidden bg-[#070b14] text-white min-h-[calc(100dvh-4rem)] flex flex-col">
      <style>{`
        .ce { --out: cubic-bezier(0.23, 1, 0.32, 1); --io: cubic-bezier(0.77, 0, 0.175, 1); }
        /* Field: deep navy with slow drifting light. Transform-only motion, very low frequency. */
        .ce-bg { position: absolute; inset: 0; background: radial-gradient(1200px 700px at 50% 110%, rgba(14,112,219,0.35), transparent 60%); }
        .ce-orb { position: absolute; border-radius: 9999px; filter: blur(60px); opacity: 0.55; will-change: transform; animation: ce-drift var(--t) ease-in-out infinite alternate; animation-delay: var(--dl); }
        @keyframes ce-drift { from { transform: translate3d(0,0,0) scale(1); } to { transform: translate3d(var(--dx), var(--dy), 0) scale(1.15); } }
        .ce-grain { position: absolute; inset: 0; opacity: 0.05; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); pointer-events: none; }

        /* Kinetic title: each glyph rises and thickens (variable font weight) */
        .ce-title span { display: inline-block; opacity: 0; transform: translateY(0.35em); font-weight: 300; animation: ce-glyph 900ms var(--out) forwards; animation-delay: calc(var(--i) * 70ms + 150ms); }
        @keyframes ce-glyph { to { opacity: 1; transform: none; font-weight: 800; } }
        .ce-sub { opacity: 0; transform: translateY(12px); animation: ce-rise 800ms var(--out) forwards; animation-delay: 820ms; }
        @keyframes ce-rise { to { opacity: 1; transform: none; } }

        /* Glass cards */
        .ce-cards { display: grid; gap: 1rem; transition: transform 560ms var(--io), opacity 420ms var(--out), filter 560ms var(--io); transform-origin: 50% 40%; }
        .ce-cards.is-leaving { transform: scale(1.28); opacity: 0; filter: blur(8px); pointer-events: none; }
        .ce-card { position: relative; text-align: left; border-radius: 1.5rem; padding: 1.5rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(18px) saturate(160%); -webkit-backdrop-filter: blur(18px) saturate(160%); box-shadow: 0 30px 80px -40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.18); transform: perspective(1000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)); transition: transform 120ms linear, background-color 300ms var(--out), border-color 300ms var(--out), opacity 420ms var(--out); opacity: 0; animation: ce-rise 900ms var(--out) forwards; animation-delay: calc(1000ms + var(--i) * 110ms); will-change: transform; cursor: pointer; }
        .ce-card::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: radial-gradient(360px circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,0.16), transparent 60%); opacity: 0; transition: opacity 300ms var(--out); pointer-events: none; }
        @media (hover: hover) and (pointer: fine) {
          .ce-card:hover { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.22); }
          .ce-card:hover::after { opacity: 1; }
        }
        .ce-card:active { transform: perspective(1000px) scale(0.985); }
        .ce-card:focus-visible { outline: 2px solid #5aa2f0; outline-offset: 4px; }
        .ce-cards.is-leaving .ce-card.is-picked { background: rgba(14,112,219,0.35); border-color: rgba(120,180,255,0.6); }

        /* Conversation panel: arrives as if the camera had landed inside the card */
        .ce-panel { position: relative; border-radius: 1.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(24px) saturate(160%); -webkit-backdrop-filter: blur(24px) saturate(160%); box-shadow: 0 40px 100px -50px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.16); overflow: hidden; animation: ce-land 700ms var(--out) both; }
        @keyframes ce-land { from { opacity: 0; transform: scale(0.94) translateY(16px); } to { opacity: 1; transform: none; } }
        .ce-panel.is-sent { background: linear-gradient(135deg, rgba(14,112,219,0.85), rgba(10,79,168,0.9)); border-color: rgba(120,180,255,0.5); }
        .ce-bar { position: absolute; left: 0; top: 0; height: 2px; background: linear-gradient(90deg, #5aa2f0, #9cc8f7); transform-origin: left; transform: scaleX(var(--p)); transition: transform 600ms var(--io); }

        /* Thread of answers above the live question */
        .ce-thread { display: flex; flex-direction: column; gap: 0.35rem; }
        .ce-thread > div { display: flex; align-items: baseline; gap: 0.6rem; font-size: 0.875rem; color: rgba(191,219,254,0.7); animation: ce-rise 400ms var(--out) both; }
        .ce-thread b { color: #fff; font-weight: 600; }

        /* The live question slides along its baseline */
        .ce-q { animation: ce-in 520ms var(--out) both; }
        .ce-q.is-back { animation-name: ce-in-back; }
        @keyframes ce-in { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
        @keyframes ce-in-back { from { opacity: 0; transform: translateY(-28px); } to { opacity: 1; transform: none; } }
        .ce-input { width: 100%; background: transparent; border: 0; border-bottom: 1px solid rgba(255,255,255,0.22); color: #fff; font-size: clamp(1.25rem, 2.4vw, 1.75rem); font-weight: 600; letter-spacing: -0.01em; padding: 0.6rem 0; outline: none; transition: border-color 200ms var(--out); resize: none; line-height: 1.3; }
        .ce-input::placeholder { color: rgba(255,255,255,0.28); font-weight: 500; }
        .ce-input:focus { border-color: #5aa2f0; }

        .ce-cta { display: inline-flex; align-items: center; gap: 0.5rem; height: 3rem; padding: 0 1.4rem; border-radius: 9999px; background: #fff; color: #0b1220; font-weight: 700; transition: transform 160ms var(--out), background-color 200ms var(--out); }
        .ce-cta:hover { background: #eaf2fd; }
        .ce-cta:active { transform: scale(0.97); }
        .ce-cta:disabled { opacity: 0.6; }
        .ce-ghost { display: inline-flex; align-items: center; gap: 0.4rem; height: 3rem; padding: 0 0.9rem; border-radius: 9999px; color: rgba(191,219,254,0.85); font-weight: 600; transition: background-color 200ms var(--out), color 200ms var(--out); }
        .ce-ghost:hover { background: rgba(255,255,255,0.08); color: #fff; }

        /* WhatsApp, always one tap away */
        .ce-wa { position: fixed; right: 1rem; bottom: 1rem; z-index: 40; display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.55rem 0.9rem 0.55rem 0.55rem; border-radius: 9999px; background: rgba(255,255,255,0.9); color: #0b1220; backdrop-filter: blur(16px); box-shadow: 0 20px 50px -20px rgba(0,0,0,0.5), 0 0 0 1px rgba(15,23,42,0.06); transition: transform 200ms var(--out), box-shadow 200ms var(--out); animation: ce-rise 700ms var(--out) both; animation-delay: 1400ms; }
        .ce-wa:hover { transform: translateY(-2px); box-shadow: 0 26px 60px -20px rgba(0,0,0,0.55), 0 0 0 1px rgba(15,23,42,0.08); }
        .ce-wa:active { transform: scale(0.98); }

        @media (prefers-reduced-motion: reduce) {
          .ce-orb { animation: none; }
          .ce-title span, .ce-sub, .ce-card, .ce-panel, .ce-q, .ce-thread > div, .ce-wa { animation: ce-fade 300ms ease forwards !important; animation-delay: 0ms !important; transform: none !important; }
          @keyframes ce-fade { to { opacity: 1; } }
          .ce-cards.is-leaving { transform: none; filter: none; }
          .ce-card { transform: none !important; }
        }
      `}</style>

      {/* Field */}
      <div className="ce-bg" aria-hidden="true" />
      <Orb
        style={{
          "--t": "22s",
          "--dl": "0s",
          "--dx": "8vw",
          "--dy": "-6vh",
          left: "8%",
          top: "10%",
          width: 420,
          height: 420,
          background: "#0e70db",
        }}
      />
      <Orb
        style={{
          "--t": "28s",
          "--dl": "-9s",
          "--dx": "-10vw",
          "--dy": "8vh",
          right: "6%",
          top: "0%",
          width: 360,
          height: 360,
          background: "#3b8ee8",
          opacity: 0.35,
        }}
      />
      <Orb
        style={{
          "--t": "26s",
          "--dl": "-15s",
          "--dx": "6vw",
          "--dy": "-10vh",
          left: "45%",
          bottom: "-10%",
          width: 520,
          height: 520,
          background: "#ff4810",
          opacity: 0.18,
        }}
      />
      <div className="ce-grain" aria-hidden="true" />

      <div className="relative flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-28 flex flex-col">
        {/* Kinetic title */}
        <h1
          className="ce-title text-[3.25rem] sm:text-7xl lg:text-[6.5rem] leading-[0.95] tracking-[-0.03em]"
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
        <p className="ce-sub mt-5 text-lg sm:text-xl text-blue-100/75 max-w-xl">
          Te responde una persona del equipo en menos de un día hábil. Sin call center, sin tickets.
        </p>

        <div className="mt-12 sm:mt-16 flex-1 flex flex-col justify-center">
          {(stage === "pick" || stage === "leaving") && (
            <div>
              <p
                className="ce-sub text-xs font-bold uppercase tracking-[0.2em] text-blue-300 mb-5"
                style={{ animationDelay: "900ms" }}
              >
                ¿Qué te trae por aquí?
              </p>
              <div className={`ce-cards sm:grid-cols-3 ${stage === "leaving" ? "is-leaving" : ""}`}>
                {PROFILES.map((p, i) => (
                  <GlassCard
                    key={p.value}
                    index={i}
                    picked={profile === p.value}
                    onPick={() => pick(p.value)}
                    disabled={stage === "leaving"}
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white/10 text-blue-100 flex items-center justify-center mb-5">
                      {p.icon}
                    </span>
                    <span className="block text-xl font-bold tracking-tight">{p.title}</span>
                    <span className="block mt-1 text-sm text-blue-100/70">{p.text}</span>
                    <ArrowRight className="absolute right-6 top-6 w-5 h-5 text-blue-200/50" />
                  </GlassCard>
                ))}
              </div>
            </div>
          )}

          {stage === "chat" && q && (
            <div className="ce-panel max-w-3xl w-full mx-auto sm:mx-0 p-6 sm:p-10">
              <div
                className="ce-bar"
                style={{ "--p": progress } as CSSProperties}
                aria-hidden="true"
              />

              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
                <span>{PROFILES.find((p) => p.value === profile)?.title}</span>
                <span>
                  {qi + 1} / {questions.length}
                </span>
              </div>

              {qi > 0 && (
                <div className="ce-thread mt-6">
                  {questions.slice(0, qi).map((prev) =>
                    answers[prev.field].trim() ? (
                      <div key={prev.field}>
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 translate-y-0.5" />
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
                  className="block text-2xl sm:text-3xl font-extrabold tracking-[-0.02em] leading-tight text-balance"
                >
                  {q.ask(answers)}
                  {q.optional && (
                    <span className="ml-2 text-sm font-medium text-blue-200/60 align-middle">
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
                  {error && <p className="mt-2 text-sm text-orange-300">{error}</p>}
                  {failed && (
                    <p className="mt-2 text-sm text-orange-300">
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
                    className="ce-cta"
                    onClick={() => void next()}
                    disabled={sending}
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {qi === questions.length - 1
                      ? sending
                        ? "Enviando…"
                        : "Enviar"
                      : q.optional && !answers[q.field].trim()
                        ? "Saltar"
                        : "Continuar"}
                    {!sending && <ArrowRight className="w-4 h-4" />}
                  </button>
                  <button type="button" className="ce-ghost" onClick={back}>
                    <ArrowLeft className="w-4 h-4" /> Atrás
                  </button>
                  <span className="ml-auto text-xs text-blue-200/50 hidden sm:inline">
                    Enter ↵ para continuar
                    {q.type === "textarea" ? " · Shift+Enter para otra línea" : ""}
                  </span>
                </div>
              </div>
            </div>
          )}

          {stage === "sent" && (
            <div className="ce-panel is-sent max-w-3xl w-full mx-auto sm:mx-0 p-8 sm:p-12">
              <div className="ce-bar" style={{ "--p": 1 } as CSSProperties} aria-hidden="true" />
              <span className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-6">
                <Check className="w-6 h-6" />
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-[-0.02em] leading-tight text-balance">
                Listo, {first(answers.name)}. Te escribimos hoy.
              </h2>
              <p className="mt-3 text-blue-100/85">
                Respondemos a <b className="text-white">{answers.email.trim()}</b> en menos de un
                día hábil. Si es urgente, WhatsApp.
              </p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ce-cta mt-8"
              >
                <MessageCircle className="w-4 h-4" /> Abrir WhatsApp
              </a>
            </div>
          )}
        </div>

        <p className="mt-12 text-sm text-blue-200/50">
          ¿Prefieres el correo?{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-blue-100/80 hover:text-white underline-offset-4 hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>

      <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="ce-wa">
        <span className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center">
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

function Orb({ style }: { style: Record<string, string | number> }) {
  return <div className="ce-orb" style={style as CSSProperties} aria-hidden="true" />
}

/** Glass card that tilts toward the pointer on a critically-damped spring and catches the light. */
function GlassCard({
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
      ty = (px - 0.5) * 12
      tx = -(py - 0.5) * 10
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
