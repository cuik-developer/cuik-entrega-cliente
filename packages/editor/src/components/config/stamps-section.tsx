import { useEditorStore } from "../../store/editor-store"
import type { AssetKey } from "../../types"
import { AssetSlot } from "./asset-slot"
import { CollapsibleSection } from "./collapsible-section"

interface StampsSectionProps {
  onUploadAsset: (key: AssetKey, file: File) => void
  onGenerateAsset: (key: AssetKey) => void
}

export function StampsSection({ onUploadAsset, onGenerateAsset }: StampsSectionProps) {
  const stampUrl = useEditorStore((s) => s.config.assets.stamp)
  const stampsConfig = useEditorStore((s) => s.config.stampsConfig)
  const assetLoading = useEditorStore((s) => s.assetLoading)
  const updateStampsConfig = useEditorStore((s) => s.updateStampsConfig)

  return (
    <CollapsibleSection title="Sellos">
      <AssetSlot
        label="Icono del sello"
        currentUrl={stampUrl}
        isLoading={assetLoading.stamp}
        onUpload={(file) => onUploadAsset("stamp", file)}
        onGenerate={() => onGenerateAsset("stamp")}
      />

      {/* Grid mismatch warning */}
      {stampsConfig.maxVisits % (stampsConfig.gridCols * stampsConfig.gridRows) !== 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="mt-0.5 shrink-0">&#9888;</span>
          <span>
            El maximo de visitas ({stampsConfig.maxVisits}) no llena la grilla completa (
            {stampsConfig.gridCols}&times;{stampsConfig.gridRows} ={" "}
            {stampsConfig.gridCols * stampsConfig.gridRows}). Algunos espacios quedaran vacios.
          </span>
        </div>
      )}

      {/* Max visits */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">Maximo de visitas</span>
        <input
          type="number"
          min={1}
          max={30}
          value={stampsConfig.maxVisits}
          onChange={(e) => updateStampsConfig({ maxVisits: Number(e.target.value) })}
          className="w-full px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
        />
      </label>

      {/* Grid layout: columns & rows */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">Grilla</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">Columnas</span>
            <input
              type="number"
              min={1}
              max={10}
              value={stampsConfig.gridCols}
              onChange={(e) => updateStampsConfig({ gridCols: Number(e.target.value) })}
              className="w-full px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-800 text-xs focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">Filas</span>
            <input
              type="number"
              min={1}
              max={10}
              value={stampsConfig.gridRows}
              onChange={(e) => updateStampsConfig({ gridRows: Number(e.target.value) })}
              className="w-full px-2 py-1 rounded-md bg-white border border-gray-200 text-gray-800 text-xs focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
            />
          </label>
        </div>
      </div>

      {/* Fill order (only relevant for multi-row grids) */}
      {stampsConfig.gridRows > 1 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Orden de llenado</span>
          <select
            value={stampsConfig.fillOrder ?? "row"}
            onChange={(e) =>
              updateStampsConfig({ fillOrder: e.target.value as "row" | "interleaved" })
            }
            className="w-full px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
          >
            <option value="row">Fila por fila</option>
            <option value="interleaved">Intercalado (columna por columna)</option>
          </select>
        </label>
      )}

      {/* Stamp size */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">
          Tamano del sello ({stampsConfig.stampSize}px)
        </span>
        <input
          type="number"
          min={16}
          max={200}
          value={stampsConfig.stampSize}
          onChange={(e) => updateStampsConfig({ stampSize: Number(e.target.value) })}
          className="w-full px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-[#0e70db] focus:ring-1 focus:ring-[#0e70db]/20 transition-colors"
        />
      </label>

      {/* Position controls */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">Posicion de la grilla</span>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">
              Offset X ({stampsConfig.offsetX ?? 197}px)
            </span>
            <input
              type="range"
              min={0}
              max={500}
              value={stampsConfig.offsetX ?? 197}
              onChange={(e) => updateStampsConfig({ offsetX: Number(e.target.value) })}
              className="w-full accent-[#0e70db]"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">
              Offset Y ({stampsConfig.offsetY ?? 23}px)
            </span>
            <input
              type="range"
              min={0}
              max={200}
              value={stampsConfig.offsetY ?? 23}
              onChange={(e) => updateStampsConfig({ offsetY: Number(e.target.value) })}
              className="w-full accent-[#0e70db]"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">
              Espacio H ({stampsConfig.gapX ?? 98}px)
            </span>
            <input
              type="range"
              min={20}
              max={200}
              value={stampsConfig.gapX ?? 98}
              onChange={(e) => updateStampsConfig({ gapX: Number(e.target.value) })}
              className="w-full accent-[#0e70db]"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">
              Espacio V ({stampsConfig.gapY ?? 73}px)
            </span>
            <input
              type="range"
              min={20}
              max={200}
              value={stampsConfig.gapY ?? 73}
              onChange={(e) => updateStampsConfig({ gapY: Number(e.target.value) })}
              className="w-full accent-[#0e70db]"
            />
          </label>
        </div>
      </div>

      {/* Per-row offsets */}
      {stampsConfig.gridRows > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-gray-600">Ajuste por fila</span>
          {Array.from({ length: stampsConfig.gridRows }, (_, row) => {
            const offsets = stampsConfig.rowOffsets ?? []
            const rowOff = offsets[row] ?? { x: 0, y: 0 }
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are static based on gridRows count
              <div key={`row-offset-${row}`} className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-400">
                    Fila {row + 1} — X ({rowOff.x})
                  </span>
                  <input
                    type="range"
                    min={-200}
                    max={200}
                    value={rowOff.x}
                    onChange={(e) => {
                      const newOffsets = [...offsets]
                      while (newOffsets.length <= row) newOffsets.push({ x: 0, y: 0 })
                      newOffsets[row] = { ...newOffsets[row], x: Number(e.target.value) }
                      updateStampsConfig({ rowOffsets: newOffsets })
                    }}
                    className="w-full accent-[#0e70db]"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-gray-400">
                    Fila {row + 1} — Y ({rowOff.y})
                  </span>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={rowOff.y}
                    onChange={(e) => {
                      const newOffsets = [...offsets]
                      while (newOffsets.length <= row) newOffsets.push({ x: 0, y: 0 })
                      newOffsets[row] = { ...newOffsets[row], y: Number(e.target.value) }
                      updateStampsConfig({ rowOffsets: newOffsets })
                    }}
                    className="w-full accent-[#0e70db]"
                  />
                </label>
              </div>
            )
          })}
        </div>
      )}

      {/* Opacity sliders */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">
          Opacidad lleno ({Math.round(stampsConfig.filledOpacity * 100)}%)
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={stampsConfig.filledOpacity}
          onChange={(e) => updateStampsConfig({ filledOpacity: Number(e.target.value) })}
          className="w-full accent-[#0e70db]"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">
          Opacidad vacio ({Math.round(stampsConfig.emptyOpacity * 100)}%)
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={stampsConfig.emptyOpacity}
          onChange={(e) => updateStampsConfig({ emptyOpacity: Number(e.target.value) })}
          className="w-full accent-[#0e70db]"
        />
      </label>
    </CollapsibleSection>
  )
}
