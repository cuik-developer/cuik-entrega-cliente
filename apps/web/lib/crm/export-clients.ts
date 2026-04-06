import { and, clients, clientTagAssignments, clientTags, db, eq, sql } from "@cuik/db"
import type { ClientExportInput } from "@cuik/shared/validators/crm-schema"
import ExcelJS from "exceljs"
import { formatDateForExport } from "@/lib/format-date"
import type { SegmentationThresholds } from "@/lib/loyalty/client-segments"
import { computeClientSegment, getThresholds, SEGMENT_LABELS } from "@/lib/loyalty/client-segments"

const BATCH_SIZE = 500

const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Nombre", key: "name", width: 20 },
  { header: "Apellido", key: "lastName", width: 20 },
  { header: "Email", key: "email", width: 28 },
  { header: "Teléfono", key: "phone", width: 18 },
  { header: "Estado", key: "status", width: 12 },
  { header: "Tier", key: "tier", width: 10 },
  { header: "Visitas totales", key: "totalVisits", width: 16 },
  { header: "Ciclo actual", key: "currentCycle", width: 14 },
  { header: "Marketing", key: "marketingOptIn", width: 12 },
  { header: "Segmento", key: "segment", width: 18 },
  { header: "Tags", key: "tags", width: 24 },
  { header: "Fecha registro", key: "createdAt", width: 22 },
]

/**
 * Exports clients as an xlsx Buffer using exceljs with cursor-based pagination.
 * Memory usage is bounded by batch size.
 */
export async function exportClientsXlsx(
  tenantId: string,
  filters?: Omit<ClientExportInput, "format">,
  thresholds?: SegmentationThresholds,
  timezone?: string,
): Promise<Buffer> {
  const tz = timezone ?? "America/Lima"
  const segThresholds = thresholds ?? getThresholds()

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("Clientes")
  sheet.columns = COLUMNS

  // Style header row
  const headerRow = sheet.getRow(1)
  headerRow.font = { bold: true }
  headerRow.alignment = { horizontal: "center" }

  let lastId: string | null = null
  let hasMore = true

  while (hasMore) {
    const rows = await fetchBatch(tenantId, filters, lastId)

    if (rows.length === 0) {
      hasMore = false
      break
    }

    // Fetch tags for all clients in this batch
    const clientIds = rows.map((r) => r.id)
    const tagMap = await fetchTagsForClients(clientIds)

    for (const row of rows) {
      const tags = tagMap.get(row.id) ?? ""
      const segment = computeClientSegment(
        {
          createdAt: row.createdAt,
          totalVisits: row.totalVisits,
          lastVisitAt: row.lastVisitAt,
          avgDaysBetweenVisits: row.avgDaysBetweenVisits,
        },
        segThresholds,
      )

      sheet.addRow({
        name: row.name,
        lastName: row.lastName ?? "",
        email: row.email ?? "",
        phone: row.phone ?? "",
        status: row.status,
        tier: row.tier ?? "",
        totalVisits: row.totalVisits,
        currentCycle: row.currentCycle,
        marketingOptIn: row.marketingOptIn ? "Sí" : "No",
        segment: SEGMENT_LABELS[segment as keyof typeof SEGMENT_LABELS] ?? segment,
        tags,
        createdAt: formatDateForExport(row.createdAt, tz),
      })
    }

    lastId = rows[rows.length - 1].id
    hasMore = rows.length === BATCH_SIZE
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

type ClientRow = {
  id: string
  name: string
  lastName: string | null
  email: string | null
  phone: string | null
  status: string
  tier: string | null
  totalVisits: number
  currentCycle: number
  marketingOptIn: boolean
  lastVisitAt: Date | null
  avgDaysBetweenVisits: number | null
  createdAt: Date
}

async function fetchBatch(
  tenantId: string,
  filters: Omit<ClientExportInput, "format"> | undefined,
  lastId: string | null,
): Promise<ClientRow[]> {
  const conditions: ReturnType<typeof eq>[] = [eq(clients.tenantId, tenantId)]

  if (filters?.status) {
    conditions.push(eq(clients.status, filters.status))
  }

  if (filters?.tier) {
    conditions.push(sql`${clients.tier} = ${filters.tier}`)
  }

  if (filters?.createdFrom) {
    conditions.push(sql`${clients.createdAt} >= ${filters.createdFrom}::date`)
  }

  if (filters?.createdTo) {
    conditions.push(sql`${clients.createdAt} < (${filters.createdTo}::date + INTERVAL '1 day')`)
  }

  if (filters?.tagIds) {
    const tagIdArray = filters.tagIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
    if (tagIdArray.length > 0) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM loyalty.client_tag_assignments
          WHERE "client_id" = ${clients.id}
            AND "tag_id" IN (${sql.join(
              tagIdArray.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})
        )`,
      )
    }
  }

  if (lastId) {
    conditions.push(sql`${clients.id} > ${lastId}`)
  }

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      lastName: clients.lastName,
      email: clients.email,
      phone: clients.phone,
      status: clients.status,
      tier: clients.tier,
      totalVisits: clients.totalVisits,
      currentCycle: clients.currentCycle,
      marketingOptIn: clients.marketingOptIn,
      createdAt: clients.createdAt,
      lastVisitAt:
        sql<Date | null>`(SELECT max(created_at) FROM loyalty.visits WHERE client_id = ${clients.id})`.as(
          "last_visit_at",
        ),
      avgDaysBetweenVisits: sql<number | null>`(
          SELECT CASE WHEN count(*) < 2 THEN NULL
          ELSE EXTRACT(EPOCH FROM (max(created_at) - min(created_at))) / NULLIF(count(*) - 1, 0) / 86400.0
          END FROM loyalty.visits WHERE client_id = ${clients.id}
        )`.as("avg_days_between_visits"),
    })
    .from(clients)
    .where(and(...conditions))
    .orderBy(clients.id)
    .limit(BATCH_SIZE)

  return rows
}

async function fetchTagsForClients(clientIds: string[]): Promise<Map<string, string>> {
  if (clientIds.length === 0) return new Map()

  const rows = await db
    .select({
      clientId: clientTagAssignments.clientId,
      tagName: clientTags.name,
    })
    .from(clientTagAssignments)
    .innerJoin(clientTags, eq(clientTagAssignments.tagId, clientTags.id))
    .where(
      sql`${clientTagAssignments.clientId} IN (${sql.join(
        clientIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )

  const tagMap = new Map<string, string[]>()
  for (const row of rows) {
    const existing = tagMap.get(row.clientId) ?? []
    existing.push(row.tagName)
    tagMap.set(row.clientId, existing)
  }

  const result = new Map<string, string>()
  for (const [clientId, tags] of tagMap) {
    result.set(clientId, tags.join("; "))
  }
  return result
}
