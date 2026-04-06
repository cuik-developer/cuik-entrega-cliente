import type { clientNotes, clientTagAssignments, clientTags } from "@cuik/db"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type ClientNote = InferSelectModel<typeof clientNotes>
export type NewClientNote = InferInsertModel<typeof clientNotes>

export type ClientTag = InferSelectModel<typeof clientTags>
export type NewClientTag = InferInsertModel<typeof clientTags>

export type ClientTagAssignment = InferSelectModel<typeof clientTagAssignments>
export type NewClientTagAssignment = InferInsertModel<typeof clientTagAssignments>

export interface ClientExportRow {
  name: string
  lastName: string | null
  email: string | null
  phone: string | null
  status: string
  tier: string | null
  totalVisits: number
  currentCycle: number
  tags: string
  createdAt: string
}

export interface CommunicationHistoryEntry {
  notificationId: string
  campaignId: string
  campaignName: string
  channel: string
  status: string
  sentAt: string | null
  error: string | null
}
