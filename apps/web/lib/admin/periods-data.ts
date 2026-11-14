import {
  type AccountantLine,
  accountantCloses,
  and,
  db,
  desc,
  documents,
  eq,
  taxPeriods,
} from "@cuik/db"
import {
  type LineLike,
  panelSnapshot,
  reconcileLines,
  reconcileSummary,
  type SummaryCode,
} from "./close"
import { currentMonthLima } from "./company-data"
import { DocumentError } from "./document-error"
import { docSign, toPen } from "./documents"
import { lockPeriod } from "./period-lock"
import { pdtDueDate } from "./sunat-calendar"
import { loadFiscalRun } from "./tax-data"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type PeriodRow = typeof taxPeriods.$inferSelect

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** The issuer's period row for a month, created open when missing (inside a transaction). */
export async function ensurePeriod(tx: Tx, issuerId: string, month: string): Promise<PeriodRow> {
  await tx
    .insert(taxPeriods)
    .values({ issuerId, month })
    .onConflictDoNothing({ target: [taxPeriods.issuerId, taxPeriods.month] })
  const [row] = await tx
    .select()
    .from(taxPeriods)
    .where(and(eq(taxPeriods.issuerId, issuerId), eq(taxPeriods.month, month)))
    .limit(1)
  if (!row) throw new Error("tax period upsert returned nothing")
  return row
}

/** The panel's registry of a month (sales V, purchases C) in the template's shape. */
async function panelLines(issuerId: string, month: string): Promise<AccountantLine[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.issuerId, issuerId),
        eq(documents.taxPeriod, month),
        eq(documents.status, "registered"),
      ),
    )
  return rows
    .map((d) => ({
      book: (d.direction === "sale" ? "V" : "C") as "V" | "C",
      docType: d.docType,
      serie: d.serie,
      numero: d.numero,
      date: d.issueDate,
      counterpartyDoc: d.counterpartyDoc,
      counterpartyName: d.counterpartyName,
      currency: d.currency,
      fxRate: d.fxRate === null ? null : Number(d.fxRate),
      base: Number(d.baseGravada),
      igv: Number(d.igv),
      noGravado: Number(d.baseNoGravada),
      total: Number(d.total),
      note: null,
    }))
    .sort((a, b) => a.book.localeCompare(b.book) || (a.date ?? "").localeCompare(b.date ?? ""))
}

/** Lines in soles and positive, so both registries compare like for like. */
function asLineLike(l: AccountantLine): LineLike {
  const fx = l.currency === "USD" ? l.fxRate : null
  return {
    book: l.book,
    docType: l.docType,
    serie: l.serie,
    numero: l.numero,
    counterpartyDoc: l.counterpartyDoc,
    counterpartyName: l.counterpartyName,
    total: Math.abs(toPen(l.total, l.currency, fx)),
    igv: Math.abs(toPen(l.igv, l.currency, fx)),
  }
}

/**
 * Finanzas › Cierres: every month with a regime up to this month (newest
 * first) with its taxes, status and reserve; and, for `selected`, the detail
 * with the accountant's last import reconciled against the panel.
 */
export async function loadClosesPage(selected: string | null) {
  const today = currentMonthLima()
  const run = await loadFiscalRun(today)
  if (!run.profile) {
    return { available: false as const, today, issuer: null }
  }
  const { issuer, allRows, periods } = run
  const imports = await db
    .select({
      periodId: accountantCloses.periodId,
      summary: accountantCloses.summary,
      importedAt: accountantCloses.importedAt,
    })
    .from(accountantCloses)
    .orderBy(desc(accountantCloses.importedAt))
  const lastImport = new Map<string, (typeof imports)[number]>()
  for (const i of imports) if (!lastImport.has(i.periodId)) lastImport.set(i.periodId, i)

  const months = [...allRows].reverse().map((r) => {
    const p = periods.get(r.month)
    const imp = p ? lastImport.get(p.id) : undefined
    const panel = (p?.status === "closed" && p.panelSnapshot) || panelSnapshot(r)
    const recon = imp ? reconcileSummary(panel as Record<SummaryCode, number>, imp.summary) : null
    const diffs = recon ? recon.filter((x) => x.status === "diff").length : null
    /** Concepts the accountant actually filled (0 = the import had no summary). */
    const compared = recon ? recon.filter((x) => x.status !== "missing").length : null
    return {
      month: r.month,
      status: p?.status ?? "open",
      declared: !!r.declared,
      // Typed in Cierres, else SUNAT's schedule for the RUC's last digit.
      dueDate: p?.dueDate ?? pdtDueDate(r.month, issuer.ruc),
      dueFromCalendar: !p?.dueDate,
      igvToPay: r.igvToPay,
      incomeAdvance: r.incomeAdvance,
      payToSunat: r.payToSunat,
      annualReserve: r.annualReserve,
      reserveMovedOn: p?.reserveMovedOn ?? null,
      reserveAmount:
        p?.reserveAmount === null || p?.reserveAmount === undefined
          ? null
          : Number(p.reserveAmount),
      importedAt: imp?.importedAt.toISOString() ?? null,
      summaryDiffs: diffs,
      summaryCompared: compared,
    }
  })

  const month =
    selected && allRows.some((r) => r.month === selected) ? selected : (months[0]?.month ?? null)
  const detail = month ? await loadCloseDetail(issuer.id, month, run) : null
  return {
    available: true as const,
    today,
    issuer: { id: issuer.id, razonSocial: issuer.razonSocial, ruc: issuer.ruc },
    months,
    reserveMovedTotal: round2(months.reduce((a, m) => a + (m.reserveAmount ?? 0), 0)),
    detail,
  }
}

