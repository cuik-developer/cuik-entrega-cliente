"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { useRef, useState } from "react"
import { type TurnstileHandle, TurnstileWidget } from "@/components/turnstile-widget"

/**
 * Hoja de Reclamación (D.S. 011-2011-PCM): consumer identification, the
 * good or service, the claim (reclamo/queja), the request, and the
 * consumer's declaration. Posts to /api/reclamaciones, which numbers it and
 * emails a copy to the consumer and to Cuik.
 */

const EMPTY = {
  nombre: "",
  documentoTipo: "DNI",
  documento: "",
  domicilio: "",
  telefono: "",
  email: "",
  menor: false,
  apoderado: "",
  bienTipo: "servicio",
  bienDescripcion: "",
  monto: "",
  tipo: "reclamo",
  detalle: "",
  pedido: "",
  acepta: false,
}

type Form = typeof EMPTY

/** Input id of each field, to take the visitor to the first one with an error. */
const FIELD_ID: Record<string, string> = {
  nombre: "r-nombre",
  documentoTipo: "r-doctipo",
  documento: "r-doc",
  domicilio: "r-dom",
  telefono: "r-tel",
  email: "r-email",
  apoderado: "r-apoderado",
  bienTipo: "r-bientipo",
  bienDescripcion: "r-bien",
  monto: "r-monto",
  detalle: "r-detalle",
  pedido: "r-pedido",
  acepta: "r-acepta",
}
const ORDER = Object.keys(FIELD_ID)

const inputBase =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 transition-[box-shadow,border-color,background-color]"
const input = `${inputBase} border-gray-200 bg-white focus:ring-[#0e70db]/15 focus:border-[#0e70db]`
/** A field with an error: red border and a light red fill until it is edited. */
const inputErr = `${inputBase} border-red-400 bg-red-50/60 focus:ring-red-500/15 focus:border-red-500`

/** Human names for the error summary next to the button. */
const FIELD_LABEL: Record<string, string> = {
  nombre: "Nombre",
  documentoTipo: "Tipo de documento",
  documento: "Documento",
  domicilio: "Domicilio",
  telefono: "Teléfono",
  email: "Correo",
  apoderado: "Apoderado",
  bienTipo: "Tipo de bien",
  bienDescripcion: "Descripción",
  monto: "Monto",
  detalle: "Detalle",
  pedido: "Pedido",
  acepta: "Declaración",
}
const label = "block text-xs font-semibold text-gray-600 mb-1.5"

