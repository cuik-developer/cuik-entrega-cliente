"use client"

import { ArrowLeft, Coins, Loader2, Star } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTenant } from "@/hooks/use-tenant"

import { ClientNotes } from "../_components/client-notes"
import { ClientTags } from "../_components/client-tags"
import { CommunicationHistory } from "../_components/communication-history"

type ClientRow = {
  id: string
  name: string
  lastName: string | null
  dni: string | null
  phone: string | null
  email: string | null
  totalVisits: number
  currentCycle: number
  tier: string | null
  status: string
  createdAt: string
  qrCode: string | null
}

type ClientDetail = {
  client: ClientRow
  stamps: { current: number | null; max: number | null }
  pendingRewards: number
  promotion: { type: string; rewardValue: string | null } | null
  points?: { balance: number; availableCatalogItems?: number }
}

const tierColors: Record<string, string> = {
  Nuevo: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Regular: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  VIP: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  inactive: "bg-slate-100 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { tenantSlug } = useTenant()
  const clientId = params.id as string

  const [data, setData] = useState<ClientDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchClient = useCallback(async () => {
    if (!tenantSlug || !clientId) return
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, clientId])

  useEffect(() => {
    fetchClient()
  }, [fetchClient])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-sm">Cliente no encontrado</p>
        </div>
      </div>
    )
  }

  const { client, stamps, pendingRewards } = data
  const isPoints = data.promotion?.type === "points"
  const stampsMax = stamps.max ?? 0
  const stampsCurrent = stamps.current ?? 0
  const pct = stampsMax > 0 ? (stampsCurrent / stampsMax) * 100 : 0

  const statsCards = isPoints
    ? [
        { label: "Visitas totales", value: client.totalVisits },
        { label: "Puntos", value: data.points?.balance ?? 0 },
        { label: "Premios disp.", value: data.points?.availableCatalogItems ?? 0 },
        { label: "Premios pend.", value: pendingRewards },
      ]
    : [
        { label: "Visitas totales", value: client.totalVisits },
        { label: "Sellos", value: `${stampsCurrent}/${stampsMax || "?"}` },
        { label: "Premios pend.", value: pendingRewards },
        { label: "Ciclo actual", value: client.currentCycle },
      ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" />
          Volver
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-xl shrink-0">
          {client.name[0]}
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {client.name} {client.lastName || ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {[client.phone, client.email, client.dni].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statsCards.map((stat) => (
          <Card key={stat.label} className="border border-border">
            <CardContent className="p-3 text-center">
              <div className="text-xl font-extrabold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {pendingRewards > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center gap-2 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400">
          <Star className="w-4 h-4" />
          Tiene {pendingRewards} premio(s) pendiente(s) de canjear!
        </div>
      )}

      {isPoints && data.points && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700 flex items-center gap-2 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400">
          <Coins className="w-4 h-4" />
          Balance: {data.points.balance} puntos
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Información</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="communications">Comunicaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <ClientInfoTab
            client={client}
            isPoints={isPoints}
            stampsCurrent={stampsCurrent}
            stampsMax={stampsMax}
            pct={pct}
            points={data.points}
          />
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          {tenantSlug && <ClientNotes clientId={clientId} tenantSlug={tenantSlug} />}
        </TabsContent>

        <TabsContent value="tags" className="mt-4">
          {tenantSlug && <ClientTags clientId={clientId} tenantSlug={tenantSlug} />}
        </TabsContent>

        <TabsContent value="communications" className="mt-4">
          {tenantSlug && <CommunicationHistory clientId={clientId} tenantSlug={tenantSlug} />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground mt-0.5">{value}</dd>
    </div>
  )
}

function getStatusLabel(status: string): string {
  if (status === "active") return "Activo"
  if (status === "inactive") return "Inactivo"
  return status
}

function ClientInfoTab({
  client,
  isPoints,
  stampsCurrent,
  stampsMax,
  pct,
  points,
}: {
  client: ClientRow
  isPoints: boolean
  stampsCurrent: number
  stampsMax: number
  pct: number
  points?: { balance: number }
}) {
  return (
    <Card className="border border-border">
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoField label="Nombre" value={client.name} />
          <InfoField label="Apellido" value={client.lastName || "—"} />
          <InfoField label="Celular" value={client.phone || "—"} />
          <InfoField label="Email" value={client.email || "—"} />
          <InfoField label="DNI" value={client.dni || "—"} />
          <InfoField
            label="Registro"
            value={new Date(client.createdAt).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          />
        </div>

        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Tier</span>
            <Badge className={tierColors[client.tier || ""] || "bg-muted text-muted-foreground"}>
              {client.tier || "Sin tier"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Estado</span>
            <Badge className={statusColors[client.status] || "bg-muted text-muted-foreground"}>
              {getStatusLabel(client.status)}
            </Badge>
          </div>
          {!isPoints && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progreso del ciclo</span>
                <span>
                  {stampsCurrent}/{stampsMax || "?"}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
          {isPoints && points && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Balance de puntos</span>
              <span className="text-sm font-bold text-foreground">{points.balance} pts</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
