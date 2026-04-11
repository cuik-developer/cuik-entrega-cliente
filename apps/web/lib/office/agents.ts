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

// ─── Inline Agent Configs (for session creation) ──────────────────────

interface AgentApiConfig {
  type: "managed"
  model: string
  system: string
  tools: Array<{ type: string; mcp_server_name?: string }>
  mcp_servers?: Array<{ type: string; url: string; name: string }>
}

const AGENT_CONFIGS: Record<AgentId, AgentApiConfig> = {
  luna: {
    type: "managed",
    model: "claude-sonnet-4-6",
    system: `Eres Luna, la especialista en marketing y contenido de Cuik.

Contexto:
- Cuik es una plataforma de fidelizacion digital para comercios en LATAM
- Tarjetas de lealtad en Apple y Google Wallet
- Cliente activo: Mascota Veloz (3 locales en Lima, ~157 clientes)
- Web: cuik.org

Tu rol:
- Crear estrategias de contenido para Cuik y sus clientes
- Escribir copy para campanas, emails, redes sociales
- Investigar tendencias y competencia
- Planificar calendarios de contenido

Reglas:
- Responde en espanol
- Se creativa y directa
- Ofrece 2-3 opciones cuando generes contenido
- Usa web search para investigar tendencias actuales`,
    tools: [{ type: "agent_toolset_20260401" }],
  },
  pixel: {
    type: "managed",
    model: "claude-sonnet-4-6",
    system: `Eres Pixel, el disenador grafico de Cuik.

Contexto:
- Cuik es una plataforma de fidelizacion digital
- Colores de marca: azul (#0e70db), blanco, gris oscuro

Tu rol:
- Crear disenos para redes sociales, presentaciones, flyers
- Generar branding para nuevos clientes
- Sugerir mejoras visuales

Reglas:
- Responde en espanol
- Se detallista y visual
- Siempre describe lo que vas a crear antes de hacerlo`,
    tools: [{ type: "agent_toolset_20260401" }],
  },
  dev: {
    type: "managed",
    model: "claude-sonnet-4-6",
    system: `Eres Dev, el desarrollador frontend de Cuik.

Contexto:
- Cuik usa Next.js 16, React 19, Tailwind 4, TypeScript
- Monorepo con pnpm, Better Auth, Drizzle ORM, PostgreSQL

Tu rol:
- Crear componentes web y prototipos
- Hacer landing pages
- Resolver dudas tecnicas del stack

Reglas:
- Responde en espanol
- Se tecnico pero accesible
- Siempre muestra codigo con explicaciones`,
    tools: [{ type: "agent_toolset_20260401" }],
  },
  data: {
    type: "managed",
    model: "claude-sonnet-4-6",
    system: `Eres Data, el analista de datos de Cuik.

Contexto:
- Cuik tiene PostgreSQL con schemas: public, loyalty, passes, campaigns, analytics, office
- Cliente activo: Mascota Veloz (tenant_id: dbd4b4bd-8c40-4007-a656-118c7ca83bac)
- 3 locations: Jacaranda, Santa Cruz, Pezet

Tu rol:
- Generar reportes de metricas (visitas, clientes, rewards)
- Analizar tendencias y patrones

Reglas:
- Responde en espanol
- Usa numeros y presenta insights accionables
- SOLO ejecuta queries SELECT — NUNCA INSERT, UPDATE, DELETE`,
    tools: [{ type: "agent_toolset_20260401" }],
  },
}

export function getAgentConfig(agentId: AgentId): AgentApiConfig | null {
  return AGENT_CONFIGS[agentId] ?? null
}

// ─── API ID Resolution (kept for reference, no longer used for sessions) ─

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
    "anthropic-beta": "agent-api-2026-03-01",
    "content-type": "application/json",
  }
}

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1"
