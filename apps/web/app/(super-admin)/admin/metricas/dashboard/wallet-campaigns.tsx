"use client"

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts"
import type { PlatformMetrics } from "@/lib/admin/platform-metrics"

function weekLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(y, m - 1, d, 12).toLocaleDateString("es-PE", { day: "numeric", month: "short" })
}

/** Wallet split + weekly Apple installs, and campaign delivery for the period. */
export function WalletCampaigns({
  wallet,
  campaigns,
}: {
  wallet: PlatformMetrics["wallet"]
  campaigns: PlatformMetrics["campaigns"]
}) {
  const total = wallet.apple + wallet.google + wallet.none
  const seg = [
    { key: "apple", label: "Apple Wallet", value: wallet.apple, color: "#0f172a" },
    { key: "google", label: "Google Wallet", value: wallet.google, color: "#0e70db" },
    { key: "none", label: "Sin pase", value: wallet.none, color: "#cbd5e1" },
  ]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
      <div>
        <h3 className="text-sm font-bold text-slate-700">Pases y campañas</h3>
        <p className="text-xs text-slate-400">
          Apple se detecta al instalar; Google se asume por el enlace de guardado.
        </p>
      </div>

      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {seg.map((s) => (
            <div
              key={s.key}
              style={{ width: `${total ? (s.value / total) * 100 : 0}%`, backgroundColor: s.color }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {seg.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.label} <strong className="tabular-nums">{s.value}</strong>
              <span className="text-slate-400">
                {total ? `${Math.round((s.value / total) * 100)}%` : "0%"}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">
          Instalaciones Apple por semana (últimas 8)
        </p>
        {wallet.installsWeekly.length === 0 ? (
          <p className="text-xs text-slate-400 py-4">Sin instalaciones registradas.</p>
        ) : (
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={wallet.installsWeekly.map((w) => ({ ...w, label: weekLabel(w.week) }))}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={(v: number) => [v, "Instalaciones"]}
                />
                <Bar
                  dataKey="count"
                  fill="#0e70db"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
        <div>
          <p className="text-xl font-extrabold text-slate-900 tabular-nums">{campaigns.sent}</p>
          <p className="text-[11px] text-slate-500">campañas enviadas</p>
        </div>
        <div>
          <p className="text-xl font-extrabold text-slate-900 tabular-nums">
            {campaigns.notifications.toLocaleString("es-PE")}
          </p>
          <p className="text-[11px] text-slate-500">notificaciones</p>
        </div>
        <div>
          <p
            className={`text-xl font-extrabold tabular-nums ${campaigns.deliveryRate !== null && campaigns.deliveryRate < 80 ? "text-amber-600" : "text-slate-900"}`}
          >
            {campaigns.deliveryRate === null ? "—" : `${campaigns.deliveryRate}%`}
          </p>
          <p className="text-[11px] text-slate-500">
            entregadas{campaigns.failed ? ` · ${campaigns.failed} fallidas` : ""}
          </p>
        </div>
      </div>
    </div>
  )
}
