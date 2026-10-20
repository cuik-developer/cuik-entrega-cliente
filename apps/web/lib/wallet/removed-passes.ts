import { db, sql } from "@cuik/db"

type SqlFragment = ReturnType<typeof sql>

/**
 * Wallet state per client (one row per client with at least one pass):
 * - has_apple: an iPhone has the pass registered (passes.apple_devices).
 * - has_google: a Google save link not reported removed (the wallet-distribution
 *   proxy: every client gets a link at sign-up, so this is true for most).
 * - google_confirmed: Google's callback reported a save not followed by a delete.
 * - apple_removed_at: the last Apple device unregistered (migration 0031).
 * - google_removed_at: Google reported the pass deleted after its last save.
 * - is_removed: no Apple device, no confirmed Google save, and a removal is
 *   recorded. An Apple removal is not hidden by the bare Google link (that
 *   link exists for iPhone users too); only a confirmed Google save is.
 * - is_installed: has_apple OR has_google, and not removed.
 *
 * Archived and deleted clients are left out. `clientCond` filters
 * loyalty.clients (alias `c`), e.g. one tenant.
 */
export function clientPassStateSql(clientCond: SqlFragment): SqlFragment {
  return sql`
    SELECT x.*,
      (NOT x."has_apple" AND NOT x."google_confirmed"
        AND (x."apple_removed_at" IS NOT NULL OR x."google_removed_at" IS NOT NULL)) AS "is_removed",
      ((x."has_apple" OR x."has_google")
        AND NOT (NOT x."has_apple" AND NOT x."google_confirmed"
                 AND (x."apple_removed_at" IS NOT NULL OR x."google_removed_at" IS NOT NULL))) AS "is_installed"
    FROM (
      SELECT c."id" AS "client_id", c."tenant_id",
        BOOL_OR(ad."serial_number" IS NOT NULL) AS "has_apple",
        BOOL_OR(
          pi."google_save_url" IS NOT NULL AND pi."google_save_url" <> ''
          AND NOT (pi."google_deleted_at" IS NOT NULL
                   AND (pi."google_saved_at" IS NULL OR pi."google_deleted_at" > pi."google_saved_at"))
        ) AS "has_google",
        COALESCE(BOOL_OR(
          pi."google_save_url" IS NOT NULL AND pi."google_save_url" <> ''
          AND pi."google_saved_at" IS NOT NULL
          AND (pi."google_deleted_at" IS NULL OR pi."google_saved_at" >= pi."google_deleted_at")
        ), false) AS "google_confirmed",
        MAX(pi."apple_removed_at") AS "apple_removed_at",
        MAX(pi."google_deleted_at") FILTER (
          WHERE pi."google_save_url" IS NOT NULL AND pi."google_save_url" <> ''
            AND pi."google_deleted_at" IS NOT NULL
            AND (pi."google_saved_at" IS NULL OR pi."google_deleted_at" > pi."google_saved_at")
        ) AS "google_removed_at"
      FROM loyalty.clients c
      JOIN passes.pass_instances pi ON pi."client_id" = c."id"
      LEFT JOIN passes.apple_devices ad ON ad."serial_number" = pi."serial_number"
      WHERE c."status" NOT IN ('archived', 'deleted') AND ${clientCond}
      GROUP BY c."id", c."tenant_id"
    ) x`
}

/**
 * Removed clients from a `clientPassStateSql` CTE named `s`: columns
 * client_id, tenant_id, platform ('apple' | 'google', the most recent
 * removal), removed_at.
 */
export const removedFromStateSql = sql`
  SELECT s."client_id", s."tenant_id",
    CASE WHEN s."apple_removed_at" IS NOT NULL
              AND (s."google_removed_at" IS NULL OR s."apple_removed_at" > s."google_removed_at")
         THEN 'apple' ELSE 'google' END AS "platform",
    GREATEST(s."apple_removed_at", s."google_removed_at") AS "removed_at"
  FROM s
  WHERE s."is_removed"`

/**
 * Per tenant: installed now, removed now, removed in the last 30 days — the
 * inputs of `buildPassChurn`. Tenants with no pass at all have no row.
 */
export async function passChurnCounts(
  tenantCond: SqlFragment,
): Promise<Map<string, { installed: number; removed: number; removed30d: number }>> {
  const res = await db.execute<{
    tenant_id: string
    installed: number | string
    removed: number | string
    removed_30d: number | string
  }>(sql`
    WITH s AS (${clientPassStateSql(tenantCond)})
    SELECT s."tenant_id",
      count(*) FILTER (WHERE s."is_installed")::int AS "installed",
      count(*) FILTER (WHERE s."is_removed")::int AS "removed",
      count(*) FILTER (
        WHERE s."is_removed"
          AND GREATEST(s."apple_removed_at", s."google_removed_at") >= now() - interval '30 days'
      )::int AS "removed_30d"
    FROM s
    GROUP BY s."tenant_id"`)
  return new Map(
    res.rows.map((r) => [
      r.tenant_id,
      {
        installed: Number(r.installed),
        removed: Number(r.removed),
        removed30d: Number(r.removed_30d),
      },
    ]),
  )
}
