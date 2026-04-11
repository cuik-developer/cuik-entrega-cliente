import { boolean, index, integer, jsonb, pgEnum, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core"
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

// --- Task Enums ---

export const taskStatusEnum = pgEnum("task_status", [
  "active",
  "paused",
  "archived",
])

export const executionStatusEnum = pgEnum("execution_status", [
  "running",
  "pending_approval",
  "approved",
  "rejected",
  "failed",
])

// --- Tasks ---

export const tasks = officeSchema.table(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull().default("single"), // "single" | "collaborative"
    title: text("title").notNull(),
    agents: jsonb("agents").notNull().$type<string[]>(), // AgentId[]
    prompt: text("prompt").notNull(),
    cronExpression: text("cron_expression"), // null = manual only
    recipients: jsonb("recipients").$type<string[]>(), // email addresses
    requiresApproval: boolean("requires_approval").notNull().default(true),
    status: taskStatusEnum("status").notNull().default("active"),
    lastRun: timestamp("last_run", { withTimezone: true }),
    nextRun: timestamp("next_run", { withTimezone: true }),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tasks_status_idx").on(table.status),
    index("tasks_next_run_idx").on(table.nextRun),
  ],
)

// --- Executions ---

export const executions = officeSchema.table(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: executionStatusEnum("status").notNull().default("running"),
    output: jsonb("output"), // agent response content
    agentLogs: jsonb("agent_logs").$type<Record<string, unknown>[]>(), // per-agent logs
    agentsUsed: jsonb("agents_used").$type<string[]>(), // which agents ran
    durationMs: integer("duration_ms"),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("executions_task_idx").on(table.taskId),
    index("executions_status_idx").on(table.status),
  ],
)
