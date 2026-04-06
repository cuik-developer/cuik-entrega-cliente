// ── Root Component (main export) ─────────────────────────────────────

export { PassEditor } from "./components/pass-editor"

// ── Preview Components ──────────────────────────────────────────────

export { GoogleWalletPreview } from "./components/preview/google-wallet-preview"
export { PhoneFrame } from "./components/preview/phone-frame"
export { StampGridPreview } from "./components/preview/stamp-grid-preview"
export { WalletPreview } from "./components/preview/wallet-preview"

// ── Store ────────────────────────────────────────────────────────────

export { useEditorStore } from "./store"

// ── Adapters & Defaults ─────────────────────────────────────────────

export { adaptV1ToV2, isV2Config } from "./lib/adapter-v1"
export { getDefaultConfigV2 } from "./lib/defaults"

// ── Types ────────────────────────────────────────────────────────────

export type { AssetKey, FieldSection, PassType, PromotionType } from "./types"
export type { CustomVariable, EditorCallbacks, EditorConfig } from "./types-external"
