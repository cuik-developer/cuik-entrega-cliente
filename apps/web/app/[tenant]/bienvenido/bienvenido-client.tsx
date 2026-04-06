"use client"

import { WalletPreview } from "@cuik/editor"
import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"
import { AlertTriangle, CheckCircle, Gift, Smartphone, Store, Trophy } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const STEPS = [
  {
    icon: Store,
    title: "Visita el comercio",
    description: "Acercate a cualquier sucursal",
  },
  {
    icon: Smartphone,
    title: "Mostra tu pase en caja",
    description: "Desde tu wallet o navegador",
  },
  {
    icon: Gift,
    title: "Acumula sellos y gana premios",
    description: "Cada visita te acerca al premio",
  },
]

type Platform = "ios" | "android" | "other"

function AppleWalletButton({ url }: { url: string | null }) {
  if (url) {
    return (
      <a href={url} className="block">
        <Button className="w-full h-12 bg-black text-white hover:bg-gray-900 rounded-xl text-base font-semibold gap-2">
          <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
            <title>Apple</title>
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
          </svg>
          Agregar a Apple Wallet
        </Button>
      </a>
    )
  }
  return (
    <Button
      disabled
      className="w-full h-12 bg-black/40 text-white rounded-xl text-base font-semibold gap-2"
    >
      <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
        <title>Apple</title>
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      Apple Wallet no disponible
    </Button>
  )
}

function GoogleWalletButton({ url }: { url: string | null }) {
  const googleIcon = (
    <svg className="size-5" viewBox="0 0 24 24">
      <title>Google</title>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <Button
          variant="outline"
          className="w-full h-12 rounded-xl text-base font-semibold gap-2 border-2"
        >
          {googleIcon}
          Agregar a Google Wallet
        </Button>
      </a>
    )
  }
  return (
    <Button
      disabled
      variant="outline"
      className="w-full h-12 rounded-xl text-base font-semibold gap-2 border-2 opacity-50"
    >
      {googleIcon}
      Google Wallet no disponible
    </Button>
  )
}

function WalletButtons({
  appleUrl,
  googleUrl,
}: {
  appleUrl: string | null
  googleUrl: string | null
}) {
  const [platform, setPlatform] = useState<Platform>("other")

  useEffect(() => {
    const ua = navigator.userAgent
    if (/iPhone|iPad|iPod|Macintosh/i.test(ua) && "ontouchend" in document) {
      setPlatform("ios")
    } else if (/Android/i.test(ua)) {
      setPlatform("android")
    }
  }, [])

  return (
    <div className="space-y-3">
      {platform === "android" ? (
        <>
          <GoogleWalletButton url={googleUrl} />
          <AppleWalletButton url={appleUrl} />
        </>
      ) : (
        <>
          <AppleWalletButton url={appleUrl} />
          <GoogleWalletButton url={googleUrl} />
        </>
      )}
    </div>
  )
}

export interface ServerData {
  nombre?: string
  appleUrl?: string | null
  googleUrl?: string | null
  error?: string
}

interface BienvenidoClientProps {
  tenantName: string
  tenantSlug: string
  primaryColor: string
  logoUrl: string | null
  serverData?: ServerData
  passConfig?: PassDesignConfigV2 | null
  promotionType?: "stamps" | "points"
  hasCatalog?: boolean
}

export default function BienvenidoClient({
  tenantName,
  tenantSlug,
  primaryColor,
  logoUrl: _logoUrl,
  serverData,
  passConfig,
  promotionType = "stamps",
  hasCatalog = false,
}: BienvenidoClientProps) {
  const searchParams = useSearchParams()

  // If serverData has an error, show expired state
  if (serverData?.error) {
    return (
      <div
        className="min-h-screen bg-gradient-to-b via-white to-gray-50"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${primaryColor}0d, white, rgb(249 250 251))`,
        }}
      >
        <div className="mx-auto max-w-md px-4 py-8 space-y-6">
          <div className="text-center space-y-3 pt-16">
            <div className="inline-flex items-center justify-center size-16 rounded-full bg-amber-100 mb-2">
              <AlertTriangle className="size-8 text-amber-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900">Link expirado</h1>
            <p className="text-gray-500 text-base">
              Este enlace ya no es valido. Solicita uno nuevo ingresando tu email.
            </p>
          </div>
          <div className="flex justify-center pt-4">
            <Link href={`/${tenantSlug}/registro`}>
              <Button
                className="h-12 px-8 rounded-xl text-base font-semibold"
                style={{ backgroundColor: primaryColor }}
              >
                Solicitar nuevo link
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Dual-mode: prefer serverData if present, fallback to searchParams
  const nombre = serverData?.nombre ?? searchParams.get("nombre") ?? "Cliente"
  const appleUrl = serverData?.appleUrl ?? searchParams.get("apple") ?? null
  const googleUrl = serverData?.googleUrl ?? searchParams.get("google") ?? null

  return (
    <div
      className="min-h-screen bg-gradient-to-b via-white to-gray-50"
      style={{
        backgroundImage: `linear-gradient(to bottom, ${primaryColor}0d, white, rgb(249 250 251))`,
      }}
    >
      <div className="mx-auto max-w-md px-4 py-8 space-y-6">
        {/* Header / Celebration */}
        <div className="text-center space-y-3 pt-4">
          <div className="inline-flex items-center justify-center size-16 rounded-full bg-green-100 mb-2">
            <CheckCircle className="size-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900">¡Bienvenido/a, {nombre}!</h1>
          <p className="text-gray-500 text-base">Tu pase de fidelizacion esta listo</p>
          <Badge variant="secondary" className="text-sm">
            {tenantName}
          </Badge>
        </div>

        {/* Wallet Pass Preview */}
        {passConfig ? (
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <WalletPreview
              config={passConfig}
              previewFilledStamps={0}
              promotionType={promotionType}
            />
          </div>
        ) : (
          <Card className="overflow-hidden shadow-lg border-0 gap-0 py-0">
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ backgroundColor: primaryColor }}
            >
              <p className="text-white font-bold text-lg leading-tight">{tenantName}</p>
            </div>
            <CardContent className="p-5 text-center text-sm text-gray-400">
              Tu pase esta siendo preparado
            </CardContent>
          </Card>
        )}

        {/* Wallet buttons */}
        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-gray-700">
            Guarda tu pase en el celular
          </p>
          <WalletButtons appleUrl={appleUrl} googleUrl={googleUrl} />
        </div>

        {/* Catalog link */}
        {hasCatalog && (
          <Link
            href={`/${tenantSlug}/premios`}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-100"
          >
            <Trophy className="size-4" style={{ color: primaryColor }} />
            Ver premios disponibles
          </Link>
        )}

        {/* How it works */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900 text-center">¿Como funciona?</h2>
          <div className="space-y-2">
            {STEPS.map((step, i) => (
              <Card key={step.title} className="py-3 gap-0">
                <CardContent className="flex items-center gap-4 p-0 px-4">
                  <div
                    className="flex items-center justify-center size-10 rounded-full shrink-0"
                    style={{
                      backgroundColor: `${primaryColor}15`,
                    }}
                  >
                    <step.icon className="size-5" style={{ color: primaryColor }} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">
                      {i + 1}. {step.title}
                    </p>
                    <p className="text-xs text-gray-500">{step.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2 pb-8">
          <p className="text-sm text-gray-400">¿Tenes dudas? Contacta a {tenantName}</p>
          <Link
            href="/"
            className="text-sm font-medium hover:underline"
            style={{ color: primaryColor }}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
