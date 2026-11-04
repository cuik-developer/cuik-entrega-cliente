/** Browser-safe constants for client archiving (no db imports here). */

/** Days between archiving and anonymization. */
export const ARCHIVE_RETENTION_DAYS = 30

/**
 * Archived and deleted clients receive no communication of any kind: no
 * campaign, automation, pass push, lock-screen notice or email (user rule,
 * 3 Nov 2026). The one exception is the purge's last update that files the
 * pass under expired, and it carries no message.
 */
export const SILENT_CLIENT_STATUSES = ["archived", "deleted"] as const

export function isSilentClient(status: string | null | undefined): boolean {
  return status === "archived" || status === "deleted"
}

/** When an archived client will be anonymized. */
export function purgeDateFor(archivedAt: Date | string): Date {
  return new Date(new Date(archivedAt).getTime() + ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}
