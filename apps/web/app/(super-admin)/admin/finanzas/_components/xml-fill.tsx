"use client"

import { FileCode2, Loader2, Plus, X } from "lucide-react"
import { useRef } from "react"
import { Notice } from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import type { DocumentFileKind } from "@/lib/admin/document-files"
import type { UblDocument } from "@/lib/admin/ubl"

/** The XML chosen in the form: what it said, what to check, and a supplier still to add. */
export type XmlFillState = {
  file: File
  doc: UblDocument
  warnings: string[]
  newSupplier: { ruc: string; name: string } | null
}

/** Attach one file to a registered document (same endpoint as the list's upload buttons). */
export async function uploadDocumentFile(
  documentId: string,
  kind: DocumentFileKind,
  file: File,
): Promise<void> {
  const fd = new FormData()
  fd.set("kind", kind)
  fd.set("file", file)
  const res = await fetch(`/api/admin/finance/documents/${documentId}/files`, {
    method: "POST",
    body: fd,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) throw new Error(json?.error ?? "No se pudo subir el archivo")
}

/**
 * "Llenar desde XML" at the top of the document form: reads the SUNAT XML,
 * fills type, number, date, currency, amounts and the supplier (or offers to
 * add it), shows what to check, and the XML is attached when saving.
 */
export function XmlFill({
  state,
  onPick,
  onClear,
  onAddSupplier,
  addingSupplier,
}: {
  state: XmlFillState | null
  onPick: (file: File) => void
  onClear: () => void
  onAddSupplier: () => void
  addingSupplier: boolean
}) {
  const ref = useRef<HTMLInputElement | null>(null)
  const input = (
    <input
      ref={ref}
      type="file"
      accept=".xml,application/xml,text/xml"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) onPick(file)
        e.target.value = ""
      }}
    />
  )
  if (!state) {
    return (
      <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed border-ent-line px-3 py-2">
        <FileCode2 className="w-4 h-4 text-ent-fg-3" />
        <span className="text-[12px] text-ent-fg-2 flex-1 min-w-[180px]">
          ¿Tienes el XML del comprobante? Llena el formulario desde él.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[12px]"
          onClick={() => ref.current?.click()}
        >
          Llenar desde XML
        </Button>
        {input}
      </div>
    )
  }
  const d = state.doc
  return (
    <div className="col-span-2 sm:col-span-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-ent-line bg-ent-panel-2 px-3 py-2">
        <FileCode2 className="w-4 h-4 text-ent-accent" />
        <span className="text-[12px] text-ent-fg-2 flex-1 min-w-[180px]">
          Llenado desde <span className="font-medium text-ent-fg">{state.file.name}</span> (
          {d.serie}-{d.numero}). El XML se adjunta al guardar.
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-[12px]"
          onClick={() => ref.current?.click()}
        >
          Cambiar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="No adjuntar este XML"
          onClick={onClear}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
        {input}
      </div>
      {state.newSupplier && (
        <Notice tone="info">
          <span className="flex flex-wrap items-center gap-2">
            <span className="flex-1">
              Proveedor nuevo: {state.newSupplier.name || "sin nombre"} · RUC{" "}
              {state.newSupplier.ruc}.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[12px] gap-1.5"
              disabled={addingSupplier}
              onClick={onAddSupplier}
            >
              {addingSupplier ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Agregar proveedor
            </Button>
          </span>
        </Notice>
      )}
      {state.warnings.map((w) => (
        <Notice key={w} tone="warn">
          {w}
        </Notice>
      ))}
    </div>
  )
}
