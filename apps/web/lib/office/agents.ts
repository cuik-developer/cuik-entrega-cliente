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
    active: false,
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

// ─── API ID Resolution ─────────────────────────────────────────────────

const AGENT_ENV_MAP: Record<AgentId, string> = {
  luna: "OFFICE_LUNA_AGENT_ID",
  pixel: "OFFICE_PIXEL_AGENT_ID",
  dev: "OFFICE_DEV_AGENT_ID",
  data: "OFFICE_DATA_AGENT_ID",
}

export function getAgentApiId(agentId: AgentId): string | null {
  const envVar = AGENT_ENV_MAP[agentId]
  return process.env[envVar] ?? null
}

export function getEnvironmentId(): string | null {
  return process.env.OFFICE_ENV_ID ?? null
}

// ─── Anthropic API Helpers ─────────────────────────────────────────────

export function getAnthropicHeaders(): Record<string, string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set")

  return {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "managed-agents-2026-04-01",
    "content-type": "application/json",
  }
}

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
