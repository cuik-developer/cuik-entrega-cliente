/**
 * Fix: re-create Luna and Pixel with mcp_toolset in tools array.
 * Run: $env:ANTHROPIC_API_KEY="sk-ant-xxx"; node scripts/setup-office-fix-mcp.mjs
 */

const API_KEY = process.env.ANTHROPIC_API_KEY
if (!API_KEY) { console.error("ANTHROPIC_API_KEY required"); process.exit(1) }

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
    tools: [
      { type: "agent_toolset_20260401" },
      { type: "mcp_toolset", mcp_server_name: "canva" },
    ],
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
    tools: [
      { type: "agent_toolset_20260401" },
      { type: "mcp_toolset", mcp_server_name: "canva" },
    ],
    mcp_servers: [{ type: "url", url: "https://mcp.canva.com/mcp", name: "canva" }],
  },
]

async function fix() {
  for (const agentConfig of AGENTS) {
    console.log(`Creating agent: ${agentConfig.name}...`)
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
}

fix().catch(console.error)
