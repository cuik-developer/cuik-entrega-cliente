import { and, asc, db, eq, promotions, rewardCatalog, tenants } from "@cuik/db"
import type { TenantBranding } from "@cuik/shared/validators"
import { tenantBrandingSchema } from "@cuik/shared/validators"
import { Coins, Gift } from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import { notFound } from "next/navigation"

const DEFAULT_PRIMARY = "#0e70db"

type CatalogItem = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  pointsCost: number
  category: string | null
}

async function getTenantWithCatalog(slug: string): Promise<{
  name: string
  branding: TenantBranding | null
  items: CatalogItem[]
} | null> {
  // Resolve tenant
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      branding: tenants.branding,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1)

  if (!tenant) return null

  // Check for active points promotion
  const [promo] = await db
    .select({ id: promotions.id })
    .from(promotions)
    .where(
      and(
        eq(promotions.tenantId, tenant.id),
        eq(promotions.type, "points"),
        eq(promotions.active, true),
      ),
    )
    .limit(1)

  if (!promo) return null

  // Fetch active catalog items
  const items = await db
    .select({
      id: rewardCatalog.id,
      name: rewardCatalog.name,
      description: rewardCatalog.description,
      imageUrl: rewardCatalog.imageUrl,
      pointsCost: rewardCatalog.pointsCost,
      category: rewardCatalog.category,
    })
    .from(rewardCatalog)
    .where(and(eq(rewardCatalog.tenantId, tenant.id), eq(rewardCatalog.active, true)))
    .orderBy(asc(rewardCatalog.sortOrder))

  // Parse branding
  let branding: TenantBranding | null = null
  if (tenant.branding) {
    const parsed = tenantBrandingSchema.safeParse(tenant.branding)
    if (parsed.success) branding = parsed.data
  }

  return { name: tenant.name, branding, items }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>
}): Promise<Metadata> {
  const { tenant: slug } = await params
  const data = await getTenantWithCatalog(slug)

  if (!data) {
    return { title: "Premios" }
  }

  return {
    title: `Premios — ${data.name}`,
    description: `Descubre los premios disponibles en ${data.name}. Acumula puntos y canjea recompensas.`,
  }
}

export default async function PremiosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  const data = await getTenantWithCatalog(slug)

  if (!data) {
    notFound()
  }

  const primaryColor = data.branding?.primaryColor ?? DEFAULT_PRIMARY
  const logoUrl = data.branding?.logoUrl ?? null

  // Group items by category
  const categories = new Map<string, CatalogItem[]>()
  for (const item of data.items) {
    const cat = item.category || "General"
    if (!categories.has(cat)) categories.set(cat, [])
    categories.get(cat)?.push(item)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="px-4 py-8 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={data.name}
                width={48}
                height={48}
                className="w-12 h-12 rounded-xl object-cover bg-white/20"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center text-white font-bold text-lg">
                {data.name[0]}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-extrabold">{data.name}</h1>
              <p className="text-white/70 text-sm">Programa de Recompensas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-white/80 text-sm">
            <Gift className="w-4 h-4" />
            <span>Acumula puntos con cada compra y canjea premios</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {data.items.length === 0 ? (
          /* Empty state */
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Gift className="w-10 h-10 text-gray-300" />
            </div>
            <h2 className="text-lg font-bold text-gray-700">Proximamente disponible</h2>
            <p className="text-sm text-gray-400 mt-1">
              Estamos preparando premios increibles para ti.
            </p>
          </div>
        ) : (
          /* Catalog grid */
          <div className="space-y-6">
            {Array.from(categories.entries()).map(([category, items]) => (
              <div key={category}>
                {categories.size > 1 && (
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    {category}
                  </h2>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                    >
                      {item.imageUrl && (
                        <div className="aspect-[16/9] bg-gray-100 relative">
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <h3 className="font-bold text-gray-900">{item.name}</h3>
                        {item.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {item.description}
                          </p>
                        )}
                        <div
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold text-white"
                          style={{ backgroundColor: primaryColor }}
                        >
                          <Coins className="w-3.5 h-3.5" />
                          {item.pointsCost} puntos
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            Los puntos se acumulan con cada compra. Los premios estan sujetos a disponibilidad.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {data.name} — Programa de fidelizacion con Cuik
          </p>
        </footer>
      </main>
    </div>
  )
}
