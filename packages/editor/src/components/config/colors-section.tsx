import { useEditorStore } from "../../store/editor-store"
import { CollapsibleSection } from "./collapsible-section"

const COLOR_FIELDS = [
  { key: "backgroundColor", label: "Color de fondo" },
  { key: "foregroundColor", label: "Color de texto" },
  { key: "labelColor", label: "Color de labels" },
] as const

export function ColorsSection() {
  const colors = useEditorStore((s) => s.config.colors)
  const updateColor = useEditorStore((s) => s.updateColor)

  return (
    <CollapsibleSection title="Colores">
      <div className="flex flex-col gap-3">
        {COLOR_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600">{label}</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={colors[key]}
                onChange={(e) => updateColor(key, e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer bg-white"
              />
              <input
                type="text"
                value={colors[key]}
                onChange={(e) => {
                  const val = e.target.value
                  // Accept valid hex colors
                  if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                    updateColor(key, val)
                  }
                }}
                className="w-[4.5rem] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700 text-xs font-mono text-center focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
                maxLength={7}
              />
            </div>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  )
}
