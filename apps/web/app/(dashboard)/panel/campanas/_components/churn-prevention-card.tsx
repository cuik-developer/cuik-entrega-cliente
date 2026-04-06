"use client"

import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Send, UserX } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type AtRiskClient = {
  id: string
  name: string
  lastName: string | null
  lastVisitAt: string | null
  avgDays: number
  daysSinceLastVisit: number
}

interface ChurnPreventionCardProps {
  tenantSlug: string
  onCampaignSent?: () => void
}

export function ChurnPreventionCard({ tenantSlug, onCampaignSent }: ChurnPreventionCardProps) {
  const [atRiskClients, setAtRiskClients] = useState<AtRiskClient[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showList, setShowList] = useState(false)
  const [message, setMessage] = useState("")

  const fetchAtRiskClients = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/${tenantSlug}/churn`)
      const json = await res.json()

      if (res.ok && json.success) {
        setAtRiskClients(json.data.clients)
        setCount(json.data.count)
      }
    } catch {
      // Silently fail — this is a secondary feature
    } finally {
      setIsLoading(false)
    }
  }, [tenantSlug])

  useEffect(() => {
    fetchAtRiskClients()
  }, [fetchAtRiskClients])

  async function handleSend() {
    setShowConfirm(false)
    setIsSending(true)

    try {
      const res = await fetch(`/api/${tenantSlug}/churn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })

      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error ?? "Error al enviar la campana de recuperacion")
        return
      }

      const result = json.data
      toast.success(
        `Campana enviada: ${result.sentCount} notificaciones enviadas de ${result.targetCount} clientes`,
      )
      setMessage("")
      onCampaignSent?.()
      // Refresh the at-risk list
      fetchAtRiskClients()
    } catch {
      toast.error("Error de conexion. Intenta de nuevo.")
    } finally {
      setIsSending(false)
    }
  }

  if (isLoading) {
    return (
      <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
        </CardContent>
      </Card>
    )
  }

  const charCount = message.length

  return (
    <>
      <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-lg">Prevencion de abandono</CardTitle>
                <CardDescription>
                  {count === 0 ? (
                    <span className="text-muted-foreground">
                      No hay clientes en riesgo de abandono
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold text-orange-600 dark:text-orange-400">
                        {count} {count === 1 ? "cliente" : "clientes"}
                      </span>{" "}
                      en riesgo de abandono
                    </>
                  )}
                </CardDescription>
              </div>
            </div>
            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowList(!showList)}
                className="text-muted-foreground"
                type="button"
              >
                {showList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span className="ml-1 text-xs">{showList ? "Ocultar" : "Ver lista"}</span>
              </Button>
            )}
          </div>
        </CardHeader>

        {count > 0 && (
          <CardContent className="space-y-4">
            {/* Expandable client list */}
            {showList && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800 overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-orange-100/50 dark:bg-orange-900/30 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                          Cliente
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                          Frecuencia promedio
                        </th>
                        <th className="text-right px-3 py-2 font-medium text-muted-foreground">
                          Dias sin visitar
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-orange-100 dark:divide-orange-900/30">
                      {atRiskClients.map((client) => (
                        <tr key={client.id}>
                          <td className="px-3 py-2">
                            {client.name}
                            {client.lastName ? ` ${client.lastName}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground">
                            cada {client.avgDays} dias
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-orange-600 dark:text-orange-400">
                            {client.daysSinceLastVisit} dias
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Message input + send button */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Textarea
                  placeholder="Te extranamos! Ven y reclama un 15% en toda la cafeteria"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  maxLength={150}
                  className="resize-none bg-white dark:bg-background"
                />
                <span
                  className={`text-xs ${
                    charCount >= 150
                      ? "text-red-500 font-semibold"
                      : charCount > 130
                        ? "text-orange-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {charCount}/150
                </span>
              </div>
              <Button
                type="button"
                disabled={isSending || message.trim().length === 0}
                onClick={() => setShowConfirm(true)}
                className="bg-orange-600 hover:bg-orange-700 text-white gap-2 shrink-0 self-start"
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar a {count} {count === 1 ? "cliente" : "clientes"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <UserX className="w-5 h-5 text-orange-600" />
              Confirmar envio de recuperacion
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Se enviara una notificacion push a{" "}
                <span className="font-semibold text-foreground">
                  {count} {count === 1 ? "cliente" : "clientes"}
                </span>{" "}
                en riesgo de abandono.
              </span>
              <span className="block rounded-md bg-muted p-3 text-sm italic">
                &ldquo;{message}&rdquo;
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSend}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Enviar campana
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