async function loadCloseDetail(
  issuerId: string,
  month: string,
  run: Extract<Awaited<ReturnType<typeof loadFiscalRun>>, { profile: object }>,
) {
  const row = run.allRows.find((r) => r.month === month)
  if (!row) return null
  const period = run.periods.get(month) ?? null
  const [imp] = period
    ? await db
        .select()
        .from(accountantCloses)
        .where(eq(accountantCloses.periodId, period.id))
        .orderBy(desc(accountantCloses.importedAt))
        .limit(1)
    : []
  const closed = period?.status === "closed"
  // A closed month compares against what the panel had when it was closed.
  const panel = ((closed && period?.panelSnapshot) || panelSnapshot(row)) as Record<
    SummaryCode,
    number
  >
  const mine = await panelLines(issuerId, month)
  const summary = reconcileSummary(panel, imp?.summary ?? null)
  const lines = imp ? reconcileLines(mine.map(asLineLike), imp.lines.map(asLineLike)) : []
  return {
    month,
    status: period?.status ?? "open",
    /** SUNAT schedule date for this month (prefills the due date). */
    calendarDue: pdtDueDate(month, run.issuer.ruc),
    row,
    period: period
      ? {
          dueDate: period.dueDate,
          reserveMovedOn: period.reserveMovedOn,
          reserveAmount: period.reserveAmount === null ? null : Number(period.reserveAmount),
          notes: period.notes,
          closedAt: period.closedAt?.toISOString() ?? null,
          reopenedReason: period.reopenedReason,
          constancia: period.constanciaKey ? { name: period.constanciaName ?? "constancia" } : null,
          declared: period.declared,
        }
      : null,
    import: imp
      ? {
          fileName: imp.fileName,
          importedAt: imp.importedAt.toISOString(),
          hasFile: !!imp.fileKey,
          numeroOrden:
            typeof imp.summary.NUMERO_ORDEN === "string" ? imp.summary.NUMERO_ORDEN : null,
          fechaPresentacion:
            typeof imp.summary.FECHA_PRESENTACION === "string"
              ? imp.summary.FECHA_PRESENTACION
              : null,
          lineCount: imp.lines.length,
        }
      : null,
    summary,
    lines,
    panelLineCount: mine.length,
    /** Sum in soles with credit notes subtracting, for the header of the registry. */
    panelSalesTotal: round2(
      mine
        .filter((l) => l.book === "V")
        .reduce(
          (a, l) => a + docSign(l.docType as never) * toPen(l.total, l.currency, l.fxRate),
          0,
        ),
    ),
  }
}

export type ClosesPage = Awaited<ReturnType<typeof loadClosesPage>>

/** Issuer with a regime for a month, or a 400 for the user. */
export async function fiscalRunFor(month: string) {
  const run = await loadFiscalRun(month)
  if (!run.profile) throw new DocumentError("Ese mes no tiene emisor con régimen tributario")
  const row = run.allRows.find((r) => r.month === month)
  if (!row) throw new DocumentError("Ese mes no tiene régimen tributario")
  return { ...run, row }
}

/** Data for the template download. */
export async function closeTemplateData(month: string) {
  const run = await fiscalRunFor(month)
  const period = run.periods.get(month)
  const panel = ((period?.status === "closed" && period.panelSnapshot) ||
    panelSnapshot(run.row)) as Record<SummaryCode, number>
  return {
    month,
    issuer: { razonSocial: run.issuer.razonSocial, ruc: run.issuer.ruc },
    panel,
    lines: await panelLines(run.issuer.id, month),
  }
}

