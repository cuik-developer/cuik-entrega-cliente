"use client"

import { Coins } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { CONNECTION_ERROR, redeemRejectionMessage } from "@/lib/loyalty/cashier-messages"

type CatalogItem = {
  id: string
  name: string
  description: string | null
  pointsCost: number
}

/**
 * Points catalog at the till: the same list, two-step confirmation and
 * messages in Escanear and Buscar. While a redeem is in flight every button
 * is disabled, so a double tap cannot spend the points twice (the server also
 * rejects a repeat within seconds).
 */
export function PointsCatalog({
  tenantSlug,
  qrCode,
  balance,
  onRedeemed,
}: {
  tenantSlug: string
  qrCode: string
  /** Current balance of the client; null while it is still loading. */
  balance: number | null
  /** Called after a successful redeem with the new balance. */
  onRedeemed: (newBalance: number | null) => void | Promise<void>
}) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // "Confirmar canje" appears where "Canjear" was: a double tap must not
  // confirm in the same gesture.
  const confirmShownAt = useRef(0)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/${tenantSlug}/premios`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success && json.data?.items) setItems(json.data.items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tenantSlug])

  async function redeem(itemId: string) {
    if (redeemingId) return
    if (confirmId !== itemId) {
      setConfirmId(itemId)
      confirmShownAt.current = Date.now()
      setMessage(null)
      return
    }
    if (Date.now() - confirmShownAt.current < 400) return
    setConfirmId(null)
    setRedeemingId(itemId)
    setMessage(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrCode, catalogItemId: itemId }),
      })
      const json = await res.json()
      const data = json.data as
        | {
            code?: string
            catalogItem?: { name?: string }
            points?: { deducted?: number; newBalance?: number }
          }
        | undefined
      if (data?.code === "OK") {
        setMessage(
          `Canjeado: ${data.catalogItem?.name ?? "Premio"} (-${data.points?.deducted ?? 0} pts)`,
        )
        await onRedeemed(data.points?.newBalance ?? null)
      } else {
        setMessage(redeemRejectionMessage(data?.code, json.error))
      }
    } catch {
      setMessage(CONNECTION_ERROR)
    } finally {
      setRedeemingId(null)
    }
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-2 w-full text-left">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Premios disponibles
      </div>
      {balance === null && <div className="text-xs text-gray-400">Cargando saldo de puntos…</div>}
      {items.map((item) => {
        const canAfford = (balance ?? 0) >= item.pointsCost
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
                <span className="text-xs font-semibold text-amber-600">{item.pointsCost} pts</span>
              </div>
            </div>
            {confirmId === item.id ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 text-gray-500"
                  onClick={() => setConfirmId(null)}
                  disabled={redeemingId !== null}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-amber-600 text-white text-xs h-8"
                  disabled={redeemingId !== null || !canAfford}
                  onClick={() => redeem(item.id)}
                >
                  Confirmar canje
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="bg-amber-500 text-white text-xs h-8 shrink-0"
                disabled={!canAfford || redeemingId !== null}
                onClick={() => redeem(item.id)}
              >
                {redeemingId === item.id ? "Canjeando…" : "Canjear"}
              </Button>
            )}
          </div>
        )
      })}
      {message && (
        <div
          className="text-center py-2 text-sm font-medium"
          style={{ color: "var(--brand-primary)" }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
