"use client"

import Link from "next/link"
import type { TenantChurnRow } from "@/lib/admin/platform-metrics"
import {
  APPLE_REMOVAL_TRACKING_SINCE_LABEL,
  CHURN_HELP,
  CHURN_LABEL,
  CHURN_LABEL_SHORT,
  formatChurnRate,
} from "@/lib/wallet/pass-churn"

/** Tenants ranked by tasa de eliminación de tarjetas (current state, not the period). */
export function ChurnTable({ rows }: { rows: TenantChurnRow[] }) {
  return (
    <div className="rounded-[4px] border border-ent-line bg-white p-5">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-ent-fg-2">{CHURN_LABEL}</h3>
        <p className="text-xs text-ent-fg-3">
          {CHURN_HELP} Hoy, no depende del periodo. Apple: medido desde el{" "}
          {APPLE_REMOVAL_TRACKING_SINCE_LABEL}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ent-fg-3 border-b border-ent-line">
              <th className="pb-2 text-left font-semibold">Comercio</th>
              <th className="pb-2 text-right font-semibold">Instaladas</th>
              <th className="pb-2 text-right font-semibold">Eliminadas</th>
              <th className="pb-2 text-right font-semibold whitespace-nowrap" title={CHURN_HELP}>
                {CHURN_LABEL_SHORT}
              </th>
              <th className="pb-2 text-right font-semibold whitespace-nowrap" title={CHURN_HELP}>
                30 días
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sm text-ent-fg-3">
                  Sin comercios en el filtro.
                </td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-ent-panel-2">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/admin/tenants?q=${encodeURIComponent(t.name)}`}
                      className="font-medium text-ent-fg hover:text-ent-accent hover:underline"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{t.installed}</td>
                  <td className="py-2 text-right tabular-nums">
                    {t.removed}
                    {t.removed30d > 0 && (
                      <span className="text-[11px] text-ent-fg-3"> ({t.removed30d} en 30 d)</span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold">
                    {formatChurnRate(t.rate)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatChurnRate(t.rate30d)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
