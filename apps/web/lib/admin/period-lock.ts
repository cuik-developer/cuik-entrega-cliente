import { and, type db, eq, sql, taxPeriods } from "@cuik/db"
import { DocumentError } from "./document-error"
import { monthShort } from "./issuers"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = Tx | typeof db

/** Error for a write that touches a closed tax month (HTTP 409 in the routes). */
export class ClosedPeriodError extends DocumentError {
  constructor(month: string) {
    super(
      `${monthShort(month)} está cerrado: reábrelo en Finanzas › Cierres para cambiar sus comprobantes`,
      409,
    )
  }
}

/** Whether the issuer's tax month is closed. */
export async function isPeriodClosed(
  conn: Conn,
  issuerId: string,
  month: string,
): Promise<boolean> {
  const [row] = await conn
    .select({ status: taxPeriods.status })
    .from(taxPeriods)
    .where(and(eq(taxPeriods.issuerId, issuerId), eq(taxPeriods.month, month)))
    .limit(1)
  return row?.status === "closed"
}

/**
 * Serializes everything that touches one tax month inside the current
 * transaction: writes to its documents, imports and closing it. A write that
 * checked "open" keeps the lock until it commits, so a close waits for it
 * (and the other way around). Released at commit or rollback.
 */
export async function lockPeriod(conn: Conn, issuerId: string, month: string) {
  const key = `period:${issuerId}:${month}`
  await conn.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`)
}

/** Takes the month's lock and throws ClosedPeriodError when it is closed. */
export async function assertPeriodOpen(conn: Conn, issuerId: string, month: string) {
  await lockPeriod(conn, issuerId, month)
  if (await isPeriodClosed(conn, issuerId, month)) throw new ClosedPeriodError(month)
}
