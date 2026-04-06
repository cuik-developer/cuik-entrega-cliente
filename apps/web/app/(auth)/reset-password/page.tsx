"use client"

import { CheckCircle2, Eye, EyeOff, KeyRound, Lock } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")
  const tokenError = searchParams.get("error")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const passwordValid = password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const canSubmit = passwordValid && passwordsMatch && !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !token) return

    setLoading(true)
    setError("")

    try {
      const { error: apiError } = await authClient.resetPassword({
        newPassword: password,
        token,
      })

      if (apiError) {
        if (apiError.code === "INVALID_TOKEN") {
          setError("El enlace expiró o no es válido. Solicitá uno nuevo.")
        } else {
          setError(apiError.message ?? "Ocurrió un error. Intentá de nuevo.")
        }
        setLoading(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        router.push("/login")
      }, 3000)
    } catch {
      setError("Error de conexión. Intentá de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  // Invalid or expired token
  if (tokenError === "INVALID_TOKEN" || (!token && !success)) {
    return (
      <div className="py-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <KeyRound className="w-7 h-7 text-red-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">Enlace inválido o expirado</h3>
        <p className="text-gray-500 text-sm leading-relaxed">
          Este enlace para restablecer tu contraseña ya no es válido. Puede que haya expirado o ya
          fue utilizado.
        </p>
        <Link href="/forgot-password">
          <Button className="w-full h-11 bg-[#0e70db] hover:bg-[#0a5fc2] text-white font-semibold text-sm mt-2">
            Solicitar nuevo enlace
          </Button>
        </Link>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="py-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">¡Contraseña actualizada!</h3>
        <p className="text-gray-500 text-sm leading-relaxed">
          Tu contraseña fue restablecida correctamente. Redirigiendo al login...
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full h-11 font-semibold text-sm mt-2">
            Ir al login
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="reset-password"
            className="text-xs font-semibold text-gray-600 block mb-1.5"
          >
            Nueva contraseña
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="reset-password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
              className="h-11 pl-10 pr-10"
              placeholder="Mínimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password && !passwordValid && (
            <p className="text-xs text-amber-600 mt-1">
              Mínimo 8 caracteres, 1 mayúscula y 1 número
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="text-xs font-semibold text-gray-600 block mb-1.5"
          >
            Confirmar contraseña
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              id="reset-confirm-password"
              type={showConfirmPassword ? "text" : "password"}
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setError("")
              }}
              className="h-11 pl-10 pr-10"
              placeholder="Repetí la contraseña"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <p className="text-xs text-red-600 mt-1">Las contraseñas no coinciden</p>
          )}
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-[#0e70db] hover:bg-[#0a5fc2] text-white font-semibold text-sm gap-2"
          disabled={!canSubmit}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Actualizando...
            </span>
          ) : (
            <>
              Restablecer contraseña <KeyRound className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>

      <p className="text-xs text-center text-gray-400">
        ¿Recordaste tu contraseña?{" "}
        <Link href="/login" className="text-[#0e70db] font-semibold hover:underline">
          Iniciá sesión
        </Link>
      </p>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#f0f6ff] flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#0e70db]/5" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#0e70db]/5" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <CuikLogo size="lg" className="mb-4" />
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Nueva contraseña</h1>
          <p className="text-gray-500 text-sm mt-1 text-center">
            Crea una nueva contraseña segura para tu cuenta
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-7 space-y-5">
          <Suspense
            fallback={
              <div className="py-6 text-center">
                <span className="w-6 h-6 rounded-full border-2 border-gray-300 border-t-[#0e70db] animate-spin inline-block" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Cuik Platform · © 2026 · Hecho con amor en LATAM
        </p>
      </div>
    </div>
  )
}
