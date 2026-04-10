"use client"

import { BrowserMultiFormatReader } from "@zxing/browser"
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Coins,
  Gift,
  Keyboard,
  MapPin,
  RotateCcw,
  Search,
  Star,
  X,
} from "lucide-react"
import { useRouter } from "next/navigation"
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

type ScanStep = "scan" | "amount" | "loading" | "found" | "success" | "reward" | "already" | "error"

type StampsVisitApiResult = {
  code: string
  visit?: { id: string; visitNum: number; cycleNumber: number }
  client: {
    id: string
    name: string
    lastName: string | null
    totalVisits: number
    currentCycle: number
  }
  stamps: { current: number; max: number }
  cycleComplete: boolean
  pendingRewards: number
  rewardValue?: string | null
}

type PointsVisitApiResult = {
  code: string
  visit?: { id: string; pointsEarned: number; createdAt: string }
  client: {
    id: string
    name: string
    lastName: string | null
    totalVisits: number
    pointsBalance: number
    tier?: string | null
  }
  points: { earned: number; balance: number }
  bonusApplied?: string | null
}

type VisitApiResult = StampsVisitApiResult | PointsVisitApiResult

function isPointsResult(result: VisitApiResult): result is PointsVisitApiResult {
  return "points" in result
}

function StampRow({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex gap-2 flex-wrap justify-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: stamp positions are static and order never changes
          key={i}
          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
            i < filled ? "border-transparent scale-110" : "bg-white/40 border-white/50"
          }`}
          style={
            i < filled
              ? { backgroundColor: "var(--brand-primary)", borderColor: "var(--brand-primary)" }
              : undefined
          }
        >
          {i < filled && <CheckCircle2 className="w-5 h-5 text-white" />}
        </div>
      ))}
    </div>
  )
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

function useLocations(tenantSlug: string | null) {
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [locationsLoaded, setLocationsLoaded] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>("")
  const [locationMenuOpen, setLocationMenuOpen] = useState(false)
  const [locationSearch, setLocationSearch] = useState("")

  useEffect(() => {
    if (!tenantSlug) {
      setLocationsLoaded(true)
      return
    }

    async function fetchLocations() {
      try {
        const res = await fetch(`/api/${tenantSlug}/locations`)
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          setLocations(json.data)
          autoSelectLocation(json.data, setSelectedLocationId)
        }
      } catch {
        // silent — locations are optional
      } finally {
        setLocationsLoaded(true)
      }
    }

    fetchLocations()
  }, [tenantSlug])

  const handleLocationChange = (locationId: string) => {
    setSelectedLocationId(locationId)
    setLocationMenuOpen(false)
    setLocationSearch("")
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, locationId)
    } catch {}
  }

  const filteredLocations = locationSearch.trim()
    ? locations.filter(
        (l) =>
          l.name.toLowerCase().includes(locationSearch.toLowerCase()) ||
          l.address?.toLowerCase().includes(locationSearch.toLowerCase()),
      )
    : locations

  const selectedLocation = locations.find((l) => l.id === selectedLocationId)

  return {
    locations,
    locationsLoaded,
    selectedLocationId,
    locationMenuOpen,
    setLocationMenuOpen,
    locationSearch,
    setLocationSearch,
    handleLocationChange,
    filteredLocations,
    selectedLocation,
  }
}

function handleVisitResult(
  data: VisitApiResult,
  setResult: (r: VisitApiResult) => void,
  setStep: (s: ScanStep) => void,
  setErrorMsg: (msg: string) => void,
) {
  setResult(data)

  switch (data.code) {
    case "OK":
      if (!isPointsResult(data) && data.cycleComplete) {
        setStep("reward")
      } else {
        setStep("success")
      }
      break
    case "ALREADY_SCANNED_TODAY":
      setStep("already")
      break
    case "CLIENT_NOT_FOUND":
      setErrorMsg("Cliente no encontrado en este comercio")
      setStep("error")
      break
    case "NO_ACTIVE_PROMOTION":
      setErrorMsg("No hay promocion activa en este comercio")
      setStep("error")
      break
    case "AMOUNT_REQUIRED":
      setErrorMsg("El monto de compra es obligatorio para este tipo de promocion")
      setStep("error")
      break
    case "BELOW_MINIMUM_PURCHASE":
      setErrorMsg("El monto de compra es menor al minimo requerido")
      setStep("error")
      break
    default:
      setErrorMsg("Respuesta inesperada del servidor")
      setStep("error")
  }
}

export default function EscanearPage() {
  const { tenantSlug, promotionType, promotionConfig } = useTenant()
  const router = useRouter()
  const [step, setStep] = useState<ScanStep>("scan")
  const [result, setResult] = useState<VisitApiResult | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [manualMode, setManualMode] = useState(false)
  const [manualQr, setManualQr] = useState("")
  const [cameraError, setCameraError] = useState(false)
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const [pendingQrCode, setPendingQrCode] = useState("")

  const {
    locations,
    locationsLoaded,
    selectedLocationId,
    locationMenuOpen,
    setLocationMenuOpen,
    locationSearch,
    setLocationSearch,
    handleLocationChange,
    filteredLocations,
    selectedLocation,
  } = useLocations(tenantSlug)

  const isPoints = promotionType === "points"

  // Determine if the current promotion requires a purchase amount
  // Points always require amount. Stamps require it only when minimumPurchaseAmount is set.
  const stampsMinAmount = !isPoints
    ? (((promotionConfig?.accumulation as Record<string, unknown> | undefined)
        ?.minimumPurchaseAmount as number | null) ?? null)
    : null
  const requiresAmount = isPoints || stampsMinAmount !== null

  const locationSearchRef = useRef<HTMLInputElement>(null)
  const locationComboRef = useRef<HTMLDivElement>(null)

  // Close location combobox on click outside
  useEffect(() => {
    if (!locationMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (locationComboRef.current && !locationComboRef.current.contains(e.target as Node)) {
        setLocationMenuOpen(false)
        setLocationSearch("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [locationMenuOpen, setLocationMenuOpen, setLocationSearch])

  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const processingRef = useRef(false)
  const controlsRef = useRef<ReturnType<BrowserMultiFormatReader["decodeFromVideoDevice"]> | null>(
    null,
  )

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      // Stop the reader controls
      controlsRef.current
        .then((controls) => {
          controls.stop()
        })
        .catch(() => {})
      controlsRef.current = null
    }
  }, [])

  const submitVisit = useCallback(
    async (qrCode: string, amount?: string) => {
      setStep("loading")

      try {
        const bodyPayload: Record<string, unknown> = { qrCode }
        if (amount) {
          bodyPayload.amount = Number.parseFloat(amount)
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

        if (!res.ok && !json.data) {
          setErrorMsg(json.error || "Error al registrar visita")
          setStep("error")
          return
        }

        const data: VisitApiResult = json.data
        handleVisitResult(data, setResult, setStep, setErrorMsg)
      } catch {
        setErrorMsg("Error de conexion — intenta de nuevo")
        setStep("error")
      }
    },
    [tenantSlug, selectedLocationId],
  )

  const processQr = useCallback(
    async (qrCode: string) => {
      if (processingRef.current) return
      processingRef.current = true

      if (!qrCode.startsWith("cuik:") && !qrCode.startsWith("MV_")) {
        setErrorMsg("QR no valido — formato incorrecto")
        setStep("error")
        return
      }

      // Validate location selection when tenant has locations
      if (locations.length > 0 && !selectedLocationId) {
        toast.error("Selecciona una sucursal antes de registrar la visita")
        processingRef.current = false
        return
      }

      stopCamera()

      // For points promotions or stamps with minimum purchase, we need the amount first
      if (requiresAmount) {
        setPendingQrCode(qrCode)
        setStep("amount")
        return
      }

      // For stamps without minimum purchase, submit directly
      await submitVisit(qrCode)
    },
    [stopCamera, requiresAmount, submitVisit, locations.length, selectedLocationId],
  )

  const handleAmountSubmit = () => {
    const amount = purchaseAmount.trim()
    if (!amount || Number.parseFloat(amount) <= 0) return
    submitVisit(pendingQrCode, amount)
  }

  // Use a ref for processQr so the camera callback always calls the latest version
  // without needing to restart the camera when processQr's deps change
  const processQrRef = useRef(processQr)
  useEffect(() => {
    processQrRef.current = processQr
  }, [processQr])

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return

    // Check if camera API is available
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("[Camera] getUserMedia not supported — HTTPS required")
      setCameraError(true)
      setManualMode(true)
      return
    }

    try {
      // Request permission explicitly first
      await navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then((stream) => {
          // Stop the test stream — @zxing will create its own
          for (const track of stream.getTracks()) track.stop()
        })
    } catch (err) {
      console.error("[Camera] Permission denied or no camera:", err)
      setCameraError(true)
      setManualMode(true)
      return
    }

    try {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      controlsRef.current = reader.decodeFromVideoDevice(undefined, videoRef.current, (res) => {
        if (res) {
          const text = res.getText()
          processQrRef.current(text)
        }
      })

      await controlsRef.current
    } catch (err) {
      console.error("[Camera] Failed to start scanner:", err)
      setCameraError(true)
      setManualMode(true)
    }
  }, [])

  useEffect(() => {
    if (step === "scan" && !manualMode && locationsLoaded) {
      startCamera()
    }
    return () => {
      stopCamera()
    }
  }, [step, manualMode, locationsLoaded, startCamera, stopCamera])

  const handleRedeem = async () => {
    if (!result) return

    try {
      // We need to find the client's QR to redeem. Use a reverse lookup approach.
      // Since we just scanned the QR, we can store it. Let's just call redeem with the same QR.
      const qrCode = manualQr || lastQrRef.current || pendingQrCode
      if (!qrCode) return

      const res = await fetch(`/api/${tenantSlug}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode }),
      })

      const json = await res.json()
      if (json.data?.code === "OK" && !isPointsResult(result)) {
        setResult((prev) =>
          prev && !isPointsResult(prev)
            ? { ...prev, pendingRewards: json.data.remainingPendingRewards }
            : prev,
        )
      }
    } catch {
      // silently fail, user can try again
    }
  }

  const lastQrRef = useRef("")

  const handleManualSubmit = () => {
    if (!manualQr.trim()) return
    lastQrRef.current = manualQr.trim()
    processQr(manualQr.trim())
  }

  const reset = () => {
    processingRef.current = false
    setStep("scan")
    setResult(null)
    setErrorMsg("")
    setManualQr("")
    setCameraError(false)
    setPurchaseAmount("")
    setPendingQrCode("")
  }

  return (
    <div className="space-y-5">
      {/* Location selector — searchable combobox, shown when tenant has multiple locations */}
      {locations.length > 1 && (
        <SearchableLocationSelector
          locationComboRef={locationComboRef}
          locationSearchRef={locationSearchRef}
          locationMenuOpen={locationMenuOpen}
          setLocationMenuOpen={setLocationMenuOpen}
          locationSearch={locationSearch}
          setLocationSearch={setLocationSearch}
          selectedLocation={selectedLocation}
          selectedLocationId={selectedLocationId}
          filteredLocations={filteredLocations}
          handleLocationChange={handleLocationChange}
        />
      )}

      {step === "scan" && (
        <ScanStepView
          manualMode={manualMode}
          videoRef={videoRef}
          cameraError={cameraError}
          manualQr={manualQr}
          setManualQr={setManualQr}
          stopCamera={stopCamera}
          setManualMode={setManualMode}
          handleManualSubmit={handleManualSubmit}
          router={router}
        />
      )}

      {step === "amount" && (
        <AmountStepView
          stampsMinAmount={stampsMinAmount}
          purchaseAmount={purchaseAmount}
          setPurchaseAmount={setPurchaseAmount}
          handleAmountSubmit={handleAmountSubmit}
          reset={reset}
        />
      )}

      {step === "loading" && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div
            className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "var(--brand-primary)", borderTopColor: "transparent" }}
          />
          <p className="text-gray-600 font-medium">Registrando visita...</p>
        </div>
      )}

      {step === "success" && result && (
        <SuccessStepView result={result} handleRedeem={handleRedeem} reset={reset} />
      )}

      {step === "already" && result && (
        <AlreadyScannedStepView result={result} handleRedeem={handleRedeem} reset={reset} />
      )}

      {step === "reward" && result && !isPointsResult(result) && (
        <RewardStepView result={result} handleRedeem={handleRedeem} reset={reset} />
      )}

      {step === "error" && (
        <div className="flex flex-col items-center text-center gap-5 py-10">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-gray-900">Error</h2>
            <p className="text-gray-500 mt-1 text-sm">{errorMsg}</p>
          </div>
          <Button
            className="w-full max-w-xs text-white h-11 font-semibold gap-2"
            style={{ backgroundColor: "var(--brand-primary)" }}
            onClick={reset}
          >
            <RotateCcw className="w-4 h-4" />
            Intentar de nuevo
          </Button>
        </div>
      )}
    </div>
  )
}

