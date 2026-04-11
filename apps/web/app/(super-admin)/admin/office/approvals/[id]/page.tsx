"use client"

import { ArrowLeft, CheckCircle2, Clock, Copy, Download, Loader2, XCircle } from "lucide-react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AGENTS_META } from "@/lib/office/agents"

interface ExecutionDetail {
  id: string
  taskId: string
  taskTitle: string
  taskPrompt: string
  status: string
  output: unknown
  agentLogs: Record<string, unknown>[]
  agentsUsed: string[]
  durationMs: number | null
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
}

function agentEmoji(id: string) {
  return AGENTS_META.find((a) => a.id === id)?.emoji ?? "\uD83E\uDD16"
}

function agentName(id: string) {
  return AGENTS_META.find((a) => a.id === id)?.name ?? id
}

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const _router = useRouter()
  const [execution, setExecution] = useState<ExecutionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchExecution = useCallback(async () => {
    try {
      const res = await fetch(`/api/office/executions/${id}`)
      const data = await res.json()
      if (data.success) setExecution(data.data)
    } catch (error) {
      console.error("Failed to fetch execution:", error)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchExecution()
  }, [fetchExecution])

  async function handleAction(action: "approve" | "reject") {
    setActing(true)
    try {
      const res = await fetch(`/api/office/executions/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        await fetchExecution()
      }
    } catch (error) {
      console.error("Failed to act on execution:", error)
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!execution) {
    return <div className="text-center py-12 text-slate-400">Ejecucion no encontrada</div>
  }

  const rawOutput = execution.output as Record<string, unknown> | string | null
  const outputText =
    typeof rawOutput === "string"
      ? rawOutput
      : rawOutput && typeof rawOutput === "object" && "text" in rawOutput
        ? String(rawOutput.text)
        : JSON.stringify(rawOutput, null, 2)

  const attachments =
    rawOutput && typeof rawOutput === "object" && "attachments" in rawOutput
      ? (rawOutput.attachments as Array<{ name: string; url: string }>)
      : []

  function copyOutput() {
    navigator.clipboard.writeText(outputText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/office/approvals">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{execution.taskTitle}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-slate-500">
                {(execution.agentsUsed as string[])
                  .map((a) => `${agentEmoji(a)} ${agentName(a)}`)
                  .join(" \u2192 ")}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-sm text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {execution.durationMs ? `${(execution.durationMs / 1000).toFixed(1)}s` : "\u2014"}
              </span>
            </div>
          </div>
        </div>

        {execution.status === "pending_approval" && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleAction("reject")}
              disabled={acting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Rechazar
            </Button>
            <Button
              onClick={() => handleAction("approve")}
              disabled={acting}
              className="bg-green-600 hover:bg-green-700"
            >
              {acting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Aprobar
            </Button>
          </div>
        )}

        {execution.status === "approved" && (
          <Badge className="bg-green-100 text-green-800 border-green-200 text-sm py-1 px-3">
            Aprobado
          </Badge>
        )}
        {execution.status === "rejected" && (
          <Badge className="bg-red-100 text-red-800 border-red-200 text-sm py-1 px-3">
            Rechazado
          </Badge>
        )}
      </div>

      {/* Prompt */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompt de la tarea</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-lg">
            {execution.taskPrompt}
          </pre>
        </CardContent>
      </Card>

      {/* Output */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Output del agente</CardTitle>
          <Button variant="ghost" size="sm" onClick={copyOutput}>
            <Copy className="w-3 h-3 mr-1" />
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-lg max-h-96 overflow-y-auto">
              {outputText}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Agent Logs */}
      {/* Attachments */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Archivos adjuntos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {attachments.map((att) => (
                <a key={att.url} href={att.url} download={att.name}>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    {att.name}
                  </Button>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {execution.agentLogs && execution.agentLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Logs de agentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {execution.agentLogs.map((log, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs font-mono bg-slate-50 p-2 rounded"
                >
                  {"agent" in log && <span>{agentEmoji(String(log.agent))}</span>}
                  <span className="text-slate-500">{String(log.event)}</span>
                  {"model" in log && (
                    <Badge variant="outline" className="text-xs">
                      {String(log.model)}
                    </Badge>
                  )}
                  {"error" in log && <span className="text-red-600">{String(log.error)}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
