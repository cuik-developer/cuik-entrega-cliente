import { useEditorStore } from "../../store/editor-store"
import type { AssetKey } from "../../types"
import { AssetSlot } from "./asset-slot"
import { CollapsibleSection } from "./collapsible-section"

interface BrandingSectionProps {
  onUploadAsset: (key: AssetKey, file: File) => void
}

export function BrandingSection({ onUploadAsset }: BrandingSectionProps) {
  const logoUrl = useEditorStore((s) => s.config.assets.logo)
  const iconUrl = useEditorStore((s) => s.config.assets.icon)
  const logoText = useEditorStore((s) => s.config.logoText)
  const assetLoading = useEditorStore((s) => s.assetLoading)
  const updateLogoText = useEditorStore((s) => s.updateLogoText)

  return (
    <CollapsibleSection title="Branding">
      <AssetSlot
        label="Logo — caja de hasta 160 × 50 pt (480 × 150 px @3x)"
        currentUrl={logoUrl}
        isLoading={assetLoading.logo}
        onUpload={(file) => onUploadAsset("logo", file)}
      />
      <p className="-mt-2 text-[10px] leading-snug text-gray-500">
        El logo se encaja centrado en esa caja sin deformarse (lo que sobra queda transparente). En
        Google se muestra recortado en un círculo.
      </p>

      <AssetSlot
        label="Icono — 29 × 29 pt (87 × 87 px @3x), cuadrado"
        currentUrl={iconUrl}
        isLoading={assetLoading.icon}
        onUpload={(file) => onUploadAsset("icon", file)}
      />
      <p className="-mt-2 text-[10px] leading-snug text-gray-500">
        Se ve en las notificaciones y en la pantalla de bloqueo del iPhone.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">
          Texto del logo (no se muestra en el teléfono)
        </span>
        <input
          type="text"
          value={logoText}
          onChange={(e) => updateLogoText(e.target.value)}
          placeholder="Nombre del negocio"
          className="w-full px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-800 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
        />
        <span className="text-[10px] leading-snug text-gray-500">
          Apple lo oculta (Cuik envía un texto vacío) y Google muestra el nombre del comercio. Solo
          se usa como referencia interna en el panel.
        </span>
      </label>
    </CollapsibleSection>
  )
}
