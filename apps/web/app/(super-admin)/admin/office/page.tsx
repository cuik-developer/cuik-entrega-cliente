"use client"

import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
} from "lucide-react"
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

interface Task {
  id: string
  title: string
  agents: string[]
  status: string
  cronExpression: string | null
  lastRun: string | null
  nextRun: string | null
}

function agentEmoji(id: string) {
  return AGENTS_META.find((a) => a.id === id)?.emoji ?? "\uD83E\uDD16"
}

function agentName(id: string) {
  return AGENTS_META.find((a) => a.id === id)?.name ?? id
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending_approval":
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pendiente</Badge>
    case "approved":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Aprobado</Badge>
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Rechazado</Badge>
    case "running":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Ejecutando</Badge>
    case "failed":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Error</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function OfficeDashboardPage() {
  const [pendingApprovals, setPendingApprovals] = useState<Execution[]>([])
  const [scheduledTasks, setScheduledTasks] = useState<Task[]>([])
  const [recentActivity, setRecentActivity] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [approvalsRes, tasksRes, activityRes] = await Promise.all([
        fetch("/api/office/executions?status=pending_approval"),
        fetch("/api/office/tasks?status=active"),
        fetch("/api/office/executions?status=approved"),
      ])

      const [approvalsData, tasksData, activityData] = await Promise.all([
        approvalsRes.json(),
        tasksRes.json(),
        activityRes.json(),
      ])

      if (approvalsData.success) setPendingApprovals(approvalsData.data)
      if (tasksData.success) setScheduledTasks(tasksData.data)
      if (activityData.success) setRecentActivity(activityData.data.slice(0, 10))
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-[#0e70db]" />
            <h1 className="text-2xl font-bold text-slate-900">Office</h1>
          </div>
          <p className="text-slate-500 mt-1">Orquestacion de agentes IA</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/office/chat">Chat ad-hoc</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/office/tasks/new">
              <Play className="w-4 h-4 mr-2" />
              Nueva tarea
            </Link>
          </Button>
        </div>
      </div>

      {/* Pending Approvals */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            Aprobaciones pendientes
            {pendingApprovals.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 ml-1">
                {pendingApprovals.length}
              </Badge>
            )}
          </h2>
          <Link
            href="/admin/office/approvals"
            className="text-sm text-[#0e70db] hover:underline flex items-center gap-1"
          >
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {pendingApprovals.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-400">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
              No hay aprobaciones pendientes
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {pendingApprovals.slice(0, 5).map((exec) => (
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
      </section>

      {/* Scheduled Tasks */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#0e70db]" />
            Tareas programadas
          </h2>
          <Link
            href="/admin/office/tasks"
            className="text-sm text-[#0e70db] hover:underline flex items-center gap-1"
          >
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {scheduledTasks.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-400">
              No hay tareas programadas
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {scheduledTasks.slice(0, 5).map((task) => (
              <Card key={task.id}>
                <CardContent className="py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {(task.agents as string[]).map((a) => agentEmoji(a)).join("")}
                    </span>
                    <div>
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <p className="text-xs text-slate-400">
                        {task.cronExpression ? `Cron: ${task.cronExpression}` : "Manual"}
                        {task.lastRun &&
                          ` \u00B7 Ultima: ${new Date(task.lastRun).toLocaleString("es-MX")}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.cronExpression && <Clock className="w-4 h-4 text-slate-400" />}
                    <Badge variant="outline" className="text-xs">
                      {(task.agents as string[]).map((a) => agentName(a)).join(" \u2192 ")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          Actividad reciente
        </h2>

        {recentActivity.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-400">
              No hay actividad reciente
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentActivity.map((exec) => (
              <div
                key={exec.id}
                className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <span>{(exec.agentsUsed as string[]).map((a) => agentEmoji(a)).join("")}</span>
                <span className="text-sm text-slate-700 flex-1">{exec.taskTitle}</span>
                <StatusBadge status={exec.status} />
                <span className="text-xs text-slate-400">
                  {new Date(exec.createdAt).toLocaleString("es-MX")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
