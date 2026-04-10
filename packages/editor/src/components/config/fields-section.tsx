import { Bell } from "lucide-react"
import { useRef, useState } from "react"
import { useEditorStore } from "../../store/editor-store"
import type { FieldSection } from "../../types"
import type { CustomVariable } from "../../types-external"
import { CollapsibleSection } from "./collapsible-section"

/** Map of template variables to human-readable labels */
const TEMPLATE_VARIABLES: Record<string, string> = {
  "{{client.name}}": "Nombre del cliente",
  "{{client.lastName}}": "Apellido del cliente",
  "{{client.tier}}": "Nivel del cliente",
  "{{client.phone}}": "Telefono",
  "{{client.email}}": "Email",
  "{{stamps.current}}": "Sellos en ciclo",
  "{{stamps.max}}": "Sellos para premio",
  "{{stamps.remaining}}": "Sellos restantes",
  "{{stamps.total}}": "Visitas totales",
  "{{points.balance}}": "Balance de puntos",
  "{{rewards.pending}}": "Premios pendientes",
  "{{tenant.name}}": "Nombre del comercio",
}

/** Check if a value is a pure template variable */
function isTemplateVariable(value: string): boolean {
  return value.startsWith("{{") && value.endsWith("}}")
}

/** Auto-generate a field key from the label (lowercase, accents stripped, spaces → _) */
function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

const inputClass =
  "w-full px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-800 text-[11px] placeholder:text-gray-400 focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"

function InsertVariableDropdown({
  textareaRef,
  onInsert,
  customVariables,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onInsert: (newValue: string) => void
  customVariables?: CustomVariable[]
}) {
  const [open, setOpen] = useState(false)

  const allVars = [
    ...Object.entries(TEMPLATE_VARIABLES).map(([variable, label]) => ({ variable, label })),
    ...(customVariables ?? []).map((cv) => ({ variable: cv.variable, label: cv.label })),
  ]

  function handleSelect(variable: string) {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = textarea.value
    const newValue = current.slice(0, start) + variable + current.slice(end)

    onInsert(newValue)
    setOpen(false)

    requestAnimationFrame(() => {
      const newPos = start + variable.length
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-[10px] text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors whitespace-nowrap"
      >
        + Variable
      </button>
      {open && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay for dropdown dismiss */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} onKeyDown={() => {}} />
          <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
            {allVars.map((v) => (
              <button
                key={v.variable}
                type="button"
                onClick={() => handleSelect(v.variable)}
                className="w-full text-left px-3 py-1.5 hover:bg-blue-50 transition-colors flex items-center gap-2"
              >
                <span className="font-mono text-[10px] text-blue-600">{v.variable}</span>
                <span className="text-[10px] text-gray-500">{v.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FieldGroup({
  section,
  label,
  freeText,
  showChangeMessage,
  customVariables,
}: {
  section: FieldSection
  label: string
  freeText?: boolean
  showChangeMessage?: boolean
  customVariables?: CustomVariable[]
}) {
  const fields = useEditorStore((s) => s.config.fields[section])
  const updateField = useEditorStore((s) => s.updateField)
  const addField = useEditorStore((s) => s.addField)
  const removeField = useEditorStore((s) => s.removeField)
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement | null>>(new Map())

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-600">{label}</span>

      {fields.length === 0 && <p className="text-[10px] text-gray-400 italic">Sin campos</p>}

      {fields.map((field, index) => {
        const hasChangeMessage = Boolean(field.changeMessage)
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: fields have no stable ID
          <div key={index} className="flex items-start gap-1.5">
            <div
              className={`flex-1 ${freeText ? "flex flex-col gap-1.5" : "grid grid-cols-3 gap-1.5"}`}
            >
              {freeText ? (
                <>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      type="text"
                      value={field.key}
                      onChange={(e) => updateField(section, index, { key: e.target.value })}
                      placeholder="Clave"
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => {
                        const newLabel = e.target.value
                        const autoKey = toFieldKey(field.label)
                        const update: { label: string; key?: string } = { label: newLabel }
                        if (!field.key || field.key === autoKey) {
                          update.key = toFieldKey(newLabel)
                        }
                        updateField(section, index, update)
                      }}
                      placeholder="Titulo"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-start gap-1">
                    <textarea
                      ref={(el) => {
                        textareaRefs.current.set(index, el)
                      }}
                      value={field.value}
                      onChange={(e) => updateField(section, index, { value: e.target.value })}
                      placeholder="Contenido (puede incluir {{variables}})"
                      rows={2}
                      className={`${inputClass} resize-y flex-1`}
                    />
                    <InsertVariableDropdown
                      textareaRef={{ current: textareaRefs.current.get(index) ?? null }}
                      onInsert={(newValue) => updateField(section, index, { value: newValue })}
                      customVariables={customVariables}
                    />
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={field.key}
                    onChange={(e) => updateField(section, index, { key: e.target.value })}
                    placeholder="Clave"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => {
                      const newLabel = e.target.value
                      const autoKey = toFieldKey(field.label)
                      const update: { label: string; key?: string } = { label: newLabel }
                      if (!field.key || field.key === autoKey) {
                        update.key = toFieldKey(newLabel)
                      }
                      updateField(section, index, update)
                    }}
                    placeholder="Label"
                    className={inputClass}
                  />
                  <select
                    value={isTemplateVariable(field.value) ? field.value : ""}
                    onChange={(e) => updateField(section, index, { value: e.target.value })}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Seleccionar variable
                    </option>
                    {Object.entries(TEMPLATE_VARIABLES).map(([key, lbl]) => (
                      <option key={key} value={key}>
                        {lbl}
                      </option>
                    ))}
                    {customVariables && customVariables.length > 0 && (
                      <optgroup label="Campos estrategicos">
                        {customVariables.map((cv) => (
                          <option key={cv.variable} value={cv.variable}>
                            {cv.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </>
              )}
            </div>

            {showChangeMessage && (
              <button
                type="button"
                onClick={() =>
                  updateField(section, index, {
                    changeMessage: hasChangeMessage ? undefined : "%@",
                  })
                }
                className={`mt-0.5 p-1 rounded transition-colors ${
                  hasChangeMessage
                    ? "text-[#0e70db] bg-blue-50 hover:bg-blue-100"
                    : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                }`}
                title={
                  hasChangeMessage
                    ? "Notificacion de cambio activa — clic para desactivar"
                    : "Activar notificacion de cambio"
                }
                aria-label={
                  hasChangeMessage
                    ? "Desactivar notificacion de cambio"
                    : "Activar notificacion de cambio"
                }
              >
                <Bell className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={() => removeField(section, index)}
              className="mt-0.5 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Eliminar campo"
              aria-label="Eliminar campo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Delete field</title>
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => addField(section)}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 text-xs font-medium hover:border-gray-400 hover:text-gray-700 transition-colors"
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
          <title>Add field</title>
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        Agregar campo
      </button>
    </div>
  )
}

export function FieldsSection({ customVariables }: { customVariables?: CustomVariable[] }) {
  return (
    <CollapsibleSection title="Campos">
      <FieldGroup
        section="headerFields"
        label="Header Fields"
        showChangeMessage
        customVariables={customVariables}
      />
      <div className="border-t border-gray-200" />
      <FieldGroup
        section="secondaryFields"
        label="Secondary Fields"
        showChangeMessage
        customVariables={customVariables}
      />
      <div className="border-t border-gray-200" />
      <FieldGroup
        section="backFields"
        label="Back Fields (reverso del pase)"
        freeText
        customVariables={customVariables}
      />
    </CollapsibleSection>
  )
}
