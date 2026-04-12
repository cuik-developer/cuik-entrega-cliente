import { CronExpressionParser } from "cron-parser"

/**
 * Calculate the next run date for a cron expression.
 * Uses America/Lima timezone (Peru).
 */
export function getNextRun(cronExpression: string): Date {
  const interval = CronExpressionParser.parse(cronExpression, { tz: "America/Lima" })
  return interval.next().toDate()
}
