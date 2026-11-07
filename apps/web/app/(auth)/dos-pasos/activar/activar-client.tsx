"use client"

import { Check, Copy, Loader2, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

type Step = "password" | "scan" | "codes"

/**
 * Three steps: confirm the password → scan the QR and type one code from the
 * app (proves the link works) → save the backup codes. Better Auth marks the
 * account as 2FA-enabled only after the code is verified.
 */
export function ActivarClient({ userName }: { userName: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("password")
  const [password, setPassword] = useState("")
  const [totpUri, setTotpUri] = useState("")
  const [qr, setQr] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!totpUri) return
    QRCode.toDataURL(totpUri, { width: 220, margin: 1 })
      .then(setQr)
      .catch(() => setQr(""))
  }, [totpUri])

  async function start() {
    setBusy(true)
    setError("")
    try {
      const r = await authClient.twoFactor.enable({ password })
      if (r.error || !r.data) {
        setError(
          r.error?.code === "INVALID_PASSWORD"
            ? "Contraseña incorrecta."
            : (r.error?.message ?? "No se pudo iniciar la activación."),
        )
        return
      }
      setTotpUri(r.data.totpURI)
      setBackupCodes(r.data.backupCodes)
      setPassword("")
      setStep("scan")
    } catch {
      setError("Error de conexión. Intenta de nuevo.")
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setBusy(true)
    setError("")
    try {
      const r = await authClient.twoFactor.verifyTotp({ code: code.trim() })
      if (r.error) {
        setError(
          r.error.code === "INVALID_CODE"
            ? "Código incorrecto. Espera a que la app muestre uno nuevo e inténtalo otra vez."
            : (r.error.message ?? "No se pudo verificar el código."),
        )
        return
      }
      setStep("codes")
    } catch {
      setError("Error de conexión. Intenta de nuevo.")
    } finally {
      setBusy(false)
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("No se pudo copiar. Selecciona los códigos y cópialos a mano.")
    }
  }

  // The secret in the URI is the key to the account: shown only as a QR,
  // with the typed fallback behind a click.
  const secret = totpUri ? (new URL(totpUri).searchParams.get("secret") ?? "") : ""

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-7">
          <CuikLogo size="sm" />
          <span className="text-lg font-extrabold text-gray-900 tracking-tight">Cuik</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
          Verificación en dos pasos
        </h1>
        <p className="text-gray-500 text-sm mt-1 mb-6">
          {step === "password" &&
            `Hola ${userName}. Desde ahora el equipo Cuik entra con contraseña y un código de su app autenticadora. Toma dos minutos.`}
          {step === "scan" && "Escanea el código con tu app y escribe el número que te muestra."}
          {step === "codes" && "Listo. Guarda estos códigos de respaldo antes de continuar."}
        </p>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6 space-y-4">
          {step === "password" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void start()
              }}
            >
              <p className="text-sm text-gray-600">
                Instala <strong>Google Authenticator</strong> (o Microsoft Authenticator, 1Password,
                Authy) en tu teléfono si todavía no la tienes. Luego confirma tu contraseña.
              </p>
              <div>
                <label
                  htmlFor="tf-password"
                  className="text-xs font-semibold text-gray-600 block mb-1.5"
                >
                  Tu contraseña
                </label>
                <Input
                  id="tf-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError("")
                  }}
                  className="h-11 rounded-xl"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full h-11 rounded-xl" disabled={busy || !password}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continuar"}
              </Button>
            </form>
          )}

          {step === "scan" && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void confirm()
              }}
            >
              <div className="flex justify-center">
                {qr ? (
                  <img
                    src={qr}
                    alt="Código QR para la app autenticadora"
                    width={220}
                    height={220}
                  />
                ) : (
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400 my-24" />
                )}
              </div>
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer">
                  ¿No puedes escanear? Escribe la clave a mano
                </summary>
                <code className="block mt-2 p-2 bg-gray-50 rounded-lg break-all select-all">
                  {secret}
                </code>
              </details>
              <div>
                <label
                  htmlFor="tf-code"
                  className="text-xs font-semibold text-gray-600 block mb-1.5"
                >
                  Código de la app
                </label>
                <Input
                  id="tf-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    setError("")
                  }}
                  className="h-11 rounded-xl text-center text-lg tracking-[0.3em] font-mono"
                  placeholder="000000"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="submit"
                className="w-full h-11 rounded-xl"
                disabled={busy || code.length < 6}
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verificar y activar"}
              </Button>
            </form>
          )}

          {step === "codes" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
                Verificación en dos pasos activada.
              </div>
              <p className="text-sm text-gray-600">
                Si pierdes el teléfono, entras con uno de estos códigos. Cada uno sirve una sola
                vez. Guárdalos en tu gestor de contraseñas o impresos; no se vuelven a mostrar.
              </p>
              <ul className="grid grid-cols-2 gap-1.5 font-mono text-sm bg-gray-50 rounded-lg p-3 select-all">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl gap-1.5"
                  onClick={() => void copyCodes()}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copiados" : "Copiar"}
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-xl flex-1"
                  onClick={() => router.push("/admin")}
                >
                  Ya los guardé, continuar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
