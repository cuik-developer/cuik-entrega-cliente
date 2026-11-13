"use client"

import { FINANCE_COST_CATEGORIES, isValidRuc } from "@cuik/shared/validators"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  DataTable,
  Panel,
  PanelHeader,
  PanelMessage,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IGV_TREATMENT_LABEL, type IgvTreatment } from "@/lib/admin/documents"
import type { DocumentsPage } from "@/lib/admin/documents-data"

type Supplier = DocumentsPage["suppliers"][number]
type Form = {
  docType: "ruc" | "dni" | "foreign"
  docNumber: string
  name: string
  country: string
  defaultCategory: string
  defaultIgvTreatment: IgvTreatment | ""
  notes: string
}

const sel = "h-9 w-full rounded-md border border-ent-line bg-white px-2 text-sm"
const empty: Form = {
  docType: "ruc",
  docNumber: "",
  name: "",
  country: "PE",
  defaultCategory: "",
  defaultIgvTreatment: "",
  notes: "",
}

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const fe = json?.details?.fieldErrors as Record<string, string[]> | undefined
    throw new Error((fe && Object.values(fe).flat()[0]) ?? json?.error ?? "No se pudo guardar")
  }
}

/**
 * Compras › Proveedores: who Cuik buys from. Foreign providers (Hetzner,
 * Apple, Google…) are "no domiciliados": their IGV goes through utilización
 * de servicios and the contador decides how to treat them.
 */
export function SuppliersPanel({
  suppliers,
  onChanged,
}: {
  suppliers: Supplier[]
  onChanged: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [f, setF] = useState<Form>(empty)
  const [busy, setBusy] = useState(false)

  function open(s: Supplier | null) {
    setEditing(s?.id ?? "new")
    setF(
      s
        ? {
            docType: s.docType,
            docNumber: s.docNumber ?? "",
            name: s.name,
            country: s.country,
            defaultCategory: s.defaultCategory ?? "",
            defaultIgvTreatment: (s.defaultIgvTreatment as IgvTreatment | null) ?? "",
            notes: s.notes ?? "",
          }
        : empty,
    )
  }

  const docError =
    f.docType === "ruc" && f.docNumber && (f.docNumber.length !== 11 || !isValidRuc(f.docNumber))
      ? "RUC inválido"
      : f.docType === "dni" && f.docNumber && !/^\d{8}$/.test(f.docNumber)
        ? "El DNI tiene 8 dígitos"
        : null

  async function save() {
    setBusy(true)
    try {
      const body = { ...f, domiciled: f.docType !== "foreign" }
      if (editing === "new") await call("POST", "/api/admin/finance/suppliers", body)
      else await call("PUT", `/api/admin/finance/suppliers/${editing}`, body)
      toast.success("Proveedor guardado")
      setEditing(null)
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar")
    } finally {
      setBusy(false)
    }
  }

  async function remove(s: Supplier) {
    if (!confirm(`¿Eliminar a ${s.name}?`)) return
    try {
      await call("DELETE", `/api/admin/finance/suppliers/${s.id}`)
      toast.success("Proveedor eliminado")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar")
    }
  }

  return (
    <Panel>
      <PanelHeader
        title="Proveedores"
        actions={
          <Button size="sm" className="h-7 text-[12px] gap-1.5" onClick={() => open(null)}>
            <Plus className="w-3.5 h-3.5" /> Nuevo proveedor
          </Button>
        }
      />
      {editing && (
        <div className="m-3 rounded-[4px] border border-ent-line bg-ent-panel-2 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Documento</Label>
            <select
              className={sel}
              value={f.docType}
              onChange={(e) =>
                setF({
                  ...f,
                  docType: e.target.value as Form["docType"],
                  country:
                    e.target.value === "foreign" ? (f.country === "PE" ? "" : f.country) : "PE",
                  defaultIgvTreatment:
                    e.target.value === "foreign" ? "no_domiciliado" : f.defaultIgvTreatment,
                })
              }
            >
              <option value="ruc">RUC (Perú)</option>
              <option value="dni">DNI</option>
              <option value="foreign">Del exterior</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {f.docType === "foreign" ? "Número fiscal (opcional)" : "Número"}
            </Label>
            <Input
              value={f.docNumber}
              inputMode={f.docType === "foreign" ? "text" : "numeric"}
              onChange={(e) =>
                setF({
                  ...f,
                  docNumber:
                    f.docType === "foreign" ? e.target.value : e.target.value.replace(/\D/g, ""),
                })
              }
            />
            {docError && <p className="text-[11.5px] text-ent-bad">{docError}</p>}
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Nombre o razón social</Label>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          {f.docType === "foreign" && (
            <div className="space-y-1">
              <Label className="text-xs">País (código de 2 letras)</Label>
              <Input
                value={f.country}
                maxLength={2}
                placeholder="DE"
                onChange={(e) => setF({ ...f, country: e.target.value.toUpperCase() })}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Categoría habitual</Label>
            <select
              className={sel}
              value={f.defaultCategory}
              onChange={(e) => setF({ ...f, defaultCategory: e.target.value })}
            >
              <option value="">—</option>
              {FINANCE_COST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">IGV habitual</Label>
            <select
              className={sel}
              value={f.defaultIgvTreatment}
              onChange={(e) => setF({ ...f, defaultIgvTreatment: e.target.value as IgvTreatment })}
            >
              <option value="">—</option>
              {(Object.keys(IGV_TREATMENT_LABEL) as IgvTreatment[]).map((t) => (
                <option key={t} value={t}>
                  {IGV_TREATMENT_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">Notas</Label>
            <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={
                busy ||
                !f.name.trim() ||
                docError !== null ||
                (f.docType !== "foreign" && !f.docNumber) ||
                (f.docType === "foreign" && f.country.length !== 2)
              }
              onClick={save}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </div>
      )}
      {suppliers.length === 0 ? (
        <PanelMessage className="py-8">Todavía no hay proveedores.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Proveedor</Th>
              <Th>Documento</Th>
              <Th>Origen</Th>
              <Th>Categoría</Th>
              <Th>IGV habitual</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium">{s.name}</Td>
                <Td className="tabular-nums">{s.docNumber ?? "—"}</Td>
                <Td>
                  <StatusChip tone={s.domiciled ? "mute" : "info"}>
                    {s.domiciled ? "Perú" : `Exterior · ${s.country}`}
                  </StatusChip>
                </Td>
                <Td className="text-ent-fg-2">{s.defaultCategory ?? "—"}</Td>
                <Td className="text-ent-fg-2">
                  {s.defaultIgvTreatment
                    ? IGV_TREATMENT_LABEL[s.defaultIgvTreatment as IgvTreatment]
                    : "—"}
                </Td>
                <Td align="right" className="whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Editar"
                    onClick={() => open(s)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Eliminar"
                    onClick={() => remove(s)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}
