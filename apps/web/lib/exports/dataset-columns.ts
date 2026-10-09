/**
 * Datasets and columns of the "Exportar datos" page, shared by the UI (column
 * picker) and the server builder. Client-safe: no database imports here.
 */

export type DatasetKey = "clients" | "visits" | "points"

/** Loyalty program of the tenant; null while unknown or without an active program. */
export type ProgramType = "stamps" | "points"

export type ColumnDef = {
  key: string
  label: string
  /** Excel column width in characters. */
  width?: number
  /** Group heading in the picker. */
  group: string
  /** Only meaningful for this program; hidden (and ignored) for the other. */
  program?: ProgramType
}

export type DatasetDef = {
  key: DatasetKey
  label: string
  description: string
  /** Whether the date filter applies (visits and points are events). */
  dated: boolean
  /** Only offered to tenants with this program. */
  program?: ProgramType
  columns: ColumnDef[]
}

const CLIENT_IDENTITY: ColumnDef[] = [
  { key: "name", label: "Nombre", width: 18, group: "Cliente" },
  { key: "lastName", label: "Apellido", width: 18, group: "Cliente" },
  { key: "email", label: "Email", width: 28, group: "Cliente" },
  { key: "phone", label: "Teléfono", width: 16, group: "Cliente" },
  { key: "dni", label: "DNI", width: 12, group: "Cliente" },
]

export const DATASETS: DatasetDef[] = [
  {
    key: "clients",
    label: "Clientes",
    description: "Una fila por cliente, con su actividad, su segmento y el estado de su pase.",
    dated: false,
    columns: [
      ...CLIENT_IDENTITY,
      { key: "status", label: "Estado", width: 12, group: "Cliente" },
      { key: "birthday", label: "Cumpleaños", width: 12, group: "Cliente" },
      { key: "marketingOptIn", label: "Acepta marketing", width: 16, group: "Cliente" },
      { key: "createdAt", label: "Fecha de registro", width: 18, group: "Cliente" },
      { key: "totalVisits", label: "Visitas totales", width: 14, group: "Actividad" },
      { key: "lastVisitAt", label: "Última visita", width: 18, group: "Actividad" },
      {
        key: "avgDaysBetweenVisits",
        label: "Días promedio entre visitas",
        width: 24,
        group: "Actividad",
      },
      {
        key: "daysSinceLastVisit",
        label: "Días desde la última visita",
        width: 24,
        group: "Actividad",
      },
      {
        key: "currentCycle",
        label: "Ciclo actual",
        width: 12,
        group: "Actividad",
        program: "stamps",
      },
      {
        key: "pointsBalance",
        label: "Puntos disponibles",
        width: 16,
        group: "Actividad",
        program: "points",
      },
      {
        key: "avgPointsPerVisit",
        label: "Puntos promedio por visita",
        width: 22,
        group: "Actividad",
        program: "points",
      },
      { key: "tier", label: "Nivel", width: 12, group: "Actividad" },
      { key: "segment", label: "Segmento", width: 14, group: "Actividad" },
      { key: "tags", label: "Etiquetas", width: 24, group: "Actividad" },
      { key: "passStatus", label: "Estado del pase", width: 16, group: "Pase" },
      { key: "walletPlatform", label: "Plataforma", width: 14, group: "Pase" },
      { key: "passInstalledAt", label: "Pase instalado el", width: 18, group: "Pase" },
      { key: "passRemovedAt", label: "Pase eliminado el", width: 18, group: "Pase" },
    ],
  },
  {
    key: "visits",
    label: "Visitas",
    description: "Una fila por visita registrada, con el cliente, el local y quién la registró.",
    dated: true,
    columns: [
      { key: "createdAt", label: "Fecha y hora", width: 18, group: "Visita" },
      {
        key: "visitNum",
        label: "N° de visita (sello)",
        width: 18,
        group: "Visita",
        program: "stamps",
      },
      { key: "cycleNumber", label: "Ciclo", width: 8, group: "Visita", program: "stamps" },
      {
        key: "points",
        label: "Puntos de la visita",
        width: 16,
        group: "Visita",
        program: "points",
      },
      { key: "amount", label: "Monto", width: 12, group: "Visita" },
      { key: "source", label: "Origen", width: 10, group: "Visita" },
      { key: "locationName", label: "Local", width: 18, group: "Visita" },
      { key: "cashierName", label: "Registrada por", width: 20, group: "Visita" },
      ...CLIENT_IDENTITY,
      {
        key: "clientCreatedAt",
        label: "Fecha de registro del cliente",
        width: 24,
        group: "Cliente",
      },
      { key: "walletPlatform", label: "Plataforma", width: 14, group: "Cliente" },
    ],
  },
  {
    key: "points",
    label: "Movimientos de puntos",
    description: "Una fila por movimiento: puntos ganados, canjeados, vencidos o ajustados.",
    dated: true,
    program: "points",
    columns: [
      { key: "createdAt", label: "Fecha y hora", width: 18, group: "Movimiento" },
      { key: "type", label: "Tipo", width: 12, group: "Movimiento" },
      { key: "amount", label: "Puntos", width: 10, group: "Movimiento" },
      { key: "description", label: "Detalle", width: 30, group: "Movimiento" },
      { key: "expiresAt", label: "Vencen el", width: 14, group: "Movimiento" },
      { key: "remaining", label: "Restantes del lote", width: 16, group: "Movimiento" },
      { key: "locationName", label: "Local", width: 18, group: "Movimiento" },
      ...CLIENT_IDENTITY,
    ],
  },
]

export function datasetByKey(key: string): DatasetDef | undefined {
  return DATASETS.find((d) => d.key === key)
}

/** Datasets a tenant with this program can export (unknown program: all). */
export function datasetsFor(program: ProgramType | null | undefined): DatasetDef[] {
  return DATASETS.filter((d) => !d.program || !program || d.program === program)
}

/** Columns of a dataset that make sense for this program (unknown program: all). */
export function columnsFor(def: DatasetDef, program: ProgramType | null | undefined): ColumnDef[] {
  return def.columns.filter((c) => !c.program || !program || c.program === program)
}

export const CLIENT_STATUS_OPTIONS = [
  ["all", "Todos (menos eliminados)"],
  ["active", "Activos"],
  ["inactive", "Inactivos"],
  ["blocked", "Bloqueados"],
  ["archived", "Archivados"],
] as const

export type ClientStatusFilter = (typeof CLIENT_STATUS_OPTIONS)[number][0]
