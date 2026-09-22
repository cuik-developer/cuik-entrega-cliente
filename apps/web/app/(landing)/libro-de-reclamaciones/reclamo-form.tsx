"use client"

import { CheckCircle2, Loader2 } from "lucide-react"
import { useState } from "react"

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

const input =
  "w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-[#0e70db]/15 focus:border-[#0e70db] transition-[box-shadow,border-color]"
const label = "block text-xs font-semibold text-gray-600 mb-1.5"

export function ReclamoForm() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<{ numero: string; fecha: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const set =
    <K extends keyof Form>(k: K) =>
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
    try {
      const res = await fetch("/api/reclamaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setDone(json.data)
        return
      }
      const fe = json?.details?.fieldErrors as Record<string, string[]> | undefined
      if (res.status === 400 && fe) {
        setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])))
      } else setFailed(json?.error ?? "No pudimos registrar tu reclamo.")
    } catch {
      setFailed("No pudimos registrar tu reclamo.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-8 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h3 className="mt-4 text-xl font-extrabold text-gray-900">Reclamo registrado</h3>
        <p className="mt-2 text-gray-600">
          Hoja de Reclamación <strong className="text-gray-900">{done.numero}</strong> ·{" "}
          {done.fecha}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          Te enviamos una copia a {form.email}. Responderemos en un máximo de 15 días hábiles.
        </p>
      </div>
    )
  }

  const Err = ({ k }: { k: string }) =>
    errors[k] ? <p className="mt-1 text-xs text-red-600">{errors[k]}</p> : null

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
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
              className={input}
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
                className={input}
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
                className={input}
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
            className={input}
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
              className={input}
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
              className={input}
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
              className={input}
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
              className={input}
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
              className={input}
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
              className={input}
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
            className={`${input} resize-y`}
            value={form.detalle}
            onChange={set("detalle")}
            placeholder="Cuéntanos qué pasó, cuándo y con qué comercio o servicio."
          />
          <Err k="detalle" />
        </div>
        <div>
          <label htmlFor="r-pedido" className={label}>
            Pedido del consumidor *
          </label>
          <textarea
            id="r-pedido"
            rows={3}
            className={`${input} resize-y`}
            value={form.pedido}
            onChange={set("pedido")}
            placeholder="Qué solución esperas."
          />
          <Err k="pedido" />
        </div>
      </fieldset>

      <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer">
        <input
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

      {failed && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {failed}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 h-13 px-7 rounded-xl bg-[#0e70db] hover:bg-[#0c5fc0] text-white font-bold shadow-lg shadow-blue-200/50 transition-all active:scale-[0.97] disabled:opacity-60"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {loading ? "Enviando…" : "Enviar reclamo"}
      </button>
    </form>
  )
}
