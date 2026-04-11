import { DATA_ANALYTICS_SKILLS } from "./skills/data-analytics"
import { LUNA_MARKETING_SKILLS } from "./skills/marketing"

// ─── Agent Metadata ────────────────────────────────────────────────────

export type AgentId = "luna" | "pixel" | "dev" | "data"

export interface AgentMeta {
  id: AgentId
  name: string
  emoji: string
  description: string
  triggers: string[]
  active: boolean
  model: string
}

export const AGENTS_META: AgentMeta[] = [
  {
    id: "luna",
    name: "Luna",
    emoji: "\uD83D\uDFE3",
    description: "Marketing y contenido",
    triggers: [
      "marketing",
      "copy",
      "contenido",
      "redes",
      "social",
      "email",
      "newsletter",
      "instagram",
      "tiktok",
      "cliente",
      "whatsapp",
      "mensaje",
    ],
    active: true,
    model: "claude-sonnet-4-6",
  },
  {
    id: "pixel",
    name: "Pixel",
    emoji: "\uD83D\uDFE2",
    description: "Diseno grafico",
    triggers: ["diseno", "design", "logo", "imagen", "flyer", "post", "banner", "canva", "visual"],
    active: false,
    model: "claude-sonnet-4-6",
  },
  {
    id: "dev",
    name: "Dev",
    emoji: "\uD83D\uDD35",
    description: "Frontend y codigo",
    triggers: ["codigo", "code", "componente", "landing", "web", "react", "html", "frontend"],
    active: false,
    model: "claude-sonnet-4-6",
  },
  {
    id: "data",
    name: "Data",
    emoji: "\uD83D\uDFE0",
    description: "Analytics y reportes",
    triggers: ["reporte", "metricas", "analytics", "datos", "excel", "dashboard", "estadisticas"],
    active: true,
    model: "claude-sonnet-4-6",
  },
]

// ─── Agent Detection ───────────────────────────────────────────────────

export function detectAgent(message: string): AgentMeta {
  const lower = message.toLowerCase()
  const active = AGENTS_META.filter((a) => a.active)

  // 1. Direct mention: @luna, @data
  for (const agent of active) {
    if (lower.includes(`@${agent.id}`)) return agent
  }

  // 2. Keyword matching
  let best: AgentMeta | null = null
  let maxScore = 0
  for (const agent of active) {
    const score = agent.triggers.filter((t) => lower.includes(t)).length
    if (score > maxScore) {
      maxScore = score
      best = agent
    }
  }
  if (best) return best

  // 3. Default: first active agent
  return active[0]
}

// ─── System Prompts ───────────────────────────────────────────────────

const CUIK_DB_CONTEXT = `## Cuik Database Context

PostgreSQL database with these schemas:
- public: tenants, plans, user (auth)
- loyalty: clients, visits, rewards, points_transactions
- passes: designs, instances, devices, registrations
- analytics: daily_metrics, retention_metrics
- campaigns: campaigns, segments, campaign_sends
- office: conversations, messages, tasks, executions

Key tenant for analysis: Mascota Veloz (slug: "mascota-veloz")

Key tables and columns:
- loyalty.clients: id, tenant_id, name, email, phone, total_visits, total_points, created_at
- loyalty.visits: id, client_id, tenant_id, points_earned, created_at
- loyalty.rewards: id, tenant_id, name, points_cost, active
- analytics.daily_metrics: tenant_id, date, new_clients, visits, rewards_redeemed, points_earned
- analytics.retention_metrics: tenant_id, cohort_date, period, retained_clients, total_clients
- campaigns.campaigns: id, tenant_id, name, type, status, sent_count, open_count, click_count

CRITICAL RULES:
- ONLY use SELECT queries — NEVER INSERT, UPDATE, DELETE, DROP, ALTER, or TRUNCATE
- Always filter by tenant_id when querying tenant-specific data
- Use TIMESTAMPTZ for date comparisons
- Respect multi-schema structure (e.g., loyalty.clients, not just clients)`

function getSystemPromptForAgent(agentId: AgentId): string {
  switch (agentId) {
    case "luna":
      return LUNA_MARKETING_SKILLS
    case "data":
      return `${DATA_ANALYTICS_SKILLS}\n\n${CUIK_DB_CONTEXT}`
    default:
      return ""
  }
}

/**
 * Build the inline managed agent config for session creation.
 * No agent_reference needed — agent is fully defined inline.
 */
export function getAgentConfig(agentId: AgentId): {
  type: "managed"
  model: string
  system: string
  tools: Array<{ type: string }>
} {
  const meta = AGENTS_META.find((a) => a.id === agentId)
  if (!meta) throw new Error(`Unknown agent: ${agentId}`)

  return {
    type: "managed",
    model: meta.model,
    system: getSystemPromptForAgent(agentId),
    tools: [{ type: "agent_toolset_20251212" }],
  }
}

// ─── Anthropic API Helpers ─────────────────────────────────────────────

export function getAnthropicHeaders(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set")

  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "agent-api-2026-03-01",
    "content-type": "application/json",
  }
}

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
