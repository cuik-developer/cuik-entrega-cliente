"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

const RANGES = [
  { value: "30", label: "30 días" },
  { value: "60", label: "60 días" },
  { value: "90", label: "90 días" },
] as const

export function DateRangeSelector() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const current = searchParams.get("days") ?? "30"

  function handleChange(days: string) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set("days", days)
      router.push(`?${params.toString()}`)
    })
  }

  return (
    <div className="flex items-center gap-1">
      {RANGES.map(({ value, label }) => {
        const isActive = current === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => handleChange(value)}
            disabled={isPending}
            className={[
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
              isPending ? "opacity-60" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {label}
          </button>
        )
      })}
      {isPending && (
        <div className="ml-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      )}
    </div>
  )
}
