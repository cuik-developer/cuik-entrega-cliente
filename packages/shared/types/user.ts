import type { authUsers } from "@cuik/db"
import type { InferSelectModel } from "drizzle-orm"

export type AuthUser = InferSelectModel<typeof authUsers>
