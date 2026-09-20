"use client"

import type { TopRewardRow } from "@cuik/shared/types/analytics"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/format-date"

type Props = {
  rewards: TopRewardRow[]
  timezone: string
}

/** Premios más canjeados en el período. Orienta qué destacar u ocultar en la página de premios. */
export function TopRewardsTable({ rewards, timezone }: Props) {
  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">Premios más canjeados</CardTitle>
        <p className="text-xs text-muted-foreground">
          En el período elegido. Lo que nadie canjea conviene revisarlo o quitarlo del catálogo.
        </p>
      </CardHeader>
      <CardContent>
        {rewards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Todavía no hay canjes en este período.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Premio</TableHead>
                <TableHead className="text-right">Canjes</TableHead>
                <TableHead className="text-right">Puntos</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Último</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rewards.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{r.count}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {r.points.toLocaleString("es-PE")}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground hidden sm:table-cell">
                    {r.lastAt ? formatDateTime(r.lastAt, timezone) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
