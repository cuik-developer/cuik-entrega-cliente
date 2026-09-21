"use client"

import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Store,
  Users,
} from "lucide-react"
import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"
import { useState } from "react"
import { WHATSAPP_URL } from "@/components/landing/site-footer"
import { Button } from "@/components/ui/button"

/**
 * be!'s "Hola, soy:" pattern: pick who you are, the form adapts. The
 * selector's highlight slides on transform (spring-like ease-out) instead of
 * re-rendering three buttons.
 */

export const PROFILES = [
  {
    value: "negocio",
    label: "Tengo un negocio",
    short: "Negocio",
    icon: <Store className="w-4 h-4" />,
    business: "Tu negocio",
    hint: "Cafetería, barbería, veterinaria, restaurante… cuéntanos qué haces.",
    placeholder:
      "Cuéntanos tu rubro, cuántos locales tienes y qué te gustaría lograr con tus clientes.",
  },
  {
    value: "cliente",
    label: "Ya uso Cuik",
    short: "Cliente",
    icon: <Users className="w-4 h-4" />,
    business: "Tu negocio en Cuik",
    hint: "Soporte, cambios en tu pase, facturación. Te responde alguien que conoce tu cuenta.",
    placeholder: "¿Qué necesitas? Si es sobre un pase o una campaña, dinos cuál.",
  },
  {
    value: "otro",
    label: "Prensa o alianzas",
    short: "Prensa",
    icon: <Building2 className="w-4 h-4" />,
    business: "Empresa u organización",
    hint: "Medios, integraciones, proveedores, inversión.",
    placeholder: "Cuéntanos de qué se trata y cómo podemos ayudarnos.",
  },
] as const

type Profile = (typeof PROFILES)[number]["value"]

const SOURCES = [
  "Buscando en Google",
  "Me lo recomendaron",
  "Lo vi en un comercio que usa Cuik",
  "Instagram",
  "TikTok",
  "Otro",
]

const EMPTY = {
  name: "",
  business: "",
  email: "",
  phone: "",
  source: "",
  message: "",
  newsletter: false,
}

