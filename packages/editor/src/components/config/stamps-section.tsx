import { useEffect, useState } from "react"

import {
  cellOf,
  effectiveMaxVisits,
  GRID_MAX,
  gridBounds,
  patchFromUi,
  STRIP_H,
  STRIP_W,
  type StampUiValues,
  toUiValues,
  uiRanges,
} from "../../lib/stamp-geometry"
import { useEditorStore } from "../../store/editor-store"
import type { AssetKey } from "../../types"
import { AssetSlot } from "./asset-slot"
import { CollapsibleSection } from "./collapsible-section"
import { IntegerInput, NumberSlider } from "./number-slider"

/** points-strip.ts ignores a special icon above 1 MB and draws the gift badge instead. */
const SPECIAL_ICON_MAX_BYTES = 1_000_000

interface StampsSectionProps {
  onUploadAsset: (key: AssetKey, file: File) => void
  onUploadSpecialStamp?: (file: File) => void
  /** maxVisits of the linked promotion: what the server draws and counts. */
  promotionMaxVisits?: number | null
}

const warnBox =
  "flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"

/** Small sketch of what each control measures on the 750 × 288 strip. */
function GeometryDiagram() {
  return (
    <svg
      viewBox="0 0 300 116"
      className="w-full h-auto"
      role="img"
      aria-label="Medidas de la grilla"
    >
      <title>Medidas de la grilla en la franja de 750 × 288 px</title>
      <rect x="0.5" y="0.5" width="299" height="115" rx="4" fill="#EEF4FD" stroke="#9DBDEB" />
      <rect x="62" y="30" width="34" height="34" rx="17" fill="#0e70db" opacity="0.85" />
      <rect x="126" y="30" width="34" height="34" rx="17" fill="#0e70db" opacity="0.85" />
      <rect x="62" y="76" width="34" height="34" rx="17" fill="#0e70db" opacity="0.35" />
      {/* margin left */}
      <line x1="2" y1="47" x2="60" y2="47" stroke="#FF4810" strokeWidth="1.2" />
      <text x="8" y="43" fontSize="8" fill="#B23608">
        Margen izq.
      </text>
      {/* margin top */}
      <line x1="79" y1="2" x2="79" y2="28" stroke="#FF4810" strokeWidth="1.2" />
      <text x="83" y="18" fontSize="8" fill="#B23608">
        Margen sup.
      </text>
      {/* separation x */}
      <line x1="97" y1="47" x2="125" y2="47" stroke="#0B7A3E" strokeWidth="1.2" />
      <text x="166" y="44" fontSize="8" fill="#0B7A3E">
        Separación horizontal
      </text>
      <text x="166" y="53" fontSize="7" fill="#0B7A3E">
        (espacio vacío entre sellos)
      </text>
      {/* separation y */}
      <line x1="79" y1="65" x2="79" y2="75" stroke="#0B7A3E" strokeWidth="1.2" />
      <text x="102" y="74" fontSize="8" fill="#0B7A3E">
        Separación vertical
      </text>
      {/* size */}
      <line x1="62" y1="113" x2="96" y2="113" stroke="#334155" strokeWidth="1" />
      <text x="102" y="104" fontSize="8" fill="#334155">
        Tamaño del sello
      </text>
      <text x="222" y="110" fontSize="8" fill="#64748B">
        750 × 288 px
      </text>
    </svg>
  )
}

