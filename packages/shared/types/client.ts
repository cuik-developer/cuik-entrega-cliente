import type { clients } from "@cuik/db"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type Client = InferSelectModel<typeof clients>
export type NewClient = InferInsertModel<typeof clients>
