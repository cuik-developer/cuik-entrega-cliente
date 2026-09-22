"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { type Consent, readConsent, writeConsent } from "@/lib/consent"

/**
 * Cookie notice, shown once until the visitor chooses. Both choices are one
 * tap and equally prominent (rejecting must be as easy as accepting). The
 * choice is remembered for a year; the footer link "Cookies" lets people
 * change it from the policy page.
 */
export function CookieBanner() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (readConsent() === null) setOpen(true)
    const onReset = () => setOpen(true)
    window.addEventListener("cuik:consent-reset", onReset)
    return () => window.removeEventListener("cuik:consent-reset", onReset)
  }, [])

  const choose = (v: Consent) => {
    writeConsent(v)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="ck fixed inset-x-3 bottom-3 sm:inset-x-auto sm:left-4 sm:bottom-4 sm:max-w-md z-[60]"
    >
      <style>{`
        .ck { animation: ck-in 500ms cubic-bezier(0.23, 1, 0.32, 1) both; }
        @keyframes ck-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .ck { animation: none; } }
      `}</style>
      <div className="rounded-2xl bg-white border border-gray-100 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.45)] p-5">
        <div className="text-sm font-bold text-gray-900">Usamos cookies</div>
        <p className="mt-1 text-sm text-gray-500 leading-relaxed">
          Las esenciales hacen funcionar el sitio y no se pueden desactivar. Si aceptas, también
          usaremos cookies de medición para entender qué páginas se leen y mejorar Cuik. Más detalle
          en la{" "}
          <Link href="/politica-de-cookies" className="text-[#0e70db] font-medium hover:underline">
            Política de Cookies
          </Link>
          .
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="flex-1 h-10 rounded-xl bg-[#0e70db] hover:bg-[#0c5fc0] text-white text-sm font-semibold transition-colors active:scale-[0.98]"
          >
            Aceptar
          </button>
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="flex-1 h-10 rounded-xl border-2 border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-colors active:scale-[0.98]"
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  )
}
