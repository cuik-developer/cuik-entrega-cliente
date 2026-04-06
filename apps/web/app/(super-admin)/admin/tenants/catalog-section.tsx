"use client"

import { Edit, Gift, Loader2, Plus, Power } from "lucide-react"
import { useCallback, useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { deleteCatalogItem, getCatalogItems } from "./catalog-actions"
import { CatalogFormDialog } from "./catalog-form-dialog"

// ── Types ───────────────────────────────────────────────────────────

interface CatalogItem {
  id: string
  name: string
  description: string | null
  pointsCost: number
  category: string | null
  active: boolean
  sortOrder: number
}

interface CatalogSectionProps {
  tenantId: string
  promotionType: string | null
}

// ── Component ───────────────────────────────────────────────────────

export function CatalogSection({ tenantId, promotionType }: CatalogSectionProps) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [isPending, startTransition] = useTransition()

  const fetchItems = useCallback(() => {
    setLoading(true)
    getCatalogItems(tenantId)
      .then((result) => {
        if (result.success) {
          setItems(
            result.data.map((row) => ({
              id: row.id,
              name: row.name,
              description: row.description,
              pointsCost: row.pointsCost,
              category: row.category,
              active: row.active,
              sortOrder: row.sortOrder,
            })),
          )
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantId])

  useEffect(() => {
    if (promotionType === "points") {
      fetchItems()
    }
  }, [promotionType, fetchItems])

  const handleToggleActive = (item: CatalogItem) => {
    startTransition(async () => {
      const result = await deleteCatalogItem(item.id)
      if (result.success) {
        toast.success(item.active ? `"${item.name}" desactivado` : `"${item.name}" desactivado`)
        fetchItems()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleEdit = (item: CatalogItem) => {
    setEditingItem(item)
    setDialogOpen(true)
  }

  const handleCreate = () => {
    setEditingItem(null)
    setDialogOpen(true)
  }

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open)
    if (!open) {
      setEditingItem(null)
      fetchItems()
    }
  }

  if (promotionType !== "points") return null

  return (
    <div className="pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Catalogo de premios
        </p>
        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1 bg-[#0e70db] text-white"
          onClick={handleCreate}
        >
          <Plus className="w-3 h-3" /> Agregar recompensa
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3">
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
          <span className="text-xs text-slate-500">Cargando catalogo...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-slate-50 rounded-xl p-4 text-center">
          <Gift className="w-5 h-5 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Sin recompensas en el catalogo</p>
          <p className="text-xs text-slate-400 mt-1">
            Agrega premios que los clientes puedan canjear con sus puntos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-slate-50 rounded-xl p-3 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">{item.name}</span>
                  <Badge
                    className={`text-[10px] border ${
                      item.active
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {item.active ? "Activo" : "Inactivo"}
                  </Badge>
                  {item.category && (
                    <Badge variant="outline" className="text-[10px] text-slate-500">
                      {item.category}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-slate-500">
                    <span className="font-semibold text-[#0e70db]">{item.pointsCost}</span> puntos
                  </span>
                  {item.description && (
                    <span className="text-xs text-slate-400 truncate">{item.description}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => handleEdit(item)}
                >
                  <Edit className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => handleToggleActive(item)}
                  disabled={isPending}
                >
                  <Power
                    className={`w-3 h-3 ${item.active ? "text-emerald-600" : "text-slate-400"}`}
                  />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CatalogFormDialog
        key={editingItem?.id ?? "new"}
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        tenantId={tenantId}
        item={editingItem}
      />
    </div>
  )
}
