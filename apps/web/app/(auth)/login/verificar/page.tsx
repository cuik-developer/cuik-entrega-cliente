"use client"

import { ROLE_REDIRECTS, type Role } from "@cuik/shared"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"
import { TWO_FACTOR_TRUST_DAYS } from "@/lib/two-factor"

const ERROR_TEXT: Record<string, string> = {
  INVALID_CODE: "Código incorrecto. Revisa la app e inténtalo de nuevo.",
  INVALID_BACKUP_CODE: "Código de respaldo incorrecto o ya usado.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Demasiados intentos. Vuelve a iniciar sesión.",
  ACCOUNT_TEMPORARILY_LOCKED: "Demasiados intentos. Espera 15 minutos y vuelve a intentar.",
  INVALID_TWO_FACTOR_COOKIE: "La sesión de ingreso venció. Vuelve a iniciar sesión.",
  TOTP_NOT_ENABLED: "La app autenticadora no quedó enlazada. Vuelve a iniciar sesión.",
}

function safeCallback(url: string | null): string | null {
  return url?.startsWith("/") && !url.startsWith("//") ? url : null
}

export default function VerificarPage() {
  return (
    <Suspense>
      <VerificarContent />
    </Suspense>
  )
}

/**
 * Second step of the sign-in for the Cuik team: the password was accepted and
 * Better Auth waits for the 6-digit code of the authenticator app (or one of
 * the backup codes).
 */
function VerificarContent() {
  const router = useRouter()
  const callbackUrl = safeCallback(useSearchParams().get("callbackUrl"))
  const [code, setCode] = useState("")
  const [trust, setTrust] = useState(true)
  const [backup, setBackup] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState("")

  async function verify() {
    const value = code.trim()
    if (!value) return
    setVerifying(true)
    setError("")
    try {
      const r = backup
        ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice: trust })
        : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust })
      if (r.error) {
        const c = r.error.code ?? ""
        setError(
          r.error.status === 429
            ? "Demasiados intentos seguidos. Espera unos segundos y vuelve a probar."
            : (ERROR_TEXT[c] ?? r.error.message ?? "No se pudo verificar el código."),
        )
        if (c === "INVALID_TWO_FACTOR_COOKIE" || c === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") {
          setTimeout(() => router.replace("/login"), 1500)
        }
        return
      }
      const session = await authClient.getSession()
      const role = ((session.data?.user as { role?: string } | undefined)?.role ?? "user") as Role
      router.push(callbackUrl ?? ROLE_REDIRECTS[role] ?? "/cajero/escanear")
    } catch {
      setError("Error de conexión. Intenta de nuevo.")
    } finally {
      setVerifying(false)
    }
  }

  const switchMode = (toBackup: boolean) => {
    setBackup(toBackup)
    setCode("")
    setError("")
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-7">
          <CuikLogo size="sm" />
          <span className="text-lg font-extrabold text-gray-900 tracking-tight">Cuik</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Un paso más</h1>
        <p className="text-gray-500 text-sm mt-1 mb-6">
          {backup
            ? "Escribe uno de tus códigos de respaldo. Cada uno sirve una sola vez."
            : "Escribe el código de 6 dígitos que muestra tu app autenticadora."}
        </p>

        <form
          className="bg-white rounded-2xl shadow-sm border border-gray-200/80 p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void verify()
          }}
        >
          <div>
            <label htmlFor="otp-code" className="text-xs font-semibold text-gray-600 block mb-1.5">
              {backup ? "Código de respaldo" : "Código de la app"}
            </label>
            <Input
              id="otp-code"
              inputMode={backup ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(backup ? e.target.value : e.target.value.replace(/\D/g, "").slice(0, 6))
                setError("")
              }}
              className="h-11 rounded-xl text-center text-lg tracking-[0.3em] font-mono"
              placeholder={backup ? "xxxxx-xxxxx" : "000000"}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={trust}
              onChange={(e) => setTrust(e.target.checked)}
              className="rounded"
            />
            Confiar en este dispositivo por {TWO_FACTOR_TRUST_DAYS} días
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            className="w-full h-11 rounded-xl"
            disabled={verifying || code.trim().length < (backup ? 5 : 6)}
          >
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
          </Button>

          <button
            type="button"
            className="text-sm text-gray-500 hover:underline"
            onClick={() => switchMode(!backup)}
          >
            {backup
              ? "Volver al código de la app"
              : "No tengo el teléfono: usar código de respaldo"}
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-6">
          ¿No eres tú?{" "}
          <Link href="/login" className="hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
