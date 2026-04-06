"use client"

import { AlertTriangle, Download, Loader2, Shield, ShieldCheck, Upload } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ── Types ───────────────────────────────────────────────────────────

interface AppleConfigStatus {
  mode: string | null
  passTypeId: string | null
  teamId: string | null
  configuredAt: string | null
  expiresAt: string | null
  hasSigningCert: boolean
  hasPrivateKey: boolean
}

interface AppleCertWizardProps {
  tenantId: string
  tenantSlug: string
  initialConfig?: AppleConfigStatus
}

// ── Helpers ─────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleDateString("es", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

// ── Component ───────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-step wizard with 4 conditional render paths based on cert config state — each step is a distinct UI that must be inline
export function AppleCertWizard({ tenantId, tenantSlug, initialConfig }: AppleCertWizardProps) {
  const [config, setConfig] = useState<AppleConfigStatus | null>(initialConfig ?? null)
  const [loading, setLoading] = useState(!initialConfig)
  const [actionLoading, setActionLoading] = useState(false)

  // Step 1 form state
  const [teamId, setTeamId] = useState("")
  const [passTypeId, setPassTypeId] = useState(`pass.cuik.org.${tenantSlug}`)

  // Step 3 file input
  const [certFile, setCertFile] = useState<File | null>(null)

  const apiUrl = `/api/admin/tenants/${tenantId}/apple-config`

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(apiUrl)
      if (!res.ok) throw new Error("Error al cargar configuracion")
      const json = await res.json()
      setConfig(json.data)
    } catch {
      toast.error("Error al cargar configuracion de Apple")
    } finally {
      setLoading(false)
    }
  }, [apiUrl])

  useEffect(() => {
    if (!initialConfig) {
      fetchConfig()
    }
  }, [fetchConfig, initialConfig])

  // ── API call helper ─────────────────────────────────────────────

  async function postAction(body: Record<string, unknown>) {
    setActionLoading(true)
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Error en la operacion")
        return null
      }
      return json.data
    } catch {
      toast.error("Error de conexion")
      return null
    } finally {
      setActionLoading(false)
    }
  }

  // ── Action handlers ─────────────────────────────────────────────

  async function handleInit() {
    if (teamId.length !== 10) {
      toast.error("El Team ID debe tener exactamente 10 caracteres")
      return
    }
    if (!passTypeId.startsWith("pass.")) {
      toast.error("El Pass Type ID debe comenzar con 'pass.'")
      return
    }
    const result = await postAction({ action: "init", teamId, passTypeId })
    if (result) {
      toast.success("Configuracion iniciada")
      await fetchConfig()
    }
  }

  async function handleGenerateCsr() {
    const result = await postAction({ action: "generate-csr" })
    if (result?.csrPem) {
      // Trigger CSR file download
      const blob = new Blob([result.csrPem], { type: "application/pkcs10" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${config?.passTypeId ?? "pass"}.csr`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("CSR generado y descargado")
      await fetchConfig()
    }
  }

  async function handleUploadCert() {
    if (!certFile) {
      toast.error("Selecciona un archivo .cer primero")
      return
    }
    const buffer = await certFile.arrayBuffer()
    const certBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    const result = await postAction({ action: "upload-cert", certBase64 })
    if (result) {
      toast.success(`Certificado subido. Expira: ${formatDate(result.expiresAt)}`)
      setCertFile(null)
      await fetchConfig()
    }
  }

  async function handleActivate() {
    const result = await postAction({ action: "activate" })
    if (result) {
      toast.success("Modo produccion activado")
      await fetchConfig()
    }
  }

  async function handleRevertToDemo() {
    setActionLoading(true)
    try {
      const res = await fetch(apiUrl, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Error al revertir")
        return
      }
      toast.success("Revertido a modo demo")
      await fetchConfig()
    } catch {
      toast.error("Error de conexion")
    } finally {
      setActionLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500">Cargando...</span>
      </div>
    )
  }

  const mode = config?.mode ?? null

  // ── Production state ──────────────────────────────────────────
  if (mode === "production") {
    const expiryDays = daysUntil(config?.expiresAt ?? null)
    const isExpiringSoon = expiryDays !== null && expiryDays < 30

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h4 className="font-semibold text-slate-900">Certificado Apple</h4>
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs border">
            Produccion
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-slate-500">Pass Type ID</span>
            <p className="font-medium text-slate-900">{config?.passTypeId}</p>
          </div>
          <div>
            <span className="text-slate-500">Team ID</span>
            <p className="font-medium text-slate-900">{config?.teamId}</p>
          </div>
          <div>
            <span className="text-slate-500">Configurado</span>
            <p className="font-medium text-slate-900">{formatDate(config?.configuredAt ?? null)}</p>
          </div>
          <div>
            <span className="text-slate-500">Expira</span>
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">{formatDate(config?.expiresAt ?? null)}</p>
              {isExpiringSoon && (
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs border">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {expiryDays}d restantes
                </Badge>
              )}
            </div>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-red-600 border-red-200 hover:bg-red-50"
            >
              Volver a Demo
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Volver a modo demo</AlertDialogTitle>
              <AlertDialogDescription>
                Los pases de este tenant usaran el certificado global de Cuik en lugar de su
                certificado propio. Los datos del certificado se conservan para una posible
                reactivacion.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleRevertToDemo} disabled={actionLoading}>
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ── Step 4: Activate (configuring + has cert + key) ───────────
  if (mode === "configuring" && config?.hasSigningCert && config?.hasPrivateKey) {
    const expiryDays = daysUntil(config?.expiresAt ?? null)

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-slate-900">Activar Modo Produccion</h4>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-blue-900">Resumen de configuracion:</p>
          <div className="grid grid-cols-2 gap-2 text-blue-800">
            <div>
              <span className="text-blue-600">Pass Type ID:</span>{" "}
              <span className="font-medium">{config.passTypeId}</span>
            </div>
            <div>
              <span className="text-blue-600">Team ID:</span>{" "}
              <span className="font-medium">{config.teamId}</span>
            </div>
            {config.expiresAt && (
              <div className="col-span-2">
                <span className="text-blue-600">Certificado expira:</span>{" "}
                <span className="font-medium">
                  {formatDate(config.expiresAt)}
                  {expiryDays !== null && ` (${expiryDays} dias)`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 inline mr-1" />
          Los pases existentes se regeneraran con el nuevo certificado.
        </div>

        <Button onClick={handleActivate} disabled={actionLoading} className="w-full">
          {actionLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <ShieldCheck className="w-4 h-4 mr-2" />
          )}
          Activar
        </Button>
      </div>
    )
  }

  // ── Step 3: Upload Certificate (configuring + has key, no cert) ──
  if (mode === "configuring" && config?.hasPrivateKey && !config?.hasSigningCert) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-slate-900">Subir Certificado</h4>
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs border">
            Paso 3/4
          </Badge>
        </div>

        <div className="text-sm text-slate-600 space-y-2">
          <p>
            Subi el archivo <code className="bg-slate-100 px-1 rounded">.cer</code> que descargaste
            del Apple Developer Portal.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cert-upload">Archivo de certificado (.cer)</Label>
          <Input
            id="cert-upload"
            type="file"
            accept=".cer"
            onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </div>

        <Button onClick={handleUploadCert} disabled={actionLoading || !certFile} className="w-full">
          {actionLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          Subir Certificado
        </Button>
      </div>
    )
  }

  // ── Step 2: Download CSR (configuring, no key yet) ────────────
  if (mode === "configuring" && !config?.hasPrivateKey) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-slate-900">Descargar CSR</h4>
          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs border">
            Paso 2/4
          </Badge>
        </div>

        <div className="text-sm text-slate-600 space-y-2">
          <p>Descarga el archivo CSR y subilo al Apple Developer Portal:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-500">
            <li>
              Anda a{" "}
              <span className="font-medium text-slate-700">
                Certificates, Identifiers & Profiles
              </span>
            </li>
            <li>
              Selecciona{" "}
              <span className="font-medium text-slate-700">Pass Type ID Certificate</span>
            </li>
            <li>Subi el archivo CSR descargado</li>
            <li>
              Descarga el archivo <code className="bg-slate-100 px-1 rounded">.cer</code> generado
            </li>
          </ol>
        </div>

        <Button onClick={handleGenerateCsr} disabled={actionLoading} className="w-full">
          {actionLoading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Generar y Descargar CSR
        </Button>
      </div>
    )
  }

  // ── Step 1: Setup (no config or demo mode) ────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-blue-600" />
        <h4 className="font-semibold text-slate-900">Configurar Certificado Apple</h4>
      </div>

      <p className="text-sm text-slate-600">
        Para usar certificados propios, necesitas una cuenta de Apple Developer con acceso a
        Certificates, Identifiers & Profiles.
      </p>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="team-id">Team ID (10 caracteres)</Label>
          <Input
            id="team-id"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value.toUpperCase())}
            placeholder="ABCDE12345"
            maxLength={10}
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pass-type-id">Pass Type ID</Label>
          <Input
            id="pass-type-id"
            value={passTypeId}
            onChange={(e) => setPassTypeId(e.target.value)}
            placeholder="pass.cuik.org.micomercio"
            className="font-mono text-sm"
          />
        </div>
      </div>

      <Button
        onClick={handleInit}
        disabled={actionLoading || teamId.length !== 10 || !passTypeId.startsWith("pass.")}
        className="w-full"
      >
        {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Iniciar Configuracion
      </Button>
    </div>
  )
}
