import { useEditorStore } from "../../store/editor-store"
import type { AssetKey } from "../../types"
import { CollapsibleSection } from "./collapsible-section"
import { WideAssetSlot } from "./strip-section"

interface GoogleSectionProps {
  onUploadAsset: (key: AssetKey, file: File) => void
}

/** Google Wallet only: its own static banner (hero). */
export function GoogleSection({ onUploadAsset }: GoogleSectionProps) {
  const googleHero = useEditorStore((s) => s.config.assets.googleHero ?? null)
  const loading = useEditorStore((s) => s.assetLoading.googleHero)
  const updateAsset = useEditorStore((s) => s.updateAsset)

  return (
    <CollapsibleSection title="Google Wallet" defaultOpen={false}>
      <WideAssetSlot
        label="Franja Google — 1032 × 336 px"
        width={1032}
        height={336}
        currentUrl={googleHero}
        isLoading={loading}
        onUpload={(file) => onUploadAsset("googleHero", file)}
        onRemove={() => updateAsset("googleHero", null)}
        emptyText="Sin franja propia: se usa la franja Apple recortada"
      />
      <p className="text-[10px] leading-snug text-gray-500">
        Google muestra una imagen fija (sin sellos). Si no subes una, usa la franja Apple recortada
        a 1032 × 336. Se aplica al Publicar.
      </p>
    </CollapsibleSection>
  )
}
