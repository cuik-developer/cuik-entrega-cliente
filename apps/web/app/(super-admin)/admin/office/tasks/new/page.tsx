"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AGENTS_META } from "@/lib/office/agents"

export default function NewTaskPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState("")
  const [prompt, setPrompt] = useState("")
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [type, setType] = useState<"single" | "collaborative">("single")
  const [cronExpression, setCronExpression] = useState("")
  const [recipients, setRecipients] = useState("")
  const [requiresApproval, setRequiresApproval] = useState(true)

  function toggleAgent(agentId: string) {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((a) => a !== agentId) : [...prev, agentId],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim() || !prompt.trim() || selectedAgents.length === 0) {
      setError("Titulo, prompt y al menos un agente son requeridos")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/office/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          prompt: prompt.trim(),
          agents: selectedAgents,
          type: selectedAgents.length > 1 ? type : "single",
          cronExpression: cronExpression.trim() || null,
          recipients: recipients.trim()
            ? recipients.split(",").map((r) => r.trim()).filter(Boolean)
            : null,
          requiresApproval,
        }),
      })

      const data = await res.json()
      if (data.success) {
        router.push("/admin/office/tasks")
      } else {
        setError(data.error ?? "Error al crear la tarea")
      }
    } catch {
      setError("Error de conexion")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/office/tasks">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nueva tarea</h1>
          <p className="text-slate-500">Configura una tarea para los agentes</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informacion basica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Titulo</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Newsletter semanal de promociones"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe lo que el agente debe hacer..."
                rows={6}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Agents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {AGENTS_META.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                    selectedAgents.includes(agent.id)
                      ? "border-[#0e70db] bg-blue-50"
                      : "border-slate-200 hover:border-slate-300"
                  } ${!agent.active ? "opacity-50" : ""}`}
                  disabled={!agent.active}
                >
                  <span className="text-2xl">{agent.emoji}</span>
                  <div>
                    <p className="font-medium text-slate-900">{agent.name}</p>
                    <p className="text-xs text-slate-500">{agent.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {selectedAgents.length > 1 && (
              <div className="pt-2">
                <label className="text-sm font-medium text-slate-700">Tipo de ejecucion</label>
                <div className="flex gap-3 mt-2">
                  <Button
                    type="button"
                    variant={type === "single" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setType("single")}
                  >
                    Individual (solo el primero)
                  </Button>
                  <Button
                    type="button"
                    variant={type === "collaborative" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setType("collaborative")}
                  >
                    Colaborativo (en secuencia)
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schedule & Options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Programacion y opciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Cron (opcional)</label>
              <Input
                value={cronExpression}
                onChange={(e) => setCronExpression(e.target.value)}
                placeholder="Ej: 0 9 * * 1 (lunes a las 9am)"
                className="mt-1"
              />
              <p className="text-xs text-slate-400 mt-1">Dejar vacio para ejecucion manual</p>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Destinatarios (opcional)</label>
              <Input
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                placeholder="email1@ejemplo.com, email2@ejemplo.com"
                className="mt-1"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="requires-approval"
                checked={requiresApproval}
                onCheckedChange={(checked) => setRequiresApproval(checked === true)}
              />
              <label htmlFor="requires-approval" className="text-sm text-slate-700">
                Requiere aprobacion antes de enviar
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href="/admin/office/tasks">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Crear tarea
          </Button>
        </div>
      </form>
    </div>
  )
}
