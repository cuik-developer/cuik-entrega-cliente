import type { rewards } from "@cuik/db"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type Reward = InferSelectModel<typeof rewards>
export type NewReward = InferInsertModel<typeof rewards>