export function StampsSection({
  onUploadAsset,
  onUploadSpecialStamp,
  promotionMaxVisits,
}: StampsSectionProps) {
  const stampUrl = useEditorStore((s) => s.config.assets.stamp)
  const stampsConfig = useEditorStore((s) => s.config.stampsConfig)
  const assetLoading = useEditorStore((s) => s.assetLoading)
  const updateStampsConfig = useEditorStore((s) => s.updateStampsConfig)

  const maxVisits = effectiveMaxVisits(promotionMaxVisits, stampsConfig.maxVisits)
  const cols = Math.max(1, stampsConfig.gridCols)
  const rows = Math.max(1, stampsConfig.gridRows)
  const cells = cols * rows
  const ui = toUiValues(stampsConfig)
  const ranges = uiRanges(ui.size)
  const bounds = gridBounds(stampsConfig, maxVisits)
  const setUi = (key: keyof StampUiValues, value: number) =>
    updateStampsConfig(patchFromUi(stampsConfig, key, value))

  const specialPositions = stampsConfig.specialPositions ?? []
  const specialOn = specialPositions.length > 0
  const toggleSpecial = (n: number) => {
    const next = specialPositions.includes(n)
      ? specialPositions.filter((p) => p !== n)
      : [...specialPositions, n].sort((a, b) => a - b)
    updateStampsConfig({ specialPositions: next })
  }

  // Size of the special icon: the server falls back to the badge above 1 MB.
  const specialUrl = stampsConfig.specialStampUrl ?? null
  const [specialBytes, setSpecialBytes] = useState<number | null>(null)
  useEffect(() => {
    setSpecialBytes(null)
    if (!specialUrl || !specialUrl.startsWith("/")) return
    let cancelled = false
    fetch(specialUrl)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!cancelled && b) setSpecialBytes(b.size)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [specialUrl])

  return (
    <CollapsibleSection title="Sellos">
      <AssetSlot
        label="Icono del sello (cuadrado, PNG con transparencia)"
        currentUrl={stampUrl}
        isLoading={assetLoading.stamp}
        onUpload={(file) => onUploadAsset("stamp", file)}
      />

      {/* Visits per card */}
      {promotionMaxVisits ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-2">
          <span className="text-xs text-violet-800">
            Sellos por tarjeta: <strong>{promotionMaxVisits}</strong> (de la promoción del
            comercio). Es lo que se dibuja en la franja y lo que cuenta el servidor.
          </span>
          {stampsConfig.maxVisits !== promotionMaxVisits && (
            <span className="text-[11px] text-amber-800">
              &#9888; El diseño guarda {stampsConfig.maxVisits} visitas, pero la promoción manda (
              {promotionMaxVisits}).{" "}
              <button
                type="button"
                className="underline hover:text-amber-950"
                onClick={() => updateStampsConfig({ maxVisits: promotionMaxVisits })}
              >
                Igualar a {promotionMaxVisits}
              </button>
            </span>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <IntegerInput
            label="Máximo de visitas (sin promoción vinculada)"
            value={stampsConfig.maxVisits}
            min={1}
            max={50}
            onChange={(v) => updateStampsConfig({ maxVisits: v })}
          />
        </div>
      )}

      {/* Grid layout: columns & rows */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-600">Grilla</span>
        <div className="grid grid-cols-2 gap-2">
          <IntegerInput
            label="Columnas"
            value={stampsConfig.gridCols}
            min={1}
            max={GRID_MAX}
            onChange={(v) => updateStampsConfig({ gridCols: v })}
          />
          <IntegerInput
            label="Filas"
            value={stampsConfig.gridRows}
            min={1}
            max={GRID_MAX}
            onChange={(v) => updateStampsConfig({ gridRows: v })}
          />
        </div>
      </div>

      {maxVisits > cells && (
        <div className={warnBox}>
          <span className="mt-0.5 shrink-0">&#9888;</span>
          <span>
            La tarjeta tiene {maxVisits} sellos pero la grilla solo {cols}&times;{rows} = {cells}{" "}
            casillas: los sellos que sobran se dibujan fuera de la grilla. Agrega filas o columnas.
          </span>
        </div>
      )}
      {maxVisits < cells && (
        <p className="text-[10px] text-gray-500">
          La grilla tiene {cells} casillas y la tarjeta {maxVisits} sellos: {cells - maxVisits}{" "}
          casilla(s) quedan sin sello.
        </p>
      )}

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

      {/* Geometry in the designer's terms */}
      <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">Posición de los sellos</span>
          <p className="text-[10px] leading-snug text-gray-500">
            Diseña la franja en una mesa de trabajo de 750 × 288 px y mide en px. Apple define el
            strip en 375 × 144 pt; 750 × 288 px es el tamaño @2x que usa Cuik.
          </p>
          <GeometryDiagram />
        </div>
        <NumberSlider
          label="Tamaño del sello"
          value={ui.size}
          min={ranges.size.min}
          max={ranges.size.max}
          onChange={(v) => setUi("size", v)}
        />
        <NumberSlider
          label="Margen izquierdo"
          hint="Del borde izquierdo de la franja al primer sello (igual en todas las filas)."
          value={ui.marginLeft}
          min={ranges.marginLeft.min}
          max={ranges.marginLeft.max}
          onChange={(v) => setUi("marginLeft", v)}
        />
        <NumberSlider
          label="Margen superior"
          hint="Del borde superior de la franja a la primera fila."
          value={ui.marginTop}
          min={ranges.marginTop.min}
          max={ranges.marginTop.max}
          onChange={(v) => setUi("marginTop", v)}
        />
        <NumberSlider
          label="Separación horizontal"
          hint="Espacio vacío entre un sello y el siguiente."
          value={ui.sepX}
          min={ranges.sepX.min}
          max={ranges.sepX.max}
          onChange={(v) => setUi("sepX", v)}
        />
        {stampsConfig.gridRows > 1 && (
          <NumberSlider
            label="Separación vertical"
            hint="Espacio vacío entre una fila y la siguiente."
            value={ui.sepY}
            min={ranges.sepY.min}
            max={ranges.sepY.max}
            onChange={(v) => setUi("sepY", v)}
          />
        )}
        {bounds.overflows && (
          <div className={warnBox}>
            <span className="mt-0.5 shrink-0">&#9888;</span>
            <span>
              Los sellos se salen de la franja: ocupan de x {bounds.minX} a {bounds.maxX} y de y{" "}
              {bounds.minY} a {bounds.maxY}, y la franja mide {STRIP_W} × {STRIP_H} px. Lo que queda
              fuera no se ve en el teléfono.
            </span>
          </div>
        )}
      </div>

      {/* Per-row offsets */}
      {stampsConfig.gridRows > 1 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-gray-600">Ajuste por fila (px)</span>
          <p className="text-[10px] text-gray-400">
            Desplaza una fila entera respecto de la grilla (por ejemplo, para intercalarla).
          </p>
          {Array.from({ length: stampsConfig.gridRows }, (_, row) => {
            const offsets = stampsConfig.rowOffsets ?? []
            const rowOff = offsets[row] ?? { x: 0, y: 0 }
            const setRow = (axis: "x" | "y", v: number) => {
              const newOffsets = [...offsets]
              while (newOffsets.length <= row) newOffsets.push({ x: 0, y: 0 })
              newOffsets[row] = { ...newOffsets[row], [axis]: v }
              updateStampsConfig({ rowOffsets: newOffsets })
            }
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are static based on gridRows count
              <div key={`row-offset-${row}`} className="grid grid-cols-2 gap-2">
                <NumberSlider
                  label={`Fila ${row + 1} — X`}
                  value={rowOff.x}
                  min={-300}
                  max={300}
                  onChange={(v) => setRow("x", v)}
                />
                <NumberSlider
                  label={`Fila ${row + 1} — Y`}
                  value={rowOff.y}
                  min={-200}
                  max={200}
                  onChange={(v) => setRow("y", v)}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Special stamps: the visits that carry a gift */}
      <div className="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50 p-3">
        <label className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-600">Sellos especiales</span>
          <input
            type="checkbox"
            checked={specialOn}
            onChange={(e) =>
              updateStampsConfig({
                specialPositions: e.target.checked ? [maxVisits] : [],
              })
            }
            className="accent-[#0e70db]"
          />
        </label>
        <p className="text-[10px] text-gray-400">
          Marca las visitas que tienen premio (por ejemplo la 3, la 6 y la última). Se dibujan con
          una insignia de regalo o con el icono que subas. Caen en su casilla según el orden de
          llenado.
        </p>
        {specialOn && (
          <>
            <div
              className="grid gap-1"
              style={{
                gridTemplateColumns: `repeat(${Math.max(cols, Math.ceil(maxVisits / rows))}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: maxVisits }, (_, i) => i + 1).map((n) => {
                // Show the chips where the stamps land on the card (same fill order).
                const { row, col } = cellOf(n - 1, cols, rows, stampsConfig.fillOrder ?? "row")
                const on = specialPositions.includes(n)
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleSpecial(n)}
                    className="h-7 rounded text-xs font-medium border transition-colors hover:border-gray-400"
                    style={{
                      gridRow: row + 1,
                      gridColumn: col + 1,
                      backgroundColor: on ? "#FF4810" : "#FFFFFF",
                      borderColor: on ? "#FF4810" : "#E5E7EB",
                      color: on ? "#FFFFFF" : "#4B5563",
                    }}
                    title={on ? `Visita ${n}: con premio` : `Visita ${n}`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            {specialPositions.some((p) => p > maxVisits) && (
              <p className="text-[10px] text-amber-700">
                Hay visitas marcadas más allá del máximo ({maxVisits}); se ignoran.
              </p>
            )}
            <AssetSlot
              label="Icono del sello especial (opcional, máx. 1 MB)"
              currentUrl={specialUrl}
              isLoading={assetLoading.stamp}
              onUpload={(file) => {
                setSpecialBytes(file.size)
                onUploadSpecialStamp?.(file)
              }}
            />
            {specialBytes != null && specialBytes > SPECIAL_ICON_MAX_BYTES && (
              <div className={warnBox}>
                <span className="mt-0.5 shrink-0">&#9888;</span>
                <span>
                  El icono pesa {(specialBytes / 1_000_000).toFixed(1)} MB: por encima de 1 MB el
                  pase lo ignora y dibuja la insignia de regalo. Comprímelo o achícalo.
                </span>
              </div>
            )}
            <IntegerInput
              label={`Tamaño del sello especial en px (vacío = igual que el normal, ${ui.size} px)`}
              value={stampsConfig.specialStampSize ?? Math.round(ui.size)}
              min={16}
              max={200}
              onChange={(v) => updateStampsConfig({ specialStampSize: v })}
            />
            {stampsConfig.specialStampSize != null && (
              <button
                type="button"
                className="self-start text-[11px] text-gray-500 hover:text-gray-800"
                onClick={() => updateStampsConfig({ specialStampSize: null })}
              >
                Usar el mismo tamaño que el sello normal
              </button>
            )}
            {specialUrl && (
              <button
                type="button"
                className="self-start text-[11px] text-gray-500 hover:text-red-600"
                onClick={() => updateStampsConfig({ specialStampUrl: null })}
              >
                Quitar icono y usar la insignia
              </button>
            )}
          </>
        )}
      </div>

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
          Opacidad vacío ({Math.round(stampsConfig.emptyOpacity * 100)}%)
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
