import {
  clients,
  db,
  locations,
  passAssets,
  passDesigns,
  plans,
  promotions,
  sql,
  tenants,
  visits,
} from "@cuik/db"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

// ── Helpers ─────────────────────────────────────────────────────────

async function truncateAllTables() {
  await db.execute(sql`TRUNCATE passes.apple_devices CASCADE`)
  await db.execute(sql`TRUNCATE passes.pass_instances CASCADE`)
  await db.execute(sql`TRUNCATE passes.pass_assets CASCADE`)
  await db.execute(sql`TRUNCATE passes.pass_designs CASCADE`)
  await db.execute(sql`TRUNCATE loyalty.visits CASCADE`)
  await db.execute(sql`TRUNCATE loyalty.rewards CASCADE`)
  await db.execute(sql`TRUNCATE loyalty.promotions CASCADE`)
  await db.execute(sql`TRUNCATE loyalty.locations CASCADE`)
  await db.execute(sql`TRUNCATE loyalty.clients CASCADE`)
  await db.execute(sql`TRUNCATE public.tenants CASCADE`)
  await db.execute(sql`TRUNCATE public.plans CASCADE`)
  await db.execute(sql`TRUNCATE public.member CASCADE`)
  await db.execute(sql`TRUNCATE public.invitation CASCADE`)
  await db.execute(sql`TRUNCATE public.organization CASCADE`)
  await db.execute(sql`TRUNCATE public.session CASCADE`)
  await db.execute(sql`TRUNCATE public.account CASCADE`)
  await db.execute(sql`TRUNCATE public."user" CASCADE`)
}

async function seedUsers() {
  const usersToCreate = [
    { email: "sa@cuik.app", password: "password123", name: "Super Admin", role: "super_admin" },
    {
      email: "admin@mascotaveloz.com",
      password: "password123",
      name: "Carlos Mendoza",
      role: "admin",
    },
    {
      email: "cajero@mascotaveloz.com",
      password: "password123",
      name: "María García",
      role: "user",
    },
    { email: "admin@cafecentral.com", password: "password123", name: "Ana Torres", role: "admin" },
    { email: "cajero@cafecentral.com", password: "password123", name: "Pedro López", role: "user" },
  ]

  const createdUsers: Record<string, string> = {}

  for (const u of usersToCreate) {
    const res = await auth.api.signUpEmail({
      body: { email: u.email, password: u.password, name: u.name },
    })
    if (res?.user?.id) {
      createdUsers[u.email] = res.user.id
      if (u.role !== "user") {
        await db.execute(sql`UPDATE public."user" SET role = ${u.role} WHERE id = ${res.user.id}`)
      }
    }
  }

  return createdUsers
}

function generateVisitRecords(
  allClients: Array<{ id: string; tenantId: string; totalVisits: number }>,
  locationMap: Record<string, string>,
  now: Date,
) {
  const visitRecords: Array<{
    clientId: string
    tenantId: string
    visitNum: number
    cycleNumber: number
    source: "qr" | "manual"
    points: number
    locationId: string
    createdAt: Date
  }> = []

  for (const client of allClients) {
    const locationId = locationMap[client.tenantId]
    for (let i = 1; i <= client.totalVisits; i++) {
      const daysAgo = Math.floor(Math.random() * 30)
      const visitDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000)
      const cycleNumber = i <= 10 ? 1 : 2
      const visitNum = i <= 10 ? i : i - 10

      visitRecords.push({
        clientId: client.id,
        tenantId: client.tenantId,
        visitNum,
        cycleNumber,
        source: Math.random() > 0.3 ? "qr" : "manual",
        points: 1,
        locationId,
        createdAt: visitDate,
      })
    }
  }

  return visitRecords
}

