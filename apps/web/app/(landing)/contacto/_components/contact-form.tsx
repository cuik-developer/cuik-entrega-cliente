"use client"

import { ArrowRight, CheckCircle2, Loader2, MessageCircle } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { WHATSAPP_URL } from "@/components/landing/site-footer"
import { Button } from "@/components/ui/button"

const REASONS = [
  { value: "demo", label: "Quiero una demo" },
  { value: "cliente", label: "Ya soy cliente y necesito ayuda" },
  { value: "alianza", label: "Prensa o alianzas" },
  { value: "otro", label: "Otro" },
] as const

type Reason = (typeof REASONS)[number]["value"]

const EMPTY = {
  name: "",
  business: "",
  email: "",
  phone: "",
  reason: "" as Reason | "",
  message: "",
}

const input =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0e70db]/30 focus:border-[#0e70db] transition-colors"
const label = "block text-xs font-semibold text-gray-600 mb-1.5"

export function ContactForm() {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const set =
    (k: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

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
        body: JSON.stringify({ ...form, website: honeypot ?? "" }),
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
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-8 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-extrabold text-gray-900">¡Mensaje enviado!</h3>
        <p className="text-gray-600 text-sm max-w-sm mx-auto">
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
    <form onSubmit={submit} noValidate className="space-y-4">
      {/* Honeypot: hidden from people, tempting for bots */}
      <div
        className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden"
        aria-hidden="true"
      >
        <label htmlFor="contact-website">Sitio web</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
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
        </div>
        <div>
          <label htmlFor="c-business" className={label}>
            Tu negocio
          </label>
          <input
            id="c-business"
            className={input}
            value={form.business}
            onChange={set("business")}
            placeholder="Café Central"
            autoComplete="organization"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
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
        </div>
        <div>
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
        </div>
      </div>

      <div>
        <label htmlFor="c-reason" className={label}>
          ¿Sobre qué nos escribes? *
        </label>
        <select id="c-reason" className={input} value={form.reason} onChange={set("reason")}>
          <option value="">Seleccionar...</option>
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {errors.reason && <p className="mt-1 text-xs text-red-600">Elige un motivo</p>}
        {form.reason === "demo" && (
          <p className="mt-2 text-xs text-gray-500">
            Tip: la forma más rápida de tener tu demo es el{" "}
            <Link href="/login?view=demo" className="text-[#0e70db] font-semibold hover:underline">
              formulario de demo
            </Link>
            . La activamos en 24 horas.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="c-message" className={label}>
          Mensaje *
        </label>
        <textarea
          id="c-message"
          rows={5}
          className={`${input} resize-y`}
          value={form.message}
          onChange={set("message")}
          placeholder="Cuéntanos qué necesitas: tu rubro, cuántos locales tienes, qué te gustaría lograr…"
        />
        {errors.message && <p className="mt-1 text-xs text-red-600">{errors.message}</p>}
      </div>

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
          className="bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-bold h-12 rounded-xl shadow-md shadow-blue-200/50 group"
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
