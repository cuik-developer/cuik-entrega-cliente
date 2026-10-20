"use client"

import { ArrowLeft, Loader2, Save, Send } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { useEditorStore } from "../store/editor-store"
import type { AssetKey, PassType } from "../types"
import type { EditorCallbacks, EditorConfig } from "../types-external"
import { ConfigForm } from "./config/config-form"
import { GoogleWalletPreview } from "./preview/google-wallet-preview"
import { PhoneFrame } from "./preview/phone-frame"
import { WalletPreview } from "./preview/wallet-preview"
import { WalletToggle } from "./preview/wallet-toggle"

// ── Component ───────────────────────────────────────────────────────

interface PassEditorProps {
  config: EditorConfig
  callbacks: EditorCallbacks
}

export function PassEditor({ config, callbacks }: PassEditorProps) {
  const hasInitialized = useRef(false)
  const [previewType, setPreviewType] = useState<PassType>(config.passType)

  // Store selectors
  const initialize = useEditorStore((s) => s.initialize)
  const storeConfig = useEditorStore((s) => s.config)
  const isDirty = useEditorStore((s) => s.isDirty)
  const isSaving = useEditorStore((s) => s.isSaving)
  const setSaving = useEditorStore((s) => s.setSaving)
  const markClean = useEditorStore((s) => s.markClean)
  const serialize = useEditorStore((s) => s.serialize)
  const updateAsset = useEditorStore((s) => s.updateAsset)
  const setAssetLoading = useEditorStore((s) => s.setAssetLoading)

  // ── Initialize store on mount ─────────────────────────────────────
  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    initialize(config.initialConfig, config.passType)
  }, [config, initialize])

  // ── Asset operations ──────────────────────────────────────────────
  const handleUploadAsset = useCallback(
    async (key: AssetKey, file: File) => {
      setAssetLoading(key, true)
      try {
        const url = await callbacks.onUploadAsset(file)
        updateAsset(key, url)
      } catch (err) {
        console.error(`[PassEditor] Upload ${key} failed:`, err)
      } finally {
        setAssetLoading(key, false)
      }
    },
    [callbacks, setAssetLoading, updateAsset],
  )

  const updateStampsConfig = useEditorStore((s) => s.updateStampsConfig)
  const handleUploadSpecialStamp = useCallback(
    async (file: File) => {
      setAssetLoading("stamp", true)
      try {
        const url = await callbacks.onUploadAsset(file)
        updateStampsConfig({ specialStampUrl: url })
      } catch (err) {
        console.error("[PassEditor] Upload special stamp failed:", err)
      } finally {
        setAssetLoading("stamp", false)
      }
    },
    [callbacks, setAssetLoading, updateStampsConfig],
  )

  // ── Save & Publish ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    try {
      setSaving(true)
      const data = serialize()
      await callbacks.onSave(data)
      markClean()
    } catch (err) {
      console.error("[PassEditor] Save failed:", err)
    } finally {
      setSaving(false)
    }
  }, [callbacks, serialize, setSaving, markClean])

  const handlePublish = useCallback(async () => {
    if (!callbacks.onPublish) return
    try {
      // Auto-save before publishing if there are unsaved changes
      if (isDirty) {
        setSaving(true)
        const data = serialize()
        await callbacks.onSave(data)
        markClean()
        setSaving(false)
      }
      await callbacks.onPublish()
    } catch (err) {
      setSaving(false)
      console.error("[PassEditor] Publish failed:", err)
    }
  }, [callbacks, isDirty, serialize, setSaving, markClean])

  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-900">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-[#0f172a] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <a
            href="/admin/pases"
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-4" />
            Volver
          </a>
          <div className="h-5 w-px bg-white/20" />
          <div>
            <span className="text-sm font-medium text-white">{config.designName}</span>
            <span className="text-xs text-gray-400 ml-2">{config.tenantName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Guardar
          </button>
          {callbacks.onPublish && (
            <button
              type="button"
              onClick={handlePublish}
              className="flex items-center gap-1.5 rounded-md bg-[#0e70db] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#0c5fb8]"
            >
              <Send className="size-3.5" />
              Publicar
            </button>
          )}
        </div>
      </div>

      {/* 2-column layout — fixed height, no outer scroll */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT column: Config form (~40%) */}
        <aside className="w-[40%] min-w-[320px] max-w-[480px] border-r border-gray-200 flex flex-col bg-white">
          {/* Scrollable config area — subtle scrollbar */}
          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.15)_transparent]">
            <ConfigForm
              onUploadAsset={handleUploadAsset}
              onUploadSpecialStamp={handleUploadSpecialStamp}
              promotionType={config.promotionType}
              customVariables={config.customVariables}
            />
          </div>
        </aside>

        {/* RIGHT column: Preview (~60%) — fixed, no scroll */}
        <div
          className="flex-1 flex flex-col items-center justify-center"
          style={{ background: "#f0f0f5" }}
        >
          <div className="flex-1 flex items-center justify-center">
            <PhoneFrame walletType={previewType}>
              {previewType === "google_loyalty" ? (
                <GoogleWalletPreview config={storeConfig} promotionType={config.promotionType} />
              ) : (
                <WalletPreview config={storeConfig} promotionType={config.promotionType} />
              )}
            </PhoneFrame>
          </div>
          <div className="pb-5 shrink-0">
            <WalletToggle passType={previewType} onToggle={setPreviewType} />
          </div>
        </div>
      </div>
    </div>
  )
}
