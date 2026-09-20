import { MetricsDashboard } from "./dashboard/metrics-dashboard"

export const dynamic = "force-dynamic"

export default function MetricasPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Métricas de plataforma
        </h1>
        <p className="text-sm text-slate-500">
          ¿Crece el negocio? ¿Quién necesita atención? ¿Qué hago hoy? Todo comparado con el período
          anterior.
        </p>
      </div>
      <MetricsDashboard />
    </div>
  )
}
