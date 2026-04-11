import { index, jsonb, pgEnum, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

const officeSchema = pgSchema("office")

// --- Enums ---

export const conversationRoleEnum = pgEnum("conversation_role", [
  "user",
  "agent",
  "system",
  "tool",
])

// --- Tables ---

export const conversations = officeSchema.table(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    agentId: text("agent_id").notNull(),
    sessionId: text("session_id"),
    title: text("title"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("conversations_user_idx").on(table.userId)],
)

export const messages = officeSchema.table(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: conversationRoleEnum("role").notNull(),
    agentId: text("agent_id"),
    content: text("content").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("messages_conversation_idx").on(table.conversationId, table.createdAt)],
)
