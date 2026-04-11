"use client"

import { Archive, ArrowLeft, Loader2, MoreHorizontal, Pause, Play, Plus } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { AGENTS_META } from "@/lib/office/agents"

interface Task {
  id: string
  type: string
  title: string
  agents: string[]
  prompt: string
  cronExpression: string | null
  recipients: string[] | null
  requiresApproval: boolean
  status: string
  lastRun: string | null
  nextRun: string | null
  createdAt: string
}

function agentEmoji(id: string) {
  return AGENTS_META.find((a) => a.id === id)?.emoji ?? "\uD83E\uDD16"
}

function agentName(id: string) {
  return AGENTS_META.find((a) => a.id === id)?.name ?? id
}

export default function TasksListPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState<"active" | "paused" | "archived">("active")
  const [loading, setLoading] = useState(true)
  const [runningTask, setRunningTask] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/office/tasks?status=${filter}`)
      const data = await res.json()
      if (data.success) setTasks(data.data)
    } catch (error) {
      console.error("Failed to fetch tasks:", error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  async function runTask(taskId: string) {
    setRunningTask(taskId)
    try {
      await fetch(`/api/office/tasks/${taskId}/run`, { method: "POST" })
      await fetchTasks()
    } catch (error) {
      console.error("Failed to run task:", error)
    } finally {
      setRunningTask(null)
    }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    try {
      await fetch(`/api/office/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      await fetchTasks()
    } catch (error) {
      console.error("Failed to update task:", error)
    }
  }

  async function archiveTask(taskId: string) {
    try {
      await fetch(`/api/office/tasks/${taskId}`, { method: "DELETE" })
      await fetchTasks()
    } catch (error) {
      console.error("Failed to archive task:", error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin/office">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Tareas</h1>
            <p className="text-slate-500">Tareas programadas y manuales</p>
          </div>
        </div>
        <Button asChild>
          <Link href="/admin/office/tasks/new">
            <Plus className="w-4 h-4 mr-2" />
            Nueva tarea
          </Link>
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["active", "paused", "archived"] as const).map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s === "active" ? "Activas" : s === "paused" ? "Pausadas" : "Archivadas"}
          </Button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-slate-400">
            No hay tareas{" "}
            {filter === "active" ? "activas" : filter === "paused" ? "pausadas" : "archivadas"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">
                      {(task.agents as string[]).map((a) => agentEmoji(a)).join("")}
                    </span>
                    <div>
                      <p className="font-medium text-slate-900">{task.title}</p>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.prompt}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {task.type === "collaborative" ? "Colaborativo" : "Individual"}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {(task.agents as string[]).map((a) => agentName(a)).join(" \u2192 ")}
                        </Badge>
                        {task.cronExpression && (
                          <Badge variant="outline" className="text-xs">
                            Cron: {task.cronExpression}
                          </Badge>
                        )}
                        {task.requiresApproval && (
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Requiere aprobacion
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {filter !== "archived" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runTask(task.id)}
                        disabled={runningTask === task.id}
                      >
                        {runningTask === task.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        <span className="ml-1">Ejecutar</span>
                      </Button>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {task.status === "active" && (
                          <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "paused")}>
                            <Pause className="w-4 h-4 mr-2" /> Pausar
                          </DropdownMenuItem>
                        )}
                        {task.status === "paused" && (
                          <DropdownMenuItem onClick={() => updateTaskStatus(task.id, "active")}>
                            <Play className="w-4 h-4 mr-2" /> Activar
                          </DropdownMenuItem>
                        )}
                        {task.status !== "archived" && (
                          <DropdownMenuItem
                            onClick={() => archiveTask(task.id)}
                            className="text-red-600"
                          >
                            <Archive className="w-4 h-4 mr-2" /> Archivar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
