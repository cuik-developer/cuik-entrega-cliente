import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

import type { AssetKey, EditorStoreV2, PassDesignConfigV2, PassType } from "../types"

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_ASSET_LOADING: Record<AssetKey, boolean> = {
  stripBg: false,
  logo: false,
  stamp: false,
  icon: false,
}

/** Empty config as initial state before initialize() is called */
const EMPTY_CONFIG: PassDesignConfigV2 = {
  version: 2,
  assets: { stripBg: null, logo: null, stamp: null, icon: null },
  colors: {
    backgroundColor: "#FFFFFF",
    foregroundColor: "#000000",
    labelColor: "#666666",
  },
  stampsConfig: {
    maxVisits: 8,
    gridCols: 4,
    gridRows: 2,
    stampSize: 63,
    offsetX: 197,
    offsetY: 23,
    gapX: 98,
    gapY: 73,
    filledOpacity: 1,
    emptyOpacity: 0.35,
    rowOffsets: [],
  },
  fields: { headerFields: [], secondaryFields: [], backFields: [] },
  logoText: "",
}

// ── Store ────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorStoreV2>()(
  immer((set, get) => ({
    // ── State ──────────────────────────────────────────────────────
    config: EMPTY_CONFIG,
    passType: "apple_store" as PassType,
    isDirty: false,
    isSaving: false,
    assetLoading: { ...DEFAULT_ASSET_LOADING },

    // ── Actions ────────────────────────────────────────────────────

    initialize: (config, passType) => {
      set((state) => {
        state.config = config
        state.passType = passType
        state.isDirty = false
        state.isSaving = false
        state.assetLoading = { ...DEFAULT_ASSET_LOADING }
      })
    },

    updateAsset: (key, url) => {
      set((state) => {
        state.config.assets[key] = url
        state.isDirty = true
      })
    },

    setAssetLoading: (key, loading) => {
      set((state) => {
        state.assetLoading[key] = loading
      })
    },

    updateColor: (key, hex) => {
      set((state) => {
        state.config.colors[key] = hex
        state.isDirty = true
      })
    },

    updateStampsConfig: (partial) => {
      set((state) => {
        Object.assign(state.config.stampsConfig, partial)
        state.isDirty = true
      })
    },

    updateField: (section, index, partial) => {
      set((state) => {
        const field = state.config.fields[section][index]
        if (field) {
          Object.assign(field, partial)
          state.isDirty = true
        }
      })
    },

    addField: (section) => {
      set((state) => {
        state.config.fields[section].push({ key: "", label: "", value: "" })
        state.isDirty = true
      })
    },

    removeField: (section, index) => {
      set((state) => {
        state.config.fields[section].splice(index, 1)
        state.isDirty = true
      })
    },

    updateLogoText: (text) => {
      set((state) => {
        state.config.logoText = text
        state.isDirty = true
      })
    },

    updateFullConfig: (config) => {
      set((state) => {
        // Preserve version, replace everything else
        state.config = { ...config, version: state.config.version }
        state.isDirty = true
      })
    },

    serialize: () => {
      return JSON.parse(JSON.stringify(get().config)) as PassDesignConfigV2
    },

    markClean: () => {
      set((state) => {
        state.isDirty = false
      })
    },

    setSaving: (saving) => {
      set((state) => {
        state.isSaving = saving
      })
    },
  })),
)
