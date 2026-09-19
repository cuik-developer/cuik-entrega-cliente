"use client"

import {
  Check,
  Coins,
  Copy,
  ExternalLink,
  Gift,
  ImageOff,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
} from "lucide-react"
import Image from "next/image"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

import { type CatalogItem, RewardFormDialog } from "./reward-form-dialog"

type Props = { tenantSlug: string; tenantName: string; premiosUrl: string }

export function PremiosClient({ tenantSlug, tenantName, premiosUrl }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [programActive, setProgramActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/catalog`)
      const json = await res.json()
      if (!json.success) throw new Error()
      setItems(json.data.items)
      setProgramActive(json.data.pointsProgramActive)
    } catch {
      toast.error("No se pudo cargar el catálogo")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(item: CatalogItem, active: boolean) {
    setToggling(item.id)
    try {
      const res = await fetch(`/api/${tenantSlug}/catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      })
      const json = await res.json()
      if (!json.success) throw new Error()
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active } : i)))
      toast.success(active ? "Premio visible para tus clientes" : "Premio oculto")
    } catch {
      toast.error("No se pudo actualizar")
    } finally {
      setToggling(null)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(premiosUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Mirá los premios que podés canjear con tus puntos en ${tenantName}: ${premiosUrl}`)}`
  const active = items.filter((i) => i.active)
  const inactive = items.filter((i) => !i.active)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Gift className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Premios</h1>
            <p className="text-sm text-muted-foreground">
              Lo que tus clientes canjean con sus puntos. Foto, costo y descripción los definís vos.
            </p>
          </div>
        </div>
        <Button
          className="gap-2"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Nuevo premio</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {!programActive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tu promoción de puntos está inactiva: el catálogo no se muestra a los clientes hasta que
          el equipo de Cuik la active.
        </div>
      )}

      {/* Share */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Compartí tu página de premios</CardTitle>
          <CardDescription>
            Es pública: tus clientes ven qué pueden canjear y cuántos puntos necesitan. El diseño
            sigue tus colores de marca.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="text-xs bg-muted px-3 py-2 rounded-lg flex-1 min-w-[200px] truncate">
            {premiosUrl}
          </code>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={premiosUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              Ver página
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Gift className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Todavía no tenés premios</p>
          <p className="text-sm text-muted-foreground mb-4">
            Creá el primero: un café gratis, un descuento, un producto. Con foto se canjea más.
          </p>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            Crear premio
          </Button>
        </div>
      ) : (
        <>
          <RewardGrid
            items={active}
            toggling={toggling}
            onToggle={toggleActive}
            onEdit={(item) => {
              setEditing(item)
              setDialogOpen(true)
            }}
          />
          {inactive.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Ocultos ({inactive.length})
              </div>
              <RewardGrid
                items={inactive}
                toggling={toggling}
                onToggle={toggleActive}
                onEdit={(item) => {
                  setEditing(item)
                  setDialogOpen(true)
                }}
              />
            </div>
          )}
        </>
      )}

      <RewardFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        tenantSlug={tenantSlug}
        item={editing}
        onSaved={load}
      />
    </div>
  )
}

function RewardGrid({
  items,
  toggling,
  onToggle,
  onEdit,
}: {
  items: CatalogItem[]
  toggling: string | null
  onToggle: (item: CatalogItem, active: boolean) => void
  onEdit: (item: CatalogItem) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <Card key={item.id} className={`overflow-hidden ${item.active ? "" : "opacity-70"}`}>
          <div className="relative aspect-[16/9] bg-muted">
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-1">
                <ImageOff className="w-5 h-5" />
                <span className="text-xs">Sin foto</span>
              </div>
            )}
            <div className="absolute top-2 left-2 flex gap-1.5">
              <Badge className="bg-amber-500 text-white border-0 gap-1">
                <Coins className="w-3 h-3" />
                {item.pointsCost} pts
              </Badge>
              {item.category && <Badge variant="secondary">{item.category}</Badge>}
            </div>
          </div>
          <CardContent className="p-4 space-y-3">
            <div>
              <div className="font-semibold leading-tight">{item.name}</div>
              {item.description && (
                <div className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                  {item.description}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={item.active}
                  disabled={toggling === item.id}
                  onCheckedChange={(v) => onToggle(item, v)}
                  aria-label={`Mostrar ${item.name}`}
                />
                <span className="text-xs text-muted-foreground">
                  {item.active ? "Visible" : "Oculto"}
                </span>
              </div>
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onEdit(item)}>
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
