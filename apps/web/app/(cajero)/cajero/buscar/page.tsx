"use client"

import {
  CheckCircle2,
  ChevronDown,
  Coins,
  Gift,
  Loader2,
  MapPin,
  RotateCcw,
  Search,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTenant } from "@/hooks/use-tenant"

type LocationOption = {
  id: string
  name: string
  address: string | null
}

type ClientResult = {
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
}

type ClientDetail = {
  client: ClientResult & { qrCode: string | null; createdAt: string }
  stamps: { current: number | null; max: number | null }
  pendingRewards: number
  promotion: { id: string; type: string; rewardValue: string | null } | null
  points?: { balance: number; availableCatalogItems?: number }
}

type CatalogItem = {
  id: string
  name: string
  description: string | null
  pointsCost: number
  category: string | null
  imageUrl: string | null
}

const tierColors: Record<string, string> = {
  Nuevo: "bg-blue-100 text-blue-700",
  Regular: "bg-emerald-100 text-emerald-700",
  VIP: "bg-amber-100 text-amber-700",
}

const LOCATION_STORAGE_KEY = "cuik:cashier:locationId"

function autoSelectLocation(data: LocationOption[], setSelectedLocationId: (id: string) => void) {
  if (data.length === 1) {
    setSelectedLocationId(data[0].id)
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, data[0].id)
    } catch {}
  } else if (data.length > 1) {
    try {
      const saved = localStorage.getItem(LOCATION_STORAGE_KEY)
      if (saved && data.some((l) => l.id === saved)) {
        setSelectedLocationId(saved)
      }
    } catch {}
  }
}

function useBuscarLocations(tenantSlug: string | null) {
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [locationMenuOpen, setLocationMenuOpen] = useState(false)

  useEffect(() => {
    if (!tenantSlug) return

    async function fetchLocations() {
      try {
        const res = await fetch(`/api/${tenantSlug}/locations`)
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          setLocations(json.data)
          autoSelectLocation(json.data, setSelectedLocationId)
        }
      } catch {
        // silent
      }
    }

    fetchLocations()
  }, [tenantSlug])

  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId)
    setLocationMenuOpen(false)
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, locationId)
    } catch {}
  }

  const selectedLocation = locations.find((l) => l.id === selectedLocationId)

  return {
    locations,
    selectedLocationId,
    locationMenuOpen,
    setLocationMenuOpen,
    handleLocationChange,
    selectedLocation,
  }
}

function resolveVisitMessage(
  code: string,
  isPoints: boolean,
  json: Record<string, unknown>,
): string {
  const data = json.data as Record<string, unknown> | undefined
  switch (code) {
    case "OK": {
      if (isPoints && data?.points) {
        const pts = data.points as { earned: number; balance: number }
        return `Visita registrada! +${pts.earned} puntos (Balance: ${pts.balance})`
      }
      return "Visita registrada!"
    }
    case "ALREADY_SCANNED_TODAY":
      return "Ya fue escaneado hoy"
    case "NO_ACTIVE_PROMOTION":
      return "No hay promocion activa en este comercio"
    case "CLIENT_NOT_FOUND":
      return "Cliente no encontrado"
    case "AMOUNT_REQUIRED":
      return "El monto de compra es obligatorio"
    case "BELOW_MINIMUM_PURCHASE":
      return "El monto es menor al minimo requerido"
    default:
      return (json.error as string) || "Error al registrar"
  }
}

