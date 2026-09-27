/** Browser-safe constants for client archiving (no db imports here). */

/** Days between archiving and anonymization. */
export const ARCHIVE_RETENTION_DAYS = 30

/** When an archived client will be anonymized. */
export function purgeDateFor(archivedAt: Date | string): Date {
  return new Date(new Date(archivedAt).getTime() + ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}
