import { useEffect, useState } from "react"

interface NumberSliderProps {
  label: string
  value: number
  min: number
  max: number
  /** Called with a finite, clamped number. Never with NaN or an empty input. */
  onChange: (value: number) => void
  unit?: string
  hint?: string
  /** Slider step (the number input always accepts decimals). */
  step?: number
}

function format(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Slider + number input that accepts decimals (38.8). While typing, an empty
 * or invalid input keeps the previous value; the input is clamped and
 * re-synced on blur.
 */
export function NumberSlider({
  label,
  value,
  min,
  max,
  onChange,
  unit = "px",
  hint,
  step = 1,
}: NumberSliderProps) {
  const [text, setText] = useState(format(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(format(value))
  }, [value, focused])

  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."))
    if (raw.trim() === "" || !Number.isFinite(n)) return
    onChange(Math.min(max, Math.max(min, n)))
  }

  const outOfRange = value < min - 0.001 || value > max + 0.001

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-gray-600">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={text}
            onFocus={() => setFocused(true)}
            onChange={(e) => {
              setText(e.target.value)
              commit(e.target.value)
            }}
            onBlur={() => {
              setFocused(false)
              setText(format(value))
            }}
            className={`w-16 px-1.5 py-0.5 rounded border text-right text-xs font-mono text-gray-800 bg-white focus:outline-none focus:ring-1 focus:ring-[#0e70db]/20 ${
              outOfRange ? "border-amber-400" : "border-gray-200 focus:border-[#0e70db]"
            }`}
          />
          <span className="text-[10px] text-gray-400 w-4">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} (deslizador)`}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#0e70db]"
      />
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
    </div>
  )
}

interface IntegerInputProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  className?: string
}

/** Integer input for counts (rows, columns, visits): empty/0/NaN keeps the previous value. */
export function IntegerInput({ label, value, min, max, onChange, className }: IntegerInputProps) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value)
          const n = Math.round(Number(e.target.value))
          if (e.target.value.trim() === "" || !Number.isFinite(n) || n < min) return
          onChange(Math.min(max, n))
        }}
        onBlur={() => {
          setFocused(false)
          setText(String(value))
        }}
        className={
          className ??
          "w-full px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-800 text-xs focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
        }
      />
    </label>
  )
}