const input =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-[#0e70db]/15 focus:border-[#0e70db] transition-[box-shadow,border-color] duration-200"
const label = "block text-xs font-semibold text-gray-600 mb-1.5"

function Field({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}

export function ContactForm() {
  const [profile, setProfile] = useState<Profile>("negocio")
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const p = PROFILES.find((x) => x.value === profile) ?? PROFILES[0]
  const idx = PROFILES.findIndex((x) => x.value === profile)

  const set =
    (k: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({
        ...f,
        [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value,
      }))

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFailed(null)
    setErrors({})
    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)
      ?.value
    try {
      const res = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, profile, website: honeypot ?? "" }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setSent(true)
        return
      }
      const fieldErrors = json?.details?.fieldErrors as Record<string, string[]> | undefined
      if (res.status === 400 && fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0]])))
      } else {
        setFailed(json?.error ?? "No pudimos enviar tu mensaje.")
      }
    } catch {
      setFailed("No pudimos enviar tu mensaje.")
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="cf-sent rounded-3xl border border-emerald-100 bg-emerald-50/70 p-8 text-center space-y-3">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">¡Mensaje enviado!</h3>
        <p className="text-gray-600 max-w-sm mx-auto">
          Te respondemos a <span className="font-semibold text-gray-900">{form.email}</span> en
          menos de un día hábil. Si es urgente, escríbenos por WhatsApp.
        </p>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-sm hover:text-emerald-800"
        >
          <MessageCircle className="w-4 h-4" />
          Abrir WhatsApp
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <style>{`
        .cf-seg { position: relative; border: 0; margin: 0; min-width: 0; display: grid; grid-template-columns: repeat(3, 1fr); background: #eef2f7; border-radius: 9999px; padding: 4px; }
        .cf-seg-thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / 3); border-radius: 9999px; background: #fff; box-shadow: 0 6px 16px -8px rgba(15,23,42,0.35), 0 0 0 1px rgba(15,23,42,0.05); transform: translateX(calc(var(--i) * 100%)); transition: transform 380ms cubic-bezier(0.23, 1, 0.32, 1); will-change: transform; }
        .cf-seg button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 40px; border-radius: 9999px; font-size: 13px; font-weight: 600; color: #6b7280; transition: color 200ms ease; cursor: pointer; }
        .cf-seg button[aria-pressed="true"] { color: #0e70db; }
        .cf-seg button:active { transform: scale(0.98); }
        .cf-hint { transition: opacity 220ms ease; }
        .cf-sent { animation: cf-pop 500ms cubic-bezier(0.23, 1, 0.32, 1) both; }
        @keyframes cf-pop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .cf-seg-thumb { transition: none; } .cf-sent { animation: none; } }
      `}</style>

      {/* Honeypot: hidden from people, tempting for bots */}
      <div
        className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden"
        aria-hidden="true"
      >
        <label htmlFor="contact-website">Sitio web</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <div className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-[-0.02em] mb-4">
          Hola, soy…
        </div>
        <fieldset className="cf-seg" aria-label="¿Quién eres?">
          <div
            className="cf-seg-thumb"
            style={{ "--i": idx } as CSSProperties}
            aria-hidden="true"
          />
          {PROFILES.map((x) => (
            <button
              key={x.value}
              type="button"
              aria-pressed={profile === x.value}
              onClick={() => setProfile(x.value)}
            >
              {x.icon}
              <span className="hidden sm:inline">{x.label}</span>
              <span className="sm:hidden">{x.short}</span>
            </button>
          ))}
        </fieldset>
        <p key={profile} className="cf-hint mt-3 text-sm text-gray-500">
          {p.hint}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field>
          <label htmlFor="c-name" className={label}>
            Tu nombre *
          </label>
          <input
            id="c-name"
            className={input}
            value={form.name}
            onChange={set("name")}
            placeholder="Ana Torres"
            autoComplete="name"
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </Field>
        <Field>
          <label htmlFor="c-business" className={label}>
            {p.business}
          </label>
          <input
            id="c-business"
            className={input}
            value={form.business}
            onChange={set("business")}
            placeholder={profile === "otro" ? "Medio o empresa" : "Café Central"}
            autoComplete="organization"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field>
          <label htmlFor="c-email" className={label}>
            Correo *
          </label>
          <input
            id="c-email"
            type="email"
            className={input}
            value={form.email}
            onChange={set("email")}
            placeholder="ana@cafecentral.pe"
            autoComplete="email"
          />
          {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
        </Field>
        <Field>
          <label htmlFor="c-phone" className={label}>
            WhatsApp
          </label>
          <input
            id="c-phone"
            type="tel"
            className={input}
            value={form.phone}
            onChange={set("phone")}
            placeholder="+51 999 999 999"
            autoComplete="tel"
          />
        </Field>
      </div>

      {profile !== "cliente" && (
        <Field>
          <label htmlFor="c-source" className={label}>
            ¿Cómo nos conociste?
          </label>
          <select id="c-source" className={input} value={form.source} onChange={set("source")}>
            <option value="">Seleccionar…</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field>
        <label htmlFor="c-message" className={label}>
          Mensaje *
        </label>
        <textarea
          id="c-message"
          rows={5}
          className={`${input} resize-y`}
          value={form.message}
          onChange={set("message")}
          placeholder={p.placeholder}
        />
        {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
      </Field>

      <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={form.newsletter}
          onChange={set("newsletter")}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#0e70db]"
        />
        <span>Quiero recibir novedades de Cuik de vez en cuando. Sin spam, prometido.</span>
      </label>

      {profile === "negocio" && (
        <p className="text-xs text-gray-500 rounded-xl bg-blue-50/70 border border-blue-100 px-4 py-3">
          ¿Ya sabes que quieres probarlo? La vía rápida es el{" "}
          <Link href="/login?view=demo" className="text-[#0e70db] font-semibold hover:underline">
            formulario de demo
          </Link>
          : la activamos en 24 horas, gratis por 7 días.
        </p>
      )}

      {failed && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {failed}{" "}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            Abrir WhatsApp
          </a>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
        <Button
          type="submit"
          size="lg"
          disabled={loading}
          className="bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-bold h-12 rounded-full px-7 shadow-lg shadow-blue-300/40 group active:scale-[0.98] transition-transform"
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {loading ? "Enviando…" : "Enviar mensaje"}
          {!loading && (
            <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          )}
        </Button>
        <span className="text-xs text-gray-400">Respondemos en menos de un día hábil.</span>
      </div>
    </form>
  )
}
