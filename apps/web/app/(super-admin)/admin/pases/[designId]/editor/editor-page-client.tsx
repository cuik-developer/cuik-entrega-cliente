"use client"

import type { EditorCallbacks, EditorConfig } from "@cuik/editor"
import { adaptV1ToV2, getDefaultConfigV2, isV2Config, PassEditor } from "@cuik/editor"
import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"
import { getConfigVersion } from "@cuik/shared/validators/pass-design-schema"
import { AlertTriangle, Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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

import { duplicateDesign, publishDesign, updateDesign } from "../../actions"

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
  /** False for Equipo Cuik staff: they save drafts, the owner publishes. */
  canPublish?: boolean
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
  canPublish = true,
}: EditorPageClientProps) {
  const router = useRouter()
  const [duplicating, setDuplicating] = useState(false)
  // Staff cannot save over a published design (it is live): they work on a copy.
  const staffOnPublished = !canPublish && initialDesign.isActive
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
        toast.success(
          canPublish
            ? "Diseno guardado correctamente"
            : "Borrador guardado: quedó listo para que el dueño lo revise y publique",
        )
      } else {
        toast.error(result.error)
        // Keep the editor dirty: nothing was saved.
        throw new Error(result.error)
      }
    },

    ...(canPublish
      ? {
          onPublish: async () => {
            // Show confirmation dialog instead of window.confirm
            setPublishDialogOpen(true)
          },
        }
      : {}),

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
  }

  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const isPromoInactive = promotionContext && !promotionContext.active

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      const result = await duplicateDesign(initialDesign.id)
      if (result.success) {
        toast.success("Borrador creado")
        router.push(`/admin/pases/${result.data.id}/editor`)
      } else {
        toast.error(result.error)
      }
    } finally {
      setDuplicating(false)
    }
  }

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
    <div className="h-dvh flex flex-col">
      {/* The editor has fixed 320px / 480px panels: below md it is unusable, say so. */}
      <div className="md:hidden flex-1 flex items-center justify-center p-6 text-center">
        <div className="max-w-xs space-y-2">
          <p className="text-base font-semibold text-ent-fg">Editor solo para computadora</p>
          <p className="text-sm text-ent-fg-3">
            El editor de pases necesita una pantalla ancha. Ábrelo desde una laptop o PC.
          </p>
          <Link
            href="/admin/pases"
            className="inline-block mt-2 text-sm font-medium text-ent-accent hover:underline"
          >
            Volver a Diseños de Pases
          </Link>
        </div>
      </div>
      <div className="hidden md:flex flex-1 min-h-0 flex-col">
        {!canPublish && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center gap-3 shrink-0">
            <span className="flex-1">
              {staffOnPublished
                ? "Este diseño está publicado y no se puede editar directamente. Duplícalo como borrador, edítalo y guárdalo: el dueño lo revisa y lo publica."
                : "Modo Equipo Cuik: al guardar, el borrador queda listo para que el dueño lo revise y lo publique."}
            </span>
            {staffOnPublished && (
              <Button
                size="sm"
                variant="outline"
                disabled={duplicating}
                onClick={handleDuplicate}
                className="h-7 text-xs"
              >
                {duplicating && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                Duplicar como borrador
              </Button>
            )}
          </div>
        )}
        {promotionLabel && (
          <div className="bg-violet-50 border-b border-violet-200 px-4 py-2 text-sm text-violet-700 flex items-center gap-2 shrink-0">
            <span className="font-medium">Promocion vinculada:</span>
            <span>{promotionLabel}</span>
          </div>
        )}
        <div className="flex-1 min-h-0">
          <PassEditor config={config} callbacks={callbacks} />
        </div>
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
            <div className="flex items-start gap-3 rounded-[4px] border border-red-200 bg-red-50 p-3">
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
              className="bg-ent-accent text-white"
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
