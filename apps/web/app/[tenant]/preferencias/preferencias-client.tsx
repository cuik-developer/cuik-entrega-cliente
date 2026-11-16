"use client"

import { useRef, useState } from "react"
import { type TurnstileHandle, TurnstileWidget } from "@/components/turnstile-widget"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { privacyNoticePath } from "@/lib/privacy/shared"

export type PreferenciasState =
  | { mode: "ask" }
  | { mode: "expired" }
  | { mode: "edit"; token: string; clientName: string; marketingOptIn: boolean }

export default function PreferenciasClient({
  slug,
  tenantName,
  primaryColor,
  initial,
}: {
  slug: string
  tenantName: string
  primaryColor: string
  initial: PreferenciasState
}) {
  const [state, setState] = useState<PreferenciasState>(initial)
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileHandle>(null)

  async function requestLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/${slug}/preferences/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          turnstileToken:
            turnstileToken ?? (await turnstileRef.current?.waitForToken()) ?? undefined,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo enviar el enlace. Inténtalo de nuevo.")
        return
      }
      setSent(true)
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.")
    } finally {
      turnstileRef.current?.reset()
      setTurnstileToken(null)
      setBusy(false)
    }
  }

  async function choose(marketingOptIn: boolean) {
    if (state.mode !== "edit" || busy) return
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      const res = await fetch(`/api/${slug}/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token, marketingOptIn }),
      })
      const json = await res.json().catch(() => null)
      if (json?.details?.code === "expired" || res.status === 401) {
        setState({ mode: "expired" })
        return
      }
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo guardar. Inténtalo de nuevo.")
        return
      }
      setState({ ...state, marketingOptIn })
      setSaved(
        marketingOptIn
          ? `Listo: ${tenantName} podrá escribirte con promociones.`
          : `Listo: ${tenantName} ya no te escribirá con promociones.`,
      )
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {tenantName}
            </p>
            <h1 className="mt-1 text-xl font-bold text-gray-900">
              Promociones por WhatsApp y correo
            </h1>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              Elige si {tenantName} puede escribirte fuera del programa con promociones y novedades.
              Los avisos de tu tarjeta en el pase no dependen de esto: puedes desactivarlos desde tu
              Wallet.
            </p>
          </div>

          {state.mode === "edit" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 p-4 text-sm">
                <span className="text-gray-500">Hola, {state.clientName}. Ahora mismo: </span>
                <strong className="text-gray-900">
                  {state.marketingOptIn
                    ? "aceptas recibir promociones"
                    : "no aceptas recibir promociones"}
                </strong>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  disabled={busy || state.marketingOptIn}
                  onClick={() => void choose(true)}
                  style={{ backgroundColor: primaryColor }}
                  className="text-white"
                >
                  Sí, quiero recibir promociones
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !state.marketingOptIn}
                  onClick={() => void choose(false)}
                >
                  No, no quiero recibir promociones
                </Button>
              </div>
              {saved && <p className="text-sm text-green-700">{saved}</p>}
            </div>
          ) : sent ? (
            <p className="text-sm text-gray-700 leading-relaxed">
              Si ese correo está inscrito en el programa de {tenantName}, te enviamos un enlace para
              elegir. Revisa tu bandeja de entrada y la de spam; vale por 24 horas.
            </p>
          ) : (
            <form onSubmit={(e) => void requestLink(e)} className="space-y-3">
              {state.mode === "expired" && (
                <p className="text-sm text-amber-700">
                  El enlace venció o no es válido. Pide uno nuevo con tu correo.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Correo con el que te inscribiste</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                />
              </div>
              <TurnstileWidget ref={turnstileRef} onToken={setTurnstileToken} />
              <Button
                type="submit"
                disabled={busy || !email.trim()}
                className="w-full text-white"
                style={{ backgroundColor: primaryColor }}
              >
                Enviarme el enlace
              </Button>
            </form>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <p className="text-xs text-gray-400">
            Más información en el{" "}
            <a href={privacyNoticePath(slug)} className="underline underline-offset-2">
              aviso de privacidad del programa
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
