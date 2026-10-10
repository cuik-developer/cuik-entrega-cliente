"use client"

import { ChevronDown, ChevronUp, Loader2, Send } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import {
  DataTable,
  Panel,
  PanelHeader,
  StatusChip,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
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
import { Textarea } from "@/components/ui/textarea"
import { useTenant } from "@/hooks/use-tenant"

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

/**
 * "Prevención de abandono": a one-shot push to the clients that stopped
 * coming. It stays in Campañas because it is a send, not a setting; the
 * resulting campaign shows up in the list below.
 */
export function ChurnPreventionCard({ tenantSlug, onCampaignSent }: ChurnPreventionCardProps) {
  const { readOnly } = useTenant()
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
        toast.error(json.error ?? "Error al enviar la campaña de recuperación")
        return
      }

      const result = json.data
      toast.success(
        `Campaña enviada: ${result.sentCount} notificaciones enviadas de ${result.targetCount} clientes`,
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

  // Nothing to recover: the block disappears instead of taking space.
  if (!isLoading && count === 0) return null

  const charCount = message.length
  const who = `${count} ${count === 1 ? "cliente" : "clientes"}`

  return (
    <>
      <Panel>
        <PanelHeader
          title={
            <span className="flex items-center gap-2">
              Prevención de abandono
              {!isLoading && <StatusChip tone="bad">{who} en riesgo</StatusChip>}
            </span>
          }
          actions={
            !isLoading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowList(!showList)}
                className="h-6 text-[12px] text-ent-fg-2 gap-1"
                type="button"
              >
                {showList ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                {showList ? "Ocultar lista" : "Ver lista"}
              </Button>
            )
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-ent-fg-3" />
          </div>
        ) : (
          <>
            {showList && (
              <div className="max-h-48 overflow-y-auto border-b border-ent-line">
                <DataTable>
                  <thead>
                    <tr>
                      <Th>Cliente</Th>
                      <Th align="right">Frecuencia promedio</Th>
                      <Th align="right">Días sin visitar</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {atRiskClients.map((client) => (
                      <Tr key={client.id}>
                        <Td>
                          {client.name}
                          {client.lastName ? ` ${client.lastName}` : ""}
                        </Td>
                        <Td align="right" className="text-ent-fg-2">
                          cada {client.avgDays} días
                        </Td>
                        <Td align="right" className="text-ent-bad font-medium">
                          {client.daysSinceLastVisit} días
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}

            <div className="p-3 flex flex-col sm:flex-row gap-2 text-[12.5px]">
              <div className="flex-1 space-y-1">
                <Textarea
                  placeholder="Te extrañamos. Ven y reclama un 15% en toda la cafetería"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  maxLength={150}
                  className="resize-none text-[12.5px]"
                  disabled={readOnly}
                  aria-label="Mensaje de recuperación"
                />
                <div className="flex items-center justify-between text-[11px] text-ent-fg-3">
                  <span>Push a los {who} que dejaron de venir.</span>
                  <span
                    className={
                      charCount >= 150
                        ? "text-ent-bad font-semibold"
                        : charCount > 130
                          ? "text-ent-warn"
                          : ""
                    }
                  >
                    {charCount}/150
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={isSending || message.trim().length === 0 || readOnly}
                title={readOnly ? "Solo lectura" : undefined}
                onClick={() => setShowConfirm(true)}
                className="h-7 text-[12px] gap-1.5 shrink-0 self-start"
              >
                {isSending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Enviar a {who}
              </Button>
            </div>
          </>
        )}
      </Panel>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent className="ent">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">
              Confirmar envío de recuperación
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-[12.5px]">
              <span className="block">
                Se enviará una notificación push a{" "}
                <span className="font-semibold text-ent-fg">{who}</span> en riesgo de abandono.
              </span>
              <span className="block border border-ent-line rounded-[4px] bg-ent-panel-2 p-3 italic">
                &ldquo;{message}&rdquo;
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-7 text-[12px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend} className="h-7 text-[12px]">
              Enviar campaña
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