// DEV ONLY — seed endpoint
// Call with: curl http://localhost:3000/api/seed
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 })
  }

  try {
    // ========================================
    // 1. Truncate tables in correct order
    // ========================================
    await truncateAllTables()

    // ========================================
    // 2. Seed Plans
    // ========================================
    const [trialPlan, basicoPlan, _proPlan] = await db
      .insert(plans)
      .values([
        {
          name: "Trial",
          price: 0,
          maxClients: 50,
          maxLocations: 1,
          maxPromos: 1,
          features: { trial: true },
          active: true,
        },
        {
          name: "Básico",
          price: 6900,
          maxClients: 200,
          maxLocations: 2,
          maxPromos: 3,
          features: { basic: true },
          active: true,
        },
        {
          name: "Pro",
          price: 15900,
          maxClients: 1000,
          maxLocations: 5,
          maxPromos: 10,
          features: { pro: true, analytics: true, campaigns: true },
          active: true,
        },
      ])
      .returning()

    // ========================================
    // 3. Seed Users via Better Auth API
    // ========================================
    const createdUsers = await seedUsers()

    // ========================================
    // 4. Seed Organizations (Better Auth orgs = tenants)
    // ========================================
    const mascotaVelozOrg = await auth.api.createOrganization({
      body: {
        name: "Mascota Veloz",
        slug: "mascota-veloz",
        userId: createdUsers["admin@mascotaveloz.com"],
      },
    })

    const cafeCentralOrg = await auth.api.createOrganization({
      body: {
        name: "Café Central",
        slug: "cafe-central",
        userId: createdUsers["admin@cafecentral.com"],
      },
    })

    // Add cajeros as members to their orgs
    if (mascotaVelozOrg?.id) {
      await db.execute(
        sql`INSERT INTO public.member (id, organization_id, user_id, role, created_at) VALUES (gen_random_uuid()::text, ${mascotaVelozOrg.id}, ${createdUsers["cajero@mascotaveloz.com"]}, 'member', NOW())`,
      )
    }

    if (cafeCentralOrg?.id) {
      await db.execute(
        sql`INSERT INTO public.member (id, organization_id, user_id, role, created_at) VALUES (gen_random_uuid()::text, ${cafeCentralOrg.id}, ${createdUsers["cajero@cafecentral.com"]}, 'member', NOW())`,
      )
    }

    // ========================================
    // 5. Seed Tenants (linked to orgs)
    // ========================================
    const now = new Date()
    const trialEnds = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // +7 days

    const [mascotaTenant, cafeTenant] = await db
      .insert(tenants)
      .values([
        {
          slug: "mascota-veloz",
          name: "Mascota Veloz",
          planId: basicoPlan.id,
          status: "active",
          activatedAt: now,
          ownerId: createdUsers["admin@mascotaveloz.com"],
        },
        {
          slug: "cafe-central",
          name: "Café Central",
          planId: trialPlan.id,
          status: "trial",
          trialEndsAt: trialEnds,
          ownerId: createdUsers["admin@cafecentral.com"],
        },
      ])
      .returning()

    // ========================================
    // 6. Seed Locations (1 per tenant)
    // ========================================
    const [mascotaLoc, cafeLoc] = await db
      .insert(locations)
      .values([
        {
          tenantId: mascotaTenant.id,
          name: "Sede Principal",
          address: "Av. Javier Prado 1234, Lima",
          active: true,
        },
        {
          tenantId: cafeTenant.id,
          name: "Café Central - Centro",
          address: "Jr. de la Unión 456, Lima",
          active: true,
        },
      ])
      .returning()

    // ========================================
    // 7. Seed Promotions (1 per tenant, stamps type)
    // ========================================
    await db.insert(promotions).values([
      {
        tenantId: mascotaTenant.id,
        type: "stamps",
        maxVisits: 10,
        rewardValue: "Baño gratis para tu mascota",
        config: {
          type: "stamps",
          visitsRequired: 10,
          reward: "Baño gratis para tu mascota",
        },
        active: true,
      },
      {
        tenantId: cafeTenant.id,
        type: "stamps",
        maxVisits: 10,
        rewardValue: "Café gratis a elección",
        config: {
          type: "stamps",
          visitsRequired: 10,
          reward: "Café gratis a elección",
        },
        active: true,
      },
    ])

    // ========================================
    // 8. Seed Clients (3 per tenant)
    // ========================================
    const mascotaClients = await db
      .insert(clients)
      .values([
        {
          tenantId: mascotaTenant.id,
          name: "Roberto",
          lastName: "Sánchez",
          dni: "12345678",
          phone: "+51999111222",
          email: "roberto@email.com",
          qrCode: "MV_12345678",
          status: "active",
          totalVisits: 7,
          currentCycle: 1,
        },
        {
          tenantId: mascotaTenant.id,
          name: "Lucía",
          lastName: "Fernández",
          dni: "23456789",
          phone: "+51999333444",
          email: "lucia@email.com",
          qrCode: "MV_23456789",
          status: "active",
          totalVisits: 3,
          currentCycle: 1,
        },
        {
          tenantId: mascotaTenant.id,
          name: "Diego",
          lastName: "Ramírez",
          dni: "34567890",
          phone: "+51999555666",
          email: "diego@email.com",
          qrCode: "MV_34567890",
          status: "active",
          totalVisits: 12,
          currentCycle: 2,
        },
      ])
      .returning()

    const cafeClients = await db
      .insert(clients)
      .values([
        {
          tenantId: cafeTenant.id,
          name: "Carmen",
          lastName: "Gutiérrez",
          dni: "45678901",
          phone: "+51999777888",
          email: "carmen@email.com",
          qrCode: "CC_45678901",
          status: "active",
          totalVisits: 5,
          currentCycle: 1,
        },
        {
          tenantId: cafeTenant.id,
          name: "Jorge",
          lastName: "Morales",
          dni: "56789012",
          phone: "+51999999000",
          email: "jorge@email.com",
          qrCode: "CC_56789012",
          status: "active",
          totalVisits: 2,
          currentCycle: 1,
        },
        {
          tenantId: cafeTenant.id,
          name: "Sofía",
          lastName: "Vargas",
          dni: "67890123",
          phone: "+51988111222",
          email: "sofia@email.com",
          qrCode: "CC_67890123",
          status: "active",
          totalVisits: 9,
          currentCycle: 1,
        },
      ])
      .returning()

    // ========================================
    // 9. Seed Visits (5-10 per client, spread over 30 days)
    // ========================================
    const allClientsWithTenant = [
      ...mascotaClients.map((c) => ({ ...c, tenantId: mascotaTenant.id })),
      ...cafeClients.map((c) => ({ ...c, tenantId: cafeTenant.id })),
    ]

    const locationMap: Record<string, string> = {
      [mascotaTenant.id]: mascotaLoc.id,
      [cafeTenant.id]: cafeLoc.id,
    }

    const visitRecords = generateVisitRecords(allClientsWithTenant, locationMap, now)

    if (visitRecords.length > 0) {
      await db.insert(visits).values(visitRecords)
    }

    // ========================================
    // 10. Seed Pass Designs + Assets (Wallet)
    // ========================================

    // Tiny 1x1 PNG placeholders as base64 data URIs (under 500 bytes each)
    // Orange pixel — used for stamp icon
    const STAMP_ICON_DATA_URI =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
    // Dark pixel — used for background
    const BACKGROUND_DATA_URI =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    // Blue pixel — used for icon
    const ICON_DATA_URI =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg=="

    const [mascotaDesign, cafeDesign] = await db
      .insert(passDesigns)
      .values([
        {
          tenantId: mascotaTenant.id,
          name: "Tarjeta de Fidelidad - Mascota Veloz",
          type: "apple_store" as const,
          isActive: true,
          isTemplate: false,
          version: 1,
          colors: {
            backgroundColor: "#1a1a2e",
            foregroundColor: "#ffffff",
            labelColor: "#e0e0e0",
          },
          stampsConfig: {
            maxVisits: 10,
            gridCols: 5,
            gridRows: 2,
          },
          fields: {
            headerFields: [{ key: "visits", label: "VISITAS", value: "{{totalVisits}}" }],
            secondaryFields: [{ key: "client", label: "CLIENTE", value: "{{clientName}}" }],
            backFields: [
              {
                key: "reward",
                label: "PREMIO",
                value: "Baño gratis para tu mascota",
              },
              {
                key: "info",
                label: "INFO",
                value: "Presenta tu pase en cada visita para acumular sellos.",
              },
            ],
          },
          canvasData: {
            width: 375,
            height: 123,
            elements: [],
          },
        },
        {
          tenantId: cafeTenant.id,
          name: "Tarjeta de Fidelidad - Café Central",
          type: "apple_store" as const,
          isActive: true,
          isTemplate: false,
          version: 1,
          colors: {
            backgroundColor: "#3c1518",
            foregroundColor: "#f5e6cc",
            labelColor: "#d4a574",
          },
          stampsConfig: {
            maxVisits: 10,
            gridCols: 5,
            gridRows: 2,
          },
          fields: {
            headerFields: [{ key: "visits", label: "VISITAS", value: "{{totalVisits}}" }],
            secondaryFields: [{ key: "client", label: "CLIENTE", value: "{{clientName}}" }],
            backFields: [
              {
                key: "reward",
                label: "PREMIO",
                value: "Café gratis a elección",
              },
              {
                key: "info",
                label: "INFO",
                value: "Acumula sellos con cada compra y obtén tu café gratis.",
              },
            ],
          },
          canvasData: {
            width: 375,
            height: 123,
            elements: [],
          },
        },
      ])
      .returning()

    // Seed pass assets for each design
    await db.insert(passAssets).values([
      // Mascota Veloz assets
      {
        designId: mascotaDesign.id,
        type: "stamp" as const,
        url: STAMP_ICON_DATA_URI,
        metadata: { description: "Paw print stamp placeholder", format: "png", size: "1x1" },
      },
      {
        designId: mascotaDesign.id,
        type: "strip_bg" as const,
        url: BACKGROUND_DATA_URI,
        metadata: { description: "Dark background placeholder", format: "png", size: "1x1" },
      },
      {
        designId: mascotaDesign.id,
        type: "icon" as const,
        url: ICON_DATA_URI,
        metadata: { description: "App icon placeholder", format: "png", size: "1x1" },
      },
      // Café Central assets
      {
        designId: cafeDesign.id,
        type: "stamp" as const,
        url: STAMP_ICON_DATA_URI,
        metadata: { description: "Coffee stamp placeholder", format: "png", size: "1x1" },
      },
      {
        designId: cafeDesign.id,
        type: "strip_bg" as const,
        url: BACKGROUND_DATA_URI,
        metadata: { description: "Dark background placeholder", format: "png", size: "1x1" },
      },
      {
        designId: cafeDesign.id,
        type: "icon" as const,
        url: ICON_DATA_URI,
        metadata: { description: "App icon placeholder", format: "png", size: "1x1" },
      },
    ])

    // ========================================
    // Summary
    // ========================================
    return NextResponse.json({
      success: true,
      seeded: {
        plans: 3,
        users: Object.keys(createdUsers).length,
        organizations: 2,
        tenants: 2,
        locations: 2,
        promotions: 2,
        clients: mascotaClients.length + cafeClients.length,
        visits: visitRecords.length,
        passDesigns: 2,
        passAssets: 6,
      },
      userIds: createdUsers,
    })
  } catch (error) {
    console.error("[SEED ERROR]", error)
    return NextResponse.json(
      {
        error: "Seed failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
