import type { AssetKey, PromotionType } from "../../types"
import type { CustomVariable } from "../../types-external"
import { BrandingSection } from "./branding-section"
import { ColorsSection } from "./colors-section"
import { FieldsSection } from "./fields-section"
import { StampsSection } from "./stamps-section"
import { StripSection } from "./strip-section"

interface ConfigFormProps {
  onUploadAsset: (key: AssetKey, file: File) => void
  onGenerateAsset: (key: AssetKey) => void
  promotionType?: PromotionType
  customVariables?: CustomVariable[]
}

export function ConfigForm({
  onUploadAsset,
  onGenerateAsset,
  promotionType = "stamps",
  customVariables,
}: ConfigFormProps) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-1">
      <BrandingSection onUploadAsset={onUploadAsset} onGenerateAsset={onGenerateAsset} />
      <StripSection onUploadAsset={onUploadAsset} onGenerateAsset={onGenerateAsset} />
      {promotionType === "stamps" ? (
        <StampsSection onUploadAsset={onUploadAsset} onGenerateAsset={onGenerateAsset} />
      ) : (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
          <p className="text-sm text-violet-700">
            Este pase es para un programa de puntos — no requiere grilla de sellos.
          </p>
        </div>
      )}
      <ColorsSection />
      <FieldsSection customVariables={customVariables} />
    </div>
  )
}
