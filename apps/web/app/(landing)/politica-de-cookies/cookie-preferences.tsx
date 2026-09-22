"use client"

import { Check } from "lucide-react"
import { useEffect, useState } from "react"
import { type Consent, readConsent, writeConsent } from "@/lib/consent"

/** Current choice and two buttons to change it, embedded in the cookies policy. */
export function CookiePreferences() {
  const [consent, setConsent] = useState<Consent | null>(null)
  useEffect(() => {
    setConsent(readConsent())
    // Stay in sync when the banner (or another tab of this page) records a choice.
    const on = (e: Event) => setConsent((e as CustomEvent<Consent>).detail)
    window.addEventListener("cuik:consent", on)
    return () => window.removeEventListener("cuik:consent", on)
  }, [])

  const set = (v: Consent) => {
    writeConsent(v)
    setConsent(v)
  }
  const label =
    consent === "accepted"
      ? "Aceptaste las cookies de medición."
      : consent === "rejected"
        ? "Rechazaste las cookies de medición."
        : "Todavía no elegiste."

  return (
    <div className="mt-2 rounded-2xl border border-gray-100 bg-gray-50 p-5 not-prose">
      <div className="text-sm font-semibold text-gray-900">{label}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => set("accepted")}
          className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-colors ${consent === "accepted" ? "bg-[#0e70db] text-white" : "bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-300"}`}
        >
          {consent === "accepted" && <Check className="w-4 h-4" />} Aceptar medición
        </button>
        <button
          type="button"
          onClick={() => set("rejected")}
          className={`inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-colors ${consent === "rejected" ? "bg-gray-900 text-white" : "bg-white border-2 border-gray-200 text-gray-700 hover:border-gray-300"}`}
        >
          {consent === "rejected" && <Check className="w-4 h-4" />} Rechazar medición
        </button>
      </div>
    </div>
  )
}