/** Closes a month: snapshot of the panel, the last import as declared, documents locked. */
export async function closePeriod(month: string, userId: string) {
  // The PDT 621 of a month is filed the following month: close it once it ended.
  if (month >= currentMonthLima()) {
    throw new DocumentError(
      "Un mes se cierra cuando ya terminó (el PDT se presenta el mes siguiente)",
    )
  }
  const { issuer } = await fiscalRunFor(month)
  await db.transaction(async (tx) => {
    // Wait for any write of this month in flight, then compute the snapshot
    // from what is committed: nothing can slip in between.
    await lockPeriod(tx, issuer.id, month)
    const period = await ensurePeriod(tx, issuer.id, month)
    if (period.status === "closed") throw new DocumentError("Ese mes ya está cerrado", 409)
    // What the panel computes for this month on its own (not a previous declaration).
    const own = (await fiscalRunFor(month)).row
    const [imp] = await tx
      .select({ summary: accountantCloses.summary })
      .from(accountantCloses)
      .where(eq(accountantCloses.periodId, period.id))
      .orderBy(desc(accountantCloses.importedAt))
      .limit(1)
    await tx
      .update(taxPeriods)
      .set({
        status: "closed",
        panelSnapshot: panelSnapshot(own),
        declared: imp?.summary ?? null,
        closedAt: new Date(),
        closedBy: userId,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(taxPeriods.id, period.id))
  })
}

/** Reopens a closed month with a reason; its documents can change again. */
export async function reopenPeriod(month: string, reason: string, userId: string) {
  const run = await fiscalRunFor(month)
  const period = run.periods.get(month)
  if (!period || period.status !== "closed") throw new DocumentError("Ese mes no está cerrado", 409)
  await db
    .update(taxPeriods)
    .set({
      status: "open",
      reopenedReason: reason,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(taxPeriods.id, period.id))
}

/** Due date, reserve moved to the bank and notes (allowed on closed months too). */
export async function updatePeriodInfo(
  month: string,
  v: {
    dueDate: string | null
    reserveMovedOn: string | null
    reserveAmount: number | null
    notes: string | null
  },
  userId: string,
) {
  const run = await fiscalRunFor(month)
  await db.transaction(async (tx) => {
    const period = await ensurePeriod(tx, run.issuer.id, month)
    await tx
      .update(taxPeriods)
      .set({
        dueDate: v.dueDate,
        reserveMovedOn: v.reserveMovedOn,
        reserveAmount: v.reserveAmount === null ? null : String(v.reserveAmount),
        notes: v.notes,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(taxPeriods.id, period.id))
  })
}

/** Stores an import of the accountant's close (open months only). */
export async function saveAccountantImport(
  month: string,
  data: { summary: Record<string, number | string>; lines: AccountantLine[] },
  file: { key: string; name: string } | null,
  userId: string,
) {
  const run = await fiscalRunFor(month)
  return db.transaction(async (tx) => {
    await lockPeriod(tx, run.issuer.id, month)
    const period = await ensurePeriod(tx, run.issuer.id, month)
    if (period.status === "closed") {
      throw new DocumentError("Ese mes está cerrado: reábrelo para importar otro cierre", 409)
    }
    await tx.insert(accountantCloses).values({
      periodId: period.id,
      fileKey: file?.key ?? null,
      fileName: file?.name ?? null,
      summary: data.summary,
      lines: data.lines,
      importedBy: userId,
    })
    return period.id
  })
}

/** Stores the filing receipt (PDF) of a month; returns the previous key to remove. */
export async function setConstancia(month: string, key: string, name: string, userId: string) {
  const run = await fiscalRunFor(month)
  return db.transaction(async (tx) => {
    const period = await ensurePeriod(tx, run.issuer.id, month)
    await tx
      .update(taxPeriods)
      .set({ constanciaKey: key, constanciaName: name, updatedBy: userId, updatedAt: new Date() })
      .where(eq(taxPeriods.id, period.id))
    return period.constanciaKey
  })
}

export async function getConstancia(month: string) {
  const run = await loadFiscalRun(month)
  if (!run.profile) return null
  const p = run.periods.get(month)
  return p?.constanciaKey
    ? { key: p.constanciaKey, name: p.constanciaName ?? "constancia.pdf" }
    : null
}
