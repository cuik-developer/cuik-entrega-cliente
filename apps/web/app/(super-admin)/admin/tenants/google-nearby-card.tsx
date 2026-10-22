"use client"

import { Loader2, MapPin, RefreshCw, Search } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { GoogleNearbyStatus } from "@/lib/wallet/google-nearby"

import { getGoogleNearbyStatus, resyncGoogleNearby } from "./google-nearby-actions"

type Loc = { latitude: number; longitude: number }

const fmt = (l: Loc) => `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`
const same = (a: Loc[], b: Loc[]) =>
  a.length === b.length && a.every((l, i) => fmt(l) === fmt(b[i]))

/**
 * Android nearby notifications: compares the locations Google has on the
 * tenant's loyalty class with the ones set in Geolocalizadas. Checking is
 * read-only; "Reenviar" PATCHes the class with the Cuik locations.
 */
export function GoogleNearbyCard({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<GoogleNearbyStatus | null>(null)
  const [busy, setBusy] = useState<"check" | "resync" | null>(null)

  async function run(kind: "check" | "resync") {
    setBusy(kind)
    const result =
      kind === "check" ? await getGoogleNearbyStatus(tenantId) : await resyncGoogleNearby(tenantId)
    setBusy(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setStatus(result.data)
    if (kind === "resync") toast.success("Ubicaciones reenviadas a Google")
  }

  const inSync = status?.classExists && same(status.googleLocations, status.configuredLocations)

  return (
    <div className="mt-6 rounded-[4px] border border-ent-line p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <MapPin className="w-4 h-4" /> Android · Avisos de cercanía (Google Wallet)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Compara las ubicaciones que tiene Google con las de Geolocalizadas.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("check")}>
            {busy === "check" ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5 mr-1" />
            )}
            Revisar en Google
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!!busy || !status?.classExists}
            onClick={() => run("resync")}
          >
            {busy === "resync" ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
            )}
            Reenviar ubicaciones
          </Button>
        </div>
      </div>

      {status && (
        <div className="text-xs space-y-2">
          {!status.googleEnabled && (
            <p className="text-amber-700">Google Wallet no está configurado en este servidor.</p>
          )}
          {status.error && <p className="text-red-600">Error: {status.error}</p>}
          {status.classExists === false && (
            <p className="text-amber-700">
              Google aún no tiene la clase de este comercio (se crea con el primer cliente Android o
              al publicar el diseño).
            </p>
          )}
          {status.classExists && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {inSync ? (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0">
                    Google tiene las mismas ubicaciones
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-700 border-0">
                    No coinciden: usa «Reenviar ubicaciones»
                  </Badge>
                )}
                {status.reviewStatus && (
                  <span className="text-muted-foreground">
                    Estado de la clase: {status.reviewStatus}
                  </span>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <div className="font-medium mb-1">
                    En Google ({status.googleLocations.length})
                  </div>
                  {status.googleLocations.length === 0 ? (
                    <p className="text-muted-foreground">Ninguna</p>
                  ) : (
                    <ul className="font-mono space-y-0.5">
                      {status.googleLocations.map((l) => (
                        <li key={fmt(l)}>{fmt(l)}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="font-medium mb-1">
                    En Geolocalizadas ({status.configuredLocations.length})
                  </div>
                  {status.configuredLocations.length === 0 ? (
                    <p className="text-muted-foreground">Ninguna</p>
                  ) : (
                    <ul className="font-mono space-y-0.5">
                      {status.configuredLocations.map((l) => (
                        <li key={fmt(l)}>{fmt(l)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <p className="text-muted-foreground">Clase: {status.classId}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
