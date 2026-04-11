/**
 * scripts/setup-office-agents.ts
 *
 * One-time setup: creates the Anthropic Managed Agents environment and agents.
 * Run: ANTHROPIC_API_KEY=sk-ant-xxx npx tsx scripts/setup-office-agents.ts
 *
 * Save the printed IDs in your env vars (Dokploy).
 */

const API_KEY = process.env.ANTHROPIC_API_KEY
if (!API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY is required")
  process.exit(1)
}

const BASE_URL = "https://api.anthropic.com/v1"
const HEADERS = {
  "x-api-key": API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-beta": "managed-agents-2026-04-01",
  "content-type": "application/json",
}

const AGENTS = [
  {
    name: "Luna - Marketing",
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
    mcp_servers: [{ type: "url", url: "https://mcp.canva.com/mcp", name: "canva" }],
  },
  {
    name: "Pixel - Diseno",
    model: "claude-sonnet-4-6",
    system: `Eres Pixel, el disenador grafico de Cuik.

Contexto:
- Cuik es una plataforma de fidelizacion digital
- Colores de marca: azul (#0e70db), blanco, gris oscuro
- Tienes acceso a Canva para crear y editar disenos

Tu rol:
- Crear disenos para redes sociales, presentaciones, flyers
- Editar disenos existentes en Canva
- Generar branding para nuevos clientes
- Sugerir mejoras visuales

Reglas:
- Responde en espanol
- Se detallista y visual
- Siempre describe lo que vas a crear antes de hacerlo
- Usa Canva MCP para crear disenos reales`,
    tools: [{ type: "agent_toolset_20260401" }],
    mcp_servers: [{ type: "url", url: "https://mcp.canva.com/mcp", name: "canva" }],
  },
  {
    name: "Dev - Frontend",
    model: "claude-sonnet-4-6",
    system: `Eres Dev, el desarrollador frontend de Cuik.

Contexto:
- Cuik usa Next.js 16, React 19, Tailwind 4, TypeScript
- Monorepo con pnpm
- Stack: Better Auth, Drizzle ORM, PostgreSQL, MinIO

Tu rol:
- Crear componentes web y prototipos
- Hacer landing pages
- Resolver dudas tecnicas del stack
- Generar codigo limpio y bien documentado

Reglas:
- Responde en espanol
- Se tecnico pero accesible
- Siempre muestra codigo con explicaciones
- Crea archivos cuando generes codigo`,
    tools: [{ type: "agent_toolset_20260401" }],
  },
  {
    name: "Data - Analytics",
    model: "claude-sonnet-4-6",
    system: `Eres Data, el analista de datos de Cuik.

Contexto:
- Cuik tiene PostgreSQL con schemas: public, loyalty, passes, campaigns, analytics, office
- Tablas clave: tenants, loyalty.clients, loyalty.visits, loyalty.rewards, passes.pass_instances
- Cliente activo: Mascota Veloz (tenant_id: dbd4b4bd-8c40-4007-a656-118c7ca83bac)
- 3 locations: Jacaranda, Santa Cruz, Pezet

Tu rol:
- Generar reportes de metricas (visitas, clientes, rewards)
- Crear dashboards y visualizaciones
- Analizar tendencias y patrones
- Responder preguntas sobre los datos

Reglas:
- Responde en espanol
- Usa numeros y presenta insights accionables
- Incluye comparativas (semana anterior, mes anterior)
- SOLO ejecuta queries SELECT — NUNCA INSERT, UPDATE, DELETE
- Genera archivos Excel/CSV cuando te pidan reportes`,
    tools: [{ type: "agent_toolset_20260401" }],
  },
]

async function setup() {
  // 1. Create Environment
  console.log("Creating environment...")
  const envRes = await fetch(`${BASE_URL}/environments`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      name: "cuik-office",
      config: {
        type: "cloud",
        networking: { type: "unrestricted" },
      },
    }),
  })

  if (!envRes.ok) {
    const err = await envRes.text()
    console.error(`Failed to create environment: ${envRes.status} ${err}`)
    process.exit(1)
  }

  const environment = await envRes.json()
  console.log(`\nOFFICE_ENV_ID=${environment.id}`)

  // 2. Create each agent
  for (const agentConfig of AGENTS) {
    console.log(`\nCreating agent: ${agentConfig.name}...`)
    const res = await fetch(`${BASE_URL}/agents`, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(agentConfig),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`  Failed: ${res.status} ${err}`)
      continue
    }

    const agent = await res.json()
    const envKey = agentConfig.name.split(" ")[0].toUpperCase()
    console.log(`  OFFICE_${envKey}_AGENT_ID=${agent.id}`)
  }

  console.log("\n--- Copy these env vars to Dokploy ---")
}

setup().catch(console.error)
