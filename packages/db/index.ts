import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool, types } from "pg"
import * as schema from "./schema"

// Parse `timestamp without time zone` (OID 1114) as UTC, not local machine timezone.
// Without this, the pg driver applies the local OS timezone offset, causing incorrect
// dates when the server timezone differs from the DB timezone.
types.setTypeParser(1114, (str: string) => new Date(`${str}Z`))

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })
export { pool, sql }
export {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  or,
} from "drizzle-orm"
export * from "./schema"
