import type { PassType } from "../../types"

interface WalletToggleProps {
  passType: PassType
  onToggle: (type: PassType) => void
}

/**
 * Segmented control toggle between Apple Wallet and Google Wallet preview.
 * Pill-shaped, placed below the phone frame.
 */
export function WalletToggle({ passType, onToggle }: WalletToggleProps) {
  return (
    <div
      className="relative flex items-center rounded-full p-1"
      style={{
        background: "#2C2C2E",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(0,0,0,0.2)",
      }}
    >
      {/* Sliding indicator */}
      <div
        className="absolute top-1 bottom-1 rounded-full transition-all duration-250 ease-out"
        style={{
          width: "calc(50% - 4px)",
          left: passType === "apple_store" ? 4 : "calc(50%)",
          background: passType === "apple_store" ? "#3A3A3C" : "#1A73E8",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        }}
      />

      <button
        type="button"
        onClick={() => onToggle("apple_store")}
        className="relative z-10 flex items-center justify-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-medium transition-colors"
        style={{
          color: passType === "apple_store" ? "#fff" : "#8E8E93",
          minWidth: 130,
        }}
      >
        {/* Apple logo */}
        <svg width="13" height="16" viewBox="0 0 13 16" fill="currentColor">
          <title>Apple logo</title>
          <path d="M12.77 12.3c-.28.65-.62 1.24-1.01 1.78-.53.74-.97 1.25-1.3 1.53-.52.47-1.08.71-1.67.72-.43 0-.94-.12-1.54-.37-.6-.24-1.16-.36-1.66-.36-.53 0-1.1.12-1.7.36-.6.25-1.09.38-1.46.39-.57.02-1.14-.23-1.7-.75-.36-.31-.81-.83-1.35-1.58C-.18 13.28-.6 12.48-.9 11.6c-.32-.95-.48-1.87-.48-2.76 0-1.02.22-1.9.66-2.64a3.89 3.89 0 011.39-1.41A3.73 3.73 0 012.55 4.2c.45 0 1.05.14 1.8.42.74.28 1.22.42 1.43.42.16 0 .7-.17 1.6-.5.86-.31 1.58-.44 2.17-.38 1.6.13 2.8.77 3.6 1.92-1.43.87-2.14 2.09-2.12 3.65.02 1.22.45 2.23 1.3 3.05.39.37.82.65 1.3.85-.1.3-.21.59-.33.87zM9.88.32c0 .95-.35 1.84-1.04 2.67-.83.98-1.84 1.54-2.93 1.45a2.95 2.95 0 01-.02-.36c0-.92.4-1.9 1.1-2.7.36-.41.81-.74 1.36-1.01C8.9.11 9.42-.02 9.9 0c.02.11.02.22.02.32z" />
        </svg>
        Apple Wallet
      </button>

      <button
        type="button"
        onClick={() => onToggle("google_loyalty")}
        className="relative z-10 flex items-center justify-center gap-1.5 rounded-full px-5 py-2 text-[13px] font-medium transition-colors"
        style={{
          color: passType === "google_loyalty" ? "#fff" : "#8E8E93",
          minWidth: 130,
        }}
      >
        {/* Google "G" icon */}
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <title>Google logo</title>
          <path
            d="M13.3 7.16c0-.5-.04-.97-.13-1.43H7v2.7h3.53a3.02 3.02 0 01-1.31 1.98v1.65h2.12c1.24-1.14 1.96-2.83 1.96-4.9z"
            fill="#4285F4"
          />
          <path
            d="M7 14c1.77 0 3.26-.59 4.34-1.59l-2.12-1.65c-.59.39-1.34.63-2.22.63-1.7 0-3.15-1.15-3.66-2.7H1.13v1.7A6.5 6.5 0 007 14z"
            fill="#34A853"
          />
          <path
            d="M3.34 8.69a3.9 3.9 0 010-2.48v-1.7H1.13a6.5 6.5 0 000 5.88l2.21-1.7z"
            fill="#FBBC05"
          />
          <path
            d="M7 2.81c.96 0 1.82.33 2.5.98l1.87-1.87A6.5 6.5 0 001.13 4.51l2.21 1.7C3.85 4.96 5.3 3.81 7 3.81v-1z"
            fill="#EA4335"
          />
        </svg>
        Google Wallet
      </button>
    </div>
  )
}
