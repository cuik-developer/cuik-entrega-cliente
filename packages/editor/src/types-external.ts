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
  /**
   * Visits per card of the linked promotion. The server draws and counts this
   * many stamps (stripMaxVisits); the design's own maxVisits is only a fallback.
   */
  promotionMaxVisits?: number | null
  initialConfig: PassDesignConfigV2
  /** Extra template variables from tenant strategic/custom fields */
  customVariables?: CustomVariable[]
}

export interface EditorCallbacks {
  onSave: (config: PassDesignConfigV2) => Promise<void>
  /** Omitted when the user may not publish (Equipo Cuik staff): the button is hidden. */
  onPublish?: () => Promise<void>
  onUploadAsset: (file: File) => Promise<string>
  /**
   * "Vista real": the strip PNG the server would build for this (unsaved)
   * config. Omitted = the button is hidden.
   */
  onRenderStrip?: (
    config: PassDesignConfigV2,
    sample: { stampsInCycle: number; completed: boolean },
  ) => Promise<Blob>
}
