import { useEffect, useState } from "react"

import { isValidHex, normalizeHex } from "../../lib/validate-config"
import { useEditorStore } from "../../store/editor-store"
import { CollapsibleSection } from "./collapsible-section"

const COLOR_FIELDS = [
  { key: "backgroundColor", label: "Color de fondo" },
  { key: "foregroundColor", label: "Color de texto" },
  { key: "labelColor", label: "Color de labels" },
] as const

type ColorKey = (typeof COLOR_FIELDS)[number]["key"]

function HexInput({ colorKey, label }: { colorKey: ColorKey; label: string }) {
  const value = useEditorStore((s) => s.config.colors[colorKey])
  const updateColor = useEditorStore((s) => s.updateColor)
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(value)
  }, [value, focused])

  const invalid = !isValidHex(value)

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={isValidHex(value) ? value : "#000000"}
          onChange={(e) => updateColor(colorKey, e.target.value)}
          className="w-10 h-10 rounded border border-gray-200 cursor-pointer bg-white"
        />
        <input
          type="text"
          aria-label={`${label} (hex)`}
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const val = e.target.value
            if (/^#?[0-9a-fA-F]{0,6}$/.test(val)) {
              setText(val)
              updateColor(colorKey, val)
            }
          }}
          onBlur={() => {
            setFocused(false)
            // #FFF → #FFFFFF, "1e3a5f" → "#1e3a5f"
            const normalized = normalizeHex(text)
            setText(normalized)
            if (normalized !== value) updateColor(colorKey, normalized)
          }}
          className={`w-[4.5rem] px-1.5 py-0.5 rounded bg-white border text-gray-700 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#0e70db]/20 transition-colors ${
            invalid && !focused ? "border-red-400" : "border-gray-200 focus:border-[#0e70db]"
          }`}
          maxLength={7}
        />
      </div>
      {invalid && !focused && (
        <span className="text-[10px] text-red-600">Usa el formato #RRGGBB</span>
      )}
    </div>
  )
}

export function ColorsSection() {
  return (
    <CollapsibleSection title="Colores">
      <div className="flex flex-col gap-3">
        {COLOR_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600">{label}</span>
            <HexInput colorKey={key} label={label} />
          </div>
        ))}
        <p className="text-[10px] leading-snug text-gray-500">
          En Google solo se aplica el color de fondo: Google elige el color del texto.
        </p>
      </div>
    </CollapsibleSection>
  )
}
