import { z } from "zod"

export const createNoteSchema = z.object({
  content: z.string().trim().min(1, "Note content is required").max(2000),
})

export type CreateNoteInput = z.infer<typeof createNoteSchema>

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color (e.g. #ff0000)")
    .optional(),
})

export type CreateTagInput = z.infer<typeof createTagSchema>

export const assignTagsSchema = z.object({
  tagIds: z.array(z.string().uuid("Invalid tag ID")).min(1, "At least one tag is required"),
})

export type AssignTagsInput = z.infer<typeof assignTagsSchema>

export const clientExportSchema = z.object({
  status: z.enum(["active", "inactive", "blocked"]).optional(),
  tier: z.string().trim().optional(),
  tagIds: z.string().trim().optional(),
  createdFrom: z.string().date("Invalid date format").optional(),
  createdTo: z.string().date("Invalid date format").optional(),
  format: z.enum(["csv", "xlsx"]).default("xlsx"),
})

export type ClientExportInput = z.infer<typeof clientExportSchema>