export default function BuscarPage() {
  const { tenantSlug, promotionType, promotionConfig } = useTenant()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ClientResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<ClientDetail | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([])
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const {
    locations,
    selectedLocationId,
    locationMenuOpen,
    setLocationMenuOpen,
    handleLocationChange,
    selectedLocation,
  } = useBuscarLocations(tenantSlug)

  const isPoints = promotionType === "points"

  // Determine if the current promotion requires a purchase amount
  const stampsMinAmount = !isPoints
    ? (((promotionConfig?.accumulation as Record<string, unknown> | undefined)
        ?.minimumPurchaseAmount as number | null) ?? null)
    : null
  const requiresAmount = isPoints || stampsMinAmount !== null

  const searchClients = useCallback(
    async (term: string) => {
      if (!term.trim() || !tenantSlug) {
        setResults([])
        return
      }

      setSearching(true)
      try {
        const res = await fetch(
          `/api/${tenantSlug}/clients?search=${encodeURIComponent(term)}&limit=20`,
        )
        const json = await res.json()
        if (json.success) {
          setResults(json.data.data || [])
        }
      } catch {
        // silent
      } finally {
        setSearching(false)
      }
    },
    [tenantSlug],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchClients(query), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, searchClients])

  // Fetch catalog items when a points client is selected
  useEffect(() => {
    if (!isPoints || !selected || !tenantSlug) return

    async function fetchCatalog() {
      try {
        const res = await fetch(`/api/${tenantSlug}/premios`)
        const json = await res.json()
        if (json.success && json.data?.items) {
          setCatalogItems(json.data.items)
        }
      } catch {
        // silent
      }
    }

    fetchCatalog()
  }, [isPoints, selected, tenantSlug])

  const selectClient = async (clientId: string) => {
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}`)
      const json = await res.json()
      if (json.success) {
        setSelected(json.data)
      }
    } catch {
      // silent
    }
  }

  const [submitting, setSubmitting] = useState(false)

  const handleVisit = async () => {
    if (!selected?.client.qrCode || submitting) return

    // Validate location selection when tenant has locations
    if (locations.length > 0 && !selectedLocationId) {
      toast.error("Selecciona una sucursal antes de registrar la visita")
      return
    }

    // Amount is required for points and stamps with minimum purchase
    if (requiresAmount && (!purchaseAmount.trim() || Number.parseFloat(purchaseAmount) <= 0)) {
      setActionMsg("Ingresa el monto de la compra")
      return
    }

    setActionMsg(null)
    setSubmitting(true)

    try {
      const bodyPayload: Record<string, unknown> = { qrCode: selected.client.qrCode }
      if (requiresAmount && purchaseAmount) {
        bodyPayload.amount = Number.parseFloat(purchaseAmount)
      }
      if (selectedLocationId) {
        bodyPayload.locationId = selectedLocationId
      }

      const res = await fetch(`/api/${tenantSlug}/visits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      })
      const json = await res.json()
      const code = json.data?.code

      const message = resolveVisitMessage(code, isPoints, json)
      setActionMsg(message)

      if (code === "OK") {
        setPurchaseAmount("")
        await selectClient(selected.client.id)
      }
    } catch {
      setActionMsg("Error de conexion")
    } finally {
      setSubmitting(false)
    }
  }

  const handleRedeem = async () => {
    if (!selected?.client.qrCode) return
    setActionMsg(null)

    try {
      const res = await fetch(`/api/${tenantSlug}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: selected.client.qrCode }),
      })
      const json = await res.json()

      if (json.data?.code === "OK") {
        setActionMsg("Premio canjeado!")
        await selectClient(selected.client.id)
      } else if (json.data?.code === "NO_PENDING_REWARD") {
        setActionMsg("No tiene premios pendientes")
      } else {
        setActionMsg(json.error || "Error al canjear")
      }
    } catch {
      setActionMsg("Error de conexion")
    }
  }

  function resolveRedeemCatalogMessage(json: Record<string, unknown>): string {
    const data = json.data as Record<string, unknown> | undefined
    const code = data?.code as string | undefined
    switch (code) {
      case "OK": {
        const catalogItem = data?.catalogItem as { name?: string } | undefined
        const points = data?.points as { deducted?: number } | undefined
        return `Canjeado: ${catalogItem?.name ?? "Premio"} (-${points?.deducted} pts)`
      }
      case "INSUFFICIENT_POINTS":
        return "Puntos insuficientes"
      case "CATALOG_ITEM_NOT_FOUND":
        return "Premio no encontrado"
      case "CATALOG_ITEM_INACTIVE":
        return "Premio no disponible"
      default:
        return (json.error as string) || "Error al canjear"
    }
  }

  const handleRedeemCatalogItem = async (catalogItemId: string) => {
    if (!selected?.client.qrCode) return
    setActionMsg(null)

    try {
      const res = await fetch(`/api/${tenantSlug}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode: selected.client.qrCode, catalogItemId }),
      })
      const json = await res.json()

      const message = resolveRedeemCatalogMessage(json)
      setActionMsg(message)

      if (json.data?.code === "OK") {
        await selectClient(selected.client.id)
      }
    } catch {
      setActionMsg("Error de conexion")
    }
  }

  return (
    <div className="space-y-5">
      {/* Location selector — shown when tenant has multiple locations */}
      {locations.length > 1 && (
        <LocationSelector
          locations={locations}
          selectedLocationId={selectedLocationId}
          locationMenuOpen={locationMenuOpen}
          setLocationMenuOpen={setLocationMenuOpen}
          handleLocationChange={handleLocationChange}
          selectedLocation={selectedLocation}
        />
      )}

      {!selected ? (
        <ClientSearchView
          query={query}
          setQuery={setQuery}
          searching={searching}
          results={results}
          selectClient={selectClient}
        />
      ) : (
        <ClientDetailView
          selected={selected}
          isPoints={isPoints}
          catalogItems={catalogItems}
          actionMsg={actionMsg}
          requiresAmount={requiresAmount}
          stampsMinAmount={stampsMinAmount}
          purchaseAmount={purchaseAmount}
          setPurchaseAmount={setPurchaseAmount}
          submitting={submitting}
          locationRequired={locations.length > 0 && !selectedLocationId}
          handleVisit={handleVisit}
          handleRedeem={handleRedeem}
          handleRedeemCatalogItem={handleRedeemCatalogItem}
          onReset={() => {
            setSelected(null)
            setActionMsg(null)
            setSubmitting(false)
            setCatalogItems([])
            setPurchaseAmount("")
          }}
        />
      )}
    </div>
  )
}