function SearchableLocationSelector({
  locationComboRef,
  locationSearchRef,
  locationMenuOpen,
  setLocationMenuOpen,
  locationSearch,
  setLocationSearch,
  selectedLocation,
  selectedLocationId,
  filteredLocations,
  handleLocationChange,
}: {
  locationComboRef: React.RefObject<HTMLDivElement | null>
  locationSearchRef: React.RefObject<HTMLInputElement | null>
  locationMenuOpen: boolean
  setLocationMenuOpen: (open: boolean) => void
  locationSearch: string
  setLocationSearch: (s: string) => void
  selectedLocation: LocationOption | undefined
  selectedLocationId: string
  filteredLocations: LocationOption[]
  handleLocationChange: (id: string) => void
}) {
  return (
    <div className="relative" ref={locationComboRef}>
      <div
        className={`flex items-center bg-white border rounded-xl px-3 py-2 text-sm transition-colors ${
          locationMenuOpen
            ? "border-gray-400 ring-1 ring-gray-200"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400 mr-2" />
        <input
          ref={locationSearchRef}
          type="text"
          className="flex-1 bg-transparent outline-none text-gray-700 placeholder-gray-400 min-w-0"
          placeholder="Seleccionar sucursal"
          value={locationMenuOpen ? locationSearch : (selectedLocation?.name ?? "")}
          onChange={(e) => {
            setLocationSearch(e.target.value)
            if (!locationMenuOpen) setLocationMenuOpen(true)
          }}
          onFocus={() => {
            setLocationMenuOpen(true)
            setLocationSearch("")
          }}
        />
        <button
          type="button"
          className="flex-shrink-0 ml-1 p-0.5"
          tabIndex={-1}
          onClick={() => {
            if (locationMenuOpen) {
              setLocationMenuOpen(false)
              setLocationSearch("")
            } else {
              setLocationMenuOpen(true)
              locationSearchRef.current?.focus()
            }
          }}
        >
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${locationMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      {locationMenuOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden max-h-60 overflow-y-auto">
          {filteredLocations.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400 text-center">
              No se encontraron sucursales
            </div>
          ) : (
            filteredLocations.map((loc) => (
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
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ScanStepView({
  manualMode,
  videoRef,
  cameraError,
  manualQr,
  setManualQr,
  stopCamera,
  setManualMode,
  handleManualSubmit,
  router,
}: {
  manualMode: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
  cameraError: boolean
  manualQr: string
  setManualQr: (v: string) => void
  stopCamera: () => void
  setManualMode: (v: boolean) => void
  handleManualSubmit: () => void
  router: ReturnType<typeof useRouter>
}) {
  return (
    <div className="space-y-5 text-center">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">Escanear QR</h1>
        <p className="text-sm text-gray-500 mt-1">Escanea el codigo QR del cliente.</p>
      </div>

      {!manualMode ? (
        <>
          <div className="w-64 h-64 mx-auto rounded-2xl overflow-hidden bg-black relative">
            <video ref={videoRef} className="w-full h-full object-cover">
              <track kind="captions" />
            </video>
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                <p className="text-gray-400 text-sm">Camara no disponible</p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className="w-full h-10 gap-2"
            onClick={() => {
              stopCamera()
              setManualMode(true)
            }}
          >
            <Keyboard className="w-4 h-4" />
            Ingresar codigo manual
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-3">
            <Input
              placeholder="cuik:slug:abc123def456"
              value={manualQr}
              onChange={(e) => setManualQr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              autoFocus
            />
            <Button
              className="text-white w-full h-12"
              style={{ backgroundColor: "var(--brand-primary)" }}
              onClick={handleManualSubmit}
            >
              Registrar QR
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full h-10 gap-2"
            onClick={() => router.push("/cajero/buscar")}
          >
            <Search className="w-4 h-4" />
            Buscar por nombre, DNI o telefono
          </Button>
          {!cameraError && (
            <Button
              variant="outline"
              className="w-full h-10 gap-2"
              onClick={() => setManualMode(false)}
            >
              <Camera className="w-4 h-4" />
              Usar camara
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function AmountStepView({
  stampsMinAmount,
  purchaseAmount,
  setPurchaseAmount,
  handleAmountSubmit,
  reset,
}: {
  stampsMinAmount: number | null
  purchaseAmount: string
  setPurchaseAmount: (v: string) => void
  handleAmountSubmit: () => void
  reset: () => void
}) {
  return (
    <div className="space-y-5 text-center">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">Monto de compra</h1>
        <p className="text-sm text-gray-500 mt-1">
          {stampsMinAmount !== null
            ? `Monto minimo: S/ ${stampsMinAmount.toFixed(2)}`
            : "Ingresa el monto de la compra del cliente."}
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">
            S/
          </span>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            className="pl-9 h-12 text-lg font-semibold"
            value={purchaseAmount}
            onChange={(e) => setPurchaseAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAmountSubmit()}
            autoFocus
          />
        </div>
        <Button
          className="text-white w-full h-12 font-semibold"
          style={{ backgroundColor: "var(--brand-primary)" }}
          onClick={handleAmountSubmit}
          disabled={!purchaseAmount.trim() || Number.parseFloat(purchaseAmount) <= 0}
        >
          Registrar visita
        </Button>
      </div>

      <Button variant="outline" className="w-full h-10 gap-2" onClick={reset}>
        <RotateCcw className="w-4 h-4" />
        Cancelar
      </Button>
    </div>
  )
}

function SuccessStepView({
  result,
  handleRedeem,
  reset,
}: {
  result: VisitApiResult
  handleRedeem: () => void
  reset: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900">Visita registrada!</h2>
          <p className="text-gray-500 mt-1">
            {result.client.name} {result.client.lastName || ""}
          </p>
        </div>
      </div>

      {isPointsResult(result) ? (
        <div
          className="rounded-2xl p-5 text-white"
          style={{
            background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-5 h-5 text-white/70" />
            <span className="text-white/60 text-xs">Programa de puntos</span>
          </div>
          <div className="flex justify-between items-end">
            <div>
              <div className="text-white/60 text-xs">Puntos ganados</div>
              <div className="text-3xl font-extrabold">+{result.points.earned}</div>
              {result.bonusApplied && (
                <div className="text-white/70 text-xs mt-0.5">Bonus: {result.bonusApplied}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-white/60 text-xs">Balance total</div>
              <div className="text-2xl font-bold">{result.points.balance}</div>
              <div className="text-white/50 text-xs">puntos</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="rounded-2xl p-5 text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
            }}
          >
            <div className="text-white/60 text-xs mb-2">
              Sello {result.visit?.visitNum}/{result.stamps.max} · Ciclo {result.visit?.cycleNumber}
            </div>
            <StampRow filled={result.stamps.current} total={result.stamps.max} />
          </div>

          {result.pendingRewards > 0 && (
            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Gift className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <div className="font-semibold text-amber-800 text-sm">
                  {result.pendingRewards} premio(s) pendiente(s)
                </div>
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
        </>
      )}

      <Button
        className="w-full h-11 text-white font-semibold gap-2"
        style={{ backgroundColor: "var(--brand-primary)" }}
        onClick={reset}
      >
        <RotateCcw className="w-4 h-4" />
        Nuevo escaneo
      </Button>
    </div>
  )
}

function AlreadyScannedStepView({
  result,
  handleRedeem,
  reset,
}: {
  result: VisitApiResult
  handleRedeem: () => void
  reset: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center text-center gap-4 py-6">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-amber-500" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">Ya fue escaneado hoy</h2>
          <p className="text-gray-500 mt-1">
            {result.client.name} {result.client.lastName || ""}
          </p>
        </div>
      </div>

      {isPointsResult(result) ? (
        <div
          className="rounded-2xl p-5 text-white"
          style={{
            background: "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-5 h-5 text-white/70" />
            <span className="text-white/60 text-xs">Balance actual</span>
          </div>
          <div className="text-center">
            <div className="text-3xl font-extrabold">{result.points.balance}</div>
            <div className="text-white/50 text-xs">puntos</div>
          </div>
        </div>
      ) : (
        <>
          <div
            className="rounded-2xl p-5 text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark))",
            }}
          >
            <div className="text-white/60 text-xs mb-2">
              {result.stamps.current}/{result.stamps.max} sellos · Visitas totales:{" "}
              {result.client.totalVisits}
            </div>
            <StampRow filled={result.stamps.current} total={result.stamps.max} />
          </div>

          {result.pendingRewards > 0 && (
            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <Gift className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="font-semibold text-amber-800 text-sm">
                {result.pendingRewards} premio(s) pendiente(s)
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
        </>
      )}

      <Button
        className="w-full h-11 text-white font-semibold gap-2"
        style={{ backgroundColor: "var(--brand-primary)" }}
        onClick={reset}
      >
        <RotateCcw className="w-4 h-4" />
        Nuevo escaneo
      </Button>
    </div>
  )
}

function RewardStepView({
  result,
  handleRedeem,
  reset,
}: {
  result: StampsVisitApiResult
  handleRedeem: () => void
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center text-center gap-5 py-8">
      <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center">
        <Star className="w-12 h-12 text-amber-500 fill-amber-500" />
      </div>
      <div>
        <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">
          Ciclo completado
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900">Premio ganado!</h2>
        <p className="text-gray-500 mt-1 text-sm">
          {result.client.name} {result.client.lastName || ""} completo su tarjeta
        </p>
        {result.rewardValue && (
          <Badge className="mt-2 bg-amber-100 text-amber-700 text-sm">{result.rewardValue}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <Button
          className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-semibold gap-2"
          onClick={async () => {
            await handleRedeem()
            reset()
          }}
        >
          <CheckCircle2 className="w-4 h-4" /> Confirmar canje
        </Button>
        <Button variant="outline" className="w-full h-10 text-sm" onClick={reset}>
          Canjear despues
        </Button>
      </div>
    </div>
  )
}
