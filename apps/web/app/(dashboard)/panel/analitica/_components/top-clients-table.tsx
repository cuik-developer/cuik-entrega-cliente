"use client"

import { ArrowUpDown } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type TopClientRow = {
  id: string
  name: string
  visitCount: number
  tier?: string | null
}

type Props = {
  clients: TopClientRow[]
}

function getTierBadgeClass(tier: string | null | undefined): string {
  switch (tier?.toLowerCase()) {
    case "vip":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-800"
    case "regular":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
    case "nuevo":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-800"
    default:
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700"
  }
}

export function TopClientsTable({ clients }: Props) {
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = [...clients]
    .sort((a, b) => (sortAsc ? a.visitCount - b.visitCount : b.visitCount - a.visitCount))
    .slice(0, 10)

  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold text-foreground">Top 10 clientes</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Sin datos de clientes disponibles.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 font-medium hover:bg-transparent"
                    onClick={() => setSortAsc(!sortAsc)}
                  >
                    Visitas
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>Tier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((client, index) => (
                <TableRow key={client.id}>
                  <TableCell className="text-muted-foreground font-medium">{index + 1}</TableCell>
                  <TableCell className="font-medium text-foreground">{client.name}</TableCell>
                  <TableCell className="font-semibold text-foreground">
                    {client.visitCount}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getTierBadgeClass(client.tier)}>
                      {client.tier ?? "Sin tier"}
                    </Badge>
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
