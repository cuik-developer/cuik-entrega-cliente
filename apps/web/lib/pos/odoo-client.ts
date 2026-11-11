/**
 * Minimal client for Odoo's external API (JSON-RPC, user + API key from
 * res.users.apikeys). Only what the POS connector needs: authenticate,
 * search_read / read with pagination, and fields_get to cope with optional
 * modules (pos_hr adds employee_id, say).
 */

export type OdooCredentials = {
  /** "https://empresa.odoo.com" (no trailing path). */
  baseUrl: string
  database: string
  login: string
  apiKey: string
}

export class OdooError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "network" | "server" | "response",
  ) {
    super(message)
    this.name = "OdooError"
  }
}

type Fetch = typeof fetch

/**
 * Why a fetch failed, in the operator's words. Node wraps the real cause
 * ("fetch failed" with `cause.code`), so the code is what says whether the
 * server is down, the name is wrong or its certificate is the problem.
 */
export function networkMessage(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "Tiempo de espera agotado"
  const cause = (err as { cause?: { code?: string; message?: string } } | null)?.cause
  const code = cause?.code ?? ""
  const text = `${code} ${cause?.message ?? ""}`
  if (code === "CERT_HAS_EXPIRED") {
    return "El certificado TLS del servidor está vencido; el proveedor de Odoo debe renovarlo"
  }
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|certificate/i.test(text)) {
    return "El certificado TLS del servidor no es válido para ese dominio"
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "El dominio no existe o no resuelve"
  if (code === "ECONNREFUSED") return "El servidor rechazó la conexión (puerto cerrado)"
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "El servidor no respondió a tiempo"
  }
  return "No se pudo conectar"
}

const DEFAULT_TIMEOUT_MS = 60_000

/** Odoo's "[id, display_name]" many2one shape. */
export type Many2one = [number, string] | false

type RpcResponse<T> = {
  result?: T
  error?: { message?: string; data?: { message?: string; name?: string } }
}

export class OdooClient {
  private uid: number | null = null
  private seq = 0

  constructor(
    private readonly creds: OdooCredentials,
    private readonly opts: { fetch?: Fetch; timeoutMs?: number } = {},
  ) {}

  /** The JSON-RPC endpoint; base URL without trailing slash. */
  get endpoint(): string {
    return `${this.creds.baseUrl.replace(/\/+$/, "")}/jsonrpc`
  }

  private async rpc<T>(service: string, method: string, args: unknown[]): Promise<T> {
    const doFetch = this.opts.fetch ?? fetch
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    let res: Response
    try {
      res = await doFetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          id: ++this.seq,
          params: { service, method, args },
        }),
        signal: controller.signal,
      })
    } catch (err) {
      throw new OdooError(`${networkMessage(err)} (${this.endpoint})`, "network")
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) throw new OdooError(`Odoo respondió HTTP ${res.status}`, "server")
    let json: RpcResponse<T>
    try {
      json = (await res.json()) as RpcResponse<T>
    } catch {
      throw new OdooError("Odoo no respondió JSON (¿la URL es la correcta?)", "response")
    }
    if (json.error) {
      const data = json.error.data
      const message = data?.message || json.error.message || "Error de Odoo"
      const kind = /access ?denied|access ?error/i.test(`${data?.name ?? ""} ${message}`)
        ? "auth"
        : "server"
      throw new OdooError(message.split("\n")[0].slice(0, 300), kind)
    }
    return json.result as T
  }

  /** Server version string ("17.0", "saas~17.2"). Needs no credentials. */
  async version(): Promise<string> {
    const v = await this.rpc<{ server_version?: string }>("common", "version", [])
    return v?.server_version ?? "?"
  }

  /**
   * Databases the server hosts. Needs no credentials; an empty list when the
   * administrator hid the selector (list_db = False), not an error.
   */
  async listDatabases(): Promise<string[]> {
    try {
      const list = await this.rpc<string[]>("db", "list", [])
      return Array.isArray(list) ? list.map(String) : []
    } catch (err) {
      if (err instanceof OdooError && err.kind === "server") return []
      throw err
    }
  }

  /** Logs in once; later calls reuse the uid. */
  async authenticate(): Promise<number> {
    if (this.uid !== null) return this.uid
    const uid = await this.rpc<number | false>("common", "authenticate", [
      this.creds.database,
      this.creds.login,
      this.creds.apiKey,
      {},
    ])
    if (!uid) throw new OdooError("Usuario o API key incorrectos", "auth")
    this.uid = uid
    return uid
  }

  async execute<T>(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const uid = await this.authenticate()
    return this.rpc<T>("object", "execute_kw", [
      this.creds.database,
      uid,
      this.creds.apiKey,
      model,
      method,
      args,
      kwargs,
    ])
  }

  /** Field names of a model (to skip fields an optional module adds). */
  async fieldNames(model: string): Promise<Set<string>> {
    const fields = await this.execute<Record<string, unknown>>(model, "fields_get", [], {
      attributes: ["type"],
    })
    return new Set(Object.keys(fields ?? {}))
  }

  async searchRead<T>(
    model: string,
    domain: unknown[],
    fields: string[],
    opts: { limit?: number; offset?: number; order?: string } = {},
  ): Promise<T[]> {
    return this.execute<T[]>(model, "search_read", [domain], { fields, ...opts })
  }

  async searchCount(model: string, domain: unknown[]): Promise<number> {
    return this.execute<number>(model, "search_count", [domain])
  }

  /** read() in chunks so a month of lines does not become one huge request. */
  async readMany<T>(model: string, ids: number[], fields: string[], chunk = 500): Promise<T[]> {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += chunk) {
      const part = await this.execute<T[]>(model, "read", [ids.slice(i, i + chunk)], { fields })
      out.push(...part)
    }
    return out
  }
}

/** Odoo datetimes are "YYYY-MM-DD HH:MM:SS" in UTC. */
export function odooDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ")
}

export function parseOdooDateTime(s: string): Date {
  return new Date(`${s.replace(" ", "T")}Z`)
}

export function m2oId(v: Many2one | undefined): number | null {
  return Array.isArray(v) ? v[0] : null
}

export function m2oName(v: Many2one | undefined): string | null {
  return Array.isArray(v) ? v[1] : null
}
