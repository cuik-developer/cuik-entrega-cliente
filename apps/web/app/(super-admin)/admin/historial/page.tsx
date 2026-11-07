import Link from "next/link"
import { redirect } from "next/navigation"
import {
  DataTable,
  PageHeader,
  Panel,
  PanelFooter,
  PanelMessage,
  Td,
  Th,
  Toolbar,
  Tr,
} from "@/components/admin/enterprise"
import {
  HISTORY_PAGE_SIZE,
  historyAreasFor,
  listProductChanges,
  type ProductChangeArea,
  type ProductChangeRow,
  productChangeFilterOptions,
} from "@/lib/admin/product-changes"
import { currentAdminAccess } from "@/lib/admin-access"

export const dynamic = "force-dynamic"

const AREA_LABEL: Record<ProductChangeArea, string> = {
  designs: "Diseño de pase",
  branding: "Branding",
  simulator: "Simulador",
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function when(d: Date) {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d)
}

function detailOf(row: ProductChangeRow): Record<string, unknown> {
  return row.detail && typeof row.detail === "object" ? (row.detail as Record<string, unknown>) : {}
}

/** "Publicó (v4)", "Guardó un diseño publicado"… plain Spanish for each entry. */
function actionLabel(row: ProductChangeRow): string {
  const d = detailOf(row)
  switch (row.action) {
    case "created":
      return "Creó"
    case "saved":
      if (row.area === "branding") return "Guardó"
      return d.live ? "Guardó (publicado)" : "Guardó borrador"
    case "published":
      return typeof d.version === "number" ? `Publicó (v${d.version})` : "Publicó"
    case "duplicated":
      return "Duplicó"
    case "deleted":
      return "Eliminó"
    case "visit_registered":
      return typeof d.stamps === "string" ? `Registró visita (${d.stamps})` : "Registró visita"
    case "campaign_sent":
      return typeof d.sent === "number" ? `Envió campaña (${d.sent})` : "Envió campaña"
    default:
      return row.action
  }
}

function targetCell(row: ProductChangeRow) {
  const name = row.targetName || "—"
  const d = detailOf(row)
  const from =
    row.action === "duplicated" && typeof d.fromName === "string" ? ` · desde ${d.fromName}` : ""
  if (row.area === "designs" && row.action !== "deleted" && row.targetId) {
    return (
      <>
        <Link
          href={`/admin/pases/${row.targetId}/editor`}
          className="text-ent-accent hover:underline"
        >
          {name}
        </Link>
        <span className="text-ent-fg-3">{from}</span>
      </>
    )
  }
  return (
    <>
      {name}
      <span className="text-ent-fg-3">{from}</span>
    </>
  )
}

type Search = { tenant?: string; area?: string; actor?: string; before?: string }
type Filters = {
  tenantId: string | null
  area: ProductChangeArea | null
  actorId: string | null
  before: Date | null
}

/** Query string to filters; anything malformed is simply ignored. */
function parseFilters(sp: Search, areas: ProductChangeArea[]): Filters {
  const before = sp.before ? new Date(sp.before) : null
  return {
    tenantId: sp.tenant && UUID_RE.test(sp.tenant) ? sp.tenant : null,
    area: areas.find((a) => a === sp.area) ?? null,
    actorId: sp.actor && sp.actor.length <= 64 ? sp.actor : null,
    before: before && !Number.isNaN(before.getTime()) ? before : null,
  }
}

function olderPageHref(f: Omit<Filters, "before">, before: Date): string {
  const params = new URLSearchParams({ before: before.toISOString() })
  if (f.tenantId) params.set("tenant", f.tenantId)
  if (f.area) params.set("area", f.area)
  if (f.actorId) params.set("actor", f.actorId)
  return `/admin/historial?${params}`
}

/**
 * Producto › Historial: who created, saved, published, duplicated or deleted
 * a pass design, and who saved a comercio's branding. Equipo Cuik sees only
 * the areas they hold.
 */
export default async function HistorialPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { access } = await currentAdminAccess()
  const areas = historyAreasFor(access)
  if (areas.length === 0) redirect("/admin")

  const { tenantId, area, actorId, before } = parseFilters(await searchParams, areas)

  const [rows, options] = await Promise.all([
    listProductChanges({ areas, tenantId, area, actorId, before }),
    productChangeFilterOptions(areas),
  ])

  const filtered = Boolean(tenantId || area || actorId)
  const last = rows.at(-1)
  const olderHref =
    rows.length === HISTORY_PAGE_SIZE && last
      ? olderPageHref({ tenantId, area, actorId }, last.createdAt)
      : null

  const selectCls =
    "h-7 rounded-[3px] border border-ent-line-strong bg-ent-panel px-2 text-[12.5px] text-ent-fg"

  return (
    <div className="space-y-3">
      <PageHeader
        crumbs={[{ label: "Producto" }, { label: "Historial" }]}
        title="Historial"
        subtitle="Cada cambio en diseños de pases, branding y el simulador de demos: quién, cuándo y sobre qué."
      />
      <Panel>
        <Toolbar>
          <form method="get" className="flex items-center gap-2 flex-wrap">
            <select
              name="tenant"
              defaultValue={tenantId ?? ""}
              className={selectCls}
              aria-label="Comercio"
            >
              <option value="">Todos los comercios</option>
              {options.tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {areas.length > 1 && (
              <select name="area" defaultValue={area ?? ""} className={selectCls} aria-label="Área">
                <option value="">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABEL[a]}
                  </option>
                ))}
              </select>
            )}
            <select
              name="actor"
              defaultValue={actorId ?? ""}
              className={selectCls}
              aria-label="Persona"
            >
              <option value="">Todas las personas</option>
              {options.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-7 rounded-[3px] border border-ent-line-strong bg-ent-panel-2 px-2.5 text-[12.5px] font-medium text-ent-fg hover:bg-ent-panel"
            >
              Filtrar
            </button>
            {(filtered || before) && (
              <Link href="/admin/historial" className="text-[12px] text-ent-accent hover:underline">
                Quitar filtros
              </Link>
            )}
          </form>
        </Toolbar>
        {rows.length === 0 ? (
          <PanelMessage>
            {filtered || before
              ? "No hay cambios con estos filtros."
              : "Todavía no hay cambios registrados. Aparecerán aquí desde ahora."}
          </PanelMessage>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Persona</Th>
                <Th>Comercio</Th>
                <Th>Área</Th>
                <Th>Acción</Th>
                <Th>Sobre</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular-nums text-ent-fg-2">{when(r.createdAt)}</Td>
                  <Td>{r.actorName || "—"}</Td>
                  <Td>{r.tenantName || "—"}</Td>
                  <Td className="text-ent-fg-2">
                    {AREA_LABEL[r.area as ProductChangeArea] ?? r.area}
                  </Td>
                  <Td className="font-medium">{actionLabel(r)}</Td>
                  <Td className="whitespace-normal">{targetCell(r)}</Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
        <PanelFooter className="border-t border-ent-line">
          <span>
            {rows.length} {rows.length === 1 ? "cambio" : "cambios"}
            {before ? " anteriores" : ""}
          </span>
          {olderHref && (
            <Link href={olderHref} className="text-ent-accent hover:underline">
              Ver más antiguos
            </Link>
          )}
        </PanelFooter>
      </Panel>
    </div>
  )
}
