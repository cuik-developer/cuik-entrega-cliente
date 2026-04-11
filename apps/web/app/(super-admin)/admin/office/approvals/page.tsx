"use client"

import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AGENTS_META } from "@/lib/office/agents"

interface Execution {
  id: string
  taskId: string
  taskTitle: string
  status: string
  agentsUsed: string[]
  durationMs: number | null
  createdAt: string
}

function agentEmoji(id: string) {
  return AGENTS_META.find((a) => a.id === id)?.emoji ?? "\uD83E\uDD16"
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending_approval":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pendiente</Badge>
    case "approved":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Aprobado</Badge>
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Rechazado</Badge>
    case "failed":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Error</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function ApprovalsPage() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [filter, setFilter] = useState("pending_approval")
  const [loading, setLoading] = useState(true)

  const fetchExecutions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/office/executions?status=${filter}`)
      const data = await res.json()
      if (data.success) setExecutions(data.data)
    } catch (error) {
      console.error("Failed to fetch executions:", error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchExecutions()
  }, [fetchExecutions])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/office">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Aprobaciones</h1>
          <p className="text-slate-500">Revisa y aprueba los resultados de los agentes</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { value: "pending_approval", label: "Pendientes" },
          { value: "approved", label: "Aprobados" },
          { value: "rejected", label: "Rechazados" },
          { value: "failed", label: "Errores" },
        ].map((s) => (
          <Button
            key={s.value}
            variant={filter === s.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s.value)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : executions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
            No hay ejecuciones con este estado
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {executions.map((exec) => (
            <Link key={exec.id} href={`/admin/office/approvals/${exec.id}`}>
              <Card className="hover:border-[#0e70db]/30 transition-colors cursor-pointer">
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {(exec.agentsUsed as string[]).map((a) => agentEmoji(a)).join("")}
                    </span>
                    <div>
                      <p className="font-medium text-slate-900">{exec.taskTitle}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(exec.createdAt).toLocaleString("es-MX")}
                        {exec.durationMs && ` \u00B7 ${(exec.durationMs / 1000).toFixed(1)}s`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={exec.status} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
