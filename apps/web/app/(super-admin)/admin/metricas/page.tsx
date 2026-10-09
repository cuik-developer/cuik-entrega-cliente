import { MetricsDashboard } from "./dashboard/metrics-dashboard"

export const dynamic = "force-dynamic"

export default function MetricasPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[17px] leading-6 font-semibold text-ent-fg tracking-[-0.005em]">
          Métricas de plataforma
        </h1>
        <p className="text-sm text-ent-fg-3">
          ¿Crece el negocio? ¿Quién necesita atención? ¿Qué hago hoy? Todo comparado con el período
          anterior.
        </p>
      </div>
      <MetricsDashboard />
    </div>
  )
}
