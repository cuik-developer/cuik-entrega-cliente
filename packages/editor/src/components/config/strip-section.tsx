import { useEffect, useState } from "react"

import { useEditorStore } from "../../store/editor-store"
import type { AssetKey } from "../../types"
import { CollapsibleSection } from "./collapsible-section"

interface WideAssetSlotProps {
  label: string
  /** Target size in px; the uploaded image is compared against this ratio. */
  width: number
  height: number
  currentUrl: string | null | undefined
  isLoading: boolean
  onUpload: (file: File) => void
  onRemove?: () => void
  emptyText?: string
}

/** Wide image slot drawn at the real aspect ratio, with the uploaded size and a ratio check. */
export function WideAssetSlot({
  label,
  width,
  height,
  currentUrl,
  isLoading,
  onUpload,
  onRemove,
  emptyText,
}: WideAssetSlotProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the measured size when the image changes
  useEffect(() => setNatural(null), [currentUrl])

  const ratioOff =
    natural != null && Math.abs(natural.w / natural.h - width / height) / (width / height) > 0.02
  const tooSmall = natural != null && (natural.w < width || natural.h < height)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div
        className="relative w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {currentUrl ? (
          // biome-ignore lint/performance/noImgElement: standalone package without Next.js
          <img
            src={currentUrl}
            alt={label}
            className="w-full h-full object-cover"
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Image placeholder</title>
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
            <span className="text-[10px]">{emptyText ?? `${width} × ${height} px`}</span>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-lg">
            <svg
              className="animate-spin h-5 w-5 text-[#0e70db]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <title>Loading</title>
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        )}
      </div>

      {natural && (
        <span
          className={`text-[10px] ${ratioOff || tooSmall ? "text-amber-700" : "text-gray-400"}`}
        >
          Tu imagen: {natural.w} × {natural.h} px.
          {ratioOff && ` No tiene la proporción ${width}:${height}: se recorta al centro.`}
          {!ratioOff && tooSmall && " Es más chica que el tamaño indicado: puede verse borrosa."}
          {!ratioOff && !tooSmall && natural.w > width && " Se reduce al tamaño de la franja."}
        </span>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const input = document.createElement("input")
            input.type = "file"
            input.accept = "image/png,image/jpeg"
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (file) onUpload(file)
            }
            input.click()
          }}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200 text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Upload</title>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Subir
        </button>
        {onRemove && currentUrl && (
          <button
            type="button"
            onClick={onRemove}
            className="px-3 py-1.5 rounded-md border border-gray-200 text-xs text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors"
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  )
}

interface StripSectionProps {
  onUploadAsset: (key: AssetKey, file: File) => void
}

export function StripSection({ onUploadAsset }: StripSectionProps) {
  const stripBgUrl = useEditorStore((s) => s.config.assets.stripBg)
  const assetLoading = useEditorStore((s) => s.assetLoading)

  return (
    <CollapsibleSection title="Imagen de Fondo (Strip)">
      <WideAssetSlot
        label="Franja Apple: 750 × 288 px"
        width={750}
        height={288}
        currentUrl={stripBgUrl}
        isLoading={assetLoading.stripBg}
        onUpload={(file) => onUploadAsset("stripBg", file)}
      />
      <p className="text-[10px] leading-snug text-gray-500">
        Apple define el strip en 375 × 144 pt; 750 × 288 px es el tamaño @2x que usa Cuik. Una
        imagen más grande con la misma proporción también sirve: se reduce a 750 × 288.
      </p>
    </CollapsibleSection>
  )
}
