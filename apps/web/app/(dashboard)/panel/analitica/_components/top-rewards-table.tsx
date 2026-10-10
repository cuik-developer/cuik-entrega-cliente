"use client"

import type { TopRewardRow } from "@cuik/shared/types/analytics"

import {
  DataTable,
  Panel,
  PanelHeader,
  PanelMessage,
  Td,
  Th,
  Tr,
} from "@/components/admin/enterprise"
import { formatDateTime } from "@/lib/format-date"

type Props = {
  rewards: TopRewardRow[]
  timezone: string
}

/** Premios más canjeados en el período. Orienta qué destacar u ocultar en la página de premios. */
export function TopRewardsTable({ rewards, timezone }: Props) {
  return (
    <Panel>
      <PanelHeader
        title="Premios más canjeados"
        actions={<span className="text-[11.5px] text-ent-fg-3">En el período</span>}
      />
      {rewards.length === 0 ? (
        <PanelMessage>Todavía no hay canjes en este período.</PanelMessage>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Premio</Th>
              <Th align="right">Canjes</Th>
              <Th align="right">Puntos</Th>
              <Th align="right" className="hidden sm:table-cell">
                Último
              </Th>
            </tr>
          </thead>
          <tbody>
            {rewards.map((r) => (
              <Tr key={r.id}>
                <Td className="text-ent-fg">{r.name}</Td>
                <Td align="right" className="font-semibold text-ent-fg">
                  {r.count}
                </Td>
                <Td align="right" className="text-ent-fg-2">
                  {r.points.toLocaleString("es-PE")}
                </Td>
                <Td align="right" className="text-[12px] text-ent-fg-3 hidden sm:table-cell">
                  {r.lastAt ? formatDateTime(r.lastAt, timezone) : "—"}
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Panel>
  )
}
