import type { passAssets, passDesigns, passInstances } from "@cuik/db"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type PassDesign = InferSelectModel<typeof passDesigns>
export type NewPassDesign = InferInsertModel<typeof passDesigns>

export type PassAsset = InferSelectModel<typeof passAssets>
export type NewPassAsset = InferInsertModel<typeof passAssets>

export type PassInstance = InferSelectModel<typeof passInstances>
export type NewPassInstance = InferInsertModel<typeof passInstances>
