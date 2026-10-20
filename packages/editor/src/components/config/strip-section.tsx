import { useEditorStore } from "../../store/editor-store"
import type { AssetKey } from "../../types"
import { CollapsibleSection } from "./collapsible-section"

interface StripSectionProps {
  onUploadAsset: (key: AssetKey, file: File) => void
}

export function StripSection({ onUploadAsset }: StripSectionProps) {
  const stripBgUrl = useEditorStore((s) => s.config.assets.stripBg)
  const assetLoading = useEditorStore((s) => s.assetLoading)

  return (
    <CollapsibleSection title="Imagen de Fondo (Strip)">
      {/* Strip preview with wider aspect ratio hint, then upload */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-gray-600">Fondo</span>

        {/* Custom wider preview to hint at strip ~3:1 aspect ratio */}
        <div className="relative w-full aspect-[750/288] rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
          {stripBgUrl ? (
            // biome-ignore lint/performance/noImgElement: standalone package without Next.js
            <img
              src={stripBgUrl}
              alt="Fondo de franja"
              className="w-full h-full object-cover rounded"
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
              <span className="text-[10px]">Strip 3:1</span>
            </div>
          )}

          {assetLoading.stripBg && (
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

        {/* Reuse AssetSlot's button pattern inline */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const input = document.createElement("input")
              input.type = "file"
              input.accept = "image/png,image/jpeg,image/webp"
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) onUploadAsset("stripBg", file)
              }
              input.click()
            }}
            disabled={assetLoading.stripBg}
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
        </div>
      </div>
    </CollapsibleSection>
  )
}