export function ReclamoForm() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ numero: string; fecha: string; email: string } | null>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)
  /** Honeypot: hidden from people, bots that fill it get a fake success. */
  const [website, setWebsite] = useState("")

  const set =
    <K extends keyof Form>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((f) => ({
        ...f,
        [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value,
      }))
      // Editing a field clears its red mark.
      setErrors((prev) => {
        if (!prev[k]) return prev
        const { [k]: _, ...rest } = prev
        return rest
      })
    }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setFailed(null)
    setErrors({})
    setDone(null)
    try {
      const res = await fetch("/api/reclamaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website, turnstileToken: turnstileToken ?? undefined }),
      })
      const json = await res.json().catch(() => ({}))
      // Tokens are single-use: ask for a fresh one whatever the answer was.
      turnstileRef.current?.reset()
      if (res.ok) {
        // Filed: clear every field and show the confirmation above the form.
        setDone({ ...json.data, email: form.email })
        setForm(EMPTY)
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
      const fe = json?.details?.fieldErrors as Record<string, string[]> | undefined
      if (res.status === 400 && fe) {
        setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])))
        const names = ORDER.filter((k) => fe[k]?.length).map((k) => FIELD_LABEL[k] ?? k)
        setFailed(`Revisa los campos marcados en rojo: ${names.join(", ")}.`)
        const first = ORDER.find((k) => fe[k]?.length)
        const el = first ? document.getElementById(FIELD_ID[first]) : null
        el?.scrollIntoView({ behavior: "smooth", block: "center" })
        el?.focus({ preventScroll: true })
      } else setFailed(json?.error ?? "No pudimos registrar tu reclamo.")
    } catch {
      turnstileRef.current?.reset()
      setFailed("No pudimos registrar tu reclamo.")
    } finally {
      setLoading(false)
    }
  }

  const cls = (k: string) => (errors[k] ? inputErr : input)

  const Err = ({ k }: { k: string }) =>
    errors[k] ? <p className="mt-1 text-xs text-red-600">{errors[k]}</p> : null

  return (
    <form onSubmit={submit} noValidate className="space-y-8" data-clarity-mask="true">
      <div ref={topRef} className="scroll-mt-24" />
      {done && (
        <div
          aria-live="polite"
          className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5 flex gap-3 items-start"
        >
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <div className="font-bold text-gray-900">Reclamo enviado</div>
            <p className="mt-1 text-sm text-gray-600">
              Hoja de Reclamación <strong className="text-gray-900">{done.numero}</strong> ·{" "}
              {done.fecha}. Te enviamos una copia a {done.email}. Responderemos en un máximo de 15
              días hábiles.
            </p>
          </div>
        </div>
      )}
      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-gray-900">
          1. Identificación del consumidor
        </legend>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="r-nombre" className={label}>
              Nombre completo *
            </label>
            <input
              id="r-nombre"
              aria-invalid={!!errors.nombre}
              className={cls("nombre")}
              value={form.nombre}
              onChange={set("nombre")}
              autoComplete="name"
            />
            <Err k="nombre" />
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <div>
              <label htmlFor="r-doctipo" className={label}>
                Documento *
              </label>
              <select
                id="r-doctipo"
                aria-invalid={!!errors.documentoTipo}
                className={cls("documentoTipo")}
                value={form.documentoTipo}
                onChange={set("documentoTipo")}
              >
                <option>DNI</option>
                <option>CE</option>
                <option>Pasaporte</option>
              </select>
            </div>
            <div>
              <label htmlFor="r-doc" className={label}>
                Número *
              </label>
              <input
                id="r-doc"
                aria-invalid={!!errors.documento}
                className={cls("documento")}
                value={form.documento}
                onChange={set("documento")}
                inputMode="numeric"
              />
              <Err k="documento" />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="r-dom" className={label}>
            Domicilio *
          </label>
          <input
            id="r-dom"
            aria-invalid={!!errors.domicilio}
            className={cls("domicilio")}
            value={form.domicilio}
            onChange={set("domicilio")}
            autoComplete="street-address"
          />
          <Err k="domicilio" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="r-tel" className={label}>
              Teléfono *
            </label>
            <input
              id="r-tel"
              type="tel"
              aria-invalid={!!errors.telefono}
              className={cls("telefono")}
              value={form.telefono}
              onChange={set("telefono")}
              autoComplete="tel"
            />
            <Err k="telefono" />
          </div>
          <div>
            <label htmlFor="r-email" className={label}>
              Correo *
            </label>
            <input
              id="r-email"
              type="email"
              aria-invalid={!!errors.email}
              className={cls("email")}
              value={form.email}
              onChange={set("email")}
              autoComplete="email"
            />
            <Err k="email" />
          </div>
        </div>
        <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={form.menor}
            onChange={set("menor")}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#0e70db]"
          />
          Soy menor de edad
        </label>
        {form.menor && (
          <div>
            <label htmlFor="r-apoderado" className={label}>
              Nombre del padre, madre o apoderado *
            </label>
            <input
              id="r-apoderado"
              aria-invalid={!!errors.apoderado}
              className={cls("apoderado")}
              value={form.apoderado}
              onChange={set("apoderado")}
            />
            <Err k="apoderado" />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-gray-900">
          2. Identificación del bien contratado
        </legend>
        <div className="grid sm:grid-cols-[160px_1fr_160px] gap-4">
          <div>
            <label htmlFor="r-bientipo" className={label}>
              Tipo *
            </label>
            <select
              id="r-bientipo"
              aria-invalid={!!errors.bienTipo}
              className={cls("bienTipo")}
              value={form.bienTipo}
              onChange={set("bienTipo")}
            >
              <option value="servicio">Servicio</option>
              <option value="producto">Producto</option>
            </select>
          </div>
          <div>
            <label htmlFor="r-bien" className={label}>
              Descripción *
            </label>
            <input
              id="r-bien"
              aria-invalid={!!errors.bienDescripcion}
              className={cls("bienDescripcion")}
              value={form.bienDescripcion}
              onChange={set("bienDescripcion")}
              placeholder="Plan Básico de Cuik, pase digital de…"
            />
            <Err k="bienDescripcion" />
          </div>
          <div>
            <label htmlFor="r-monto" className={label}>
              Monto reclamado (S/)
            </label>
            <input
              id="r-monto"
              aria-invalid={!!errors.monto}
              className={cls("monto")}
              value={form.monto}
              onChange={set("monto")}
              inputMode="decimal"
              placeholder="0.00"
            />
            <Err k="monto" />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-sm font-bold text-gray-900">3. Detalle de la reclamación</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { v: "reclamo", t: "Reclamo", d: "Disconformidad con el producto o servicio" },
            { v: "queja", t: "Queja", d: "Disconformidad con la atención recibida" },
          ].map((o) => (
            <label
              key={o.v}
              className={`flex-1 min-w-[220px] cursor-pointer rounded-xl border-2 p-4 transition-colors ${form.tipo === o.v ? "border-[#0e70db] bg-blue-50/60" : "border-gray-200 hover:border-gray-300"}`}
            >
              <input
                type="radio"
                name="tipo"
                value={o.v}
                checked={form.tipo === o.v}
                onChange={set("tipo")}
                className="sr-only"
              />
              <span className="block text-sm font-bold text-gray-900">{o.t}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{o.d}</span>
            </label>
          ))}
        </div>
        <div>
          <label htmlFor="r-detalle" className={label}>
            Detalle *
          </label>
          <textarea
            id="r-detalle"
            rows={5}
            aria-invalid={!!errors.detalle}
            className={`${cls("detalle")} resize-y`}
            value={form.detalle}
            onChange={set("detalle")}
            placeholder="Cuéntanos qué pasó, cuándo y con qué comercio o servicio."
          />
          {errors.detalle ? (
            <Err k="detalle" />
          ) : (
            <p className="mt-1 text-xs text-gray-400">
              Mínimo 20 caracteres ({form.detalle.trim().length}/20)
            </p>
          )}
        </div>
        <div>
          <label htmlFor="r-pedido" className={label}>
            Pedido del consumidor *
          </label>
          <textarea
            id="r-pedido"
            rows={3}
            aria-invalid={!!errors.pedido}
            className={`${cls("pedido")} resize-y`}
            value={form.pedido}
            onChange={set("pedido")}
            placeholder="Qué solución esperas."
          />
          <Err k="pedido" />
        </div>
      </fieldset>

      <label
        className={`flex items-start gap-3 text-sm cursor-pointer rounded-xl ${errors.acepta ? "text-red-700 bg-red-50/60 ring-1 ring-red-300 p-3" : "text-gray-600"}`}
      >
        <input
          id="r-acepta"
          type="checkbox"
          checked={form.acepta}
          onChange={set("acepta")}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-[#0e70db]"
        />
        <span>
          Declaro que la información es veraz y acepto que mis datos se usen para atender este
          reclamo conforme a la Política de Privacidad. *
        </span>
      </label>
      <Err k="acepta" />

      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="r-website">No llenar este campo</label>
        <input
          id="r-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      {failed && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {failed}
        </div>
      )}

      <div className="space-y-3">
        {/* Invisible for most people; shows a box only when Cloudflare asks for a click. */}
        <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 h-13 px-7 rounded-xl bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-bold shadow-lg shadow-blue-200/50 transition-all active:scale-[0.97] disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {loading ? "Enviando…" : "Enviar reclamo"}
        </button>
      </div>
    </form>
  )
}
