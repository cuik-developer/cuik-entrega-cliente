// Re-export types that consumers need without pulling in react-konva
// This file is safe to import from SSR contexts

import type { PassDesignConfigV2, PassType, PromotionType } from "./types"

/** A custom template variable (e.g. from tenant strategic fields). */
export interface CustomVariable {
  /** Template variable string, e.g. "{{client.customData.bebidaFavorita}}" */
  variable: string
  /** Human-readable label, e.g. "Bebida favorita" */
  label: string
}

export interface EditorConfig {
  designId: string
  designName: string
  tenantId: string
  tenantName: string
  businessType?: string
  passType: PassType
  promotionType?: PromotionType
  initialConfig: PassDesignConfigV2
  /** Extra template variables from tenant strategic/custom fields */
  customVariables?: CustomVariable[]
}

export interface EditorCallbacks {
  onSave: (config: PassDesignConfigV2) => Promise<void>
  onPublish: () => Promise<void>
  onUploadAsset: (file: File) => Promise<string>
  onGenerateAsset: (assetType: string, prompt?: string) => Promise<string>
  onGenerateFullDesign?: (
    businessName: string,
    businessType?: string,
  ) => Promise<PassDesignConfigV2>
}
