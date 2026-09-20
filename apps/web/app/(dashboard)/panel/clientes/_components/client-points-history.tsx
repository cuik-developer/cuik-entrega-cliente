"use client"

import {
  Award,
  Cake,
  type Coins,
  Gift,
  Loader2,
  Receipt,
  SlidersHorizontal,
  Sparkles,
  TimerOff,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useTenant } from "@/hooks/use-tenant"
import type {
  ClientPointsHistory as PointsHistoryData,
  PointsMovementKind,
} from "@/lib/crm/client-points"
import { formatDateTime } from "@/lib/format-date"

const KIND: Record<PointsMovementKind, { label: string; icon: typeof Coins; tone: string }> = {
  purchase: { label: "Compra", icon: Receipt, tone: "bg-blue-50 text-primary" },
  bonus: { label: "Bono de registro", icon: Gift, tone: "bg-emerald-50 text-emerald-600" },
  birthday: { label: "Cumpleaños", icon: Cake, tone: "bg-pink-50 text-pink-600" },
  multiplier: { label: "Promoción", icon: Sparkles, tone: "bg-amber-50 text-amber-600" },
  redeem: { label: "Canje", icon: Award, tone: "bg-purple-50 text-purple-600" },
  expire: { label: "Vencimiento", icon: TimerOff, tone: "bg-red-50 text-red-500" },
  adjust: { label: "Ajuste", icon: SlidersHorizontal, tone: "bg-slate-100 text-slate-500" },
}

type Props = { clientId: string; tenantSlug: string }

function detailOf(m: PointsHistoryData["movements"][number]): string {
  const bits: string[] = []
  if (m.kind === "redeem") bits.push(m.rewardName ?? m.description ?? "Premio")
  if (m.visitAmount !== null && m.visitAmount > 0) bits.push(`S/ ${m.visitAmount.toFixed(2)}`)
  if ((m.kind === "birthday" || m.kind === "multiplier") && m.basePoints !== null) {
    bits.push(`${m.basePoints} base + ${m.amount - m.basePoints} extra`)
  }
  if (m.kind === "adjust" || m.kind === "expire") {
    if (m.description) bits.push(m.description)
  }
  return bits.join(" · ")
}

/** Estado de cuenta de puntos: saldo, totales y cada movimiento con su saldo resultante. */
export function ClientPointsHistory({ clientId, tenantSlug }: Props) {
  const { timezone } = useTenant()
  const [data, setData] = useState<PointsHistoryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}/points?limit=300`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? "error")
      setData(json.data)
    } catch {
      setError("No se pudo cargar el historial de puntos.")
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, clientId])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 text-sm text-red-600 border border-red-200 rounded-xl">
        {error ?? "Sin datos"}
        <Button size="sm" variant="outline" onClick={load}>
          Reintentar
        </Button>
      </div>
    )
  }

  const summary = [
    { label: "Saldo actual", value: data.balance, tone: "text-primary" },
    { label: "Ganados en total", value: data.totalEarned, tone: "text-emerald-600" },
    { label: "Canjeados en total", value: data.totalRedeemed, tone: "text-purple-600" },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {summary.map((s) => (
          <Card key={s.label} className="border border-border">
            <CardContent className="p-3 text-center">
              <div className={`text-xl font-extrabold tabular-nums ${s.tone}`}>
                {s.value.toLocaleString("es-PE")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-border">
        <CardContent className="p-0">
          {data.movements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              Todavía no tiene movimientos de puntos.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Movimiento</TableHead>
                    <TableHead className="hidden sm:table-cell">Detalle</TableHead>
                    <TableHead className="text-right">Puntos</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="hidden md:table-cell">Atendió</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.movements.map((m) => {
                    const k = KIND[m.kind]
                    const detail = detailOf(m)
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatDateTime(m.at, timezone)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${k.tone}`}
                            >
                              <k.icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">{k.label}</div>
                              {detail && (
                                <div className="text-xs text-muted-foreground sm:hidden truncate">
                                  {detail}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                          {detail || "—"}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${m.amount >= 0 ? "text-emerald-600" : "text-purple-600"}`}
                        >
                          {m.amount >= 0 ? "+" : ""}
                          {m.amount.toLocaleString("es-PE")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-foreground">
                          {m.balanceAfter.toLocaleString("es-PE")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                          {m.by ?? "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
