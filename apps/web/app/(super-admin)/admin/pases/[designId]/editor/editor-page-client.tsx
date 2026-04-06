"use client"

import type { EditorCallbacks, EditorConfig } from "@cuik/editor"
import { adaptV1ToV2, getDefaultConfigV2, isV2Config, PassEditor } from "@cuik/editor"
import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"
import { getConfigVersion } from "@cuik/shared/validators/pass-design-schema"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { publishDesign, updateDesign } from "../../actions"

// ── Types ───────────────────────────────────────────────────────────

interface EditorPageClientProps {
  initialDesign: {
    id: string
    tenantId: string
    name: string
    type: "apple_store" | "google_loyalty"
    canvasData: unknown
    colors: unknown
    stampsConfig: unknown
    fields: unknown
    isActive: boolean
    version: number
  }
  initialAssets: Array<{
    id: string
    designId: string
    type: string
    url: string
    metadata: unknown
  }>
  tenantName: string
  businessType?: string
  promotionContext?: {
    type: string
    maxVisits: number | null
    rewardValue: string | null
    active: boolean
  }
  strategicFields?: Array<{ key: string; label: string }>
}

// ── Resolve config ──────────────────────────────────────────────────

function resolveConfig(
  design: EditorPageClientProps["initialDesign"],
  tenantName: string,
): PassDesignConfigV2 {
  const version = getConfigVersion(design.canvasData)

  if (version === "v2" && isV2Config(design.canvasData)) {
    return design.canvasData
  }

  if (version === "v1") {
    return adaptV1ToV2(design.canvasData, design.colors, design.stampsConfig)
  }

  // "empty" — brand new design
  return getDefaultConfigV2(tenantName)
}

// ── Component ───────────────────────────────────────────────────────

export function EditorPageClient({
  initialDesign,
  initialAssets: _initialAssets,
  tenantName,
  businessType,
  promotionContext,
  strategicFields,
}: EditorPageClientProps) {
  const initialConfig = resolveConfig(initialDesign, tenantName)

  // Convert strategic fields to editor custom variables
  const customVariables = strategicFields?.map((f) => ({
    variable: `{{client.customData.${f.key}}}`,
    label: f.label,
  }))

  const config: EditorConfig = {
    designId: initialDesign.id,
    designName: initialDesign.name,
    tenantId: initialDesign.tenantId,
    tenantName,
    businessType,
    passType: initialDesign.type,
    promotionType: (promotionContext?.type as "stamps" | "points") ?? "stamps",
    initialConfig,
    customVariables,
  }

  const callbacks: EditorCallbacks = {
    onSave: async (configData: PassDesignConfigV2) => {
      const result = await updateDesign(initialDesign.id, {
        canvasData: configData,
        colors: configData.colors,
        stampsConfig: configData.stampsConfig,
        fields: configData.fields,
      })

      if (result.success) {
        toast.success("Diseno guardado correctamente")
      } else {
        toast.error(result.error)
      }
    },

    onPublish: async () => {
      // Show confirmation dialog instead of window.confirm
      setPublishDialogOpen(true)
    },

    onUploadAsset: async (file: File): Promise<string> => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("tenantId", initialDesign.tenantId)

      const response = await fetch("/api/admin/assets/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Error de servidor" }))
        throw new Error(body.error ?? "Error al subir archivo")
      }

      const result = await response.json()
      return result.data.url
    },

    onGenerateAsset: async (assetType: string, prompt?: string): Promise<string> => {
      const response = await fetch("/api/admin/generate-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: initialDesign.tenantId,
          assetType,
          businessName: tenantName,
          businessType: businessType || undefined,
          prompt: prompt || undefined,
          promotionType: promotionContext?.type ?? "stamps",
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Error de servidor" }))
        throw new Error(body.error ?? "Error al generar asset")
      }

      const result = await response.json()
      return result.data.url
    },

    onGenerateFullDesign: async (
      businessName: string,
      businessType?: string,
    ): Promise<PassDesignConfigV2> => {
      const response = await fetch("/api/admin/generate-full-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: initialDesign.tenantId,
          businessName,
          businessType,
          promotionType: promotionContext?.type ?? "stamps",
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Error de servidor" }))
        throw new Error(body.error ?? "Error al generar diseño completo")
      }

      const result = await response.json()
      return result.data.config as PassDesignConfigV2
    },
  }

  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const isPromoInactive = promotionContext && !promotionContext.active

  const handleConfirmPublish = async () => {
    setPublishing(true)
    try {
      const result = await publishDesign(initialDesign.id)
      if (result.success) {
        toast.success(`Diseno publicado — version ${result.data.version}`)
        setPublishDialogOpen(false)
      } else {
        toast.error(result.error)
      }
    } finally {
      setPublishing(false)
    }
  }

  const promotionLabel = promotionContext
    ? promotionContext.type === "stamps"
      ? `Sellos (${promotionContext.maxVisits ?? "?"} visitas, Premio: ${promotionContext.rewardValue ?? "N/A"})`
      : `Puntos (Premio: ${promotionContext.rewardValue ?? "N/A"})`
    : null

  return (
    <div className="h-screen flex flex-col">
      {promotionLabel && (
        <div className="bg-violet-50 border-b border-violet-200 px-4 py-2 text-sm text-violet-700 flex items-center gap-2 shrink-0">
          <span className="font-medium">Promocion vinculada:</span>
          <span>{promotionLabel}</span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <PassEditor config={config} callbacks={callbacks} />
      </div>

      {/* Publish confirmation dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publicar diseño</DialogTitle>
            <DialogDescription>
              {isPromoInactive ? (
                <span className="text-red-600">
                  La promocion vinculada no esta activa. Debes activarla primero desde el panel de
                  tenants.
                </span>
              ) : (
                "Al publicar, este diseño reemplazara el pase activo actual para este comercio. Los clientes veran el nuevo diseño."
              )}
            </DialogDescription>
          </DialogHeader>

          {isPromoInactive && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">
                Promocion &quot;{promotionContext?.rewardValue}&quot; esta inactiva. Activa la
                promocion antes de publicar el pase.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
              disabled={publishing}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmPublish}
              disabled={publishing || !!isPromoInactive}
              className="bg-[#0e70db] text-white"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Publicando...
                </>
              ) : (
                "Confirmar publicacion"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
