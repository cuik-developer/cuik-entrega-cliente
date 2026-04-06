import type { visits } from "@cuik/db"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type Visit = InferSelectModel<typeof visits>
export type NewVisit = InferInsertModel<typeof visits>
