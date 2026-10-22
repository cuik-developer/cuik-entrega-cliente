"use client"

import {
  Copy,
  CreditCard,
  Loader2,
  Paintbrush,
  Plus,
  Smartphone,
  Stamp,
  Star,
  Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useAdminAccess } from "@/components/admin/admin-access"
import { Notice } from "@/components/admin/enterprise"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { createDesign, deleteDesign, duplicateDesign, listDesigns, listTenants } from "./actions"

// ── Types ───────────────────────────────────────────────────────────

interface DesignRow {
  design: {
    id: string
    tenantId: string
    name: string
    type: "apple_store" | "google_loyalty"
    isActive: boolean
    version: number
    updatedAt: Date
    reviewRequestedAt: Date | null
  }
  tenantName: string
  tenantSlug: string
  promotionType: "stamps" | "discount" | "coupon" | "subscription" | "points" | null
  promotionName: string | null
  promotionActive: boolean | null
  reviewRequestedByName: string | null
}

// ── Component ───────────────────────────────────────────────────────

export default function PasesPage() {
  const router = useRouter()
  const isOwner = useAdminAccess().kind === "super_admin"
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [designs, setDesigns] = useState<DesignRow[]>([])
  const [allTenants, setAllTenants] = useState<
    { id: string; businessName: string; slug: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  // New design form state
  const [newName, setNewName] = useState("")
  const [newTenantId, setNewTenantId] = useState("")
  const [newType, setNewType] = useState<"apple_store" | "google_loyalty">("apple_store")
  const [creating, setCreating] = useState(false)

  const fetchDesigns = async () => {
    try {
      const result = await listDesigns()
      if (result.success) {
        setDesigns(result.data as DesignRow[])
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("No se pudo cargar. Recarga la página.")
    } finally {
      setLoading(false)
    }
  }

  const fetchTenants = async () => {
    try {
      const result = await listTenants()
      if (result.success) {
        setAllTenants(result.data)
      }
    } catch {
      // fetchDesigns already reports the failure
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally run only on mount
  useEffect(() => {
    fetchDesigns()
    fetchTenants()
  }, [])

  const handleCreate = async () => {
    if (!newName.trim() || !newTenantId) return
    setCreating(true)
    const result = await createDesign({
      tenantId: newTenantId,
      name: newName.trim(),
      type: newType,
    })
    setCreating(false)

    if (result.success) {
      setDialogOpen(false)
      setNewName("")
      router.push(`/admin/pases/${result.data.id}/editor`)
    }
  }

  const handleDuplicate = async (designId: string) => {
    setDuplicatingId(designId)
    try {
      const result = await duplicateDesign(designId)
      if (result.success) {
        router.push(`/admin/pases/${result.data.id}/editor`)
      } else {
        toast.error(result.error)
      }
    } finally {
      setDuplicatingId(null)
    }
  }

  const awaitingReview = designs.filter((d) => d.design.reviewRequestedAt)

  const handleDelete = async (designId: string) => {
    if (!window.confirm("¿Eliminar este diseño?")) return
    await deleteDesign(designId)
    fetchDesigns()
  }

  // Group designs by tenant
  const groupedByTenant = designs.reduce<Record<string, { name: string; designs: DesignRow[] }>>(
    (acc, row) => {
      const key = row.design.tenantId
      if (!acc[key]) {
        acc[key] = { name: row.tenantName, designs: [] }
      }
      acc[key].designs.push(row)
      return acc
    },
    {},
  )

  // Use allTenants from DB for the create dialog (not derived from designs)
  const tenantOptions = allTenants.map((t) => ({ id: t.id, name: t.businessName }))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[17px] leading-6 font-semibold text-ent-fg tracking-[-0.005em]">
            Diseños de Pases
          </h1>
          <p className="text-sm text-ent-fg-3 mt-1">
            Gestioná los diseños de pases de wallet para cada comercio.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-ent-accent text-white gap-1.5">
              <Plus className="w-4 h-4" />
              Nuevo Diseño
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear nuevo diseño de pase</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <label
                  htmlFor="comercio-select"
                  className="text-sm font-medium text-gray-700 block mb-1.5"
                >
                  Comercio
                </label>
                <Select value={newTenantId} onValueChange={setNewTenantId}>
                  <SelectTrigger id="comercio-select">
                    <SelectValue placeholder="Seleccionar comercio" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantOptions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="design-name-input"
                  className="text-sm font-medium text-gray-700 block mb-1.5"
                >
                  Nombre del diseño
                </label>
                <Input
                  id="design-name-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Tarjeta de sellos principal"
                />
              </div>

              <div>
                <label
                  htmlFor="wallet-type-select"
                  className="text-sm font-medium text-gray-700 block mb-1.5"
                >
                  Tipo de wallet
                </label>
                <Select
                  value={newType}
                  onValueChange={(v) => setNewType(v as "apple_store" | "google_loyalty")}
                >
                  <SelectTrigger id="wallet-type-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apple_store">Apple Wallet</SelectItem>
                    <SelectItem value="google_loyalty">Google Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newTenantId}
                className="w-full bg-ent-accent text-white"
              >
                {creating ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Crear y abrir editor
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isOwner && awaitingReview.length > 0 && (
        <Notice tone="info" className="mb-4">
          <span className="font-semibold text-ent-fg">
            {awaitingReview.length === 1
              ? "1 diseño listo para publicar"
              : `${awaitingReview.length} diseños listos para publicar`}
          </span>{" "}
          — guardados por Equipo Cuik:{" "}
          {awaitingReview.map((d) => `${d.design.name} (${d.tenantName})`).join(", ")}. Revísalos en
          el editor y publícalos.
        </Notice>
      )}
      {!isOwner && (
        <Notice tone="info" className="mb-4">
          Edita borradores y guárdalos: quedan listos para que el dueño los revise y publique. Para
          cambiar un diseño publicado, duplícalo como borrador.
        </Notice>
      )}

      {/* Design list grouped by tenant */}
      {Object.keys(groupedByTenant).length === 0 ? (
        <div className="text-center py-20">
          <Paintbrush className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-ent-fg-3">No hay diseños creados todavía.</p>
          <p className="text-sm text-gray-400 mt-1">Crea un nuevo diseño para empezar.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByTenant).map(([tenantId, group]) => (
            <div key={tenantId}>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-gray-400" />
                {group.name}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: design card with conditional badges for type, status, and promotion */}
                {group.designs.map((row) => (
                  <Card
                    key={row.design.id}
                    className="hover:shadow-md transition-shadow cursor-pointer group"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-ent-fg truncate">{row.design.name}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className={
                                row.design.type === "apple_store"
                                  ? "bg-gray-900/5 text-ent-fg border-ent-line text-xs"
                                  : "bg-[#34a853]/10 text-[#34a853] border-[#34a853]/20 text-xs"
                              }
                            >
                              <Smartphone className="w-3 h-3 mr-1" />
                              {row.design.type === "apple_store" ? "Apple" : "Google"}
                            </Badge>
                            <Badge
                              className={
                                row.design.isActive
                                  ? "bg-emerald-100 text-emerald-700 border-0 text-xs font-semibold"
                                  : "bg-amber-50 text-amber-600 border-0 text-xs"
                              }
                            >
                              {row.design.isActive ? "Publicado" : "Borrador"}
                            </Badge>
                            {row.promotionType && (
                              <Badge
                                variant="outline"
                                className={
                                  row.promotionType === "stamps"
                                    ? "bg-violet-50 text-violet-600 border-violet-200 text-xs"
                                    : "bg-ent-accent-soft text-blue-600 border-blue-200 text-xs"
                                }
                              >
                                {row.promotionType === "stamps" ? (
                                  <Stamp className="w-3 h-3 mr-1" />
                                ) : (
                                  <Star className="w-3 h-3 mr-1" />
                                )}
                                {row.promotionName ||
                                  (row.promotionType === "stamps" ? "Sellos" : "Puntos")}
                              </Badge>
                            )}
                            {row.design.reviewRequestedAt && (
                              <Badge
                                className="bg-blue-100 text-blue-700 border-0 text-xs font-semibold"
                                title={
                                  row.reviewRequestedByName
                                    ? `Guardado por ${row.reviewRequestedByName}`
                                    : undefined
                                }
                              >
                                Listo para publicar
                              </Badge>
                            )}
                            {/* "Promo activa" only on what clients see; a draft linked to the
                                active promotion is not live until it is published. */}
                            {row.promotionActive && row.design.isActive && (
                              <Badge className="bg-emerald-500 text-white border-0 text-[10px]">
                                Promo activa
                              </Badge>
                            )}
                            {row.promotionActive && !row.design.isActive && (
                              <Badge
                                variant="outline"
                                className="border-gray-200 text-gray-500 text-[10px]"
                                title="Está vinculado a la promoción activa, pero no es el diseño publicado"
                              >
                                Vinculado a la promo activa
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>v{row.design.version}</span>
                        <span>
                          {new Date(row.design.updatedAt).toLocaleDateString("es-AR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => router.push(`/admin/pases/${row.design.id}/editor`)}
                        >
                          <Paintbrush className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          title="Duplicar como borrador"
                          aria-label="Duplicar como borrador"
                          disabled={duplicatingId === row.design.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDuplicate(row.design.id)
                          }}
                        >
                          {duplicatingId === row.design.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </Button>
                        {isOwner && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(row.design.id)
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
