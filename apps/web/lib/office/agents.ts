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
  },
  {
    id: "pixel",
    name: "Pixel",
    emoji: "\uD83D\uDFE2",
    description: "Diseno grafico",
    triggers: ["diseno", "design", "logo", "imagen", "flyer", "post", "banner", "canva", "visual"],
    active: false,
  },
  {
    id: "dev",
    name: "Dev",
    emoji: "\uD83D\uDD35",
    description: "Frontend y codigo",
    triggers: ["codigo", "code", "componente", "landing", "web", "react", "html", "frontend"],
    active: false,
  },
  {
    id: "data",
    name: "Data",
    emoji: "\uD83D\uDFE0",
    description: "Analytics y reportes",
    triggers: ["reporte", "metricas", "analytics", "datos", "excel", "dashboard", "estadisticas"],
    active: true,
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

// ─── Agent API IDs ────────────────────────────────────────────────────

const AGENT_API_IDS: Partial<Record<AgentId, string>> = {
  luna: "agent_011CZwMDjy5SnqPTh9wp6wwT",
  data: "agent_011CZxYNvwAiodCifD4nqSLL",
}

export function getAgentApiId(agentId: AgentId): string | null {
  return AGENT_API_IDS[agentId] ?? null
}

// ─── Skills ───────────────────────────────────────────────────────────

export function getSkillsForAgent(agentId: AgentId): string {
  switch (agentId) {
    case "luna":
      return LUNA_MARKETING_SKILLS
    case "data":
      return DATA_ANALYTICS_SKILLS
    default:
      return ""
  }
}

// ─── Environment ──────────────────────────────────────────────────────

export const ENVIRONMENT_ID = "env_01K7XrUyMG9BtyNkxNKUo8bn"

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
