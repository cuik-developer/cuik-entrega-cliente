import { useRef } from "react"

interface AssetSlotProps {
  label: string
  currentUrl: string | null
  isLoading: boolean
  onUpload: (file: File) => void
  onGenerate?: () => void
  accept?: string
}

export function AssetSlot({
  label,
  currentUrl,
  isLoading,
  onUpload,
  onGenerate,
  accept = "image/png,image/jpeg,image/webp",
}: AssetSlotProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onUpload(file)
    // Reset so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-600">{label}</span>

      {/* Thumbnail preview */}
      <div className="relative w-full h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden px-4 py-2">
        {currentUrl ? (
          // biome-ignore lint/performance/noImgElement: standalone package without Next.js
          <img src={currentUrl} alt={label} className="h-full max-w-[60%] object-contain" />
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
              <title>Upload image</title>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-[10px]">Sin imagen</span>
          </div>
        )}

        {/* Loading overlay */}
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

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

        {onGenerate && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0e70db]/10 text-[#0e70db] text-xs font-medium hover:bg-[#0e70db]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-[#0e70db]/30"
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
              <title>Generate with AI</title>
              <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
              <path d="M20 3v4" />
              <path d="M22 5h-4" />
            </svg>
            Generar con IA
          </button>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
