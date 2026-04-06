import { useEditorStore } from "../../store/editor-store"
import type { AssetKey } from "../../types"
import { AssetSlot } from "./asset-slot"
import { CollapsibleSection } from "./collapsible-section"

interface BrandingSectionProps {
  onUploadAsset: (key: AssetKey, file: File) => void
  onGenerateAsset: (key: AssetKey) => void
}

export function BrandingSection({ onUploadAsset, onGenerateAsset }: BrandingSectionProps) {
  const logoUrl = useEditorStore((s) => s.config.assets.logo)
  const iconUrl = useEditorStore((s) => s.config.assets.icon)
  const logoText = useEditorStore((s) => s.config.logoText)
  const assetLoading = useEditorStore((s) => s.assetLoading)
  const updateLogoText = useEditorStore((s) => s.updateLogoText)

  return (
    <CollapsibleSection title="Branding">
      <AssetSlot
        label="Logo"
        currentUrl={logoUrl}
        isLoading={assetLoading.logo}
        onUpload={(file) => onUploadAsset("logo", file)}
        onGenerate={() => onGenerateAsset("logo")}
      />

      <AssetSlot
        label="Icono (notificaciones)"
        currentUrl={iconUrl}
        isLoading={assetLoading.icon}
        onUpload={(file) => onUploadAsset("icon", file)}
        onGenerate={() => onGenerateAsset("icon")}
      />

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">Texto del logo</span>
        <input
          type="text"
          value={logoText}
          onChange={(e) => updateLogoText(e.target.value)}
          placeholder="Nombre del negocio"
          className="w-full px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-800 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
        />
      </label>
    </CollapsibleSection>
  )
}
