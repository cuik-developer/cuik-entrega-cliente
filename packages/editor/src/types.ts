import type { PassDesignConfigV2 } from "@cuik/shared/types/editor"

export type {
  CanvasNode,
  ImageNodeProps,
  PassDesignColors,
  PassDesignConfigV2,
  SavePayload,
  SerializedCanvas,
  ShapeNodeProps,
  StampGridNodeProps,
  StampsConfig,
  TextNodeProps,
} from "@cuik/shared/types/editor"

// ── V2 editor-specific types ────────────────────────────────────────

export type AssetKey = "stripBg" | "logo" | "stamp" | "icon"

export type FieldSection = "headerFields" | "secondaryFields" | "backFields"

export interface EditorStoreV2 {
  // State
  config: PassDesignConfigV2
  passType: PassType
  isDirty: boolean
  isSaving: boolean
  assetLoading: Record<AssetKey, boolean>

  // Actions
  initialize: (config: PassDesignConfigV2, passType: PassType) => void
  updateAsset: (key: AssetKey, url: string) => void
  setAssetLoading: (key: AssetKey, loading: boolean) => void
  updateColor: (key: keyof PassDesignConfigV2["colors"], hex: string) => void
  updateStampsConfig: (partial: Partial<PassDesignConfigV2["stampsConfig"]>) => void
  updateField: (
    section: FieldSection,
    index: number,
    partial: Partial<{
      key: string
      label: string
      value: string
      changeMessage: string | undefined
    }>,
  ) => void
  addField: (section: FieldSection) => void
  removeField: (section: FieldSection, index: number) => void
  updateLogoText: (text: string) => void
  updateFullConfig: (config: PassDesignConfigV2) => void
  serialize: () => PassDesignConfigV2
  markClean: () => void
  setSaving: (saving: boolean) => void
}

export type PassType = "apple_store" | "google_loyalty"

export type PromotionType = "stamps" | "points"
