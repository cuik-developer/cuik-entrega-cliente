"use client"

import { useEffect, useRef, useState } from "react"
import type { PassType } from "../../types"

interface PhoneFrameProps {
  children: React.ReactNode
  walletType: PassType
}

/** Calculate a scale factor so the phone frame fits its container */
function usePhoneScale(frameWidth: number, frameHeight: number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      // Leave some padding (24px each side)
      const availW = width - 48
      const availH = height - 48
      const s = Math.min(availW / frameWidth, availH / frameHeight, 1)
      setScale(Math.max(s, 0.4))
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [frameWidth, frameHeight])

  return { containerRef, scale }
}

export function PhoneFrame({ children, walletType }: PhoneFrameProps) {
  const isGoogle = walletType === "google_loyalty"
  const { containerRef, scale } = usePhoneScale(310, 634)

  return (
    <div ref={containerRef} className="flex items-center justify-center w-full h-full">
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {isGoogle ? <AndroidFrame>{children}</AndroidFrame> : <IPhoneFrame>{children}</IPhoneFrame>}
      </div>
    </div>
  )
}

// ── iPhone Frame (Apple Wallet) ───────────────────────────────────────

function IPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative" style={{ width: 310, height: 634 }}>
      {/* Outer bezel */}
      <div
        className="absolute inset-0 shadow-2xl"
        style={{
          background: "#1C1C1E",
          borderRadius: 52,
          boxShadow:
            "0 0 0 1.5px #3A3A3C, 0 25px 60px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      />

      {/* Side buttons — volume */}
      <div
        className="absolute rounded-sm"
        style={{
          left: -2.5,
          top: 100,
          width: 2.5,
          height: 28,
          background: "#2C2C2E",
          borderRadius: "2px 0 0 2px",
        }}
      />
      <div
        className="absolute rounded-sm"
        style={{
          left: -2.5,
          top: 140,
          width: 2.5,
          height: 44,
          background: "#2C2C2E",
          borderRadius: "2px 0 0 2px",
        }}
      />
      <div
        className="absolute rounded-sm"
        style={{
          left: -2.5,
          top: 192,
          width: 2.5,
          height: 44,
          background: "#2C2C2E",
          borderRadius: "2px 0 0 2px",
        }}
      />

      {/* Side button — power */}
      <div
        className="absolute"
        style={{
          right: -2.5,
          top: 155,
          width: 2.5,
          height: 60,
          background: "#2C2C2E",
          borderRadius: "0 2px 2px 0",
        }}
      />

      {/* Screen area */}
      <div
        className="absolute overflow-hidden"
        style={{
          borderRadius: 44,
          top: 10,
          left: 10,
          right: 10,
          bottom: 10,
          background: "#F2F2F7",
        }}
      >
        {/* Status bar */}
        <div
          className="flex items-center justify-between px-6"
          style={{ height: 48, background: "#F2F2F7" }}
        >
          <span
            className="text-[13px] font-semibold"
            style={{ color: "#000", letterSpacing: -0.2 }}
          >
            9:41
          </span>
          <div className="flex items-center gap-1">
            {/* Signal bars */}
            <svg width="17" height="12" viewBox="0 0 17 12" fill="none">
              <title>Signal strength</title>
              <rect x="0" y="8" width="3" height="4" rx="0.5" fill="#000" />
              <rect x="4.5" y="5.5" width="3" height="6.5" rx="0.5" fill="#000" />
              <rect x="9" y="3" width="3" height="9" rx="0.5" fill="#000" />
              <rect x="13.5" y="0" width="3" height="12" rx="0.5" fill="#000" />
            </svg>
            {/* WiFi */}
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <title>Wi-Fi</title>
              <path
                d="M8 10.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zM4.5 8.2a5 5 0 017 0"
                stroke="#000"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M2 5.5a8.5 8.5 0 0112 0"
                stroke="#000"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            {/* Battery */}
            <svg width="27" height="12" viewBox="0 0 27 12" fill="none">
              <title>Battery</title>
              <rect
                x="0.5"
                y="0.5"
                width="22"
                height="11"
                rx="2.5"
                stroke="#000"
                strokeOpacity="0.35"
              />
              <rect x="2" y="2" width="18" height="8" rx="1.5" fill="#000" />
              <path d="M24 4v4a2 2 0 000-4z" fill="#000" fillOpacity="0.3" />
            </svg>
          </div>
        </div>

        {/* Dynamic Island */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: 12,
            width: 90,
            height: 24,
            borderRadius: 20,
            background: "#000",
          }}
        />

        {/* Wallet app chrome */}
        <div
          className="flex items-center justify-between px-4"
          style={{
            height: 40,
            background: "#F2F2F7",
          }}
        >
          <span className="text-[15px] font-normal" style={{ color: "#007AFF" }}>
            Listo
          </span>
          <span className="text-[15px] font-semibold" style={{ color: "#000" }}>
            Wallet
          </span>
          <button
            type="button"
            className="flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: "rgba(0,0,0,0.06)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <title>More options</title>
              <circle cx="3" cy="7" r="1.3" fill="#8E8E93" />
              <circle cx="7" cy="7" r="1.3" fill="#8E8E93" />
              <circle cx="11" cy="7" r="1.3" fill="#8E8E93" />
            </svg>
          </button>
        </div>

        {/* Pass content area */}
        <div className="flex-1 overflow-hidden px-4 pb-3" style={{ background: "#F2F2F7" }}>
          {/* Pass card with shadow */}
          <div
            className="overflow-hidden rounded-xl"
            style={{
              boxShadow: "0 2px 12px rgba(0,0,0,0.08), 0 0.5px 2px rgba(0,0,0,0.06)",
            }}
          >
            {children}
          </div>

          {/* Hold Near Reader */}
          <div className="flex flex-col items-center gap-1.5 pt-4 pb-2">
            {/* Contactless icon */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <title>Contactless</title>
              <path
                d="M8.5 16.5a6 6 0 010-9"
                stroke="#8E8E93"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M5 19.5a10.5 10.5 0 010-15"
                stroke="#8E8E93"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M12 13.5a2.5 2.5 0 010-3"
                stroke="#8E8E93"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span
              className="text-[12px] font-medium"
              style={{ color: "#8E8E93", letterSpacing: 0.2 }}
            >
              Acercar al lector
            </span>
          </div>
        </div>
      </div>

      {/* Home indicator */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom: 18,
          width: 100,
          height: 4,
          borderRadius: 2,
          background: "#3A3A3C",
        }}
      />
    </div>
  )
}

