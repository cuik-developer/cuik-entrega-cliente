import { asc, db, issuers, taxProfiles, uitValues } from "@cuik/db"
import { issuerForMonth, profileForMonth } from "./issuers"

/** "YYYY-MM" of today in Lima. */
export function currentMonthLima(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 7)
}

/** Issuers with their validity, oldest first (Making Brands, then Cuik). */
export async function loadIssuers() {
  const rows = await db.select().from(issuers).orderBy(asc(issuers.fromMonth))
  // Postgres sorts NULL last on ASC; an issuer with no start goes first.
  rows.sort((a, b) => (a.fromMonth ?? "").localeCompare(b.fromMonth ?? ""))
  return rows.map((i) => ({
    id: i.id,
    ruc: i.ruc,
    razonSocial: i.razonSocial,
    nombreComercial: i.nombreComercial,
    domicilioFiscal: i.domicilioFiscal,
    fromMonth: i.fromMonth,
    toMonth: i.toMonth,
    notes: i.notes,
    updatedAt: i.updatedAt.toISOString(),
  }))
}

export type IssuerRow = Awaited<ReturnType<typeof loadIssuers>>[number]

/** Finanzas › Empresa y régimen: issuers, their tax profiles, UIT per year and who issues today. */
export async function loadCompany() {
  const [issuerRows, profileRows, uitRows] = await Promise.all([
    loadIssuers(),
    db.select().from(taxProfiles).orderBy(asc(taxProfiles.fromMonth)),
    db.select().from(uitValues).orderBy(asc(uitValues.year)),
  ])
  const profiles = profileRows.map((p) => ({
    id: p.id,
    issuerId: p.issuerId,
    fromMonth: p.fromMonth,
    regime: p.regime,
    igvRate: Number(p.igvRate),
    monthlyRate: Number(p.monthlyRate),
    annualBrackets: p.annualBrackets ?? [],
    representationCapPct: Number(p.representationCapPct),
    representationCapUit: Number(p.representationCapUit),
    validatedByAccountant: p.validatedByAccountant,
    validatedAt: p.validatedAt?.toISOString() ?? null,
    notes: p.notes,
    updatedAt: p.updatedAt.toISOString(),
  }))
  const month = currentMonthLima()
  const current = issuerForMonth(issuerRows, month)
  const currentProfile = current ? profileForMonth(profiles, current.id, month) : null
  return {
    month,
    issuers: issuerRows,
    profiles,
    uit: uitRows.map((u) => ({ year: u.year, value: Number(u.value) })),
    currentIssuerId: current?.id ?? null,
    currentProfileId: currentProfile?.id ?? null,
  }
}

export type CompanyData = Awaited<ReturnType<typeof loadCompany>>
