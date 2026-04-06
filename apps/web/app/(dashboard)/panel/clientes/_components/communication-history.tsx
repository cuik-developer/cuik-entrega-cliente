"use client"

import { Loader2, Mail, MessageSquare, Send } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type CommunicationEntry = {
  notificationId: string
  campaignId: string
  campaignName: string
  channel: string
  status: string
  sentAt: string | null
  error: string | null
}

type CommunicationHistoryProps = {
  clientId: string
  tenantSlug: string
}

const statusConfig: Record<string, { label: string; className: string }> = {
  sent: {
    label: "Enviado",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  delivered: {
    label: "Entregado",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  failed: {
    label: "Fallido",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  pending: {
    label: "Pendiente",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
}

const channelConfig: Record<string, { label: string; className: string; icon: typeof Mail }> = {
  wallet_push: {
    label: "Wallet Push",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    icon: Send,
  },
  email: {
    label: "Email",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    icon: Mail,
  },
}

export function CommunicationHistory({ clientId, tenantSlug }: CommunicationHistoryProps) {
  const [entries, setEntries] = useState<CommunicationEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCommunications = useCallback(async () => {
    try {
      const res = await fetch(`/api/${tenantSlug}/clients/${clientId}/communications`)
      const json = await res.json()
      if (json.success) {
        setEntries(json.data ?? [])
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [tenantSlug, clientId])

  useEffect(() => {
    fetchCommunications()
  }, [fetchCommunications])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    const date = new Date(dateStr)
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">No hay comunicaciones registradas</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const status = statusConfig[entry.status] ?? {
          label: entry.status,
          className: "bg-muted text-muted-foreground",
        }
        const channel = channelConfig[entry.channel] ?? {
          label: entry.channel,
          className: "bg-muted text-muted-foreground",
          icon: MessageSquare,
        }
        const ChannelIcon = channel.icon

        return (
          <Card key={entry.notificationId} className="border border-border">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    <ChannelIcon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {entry.campaignName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(entry.sentAt)}
                    </p>
                    {entry.error && (
                      <p className="text-xs text-destructive mt-1">Error: {entry.error}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className={`text-xs ${channel.className}`}>{channel.label}</Badge>
                  <Badge className={`text-xs ${status.className}`}>{status.label}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
