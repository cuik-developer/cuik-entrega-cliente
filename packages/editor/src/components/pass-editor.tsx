"use client"

import { ArrowLeft, Eye, Loader2, Save, Send, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { sampleProgress } from "../lib/preview-values"
import { effectiveMaxVisits } from "../lib/stamp-geometry"
import { prepareForSave } from "../lib/validate-config"
import { useEditorStore } from "../store/editor-store"
import type { AssetKey, PassType } from "../types"
import type { EditorCallbacks, EditorConfig } from "../types-external"
import { ConfigForm } from "./config/config-form"
import { GoogleWalletPreview } from "./preview/google-wallet-preview"
import { PhoneFrame } from "./preview/phone-frame"
import { WalletPreview } from "./preview/wallet-preview"
import { WalletToggle } from "./preview/wallet-toggle"

// ── "Vista real" dialog ─────────────────────────────────────────────

function RealStripDialog({
  url,
  loading,
  error,
  onClose,
}: {
  url: string | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const [zoom, setZoom] = useState<1 | 2>(1)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Vista real de la franja"
    >
      <div className="flex max-h-full w-full max-w-[820px] flex-col gap-3 rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-900">Vista real de la franja Apple</p>
            <p className="text-[11px] text-gray-500">
              El PNG que genera el servidor con esta configuración (sin guardar), a 750 × 288 px.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setZoom(zoom === 1 ? 2 : 1)}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Zoom {zoom === 1 ? "200%" : "100%"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
              aria-label="Cerrar"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="min-h-[120px] overflow-auto rounded border border-gray-200 bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] [background-size:16px_16px]">
          {loading && (
            <div className="flex h-[288px] items-center justify-center">
              <Loader2 className="size-5 animate-spin text-[#0e70db]" />
            </div>
          )}
          {!loading && error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!loading && !error && url && (
            // biome-ignore lint/performance/noImgElement: standalone package without Next.js
            <img
              src={url}
              alt="Franja generada por el servidor"
              width={750 * zoom}
              height={288 * zoom}
              style={{ width: 750 * zoom, height: 288 * zoom, maxWidth: "none" }}
              className="block [image-rendering:pixelated]"
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────

interface PassEditorProps {
  config: EditorConfig
  callbacks: EditorCallbacks
}

export function PassEditor({ config, callbacks }: PassEditorProps) {
  const hasInitialized = useRef(false)
  const [previewType, setPreviewType] = useState<PassType>(config.passType)
  const [completedPreview, setCompletedPreview] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[]>([])

  // Store selectors
  const initialize = useEditorStore((s) => s.initialize)
  const storeConfig = useEditorStore((s) => s.config)
  const isDirty = useEditorStore((s) => s.isDirty)
  const isSaving = useEditorStore((s) => s.isSaving)
  const setSaving = useEditorStore((s) => s.setSaving)
  const serialize = useEditorStore((s) => s.serialize)
  const updateAsset = useEditorStore((s) => s.updateAsset)
  const setAssetLoading = useEditorStore((s) => s.setAssetLoading)

  // ── Initialize store on mount ─────────────────────────────────────
  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    initialize(config.initialConfig, config.passType)
  }, [config, initialize])

  // The server draws and counts the promotion's visits; the design's own value is a fallback.
  const maxVisits = effectiveMaxVisits(
    config.promotionMaxVisits,
    storeConfig.stampsConfig.maxVisits,
  )
  const filled = sampleProgress(maxVisits)

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
  /**
   * Normalises colours (#FFF → #FFFFFF) and fills empty field keys, then
   * saves. Invalid colours or repeated keys block the save with a message.
   */
  const saveNow = useCallback(async (): Promise<boolean> => {
    const { config: prepared, errors } = prepareForSave(serialize())
    setSaveErrors(errors)
    if (errors.length > 0) return false
    await callbacks.onSave(prepared)
    // Keep the editor showing exactly what was stored (clean afterwards).
    initialize(prepared, useEditorStore.getState().passType)
    return true
  }, [callbacks, serialize, initialize])

  const handleSave = useCallback(async () => {
    try {
      setSaving(true)
      await saveNow()
    } catch (err) {
      console.error("[PassEditor] Save failed:", err)
    } finally {
      setSaving(false)
    }
  }, [saveNow, setSaving])

  const handlePublish = useCallback(async () => {
    if (!callbacks.onPublish) return
    try {
      // Auto-save before publishing if there are unsaved changes
      if (isDirty) {
        setSaving(true)
        const ok = await saveNow()
        setSaving(false)
        if (!ok) return
      }
      await callbacks.onPublish()
    } catch (err) {
      setSaving(false)
      console.error("[PassEditor] Publish failed:", err)
    }
  }, [callbacks, isDirty, saveNow, setSaving])

  // ── "Vista real" (server-rendered strip) ──────────────────────────
  const [real, setReal] = useState<{
    open: boolean
    url: string | null
    loading: boolean
    error: string | null
  }>({ open: false, url: null, loading: false, error: null })
  useEffect(() => {
    return () => {
      if (real.url) URL.revokeObjectURL(real.url)
    }
  }, [real.url])

  const handleRealView = useCallback(async () => {
    if (!callbacks.onRenderStrip) return
    setReal({ open: true, url: null, loading: true, error: null })
    try {
      const blob = await callbacks.onRenderStrip(serialize(), {
        stampsInCycle: completedPreview ? 0 : filled,
        completed: completedPreview,
      })
      setReal({ open: true, url: URL.createObjectURL(blob), loading: false, error: null })
    } catch (err) {
      setReal({
        open: true,
        url: null,
        loading: false,
        error: err instanceof Error ? err.message : "No se pudo generar la franja",
      })
    }
  }, [callbacks, serialize, completedPreview, filled])

  const previewProps = {
    config: storeConfig,
    promotionType: config.promotionType,
    maxVisits,
    previewFilledStamps: filled,
    completed: completedPreview,
    tenantName: config.tenantName,
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 text-gray-900">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 bg-[#0f172a] px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="/admin/pases"
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="size-4" />
            Volver
          </a>
          <div className="h-5 w-px bg-white/20" />
          <div className="min-w-0">
            <span className="text-sm font-medium text-white">{config.designName}</span>
            <span className="text-xs text-gray-400 ml-2">{config.tenantName}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {callbacks.onPublish && (
            <p className="hidden lg:block max-w-[360px] text-right text-[11px] leading-snug text-gray-400">
              Si el diseño está publicado, Guardar aplica colores, sellos y textos a la tarjeta real
              al instante; las imágenes nuevas se aplican al Publicar.
            </p>
          )}
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

      {saveErrors.length > 0 && (
        <div className="flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
          <div className="flex-1">
            <p className="font-medium">No se guardó. Corrige esto:</p>
            <ul className="list-disc pl-4">
              {saveErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={() => setSaveErrors([])}
            className="text-red-500 hover:text-red-800"
            aria-label="Cerrar"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* 2-column layout — fixed height, no outer scroll */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT column: Config form (~40%) */}
        <aside className="w-[40%] min-w-[320px] max-w-[480px] border-r border-gray-200 flex flex-col bg-white">
          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.15)_transparent]">
            <ConfigForm
              onUploadAsset={handleUploadAsset}
              onUploadSpecialStamp={handleUploadSpecialStamp}
              promotionType={config.promotionType}
              promotionMaxVisits={config.promotionMaxVisits}
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
                <GoogleWalletPreview {...previewProps} />
              ) : (
                <WalletPreview {...previewProps} />
              )}
            </PhoneFrame>
          </div>
          <div className="pb-5 shrink-0 flex flex-wrap items-center justify-center gap-3">
            <WalletToggle passType={previewType} onToggle={setPreviewType} />
            {config.promotionType !== "points" && (
              <fieldset className="m-0 flex items-center rounded-full border border-gray-200 bg-white p-0.5 text-xs">
                <legend className="sr-only">Vista</legend>
                <span className="px-2 text-gray-500">Vista:</span>
                {(
                  [
                    [false, "en progreso"],
                    [true, "tarjeta completa"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={completedPreview === value}
                    onClick={() => setCompletedPreview(value)}
                    className={`rounded-full px-2.5 py-1 transition-colors ${
                      completedPreview === value
                        ? "bg-[#0e70db] text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </fieldset>
            )}
            {callbacks.onRenderStrip && (
              <button
                type="button"
                onClick={handleRealView}
                className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                title="Genera en el servidor la franja Apple exacta con esta configuración"
              >
                <Eye className="size-3.5" />
                Vista real
              </button>
            )}
          </div>
        </div>
      </div>

      {real.open && (
        <RealStripDialog
          url={real.url}
          loading={real.loading}
          error={real.error}
          onClose={() => setReal({ open: false, url: null, loading: false, error: null })}
        />
      )}
    </div>
  )
}
