/**
 * Impacto: the merchant's own sales (DNI · fecha · monto) crossed with the
 * Cuik clients and visits, every month, for any tenant. Pure types shared by
 * the parser, the metrics, the Excel and the screens.
 */

/** Columns the importer can read from a sales file. */
export const IMPACT_FIELDS = [
  "orderRef",
  "dni",
  "idType",
  "name",
  "phone",
  "store",
  "cashier",
  "date",
  "amount",
] as const
export type ImpactField = (typeof IMPACT_FIELDS)[number]

export const IMPACT_FIELD_LABELS: Record<ImpactField, string> = {
  orderRef: "Referencia de la orden",
  dni: "DNI del cliente",
  idType: "Tipo de documento",
  name: "Nombre del cliente",
  phone: "Teléfono",
  store: "Tienda / punto de venta",
  cashier: "Cajero / vendedor",
  date: "Fecha de la venta",
  amount: "Monto",
}

/** Field -> column index (0-based) in the file; null = not in this file. */
export type ColumnMapping = Record<ImpactField, number | null>

/** Options the operator confirms before processing. */
export type ImportOptions = {
  /** Days a client has to buy again to count as retained (90 for a pet shop, 30 for a café). */
  retentionDays: number
  /** DNIs left out of every metric (staff accounts used at the till). */
  excludedDnis: string[]
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = { retentionDays: 90, excludedDnis: [] }

/** One purchase (order lines already added up), as stored in analytics.sales. */
export type SaleOrder = {
  orderRef: string | null
  /** Digits only: 8 (DNI) or 9 (carné de extranjería); null when the row had no usable document. */
  dni: string | null
  name: string | null
  phone: string | null
  store: string | null
  cashier: string | null
  /** "YYYY-MM-DD" */
  day: string
  amount: number
}

/** A Cuik client with a DNI, as the metrics need it. */
export type CuikClient = {
  dni: string
  name: string
  /** "YYYY-MM-DD" (tenant-local) */
  registeredOn: string
}

/** A Cuik visit, as the metrics need it. */
export type CuikVisit = {
  dni: string
  /** "YYYY-MM-DD" (tenant-local) */
  day: string
  store: string
  cashier: string
  source: string
}

export type ImpactInput = {
  orders: SaleOrder[]
  clients: CuikClient[]
  visits: CuikVisit[]
  options: ImportOptions & {
    /** Minimum purchase for a stamp; null = every purchase counts (cashback or no minimum). */
    minimumPurchase: number | null
    /** Program phase in force, if any. */
    phase: { id: string; name: string; startsOn: string } | null
  }
}

type PctRow = { eligible: number; registered: number; pct: number | null }

export type ImpactSummary = {
  version: 1
  /** Range of every sale the tenant has loaded. */
  period: { from: string; to: string }
  options: {
    retentionDays: number
    minimumPurchase: number | null
    /** First registration in Cuik: the "before/after" cut for the control group. */
    launch: string | null
    phase: { id: string; name: string; startsOn: string } | null
  }
  coverage: {
    orders: number
    ordersWithDni: number
    coveragePct: number | null
    revenue: number
    avgTicket: number | null
    uniqueDnis: number
    byStore: {
      store: string
      orders: number
      withDni: number
      coveragePct: number | null
      revenue: number
    }[]
    byMonth: { month: string; orders: number; revenue: number }[]
  }
  staff: {
    /** Near-daily buyers (≥ 100 purchase days, median gap ≤ 2 days): excluded automatically. */
    detected: { dni: string; name: string | null; purchases: number }[]
    /** DNIs excluded by hand (from the import options). */
    manual: string[]
  }
  cuik: {
    clients: number
    matchedInSales: number
    visitsConsidered: number
  }
  registration: {
    eligibleDays: number
    registeredDays: number
    pct: number | null
    /** Purchase-days under the minimum (no stamp possible) and how many still got a visit. */
    smallDays: number
    smallDaysWithVisit: number
    /** Cuik visits with no purchase of that client that day in the file. */
    orphanVisits: number
    clientsWithEligible: number
    buckets: { "100%": number; "50-99%": number; "1-49%": number; "0%": number }
    byStore: ({ store: string; otherLocal: number } & PctRow)[]
    byMonth: ({ month: string } & PctRow)[]
    byCashier: {
      cashier: string
      visits: number
      qr: number
      manual: number
      orphan: number
      stores: string
    }[]
    perClient: {
      dni: string
      name: string
      registeredOn: string
      eligible: number
      registered: number
      pct: number | null
      stores: string
    }[]
  }
  frequency: {
    registered: { n: number; gapBefore: number | null; gapAfter: number | null }
    control: { n: number; gapBefore: number | null; gapAfter: number | null }
    /** Purchases per client per year the card is worth, against the control trend. */
    extraPurchasesPerYear: number | null
    cardClients: number
    moneyPerYear: number | null
  }
  retention: {
    windowDays: number
    cohorts: {
      month: string
      cohort: number
      retained: number | null
      cardCohort: number
      cardRetained: number | null
      noCardCohort: number
      noCardRetained: number | null
    }[]
    beforeLaunch: { cohort: number; retained: number | null }
    afterLaunch: {
      all: { cohort: number; retained: number | null }
      card: { cohort: number; retained: number | null }
      noCard: { cohort: number; retained: number | null }
    }
    sameClient: {
      registered: { clients: number; before: PurchaseRetention; after: PurchaseRetention }
      control: { clients: number; before: PurchaseRetention; after: PurchaseRetention }
    }
  }
  unregisteredFrequent: {
    count: number
    spend: number
    list: {
      dni: string
      name: string | null
      phone: string | null
      purchases12m: number
      medianGap: number | null
      lastPurchase: string
      total: number
      stores: string
    }[]
  }
  brokenFrequency: {
    total: number
    registered: number
    notRegistered: number
    list: {
      dni: string
      name: string | null
      phone: string | null
      registered: boolean
      purchases: number
      medianGap: number | null
      lastPurchase: string
      silence: number
      stores: string
    }[]
  }
}

export type PurchaseRetention = { purchases: number; pct: number | null }