// ── Android Frame (Google Wallet) ────────────────────────────────────

function AndroidFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative" style={{ width: 310, height: 634 }}>
      {/* Outer bezel */}
      <div
        className="absolute inset-0 shadow-2xl"
        style={{
          background: "#1C1C1E",
          borderRadius: 46,
          boxShadow:
            "0 0 0 1.5px #3A3A3C, 0 25px 60px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      />

      {/* Side button — power */}
      <div
        className="absolute"
        style={{
          right: -2.5,
          top: 130,
          width: 2.5,
          height: 45,
          background: "#2C2C2E",
          borderRadius: "0 2px 2px 0",
        }}
      />

      {/* Side buttons — volume */}
      <div
        className="absolute"
        style={{
          right: -2.5,
          top: 200,
          width: 2.5,
          height: 65,
          background: "#2C2C2E",
          borderRadius: "0 2px 2px 0",
        }}
      />

      {/* Screen */}
      <div
        className="absolute overflow-hidden"
        style={{
          borderRadius: 38,
          top: 10,
          left: 10,
          right: 10,
          bottom: 10,
          background: "#F5F5F5",
        }}
      >
        {/* Status bar */}
        <div
          className="flex items-center justify-between px-5"
          style={{ height: 36, background: "#F5F5F5" }}
        >
          <span className="text-[12px] font-medium" style={{ color: "#1F1F1F" }}>
            9:41
          </span>
          <div className="flex items-center gap-1">
            <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
              <title>Signal strength</title>
              <rect x="0" y="8" width="2.5" height="4" rx="0.5" fill="#1F1F1F" />
              <rect x="3.5" y="5.5" width="2.5" height="6.5" rx="0.5" fill="#1F1F1F" />
              <rect x="7" y="3" width="2.5" height="9" rx="0.5" fill="#1F1F1F" />
              <rect x="10.5" y="0" width="2.5" height="12" rx="0.5" fill="#1F1F1F" />
            </svg>
            <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
              <title>Battery</title>
              <rect
                x="0.5"
                y="0.5"
                width="20"
                height="11"
                rx="2"
                stroke="#1F1F1F"
                strokeOpacity="0.3"
              />
              <rect x="2" y="2" width="16" height="8" rx="1" fill="#1F1F1F" />
              <path d="M22 4v4a1.5 1.5 0 000-3z" fill="#1F1F1F" fillOpacity="0.25" />
            </svg>
          </div>
        </div>

        {/* Punch-hole camera */}
        <div
          className="absolute"
          style={{
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#1C1C1E",
          }}
        />

        {/* Google Wallet app chrome */}
        <div
          className="flex items-center gap-3 px-4"
          style={{
            height: 40,
            background: "#F5F5F5",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <title>Back</title>
            <path
              d="M10 3L5 8l5 5"
              stroke="#1F1F1F"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[15px] font-medium" style={{ color: "#1F1F1F" }}>
            Google Wallet
          </span>
        </div>

        {/* Pass content area */}
        <div className="flex-1 overflow-hidden px-4 pb-3" style={{ background: "#F5F5F5" }}>
          <div
            className="overflow-hidden rounded-xl"
            style={{
              boxShadow: "0 2px 12px rgba(0,0,0,0.08), 0 0.5px 2px rgba(0,0,0,0.06)",
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Nav bar indicator */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom: 17,
          width: 90,
          height: 4,
          borderRadius: 2,
          background: "#3A3A3C",
        }}
      />
    </div>
  )
}
