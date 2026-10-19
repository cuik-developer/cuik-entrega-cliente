/**
 * The visitor's IP behind Traefik (Dokploy). Traefik sets `X-Real-Ip` to the
 * address that connected to it; failing that, the LAST `X-Forwarded-For` hop
 * is the one Traefik appended — earlier entries come from the client and can
 * be forged to dodge per-IP limits.
 */
export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim()
  if (real) return real
  const hops = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
  return hops.at(-1) ?? "unknown"
}
