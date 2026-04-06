"use client"

import { ROLE_REDIRECTS, type Role } from "@cuik/shared"
import { CheckCircle2, Clock, Loader2, LogIn, Mail, UserPlus, XCircle } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CuikLogo } from "@/components/cuik-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authClient, useSession } from "@/lib/auth-client"
import { CUIK_ACCENT, CUIK_PRIMARY, darkenColor } from "@/lib/color-utils"
import type { InvitationInfo } from "./actions"
import { getInvitationInfo } from "./actions"

// ── Types ───────────────────────────────────────────────────────────

type PageState =
  | "loading"
  | "unauthenticated"
  | "ready"
  | "expired"
  | "already-accepted"
  | "not-found"
  | "accepting"
  | "accepted"

// ── Helpers ─────────────────────────────────────────────────────────

function roleLabel(role: string | null | undefined): string {
  if (!role) return "Miembro"
  if (role === "owner") return "Propietario"
  if (role === "admin") return "Administrador"
  return "Cajero"
}

// ── Page ────────────────────────────────────────────────────────────

export default function AcceptInvitationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, isPending: sessionLoading } = useSession()

  const [pageState, setPageState] = useState<PageState>("loading")
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)

  const invitationId = params.id

  // Derive branding colors — fallback to Cuik defaults when no branding data
  const brandingColors = useMemo(() => {
    const primary = invitation?.branding?.primaryColor ?? CUIK_PRIMARY
    const accent = invitation?.branding?.accentColor ?? CUIK_ACCENT
    const primaryHover = darkenColor(primary, 0.15)
    return { primary, accent, primaryHover }
  }, [invitation?.branding?.primaryColor, invitation?.branding?.accentColor])

  const fetchInvitation = useCallback(async () => {
    const result = await getInvitationInfo(invitationId)

    if (!result.success) {
      if (result.error === "expired") setPageState("expired")
      else if (result.error === "already-accepted") setPageState("already-accepted")
      else setPageState("not-found")
      return
    }

    setInvitation(result.data)

    if (!session) {
      setPageState("unauthenticated")
    } else {
      setPageState("ready")
    }
  }, [invitationId, session])

  useEffect(() => {
    if (sessionLoading) return
    fetchInvitation()
  }, [sessionLoading, fetchInvitation])

  async function handleAccept() {
    setPageState("accepting")

    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      })

      if (result.error) {
        toast.error(result.error.message ?? "Error al aceptar la invitación")
        setPageState("ready")
        return
      }

      const orgName = invitation?.organizationName ?? "la organización"
      toast.success(`¡Te uniste a ${orgName}!`)
      setPageState("accepted")

      // Redirect based on role
      const sessionRes = await authClient.getSession()
      const userRole = ((sessionRes.data?.user as { role?: string } | undefined)?.role ??
        "user") as Role
      const redirectTo = ROLE_REDIRECTS[userRole] ?? "/cajero/escanear"

      setTimeout(() => {
        router.push(redirectTo)
      }, 1500)
    } catch {
      toast.error("Error inesperado al aceptar la invitación")
      setPageState("ready")
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50/80 px-4 py-10">
      {/* Subtle background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: `${brandingColors.primary}0a` }}
        />
        <div
          className="absolute -bottom-32 -left-32 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: `${brandingColors.accent}08` }}
        />
      </div>

      {/* Logo */}
      <Link href="/" className="group mb-8 flex items-center gap-2.5">
        <CuikLogo size="sm" />
        <span className="text-xl font-extrabold tracking-tight text-gray-900 group-hover:text-[#0e70db] transition-colors">
          Cuik
        </span>
      </Link>

      <div className="relative w-full max-w-md">
        {/* Loading */}
        {pageState === "loading" && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: CUIK_PRIMARY }} />
              <p className="mt-4 text-sm text-gray-500">Cargando invitación...</p>
            </CardContent>
          </Card>
        )}

        {/* Unauthenticated */}
        {pageState === "unauthenticated" && invitation && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="text-center">
              {invitation.branding?.logoUrl ? (
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full overflow-hidden">
                  <Image
                    src={invitation.branding.logoUrl}
                    alt={invitation.organizationName}
                    width={56}
                    height={56}
                    className="h-14 w-14 object-contain"
                  />
                </div>
              ) : (
                <div
                  className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor: `${brandingColors.primary}10`,
                    borderColor: `${brandingColors.primary}20`,
                  }}
                >
                  <Mail className="h-7 w-7" style={{ color: brandingColors.primary }} />
                </div>
              )}
              <CardTitle className="text-xl font-extrabold text-gray-900">
                Invitación de {invitation.organizationName}
              </CardTitle>
              <CardDescription className="text-sm text-gray-500">
                {invitation.inviterName} te invitó a unirte como{" "}
                {roleLabel(invitation.role).toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Organización</span>
                  <span className="font-semibold text-gray-900">{invitation.organizationName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Rol</span>
                  <span className="font-medium text-gray-700">{roleLabel(invitation.role)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Invitado por</span>
                  <span className="font-medium text-gray-700">{invitation.inviterName}</span>
                </div>
              </div>
              <p className="text-center text-sm text-gray-500">
                Iniciá sesión o creá una cuenta para aceptar la invitación.
              </p>
              <Button
                asChild
                className="w-full gap-2 text-white font-semibold rounded-xl h-11 shadow-md"
                style={{ backgroundColor: brandingColors.primary }}
                onMouseOver={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor =
                    brandingColors.primaryHover
                }}
                onMouseOut={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = brandingColors.primary
                }}
              >
                <Link href={`/login?callbackUrl=/accept-invitation/${invitationId}`}>
                  <LogIn className="h-4 w-4" />
                  Iniciar sesión
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="w-full gap-2 font-semibold rounded-xl h-11 border-gray-300 hover:bg-gray-50"
              >
                <Link href={`/register?callbackUrl=/accept-invitation/${invitationId}`}>
                  <UserPlus className="h-4 w-4" />
                  Crear cuenta
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Ready to accept */}
        {pageState === "ready" && invitation && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardHeader className="text-center">
              {invitation.branding?.logoUrl ? (
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full overflow-hidden">
                  <Image
                    src={invitation.branding.logoUrl}
                    alt={invitation.organizationName}
                    width={56}
                    height={56}
                    className="h-14 w-14 object-contain"
                  />
                </div>
              ) : (
                <div
                  className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border"
                  style={{
                    backgroundColor: `${brandingColors.primary}10`,
                    borderColor: `${brandingColors.primary}20`,
                  }}
                >
                  <Mail className="h-7 w-7" style={{ color: brandingColors.primary }} />
                </div>
              )}
              <CardTitle className="text-xl font-extrabold text-gray-900">
                Invitación de {invitation.organizationName}
              </CardTitle>
              <CardDescription className="text-sm text-gray-500">
                {invitation.inviterName} te invitó a unirte como{" "}
                {roleLabel(invitation.role).toLowerCase()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Invitation details */}
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Organización</span>
                  <span className="font-semibold text-gray-900">{invitation.organizationName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Rol</span>
                  <span className="font-medium text-gray-700">{roleLabel(invitation.role)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Invitado por</span>
                  <span className="font-medium text-gray-700">{invitation.inviterName}</span>
                </div>
              </div>

              <Button
                className="w-full gap-2 text-white font-semibold rounded-xl h-11 shadow-md"
                style={{ backgroundColor: brandingColors.primary }}
                onMouseOver={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor =
                    brandingColors.primaryHover
                }}
                onMouseOut={(e) => {
                  ;(e.currentTarget as HTMLElement).style.backgroundColor = brandingColors.primary
                }}
                onClick={handleAccept}
              >
                <CheckCircle2 className="h-4 w-4" />
                Aceptar invitación
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Accepting */}
        {pageState === "accepting" && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="flex flex-col items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: brandingColors.primary }} />
              <p className="mt-4 text-sm text-gray-500">Aceptando invitación...</p>
            </CardContent>
          </Card>
        )}

        {/* Accepted successfully */}
        {pageState === "accepted" && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="flex flex-col items-center py-12">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border-2 border-emerald-200">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">¡Te uniste exitosamente!</h3>
              <p className="mt-2 text-sm text-gray-500 text-center max-w-xs">
                {invitation?.organizationName
                  ? `Ahora sos parte de ${invitation.organizationName}.`
                  : "La invitación fue aceptada."}
              </p>
              <p className="mt-4 text-xs text-gray-400">Redirigiendo...</p>
            </CardContent>
          </Card>
        )}

        {/* Expired */}
        {pageState === "expired" && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="flex flex-col items-center py-12">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 border-2 border-amber-200">
                <Clock className="h-8 w-8 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Invitación expirada</h3>
              <p className="mt-2 text-sm text-gray-500 text-center max-w-xs">
                Esta invitación ya no es válida. Pedile al administrador que te envíe una nueva.
              </p>
              <Button asChild variant="outline" className="mt-6 rounded-xl font-semibold">
                <Link href="/login">Ir al inicio de sesión</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Already accepted */}
        {pageState === "already-accepted" && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="flex flex-col items-center py-12">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 border-2 border-blue-200">
                <CheckCircle2 className="h-8 w-8" style={{ color: CUIK_PRIMARY }} />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Ya aceptaste esta invitación</h3>
              <p className="mt-2 text-sm text-gray-500 text-center max-w-xs">
                Ya sos parte de esta organización. Podés acceder al panel directamente.
              </p>
              <Button
                asChild
                className="mt-6 gap-2 text-white font-semibold rounded-xl"
                style={{ backgroundColor: CUIK_PRIMARY }}
              >
                <Link href="/panel">Ir al panel</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Not found / invalid */}
        {pageState === "not-found" && (
          <Card className="border-gray-200/80 shadow-sm">
            <CardContent className="flex flex-col items-center py-12">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 border-2 border-red-200">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Invitación no encontrada</h3>
              <p className="mt-2 text-sm text-gray-500 text-center max-w-xs">
                El enlace de invitación no es válido o ya fue utilizado.
              </p>
              <Button asChild variant="outline" className="mt-6 rounded-xl font-semibold">
                <Link href="/login">Ir al inicio de sesión</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <p className="mt-8 text-center text-xs text-gray-400">
        &copy; 2026 Cuik &middot; Hecho con amor en Lima, Per&uacute;
      </p>
    </div>
  )
}