function LocationSelector({
  locations,
  selectedLocationId,
  locationMenuOpen,
  setLocationMenuOpen,
  handleLocationChange,
  selectedLocation,
}: {
  locations: LocationOption[]
  selectedLocationId: string
  locationMenuOpen: boolean
  setLocationMenuOpen: (open: boolean) => void
  handleLocationChange: (id: string) => void
  selectedLocation: LocationOption | undefined
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm transition-colors hover:border-gray-300"
        onClick={() => setLocationMenuOpen(!locationMenuOpen)}
      >
        <div className="flex items-center gap-2 text-gray-600 min-w-0">
          <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400" />
          <span className="truncate">
            {selectedLocation ? selectedLocation.name : "Seleccionar sucursal"}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${locationMenuOpen ? "rotate-180" : ""}`}
        />
      </button>
      {locationMenuOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-gray-50 ${
                loc.id === selectedLocationId
                  ? "font-semibold text-gray-900 bg-gray-50"
                  : "text-gray-600"
              }`}
              onClick={() => handleLocationChange(loc.id)}
            >
              <div className="truncate">{loc.name}</div>
              {loc.address && <div className="text-xs text-gray-400 truncate">{loc.address}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ClientSearchView({
  query,
  setQuery,
  searching,
  results,
  selectClient,
}: {
  query: string
  setQuery: (q: string) => void
  searching: boolean
  results: ClientResult[]
  selectClient: (id: string) => void
}) {
  return (
    <>
      <div className="text-center">
        <h1 className="text-xl font-extrabold text-gray-900">Buscar cliente</h1>
        <p className="text-sm text-gray-500 mt-1">Busca por nombre, celular, DNI o correo.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Nombre, celular, DNI o correo..."
          className="pl-9 h-11"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {searching && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {!searching && results.length > 0 && (
        <div className="space-y-2">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 transition-colors text-left hover:border-[color:var(--brand-primary)]"
              onClick={() => selectClient(c.id)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-bold"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--brand-primary) 10%, transparent)",
                    color: "var(--brand-primary)",
                  }}
                >
                  {c.name[0]}
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">
                    {c.name} {c.lastName || ""}
                  </div>
                  <div className="text-xs text-gray-400">{c.phone || c.dni || ""}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold text-gray-600">{c.totalVisits} visitas</div>
                {c.tier && (
                  <Badge
                    className={`text-xs mt-0.5 ${tierColors[c.tier] || "bg-gray-100 text-gray-600"}`}
                  >
                    {c.tier}
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!searching && query.trim() && results.length === 0 && (
        <div className="text-center py-8 text-sm text-gray-400">No se encontraron clientes</div>
      )}

      {!query.trim() && (
        <div className="text-center py-4 text-sm text-gray-400">
          Busca por nombre, DNI, telefono o correo
        </div>
      )}
    </>
  )
}

function ClientDetailView({
  selected,
  isPoints,
  catalogItems,
  actionMsg,
  requiresAmount,
  stampsMinAmount,
  purchaseAmount,
  setPurchaseAmount,
  submitting,
  locationRequired,
  handleVisit,
  handleRedeem,
  handleRedeemCatalogItem,
  onReset,
}: {
  selected: ClientDetail
  isPoints: boolean
  catalogItems: CatalogItem[]
  actionMsg: string | null
  requiresAmount: boolean
  stampsMinAmount: number | null
  purchaseAmount: string
  setPurchaseAmount: (v: string) => void
  submitting: boolean
  locationRequired: boolean
  handleVisit: () => void
  handleRedeem: () => void
  handleRedeemCatalogItem: (id: string) => void
  onReset: () => void
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-5 text-white"
        style={{
          background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-bold text-xl">
            {selected.client.name[0]}
          </div>
          <div>
            <div className="font-bold text-lg">
              {selected.client.name} {selected.client.lastName || ""}
            </div>
            <div className="text-white/60 text-sm">{selected.client.phone || ""}</div>
          </div>
          {selected.client.tier && (
            <Badge
              className={`ml-auto text-xs font-semibold border-0 ${tierColors[selected.client.tier] || ""}`}
            >
              {selected.client.tier}
            </Badge>
          )}
        </div>

        {isPoints && selected.points ? (
          /* Points info display */
          <div className="flex justify-between text-sm">
            <div>
              <div className="text-white/60 text-xs">Visitas totales</div>
              <div className="font-bold">{selected.client.totalVisits}</div>
            </div>
            <div className="text-center">
              <div className="text-white/60 text-xs flex items-center gap-1 justify-center">
                <Coins className="w-3 h-3" /> Puntos
              </div>
              <div className="font-bold text-xl">{selected.points.balance}</div>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs">Premios disp.</div>
              <div className="font-bold">{selected.points.availableCatalogItems ?? 0}</div>
            </div>
          </div>
        ) : (
          /* Stamps info display */
          <div className="flex justify-between text-sm">
            <div>
              <div className="text-white/60 text-xs">Visitas totales</div>
              <div className="font-bold">{selected.client.totalVisits}</div>
            </div>
            <div className="text-center">
              <div className="text-white/60 text-xs">Sellos</div>
              <div className="font-bold">
                {selected.stamps.current ?? 0}/{selected.stamps.max ?? "?"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs">Premios pend.</div>
              <div className="font-bold">{selected.pendingRewards}</div>
            </div>
          </div>
        )}
      </div>

      {/* Stamps: pending rewards */}
      {!isPoints && selected.pendingRewards > 0 && (
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Gift className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="font-semibold text-amber-800 text-sm">
            {selected.pendingRewards} premio(s) pendiente(s)
          </div>
          <Button
            size="sm"
            className="ml-auto bg-amber-500 text-white text-xs h-8"
            onClick={handleRedeem}
          >
            Canjear
          </Button>
        </div>
      )}

      {/* Points: catalog items to redeem */}
      {isPoints && catalogItems.length > 0 && selected.points && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Premios disponibles
          </div>
          {catalogItems.map((item) => {
            const canAfford = (selected.points?.balance ?? 0) >= item.pointsCost
            return (
              <div
                key={item.id}
                className={`flex items-center gap-3 bg-white rounded-xl border px-4 py-3 ${canAfford ? "border-gray-200" : "border-gray-100 opacity-60"}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">{item.name}</div>
                  {item.description && (
                    <div className="text-xs text-gray-400 truncate">{item.description}</div>
                  )}
                  <div className="flex items-center gap-1 mt-0.5">
                    <Coins className="w-3 h-3 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-600">
                      {item.pointsCost} pts
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-amber-500 text-white text-xs h-8 shrink-0"
                  disabled={!canAfford}
                  onClick={() => handleRedeemCatalogItem(item.id)}
                >
                  Canjear
                </Button>
              </div>
            )
          })}
        </div>
      )}

      {actionMsg && (
        <div
          className="text-center py-2 text-sm font-medium"
          style={{ color: "var(--brand-primary)" }}
        >
          {actionMsg}
        </div>
      )}

      {/* Visit registration area */}
      <div className="space-y-2">
        {/* Amount input for points or stamps with minimum purchase */}
        {requiresAmount && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">
              S/
            </span>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder={
                stampsMinAmount !== null
                  ? `Monto de compra (min. S/ ${stampsMinAmount.toFixed(2)})`
                  : "Monto de compra"
              }
              className="pl-9 h-11"
              value={purchaseAmount}
              onChange={(e) => setPurchaseAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVisit()}
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            className="flex-1 h-12 text-white font-bold gap-2"
            style={{ backgroundColor: "var(--brand-primary)" }}
            onClick={handleVisit}
            disabled={submitting || !selected.client.qrCode || locationRequired}
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {submitting ? "Registrando..." : "Registrar visita"}
          </Button>
        </div>
      </div>

      <Button variant="outline" className="w-full h-10 gap-2" onClick={onReset}>
        <RotateCcw className="w-4 h-4" />
        Nueva busqueda
      </Button>
    </div>
  )
}
